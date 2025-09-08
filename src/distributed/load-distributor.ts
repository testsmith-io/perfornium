import { TestConfiguration, ReportConfig } from '../config/types';
import { RemoteWorker } from './remote-worker';
import { logger } from '../utils/logger';

export type DistributionStrategy = 'even' | 'capacity_based' | 'round_robin' | 'geographic';

export interface WorkerAssignment {
  worker: RemoteWorker;
  config: TestConfiguration;
  virtualUsers: number;
  startDelay?: number;
}

export class LoadDistributor {
  distribute(
    testConfig: TestConfiguration,
    workers: RemoteWorker[],
    strategy: DistributionStrategy
  ): WorkerAssignment[] {
    const totalVUs = testConfig.load.virtual_users || 1;
    
    logger.info(`📊 Distributing ${totalVUs} VUs using ${strategy} strategy`);
    
    switch (strategy) {
      case 'even':
        return this.evenDistribution(testConfig, workers, totalVUs);
      case 'capacity_based':
        return this.capacityBasedDistribution(testConfig, workers, totalVUs);
      case 'round_robin':
        return this.roundRobinDistribution(testConfig, workers, totalVUs);
      case 'geographic':
        return this.geographicDistribution(testConfig, workers, totalVUs);
      default:
        throw new Error(`Unknown distribution strategy: ${strategy}`);
    }
  }

  private evenDistribution(
    testConfig: TestConfiguration,
    workers: RemoteWorker[],
    totalVUs: number
  ): WorkerAssignment[] {
    const vusPerWorker = Math.floor(totalVUs / workers.length);
    const remainder = totalVUs % workers.length;
    
    return workers.map((worker, index) => {
      const virtualUsers = vusPerWorker + (index < remainder ? 1 : 0);
      
      return {
        worker,
        virtualUsers,
        config: this.createWorkerConfig(testConfig, virtualUsers, index)
      };
    });
  }

  private capacityBasedDistribution(
    testConfig: TestConfiguration,
    workers: RemoteWorker[],
    totalVUs: number
  ): WorkerAssignment[] {
    const totalCapacity = workers.reduce((sum, worker) => sum + worker.getCapacity(), 0);
    
    if (totalCapacity === 0) {
      throw new Error('No worker capacity available');
    }
    
    return workers.map((worker, index) => {
      const workerRatio = worker.getCapacity() / totalCapacity;
      const virtualUsers = Math.round(totalVUs * workerRatio);
      
      return {
        worker,
        virtualUsers,
        config: this.createWorkerConfig(testConfig, virtualUsers, index)
      };
    });
  }

  private roundRobinDistribution(
    testConfig: TestConfiguration,
    workers: RemoteWorker[],
    totalVUs: number
  ): WorkerAssignment[] {
    const assignments: WorkerAssignment[] = workers.map((worker, index) => ({
      worker,
      virtualUsers: 0,
      config: this.createWorkerConfig(testConfig, 0, index)
    }));
    
    for (let vu = 0; vu < totalVUs; vu++) {
      const workerIndex = vu % workers.length;
      assignments[workerIndex].virtualUsers++;
    }
    
    assignments.forEach((assignment, index) => {
      assignment.config = this.createWorkerConfig(testConfig, assignment.virtualUsers, index);
    });
    
    return assignments;
  }

  private geographicDistribution(
    testConfig: TestConfiguration,
    workers: RemoteWorker[],
    totalVUs: number
  ): WorkerAssignment[] {
    const regionGroups = new Map<string, RemoteWorker[]>();
    
    workers.forEach(worker => {
      const region = worker.getRegion();
      if (!regionGroups.has(region)) {
        regionGroups.set(region, []);
      }
      regionGroups.get(region)!.push(worker);
    });
    
    const vusPerRegion = Math.floor(totalVUs / regionGroups.size);
    const regionRemainder = totalVUs % regionGroups.size;
    
    const assignments: WorkerAssignment[] = [];
    let regionIndex = 0;
    
    for (const [region, regionWorkers] of regionGroups) {
      const regionVUs = vusPerRegion + (regionIndex < regionRemainder ? 1 : 0);
      
      const regionAssignments = this.evenDistribution(
        testConfig,
        regionWorkers,
        regionVUs
      );
      
      assignments.push(...regionAssignments);
      regionIndex++;
    }
    
    return assignments;
  }

  private createWorkerConfig(
    baseConfig: TestConfiguration,
    virtualUsers: number,
    workerIndex: number
  ): TestConfiguration {
    // Fixed: Ensure report config has required fields
    const reportConfig: ReportConfig | undefined = baseConfig.report ? {
      ...baseConfig.report,
      generate: false, // Workers shouldn't generate reports
      output: baseConfig.report.output || 'worker-report.html' // Provide default
    } : undefined;

    return {
      ...baseConfig,
      name: `${baseConfig.name} - Worker ${workerIndex + 1}`,
      load: {
        ...baseConfig.load,
        virtual_users: virtualUsers
      },
      outputs: baseConfig.outputs?.filter(output => 
        output.type !== 'webhook'
      ),
      report: reportConfig
    };
  }
}
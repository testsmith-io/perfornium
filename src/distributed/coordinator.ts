import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
import { RemoteWorker, RemoteWorkerConfig } from './remote-worker'; // Fixed import
import { LoadDistributor } from './load-distributor';
import { ResultAggregator } from './result-aggregator';
import { HealthMonitor } from './health-monitor';
import { TestResult } from '../metrics/types';
import { logger } from '../utils/logger';

export interface DistributedTestConfig {
  workers: RemoteWorkerConfig[]; // Fixed: Use RemoteWorkerConfig
  strategy: 'even' | 'capacity_based' | 'round_robin' | 'geographic';
  sync_start: boolean;
  heartbeat_interval: number;
  timeout: number;
  retry_failed: boolean;
}

export interface WorkAssignment {
  worker: RemoteWorker;
  config: TestConfiguration;
  virtualUsers: number;
}

export class DistributedCoordinator extends EventEmitter {
  private workers: RemoteWorker[] = [];
  private config: DistributedTestConfig;
  private testConfig: TestConfiguration | null = null;
  private loadDistributor: LoadDistributor;
  private resultAggregator: ResultAggregator;
  private healthMonitor: HealthMonitor;
  private isRunning: boolean = false;

  constructor(config: DistributedTestConfig) {
    super();
    this.config = config;
    this.loadDistributor = new LoadDistributor();
    this.resultAggregator = new ResultAggregator();
    this.healthMonitor = new HealthMonitor();
  }

  async initialize(): Promise<void> {
    logger.info(`🌍 Initializing distributed test with ${this.config.workers.length} workers`);
    
    for (const workerConfig of this.config.workers) {
      try {
        const worker = new RemoteWorker(workerConfig);
        
        worker.on('result', (result: TestResult) => {
          this.resultAggregator.addResult(result);
          this.emit('result', result);
        });
        
        worker.on('error', (error: Error) => {
          logger.error(`❌ Worker ${worker.getAddress()} error:`, error);
          this.emit('worker-error', { worker: worker.getAddress(), error });
        });
        
        worker.on('status', (status: any) => {
          this.healthMonitor.updateWorkerStatus(worker.getAddress(), status);
        });

        await worker.connect();
        this.workers.push(worker);
        
        logger.info(`✅ Connected to worker: ${worker.getAddress()}`);
      } catch (error) {
        logger.error(`❌ Failed to connect to worker ${workerConfig.host}:${workerConfig.port}:`, error);
        
        if (!this.config.retry_failed) {
          throw error;
        }
      }
    }

    if (this.workers.length === 0) {
      throw new Error('No workers available for distributed testing');
    }

    this.healthMonitor.start(this.workers, this.config.heartbeat_interval);
    
    logger.info(`🎯 ${this.workers.length} workers ready for distributed testing`);
  }

  async executeTest(testConfig: TestConfiguration): Promise<void> {
    this.testConfig = testConfig;
    this.isRunning = true;
    
    try {
      const workAssignments = this.loadDistributor.distribute(
        testConfig,
        this.workers,
        this.config.strategy
      );

      logger.info(`📊 Load distribution:`);
      workAssignments.forEach(assignment => {
        logger.info(`   ${assignment.worker.getAddress()}: ${assignment.virtualUsers} VUs`);
      });

      this.resultAggregator.start();

      if (this.config.sync_start) {
        await this.synchronizedStart(workAssignments);
      } else {
        await this.rollingStart(workAssignments);
      }

      await this.waitForCompletion();

    } finally {
      this.isRunning = false;
    }
  }

  private async synchronizedStart(assignments: WorkAssignment[]): Promise<void> {
    logger.info('🚀 Starting synchronized distributed test...');
    
    const preparations = assignments.map(async (assignment) => {
      await assignment.worker.prepareTest(assignment.config);
    });
    
    await Promise.all(preparations);
    logger.info('✅ All workers prepared');

    const startTime = Date.now() + 5000;
    
    const starts = assignments.map(async (assignment) => {
      await assignment.worker.startTest(startTime);
    });
    
    await Promise.all(starts);
    logger.info('🎯 All workers started');
  }

  private async rollingStart(assignments: WorkAssignment[]): Promise<void> {
    logger.info('🔄 Starting rolling distributed test...');
    
    for (const assignment of assignments) {
      try {
        await assignment.worker.executeTest(assignment.config);
        logger.info(`✅ Started worker ${assignment.worker.getAddress()}`);
      } catch (error) {
        logger.error(`❌ Failed to start worker ${assignment.worker.getAddress()}:`, error);
      }
    }
  }

  private async waitForCompletion(): Promise<void> {
    logger.info('⏳ Waiting for all workers to complete...');
    
    const completionPromises = this.workers.map(worker => 
      worker.waitForCompletion().catch((error: Error) => {
        logger.error(`❌ Worker ${worker.getAddress()} completion error:`, error);
        return null;
      })
    );

    await Promise.all(completionPromises);
    
    // Collect results from all workers
    logger.info('📊 Collecting results from workers...');
    for (const worker of this.workers) {
      try {
        const workerResults = await worker.getResults();
        if (workerResults && workerResults.results) {
          // Add worker results to aggregator
          workerResults.results.forEach((result: any) => {
            this.resultAggregator.addResult(result, worker.getAddress());
          });
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to get results from worker ${worker.getAddress()}:`, error);
      }
    }
    
    this.resultAggregator.stop();
    
    logger.info('✅ All workers completed');
  }

  async stop(): Promise<void> {
    logger.info('⏹️  Stopping distributed test...');
    this.isRunning = false;
    
    const stopPromises = this.workers.map(worker => 
      worker.stop().catch((error: Error) => {
        logger.warn(`⚠️  Error stopping worker ${worker.getAddress()}:`, error);
      })
    );
    
    await Promise.all(stopPromises);
    logger.info('🛑 All workers stopped');
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up distributed test...');
    
    this.healthMonitor.stop();
    
    const cleanupPromises = this.workers.map(worker => 
      worker.disconnect().catch((error: Error) => {
        logger.warn(`⚠️  Error cleaning up worker ${worker.getAddress()}:`, error);
      })
    );
    
    await Promise.all(cleanupPromises);
    this.workers = [];
    
    logger.info('✅ Cleanup completed');
  }

  getAggregatedResults(): any {
    return this.resultAggregator.getAggregatedResults();
  }

  getWorkerStatuses(): any[] {
    return this.workers.map(worker => ({
      address: worker.getAddress(),
      status: this.healthMonitor.getWorkerStatus(worker.getAddress()),
      connected: worker.isConnected()
    }));
  }

  getTotalCapacity(): number {
    return this.workers.reduce((total, worker) => total + worker.getCapacity(), 0);
  }
}
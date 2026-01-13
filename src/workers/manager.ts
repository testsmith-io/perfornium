import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
import { MetricsCollector } from '../metrics/collector';
import { WorkerNode } from './worker';
import { logger } from '../utils/logger';

export class WorkerManager extends EventEmitter {
  private workers: WorkerNode[] = [];
  private aggregatedMetrics: MetricsCollector = new MetricsCollector();

  async addWorker(address: string): Promise<void> {
    try {
      const worker = new WorkerNode(address);
      await worker.connect();
      
      worker.on('result', (result) => {
        this.aggregatedMetrics.recordResult(result);
        this.emit('result', result);
      });
      
      worker.on('error', (error) => {
        logger.error(`❌ Worker ${address} error:`, error);
        this.emit('worker-error', { worker: address, error });
      });
      
      worker.on('disconnected', () => {
        logger.warn(`⚠️  Worker ${address} disconnected`);
        this.removeWorker(worker);
      });
      
      this.workers.push(worker);
      logger.info(`✅ Worker added: ${address}`);
    } catch (error) {
      logger.error(`❌ Failed to add worker ${address}:`, error);
      throw error;
    }
  }

  async distributeTest(config: TestConfiguration): Promise<void> {
    if (this.workers.length === 0) {
      throw new Error('No workers available for distributed testing');
    }

    const { getPrimaryLoadPhase } = require('../config/types/load-config');
    const primaryPhase = getPrimaryLoadPhase(config.load);
    const totalVUs = primaryPhase.virtual_users || primaryPhase.vus || 1;
    const vusPerWorker = Math.ceil(totalVUs / this.workers.length);

    logger.info(`🔄 Distributing ${totalVUs} VUs across ${this.workers.length} workers`);

    const promises = this.workers.map(async (worker, index) => {
      const workerVUs = Math.min(vusPerWorker, totalVUs - (index * vusPerWorker));

      if (workerVUs <= 0) return;

      // Properly scale load config for this worker
      const scaledLoad = this.scaleLoadConfig(config.load, workerVUs);

      const workerConfig = {
        ...config,
        name: `${config.name} - Worker ${index + 1}`,
        load: scaledLoad
      };

      logger.debug(`🎯 Assigning ${workerVUs} VUs to worker ${worker.getAddress()}`);
      return worker.executeTest(workerConfig);
    });

    await Promise.all(promises);
  }

  private scaleLoadConfig(load: any, vus: number): any {
    if (Array.isArray(load)) {
      // Scale each phase in the array
      return load.map(phase => ({
        ...phase,
        virtual_users: vus,
        vus: vus
      }));
    } else {
      // Single phase object
      return {
        ...load,
        virtual_users: vus,
        vus: vus
      };
    }
  }

  async waitForCompletion(): Promise<void> {
    logger.info('⏳ Waiting for all workers to complete...');
    const promises = this.workers.map(worker => worker.waitForCompletion());
    await Promise.all(promises);
    logger.info('✅ All workers completed');
  }

  getAggregatedMetrics(): MetricsCollector {
    return this.aggregatedMetrics;
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up workers...');

    // Remove all event listeners from workers before disconnecting
    for (const worker of this.workers) {
      worker.removeAllListeners();
    }

    // Disconnect all workers
    const promises = this.workers.map(worker => worker.disconnect());
    await Promise.all(promises);
    this.workers = [];

    // Finalize metrics to clear any timers
    await this.aggregatedMetrics.finalize();

    // Remove our own listeners
    this.removeAllListeners();

    logger.info('✅ Cleanup completed');
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  getWorkerStatuses(): Array<{ address: string; connected: boolean }> {
    return this.workers.map(worker => ({
      address: worker.getAddress(),
      connected: worker.isConnected()
    }));
  }

  private removeWorker(worker: WorkerNode): void {
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }
  }
}
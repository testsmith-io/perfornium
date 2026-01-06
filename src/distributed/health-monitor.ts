import { RemoteWorker } from './remote-worker';
import { logger } from '../utils/logger';

export interface WorkerHealth {
  address: string;
  lastHeartbeat: number;
  isHealthy: boolean;
  responseTime: number;
  errorCount: number;
  status: 'connected' | 'disconnected' | 'unhealthy' | 'timeout';
}

export class HealthMonitor {
  private workerHealth: Map<string, WorkerHealth> = new Map();
  private monitorInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  start(workers: RemoteWorker[], intervalMs: number = 30000): void {
    this.isMonitoring = true;
    
    // Initialize health tracking
    workers.forEach(worker => {
      this.workerHealth.set(worker.getAddress(), {
        address: worker.getAddress(),
        lastHeartbeat: Date.now(),
        isHealthy: true,
        responseTime: 0,
        errorCount: 0,
        status: 'connected'
      });
    });
    
    // Start monitoring loop
    this.monitorInterval = setInterval(() => {
      this.checkWorkerHealth();
    }, intervalMs);
    
    logger.debug(`💓 Health monitoring started (${intervalMs}ms interval)`);
  }

  stop(): void {
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    
    logger.debug('💓 Health monitoring stopped');
  }

  updateWorkerStatus(address: string, status: any): void {
    const health = this.workerHealth.get(address);
    if (health) {
      health.lastHeartbeat = Date.now();
      health.responseTime = status.responseTime || 0;
      health.status = 'connected';
      
      if (status.error) {
        health.errorCount++;
      }
      
      this.workerHealth.set(address, health);
    }
  }

  private checkWorkerHealth(): void {
    const now = Date.now();
    const timeoutMs = 60000; // 1 minute timeout
    
    for (const [address, health] of this.workerHealth) {
      const timeSinceHeartbeat = now - health.lastHeartbeat;
      
      if (timeSinceHeartbeat > timeoutMs) {
        health.isHealthy = false;
        health.status = 'timeout';
        logger.warn(`⚠️  Worker ${address} health check timeout`);
      } else if (health.errorCount > 10) {
        health.isHealthy = false;
        health.status = 'unhealthy';
        logger.warn(`⚠️  Worker ${address} has too many errors`);
      } else {
        health.isHealthy = true;
        health.status = 'connected';
      }
      
      this.workerHealth.set(address, health);
    }
  }
}

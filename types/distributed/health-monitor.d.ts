import { RemoteWorker } from './remote-worker';
export interface WorkerHealth {
    address: string;
    lastHeartbeat: number;
    isHealthy: boolean;
    responseTime: number;
    errorCount: number;
    status: 'connected' | 'disconnected' | 'unhealthy' | 'timeout';
}
export declare class HealthMonitor {
    private workerHealth;
    private monitorInterval?;
    private isMonitoring;
    start(workers: RemoteWorker[], intervalMs?: number): void;
    stop(): void;
    updateWorkerStatus(address: string, status: any): void;
    private checkWorkerHealth;
    getWorkerStatus(address: string): WorkerHealth | undefined;
    getAllWorkerStatuses(): WorkerHealth[];
    getHealthyWorkers(): string[];
    getUnhealthyWorkers(): string[];
}

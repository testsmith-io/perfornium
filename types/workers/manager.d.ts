import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
import { MetricsCollector } from '../metrics/collector';
export declare class WorkerManager extends EventEmitter {
    private workers;
    private aggregatedMetrics;
    addWorker(address: string): Promise<void>;
    distributeTest(config: TestConfiguration): Promise<void>;
    waitForCompletion(): Promise<void>;
    getAggregatedMetrics(): MetricsCollector;
    cleanup(): Promise<void>;
    getWorkerCount(): number;
    getWorkerStatuses(): Array<{
        address: string;
        connected: boolean;
    }>;
    private removeWorker;
}

import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
import { RemoteWorker, RemoteWorkerConfig } from './remote-worker';
export interface DistributedTestConfig {
    workers: RemoteWorkerConfig[];
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
export declare class DistributedCoordinator extends EventEmitter {
    private workers;
    private config;
    private testConfig;
    private loadDistributor;
    private resultAggregator;
    private healthMonitor;
    private isRunning;
    constructor(config: DistributedTestConfig);
    initialize(): Promise<void>;
    executeTest(testConfig: TestConfiguration): Promise<void>;
    private synchronizedStart;
    private rollingStart;
    private waitForCompletion;
    stop(): Promise<void>;
    cleanup(): Promise<void>;
    getAggregatedResults(): any;
    getWorkerStatuses(): any[];
    getTotalCapacity(): number;
}

import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
export interface RemoteWorkerConfig {
    host: string;
    port: number;
    capacity: number;
    region: string;
}
export interface WorkerStatus {
    connected: boolean;
    running: boolean;
    virtualUsers: number;
    requestsPerSecond: number;
    responseTime: number;
    errorRate: number;
    activeRunner?: string;
}
export declare class RemoteWorker extends EventEmitter {
    private config;
    private connected;
    private status;
    constructor(config: RemoteWorkerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    prepareTest(testConfig: TestConfiguration): Promise<void>;
    startTest(startTime?: number): Promise<void>;
    executeTest(testConfig: TestConfiguration): Promise<void>;
    stop(): Promise<void>;
    waitForCompletion(): Promise<void>;
    getWorkerStatus(): Promise<WorkerStatus>;
    private sendHealthCheck;
    private sendRequest;
    getAddress(): string;
    getCapacity(): number;
    getRegion(): string;
    isConnected(): boolean;
    getConfig(): RemoteWorkerConfig;
    getResults(): Promise<any>;
}

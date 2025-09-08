import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
export declare class WorkerNode extends EventEmitter {
    private address;
    private ws?;
    private isRunning;
    private connectionRetries;
    private maxRetries;
    constructor(address: string);
    connect(): Promise<void>;
    executeTest(config: TestConfiguration): Promise<void>;
    private handleMessage;
    private sendHeartbeat;
    waitForCompletion(): Promise<void>;
    stop(): Promise<void>;
    disconnect(): Promise<void>;
    getAddress(): string;
    isConnected(): boolean;
}

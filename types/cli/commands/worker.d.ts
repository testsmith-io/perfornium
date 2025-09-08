export declare class WorkerServer {
    private server;
    private host;
    private port;
    private status;
    private activeRunner;
    private preparedConfig;
    private completedRunner;
    constructor(host?: string, port?: number);
    private handleRequest;
    private handleHealth;
    private handleStatus;
    private handlePrepare;
    private handleStart;
    private handleResults;
    private handleStop;
    private readRequestBody;
    private sendJson;
    private sendError;
    start(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): any;
}
export declare function workerCommand(options: {
    port?: string;
    host?: string;
}): Promise<void>;

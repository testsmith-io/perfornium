export declare class WorkerServer {
    private server;
    private wss;
    private port;
    private host;
    private activeRunners;
    constructor(port?: number, host?: string);
    private setupWebSocketHandlers;
    private handleMessage;
    private executeTest;
    private stopTest;
    private sendMessage;
    private sendError;
    private sendHeartbeat;
    private cleanup;
    start(): Promise<void>;
    stop(): Promise<void>;
    getActiveConnections(): number;
    getActiveTests(): number;
    getStatus(): any;
}

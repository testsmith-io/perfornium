import { TestResult, MetricsSummary, VUStartEvent } from './types';
import { EventEmitter } from 'events';
export interface RealtimeConfig {
    enabled: boolean;
    batch_size?: number;
    interval_ms?: number;
    endpoints?: RealtimeEndpoint[];
    file_output?: {
        enabled: boolean;
        path: string;
        format: 'jsonl' | 'csv';
    };
    incremental_files?: {
        enabled: boolean;
        json_path?: string;
        csv_path?: string;
        update_summary?: boolean;
    };
}
export interface RealtimeEndpoint {
    type: 'graphite' | 'webhook' | 'influxdb' | 'websocket';
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    token?: string;
    headers?: Record<string, string>;
}
export declare class MetricsCollector extends EventEmitter {
    private results;
    private startTime;
    private errorDetails;
    private vuStartEvents;
    private loadPatternType;
    private realtimeConfig;
    private batchBuffer;
    private batchTimer;
    private batchCounter;
    private csvHeaderWritten;
    private defaultJsonPath;
    private defaultCsvPath;
    constructor(realtimeConfig?: RealtimeConfig);
    private initializeRealtime;
    private startBatchTimer;
    private initializeIncrementalFiles;
    start(): void;
    setLoadPattern(pattern: string): void;
    recordVUStart(vuId: number): void;
    recordResult(result: TestResult): void;
    recordError(vuId: number, scenario: string, action: string, error: Error): void;
    private flushBatch;
    private writeBatchToFile;
    private formatBatchAsCSV;
    private updateIncrementalFiles;
    private updateIncrementalJSON;
    private updateIncrementalCSV;
    private updateIncrementalSummary;
    private generateSimpleHTMLSummary;
    private sendToRealTimeEndpoints;
    private sendToEndpoint;
    private sendToGraphite;
    private sendToWebhook;
    private sendToInfluxDB;
    private sendToWebSocket;
    finalize(): Promise<void>;
    private trackErrorDetail;
    getResults(): TestResult[];
    getFailedResults(): TestResult[];
    getVUStartEvents(): VUStartEvent[];
    getBatchStats(): {
        total_batches: number;
        pending_results: number;
    };
    setOutputPaths(jsonPath?: string, csvPath?: string): void;
    disableIncrementalFiles(): void;
    getSummary(): MetricsSummary;
    private calculateStepStatistics;
    private calculateTimelineData;
    private calculatePercentiles;
    clear(): void;
}

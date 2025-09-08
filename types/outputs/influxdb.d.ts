import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
export declare class InfluxDBOutput implements OutputHandler {
    private client;
    private database;
    private tags;
    constructor(url: string, database: string, tags?: Record<string, string>);
    initialize(): Promise<void>;
    writeResult(result: TestResult): Promise<void>;
    writeSummary(summary: MetricsSummary): Promise<void>;
    finalize(): Promise<void>;
}

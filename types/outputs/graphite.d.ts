import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
export declare class GraphiteOutput implements OutputHandler {
    private host;
    private port;
    private prefix;
    private client?;
    constructor(host?: string, port?: number, prefix?: string);
    initialize(): Promise<void>;
    writeResult(result: TestResult): Promise<void>;
    writeSummary(summary: MetricsSummary): Promise<void>;
    finalize(): Promise<void>;
}

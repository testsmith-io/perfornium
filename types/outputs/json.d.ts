import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
export declare class JSONOutput implements OutputHandler {
    private filePath;
    private results;
    private summary?;
    constructor(filePath: string);
    initialize(): Promise<void>;
    writeResult(result: TestResult): Promise<void>;
    writeSummary(summary: MetricsSummary): Promise<void>;
    finalize(): Promise<void>;
}

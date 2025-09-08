import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
export declare class WebhookOutput implements OutputHandler {
    private url;
    private headers;
    private format;
    private template?;
    private templateProcessor;
    private results;
    constructor(url: string, headers?: Record<string, string>, format?: string, template?: string);
    initialize(): Promise<void>;
    writeResult(result: TestResult): Promise<void>;
    writeSummary(summary: MetricsSummary): Promise<void>;
    private sendNotification;
    finalize(): Promise<void>;
}

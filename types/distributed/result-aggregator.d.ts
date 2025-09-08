import { TestResult } from '../metrics/types';
export interface AggregatedResults {
    summary: {
        total_requests: number;
        success_rate: number;
        avg_response_time: number;
        requests_per_second: number;
        total_errors: number;
        start_time: number;
        end_time: number;
        duration: number;
    };
    results: TestResult[];
    workers: {
        [workerAddress: string]: {
            requests: number;
            errors: number;
            avg_response_time: number;
            requests_per_second: number;
        };
    };
}
export declare class ResultAggregator {
    private results;
    private workerResults;
    private isAggregating;
    private startTime;
    private endTime;
    start(): void;
    stop(): void;
    addResult(result: TestResult, workerAddress?: string): void;
    getAggregatedResults(): AggregatedResults;
    getWorkerResults(workerAddress: string): TestResult[];
    getAllWorkerAddresses(): string[];
    getTotalResultCount(): number;
    clear(): void;
}

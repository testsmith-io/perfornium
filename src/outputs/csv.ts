import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';

export class CSVOutput implements OutputHandler {
  private filePath: string;
  private csvWriter: any;
  private results: TestResult[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.csvWriter = createObjectCsvWriter({
      path: this.filePath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'vu_id', title: 'vu_id' },
        { id: 'iteration', title: 'iteration' },
        { id: 'scenario', title: 'scenario' },
        { id: 'action', title: 'action' },
        { id: 'duration', title: 'duration_ms' },
        { id: 'success', title: 'success' },
        { id: 'status', title: 'http_status' },
        { id: 'error', title: 'error' },
        { id: 'response_size', title: 'response_size_bytes' }
      ]
    });
  }

  async writeResult(result: TestResult): Promise<void> {
    this.results.push(result);
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    // Summary will be written to a separate file
    const summaryPath = this.filePath.replace('.csv', '_summary.csv');
    const summaryWriter = createObjectCsvWriter({
      path: summaryPath,
      header: [
        { id: 'metric', title: 'metric' },
        { id: 'value', title: 'value' },
        { id: 'unit', title: 'unit' }
      ]
    });

    const summaryData = [
      { metric: 'total_requests', value: summary.total_requests, unit: 'count' },
      { metric: 'successful_requests', value: summary.successful_requests, unit: 'count' },
      { metric: 'failed_requests', value: summary.failed_requests, unit: 'count' },
      { metric: 'success_rate', value: summary.success_rate.toFixed(2), unit: 'percent' },
      { metric: 'avg_response_time', value: summary.avg_response_time.toFixed(2), unit: 'ms' },
      { metric: 'min_response_time', value: summary.min_response_time, unit: 'ms' },
      { metric: 'max_response_time', value: summary.max_response_time, unit: 'ms' },
      { metric: 'requests_per_second', value: summary.requests_per_second.toFixed(2), unit: 'req/s' },
      { metric: 'total_duration', value: summary.total_duration, unit: 'ms' },
      { metric: 'p50_response_time', value: summary.percentiles[50] || 0, unit: 'ms' },
      { metric: 'p90_response_time', value: summary.percentiles[90] || 0, unit: 'ms' },
      { metric: 'p95_response_time', value: summary.percentiles[95] || 0, unit: 'ms' },
      { metric: 'p99_response_time', value: summary.percentiles[99] || 0, unit: 'ms' }
    ];

    await summaryWriter.writeRecords(summaryData);
  }

  async finalize(): Promise<void> {
    if (this.results.length > 0) {
      await this.csvWriter.writeRecords(this.results);
    }
  }
}
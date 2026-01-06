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
        { id: 'step_name', title: 'step_name' },
        { id: 'duration', title: 'duration_ms' },
        { id: 'success', title: 'success' },
        { id: 'status', title: 'http_status' },
        { id: 'error', title: 'error' },
        { id: 'response_size', title: 'response_size_bytes' },
        // JMeter-style metrics
        { id: 'latency', title: 'latency_ms' },
        { id: 'connect_time', title: 'connect_time_ms' },
        { id: 'sent_bytes', title: 'sent_bytes' },
        { id: 'data_type', title: 'data_type' },
        // Web Vitals columns
        { id: 'lcp', title: 'lcp_ms' },
        { id: 'cls', title: 'cls_score' },
        { id: 'inp', title: 'inp_ms' },
        { id: 'ttfb', title: 'ttfb_ms' },
        { id: 'fcp', title: 'fcp_ms' },
        { id: 'fid', title: 'fid_ms' },
        { id: 'vitals_score', title: 'vitals_score' },
        // Verification metrics
        { id: 'verification_duration', title: 'verification_duration_ms' },
        { id: 'verification_success', title: 'verification_success' },
        { id: 'verification_step_name', title: 'verification_step_name' },
        // Page info
        { id: 'page_url', title: 'page_url' },
        { id: 'page_title', title: 'page_title' }
      ]
    });
  }

  async writeResult(result: TestResult): Promise<void> {
    // Write immediately to file (incremental during test)
    this.results.push(result); // Keep for finalize summary

    // Transform and write single result
    const record = this.transformResult(result);
    await this.csvWriter.writeRecords([record]);
  }

  private transformResult(result: TestResult): any {
    return {
      timestamp: result.timestamp,
      vu_id: result.vu_id,
      iteration: result.iteration,
      scenario: result.scenario,
      action: result.action,
      step_name: result.step_name || result.action,
      duration: result.duration,
      success: result.success,
      status: result.status,
      error: result.error || '',
      response_size: result.response_size || 0,
      // JMeter-style metrics
      latency: result.latency || 0,
      connect_time: result.connect_time || 0,
      sent_bytes: result.sent_bytes || 0,
      data_type: result.data_type || '',
      // Web Vitals
      lcp: result.custom_metrics?.web_vitals?.lcp || null,
      cls: result.custom_metrics?.web_vitals?.cls || null,
      inp: result.custom_metrics?.web_vitals?.inp || null,
      ttfb: result.custom_metrics?.web_vitals?.ttfb || null,
      fcp: result.custom_metrics?.web_vitals?.fcp || null,
      fid: result.custom_metrics?.web_vitals?.fid || null,
      vitals_score: result.custom_metrics?.web_vitals?.score || null,
      // Verification
      verification_duration: result.custom_metrics?.verification?.duration || null,
      verification_success: result.custom_metrics?.verification?.success || null,
      verification_step_name: result.custom_metrics?.verification?.step_name || null,
      // Page info
      page_url: result.custom_metrics?.page_url || null,
      page_title: result.custom_metrics?.page_title || null
    };
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
    // Results already written incrementally during test
    // No need to write them again
  }
}
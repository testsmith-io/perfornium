import * as fs from 'fs/promises';
import * as path from 'path';
import { TestResult } from '../types';
import { logger } from '../../utils/logger';

export class ResultsManager {
  private resultsDir: string;

  constructor(resultsDir: string) {
    this.resultsDir = resultsDir;
  }

  async scanResults(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    try {
      const files = await fs.readdir(this.resultsDir);
      const excludePatterns = ['metrics', 'live-results', 'summary-incremental'];
      const jsonFiles = files.filter(f => f.endsWith('.json') && !excludePatterns.some(p => f.includes(p)));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.resultsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          const stat = await fs.stat(filePath);
          const fileId = file.replace('.json', '');

          // Extract test name from filename if not in data
          let testName = data.name || data.test_name;
          if (!testName) {
            const match = fileId.match(/^(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
            testName = match ? match[1] : fileId;
          }

          // Extract timestamp from filename or metadata
          let timestamp = data.timestamp || data.metadata?.generated_at;
          if (!timestamp) {
            const tsMatch = fileId.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
            if (tsMatch) {
              timestamp = `${tsMatch[1]}T${tsMatch[2]}:${tsMatch[3]}:${tsMatch[4]}Z`;
            } else {
              timestamp = stat.mtime.toISOString();
            }
          }

          results.push({
            id: fileId,
            name: testName,
            timestamp: timestamp,
            duration: data.duration || data.total_duration || data.summary?.total_duration || 0,
            summary: this.extractSummary(data),
            scenarios: data.scenarios || [],
            step_statistics: data.step_statistics || data.summary?.step_statistics || []
          });
        } catch (e: any) {
          // Log skipped files so users know why results don't appear
          logger.warn(`Skipping invalid result file ${file}: ${e.message}`);
        }
      }
    } catch (e) {
      // Results dir might not exist
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  }

  async loadFullResult(id: string): Promise<TestResult | null> {
    try {
      const decodedId = decodeURIComponent(id);
      const filePath = path.join(this.resultsDir, `${decodedId}.json`);
      logger.debug(`Loading result from: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const stat = await fs.stat(filePath);

      // Extract network calls from results
      const networkCalls = this.extractNetworkCalls(data);

      // Extract test name from filename if not in data
      // Filename format: "Test Name-YYYY-MM-DD_HH-MM-SS-YYYYMMDD-HHMMSS-mmm.json"
      let testName = data.name || data.test_name;
      if (!testName) {
        // Try to extract from filename by removing timestamp suffix
        const match = decodedId.match(/^(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
        testName = match ? match[1] : decodedId;
      }

      // Extract timestamp from filename or metadata
      let timestamp = data.timestamp || data.metadata?.generated_at;
      if (!timestamp) {
        // Try to extract from filename
        const tsMatch = decodedId.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
        if (tsMatch) {
          timestamp = `${tsMatch[1]}T${tsMatch[2]}:${tsMatch[3]}:${tsMatch[4]}Z`;
        } else {
          timestamp = stat.mtime.toISOString();
        }
      }

      return {
        id: decodedId,
        name: testName,
        timestamp: timestamp,
        duration: data.duration || data.total_duration || data.summary?.total_duration || 0,
        summary: this.extractSummary(data),
        scenarios: data.scenarios || [],
        step_statistics: data.step_statistics || data.summary?.step_statistics || [],
        timeline_data: data.timeline_data || data.summary?.timeline_data || [],
        vu_ramp_up: data.vu_ramp_up || data.summary?.vu_ramp_up || [],
        response_time_distribution: data.response_time_distribution || [],
        timeseries: data.timeseries || data.time_series || [],
        error_details: data.error_details || data.summary?.error_details || [],
        network_calls: networkCalls,
        infrastructure_metrics: data.infrastructure_metrics || null,
        raw: data
      };
    } catch (e: any) {
      logger.error(`Failed to load result ${id}:`, e.message);
      return null;
    }
  }

  async deleteResult(id: string): Promise<void> {
    const decodedId = decodeURIComponent(id);
    const filePath = path.join(this.resultsDir, `${decodedId}.json`);
    logger.debug(`Deleting result file: ${filePath}`);
    await fs.unlink(filePath);
    logger.info(`Deleted result: ${decodedId}`);
  }

  async saveResult(id: string, data: any): Promise<{ id: string; name: string }> {
    // Ensure results directory exists
    try {
      await fs.access(this.resultsDir);
    } catch {
      await fs.mkdir(this.resultsDir, { recursive: true });
    }

    const sanitizedId = id.replace(/[<>:"/\\|?*]/g, '-');
    const filePath = path.join(this.resultsDir, `${sanitizedId}.json`);
    logger.debug(`Saving result to: ${filePath}`);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved result: ${sanitizedId}`);

    return { id: sanitizedId, name: data.name || sanitizedId };
  }

  generateComparison(results: (TestResult | null)[]): any {
    const valid = results.filter(r => r !== null) as TestResult[];
    if (valid.length < 2) return null;

    const baseline = valid[0];
    const comparisons = valid.slice(1).map(result => ({
      id: result.id,
      name: result.name,
      timestamp: result.timestamp,
      diff: {
        avg_response_time: this.calcDiff(baseline.summary.avg_response_time, result.summary.avg_response_time),
        p50_response_time: this.calcDiff(baseline.summary.p50_response_time, result.summary.p50_response_time),
        p95_response_time: this.calcDiff(baseline.summary.p95_response_time, result.summary.p95_response_time),
        p99_response_time: this.calcDiff(baseline.summary.p99_response_time, result.summary.p99_response_time),
        requests_per_second: this.calcDiff(baseline.summary.requests_per_second, result.summary.requests_per_second, true),
        error_rate: {
          value: result.summary.error_rate,
          baseline: baseline.summary.error_rate,
          change: (result.summary.error_rate - baseline.summary.error_rate).toFixed(2) + '%',
          improved: result.summary.error_rate < baseline.summary.error_rate
        }
      }
    }));

    // Generate step-level comparisons
    const stepComparisons = this.generateStepComparisons(valid);

    // Get timeline data for line graphs
    const timelineComparisons = valid.map(result => ({
      id: result.id,
      name: result.name,
      timeline: result.timeline_data || []
    }));

    return {
      baseline: { id: baseline.id, name: baseline.name, timestamp: baseline.timestamp },
      comparisons,
      stepComparisons,
      timelineComparisons
    };
  }

  private extractSummary(data: any): TestResult['summary'] {
    const s = data.summary || data;
    const percentiles = s.percentiles || {};
    const totalReq = s.total_requests || 0;
    const failedReq = s.failed_requests || 0;

    return {
      total_requests: totalReq,
      successful_requests: s.successful_requests || (totalReq - failedReq),
      failed_requests: failedReq,
      avg_response_time: s.avg_response_time || s.mean_response_time || 0,
      min_response_time: s.min_response_time || 0,
      max_response_time: s.max_response_time || 0,
      p50_response_time: percentiles['50'] || s.p50_response_time || s.median_response_time || 0,
      p75_response_time: percentiles['75'] || s.p75_response_time || 0,
      p90_response_time: percentiles['90'] || s.p90_response_time || 0,
      p95_response_time: percentiles['95'] || s.p95_response_time || 0,
      p99_response_time: percentiles['99'] || s.p99_response_time || 0,
      requests_per_second: s.requests_per_second || s.throughput || 0,
      error_rate: s.error_rate ?? (failedReq / Math.max(1, totalReq) * 100),
      success_rate: s.success_rate ?? ((totalReq - failedReq) / Math.max(1, totalReq) * 100)
    };
  }

  private extractNetworkCalls(data: any): any[] {
    const calls: any[] = [];

    // Extract from results array (each result may have custom_metrics.network_calls)
    const results = data.results || [];
    for (const result of results) {
      if (result.custom_metrics?.network_calls) {
        calls.push(...result.custom_metrics.network_calls);
      }
    }

    // Also check for direct network_calls array
    if (data.network_calls) {
      calls.push(...data.network_calls);
    }

    return calls;
  }

  private generateStepComparisons(results: TestResult[]): any[] {
    // Collect all unique step names across all results
    const allSteps = new Set<string>();
    results.forEach(result => {
      (result.step_statistics || []).forEach((step: any) => {
        allSteps.add(step.step_name);
      });
    });

    // For each step, gather metrics from all results
    const stepComparisons: any[] = [];
    allSteps.forEach(stepName => {
      const stepData: any = {
        step_name: stepName,
        results: results.map(result => {
          const step = (result.step_statistics || []).find((s: any) => s.step_name === stepName);
          if (!step) return null;
          return {
            testId: result.id,
            testName: result.name,
            total_requests: step.total_requests,
            failed_requests: step.failed_requests,
            success_rate: step.success_rate,
            avg_response_time: step.avg_response_time,
            min_response_time: step.min_response_time,
            max_response_time: step.max_response_time,
            p50: step.percentiles?.[50] || step.p50 || 0,
            p95: step.percentiles?.[95] || step.p95 || 0,
            p99: step.percentiles?.[99] || step.p99 || 0
          };
        })
      };

      // Calculate diffs from baseline (first result)
      const baseline = stepData.results[0];
      if (baseline) {
        stepData.diffs = stepData.results.slice(1).map((current: any) => {
          if (!current) return null;
          return {
            avg_response_time: this.calcDiff(baseline.avg_response_time, current.avg_response_time),
            p95: this.calcDiff(baseline.p95, current.p95),
            p99: this.calcDiff(baseline.p99, current.p99),
            success_rate: {
              value: current.success_rate,
              baseline: baseline.success_rate,
              change: (current.success_rate - baseline.success_rate).toFixed(2) + '%',
              improved: current.success_rate > baseline.success_rate
            }
          };
        });
      }

      stepComparisons.push(stepData);
    });

    return stepComparisons;
  }

  private calcDiff(baseline: number, current: number, higherIsBetter = false): any {
    const change = baseline ? ((current - baseline) / baseline * 100) : 0;
    return {
      value: current,
      baseline,
      change: change.toFixed(2) + '%',
      improved: higherIsBetter ? current > baseline : current < baseline
    };
  }
}

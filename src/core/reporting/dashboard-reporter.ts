import { MetricsCollector } from '../../metrics/collector';
import { VirtualUser } from '../virtual-user';
import { getDashboard } from '../../dashboard';

export interface DashboardReporterConfig {
  testId: string;
  testName: string;
}

export class DashboardReporter {
  private testId: string;
  private testName: string;
  private dashboardInterval: NodeJS.Timeout | null = null;
  private lastReportedResultIndex: number = 0;
  private isRunning: boolean = false;

  constructor(config: DashboardReporterConfig) {
    this.testId = config.testId;
    this.testName = config.testName;
  }

  start(
    metrics: MetricsCollector,
    getActiveVUs: () => VirtualUser[],
    isRunningChecker: () => boolean
  ): void {
    this.isRunning = true;
    this.lastReportedResultIndex = 0;

    const dashboard = getDashboard();

    // If running standalone (no dashboard singleton), output progress to stdout for dashboard parsing
    const outputProgress = !dashboard && process.env.PERFORNIUM_PROGRESS !== '0';

    if (dashboard) {
      // Report initial state to in-process dashboard
      dashboard.reportLiveUpdate(this.testId, {
        id: this.testId,
        name: this.testName,
        startTime: new Date(),
        status: 'running',
        metrics: {
          requests: 0,
          errors: 0,
          avgResponseTime: 0,
          currentVUs: 0
        }
      });
    }

    // Track last request count to detect activity
    let lastRequestCount = 0;

    // Report updates every 500ms
    this.dashboardInterval = setInterval(() => {
      if (!isRunningChecker()) return;

      const summary = metrics.getSummary();
      const currentVUs = getActiveVUs().filter(vu => vu.isRunning()).length;
      const currentRequests = summary.total_requests || 0;

      // Skip reporting if VUs are 0 and no new requests (test is winding down)
      const hasActivity = currentVUs > 0 || currentRequests > lastRequestCount;
      lastRequestCount = currentRequests;

      if (dashboard) {
        dashboard.reportLiveUpdate(this.testId, {
          metrics: {
            requests: currentRequests,
            errors: summary.failed_requests || 0,
            avgResponseTime: summary.avg_response_time || 0,
            currentVUs
          }
        });
      }

      // Output machine-readable progress for dashboard parsing (only when there's activity)
      if (outputProgress && hasActivity) {
        this.outputProgress(metrics, summary, currentVUs);
      }
    }, 500);
  }

  stop(): void {
    this.isRunning = false;

    if (this.dashboardInterval) {
      clearInterval(this.dashboardInterval);
      this.dashboardInterval = null;
    }

    const dashboard = getDashboard();
    if (dashboard) {
      dashboard.reportTestComplete(this.testId);
    }
  }

  private outputProgress(metrics: MetricsCollector, summary: any, currentVUs: number): void {
    const currentRequests = summary.total_requests || 0;
    const rps = summary.requests_per_second || 0;
    const p50 = summary.percentiles?.[50] || 0;
    const p90 = summary.percentiles?.[90] || 0;
    const p95 = summary.percentiles?.[95] || 0;
    const p99 = summary.percentiles?.[99] || 0;
    const successRate = summary.success_rate || 0;

    // Main progress line with percentiles
    console.log(`[PROGRESS] VUs: ${currentVUs} | Requests: ${currentRequests} | Errors: ${summary.failed_requests || 0} | Avg RT: ${(summary.avg_response_time || 0).toFixed(0)}ms | RPS: ${rps.toFixed(1)} | P50: ${p50.toFixed(0)}ms | P90: ${p90.toFixed(0)}ms | P95: ${p95.toFixed(0)}ms | P99: ${p99.toFixed(0)}ms | Success: ${successRate.toFixed(1)}%`);

    // Output step statistics if available
    if (summary.step_statistics && summary.step_statistics.length > 0) {
      const stepData = summary.step_statistics.map((s: any) => ({
        n: s.step_name,
        s: s.scenario,
        r: s.total_requests,
        e: s.failed_requests,
        a: Math.round(s.avg_response_time),
        p50: Math.round(s.percentiles?.[50] || 0),
        p95: Math.round(s.percentiles?.[95] || 0),
        p99: Math.round(s.percentiles?.[99] || 0),
        sr: Math.round(s.success_rate * 10) / 10
      }));
      console.log(`[STEPS] ${JSON.stringify(stepData)}`);
    }

    // Output individual response times (last 50 new results)
    const allResults = metrics.getResults();
    if (allResults.length > this.lastReportedResultIndex) {
      const newResults = allResults.slice(this.lastReportedResultIndex, this.lastReportedResultIndex + 50);
      const rtData = newResults.map(r => ({
        t: r.timestamp,
        v: Math.round(r.duration),
        s: r.success ? 1 : 0,
        n: r.step_name || r.action || 'unknown'
      }));
      if (rtData.length > 0) {
        console.log(`[RT] ${JSON.stringify(rtData)}`);
      }
      this.lastReportedResultIndex = Math.min(allResults.length, this.lastReportedResultIndex + 50);
    }

    // Output top 10 errors if any
    if (summary.error_details && summary.error_details.length > 0) {
      const topErrors = summary.error_details.slice(0, 10).map((e: any) => ({
        scenario: e.scenario,
        action: e.action,
        status: e.status,
        error: e.error?.substring(0, 200),
        url: e.request_url,
        count: e.count
      }));
      console.log(`[ERRORS] ${JSON.stringify(topErrors)}`);
    }
  }
}

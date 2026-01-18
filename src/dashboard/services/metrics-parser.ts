import { LiveTest } from '../types';

export interface MetricsParserOptions {
  /** When InfluxDB is enabled, don't limit response times (data is persisted) */
  influxEnabled?: boolean;
}

export class MetricsParser {
  private influxEnabled: boolean;

  constructor(options?: MetricsParserOptions) {
    this.influxEnabled = options?.influxEnabled ?? false;
  }

  parseOutputForMetrics(line: string, test: LiveTest): boolean {
    // Parse [RT] JSON data for individual response times
    const rtMatch = line.match(/\[RT\]\s*(.+)/);
    if (rtMatch) {
      try {
        const rtData = JSON.parse(rtMatch[1]);
        const newRTs = rtData.map((r: any) => ({
          timestamp: r.t,
          value: r.v,
          success: r.s === 1,
          stepName: r.n || 'unknown'
        }));
        // When InfluxDB is enabled, keep all response times (data is persisted)
        // Otherwise limit to 500 to prevent memory issues
        if (this.influxEnabled) {
          test.responseTimes = [...test.responseTimes, ...newRTs];
        } else {
          test.responseTimes = [...test.responseTimes, ...newRTs].slice(-500);
        }
        return true;
      } catch (e) {
        // Ignore JSON parse errors
      }
      return false;
    }

    // Parse [STEPS] JSON data for step statistics
    const stepsMatch = line.match(/\[STEPS\]\s*(.+)/);
    if (stepsMatch) {
      try {
        const stepData = JSON.parse(stepsMatch[1]);
        test.stepStats = stepData.map((s: any) => ({
          stepName: s.n,
          scenario: s.s,
          requests: s.r,
          errors: s.e,
          avgResponseTime: s.a,
          p50: s.p50,
          p95: s.p95,
          p99: s.p99,
          successRate: s.sr
        }));
        return true;
      } catch (e) {
        // Ignore JSON parse errors
      }
      return false;
    }

    // Parse [ERRORS] JSON data for top errors
    const topErrorsMatch = line.match(/\[ERRORS\]\s*(.+)/);
    if (topErrorsMatch) {
      try {
        const errorData = JSON.parse(topErrorsMatch[1]);
        test.topErrors = errorData.map((e: any) => ({
          scenario: e.scenario,
          action: e.action,
          status: e.status,
          error: e.error,
          url: e.url,
          count: e.count
        }));
        return true;
      } catch (e) {
        // Ignore JSON parse errors
      }
      return false;
    }

    // Parse [NETWORK] JSON data for captured HTTP calls
    const networkMatch = line.match(/\[NETWORK\]\s*(.+)/);
    if (networkMatch) {
      try {
        const networkData = JSON.parse(networkMatch[1]);

        // Initialize network calls array if not present
        if (!test.networkCalls) {
          test.networkCalls = [];
        }

        test.networkCalls.push({
          id: networkData.id,
          vuId: networkData.vu,
          url: networkData.url,
          method: networkData.method,
          status: networkData.status,
          statusText: networkData.statusText,
          duration: networkData.duration,
          size: networkData.size,
          type: networkData.type,
          success: networkData.success,
          error: networkData.error,
          timestamp: Date.now(),
          requestHeaders: networkData.requestHeaders,
          requestBody: networkData.requestBody,
          responseHeaders: networkData.responseHeaders,
          responseBody: networkData.responseBody
        });

        // Keep last 100 network calls to prevent memory issues
        if (test.networkCalls.length > 100) {
          test.networkCalls = test.networkCalls.slice(-100);
        }

        return true;
      } catch (e) {
        // Ignore JSON parse errors
      }
      return false;
    }

    // Parse the extended [PROGRESS] format with percentiles
    // Format: [PROGRESS] VUs: 5 | Requests: 100 | Errors: 2 | Avg RT: 150ms | RPS: 10.5 | P50: 100ms | P90: 200ms | P95: 300ms | P99: 500ms | Success: 98.5%
    const progressLineMatch = line.match(/\[PROGRESS\]\s*VUs:\s*(\d+)\s*\|\s*Requests:\s*(\d+)\s*\|\s*Errors:\s*(\d+)\s*\|\s*Avg RT:\s*(\d+(?:\.\d+)?)\s*ms\s*\|\s*RPS:\s*(\d+(?:\.\d+)?)/i);

    if (progressLineMatch) {
      test.metrics.currentVUs = parseInt(progressLineMatch[1]);
      test.metrics.requests = parseInt(progressLineMatch[2]);
      test.metrics.errors = parseInt(progressLineMatch[3]);
      test.metrics.avgResponseTime = parseFloat(progressLineMatch[4]);
      test.metrics.requestsPerSecond = parseFloat(progressLineMatch[5]);

      // Parse percentiles if present
      const p50Match = line.match(/P50:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p90Match = line.match(/P90:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p95Match = line.match(/P95:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p99Match = line.match(/P99:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const successMatch = line.match(/Success:\s*(\d+(?:\.\d+)?)\s*%/i);

      if (p50Match) test.metrics.p50ResponseTime = parseFloat(p50Match[1]);
      if (p90Match) test.metrics.p90ResponseTime = parseFloat(p90Match[1]);
      if (p95Match) test.metrics.p95ResponseTime = parseFloat(p95Match[1]);
      if (p99Match) test.metrics.p99ResponseTime = parseFloat(p99Match[1]);
      if (successMatch) test.metrics.successRate = parseFloat(successMatch[1]);

      // Add to history
      this.addHistoryEntry(test);
      return true;
    }

    // Fallback: Parse various loose output formats for metrics
    const vusMatch = line.match(/VUs?[:\s]+(\d+)/i);
    const requestsMatch = line.match(/(?:total\s+)?requests?[:\s]+(\d+)/i);
    const errorsMatch = line.match(/(?:failed|errors?)[:\s]+(\d+)/i);
    const avgRtMatch = line.match(/(?:avg|average)\s*(?:rt|response\s*time)?[:\s]+(\d+(?:\.\d+)?)\s*ms/i);
    const rpsMatch = line.match(/(?:rps|req\/s|requests\/s(?:ec)?)[:\s]+(\d+(?:\.\d+)?)/i);

    let updated = false;

    if (vusMatch) {
      test.metrics.currentVUs = parseInt(vusMatch[1]);
      updated = true;
    }
    if (requestsMatch) {
      test.metrics.requests = parseInt(requestsMatch[1]);
      updated = true;
    }
    if (errorsMatch) {
      test.metrics.errors = parseInt(errorsMatch[1]);
      updated = true;
    }
    if (avgRtMatch) {
      test.metrics.avgResponseTime = parseFloat(avgRtMatch[1]);
      updated = true;
    }
    if (rpsMatch) {
      test.metrics.requestsPerSecond = parseFloat(rpsMatch[1]);
      updated = true;
    }

    if (updated) {
      this.addHistoryEntry(test);
    }

    return updated;
  }

  private addHistoryEntry(test: LiveTest): void {
    const now = Date.now();
    const lastHistory = test.history[test.history.length - 1];
    const rps = lastHistory && (now - lastHistory.timestamp) > 0
      ? (test.metrics.requests - lastHistory.requests) / ((now - lastHistory.timestamp) / 1000)
      : (test.metrics.requestsPerSecond || 0);

    test.history.push({
      timestamp: now,
      requests: test.metrics.requests,
      errors: test.metrics.errors,
      avgResponseTime: test.metrics.avgResponseTime,
      p95ResponseTime: test.metrics.p95ResponseTime || 0,
      p99ResponseTime: test.metrics.p99ResponseTime || 0,
      vus: test.metrics.currentVUs,
      rps: Math.max(0, rps)
    });

    if (test.history.length > 120) test.history.shift();
  }

  parseNetworkData(line: string): any | null {
    const networkMatch = line.match(/\[NETWORK\]\s*(.+)/);
    if (networkMatch) {
      try {
        return JSON.parse(networkMatch[1]);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

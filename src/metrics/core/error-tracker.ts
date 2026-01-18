import { ErrorDetail, TestResult } from '../types';

export class ErrorTracker {
  private errorDetails: Map<string, ErrorDetail> = new Map();

  clear(): void {
    this.errorDetails.clear();
  }

  trackError(result: TestResult): void {
    const errorKey = `${result.scenario}:${result.action}:${result.status || 'NO_STATUS'}:${result.error}`;

    const existing = this.errorDetails.get(errorKey);
    if (existing) {
      existing.count++;
    } else {
      this.errorDetails.set(errorKey, {
        timestamp: result.timestamp,
        vu_id: result.vu_id,
        scenario: result.scenario,
        action: result.action,
        status: result.status,
        error: result.error || 'Unknown error',
        request_url: result.request_url,
        response_body: result.response_body,
        count: 1
      });
    }
  }

  getErrorDetails(): ErrorDetail[] {
    return Array.from(this.errorDetails.values()).sort((a, b) => b.count - a.count);
  }

  getErrorDistribution(results: TestResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    results.filter(r => !r.success).forEach(r => {
      const error = r.error || 'Unknown error';
      distribution[error] = (distribution[error] || 0) + 1;
    });
    return distribution;
  }

  getStatusDistribution(results: TestResult[]): Record<number, number> {
    const distribution: Record<number, number> = {};
    results.forEach(r => {
      if (r.status) {
        distribution[r.status] = (distribution[r.status] || 0) + 1;
      }
    });
    return distribution;
  }
}

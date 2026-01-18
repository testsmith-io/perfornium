import { TestResult } from '../../metrics/types';

export interface EndpointStats {
  endpoint: string;
  count: number;
  avg_duration: number;
  success_rate: number;
  total_size: number;
  status_distribution: Record<number, number>;
}

export interface NetworkStatistics {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
  avg_duration: number;
  total_size: number;
  by_endpoint: EndpointStats[];
  by_type: Array<{ type: string; count: number }>;
}

export class NetworkStatisticsCalculator {
  static calculateNetworkStatistics(results: TestResult[]): NetworkStatistics | null {
    const allCalls: any[] = [];

    results.forEach(result => {
      if (result.custom_metrics?.network_calls) {
        allCalls.push(...result.custom_metrics.network_calls);
      }
    });

    if (allCalls.length === 0) return null;

    const successfulCalls = allCalls.filter(c => c.success);
    const failedCalls = allCalls.filter(c => !c.success);
    const durations = allCalls.filter(c => c.duration).map(c => c.duration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const totalSize = allCalls.reduce((sum, c) => sum + (c.response_size || 0), 0);

    const byEndpoint = new Map<string, any[]>();
    allCalls.forEach(call => {
      try {
        const url = new URL(call.request_url);
        const endpoint = url.pathname;
        if (!byEndpoint.has(endpoint)) {
          byEndpoint.set(endpoint, []);
        }
        byEndpoint.get(endpoint)!.push(call);
      } catch {
        // Invalid URL, skip
      }
    });

    const endpointStats = Array.from(byEndpoint.entries())
      .map(([endpoint, calls]) => {
        const successful = calls.filter(c => c.success);
        const callDurations = calls.filter(c => c.duration).map(c => c.duration);
        const avgDur = callDurations.length > 0
          ? callDurations.reduce((a, b) => a + b, 0) / callDurations.length
          : 0;

        const statusDist: Record<number, number> = {};
        calls.forEach(c => {
          const status = c.response_status || 0;
          statusDist[status] = (statusDist[status] || 0) + 1;
        });

        return {
          endpoint,
          count: calls.length,
          avg_duration: Math.round(avgDur),
          success_rate: calls.length > 0 ? (successful.length / calls.length) * 100 : 0,
          total_size: calls.reduce((sum, c) => sum + (c.response_size || 0), 0),
          status_distribution: statusDist
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const byType = new Map<string, number>();
    allCalls.forEach(call => {
      const type = call.resource_type || 'unknown';
      byType.set(type, (byType.get(type) || 0) + 1);
    });

    const typeStats = Array.from(byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_calls: allCalls.length,
      successful_calls: successfulCalls.length,
      failed_calls: failedCalls.length,
      success_rate: allCalls.length > 0 ? (successfulCalls.length / allCalls.length) * 100 : 0,
      avg_duration: Math.round(avgDuration),
      total_size: totalSize,
      by_endpoint: endpointStats,
      by_type: typeStats
    };
  }
}

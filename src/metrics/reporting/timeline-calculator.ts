import { TestResult, TimelineData, VUStartEvent } from '../types';

export class TimelineCalculator {
  private readonly intervalMs: number;

  constructor(intervalMs: number = 5000) {
    this.intervalMs = intervalMs;
  }

  calculate(
    results: TestResult[],
    vuStartEvents: VUStartEvent[],
    startTime: number,
    endTime?: number
  ): TimelineData[] {
    if (results.length === 0) return [];

    const actualEndTime = endTime || Date.now();
    const timeline: TimelineData[] = [];

    for (let time = startTime; time <= actualEndTime; time += this.intervalMs) {
      const intervalResults = results.filter(r =>
        r.timestamp >= time && r.timestamp < time + this.intervalMs
      );

      const successfulResults = intervalResults.filter(r => r.success);
      const failedResults = intervalResults.filter(r => !r.success);

      // Calculate active VUs at this time
      const activeVUs = vuStartEvents.filter(vu => vu.start_time <= time).length;

      // Get response times for percentile calculations
      const responseTimes = successfulResults
        .map(r => r.duration || 0)
        .filter(d => d > 0)
        .sort((a, b) => a - b);

      // Calculate percentiles
      const p50 = this.getPercentile(responseTimes, 50);
      const p90 = this.getPercentile(responseTimes, 90);
      const p95 = this.getPercentile(responseTimes, 95);
      const p99 = this.getPercentile(responseTimes, 99);
      const minRT = responseTimes.length > 0 ? responseTimes[0] : 0;
      const maxRT = responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0;

      // Calculate bytes
      const bytesSent = intervalResults.reduce((sum, r) => sum + (r.sent_bytes || 0), 0);
      const bytesReceived = intervalResults.reduce((sum, r) => sum + (r.response_size || 0), 0);

      // Calculate connect time and latency averages
      const connectTimes = intervalResults.filter(r => r.connect_time !== undefined).map(r => r.connect_time!);
      const latencies = intervalResults.filter(r => r.latency !== undefined).map(r => r.latency!);
      const connectTimeAvg = connectTimes.length > 0
        ? connectTimes.reduce((a, b) => a + b, 0) / connectTimes.length
        : 0;
      const latencyAvg = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

      // Calculate status code distribution
      const statusCodes: Record<number, number> = {};
      intervalResults.forEach(r => {
        if (r.status) {
          statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
        }
      });

      timeline.push({
        timestamp: time,
        time_label: new Date(time).toISOString(),
        active_vus: activeVUs,
        requests_count: intervalResults.length,
        avg_response_time: successfulResults.length > 0
          ? successfulResults.reduce((sum, r) => sum + (r.duration || 0), 0) / successfulResults.length
          : 0,
        success_rate: intervalResults.length > 0
          ? (successfulResults.length / intervalResults.length) * 100
          : 0,
        throughput: intervalResults.length / (this.intervalMs / 1000),
        // Enhanced metrics
        error_count: failedResults.length,
        p50_response_time: p50,
        p90_response_time: p90,
        p95_response_time: p95,
        p99_response_time: p99,
        min_response_time: minRT,
        max_response_time: maxRT,
        bytes_sent: bytesSent,
        bytes_received: bytesReceived,
        connect_time_avg: connectTimeAvg,
        latency_avg: latencyAvg,
        status_codes: statusCodes
      });
    }

    return timeline;
  }

  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
}

import { TestResult } from '../../metrics/types';
import { StatisticsCalculator } from '../statistics';

export interface VURampupDataPoint {
  time: number;
  timestamp: number;
  count: number;
}

export interface TimelineDataPoint {
  timestamp: number;
  active_vus: number;
  avg_response_time: number;
  success_rate: number;
  throughput: number;
}

export class TimelineCalculator {
  static calculateVURampupData(results: TestResult[], vuStartEvents: any[] = []): VURampupDataPoint[] {
    const vuRampupData: VURampupDataPoint[] = [];

    if (vuStartEvents.length === 0) {
      return vuRampupData;
    }

    const totalVUs = vuStartEvents.length;
    const testStartTime = Math.min(...vuStartEvents.map(vu => vu.start_time));
    const testEndTime = results.length > 0
      ? Math.max(...results.map(r => r.timestamp))
      : testStartTime + 60000;

    const timeInterval = 1000;
    const sortedVUEvents = [...vuStartEvents].sort((a, b) => a.start_time - b.start_time);

    for (let t = testStartTime; t <= testEndTime; t += timeInterval) {
      const activeVUs = sortedVUEvents.filter(vu => vu.start_time <= t).length;

      vuRampupData.push({
        time: (t - testStartTime) / 1000,
        timestamp: t,
        count: Math.min(activeVUs, totalVUs)
      });
    }

    return vuRampupData;
  }

  static calculateTimelineData(results: TestResult[]): TimelineDataPoint[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 5000);

    return timeGroups.map(group => {
      const groupResults = results.filter(r =>
        Math.abs(new Date(r.timestamp).getTime() - new Date(group.timestamp).getTime()) < 5000
      );

      const successfulResults = groupResults.filter(r => r.success);
      const avgResponseTime = successfulResults.length > 0 ?
        successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length : 0;

      const activeVUs = group.concurrent_users || 0;

      return {
        timestamp: group.timestamp,
        active_vus: activeVUs,
        avg_response_time: avgResponseTime,
        success_rate: groupResults.length > 0 ? (successfulResults.length / groupResults.length) * 100 : 0,
        throughput: group.requests_per_second || (groupResults.length / 5)
      };
    });
  }
}

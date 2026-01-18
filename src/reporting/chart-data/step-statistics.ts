import { TestResult, StepStatistics } from '../../metrics/types';
import { StatisticsCalculator, isMeasurableResult } from '../statistics';

// Re-export StepStatistics from metrics/types for backward compatibility
export type { StepStatistics } from '../../metrics/types';

export interface StepResponseTime {
  step_name: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  response_times: number[];
  timeline_data: Array<{
    duration: number;
    timestamp: number;
    vu_id: number;
    iteration: number;
  }>;
}

export class StepStatisticsCalculator {
  static calculateStepStatistics(results: TestResult[]): StepStatistics[] {
    const measurableResults = results.filter(isMeasurableResult);
    const stepGroups: Record<string, TestResult[]> = {};

    measurableResults.forEach(result => {
      const key = `${result.scenario}-${result.step_name || 'default'}`;
      if (!stepGroups[key]) {
        stepGroups[key] = [];
      }
      stepGroups[key].push(result);
    });

    return Object.entries(stepGroups).map(([key, stepResults]) => {
      const [scenario, stepName] = key.split('-');
      const successfulResults = stepResults.filter(r => r.success);
      const failedResults = stepResults.filter(r => !r.success);
      const responseTimes = successfulResults.map(r => r.duration);

      const percentiles = StatisticsCalculator.calculatePercentiles(responseTimes, [50, 90, 95, 99, 99.9, 99.99]);

      const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

      // Build error distribution
      const error_distribution: Record<string, number> = {};
      failedResults.forEach(r => {
        const error = r.error || 'Unknown error';
        error_distribution[error] = (error_distribution[error] || 0) + 1;
      });

      // Build status distribution
      const status_distribution: Record<number, number> = {};
      stepResults.forEach(r => {
        if (r.status) {
          status_distribution[r.status] = (status_distribution[r.status] || 0) + 1;
        }
      });

      return {
        step_name: stepName,
        scenario: scenario,
        total_requests: stepResults.length,
        successful_requests: successfulResults.length,
        failed_requests: failedResults.length,
        success_rate: stepResults.length > 0 ? (successfulResults.length / stepResults.length) * 100 : 0,
        avg_response_time: responseTimes.length > 0 ?
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        min_response_time: minResponseTime,
        max_response_time: maxResponseTime,
        percentiles: percentiles,
        response_times: responseTimes,
        error_distribution,
        status_distribution
      };
    });
  }

  static calculateStepResponseTimes(results: TestResult[]): StepResponseTime[] {
    const stepGroups: Record<string, any[]> = {};

    results.forEach(result => {
      if (result.success && result.step_name) {
        const stepName = result.step_name;
        if (!stepGroups[stepName]) {
          stepGroups[stepName] = [];
        }
        stepGroups[stepName].push({
          duration: result.duration,
          timestamp: result.timestamp,
          vu_id: result.vu_id,
          iteration: result.iteration
        });
      }
    });

    return Object.entries(stepGroups).map(([stepName, stepData]) => {
      const responseTimes = stepData.map(item => item.duration);
      const avg = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const min = Math.min(...responseTimes);
      const max = Math.max(...responseTimes);

      const percentiles = StatisticsCalculator.calculatePercentiles(responseTimes, [50, 90, 95, 99]);

      const timelineData = stepData.sort((a, b) => a.timestamp - b.timestamp);

      return {
        step_name: stepName,
        count: responseTimes.length,
        avg: Math.round(avg * 100) / 100,
        min: min,
        max: max,
        p50: percentiles[50] || 0,
        p90: percentiles[90] || 0,
        p95: percentiles[95] || 0,
        p99: percentiles[99] || 0,
        response_times: responseTimes,
        timeline_data: timelineData
      };
    }).sort((a, b) => a.step_name.localeCompare(b.step_name));
  }
}

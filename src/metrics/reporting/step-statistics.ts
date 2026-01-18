import { TestResult, StepStatistics } from '../types';
import { StatisticsEngine } from '../core/statistics-engine';

export class StepStatisticsCalculator {
  private statisticsEngine: StatisticsEngine;

  constructor() {
    this.statisticsEngine = new StatisticsEngine();
  }

  calculate(results: TestResult[]): StepStatistics[] {
    const stepGroups = new Map<string, TestResult[]>();

    // Group results by step name and scenario
    results.forEach(result => {
      const key = `${result.scenario}:${result.step_name || result.action}`;
      if (!stepGroups.has(key)) {
        stepGroups.set(key, []);
      }
      stepGroups.get(key)!.push(result);
    });

    const stepStats: StepStatistics[] = [];

    for (const [key, groupResults] of stepGroups) {
      const [scenario, stepName] = key.split(':');
      const successfulResults = groupResults.filter(r => r.success);

      // Include ALL results (both successful and failed) for response time calculations
      const responseTimes = groupResults
        .map(r => r.response_time || r.duration || 0)
        .filter(rt => rt > 0);

      // Error distribution for this step
      const errorDistribution: Record<string, number> = {};
      groupResults.filter(r => !r.success).forEach(r => {
        const error = r.error || 'Unknown error';
        errorDistribution[error] = (errorDistribution[error] || 0) + 1;
      });

      // Status distribution for this step
      const statusDistribution: Record<number, number> = {};
      groupResults.forEach(r => {
        if (r.status) {
          statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
        }
      });

      stepStats.push({
        step_name: stepName,
        scenario: scenario,
        total_requests: groupResults.length,
        successful_requests: successfulResults.length,
        failed_requests: groupResults.length - successfulResults.length,
        success_rate: groupResults.length > 0 ? (successfulResults.length / groupResults.length) * 100 : 0,
        avg_response_time: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        min_response_time: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
        max_response_time: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
        percentiles: this.statisticsEngine.calculatePercentiles(responseTimes),
        response_times: responseTimes,
        error_distribution: errorDistribution,
        status_distribution: statusDistribution
      });
    }

    return stepStats.sort((a, b) => b.total_requests - a.total_requests);
  }
}

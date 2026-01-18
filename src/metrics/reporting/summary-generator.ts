import { MetricsSummary, TestResult, VUStartEvent, ErrorDetail } from '../types';
import { StatisticsEngine } from '../core/statistics-engine';
import { ErrorTracker } from '../core/error-tracker';
import { StepStatisticsCalculator } from './step-statistics';
import { TimelineCalculator } from './timeline-calculator';

export interface SummaryGeneratorDependencies {
  statisticsEngine: StatisticsEngine;
  errorTracker: ErrorTracker;
  results: TestResult[];
  vuStartEvents: VUStartEvent[];
  startTime: number;
}

export class SummaryGenerator {
  private stepStatisticsCalculator: StepStatisticsCalculator;
  private timelineCalculator: TimelineCalculator;

  constructor() {
    this.stepStatisticsCalculator = new StepStatisticsCalculator();
    this.timelineCalculator = new TimelineCalculator();
  }

  generate(deps: SummaryGeneratorDependencies): MetricsSummary {
    const {
      statisticsEngine,
      errorTracker,
      results,
      vuStartEvents,
      startTime
    } = deps;

    const stats = statisticsEngine.getStats();
    const durations = statisticsEngine.getDurations();
    const totalDurationMs = Date.now() - startTime;
    const totalDurationSec = totalDurationMs / 1000;

    // Error and status distributions
    const errorDistribution = errorTracker.getErrorDistribution(results);
    const statusDistribution = errorTracker.getStatusDistribution(results);

    // Response sizes
    const responseSizes = results
      .filter(r => r.response_size)
      .map(r => r.response_size!);

    return {
      total_requests: stats.totalRequests,
      successful_requests: stats.successfulRequests,
      failed_requests: stats.failedRequests,
      success_rate: statisticsEngine.getSuccessRate(),
      avg_response_time: statisticsEngine.getAverageResponseTime(),
      min_response_time: statisticsEngine.getMinDuration(),
      max_response_time: statisticsEngine.getMaxDuration(),
      percentiles: statisticsEngine.calculatePercentiles(durations),
      requests_per_second: totalDurationSec > 0 ? (stats.totalRequests / totalDurationSec) : 0,
      bytes_per_second: responseSizes.length > 0 && totalDurationSec > 0
        ? (responseSizes.reduce((a, b) => a + b, 0) / totalDurationSec) : 0,
      total_duration: totalDurationMs,  // Store in milliseconds for consistency
      error_distribution: errorDistribution,
      status_distribution: statusDistribution,
      error_details: errorTracker.getErrorDetails(),
      step_statistics: this.stepStatisticsCalculator.calculate(results),
      vu_ramp_up: vuStartEvents,
      timeline_data: this.timelineCalculator.calculate(results, vuStartEvents, startTime)
    };
  }
}

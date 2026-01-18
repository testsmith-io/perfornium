import { TestResult } from '../../metrics/types';
import { StatisticsCalculator } from '../statistics';

export interface RequestsPerSecond {
  timestamp: string;
  requests_per_second: number;
  successful_requests_per_second: number;
}

export interface ResponsesPerSecond {
  timestamp: string;
  responses_per_second: number;
  total_responses_per_second: number;
  error_responses_per_second: number;
}

export class ThroughputCalculator {
  static calculateRequestsPerSecondData(results: TestResult[]): RequestsPerSecond[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 1000);

    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      requests_per_second: group.count,
      successful_requests_per_second: group.count - group.errors
    }));
  }

  static calculateResponsesPerSecondData(results: TestResult[]): ResponsesPerSecond[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 1000);

    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      responses_per_second: group.count - group.errors,
      total_responses_per_second: group.count,
      error_responses_per_second: group.errors
    }));
  }
}

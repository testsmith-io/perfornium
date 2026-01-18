import { TestResult } from '../../metrics/types';
import { StatisticsCalculator } from '../statistics';

export interface ScenarioData {
  name: string;
  total: number;
  success: number;
  errors: number;
  avgResponseTime: number;
  responseTimes: number[];
  successRate: number;
}

export interface ScenarioStatistics extends ScenarioData {
  percentiles: Record<number, number>;
  minResponseTime: number;
  maxResponseTime: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ChartData {
  responseTimes: Array<{
    timestamp: number;
    duration: number;
    scenario: string;
  }>;
  errors: Array<{
    timestamp: number;
    error: string;
    scenario: string;
  }>;
  scenarios: ScenarioData[];
}

export class ScenarioCalculator {
  static groupByScenario(results: TestResult[]): ScenarioData[] {
    const scenarios: Record<string, ScenarioData> = {};

    results.forEach(result => {
      if (!scenarios[result.scenario]) {
        scenarios[result.scenario] = {
          name: result.scenario,
          total: 0,
          success: 0,
          errors: 0,
          avgResponseTime: 0,
          responseTimes: [],
          successRate: 0
        };
      }

      const scenario = scenarios[result.scenario];
      scenario.total++;

      if (result.success) {
        scenario.success++;
        scenario.responseTimes.push(result.duration);
      } else {
        scenario.errors++;
      }
    });

    Object.values(scenarios).forEach((scenario: ScenarioData) => {
      if (scenario.responseTimes.length > 0) {
        scenario.avgResponseTime = scenario.responseTimes.reduce((a: number, b: number) => a + b, 0) / scenario.responseTimes.length;
      }
      scenario.successRate = scenario.total > 0 ? (scenario.success / scenario.total) * 100 : 0;
    });

    return Object.values(scenarios);
  }

  static prepareChartData(results: TestResult[]): ChartData {
    const responseTimes = results
      .filter(r => r.success)
      .map(r => ({
        timestamp: r.timestamp,
        duration: r.duration,
        scenario: r.scenario
      }));

    const errors = results
      .filter(r => !r.success)
      .map(r => ({
        timestamp: r.timestamp,
        error: r.error || 'Unknown error',
        scenario: r.scenario
      }));

    return {
      responseTimes,
      errors,
      scenarios: ScenarioCalculator.groupByScenario(results)
    };
  }

  static calculateScenarioStatistics(results: TestResult[]): ScenarioStatistics[] {
    const scenarioGroups = ScenarioCalculator.groupByScenario(results);

    return scenarioGroups.map((scenario: ScenarioData) => {
      const percentiles = StatisticsCalculator.calculatePercentiles(scenario.responseTimes, [50, 90, 95, 99]);

      return {
        ...scenario,
        percentiles,
        minResponseTime: scenario.responseTimes.length > 0 ? Math.min(...scenario.responseTimes) : 0,
        maxResponseTime: scenario.responseTimes.length > 0 ? Math.max(...scenario.responseTimes) : 0,
        p50: percentiles[50] || 0,
        p90: percentiles[90] || 0,
        p95: percentiles[95] || 0,
        p99: percentiles[99] || 0
      };
    });
  }
}

import {TestResult} from '../metrics/types';

export class StatisticsCalculator {
  /**
   * Calculate percentiles with enhanced precision for 99.9% and 99.99%
   */
  static calculatePercentiles(values: number[], percentiles: number[]): Record<number, number> {
    if (values.length === 0) return {};
    
    const sorted = [...values].sort((a, b) => a - b);
    const result: Record<number, number> = {};
    
    percentiles.forEach(p => {
      if (p === 100) {
        result[p] = sorted[sorted.length - 1];
      } else if (p === 0) {
        result[p] = sorted[0];
      } else {
        // Use linear interpolation for more accurate percentile calculation
        const index = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        
        if (lower === upper) {
          result[p] = sorted[lower];
        } else {
          const weight = index - lower;
          result[p] = sorted[lower] * (1 - weight) + sorted[upper] * weight;
        }
      }
      
      // Round to 2 decimal places for readability
      result[p] = Math.round(result[p] * 100) / 100;
    });
    
    return result;
  }

  /**
   * Calculate enhanced statistics including min, max, and extended percentiles
   */
  static calculateEnhancedStatistics(values: number[]): {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    percentiles: Record<number, number>;
  } {
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        percentiles: {}
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const mean = values.reduce((sum, val) => sum + val, 0) / count;
    const median = count % 2 === 0 
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];

    // Calculate standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    // Calculate extended percentiles
    const percentiles = this.calculatePercentiles(values, [50, 90, 95, 99, 99.9, 99.99]);

    return {
      count,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      percentiles
    };
  }

  static calculateThroughput(results: TestResult[], totalDurationMs: number): number {
    if (totalDurationMs <= 0) return 0;
    return (results.length / (totalDurationMs / 1000));
  }

  static calculateErrorRate(results: TestResult[]): number {
    if (results.length === 0) return 0;
    const errors = results.filter(r => !r.success).length;
    return (errors / results.length) * 100;
  }

  /**
   * Calculate aggregated Core Web Vitals statistics
   */
  static calculateWebVitalsStatistics(results: TestResult[]): {
    web_vitals_data?: any;
    vitals_score?: 'good' | 'needs-improvement' | 'poor';
    vitals_details?: any;
  } {
    const webVitalsResults = results.filter(r => r.custom_metrics?.web_vitals);
    
    if (webVitalsResults.length === 0) {
      return {};
    }

    // Aggregate all Web Vitals metrics
    const allVitals = {
      lcp: [] as number[],
      fid: [] as number[],
      cls: [] as number[],
      fcp: [] as number[],
      ttfb: [] as number[],
      tti: [] as number[],
      tbt: [] as number[],
      speedIndex: [] as number[]
    };

    // Collect all vitals data
    webVitalsResults.forEach(result => {
      const vitals = result.custom_metrics.web_vitals;
      if (vitals.lcp) allVitals.lcp.push(vitals.lcp);
      if (vitals.fid) allVitals.fid.push(vitals.fid);
      if (vitals.cls) allVitals.cls.push(vitals.cls);
      if (vitals.fcp) allVitals.fcp.push(vitals.fcp);
      if (vitals.ttfb) allVitals.ttfb.push(vitals.ttfb);
      if (vitals.tti) allVitals.tti.push(vitals.tti);
      if (vitals.tbt) allVitals.tbt.push(vitals.tbt);
      if (vitals.speedIndex) allVitals.speedIndex.push(vitals.speedIndex);
    });

    // Calculate averages for each metric
    const avgVitals: any = {};
    const vitalsDetails: any = {};
    
    Object.entries(allVitals).forEach(([metric, values]) => {
      if (values.length > 0) {
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        avgVitals[metric] = Math.round(avg * 100) / 100;

        // Determine score based on thresholds
        let score: 'good' | 'needs-improvement' | 'poor' = 'good';
        const thresholds = this.getWebVitalsThresholds(metric);
        
        if (thresholds) {
          if (avg <= thresholds.good) {
            score = 'good';
          } else if (avg <= thresholds.poor) {
            score = 'needs-improvement';
          } else {
            score = 'poor';
          }
        }

        vitalsDetails[metric] = {
          value: avgVitals[metric],
          score: score
        };
      }
    });

    // Calculate overall score
    const scores = Object.values(vitalsDetails).map((d: any) => d.score);
    const goodCount = scores.filter(s => s === 'good').length;
    const poorCount = scores.filter(s => s === 'poor').length;
    const totalCount = scores.length;

    let overallScore: 'good' | 'needs-improvement' | 'poor' = 'needs-improvement';
    if (totalCount === 0) {
      overallScore = 'needs-improvement';
    } else if (goodCount >= totalCount * 0.75) {
      overallScore = 'good';
    } else if (poorCount > totalCount * 0.25) {
      overallScore = 'poor';
    }

    return {
      web_vitals_data: avgVitals,
      vitals_score: overallScore,
      vitals_details: vitalsDetails
    };
  }

  /**
   * Calculate verification metrics statistics
   */
  static calculateVerificationStatistics(results: TestResult[]): any {
    const verificationResults = results.filter(r => r.custom_metrics?.verification_metrics);
    
    if (verificationResults.length === 0) {
      return null;
    }

    const metrics = verificationResults.map(r => r.custom_metrics.verification_metrics);
    const durations = metrics.map(m => m.duration);
    const successfulMetrics = metrics.filter(m => m.success);

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Duration = sortedDurations[Math.floor(sortedDurations.length * 0.95)];

    return {
      total_verifications: metrics.length,
      success_rate: successfulMetrics.length / metrics.length,
      average_duration: Math.round(avgDuration * 100) / 100,
      p95_duration: p95Duration,
      slowest_step: metrics.reduce((prev, current) => 
        prev.duration > current.duration ? prev : current
      ),
      fastest_step: metrics.reduce((prev, current) => 
        prev.duration < current.duration ? prev : current
      )
    };
  }

  /**
   * Get Web Vitals thresholds for scoring
   */
  private static getWebVitalsThresholds(metric: string): { good: number; poor: number } | null {
    const thresholds: Record<string, { good: number; poor: number }> = {
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      fcp: { good: 1800, poor: 3000 },
      ttfb: { good: 800, poor: 1800 },
      tti: { good: 3800, poor: 7300 },
      tbt: { good: 200, poor: 600 },
      speedIndex: { good: 3400, poor: 5800 }
    };

    return thresholds[metric] || null;
  }

  /**
   * Enhanced time-based grouping with configurable intervals
   */
  static groupResultsByTime(results: TestResult[], intervalMs: number = 5000): any[] {
    if (results.length === 0) return [];
    
    const startTime = Math.min(...results.map(r => r.timestamp));
    const endTime = Math.max(...results.map(r => r.timestamp));
    const groups: any[] = [];
    
    for (let time = startTime; time <= endTime; time += intervalMs) {
      const intervalResults = results.filter(r =>
        r.timestamp >= time && r.timestamp < time + intervalMs
      );
      
      const successfulResults = intervalResults.filter(r => r.success);
      const errorResults = intervalResults.filter(r => !r.success);
      
      // Calculate average response time for successful requests
      const avgResponseTime = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length
        : 0;
      
      // Count unique virtual users in this interval
      const uniqueVUs = new Set(intervalResults.map(r => r.vu_id)).size;
      
      groups.push({
        timestamp: time,
        time_label: new Date(time).toISOString(),
        count: intervalResults.length,
        successful_count: successfulResults.length,
        error_count: errorResults.length,
        errors: errorResults.length,
        success_rate: intervalResults.length > 0
          ? (successfulResults.length / intervalResults.length) * 100
          : 0,
        avg_response_time: Math.round(avgResponseTime * 100) / 100,
        throughput: intervalResults.length / (intervalMs / 1000), // requests per second
        requests_per_second: intervalResults.length / (intervalMs / 1000),
        concurrent_users: uniqueVUs,
        response_times: successfulResults.map(r => r.duration)
      });
    }
    
    return groups;
  }

  /**
   * Enhanced response time distribution with percentage calculation
   */
  static calculateResponseTimeDistribution(results: TestResult[], buckets: number = 15): any[] {
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) return [];
    
    const responseTimes = successfulResults.map(r => r.duration);
    const min = Math.min(...responseTimes);
    const max = Math.max(...responseTimes);
    const bucketSize = (max - min) / buckets;
    const distribution = [];
    
    for (let i = 0; i < buckets; i++) {
      const bucketStart = min + (i * bucketSize);
      const bucketEnd = min + ((i + 1) * bucketSize);
      const count = responseTimes.filter(time =>
        time >= bucketStart && (i === buckets - 1 ? time <= bucketEnd : time < bucketEnd)
      ).length;
      
      distribution.push({
        bucket: `${bucketStart.toFixed(0)}-${bucketEnd.toFixed(0)}ms`,
        bucket_start: Math.round(bucketStart * 100) / 100,
        bucket_end: Math.round(bucketEnd * 100) / 100,
        count,
        percentage: Math.round((count / responseTimes.length) * 10000) / 100 // 2 decimal places
      });
    }
    
    return distribution;
  }

  /**
   * Calculate throughput over time with different granularities
   */
  static calculateThroughputOverTime(results: TestResult[], intervalMs: number = 1000): any[] {
    const timeGroups = this.groupResultsByTime(results, intervalMs);
    
    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      total_requests_per_second: group.requests_per_second,
      successful_requests_per_second: group.successful_count / (intervalMs / 1000),
      error_requests_per_second: group.error_count / (intervalMs / 1000),
      concurrent_users: group.concurrent_users
    }));
  }

  /**
   * Calculate detailed step statistics with min, max, and extended percentiles
   */
  static calculateDetailedStepStatistics(results: TestResult[]): any[] {
    const stepGroups: Record<string, TestResult[]> = {};
    
    // Group results by step name and scenario
    results.forEach(result => {
      const key = `${result.scenario}_${result.step_name || 'default'}`;
      if (!stepGroups[key]) {
        stepGroups[key] = [];
      }
      stepGroups[key].push(result);
    });
    
    return Object.entries(stepGroups).map(([key, stepResults]) => {
      const [scenario, stepName] = key.split('_');
      const successfulResults = stepResults.filter(r => r.success);
      const responseTimes = successfulResults.map(r => r.duration);
      
      const stats = this.calculateEnhancedStatistics(responseTimes);
      
      return {
        step_name: stepName,
        scenario: scenario,
        total_requests: stepResults.length,
        successful_requests: successfulResults.length,
        failed_requests: stepResults.length - successfulResults.length,
        success_rate: stepResults.length > 0 ? (successfulResults.length / stepResults.length) * 100 : 0,
        
        // Enhanced statistics
        min_response_time: stats.min,
        max_response_time: stats.max,
        avg_response_time: stats.mean,
        median_response_time: stats.median,
        std_dev_response_time: stats.stdDev,
        
        // Extended percentiles
        percentiles: stats.percentiles,
        
        // Raw data for further analysis
        response_times: responseTimes,
        error_types: stepResults
          .filter(r => !r.success)
          .map(r => r.error || 'Unknown error')
          .reduce((acc: Record<string, number>, error) => {
            acc[error] = (acc[error] || 0) + 1;
            return acc;
          }, {})
      };
    }).sort((a, b) => a.step_name.localeCompare(b.step_name));
  }

  /**
   * Calculate response rate (successful responses) over time
   */
  static calculateResponseRateOverTime(results: TestResult[], intervalMs: number = 1000): any[] {
    const timeGroups = this.groupResultsByTime(results, intervalMs);
    
    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      successful_responses_per_second: group.successful_count / (intervalMs / 1000),
      total_responses_per_second: group.count / (intervalMs / 1000),
      error_responses_per_second: group.error_count / (intervalMs / 1000),
      success_rate: group.success_rate
    }));
  }

  /**
   * Calculate error distribution and patterns
   */
  static calculateErrorDistribution(results: TestResult[]): any {
    const errorResults = results.filter(r => !r.success);
    const totalErrors = errorResults.length;
    
    if (totalErrors === 0) {
      return {
        total_errors: 0,
        error_rate: 0,
        error_types: {},
        errors_over_time: []
      };
    }
    
    // Group errors by type
    const errorTypes = errorResults.reduce((acc: Record<string, number>, result) => {
      const errorType = result.error || 'Unknown error';
      acc[errorType] = (acc[errorType] || 0) + 1;
      return acc;
    }, {});
    
    // Calculate error percentage for each type
    const errorTypesWithPercentage = Object.entries(errorTypes).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / totalErrors) * 10000) / 100
    }));
    
    // Errors over time
    const errorsOverTime = this.groupResultsByTime(errorResults, 5000).map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      error_count: group.count,
      error_rate: group.count / 5 // errors per second (5000ms = 5s intervals)
    }));
    
    return {
      total_errors: totalErrors,
      error_rate: (totalErrors / results.length) * 100,
      error_types: errorTypesWithPercentage,
      errors_over_time: errorsOverTime
    };
  }

  /**
   * Calculate performance trends and patterns
   */
  static calculatePerformanceTrends(results: TestResult[]): any {
    const timeGroups = this.groupResultsByTime(results, 10000); // 10-second intervals
    
    if (timeGroups.length < 2) {
      return {
        trend: 'insufficient_data',
        response_time_trend: 0,
        throughput_trend: 0,
        success_rate_trend: 0
      };
    }
    
    // Calculate trends using linear regression (simplified)
    const calculateTrend = (values: number[]): number => {
      if (values.length < 2) return 0;
      
      const n = values.length;
      const sumX = values.reduce((sum, _, i) => sum + i, 0);
      const sumY = values.reduce((sum, val) => sum + val, 0);
      const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
      const sumXX = values.reduce((sum, _, i) => sum + (i * i), 0);

      return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    };
    
    const responseTimes = timeGroups.map(g => g.avg_response_time);
    const throughputs = timeGroups.map(g => g.throughput);
    const successRates = timeGroups.map(g => g.success_rate);
    
    return {
      response_time_trend: calculateTrend(responseTimes),
      throughput_trend: calculateTrend(throughputs),
      success_rate_trend: calculateTrend(successRates),
      data_points: timeGroups.length,
      analysis_period_ms: (timeGroups[timeGroups.length - 1].timestamp - timeGroups[0].timestamp)
    };
  }
}
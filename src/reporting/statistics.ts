import { TestResult } from '../metrics/types';
import {
  TIME_BUCKETS,
  PERCENTILES,
  APDEX_DEFAULTS,
  SLA_DEFAULTS,
  WEB_VITALS_THRESHOLDS,
  OUTLIER_DETECTION,
  CONFIDENCE_INTERVALS,
  HEATMAP,
  getResponseTime,
} from './constants';

// Commands that should be measured (verifications, waits, measurements)
// Actions like click, fill, press, goto, select are NOT measured
const MEASURABLE_COMMANDS = [
  'verify_exists', 'verify_visible', 'verify_text', 'verify_contains', 'verify_not_exists',
  'wait_for_selector', 'wait_for_text', 'wait_for_load_state',
  'measure_web_vitals', 'performance_audit',
  'network_idle', 'dom_ready'
];

/**
 * Check if a result should be included in statistics (only verifications/measurements)
 */
export function isMeasurableResult(result: TestResult): boolean {
  // If shouldRecord is explicitly set, use that
  if (result.shouldRecord === true) {
    return true;
  }
  if (result.shouldRecord === false) {
    return false;
  }

  // Check if the action/command is measurable
  const action = (result.action || result.step_name || '').toLowerCase();
  return MEASURABLE_COMMANDS.some(cmd => action.includes(cmd));
}

export interface ApdexScore {
  score: number;           // 0-1 scale
  satisfied: number;       // Count of satisfied requests
  tolerating: number;      // Count of tolerating requests
  frustrated: number;      // Count of frustrated requests
  total: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unacceptable';
}

export interface SLACompliance {
  passed: boolean;
  checks: SLACheck[];
  summary: string;
}

export interface SLACheck {
  name: string;
  target: number;
  actual: number;
  passed: boolean;
  unit: string;
}

export interface OutlierAnalysis {
  outliers: OutlierPoint[];
  outlierCount: number;
  outlierPercentage: number;
  lowerBound: number;
  upperBound: number;
  method: 'IQR' | 'Z-Score';
}

export interface OutlierPoint {
  value: number;
  timestamp: number;
  vu_id: number;
  step_name?: string;
  severity: 'mild' | 'extreme';
}

export interface ConfidenceInterval {
  mean: number;
  lower: number;
  upper: number;
  confidenceLevel: number;
  standardError: number;
  marginOfError: number;
}

export interface HeatmapData {
  data: number[][];          // 2D array [time_bucket][response_time_bucket]
  timeLabels: string[];      // X-axis labels
  responseTimeLabels: string[]; // Y-axis labels
  maxValue: number;
}

export class StatisticsCalculator {
  /**
   * Calculate percentiles using linear interpolation (consistent method)
   */
  static calculatePercentiles(values: number[], percentiles: number[] = PERCENTILES.EXTENDED): Record<number, number> {
    if (values.length === 0) return {};

    const sorted = [...values].sort((a, b) => a - b);
    const result: Record<number, number> = {};

    percentiles.forEach(p => {
      if (p === 100) {
        result[p] = sorted[sorted.length - 1];
      } else if (p === 0) {
        result[p] = sorted[0];
      } else {
        // Linear interpolation for accurate percentile calculation
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

      // Round to 2 decimal places
      result[p] = Math.round(result[p] * 100) / 100;
    });

    return result;
  }

  /**
   * Calculate Apdex (Application Performance Index) score
   * Industry-standard metric for user satisfaction
   * Only includes measurable results (verifications, not actions like click/fill)
   */
  static calculateApdexScore(
    results: TestResult[],
    satisfiedThreshold: number = APDEX_DEFAULTS.SATISFIED_THRESHOLD
  ): ApdexScore {
    // Filter to only include measurable results (verifications)
    const measurableResults = results.filter(isMeasurableResult);

    const toleratingThreshold = satisfiedThreshold * APDEX_DEFAULTS.TOLERATING_MULTIPLIER;

    let satisfied = 0;
    let tolerating = 0;
    let frustrated = 0;

    const successfulResults = measurableResults.filter(r => r.success);

    successfulResults.forEach(result => {
      const responseTime = getResponseTime(result);

      if (responseTime <= satisfiedThreshold) {
        satisfied++;
      } else if (responseTime <= toleratingThreshold) {
        tolerating++;
      } else {
        frustrated++;
      }
    });

    // Failed verifications are always frustrated
    frustrated += measurableResults.filter(r => !r.success).length;

    const total = measurableResults.length;
    const score = total > 0 ? (satisfied + (tolerating / 2)) / total : 0;

    // Rating based on Apdex score
    let rating: ApdexScore['rating'];
    if (score >= 0.94) rating = 'Excellent';
    else if (score >= 0.85) rating = 'Good';
    else if (score >= 0.70) rating = 'Fair';
    else if (score >= 0.50) rating = 'Poor';
    else rating = 'Unacceptable';

    return {
      score: Math.round(score * 1000) / 1000,
      satisfied,
      tolerating,
      frustrated,
      total,
      rating,
    };
  }

  /**
   * Check SLA compliance against defined thresholds
   * Only measures verifications, not actions like click/fill
   */
  static checkSLACompliance(
    results: TestResult[],
    slaConfig: Partial<typeof SLA_DEFAULTS> = {}
  ): SLACompliance {
    // Filter to only include measurable results (verifications)
    const measurableResults = results.filter(isMeasurableResult);

    const config = { ...SLA_DEFAULTS, ...slaConfig };
    const checks: SLACheck[] = [];

    // Success rate check (based on verifications only)
    const successRate = measurableResults.length > 0
      ? (measurableResults.filter(r => r.success).length / measurableResults.length) * 100
      : 0;
    checks.push({
      name: 'Success Rate',
      target: config.SUCCESS_RATE,
      actual: Math.round(successRate * 100) / 100,
      passed: successRate >= config.SUCCESS_RATE,
      unit: '%',
    });

    // Response time checks (based on verifications only)
    const responseTimes = measurableResults.filter(r => r.success).map(r => getResponseTime(r));

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      checks.push({
        name: 'Avg Response Time',
        target: config.AVG_RESPONSE_TIME,
        actual: Math.round(avgResponseTime * 100) / 100,
        passed: avgResponseTime <= config.AVG_RESPONSE_TIME,
        unit: 'ms',
      });

      const percentiles = this.calculatePercentiles(responseTimes, [95, 99]);

      checks.push({
        name: 'P95 Response Time',
        target: config.P95_RESPONSE_TIME,
        actual: percentiles[95] || 0,
        passed: (percentiles[95] || 0) <= config.P95_RESPONSE_TIME,
        unit: 'ms',
      });

      checks.push({
        name: 'P99 Response Time',
        target: config.P99_RESPONSE_TIME,
        actual: percentiles[99] || 0,
        passed: (percentiles[99] || 0) <= config.P99_RESPONSE_TIME,
        unit: 'ms',
      });
    }

    // Throughput check (based on measurable operations only)
    if (measurableResults.length > 0) {
      const timestamps = measurableResults.map(r => r.timestamp);
      const duration = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
      const throughput = duration > 0 ? measurableResults.length / duration : 0;

      checks.push({
        name: 'Throughput',
        target: config.MIN_REQUESTS_PER_SECOND,
        actual: Math.round(throughput * 100) / 100,
        passed: throughput >= config.MIN_REQUESTS_PER_SECOND,
        unit: 'req/s',
      });
    }

    const passed = checks.every(c => c.passed);
    const failedChecks = checks.filter(c => !c.passed);

    let summary: string;
    if (passed) {
      summary = 'All SLA targets met';
    } else {
      summary = `${failedChecks.length} SLA violation(s): ${failedChecks.map(c => c.name).join(', ')}`;
    }

    return { passed, checks, summary };
  }

  /**
   * Detect outliers using IQR method
   * Only analyzes measurable results (verifications, not actions like click/fill)
   */
  static detectOutliers(results: TestResult[]): OutlierAnalysis {
    // Filter to only measurable results, then filter to successful ones
    const measurableResults = results.filter(isMeasurableResult);
    const successfulResults = measurableResults.filter(r => r.success);
    if (successfulResults.length < 4) {
      return {
        outliers: [],
        outlierCount: 0,
        outlierPercentage: 0,
        lowerBound: 0,
        upperBound: 0,
        method: 'IQR',
      };
    }

    const responseTimes = successfulResults.map(r => getResponseTime(r));
    const sorted = [...responseTimes].sort((a, b) => a - b);

    // Calculate Q1, Q3, and IQR
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    // Calculate bounds
    const lowerBound = q1 - (OUTLIER_DETECTION.IQR_MULTIPLIER * iqr);
    const upperBound = q3 + (OUTLIER_DETECTION.IQR_MULTIPLIER * iqr);
    const extremeUpperBound = q3 + (OUTLIER_DETECTION.IQR_EXTREME_MULTIPLIER * iqr);

    const outliers: OutlierPoint[] = [];

    successfulResults.forEach(result => {
      const responseTime = getResponseTime(result);

      if (responseTime < lowerBound || responseTime > upperBound) {
        outliers.push({
          value: responseTime,
          timestamp: result.timestamp,
          vu_id: result.vu_id,
          step_name: result.step_name,
          severity: responseTime > extremeUpperBound ? 'extreme' : 'mild',
        });
      }
    });

    return {
      outliers: outliers.sort((a, b) => b.value - a.value), // Sort by value descending
      outlierCount: outliers.length,
      outlierPercentage: Math.round((outliers.length / successfulResults.length) * 10000) / 100,
      lowerBound: Math.max(0, Math.round(lowerBound * 100) / 100),
      upperBound: Math.round(upperBound * 100) / 100,
      method: 'IQR',
    };
  }

  /**
   * Calculate confidence interval for mean response time
   */
  static calculateConfidenceInterval(
    values: number[],
    confidenceLevel: number = CONFIDENCE_INTERVALS.DEFAULT_LEVEL
  ): ConfidenceInterval {
    if (values.length < 2) {
      const mean = values.length === 1 ? values[0] : 0;
      return {
        mean,
        lower: mean,
        upper: mean,
        confidenceLevel,
        standardError: 0,
        marginOfError: 0,
      };
    }

    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;

    // Calculate standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Standard error
    const standardError = stdDev / Math.sqrt(n);

    // Z-score for confidence level (approximation for large samples)
    // For 90%: 1.645, 95%: 1.96, 99%: 2.576
    let zScore: number;
    if (confidenceLevel >= 0.99) zScore = 2.576;
    else if (confidenceLevel >= 0.95) zScore = 1.96;
    else if (confidenceLevel >= 0.90) zScore = 1.645;
    else zScore = 1.96; // Default to 95%

    const marginOfError = zScore * standardError;

    return {
      mean: Math.round(mean * 100) / 100,
      lower: Math.round((mean - marginOfError) * 100) / 100,
      upper: Math.round((mean + marginOfError) * 100) / 100,
      confidenceLevel,
      standardError: Math.round(standardError * 100) / 100,
      marginOfError: Math.round(marginOfError * 100) / 100,
    };
  }

  /**
   * Generate heatmap data for response time over time visualization
   * Only includes measurable results (verifications, not actions like click/fill)
   */
  static generateHeatmapData(
    results: TestResult[],
    timeBuckets: number = HEATMAP.TIME_BUCKETS,
    responseTimeBuckets: number = HEATMAP.RESPONSE_TIME_BUCKETS
  ): HeatmapData {
    // Filter to only measurable results, then filter to successful ones
    const measurableResults = results.filter(isMeasurableResult);
    const successfulResults = measurableResults.filter(r => r.success);

    if (successfulResults.length === 0) {
      return {
        data: [],
        timeLabels: [],
        responseTimeLabels: [],
        maxValue: 0,
      };
    }

    const timestamps = successfulResults.map(r => r.timestamp);
    const responseTimes = successfulResults.map(r => getResponseTime(r));

    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const minRT = Math.min(...responseTimes);
    const maxRT = Math.max(...responseTimes);

    const timeRange = maxTime - minTime || 1;
    const rtRange = maxRT - minRT || 1;

    const timeBucketSize = timeRange / timeBuckets;
    const rtBucketSize = rtRange / responseTimeBuckets;

    // Initialize 2D array
    const data: number[][] = Array(responseTimeBuckets)
      .fill(null)
      .map(() => Array(timeBuckets).fill(0));

    // Populate heatmap
    successfulResults.forEach(result => {
      const timeBucket = Math.min(
        Math.floor((result.timestamp - minTime) / timeBucketSize),
        timeBuckets - 1
      );
      const rtBucket = Math.min(
        Math.floor((getResponseTime(result) - minRT) / rtBucketSize),
        responseTimeBuckets - 1
      );

      data[rtBucket][timeBucket]++;
    });

    // Generate labels
    const timeLabels: string[] = [];
    for (let i = 0; i < timeBuckets; i++) {
      const time = new Date(minTime + (i * timeBucketSize));
      timeLabels.push(time.toISOString().substr(11, 8)); // HH:MM:SS
    }

    const responseTimeLabels: string[] = [];
    for (let i = 0; i < responseTimeBuckets; i++) {
      const rt = minRT + (i * rtBucketSize);
      responseTimeLabels.push(`${Math.round(rt)}ms`);
    }

    const maxValue = Math.max(...data.flat());

    return { data, timeLabels, responseTimeLabels, maxValue };
  }

  /**
   * O(n) time-based grouping using Map-based bucketing
   * FIXED: Replaces O(n²) filter-based implementation
   */
  static groupResultsByTime(results: TestResult[], intervalMs: number = TIME_BUCKETS.MEDIUM): any[] {
    if (results.length === 0) return [];

    // Find time range
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const r of results) {
      if (r.timestamp < minTime) minTime = r.timestamp;
      if (r.timestamp > maxTime) maxTime = r.timestamp;
    }

    // Single pass: bucket all results
    const buckets = new Map<number, TestResult[]>();

    for (const result of results) {
      const bucketKey = Math.floor((result.timestamp - minTime) / intervalMs) * intervalMs + minTime;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(result);
    }

    // Convert buckets to output format
    const groups: any[] = [];

    // Sort bucket keys for chronological order
    const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const timestamp of sortedKeys) {
      const intervalResults = buckets.get(timestamp)!;
      const successfulResults = intervalResults.filter(r => r.success);
      const errorResults = intervalResults.filter(r => !r.success);

      // Calculate average response time using standardized field
      const avgResponseTime = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + getResponseTime(r), 0) / successfulResults.length
        : 0;

      // Count unique virtual users
      const uniqueVUs = new Set(intervalResults.map(r => r.vu_id)).size;

      groups.push({
        timestamp,
        time_label: new Date(timestamp).toISOString(),
        count: intervalResults.length,
        successful_count: successfulResults.length,
        error_count: errorResults.length,
        errors: errorResults.length,
        success_rate: intervalResults.length > 0
          ? (successfulResults.length / intervalResults.length) * 100
          : 0,
        avg_response_time: Math.round(avgResponseTime * 100) / 100,
        throughput: intervalResults.length / (intervalMs / 1000),
        requests_per_second: intervalResults.length / (intervalMs / 1000),
        concurrent_users: uniqueVUs,
        response_times: successfulResults.map(r => getResponseTime(r)),
      });
    }

    return groups;
  }

  /**
   * Calculate enhanced statistics including all metrics
   */
  static calculateEnhancedStatistics(values: number[]): {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    percentiles: Record<number, number>;
    confidenceInterval: ConfidenceInterval;
  } {
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        percentiles: {},
        confidenceInterval: {
          mean: 0,
          lower: 0,
          upper: 0,
          confidenceLevel: 0.95,
          standardError: 0,
          marginOfError: 0,
        },
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

    // Calculate percentiles using consistent method
    const percentiles = this.calculatePercentiles(values, PERCENTILES.EXTENDED);

    // Calculate confidence interval
    const confidenceInterval = this.calculateConfidenceInterval(values);

    return {
      count,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      percentiles,
      confidenceInterval,
    };
  }

  static calculateThroughput(results: TestResult[], totalDurationMs: number): number {
    if (totalDurationMs <= 0) return 0;
    return results.length / (totalDurationMs / 1000);
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

    const allVitals: Record<string, number[]> = {
      lcp: [],
      fid: [],
      cls: [],
      fcp: [],
      ttfb: [],
      tti: [],
      tbt: [],
      speedIndex: [],
      inp: [],
    };

    webVitalsResults.forEach(result => {
      const vitals = result.custom_metrics!.web_vitals;
      Object.keys(allVitals).forEach(key => {
        if (vitals[key] !== undefined) {
          allVitals[key].push(vitals[key]);
        }
      });
    });

    const avgVitals: any = {};
    const vitalsDetails: any = {};

    Object.entries(allVitals).forEach(([metric, values]) => {
      if (values.length > 0) {
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        avgVitals[metric] = Math.round(avg * 100) / 100;

        const thresholdKey = metric.toUpperCase().replace('SPEEDINDEX', 'SPEED_INDEX') as keyof typeof WEB_VITALS_THRESHOLDS;
        const thresholds = WEB_VITALS_THRESHOLDS[thresholdKey];

        let score: 'good' | 'needs-improvement' | 'poor' = 'good';
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
          score,
          p50: this.calculatePercentiles(values, [50])[50],
          p95: this.calculatePercentiles(values, [95])[95],
        };
      }
    });

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
      vitals_details: vitalsDetails,
    };
  }

  /**
   * Enhanced response time distribution with adaptive bucketing
   * Only includes measurable results (verifications, not actions like click/fill)
   */
  static calculateResponseTimeDistribution(results: TestResult[], targetBuckets: number = 10): any[] {
    // Filter to only measurable results, then filter to successful ones
    const measurableResults = results.filter(isMeasurableResult);
    const successfulResults = measurableResults.filter(r => r.success);
    if (successfulResults.length === 0) return [];

    const responseTimes = successfulResults.map(r => getResponseTime(r));
    const min = Math.min(...responseTimes);
    const max = Math.max(...responseTimes);
    const range = max - min;

    if (range < 1) {
      return [{
        bucket: `${Math.round(min)}ms`,
        bucket_start: min,
        bucket_end: max,
        count: responseTimes.length,
        percentage: 100,
      }];
    }

    // Calculate ideal bucket size based on range
    let bucketSize = range / targetBuckets;

    // Round to nice numbers
    if (bucketSize < 1) bucketSize = 1;
    else if (bucketSize < 2) bucketSize = 2;
    else if (bucketSize < 5) bucketSize = 5;
    else if (bucketSize < 10) bucketSize = 10;
    else if (bucketSize < 25) bucketSize = 25;
    else if (bucketSize < 50) bucketSize = 50;
    else if (bucketSize < 100) bucketSize = 100;
    else if (bucketSize < 250) bucketSize = 250;
    else if (bucketSize < 500) bucketSize = 500;
    else if (bucketSize < 1000) bucketSize = 1000;
    else bucketSize = Math.ceil(bucketSize / 1000) * 1000;

    const bucketStart = Math.floor(min / bucketSize) * bucketSize;
    const bucketEnd = Math.ceil(max / bucketSize) * bucketSize;
    const numBuckets = Math.max(1, Math.round((bucketEnd - bucketStart) / bucketSize));

    const distribution = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = bucketStart + (i * bucketSize);
      const end = start + bucketSize;
      const count = responseTimes.filter(time =>
        time >= start && (i === numBuckets - 1 ? time <= end : time < end)
      ).length;

      distribution.push({
        bucket: `${Math.round(start)}-${Math.round(end)}ms`,
        bucket_start: start,
        bucket_end: end,
        count,
        percentage: Math.round((count / responseTimes.length) * 10000) / 100,
      });
    }

    return distribution;
  }

  /**
   * Calculate detailed step statistics (single source of truth)
   * Only includes measurable results (verifications, waits, measurements)
   * Excludes actions like click, fill, press, goto, select
   */
  static calculateDetailedStepStatistics(results: TestResult[]): any[] {
    // Filter to only include measurable results
    const measurableResults = results.filter(isMeasurableResult);

    // O(n) grouping using Map
    const stepGroups = new Map<string, TestResult[]>();

    for (const result of measurableResults) {
      const key = `${result.scenario}_${result.step_name || 'default'}`;
      if (!stepGroups.has(key)) {
        stepGroups.set(key, []);
      }
      stepGroups.get(key)!.push(result);
    }

    return Array.from(stepGroups.entries()).map(([key, stepResults]) => {
      const parts = key.split('_');
      const scenario = parts[0];
      const stepName = parts.slice(1).join('_') || 'default';

      const successfulResults = stepResults.filter(r => r.success);
      const responseTimes = successfulResults.map(r => getResponseTime(r));

      const stats = this.calculateEnhancedStatistics(responseTimes);

      // Error type distribution
      const errorTypes: Record<string, number> = {};
      stepResults.filter(r => !r.success).forEach(r => {
        const errorType = r.error || 'Unknown error';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      });

      return {
        step_name: stepName,
        scenario,
        total_requests: stepResults.length,
        successful_requests: successfulResults.length,
        failed_requests: stepResults.length - successfulResults.length,
        success_rate: stepResults.length > 0
          ? Math.round((successfulResults.length / stepResults.length) * 10000) / 100
          : 0,
        min_response_time: stats.min,
        max_response_time: stats.max,
        avg_response_time: stats.mean,
        median_response_time: stats.median,
        std_dev_response_time: stats.stdDev,
        percentiles: stats.percentiles,
        confidence_interval: stats.confidenceInterval,
        response_times: responseTimes,
        error_types: errorTypes,
      };
    }).sort((a, b) => a.step_name.localeCompare(b.step_name));
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
        error_types: [],
        errors_over_time: [],
      };
    }

    // Group errors by type using Map for O(n)
    const errorCounts = new Map<string, number>();
    for (const result of errorResults) {
      const errorType = result.error || 'Unknown error';
      errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
    }

    const errorTypesWithPercentage = Array.from(errorCounts.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / totalErrors) * 10000) / 100,
    }));

    // Errors over time
    const errorsOverTime = this.groupResultsByTime(errorResults, TIME_BUCKETS.MEDIUM).map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      error_count: group.count,
      error_rate: group.count / (TIME_BUCKETS.MEDIUM / 1000),
    }));

    return {
      total_errors: totalErrors,
      error_rate: Math.round((totalErrors / results.length) * 10000) / 100,
      error_types: errorTypesWithPercentage,
      errors_over_time: errorsOverTime,
    };
  }

  /**
   * Calculate performance trends using linear regression
   * Only analyzes measurable results (verifications, not actions like click/fill)
   */
  static calculatePerformanceTrends(results: TestResult[]): any {
    // Filter to only measurable results
    const measurableResults = results.filter(isMeasurableResult);
    const timeGroups = this.groupResultsByTime(measurableResults, TIME_BUCKETS.COARSE);

    if (timeGroups.length < 2) {
      return {
        trend: 'insufficient_data',
        response_time_trend: 0,
        throughput_trend: 0,
        success_rate_trend: 0,
      };
    }

    const calculateTrend = (values: number[]): number => {
      if (values.length < 2) return 0;

      const n = values.length;
      const sumX = values.reduce((sum, _, i) => sum + i, 0);
      const sumY = values.reduce((sum, val) => sum + val, 0);
      const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
      const sumXX = values.reduce((sum, _, i) => sum + (i * i), 0);

      const denominator = n * sumXX - sumX * sumX;
      if (denominator === 0) return 0;

      return (n * sumXY - sumX * sumY) / denominator;
    };

    const responseTimes = timeGroups.map(g => g.avg_response_time);
    const throughputs = timeGroups.map(g => g.throughput);
    const successRates = timeGroups.map(g => g.success_rate);

    const rtTrend = calculateTrend(responseTimes);
    const tpTrend = calculateTrend(throughputs);
    const srTrend = calculateTrend(successRates);

    // Determine overall trend direction
    let trend: string;
    if (rtTrend > 0.1) trend = 'degrading';
    else if (rtTrend < -0.1) trend = 'improving';
    else trend = 'stable';

    return {
      trend,
      response_time_trend: Math.round(rtTrend * 1000) / 1000,
      throughput_trend: Math.round(tpTrend * 1000) / 1000,
      success_rate_trend: Math.round(srTrend * 1000) / 1000,
      data_points: timeGroups.length,
      analysis_period_ms: timeGroups[timeGroups.length - 1].timestamp - timeGroups[0].timestamp,
    };
  }

  /**
   * Get comprehensive analysis of test results
   */
  static getComprehensiveAnalysis(results: TestResult[], slaConfig?: Partial<typeof SLA_DEFAULTS>): {
    apdex: ApdexScore;
    sla: SLACompliance;
    outliers: OutlierAnalysis;
    trends: any;
    heatmap: HeatmapData;
  } {
    return {
      apdex: this.calculateApdexScore(results),
      sla: this.checkSLACompliance(results, slaConfig),
      outliers: this.detectOutliers(results),
      trends: this.calculatePerformanceTrends(results),
      heatmap: this.generateHeatmapData(results),
    };
  }
}

import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { TestResult, MetricsSummary } from '../metrics/types';
import { logger } from '../utils/logger';
import { FileManager } from '../utils/file-manager';
import { StatisticsCalculator } from './statistics';

export interface HTMLReportConfig {
  title?: string;
  description?: string;
  includeCharts?: boolean;
  includeTimeline?: boolean;
  includeErrorDetails?: boolean;
  includeResponseTimes?: boolean;
  templatePath?: string;
  assetsInline?: boolean; // Embed CSS/JS directly in HTML
  darkMode?: boolean;
}

export interface HTMLReportData {
  testName: string;
  summary: MetricsSummary;
  results?: TestResult[];
  config?: any;
  metadata?: {
    generated_at: string;
    generated_by: string;
    test_duration: string;
    [key: string]: any;
  };
}

export class EnhancedHTMLReportGenerator {
  private config: HTMLReportConfig;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  private readonly DEFAULT_CONFIG: HTMLReportConfig = {
    title: 'Perfornium Load Test Report',
    description: 'Performance test results and analysis',
    includeCharts: true,
    includeTimeline: true,
    includeErrorDetails: true,
    includeResponseTimes: true,
    assetsInline: true,
    darkMode: false
  };

  constructor(config?: HTMLReportConfig) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.setupHandlebarsHelpers();
  }

  private setupHandlebarsHelpers(): void {
    // Number formatting helpers
    Handlebars.registerHelper('round', (num: number, decimals: number = 2) => {
      return typeof num === 'number' ? num.toFixed(decimals) : '0';
    });

    Handlebars.registerHelper('formatNumber', (num: number) => {
      return typeof num === 'number' ? num.toLocaleString() : '0';
    });

    // Percentage helper
    Handlebars.registerHelper('percent', (num: number, total: number) => {
      if (!total || total === 0) return '0%';
      return ((num / total) * 100).toFixed(1) + '%';
    });

    // Status class helper
    Handlebars.registerHelper('statusClass', (success: boolean) => {
      return success ? 'success' : 'error';
    });

    // Duration formatting
    Handlebars.registerHelper('formatDuration', (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ${seconds % 60}s`;
    });

    // Date formatting
    Handlebars.registerHelper('formatDate', (timestamp: number) => {
      return new Date(timestamp).toLocaleString();
    });

    // JSON helper
    Handlebars.registerHelper('json', (obj: any) => {
      return JSON.stringify(obj, null, 2);
    });

    // Chart data helper
    Handlebars.registerHelper('chartData', (data: any[]) => {
      return JSON.stringify(data);
    });

    // Core Web Vitals score class helper
    Handlebars.registerHelper('vitalsScoreClass', (score: string) => {
      switch (score) {
        case 'good': return 'vitals-good';
        case 'needs-improvement': return 'vitals-warning';
        case 'poor': return 'vitals-poor';
        default: return 'vitals-unknown';
      }
    });

    // Web Vitals metric formatting
    Handlebars.registerHelper('formatVitalsMetric', (value: number, metric: string) => {
      if (typeof value !== 'number') return 'N/A';
      
      switch (metric) {
        case 'cls':
          return value.toFixed(3);
        case 'lcp':
        case 'inp':
        case 'fid':
        case 'fcp':
        case 'ttfb':
        case 'tti':
        case 'tbt':
        case 'speedIndex':
          return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`;
        default:
          return value.toFixed(2);
      }
    });

    // Verification metrics helper
    Handlebars.registerHelper('formatVerificationDuration', (duration: number) => {
      if (typeof duration !== 'number') return 'N/A';
      return duration < 1000 ? `${Math.round(duration)}ms` : `${(duration / 1000).toFixed(2)}s`;
    });

    // String comparison helper
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (String(arg1) === String(arg2)) ? options.fn(this) : options.inverse(this);
    });

    // Additional helpers needed by the template
    Handlebars.registerHelper('toFixed', function (num: number, digits: number) {
      return typeof num === 'number' ? num.toFixed(digits) : '0';
    });

    Handlebars.registerHelper('percent', function (num: number, digits: number) {
      return typeof num === 'number' ? num.toFixed(digits) : '0';
    });

    Handlebars.registerHelper('lookup', function (obj: any, key: any) {
      return obj && obj[key] !== undefined ? obj[key] : 0;
    });
  }

  async generate(data: HTMLReportData, filePath: string): Promise<string> {
    try {
      // Process file path template
      const processedPath = FileManager.processFilePath(filePath, {
        vu_id: 0,
        iteration: 0,
        variables: { test_name: data.testName },
        extracted_data: {}
      });

      // Prepare enhanced data for template
      const enhancedData = this.prepareReportData(data);

      // Load and compile template
      const template = await this.loadTemplate();

      // Generate HTML
      const html = template(enhancedData);

      // Write to file
      FileManager.createTimestampedFile(processedPath, html);

      logger.success(`📋 HTML report generated: ${processedPath}`);
      return processedPath;

    } catch (error) {
      logger.error('❌ Failed to generate HTML report:', error);
      throw error;
    }
  }

  private prepareReportData(data: HTMLReportData): any {
    const now = Date.now();
    const startTime = data.metadata?.test_start ? new Date(data.metadata.test_start).getTime() : now - 60000;
    
    // Calculate enhanced statistics if results are available
    const enhancedSummary = { ...data.summary };
    if (data.results && data.results.length > 0) {
      // Add Web Vitals statistics
      const webVitalsStats = StatisticsCalculator.calculateWebVitalsStatistics(data.results);
      Object.assign(enhancedSummary, webVitalsStats);

      // Add verification statistics
      const verificationStats = StatisticsCalculator.calculateVerificationStatistics(data.results);
      if (verificationStats) {
        enhancedSummary.verification_metrics = verificationStats;
      }

      // Calculate step statistics if not already provided (e.g., for distributed tests)
      if (!enhancedSummary.step_statistics || enhancedSummary.step_statistics.length === 0) {
        enhancedSummary.step_statistics = this.calculateStepStatistics(data.results);
      }
    }
    
    // Check if this is a Playwright-based test
    const hasWebVitals = data.results?.some(r => r.custom_metrics?.web_vitals) || enhancedSummary.web_vitals_data;
    const isPlaywrightTest = data.results?.some(r => r.scenario?.includes('web') || r.action?.includes('goto') || r.action?.includes('verify')) || hasWebVitals;
    
    
    // Prepare data in the format expected by the template
    const charts = this.config.includeCharts ? this.prepareChartData(data) : null;
    const timeline = this.config.includeTimeline ? this.prepareTimelineData(data) : null;
    const responseTimeAnalysis = this.config.includeResponseTimes ? this.prepareResponseTimeAnalysis(data) : null;

    const generatedAt = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return {
      ...data,
      summary: enhancedSummary,
      config: this.config,
      metadata: {
        generated_at: new Date().toISOString(),
        generated_by: 'Perfornium Enhanced HTML Generator',
        test_duration: this.formatDuration(now - startTime),
        ...data.metadata
      },
      charts,
      timeline,
      errorAnalysis: this.config.includeErrorDetails ? this.prepareErrorAnalysis(data) : null,
      responseTimeAnalysis,
      webVitalsCharts: isPlaywrightTest ? this.prepareWebVitalsCharts(data) : null,
      isPlaywrightTest,

      // Template-specific data variables (for compatibility with enhanced-report.hbs)
      generatedAt, // Human-readable date for template header
      summaryData: JSON.stringify(enhancedSummary),
      stepStatistics: enhancedSummary.step_statistics || [], // Direct array for {{#each}} iteration
      stepStatisticsData: JSON.stringify(enhancedSummary.step_statistics || []),
      vuRampupData: JSON.stringify(timeline?.vuRampup || []),
      timelineData: JSON.stringify(timeline?.data || []),
      responseTimeDistributionData: JSON.stringify(charts?.responseTimeHistogram?.data || []),
      requestsPerSecondData: JSON.stringify(timeline?.requestsPerSecond || []),
      responsesPerSecondData: JSON.stringify(timeline?.responsesPerSecond || []),
      stepResponseTimesData: JSON.stringify(responseTimeAnalysis?.stepResponseTimes || []),
      stepResponseTimes: responseTimeAnalysis?.stepResponseTimes || [], // Direct access for iteration in template
      connectTimeData: JSON.stringify(timeline?.connectTimeData || []),
      latencyData: JSON.stringify(timeline?.latencyData || [])
    };
  }

  private prepareChartData(data: HTMLReportData): any {
    const summary = data.summary;
    
    return {
      // Success/Failure pie chart
      successFailure: {
        labels: ['Successful', 'Failed'],
        data: [summary.successful_requests, summary.failed_requests],
        colors: ['#4CAF50', '#F44336']
      },
      
      // Response time distribution
      responseTimeHistogram: this.createResponseTimeHistogram(data.results || []),
      
      // Status codes distribution
      statusCodes: {
        labels: Object.keys(summary.status_distribution || {}),
        data: Object.values(summary.status_distribution || {}),
        colors: this.generateColors(Object.keys(summary.status_distribution || {}).length)
      },
      
      // Percentiles
      percentiles: {
        labels: Object.keys(summary.percentiles || {}),
        data: Object.values(summary.percentiles || {}),
        colors: ['#2196F3']
      }
    };
  }

  private prepareTimelineData(data: HTMLReportData): any {
    if (!data.results || data.results.length === 0) return null;

    const results = data.results.sort((a, b) => a.timestamp - b.timestamp);
    const startTime = results[0].timestamp;

    // Get VU ramp-up events from summary
    const vuRampUpEvents = data.summary.vu_ramp_up || [];

    // Group results by time buckets (every 5 seconds)
    const bucketSize = 5000; // 5 seconds
    const buckets: Map<number, TestResult[]> = new Map();

    results.forEach(result => {
      const bucketKey = Math.floor((result.timestamp - startTime) / bucketSize) * bucketSize;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(result);
    });

    // Create timeline data with active VUs
    const timelineData = Array.from(buckets.entries()).map(([time, bucketResults]) => {
      const successfulResults = bucketResults.filter(r => r.success);
      const successful = successfulResults.length;
      const failed = bucketResults.filter(r => !r.success).length;

      // Calculate average response time for SUCCESSFUL requests only
      const avgResponseTime = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + (r.response_time || r.duration || 0), 0) / successfulResults.length
        : 0;

      // Calculate average connect time and latency (from successful requests only)
      const connectTimes = successfulResults.map(r => r.connect_time || 0).filter(ct => ct > 0);
      const avgConnectTime = connectTimes.length > 0
        ? connectTimes.reduce((sum, ct) => sum + ct, 0) / connectTimes.length
        : 0;

      const latencies = successfulResults.map(r => r.latency || 0).filter(l => l > 0);
      const avgLatency = latencies.length > 0
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
        : 0;

      // Calculate active VUs at this time point
      const currentTime = startTime + time;
      let activeVUs: number;

      if (vuRampUpEvents.length > 0) {
        // Count VUs that started before or at this time point (real data from workers)
        activeVUs = vuRampUpEvents.filter(vu => vu.start_time <= currentTime).length;
      } else {
        // Fallback: count unique VU IDs from results up to this time
        const resultsUpToNow = results.filter(r => r.timestamp <= currentTime);
        activeVUs = new Set(resultsUpToNow.map(r => r.vu_id)).size;
      }

      // Calculate success rate
      const successRate = bucketResults.length > 0
        ? (successful / bucketResults.length) * 100
        : 0;

      return {
        time: time / 1000, // Convert to seconds
        timestamp: startTime + time,
        successful,
        failed,
        total: bucketResults.length,
        avg_response_time: Math.round(avgResponseTime), // snake_case for template
        avgResponseTime: Math.round(avgResponseTime),    // camelCase for backwards compatibility
        avg_connect_time: Math.round(avgConnectTime),
        avgConnectTime: Math.round(avgConnectTime),
        avg_latency: Math.round(avgLatency),
        avgLatency: Math.round(avgLatency),
        throughput: bucketResults.length / (bucketSize / 1000), // req/s
        active_vus: activeVUs,
        success_rate: successRate
      };
    });

    // Aggregate VU ramp-up by time buckets
    const vuRampupBuckets: Map<number, number> = new Map();
    vuRampUpEvents.forEach(vu => {
      const bucketKey = Math.floor((vu.start_time - startTime) / bucketSize) * bucketSize;
      vuRampupBuckets.set(bucketKey, (vuRampupBuckets.get(bucketKey) || 0) + 1);
    });

    // Create cumulative VU count for chart as a time series
    // Shows VUs ramping up AND staying active throughout the test
    // For distributed tests, use the total_virtual_users from summary (which accounts for all workers)
    const summaryAny = data.summary as any;
    const totalVUs = summaryAny.total_virtual_users
      || summaryAny.peak_virtual_users
      || (vuRampUpEvents.length > 0 ? vuRampUpEvents.length : new Set(results.map(r => r.vu_id)).size);

    const vuRampupCumulative: Array<{time: number, timestamp: number, count: number}> = [];

    // Determine test time range
    const testStartTime = vuRampUpEvents.length > 0
      ? Math.min(...vuRampUpEvents.map(vu => vu.start_time))
      : startTime;
    const testEndTime = results.length > 0
      ? Math.max(...results.map(r => r.timestamp))
      : testStartTime + 60000; // Default 60s if no results

    // Create time buckets for the entire test duration (1 second intervals)
    const timeInterval = 1000; // 1 second
    const sortedVUEvents = vuRampUpEvents.length > 0
      ? [...vuRampUpEvents].sort((a, b) => a.start_time - b.start_time)
      : [];

    for (let t = testStartTime; t <= testEndTime; t += timeInterval) {
      let activeVUs: number;

      if (sortedVUEvents.length > 0) {
        // Count VUs that have started by this time (real data from workers)
        activeVUs = sortedVUEvents.filter(vu => vu.start_time <= t).length;
      } else {
        // Fallback: count unique VU IDs from results up to this time
        const resultsUpToNow = results.filter(r => r.timestamp <= t);
        activeVUs = new Set(resultsUpToNow.map(r => r.vu_id)).size;
      }

      vuRampupCumulative.push({
        time: (t - testStartTime) / 1000,
        timestamp: t,
        count: Math.min(activeVUs, totalVUs)
      });
    }

    // Prepare requests per second data with all required fields
    const requestsPerSecondData = timelineData.map(d => ({
      timestamp: d.timestamp,
      requests_per_second: d.total / (bucketSize / 1000),
      successful_requests_per_second: d.successful / (bucketSize / 1000),
      error_requests_per_second: d.failed / (bucketSize / 1000)
    }));

    // Prepare responses per second data with all required fields
    const responsesPerSecondData = timelineData.map(d => ({
      timestamp: d.timestamp,
      responses_per_second: d.successful / (bucketSize / 1000),
      error_responses_per_second: d.failed / (bucketSize / 1000)
    }));

    // Prepare connect time data
    const connectTimeData = timelineData.map(d => ({
      timestamp: d.timestamp,
      time: d.time,
      avg_connect_time: d.avg_connect_time
    }));

    // Prepare latency data
    const latencyData = timelineData.map(d => ({
      timestamp: d.timestamp,
      time: d.time,
      avg_latency: d.avg_latency
    }));

    return {
      data: timelineData,
      labels: timelineData.map(d => `${d.time}s`),
      successful: timelineData.map(d => d.successful),
      failed: timelineData.map(d => d.failed),
      responseTime: timelineData.map(d => d.avgResponseTime),
      throughput: timelineData.map(d => d.throughput),
      activeVUs: timelineData.map(d => d.active_vus),
      connectTime: timelineData.map(d => d.avgConnectTime),
      latency: timelineData.map(d => d.avgLatency),
      vuRampup: vuRampupCumulative,
      requestsPerSecond: requestsPerSecondData,
      responsesPerSecond: responsesPerSecondData,
      connectTimeData,
      latencyData
    };
  }

  private prepareErrorAnalysis(data: HTMLReportData): any {
    if (!data.results) return null;

    const errors = data.results.filter(r => !r.success);
    const errorGroups: Map<string, TestResult[]> = new Map();

    errors.forEach(error => {
      const key = `${error.status || 'Unknown'}:${error.error || 'Unknown error'}`;
      if (!errorGroups.has(key)) {
        errorGroups.set(key, []);
      }
      errorGroups.get(key)!.push(error);
    });

    const topErrors = Array.from(errorGroups.entries())
      .map(([key, errors]) => {
        const [status, message] = key.split(':', 2);
        return {
          status: status === 'Unknown' ? null : parseInt(status),
          message,
          count: errors.length,
          percentage: (errors.length / data.results!.length * 100).toFixed(1),
          examples: errors.slice(0, 3).map(e => ({
            url: e.request_url,
            timestamp: e.timestamp,
            vu_id: e.vu_id,
            response_body: e.response_body?.substring(0, 200)
          }))
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Group errors by sample/request (step_name) and error type
    const sampleErrorGroups: Map<string, Map<string, TestResult[]>> = new Map();

    errors.forEach(error => {
      const sampleName = error.step_name || error.action || 'Unknown Sample';
      const errorType = `${error.status || 'N/A'}:${error.error || 'Unknown error'}`;

      if (!sampleErrorGroups.has(sampleName)) {
        sampleErrorGroups.set(sampleName, new Map());
      }

      const errorTypeMap = sampleErrorGroups.get(sampleName)!;
      if (!errorTypeMap.has(errorType)) {
        errorTypeMap.set(errorType, []);
      }

      errorTypeMap.get(errorType)!.push(error);
    });

    // Prepare error details grouped by sample and error type
    const errorDetails: any[] = [];

    sampleErrorGroups.forEach((errorTypeMap, sampleName) => {
      // Count total requests for this sample
      const totalSampleRequests = data.results!.filter(r =>
        (r.step_name || r.action || 'Unknown Sample') === sampleName
      ).length;

      errorTypeMap.forEach((errorList, errorType) => {
        const [status, errorMessage] = errorType.split(':', 2);
        const errorCount = errorList.length;
        const percentageOfSample = totalSampleRequests > 0
          ? ((errorCount / totalSampleRequests) * 100).toFixed(1)
          : '0.0';

        // Get example request details
        const example = errorList[0];

        errorDetails.push({
          sample_name: sampleName,
          request_method: example.request_method || 'N/A',
          request_url: example.request_url || 'N/A',
          status: status === 'N/A' ? 'N/A' : status,
          status_text: example.status_text || 'N/A',
          error_type: errorMessage,
          error_code: example.error_code || 'N/A',
          error_count: errorCount,
          total_sample_requests: totalSampleRequests,
          percentage: percentageOfSample
        });
      });
    });

    // Sort by sample name, then by error count
    errorDetails.sort((a, b) => {
      if (a.sample_name !== b.sample_name) {
        return a.sample_name.localeCompare(b.sample_name);
      }
      return b.error_count - a.error_count;
    });

    return {
      totalErrors: errors.length,
      errorRate: (errors.length / data.results!.length * 100).toFixed(2),
      topErrors,
      errorDetails
    };
  }

  private prepareResponseTimeAnalysis(data: HTMLReportData): any {
    if (!data.results) return null;

    const responseTimes = data.results
      .map(r => r.response_time || r.duration || 0)
      .filter(rt => rt > 0)
      .sort((a, b) => a - b);

    if (responseTimes.length === 0) return null;

    // Group by step for step response times chart
    const stepGroups: Map<string, TestResult[]> = new Map();
    data.results.forEach(result => {
      const stepName = result.step_name || result.action || 'Unknown Step';
      if (!stepGroups.has(stepName)) {
        stepGroups.set(stepName, []);
      }
      stepGroups.get(stepName)!.push(result);
    });

    const stepResponseTimes = Array.from(stepGroups.entries()).map(([stepName, results]) => {
      const stepResponseTimes = results.map(r => r.response_time || r.duration || 0).filter(rt => rt > 0);
      return {
        step_name: stepName,
        count: results.length,
        avg: stepResponseTimes.length > 0 ? Math.round(stepResponseTimes.reduce((a, b) => a + b, 0) / stepResponseTimes.length) : 0,
        min: Math.min(...stepResponseTimes) || 0,
        max: Math.max(...stepResponseTimes) || 0,
        ...(() => {
          const pcts = StatisticsCalculator.calculatePercentiles(stepResponseTimes, [50, 90, 95, 99]);
          return { p50: pcts[50] || 0, p90: pcts[90] || 0, p95: pcts[95] || 0, p99: pcts[99] || 0 };
        })(),
        response_times: stepResponseTimes,
        timeline_data: results.map(r => ({
          duration: r.response_time || r.duration || 0,
          timestamp: r.timestamp,
          vu_id: r.vu_id || 1,
          iteration: r.iteration || 0
        }))
      };
    });

    return {
      histogram: this.createResponseTimeHistogram(data.results),
      distribution: {
        '< 100ms': responseTimes.filter(rt => rt < 100).length,
        '100ms - 500ms': responseTimes.filter(rt => rt >= 100 && rt < 500).length,
        '500ms - 1s': responseTimes.filter(rt => rt >= 500 && rt < 1000).length,
        '1s - 5s': responseTimes.filter(rt => rt >= 1000 && rt < 5000).length,
        '> 5s': responseTimes.filter(rt => rt >= 5000).length
      },
      stepResponseTimes
    };
  }

  private createResponseTimeHistogram(results: TestResult[]): any {
    const responseTimes = results
      .map(r => r.response_time || r.duration || 0)
      .filter(rt => rt > 0)
      .sort((a, b) => a - b);

    if (responseTimes.length === 0) return { data: [], labels: [], colors: [] };

    const min = responseTimes[0];
    const max = responseTimes[responseTimes.length - 1];
    const numBuckets = 20;
    const bucketSize = (max - min) / numBuckets;

    const histogram = new Array(numBuckets).fill(0);
    const labels: string[] = [];
    const distributionData: Array<{ bucket: string; count: number; percentage: number }> = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = min + (i * bucketSize);
      const end = min + ((i + 1) * bucketSize);
      labels.push(`${Math.round(start)}-${Math.round(end)}ms`);
    }

    responseTimes.forEach(rt => {
      const bucket = Math.min(Math.floor((rt - min) / bucketSize), numBuckets - 1);
      histogram[bucket]++;
    });

    // Create distribution data array with bucket, count, and percentage
    for (let i = 0; i < numBuckets; i++) {
      distributionData.push({
        bucket: labels[i],
        count: histogram[i],
        percentage: (histogram[i] / responseTimes.length) * 100
      });
    }

    return {
      labels,
      data: distributionData, // Array of objects for template compatibility
      colors: ['#2196F3']
    };
  }

  private prepareWebVitalsCharts(data: HTMLReportData): any {
    if (!data.results || data.results.length === 0) return null;
    
    // Collect all Web Vitals data points
    const webVitalsData = data.results
      .filter(r => r.custom_metrics?.web_vitals)
      .map(r => ({
        timestamp: r.timestamp,
        vitals: r.custom_metrics.web_vitals,
        score: r.custom_metrics.vitals_score,
        url: r.custom_metrics.page_url
      }));
    if (webVitalsData.length === 0) return null;
    
    // Prepare time series data for each metric (prioritized order)
    const metrics = ['lcp', 'cls', 'inp', 'ttfb', 'fcp', 'fid', 'tti', 'tbt', 'speedIndex'];
    const timeSeries: any = {};
    
    metrics.forEach(metric => {
      timeSeries[metric] = {
        labels: [],
        data: [],
        backgroundColor: this.getMetricColor(metric),
        borderColor: this.getMetricColor(metric)
      };
    });
    
    // Sort data by timestamp for proper timeline
    webVitalsData.sort((a, b) => a.timestamp - b.timestamp);
    
    // Create unified labels and populate time series data
    const unifiedLabels: string[] = [];
    const unifiedData: { [key: string]: (number | null)[] } = {};
    
    metrics.forEach(metric => {
      unifiedData[metric] = [];
    });
    
    webVitalsData.forEach((data) => {
      const timeLabel = new Date(data.timestamp).toLocaleTimeString();
      const urlLabel = data.url ? ` (${data.url.split('/').pop() || data.url})` : '';
      unifiedLabels.push(`${timeLabel}${urlLabel}`);
      
      metrics.forEach(metric => {
        const value = data.vitals[metric] !== undefined ? data.vitals[metric] : null;
        unifiedData[metric].push(value);
        
        // Also maintain individual metric arrays for backward compatibility
        if (value !== null) {
          timeSeries[metric].labels.push(`${timeLabel}${urlLabel}`);
          timeSeries[metric].data.push(value);
        }
      });
    });
    
    // Add unified data for the combined timeline chart
    timeSeries.unified = {
      labels: unifiedLabels,
      data: unifiedData
    };
    
    // Calculate distributions
    const distributions: any = {};
    metrics.forEach(metric => {
      const values = webVitalsData
        .map(d => d.vitals[metric])
        .filter(v => v !== undefined && v !== null);
      
      if (values.length > 0) {
        const stats = StatisticsCalculator.calculateEnhancedStatistics(values);
        const pcts = StatisticsCalculator.calculatePercentiles(values, [75, 90, 95, 99]);
        distributions[metric] = {
          min: stats.min,
          max: stats.max,
          avg: stats.mean,
          median: stats.median,
          p75: pcts[75] || 0,
          p90: pcts[90] || 0,
          p95: pcts[95] || 0,
          p99: pcts[99] || 0
        };
      }
    });
    
    // Score distribution
    const scoreDistribution = {
      good: webVitalsData.filter(d => d.score === 'good').length,
      needsImprovement: webVitalsData.filter(d => d.score === 'needs-improvement').length,
      poor: webVitalsData.filter(d => d.score === 'poor').length
    };
    
    // Page-by-page analysis if multiple pages
    const pageAnalysis = this.analyzeByPage(webVitalsData);
    
    return {
      timeSeries,
      distributions,
      scoreDistribution,
      pageAnalysis,
      totalMeasurements: webVitalsData.length,
      metrics: metrics.filter(m => timeSeries[m].data.length > 0)
    };
  }
  
  private getMetricColor(metric: string): string {
    const colors: { [key: string]: string } = {
      lcp: '#FF6B6B',      // Red - Loading performance
      cls: '#45B7D1',      // Blue - Visual stability
      inp: '#4ECDC4',      // Teal - Responsiveness
      ttfb: '#FECA57',     // Yellow - Server response
      fcp: '#96CEB4',      // Green - Loading performance
      fid: '#9370DB',      // Medium Purple (deprecated)
      tti: '#DDA0DD',      // Plum
      tbt: '#FFA07A',      // Light Salmon
      speedIndex: '#98D8C8' // Mint
    };
    return colors[metric] || '#999999';
  }
  
  private analyzeByPage(webVitalsData: any[]): any {
    const pageGroups = new Map<string, any[]>();
    
    webVitalsData.forEach(data => {
      const url = data.url || 'Unknown';
      if (!pageGroups.has(url)) {
        pageGroups.set(url, []);
      }
      pageGroups.get(url)!.push(data);
    });
    
    const analysis: any[] = [];
    pageGroups.forEach((pageData, url) => {
      const metrics: any = {};
      ['lcp', 'cls', 'inp', 'ttfb', 'fcp'].forEach(metric => {
        const values = pageData
          .map(d => d.vitals[metric])
          .filter(v => v !== undefined && v !== null);
        
        if (values.length > 0) {
          metrics[metric] = {
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values)
          };
        }
      });
      
      analysis.push({
        url,
        measurements: pageData.length,
        metrics,
        avgScore: this.calculateAverageScore(pageData.map(d => d.score))
      });
    });
    
    return analysis;
  }
  
  private calculateAverageScore(scores: string[]): string {
    const scoreValues = scores.map(s => {
      switch(s) {
        case 'good': return 3;
        case 'needs-improvement': return 2;
        case 'poor': return 1;
        default: return 0;
      }
    });
    
    const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    if (avg >= 2.5) return 'good';
    if (avg >= 1.5) return 'needs-improvement';
    return 'poor';
  }
  
  private generateColors(count: number): string[] {
    const colors = [
      '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0',
      '#00BCD4', '#CDDC39', '#FF5722', '#607D8B', '#795548'
    ];
    
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(colors[i % colors.length]);
    }
    return result;
  }

  private async loadTemplate(): Promise<HandlebarsTemplateDelegate> {
    const templatePath = this.config.templatePath || this.getDefaultTemplatePath();
    
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath)!;
    }

    const templateContent = this.config.templatePath 
      ? fs.readFileSync(templatePath, 'utf8')
      : (fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : this.getDefaultTemplate());

    const template = Handlebars.compile(templateContent);
    this.templateCache.set(templatePath, template);
    
    return template;
  }

  private getDefaultTemplatePath(): string {
    return path.join(__dirname, '../reporting/templates/enhanced-report.hbs');
  }

  /**
   * Calculate step statistics from results (for distributed tests or when not pre-calculated)
   */
  private calculateStepStatistics(results: TestResult[]): any[] {
    const stepGroups: Record<string, TestResult[]> = {};

    // Group results by step name and scenario
    results.forEach(result => {
      const key = `${result.scenario || 'default'}-${result.step_name || result.action || 'default'}`;
      if (!stepGroups[key]) {
        stepGroups[key] = [];
      }
      stepGroups[key].push(result);
    });

    return Object.entries(stepGroups).map(([key, stepResults]) => {
      const parts = key.split('-');
      const scenario = parts[0];
      const stepName = parts.slice(1).join('-');
      const successfulResults = stepResults.filter(r => r.success);
      const responseTimes = successfulResults.map(r => r.duration || r.response_time || 0);

      // Calculate percentiles using linear interpolation (like numpy/pandas)
      const sortedTimes = [...responseTimes].sort((a, b) => a - b);
      const getPercentile = (p: number) => {
        if (sortedTimes.length === 0) return 0;
        if (sortedTimes.length === 1) return sortedTimes[0];

        // Linear interpolation method
        const rank = (p / 100) * (sortedTimes.length - 1);
        const lowerIndex = Math.floor(rank);
        const upperIndex = Math.ceil(rank);
        const fraction = rank - lowerIndex;

        if (lowerIndex === upperIndex) {
          return sortedTimes[lowerIndex];
        }

        // Interpolate between the two nearest values
        return sortedTimes[lowerIndex] + fraction * (sortedTimes[upperIndex] - sortedTimes[lowerIndex]);
      };

      const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
      const avgResponseTime = responseTimes.length > 0 ?
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

      return {
        step_name: stepName,
        scenario: scenario,
        total_requests: stepResults.length,
        success_rate: stepResults.length > 0 ? (successfulResults.length / stepResults.length) * 100 : 0,
        avg_response_time: Math.round(avgResponseTime * 10) / 10,
        min_response_time: Math.round(minResponseTime * 10) / 10,
        max_response_time: Math.round(maxResponseTime * 10) / 10,
        median_response_time: Math.round(getPercentile(50) * 10) / 10,
        percentiles: {
          '50': Math.round(getPercentile(50) * 10) / 10,
          '90': Math.round(getPercentile(90) * 10) / 10,
          '95': Math.round(getPercentile(95) * 10) / 10,
          '99': Math.round(getPercentile(99) * 10) / 10,
          '99.9': Math.round(getPercentile(99.9) * 10) / 10,
          '99.99': Math.round(getPercentile(99.99) * 10) / 10
        },
        response_times: responseTimes
      };
    });
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  private getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{config.title}}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #667eea; }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .metric-label { color: #666; margin-top: 5px; }
        .chart-container { margin: 40px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .success { color: #4CAF50; }
        .error { color: #F44336; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .table th { background: #f8f9fa; font-weight: bold; }
        .footer { margin-top: 40px; padding: 20px; text-align: center; color: #666; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{config.title}}</h1>
            <p>{{testName}} - {{config.description}}</p>
            <p>Generated: {{formatDate metadata.generated_at}}</p>
        </div>
        
        <div class="content">
            <div class="summary">
                <div class="metric">
                    <div class="metric-value">{{formatNumber summary.total_requests}}</div>
                    <div class="metric-label">Total Requests</div>
                </div>
                <div class="metric">
                    <div class="metric-value {{#if (gt summary.success_rate 90)}}success{{else}}error{{/if}}">{{round summary.success_rate}}%</div>
                    <div class="metric-label">Success Rate</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{round summary.avg_response_time}}ms</div>
                    <div class="metric-label">Avg Response Time</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{round summary.requests_per_second}}</div>
                    <div class="metric-label">Requests/Second</div>
                </div>
            </div>

            {{#if errorAnalysis}}
            <div class="chart-container">
                <h3>Error Analysis</h3>
                <p>Total Errors: <span class="error">{{formatNumber errorAnalysis.totalErrors}}</span> ({{errorAnalysis.errorRate}}%)</p>
                {{#if errorAnalysis.topErrors}}
                <table class="table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Error Message</th>
                            <th>Count</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each errorAnalysis.topErrors}}
                        <tr>
                            <td>{{status}}</td>
                            <td>{{message}}</td>
                            <td>{{count}}</td>
                            <td>{{percentage}}%</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
                {{/if}}
            </div>
            {{/if}}

            {{#if summary.percentiles}}
            <div class="chart-container">
                <h3>Response Time Percentiles</h3>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Percentile</th>
                            <th>Response Time (ms)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each summary.percentiles}}
                        <tr>
                            <td>P{{@key}}</td>
                            <td>{{round this}}</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
            </div>
            {{/if}}
        </div>
        
        <div class="footer">
            <p>{{metadata.generated_by}} - Test Duration: {{metadata.test_duration}}</p>
        </div>
    </div>
</body>
</html>`;
  }
}
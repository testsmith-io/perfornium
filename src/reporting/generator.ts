import * as fs from 'fs';
import * as path from 'path';
import { TestResult, MetricsSummary } from '../metrics/types';
import { ReportConfig } from '../config/types';
import { StatisticsCalculator } from './statistics';
import { logger } from '../utils/logger';

// Import handlebars correctly
import * as Handlebars from 'handlebars';

export interface ReportData {
  testName: string;
  summary: MetricsSummary;
  results: TestResult[];
}

export class HTMLReportGenerator {
  constructor() {
    // Register Handlebars helpers
    this.registerHelpers();
  }

  private registerHelpers(): void {
    // Helper for comparing numbers
    Handlebars.registerHelper('gt', function (a: number, b: number) {
      return a > b;
    });

    // Helper for formatting numbers
    Handlebars.registerHelper('toFixed', function (num: number, digits: number) {
      return typeof num === 'number' ? num.toFixed(digits) : '0';
    });

    // Helper for conditional classes
    Handlebars.registerHelper('statusClass', function (successRate: number) {
      if (successRate >= 95) return 'metric-success';
      if (successRate >= 90) return 'metric-warning';
      return 'metric-error';
    });

    // Helper for accessing numeric properties
    Handlebars.registerHelper('percentile', function (percentiles: Record<string, number>, key: string) {
      return percentiles[key] || 0;
    });

    // Helper for lookup with numeric keys
    Handlebars.registerHelper('lookup', function (obj: any, key: any) {
      return obj[key];
    });
  }

  async generate(data: ReportData, config: ReportConfig, outputPath: string): Promise<void> {
    try {
      const templatePath = config.template || this.getDefaultTemplatePath();

      let template: string;
      if (fs.existsSync(templatePath)) {
        template = fs.readFileSync(templatePath, 'utf8');
      } else {
        // Use built-in template
        template = this.getBuiltInTemplate();
      }

      const compiledTemplate = Handlebars.compile(template);
      const chartData = this.prepareChartData(data.results);
      const percentiles = config.percentiles || [50, 90, 95, 99, 99.9, 99.99];

      const responseTimes = data.results
        .filter(r => r.success)
        .map(r => r.duration);

      const percentileData = StatisticsCalculator.calculatePercentiles(responseTimes, percentiles);

      // Convert percentiles to array format
      const percentileArray = percentiles.map(p => ({
        percentile: p,
        value: percentileData[p] || 0
      }));

      const timeSeriesData = StatisticsCalculator.groupResultsByTime(data.results, 5000);
      const scenarioStats = this.calculateScenarioStatistics(data.results);

      // Enhanced chart data with new features
      const stepStatistics = this.calculateStepStatistics(data.results);
      const vuRampupData = this.calculateVURampupData(data.results, data.summary.vu_ramp_up || []);
      const timelineData = this.calculateTimelineData(data.results);
      const stepResponseTimes = this.calculateStepResponseTimes(data.results);
      
      // NEW: Additional chart data
      const responseTimeDistribution = StatisticsCalculator.calculateResponseTimeDistribution(data.results, 15);
      const requestsPerSecondData = this.calculateRequestsPerSecondData(data.results);
      const responsesPerSecondData = this.calculateResponsesPerSecondData(data.results);

      // FIXED: Calculate peak VUs from timeline data
      const peakVirtualUsers = timelineData.length > 0 
        ? Math.max(...timelineData.map(d => d.active_vus))
        : 0;

      // Update summary with peak VUs
      const enhancedSummary = {
        ...data.summary,
        peak_virtual_users: peakVirtualUsers,
        total_virtual_users: peakVirtualUsers
      };

      const reportContext = {
        testName: data.testName,
        generatedAt: new Date().toISOString(),
        summary: enhancedSummary, // Use enhanced summary
        percentiles: percentileData,
        percentilesArray: percentileArray,
        chartData: JSON.stringify(chartData),
        timeSeriesData: JSON.stringify(timeSeriesData),
        errorDistribution: JSON.stringify(data.summary.error_distribution),
        scenarioStats: scenarioStats,
        includeCharts: config.include_charts !== false,
        includeRawData: config.include_raw_data === true,
        rawData: config.include_raw_data ? JSON.stringify(data.results.slice(0, 1000)) : null,
        
        // Enhanced chart data
        summaryData: JSON.stringify(enhancedSummary),
        stepStatisticsData: JSON.stringify(stepStatistics),
        stepStatistics: stepStatistics,
        vuRampupData: JSON.stringify(vuRampupData),
        timelineData: JSON.stringify(timelineData),
        stepResponseTimesData: JSON.stringify(stepResponseTimes),
        stepResponseTimes: stepResponseTimes,
        
        // NEW: Additional chart data
        responseTimeDistributionData: JSON.stringify(responseTimeDistribution),
        requestsPerSecondData: JSON.stringify(requestsPerSecondData),
        responsesPerSecondData: JSON.stringify(responsesPerSecondData)
      };

      const html = compiledTemplate(reportContext);

      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, html);
      logger.debug(`📋 HTML report written to ${outputPath}`);

    } catch (error) {
      logger.error('❌ Report generation failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced step statistics with min, max, and additional percentiles
   */
  private calculateStepStatistics(results: TestResult[]): any[] {
    const stepGroups: Record<string, TestResult[]> = {};

    // Group results by step name and scenario
    results.forEach(result => {
      const key = `${result.scenario}-${result.step_name || 'default'}`;
      if (!stepGroups[key]) {
        stepGroups[key] = [];
      }
      stepGroups[key].push(result);
    });

    return Object.entries(stepGroups).map(([key, stepResults]) => {
      const [scenario, stepName] = key.split('-');
      const successfulResults = stepResults.filter(r => r.success);
      const responseTimes = successfulResults.map(r => r.duration);

      // Calculate extended percentiles including 99.9% and 99.99%
      const percentiles = StatisticsCalculator.calculatePercentiles(responseTimes, [50, 90, 95, 99, 99.9, 99.99]);
      
      const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

      return {
        step_name: stepName,
        scenario: scenario,
        total_requests: stepResults.length,
        success_rate: stepResults.length > 0 ? (successfulResults.length / stepResults.length) * 100 : 0,
        avg_response_time: responseTimes.length > 0 ?
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        min_response_time: minResponseTime,
        max_response_time: maxResponseTime,
        percentiles: percentiles,
        response_times: responseTimes
      };
    });
  }

  /**
   * Calculate requests per second over time
   */
  private calculateRequestsPerSecondData(results: TestResult[]): any[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 1000); // 1-second intervals

    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      requests_per_second: group.count, // Total requests in this second
      successful_requests_per_second: group.count - group.errors
    }));
  }

  /**
   * Calculate responses per second over time (successful responses)
   */
  private calculateResponsesPerSecondData(results: TestResult[]): any[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 1000); // 1-second intervals

    return timeGroups.map(group => ({
      timestamp: new Date(group.timestamp).toISOString(),
      responses_per_second: group.count - group.errors, // Successful responses
      total_responses_per_second: group.count, // All responses (including errors)
      error_responses_per_second: group.errors
    }));
  }

  /**
   * Generate proper filename with timestamp and test name from config
   */
  public generateFilename(testName: string, type: 'html' | 'csv' | 'json' | 'summary', configPath?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0]; // Format: YYYY-MM-DDTHH-MM-SS
    
    // Extract test name from YAML config if available
    let finalTestName = testName;
    if (configPath) {
      const configTestName = this.extractTestNameFromConfig(configPath);
      if (configTestName) {
        finalTestName = configTestName;
      }
    }
    
    const sanitizedTestName = finalTestName.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    
    switch (type) {
      case 'html':
        return `${sanitizedTestName}-${timestamp}-report.html`;
      case 'csv':
        return `${sanitizedTestName}-${timestamp}-results.csv`;
      case 'json':
        return `${sanitizedTestName}-${timestamp}-results.json`;
      case 'summary':
        return `${sanitizedTestName}-${timestamp}-summary.csv`;
      default:
        return `${sanitizedTestName}-${timestamp}.${type}`;
    }
  }

  /**
   * Extract test name from YAML config file
   */
  private extractTestNameFromConfig(configPath: string): string | null {
    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // Simple YAML parsing for test name
      const nameMatch = configContent.match(/^name:\s*["']?([^"'\n]+)["']?/m);
      if (nameMatch) {
        return nameMatch[1].trim();
      }

      // Fallback: look for title
      const titleMatch = configContent.match(/^title:\s*["']?([^"'\n]+)["']?/m);
      if (titleMatch) {
        return titleMatch[1].trim();
      }

      return null;
    } catch (error) {
      logger.debug(`Could not extract test name from config ${configPath}:`, error);
      return null;
    }
  }

  private calculateVURampupData(results: TestResult[], vuStartEvents: any[] = []): any[] {
    // Calculate total unique VUs
    const totalVUs = vuStartEvents.length > 0
      ? vuStartEvents.length
      : new Set(results.map(r => r.vu_id)).size;

    const vuRampupData: Array<{time: number, timestamp: number, count: number}> = [];

    // Determine test time range
    const testStartTime = vuStartEvents.length > 0
      ? Math.min(...vuStartEvents.map(vu => vu.start_time))
      : (results.length > 0 ? Math.min(...results.map(r => r.timestamp)) : Date.now());
    const testEndTime = results.length > 0
      ? Math.max(...results.map(r => r.timestamp))
      : testStartTime + 60000;

    // Create time buckets for the entire test duration (1 second intervals)
    const timeInterval = 1000;
    const sortedVUEvents = vuStartEvents.length > 0
      ? [...vuStartEvents].sort((a, b) => a.start_time - b.start_time)
      : [];

    for (let t = testStartTime; t <= testEndTime; t += timeInterval) {
      let activeVUs: number;

      if (sortedVUEvents.length > 0) {
        // Count VUs that have started by this time
        activeVUs = sortedVUEvents.filter(vu => vu.start_time <= t).length;
      } else {
        // Fallback: count unique VU IDs from results up to this time
        const resultsUpToNow = results.filter(r => r.timestamp <= t);
        activeVUs = new Set(resultsUpToNow.map(r => r.vu_id)).size;
      }

      vuRampupData.push({
        time: (t - testStartTime) / 1000,
        timestamp: t,
        count: Math.min(activeVUs, totalVUs)
      });
    }

    return vuRampupData;
  }

  private calculateTimelineData(results: TestResult[]): any[] {
    const timeGroups = StatisticsCalculator.groupResultsByTime(results, 5000); // 5 second intervals

    // Calculate total unique VUs to cap the count and prevent spikes
    const totalVUs = new Set(results.map(r => r.vu_id)).size;

    return timeGroups.map(group => {
      const groupResults = results.filter(r =>
        Math.abs(new Date(r.timestamp).getTime() - new Date(group.timestamp).getTime()) < 5000
      );

      const successfulResults = groupResults.filter(r => r.success);
      const avgResponseTime = successfulResults.length > 0 ?
        successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length : 0;

      let activeVUs = group.concurrent_users || this.estimateActiveVUs(group.timestamp, results);
      // Cap at total VUs to prevent end-of-test spikes
      activeVUs = Math.min(activeVUs, totalVUs);

      return {
        timestamp: group.timestamp,
        active_vus: activeVUs,
        avg_response_time: avgResponseTime,
        success_rate: groupResults.length > 0 ? (successfulResults.length / groupResults.length) * 100 : 0,
        throughput: group.requests_per_second || (groupResults.length / 5) // requests per second
      };
    });
  }

  private estimateActiveVUs(timestamp: string | number, results: TestResult[]): number {
    const currentTime = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const timeWindow = 5000; // 5 seconds

    // Find all results within the time window
    const activeResults = results.filter(r => {
      const resultTime = new Date(r.timestamp).getTime();
      return Math.abs(resultTime - currentTime) <= timeWindow;
    });

    if (activeResults.length === 0) {
      return 0;
    }

    // Count unique virtual users active in this time window
    const uniqueVUs = new Set(activeResults.map(r => r.vu_id));
    return uniqueVUs.size;
  }

  private prepareChartData(results: TestResult[]): any {
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
      scenarios: this.groupByScenario(results)
    };
  }

  private groupByScenario(results: TestResult[]): any {
    const scenarios: Record<string, any> = {};

    results.forEach(result => {
      if (!scenarios[result.scenario]) {
        scenarios[result.scenario] = {
          name: result.scenario,
          total: 0,
          success: 0,
          errors: 0,
          avgResponseTime: 0,
          responseTimes: []
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

    // Calculate averages and success rates
    Object.values(scenarios).forEach((scenario: any) => {
      if (scenario.responseTimes.length > 0) {
        scenario.avgResponseTime = scenario.responseTimes.reduce((a: number, b: number) => a + b, 0) / scenario.responseTimes.length;
      }
      scenario.successRate = scenario.total > 0 ? (scenario.success / scenario.total) * 100 : 0;
    });

    return Object.values(scenarios);
  }

  private calculateStepResponseTimes(results: TestResult[]): any[] {
    const stepGroups: Record<string, any[]> = {};
    
    // Group ALL response data by step name (including timestamps)
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
    
    // Calculate statistics for each step
    return Object.entries(stepGroups).map(([stepName, stepData]) => {
      // Extract just response times for statistics
      const responseTimes = stepData.map(item => item.duration);
      const avg = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const min = Math.min(...responseTimes);
      const max = Math.max(...responseTimes);
      
      // Calculate percentiles
      const percentiles = StatisticsCalculator.calculatePercentiles(responseTimes, [50, 90, 95, 99]);
      
      // Sort timeline data by timestamp
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
        response_times: responseTimes, // Raw response times for box plots
        timeline_data: timelineData // Individual data points with timestamps for line charts
      };
    }).sort((a, b) => a.step_name.localeCompare(b.step_name));
  }

  private calculateScenarioStatistics(results: TestResult[]): any[] {
    const scenarioGroups = this.groupByScenario(results);

    return scenarioGroups.map((scenario: any) => {
      const percentiles = StatisticsCalculator.calculatePercentiles(scenario.responseTimes, [50, 90, 95, 99]);

      return {
        ...scenario,
        percentiles,
        minResponseTime: scenario.responseTimes.length > 0 ? Math.min(...scenario.responseTimes) : 0,
        maxResponseTime: scenario.responseTimes.length > 0 ? Math.max(...scenario.responseTimes) : 0,
        // Add individual percentile values
        p50: percentiles[50] || 0,
        p90: percentiles[90] || 0,
        p95: percentiles[95] || 0,
        p99: percentiles[99] || 0
      };
    });
  }

  private getDefaultTemplatePath(): string {
    return path.join(__dirname, 'templates', 'html.hbs');
  }

  private getBuiltInTemplate(): string {
    // Use the enhanced template with all new features
    return this.getEnhancedTemplate();
  }

  private getEnhancedTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{testName}} - Enhanced Performance Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>
    <style>
        :root {
            --primary-color: #2563eb;
            --success-color: #10b981;
            --warning-color: #f59e0b;
            --error-color: #ef4444;
            --background-color: #f8fafc;
            --card-background: #ffffff;
            --text-primary: #1f2937;
            --text-secondary: #6b7280;
            --border-color: #e5e7eb;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--background-color);
            color: var(--text-primary);
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: linear-gradient(135deg, var(--primary-color) 0%, #1d4ed8 100%);
            color: white;
            padding: 40px 20px;
            border-radius: 12px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .metric-card {
            background: var(--card-background);
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            border: 1px solid var(--border-color);
            text-align: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .metric-value {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .metric-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 500;
        }

        .metric-success {
            color: var(--success-color);
        }

        .metric-warning {
            color: var(--warning-color);
        }

        .metric-error {
            color: var(--error-color);
        }

        .section {
            background: var(--card-background);
            margin-bottom: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        .section-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            background: #f9fafb;
        }

        .section-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .section-content {
            padding: 24px;
        }

        .chart-container {
            margin-bottom: 30px;
            height: 400px;
            position: relative;
        }

        .chart-container.large {
            height: 500px;
        }

        .chart-container.small {
            height: 300px;
        }

        .chart-container canvas {
            max-height: 100%;
        }

        .step-stats-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 0.9rem;
        }

        .step-stats-table th,
        .step-stats-table td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }

        .step-stats-table th {
            background: #f9fafb;
            font-weight: 600;
            color: var(--text-primary);
            position: sticky;
            top: 0;
            font-size: 0.8rem;
        }

        .step-stats-table tr:hover {
            background: #f9fafb;
        }

        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
        }

        .status-success {
            background: #dcfce7;
            color: #166534;
        }

        .status-warning {
            background: #fef3c7;
            color: #92400e;
        }

        .status-error {
            background: #fee2e2;
            color: #991b1b;
        }

        .tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
        }

        .tab {
            padding: 12px 24px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            color: var(--text-secondary);
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab.active {
            color: var(--primary-color);
            border-bottom-color: var(--primary-color);
        }

        .tab:hover {
            color: var(--primary-color);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }

        .grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
        }

        @media (max-width: 768px) {
            .grid-2, .grid-3 {
                grid-template-columns: 1fr;
            }

            .container {
                padding: 10px;
            }

            .header h1 {
                font-size: 2rem;
            }

            .chart-container {
                height: 300px;
            }
        }

        .footer {
            text-align: center;
            padding: 20px;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .chart-controls {
            margin-bottom: 15px;
        }

        .chart-controls button {
            padding: 8px 16px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 10px;
        }

        .chart-controls button:hover {
            background: #1d4ed8;
        }
    </style>
</head>

<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>{{testName}}</h1>
            <p>Enhanced Performance Test Report • Generated on {{generatedAt}}</p>
        </div>

        <!-- Summary Metrics -->
        <div class="summary-grid">
            <div class="metric-card">
                <div class="metric-value">{{summary.total_requests}}</div>
                <div class="metric-label">Total Requests</div>
            </div>
            <div class="metric-card">
                <div class="metric-value {{#if (gt summary.success_rate 95)}}metric-success{{else}}{{#if (gt summary.success_rate 90)}}metric-warning{{else}}metric-error{{/if}}{{/if}}">
                    {{toFixed summary.success_rate 2}}%
                </div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">{{toFixed summary.avg_response_time 2}}ms</div>
                <div class="metric-label">Avg Response Time</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">{{toFixed summary.requests_per_second 2}}</div>
                <div class="metric-label">Requests/sec</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">{{#if summary.peak_virtual_users}}{{summary.peak_virtual_users}}{{else}}{{#if summary.total_virtual_users}}{{summary.total_virtual_users}}{{else}}{{summary.vu_ramp_up.length}}{{/if}}{{/if}}</div>
                <div class="metric-label">Virtual Users</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">{{toFixed summary.total_duration 0}}s</div>
                <div class="metric-label">Total Duration</div>
            </div>
        </div>

        <!-- NEW: Response Time Distribution -->
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">Response Time Distribution</h2>
            </div>
            <div class="section-content">
                <div class="chart-container">
                    <canvas id="responseTimeDistributionChart"></canvas>
                </div>
            </div>
        </div>

        <!-- NEW: Throughput Charts -->
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">Throughput Analysis</h2>
            </div>
            <div class="section-content">
                <div class="grid-2">
                    <div class="chart-container">
                        <canvas id="requestsPerSecondChart"></canvas>
                    </div>
                    <div class="chart-container">
                        <canvas id="responsesPerSecondChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Enhanced Step Statistics Table -->
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">Enhanced Step Performance Statistics</h2>
            </div>
            <div class="section-content">
                <table class="step-stats-table">
                    <thead>
                        <tr>
                            <th>Step Name</th>
                            <th>Scenario</th>
                            <th>Requests</th>
                            <th>Success Rate</th>
                            <th>Min</th>
                            <th>Avg</th>
                            <th>Max</th>
                            <th>P50</th>
                            <th>P90</th>
                            <th>P95</th>
                            <th>P99</th>
                            <th>P99.9</th>
                            <th>P99.99</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each stepStatistics}}
                        <tr>
                            <td><strong>{{step_name}}</strong></td>
                            <td>{{scenario}}</td>
                            <td>{{total_requests}}</td>
                            <td>{{toFixed success_rate 1}}%</td>
                            <td>{{toFixed min_response_time 1}}ms</td>
                            <td>{{toFixed avg_response_time 1}}ms</td>
                            <td>{{toFixed max_response_time 1}}ms</td>
                            <td>{{lookup percentiles 50}}ms</td>
                            <td>{{lookup percentiles 90}}ms</td>
                            <td>{{lookup percentiles 95}}ms</td>
                            <td>{{lookup percentiles 99}}ms</td>
                            <td>{{lookup percentiles 99.9}}ms</td>
                            <td>{{lookup percentiles 99.99}}ms</td>
                            <td>
                                <span class="status-badge {{#if (gt success_rate 95)}}status-success{{else}}{{#if (gt success_rate 90)}}status-warning{{else}}status-error{{/if}}{{/if}}">
                                    {{#if (gt success_rate 95)}}Good{{else}}{{#if (gt success_rate 90)}}Warning{{else}}Error{{/if}}{{/if}}
                                </span>
                            </td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Original Charts -->
        <div class="section">
            <div class="section-header">
                <h2 class="section-title">Response Time Analysis</h2>
            </div>
            <div class="section-content">
                <div class="tabs">
                    <button class="tab active" onclick="showTab('timeline')">Timeline</button>
                    <button class="tab" onclick="showTab('by-step')">By Step</button>
                </div>

                <div id="timeline" class="tab-content active">
                    <div class="chart-container large">
                        <canvas id="timelineChart"></canvas>
                    </div>
                </div>

                <div id="by-step" class="tab-content">
                    <div class="chart-container large">
                        <canvas id="stepResponseTimeChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Generated by Perfornium Performance Testing Framework</p>
        </div>
    </div>

    <script>
        // Chart data from server
        const summaryData = {{{ summaryData }}};
        const stepStatistics = {{{ stepStatisticsData }}};
        const timelineData = {{{ timelineData }}};
        const responseTimeDistributionData = {{{ responseTimeDistributionData }}};
        const requestsPerSecondData = {{{ requestsPerSecondData }}};
        const responsesPerSecondData = {{{ responsesPerSecondData }}};

        // Tab functionality
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }

        // NEW: Response Time Distribution Chart
        const responseDistCtx = document.getElementById('responseTimeDistributionChart').getContext('2d');
        new Chart(responseDistCtx, {
            type: 'bar',
            data: {
                labels: responseTimeDistributionData.map(d => d.bucket),
                datasets: [{
                    label: 'Request Count',
                    data: responseTimeDistributionData.map(d => d.count),
                    backgroundColor: 'rgba(37, 99, 235, 0.6)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                }, {
                    label: 'Percentage',
                    data: responseTimeDistributionData.map(d => d.percentage),
                    type: 'line',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Overall Response Time Distribution'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Requests'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Percentage (%)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        min: 0,
                        max: 100
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Response Time Range'
                        }
                    }
                }
            }
        });

        // NEW: Requests Per Second Chart
        const requestsPerSecCtx = document.getElementById('requestsPerSecondChart').getContext('2d');
        new Chart(requestsPerSecCtx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Total Requests/sec',
                    data: requestsPerSecondData.map(d => ({
                        x: new Date(d.timestamp),
                        y: d.requests_per_second
                    })),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Successful Requests/sec',
                    data: requestsPerSecondData.map(d => ({
                        x: new Date(d.timestamp),
                        y: d.successful_requests_per_second
                    })),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Requests Per Second Over Time'
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Requests/Second'
                        }
                    }
                }
            }
        });

        // NEW: Responses Per Second Chart
        const responsesPerSecCtx = document.getElementById('responsesPerSecondChart').getContext('2d');
        new Chart(responsesPerSecCtx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Successful Responses/sec',
                    data: responsesPerSecondData.map(d => ({
                        x: new Date(d.timestamp),
                        y: d.responses_per_second
                    })),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Error Responses/sec',
                    data: responsesPerSecondData.map(d => ({
                        x: new Date(d.timestamp),
                        y: d.error_responses_per_second
                    })),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Responses Per Second Over Time'
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Responses/Second'
                        }
                    }
                }
            }
        });

        // Timeline Chart
        const timelineCtx = document.getElementById('timelineChart').getContext('2d');
        new Chart(timelineCtx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Avg Response Time (ms)',
                        data: timelineData.map(d => ({
                            x: new Date(d.timestamp),
                            y: d.avg_response_time
                        })),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    {
                        label: 'Success Rate (%)',
                        data: timelineData.map(d => ({
                            x: new Date(d.timestamp),
                            y: d.success_rate
                        })),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Performance Timeline'
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Response Time (ms)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Success Rate (%)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        });

        // Step Response Time Chart
        const stepResponseCtx = document.getElementById('stepResponseTimeChart').getContext('2d');
        new Chart(stepResponseCtx, {
            type: 'bar',
            data: {
                labels: stepStatistics.map(s => s.step_name),
                datasets: [
                    {
                        label: 'P50',
                        data: stepStatistics.map(s => s.percentiles[50] || 0),
                        backgroundColor: 'rgba(37, 99, 235, 0.6)'
                    },
                    {
                        label: 'P90',
                        data: stepStatistics.map(s => s.percentiles[90] || 0),
                        backgroundColor: 'rgba(16, 185, 129, 0.6)'
                    },
                    {
                        label: 'P95',
                        data: stepStatistics.map(s => s.percentiles[95] || 0),
                        backgroundColor: 'rgba(245, 158, 11, 0.6)'
                    },
                    {
                        label: 'P99',
                        data: stepStatistics.map(s => s.percentiles[99] || 0),
                        backgroundColor: 'rgba(239, 68, 68, 0.6)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Response Time Percentiles by Step'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Response Time (ms)'
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }
}
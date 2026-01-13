import {ErrorDetail, MetricsSummary, StepStatistics, TestResult, TimelineData, VUStartEvent} from './types';
import {EventEmitter} from 'events';
import {logger} from '../utils/logger';

export interface RealtimeConfig {
  enabled: boolean;
  batch_size?: number;
  interval_ms?: number;
  endpoints?: RealtimeEndpoint[];
  file_output?: {
    enabled: boolean;
    path: string;
    format: 'jsonl' | 'csv';
  };
  incremental_files?: {
    enabled: boolean;
    json_path?: string;
    csv_path?: string;
    update_summary?: boolean; // Also update summary files incrementally
  };
}

export interface RealtimeEndpoint {
  type: 'graphite' | 'webhook' | 'influxdb' | 'websocket';
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  token?: string;
  headers?: Record<string, string>;
}

export class MetricsCollector extends EventEmitter {
  private results: TestResult[] = [];
  private startTime: number = 0;
  private errorDetails: Map<string, ErrorDetail> = new Map();
  private vuStartEvents: VUStartEvent[] = [];
  private loadPatternType: string = 'basic';

  // Running statistics (accurate even when individual results are dropped)
  private runningStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalDuration: 0,  // Sum of all durations for averaging
    minDuration: Infinity,
    maxDuration: 0,
    durations: [] as number[],  // For percentile calculation (limited size)
  };
  private readonly maxDurationsForPercentiles = 10000;  // Keep last N for percentiles
  private readonly maxStoredResults = 50000;  // Max individual results to keep in memory

  // Real-time batch processing
  private realtimeConfig: RealtimeConfig;
  private batchBuffer: TestResult[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchCounter: number = 0;
  private csvHeaderWritten: boolean = false;

  // Default output paths
  private defaultJsonPath: string = 'results/live-results.json';
  private defaultCsvPath: string = 'results/live-results.csv';

  constructor(realtimeConfig?: RealtimeConfig) {
    super();
    
    // Enable incremental files by default with sensible defaults
    this.realtimeConfig = {
      enabled: true,
      batch_size: 10, // Default batch size
      incremental_files: {
        enabled: true,
        json_path: this.defaultJsonPath,
        csv_path: this.defaultCsvPath,
        update_summary: true
      },
      ...realtimeConfig // Override with provided config if any
    };
    
    if (this.realtimeConfig.enabled) {
      this.initializeRealtime();
    }
  }

  private initializeRealtime(): void {
    // Use interval-based batching if specified, otherwise use count-based
    if (this.realtimeConfig.interval_ms) {
      this.startBatchTimer();
      logger.info(`📊 Real-time metrics enabled with ${this.realtimeConfig.interval_ms}ms intervals`);
    } else {
      const batchSize = this.realtimeConfig.batch_size || 10;
      logger.info(`📊 Real-time metrics enabled with batch size: ${batchSize}`);
    }

    if (this.realtimeConfig.file_output?.enabled) {
      logger.info(`📁 Real-time file output enabled: ${this.realtimeConfig.file_output.path}`);
    }

    if (this.realtimeConfig.incremental_files?.enabled) {
      logger.info(`📄 Incremental JSON/CSV files enabled (JSON: ${this.realtimeConfig.incremental_files.json_path}, CSV: ${this.realtimeConfig.incremental_files.csv_path})`);
      this.initializeIncrementalFiles();
    }
  }

  private startBatchTimer(): void {
    const interval = this.realtimeConfig.interval_ms || 5000;
    this.batchTimer = setInterval(() => {
      if (this.batchBuffer.length > 0) {
        this.flushBatch();
      }
    }, interval);
  }

  private async initializeIncrementalFiles(): Promise<void> {
    const config = this.realtimeConfig.incremental_files!;
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      // Initialize JSON file
      if (config.json_path) {
        const dir = path.dirname(config.json_path);
        await fs.mkdir(dir, { recursive: true });
        
        // Start with empty array
        await fs.writeFile(config.json_path, '[]');
        logger.debug(`📄 Initialized incremental JSON file: ${config.json_path}`);
      }
      
      // Initialize CSV file with header
      if (config.csv_path) {
        const dir = path.dirname(config.csv_path);
        await fs.mkdir(dir, { recursive: true });
        
        const csvHeader = 'timestamp,vu_id,scenario,action,step_name,duration,success,status,error,request_url\n';
        await fs.writeFile(config.csv_path, csvHeader);
        this.csvHeaderWritten = true;
        logger.debug(`📄 Initialized incremental CSV file: ${config.csv_path}`);
      }
      
    } catch (error) {
      logger.error('❌ Failed to initialize incremental files:', error);
    }
  }

  start(): void {
    this.startTime = Date.now();
    this.results = [];
    this.errorDetails.clear();
    this.vuStartEvents = [];
    this.batchBuffer = [];
    this.batchCounter = 0;
    this.csvHeaderWritten = false;

    // Reset running statistics
    this.runningStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      durations: [],
    };

    if (this.realtimeConfig.enabled && this.realtimeConfig.interval_ms) {
      this.startBatchTimer();
    }
  }
    recordVUStart(vuId: number): void {
    this.vuStartEvents.push({
      vu_id: vuId,
      start_time: Date.now(),
      load_pattern: this.loadPatternType
    });
  }

  recordResult(result: TestResult): void {
    // Update running statistics (always accurate regardless of stored results)
    this.runningStats.totalRequests++;
    if (result.success) {
      this.runningStats.successfulRequests++;
      const duration = result.duration || 0;
      this.runningStats.totalDuration += duration;
      this.runningStats.minDuration = Math.min(this.runningStats.minDuration, duration);
      this.runningStats.maxDuration = Math.max(this.runningStats.maxDuration, duration);

      // Keep limited durations for percentile calculation (reservoir sampling)
      if (this.runningStats.durations.length < this.maxDurationsForPercentiles) {
        this.runningStats.durations.push(duration);
      } else {
        // Randomly replace an existing duration (reservoir sampling)
        const replaceIndex = Math.floor(Math.random() * this.runningStats.totalRequests);
        if (replaceIndex < this.maxDurationsForPercentiles) {
          this.runningStats.durations[replaceIndex] = duration;
        }
      }
    } else {
      this.runningStats.failedRequests++;
    }

    // Store result only if under limit (for detailed analysis)
    if (this.results.length < this.maxStoredResults) {
      this.results.push(result);
    }

    this.emit('result', result);

    // Track detailed error information
    if (!result.success) {
      this.trackErrorDetail(result);
    }

    // Add to batch buffer for real-time processing (with safety limit)
    if (this.realtimeConfig.enabled) {
      // Safety limit: if buffer exceeds 1000 items, force flush to prevent memory issues
      if (this.batchBuffer.length >= 1000) {
        this.flushBatch();
      }

      this.batchBuffer.push(result);

      // Check if we should flush based on batch size (if not using intervals)
      if (!this.realtimeConfig.interval_ms) {
        const batchSize = this.realtimeConfig.batch_size || 10;
        if (this.batchBuffer.length >= batchSize) {
          this.flushBatch();
        }
      }
    }
  }

  recordError(vuId: number, scenario: string, action: string, error: Error): void {
    const result: TestResult = {
      id: `${vuId}-${Date.now()}`,
      vu_id: vuId,
      iteration: 0,
      scenario,
      action,
      timestamp: Date.now(),
      duration: 0,
      success: false,
      error: error.message
    };
    
    this.recordResult(result);
  }

  private async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) return;
    
    const batch = [...this.batchBuffer];
    this.batchBuffer = [];
    this.batchCounter++;
    
    logger.debug(`📤 Flushing batch #${this.batchCounter} with ${batch.length} results`);
    
    try {
      // Write to file if configured
      if (this.realtimeConfig.file_output?.enabled) {
        await this.writeBatchToFile(batch);
      }
      
      // Send to real-time endpoints
      if (this.realtimeConfig.endpoints) {
        await this.sendToRealTimeEndpoints(batch);
      }
      
      // Update incremental JSON/CSV files
      if (this.realtimeConfig.incremental_files?.enabled) {
        await this.updateIncrementalFiles(batch);
      }
      
      // Emit batch event for custom listeners
      this.emit('batch', {
        batch_number: this.batchCounter,
        batch_size: batch.length,
        results: batch,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('❌ Failed to flush metrics batch:', error);
    }
  }

  private async writeBatchToFile(batch: TestResult[]): Promise<void> {
    const config = this.realtimeConfig.file_output!;
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      // Ensure directory exists
      const dir = path.dirname(config.path);
      await fs.mkdir(dir, { recursive: true });
      
      let content: string;
      
      if (config.format === 'csv') {
        content = this.formatBatchAsCSV(batch);
      } else {
        // JSONL format (default)
        content = batch.map(result => JSON.stringify({
          ...result,
          timestamp: new Date(result.timestamp).toISOString(),
          batch_number: this.batchCounter
        })).join('\n') + '\n';
      }
      
      await fs.appendFile(config.path, content);
      
    } catch (error) {
      logger.error('❌ Failed to write batch to file:', error);
    }
  }

  private formatBatchAsCSV(batch: TestResult[]): string {
    return batch.map(result => [
      new Date(result.timestamp).toISOString(),
      this.batchCounter,
      result.vu_id,
      result.scenario,
      result.action,
      result.step_name || '',
      result.duration,
      result.success,
      result.status || '',
      (result.error || '').replace(/"/g, '""') // Escape quotes
    ].join(',')).join('\n') + '\n';
  }

  private async updateIncrementalFiles(batch: TestResult[]): Promise<void> {
    const config = this.realtimeConfig.incremental_files!;
    
    try {
      // Update incremental JSON file
      if (config.json_path) {
        await this.updateIncrementalJSON(batch, config.json_path);
      }
      
      // Update incremental CSV file
      if (config.csv_path) {
        await this.updateIncrementalCSV(batch, config.csv_path);
      }
      
      // Update summary files if configured
      if (config.update_summary) {
        await this.updateIncrementalSummary();
      }
      
    } catch (error) {
      logger.error('❌ Failed to update incremental files:', error);
    }
  }

  private async updateIncrementalJSON(batch: TestResult[], filePath: string): Promise<void> {
    const fs = require('fs').promises;
    
    try {
      // Read existing file
      const existingContent = await fs.readFile(filePath, 'utf8');
      let existingData: TestResult[] = [];
      
      if (existingContent.trim()) {
        existingData = JSON.parse(existingContent);
      }
      
      // Append new batch
      const updatedData = [...existingData, ...batch];
      
      // Write back to file
      await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2));
      
    } catch (error) {
      // If file doesn't exist or is corrupted, start fresh
      await fs.writeFile(filePath, JSON.stringify(batch, null, 2));
    }
  }

  private async updateIncrementalCSV(batch: TestResult[], filePath: string): Promise<void> {
    const fs = require('fs').promises;
    
    const csvRows = batch.map(result => [
      new Date(result.timestamp).toISOString(),
      result.vu_id,
      result.scenario,
      result.action,
      result.step_name || '',
      result.duration,
      result.success,
      result.status || '',
      (result.error || '').replace(/"/g, '""'), // Escape quotes
      result.request_url || ''
    ].map(field => `"${field}"`).join(',')).join('\n') + '\n';
    
    await fs.appendFile(filePath, csvRows);
  }

  private async updateIncrementalSummary(): Promise<void> {
    const summary = this.getSummary();
    const fs = require('fs').promises;
    const path = require('path');
    
    const config = this.realtimeConfig.incremental_files!;
    
    // Generate summary file paths based on the JSON path
    const basePath = config.json_path ? path.dirname(config.json_path) : 'results';
    const summaryJsonPath = path.join(basePath, 'summary-incremental.json');
    const summaryHtmlPath = path.join(basePath, 'summary-incremental.html');
    
    try {
      // Write JSON summary
      await fs.writeFile(summaryJsonPath, JSON.stringify({
        last_updated: new Date().toISOString(),
        test_duration: summary.total_duration,
        ...summary
      }, null, 2));
      
      // Generate simple HTML summary
      const htmlSummary = this.generateSimpleHTMLSummary(summary);
      await fs.writeFile(summaryHtmlPath, htmlSummary);
      
    } catch (error) {
      logger.error('❌ Failed to update incremental summary:', error);
    }
  }

  private generateSimpleHTMLSummary(summary: MetricsSummary): string {
    const lastUpdated = new Date().toISOString();
    
    return `<!DOCTYPE html>
<html>
<head>
    <title>Load Test Summary (Live)</title>
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .header { background: #007bff; color: white; padding: 15px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Load Test Progress</h1>
        <p>Last Updated: ${lastUpdated}</p>
        <p>Test Duration: ${summary.total_duration.toFixed(1)}s</p>
    </div>
    
    <div class="metric">
        <h3>📊 Overall Statistics</h3>
        <p><strong>Total Requests:</strong> ${summary.total_requests}</p>
        <p><strong class="success">Successful:</strong> ${summary.successful_requests}</p>
        <p><strong class="error">Failed:</strong> ${summary.failed_requests}</p>
        <p><strong>Success Rate:</strong> ${summary.success_rate.toFixed(2)}%</p>
    </div>
    
    <div class="metric">
        <h3>⏱️ Response Times</h3>
        <p><strong>Average:</strong> ${summary.avg_response_time.toFixed(0)}ms</p>
        <p><strong>Min:</strong> ${summary.min_response_time}ms</p>
        <p><strong>Max:</strong> ${summary.max_response_time}ms</p>
        <p><strong>95th Percentile:</strong> ${summary.percentiles[95] || 0}ms</p>
    </div>
    
    <div class="metric">
        <h3>🔄 Throughput</h3>
        <p><strong>Requests/sec:</strong> ${summary.requests_per_second.toFixed(2)}</p>
        <p><strong>Bytes/sec:</strong> ${(summary.bytes_per_second || 0).toFixed(0)}</p>
    </div>
    
    ${summary.step_statistics.length > 0 ? `
    <div class="metric">
        <h3>📝 Step Statistics</h3>
        ${summary.step_statistics.slice(0, 5).map(step => `
            <div style="margin: 10px 0; padding: 8px; background: white; border-left: 4px solid ${step.success_rate > 95 ? '#28a745' : '#ffc107'};">
                <strong>${step.step_name}</strong> (${step.scenario})
                <br>Success: ${step.success_rate.toFixed(1)}% | Avg: ${step.avg_response_time.toFixed(0)}ms | Count: ${step.total_requests}
            </div>
        `).join('')}
    </div>
    ` : ''}
    
    <div class="metric">
        <small>Auto-refreshes every 5 seconds</small>
    </div>
</body>
</html>`;
  }

  private async sendToRealTimeEndpoints(batch: TestResult[]): Promise<void> {
    if (!this.realtimeConfig.endpoints) return;
    
    const promises = this.realtimeConfig.endpoints.map(endpoint => 
      this.sendToEndpoint(batch, endpoint).catch(error => 
        logger.warn(`⚠️ Failed to send to ${endpoint.type} endpoint:`, error)
      )
    );
    
    await Promise.allSettled(promises);
  }

  private async sendToEndpoint(batch: TestResult[], endpoint: RealtimeEndpoint): Promise<void> {
    switch (endpoint.type) {
      case 'graphite':
        await this.sendToGraphite(batch, endpoint);
        break;
      case 'webhook':
        await this.sendToWebhook(batch, endpoint);
        break;
      case 'influxdb':
        await this.sendToInfluxDB(batch, endpoint);
        break;
      case 'websocket':
        await this.sendToWebSocket(batch, endpoint);
        break;
      default:
        logger.warn(`⚠️ Unknown endpoint type: ${(endpoint as any).type}`);
    }
  }

  private async sendToGraphite(batch: TestResult[], config: RealtimeEndpoint): Promise<void> {
    const net = require('net');
    
    return new Promise((resolve, reject) => {
      const client = net.createConnection(config.port!, config.host!);
      
      client.on('connect', () => {
        const metrics = batch.map(result => {
          const timestamp = Math.floor(result.timestamp / 1000);
          const metricName = `loadtest.${result.scenario}.${result.step_name || result.action}`;
          
          return [
            `${metricName}.duration ${result.duration} ${timestamp}`,
            `${metricName}.success ${result.success ? 1 : 0} ${timestamp}`,
            `${metricName}.count 1 ${timestamp}`
          ].join('\n');
        }).join('\n') + '\n';
        
        client.write(metrics);
        client.end();
      });
      
      client.on('close', () => resolve());
      client.on('error', reject);
      
      setTimeout(() => {
        client.destroy();
        reject(new Error('Graphite connection timeout'));
      }, 5000);
    });
  }

  private async sendToWebhook(batch: TestResult[], config: RealtimeEndpoint): Promise<void> {
    const response = await fetch(config.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        batch_number: this.batchCounter,
        batch_size: batch.length,
        test_start_time: new Date(this.startTime).toISOString(),
        results: batch
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  }

  private async sendToInfluxDB(batch: TestResult[], config: RealtimeEndpoint): Promise<void> {
    const lines = batch.map(result => {
      const tags = [
        `scenario=${result.scenario}`,
        `step=${result.step_name || result.action}`,
        `vu_id=${result.vu_id}`,
        `success=${result.success}`
      ].join(',');
      
      const fields = [
        `duration=${result.duration}`,
        `success=${result.success ? 'true' : 'false'}`,
        `batch_number=${this.batchCounter}i`
      ];
      
      if (result.status) {
        fields.push(`status=${result.status}i`);
      }
      
      const timestamp = result.timestamp * 1000000; // Convert to nanoseconds
      
      return `loadtest,${tags} ${fields.join(',')} ${timestamp}`;
    }).join('\n');
    
    const response = await fetch(`${config.url}/write?db=${config.database}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'text/plain'
      },
      body: lines
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`InfluxDB write failed: ${response.status} ${errorText}`);
    }
  }

  private async sendToWebSocket(batch: TestResult[], config: RealtimeEndpoint): Promise<void> {
    return new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(config.url);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'metrics_batch',
          timestamp: new Date().toISOString(),
          batch_number: this.batchCounter,
          test_start_time: new Date(this.startTime).toISOString(),
          data: batch
        }));
        ws.close();
        resolve();
      });
      
      ws.on('error', reject);
      
      setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });
  }

  // Force flush when test completes or stops
  async finalize(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Flush any remaining results
    if (this.batchBuffer.length > 0) {
      await this.flushBatch();
    }
    
    logger.info(`📊 Metrics collection finalized. Total batches: ${this.batchCounter}, Total results: ${this.results.length}`);
  }

  private trackErrorDetail(result: TestResult): void {
    const errorKey = `${result.scenario}:${result.action}:${result.status || 'NO_STATUS'}:${result.error}`;
    
    const existing = this.errorDetails.get(errorKey);
    if (existing) {
      existing.count++;
    } else {
      this.errorDetails.set(errorKey, {
        timestamp: result.timestamp,
        vu_id: result.vu_id,
        scenario: result.scenario,
        action: result.action,
        status: result.status,
        error: result.error || 'Unknown error',
        request_url: result.request_url,
        response_body: result.response_body,
        count: 1
      });
    }
  }

  getResults(): TestResult[] {
    return [...this.results];
  }
  getSummary(): MetricsSummary {
    // Use running statistics for accurate totals (even when individual results are limited)
    const totalRequests = this.runningStats.totalRequests;
    const successfulRequests = this.runningStats.successfulRequests;
    const failedRequests = this.runningStats.failedRequests;

    // Use sampled durations for percentiles (reservoir sampling ensures representative sample)
    const durations = this.runningStats.durations;
    const totalDuration = (Date.now() - this.startTime) / 1000;

    // Calculate average from running totals (accurate even with limited stored results)
    const avgResponseTime = successfulRequests > 0
      ? this.runningStats.totalDuration / successfulRequests
      : 0;

    // Error distribution from stored results (may be limited but representative)
    const errorDistribution: Record<string, number> = {};
    this.results.filter(r => !r.success).forEach(r => {
      const error = r.error || 'Unknown error';
      errorDistribution[error] = (errorDistribution[error] || 0) + 1;
    });

    // Status code distribution from stored results
    const statusDistribution: Record<number, number> = {};
    this.results.forEach(r => {
      if (r.status) {
        statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
      }
    });

    const responseSizes = this.results
      .filter(r => r.response_size)
      .map(r => r.response_size!);

    return {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      success_rate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      avg_response_time: avgResponseTime,
      min_response_time: this.runningStats.minDuration === Infinity ? 0 : this.runningStats.minDuration,
      max_response_time: this.runningStats.maxDuration,
      percentiles: this.calculatePercentiles(durations),
      requests_per_second: totalDuration > 0 ? (totalRequests / totalDuration) : 0,
      bytes_per_second: responseSizes.length > 0 && totalDuration > 0
        ? (responseSizes.reduce((a, b) => a + b, 0) / totalDuration) : 0,
      total_duration: totalDuration,
      error_distribution: errorDistribution,
      status_distribution: statusDistribution,
      error_details: Array.from(this.errorDetails.values()).sort((a, b) => b.count - a.count),
      
      // New enhanced statistics
      step_statistics: this.calculateStepStatistics(),
      vu_ramp_up: this.vuStartEvents,
      timeline_data: this.calculateTimelineData()
    };
  }

  private calculateStepStatistics(): StepStatistics[] {
    const stepGroups = new Map<string, TestResult[]>();
    
    // Group results by step name and scenario
    this.results.forEach(result => {
      const key = `${result.scenario}:${result.step_name || result.action}`;
      if (!stepGroups.has(key)) {
        stepGroups.set(key, []);
      }
      stepGroups.get(key)!.push(result);
    });

    const stepStats: StepStatistics[] = [];
    
    for (const [key, results] of stepGroups) {
      const [scenario, stepName] = key.split(':');
      const successfulResults = results.filter(r => r.success);

      // Include ALL results (both successful and failed) for response time calculations
      // Failed requests also have response times that should be included in statistics
      const responseTimes = results
        .map(r => r.response_time || r.duration || 0)
        .filter(rt => rt > 0);

      // Error distribution for this step
      const errorDistribution: Record<string, number> = {};
      results.filter(r => !r.success).forEach(r => {
        const error = r.error || 'Unknown error';
        errorDistribution[error] = (errorDistribution[error] || 0) + 1;
      });

      // Status distribution for this step
      const statusDistribution: Record<number, number> = {};
      results.forEach(r => {
        if (r.status) {
          statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
        }
      });

      stepStats.push({
        step_name: stepName,
        scenario: scenario,
        total_requests: results.length,
        successful_requests: successfulResults.length,
        failed_requests: results.length - successfulResults.length,
        success_rate: results.length > 0 ? (successfulResults.length / results.length) * 100 : 0,
        avg_response_time: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        min_response_time: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
        max_response_time: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
        percentiles: this.calculatePercentiles(responseTimes),
        response_times: responseTimes,
        error_distribution: errorDistribution,
        status_distribution: statusDistribution
      });
    }

    return stepStats.sort((a, b) => b.total_requests - a.total_requests);
  }

  private calculateTimelineData(): TimelineData[] {
    if (this.results.length === 0) return [];
    
    const intervalMs = 5000; // 5 second intervals
    const startTime = this.startTime;
    const endTime = Date.now();
    const timeline: TimelineData[] = [];
    
    for (let time = startTime; time <= endTime; time += intervalMs) {
      const intervalResults = this.results.filter(r => 
        r.timestamp >= time && r.timestamp < time + intervalMs
      );
      
      const successfulResults = intervalResults.filter(r => r.success);
      
      // Calculate active VUs at this time
      const activeVUs = this.vuStartEvents.filter(vu => vu.start_time <= time).length;
      
      timeline.push({
        timestamp: time,
        time_label: new Date(time).toISOString(),
        active_vus: activeVUs,
        requests_count: intervalResults.length,
        avg_response_time: successfulResults.length > 0
          ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length
          : 0,
        success_rate: intervalResults.length > 0 
          ? (successfulResults.length / intervalResults.length) * 100 
          : 0,
        throughput: intervalResults.length / (intervalMs / 1000)
      });
    }
    
    return timeline;
  }

  private calculatePercentiles(values: number[]): Record<number, number> {
    if (values.length === 0) return {};

    const sorted = [...values].sort((a, b) => a - b);
    const percentiles = [50, 90, 95, 99, 99.9, 99.99];
    const result: Record<number, number> = {};

    percentiles.forEach(p => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      result[p] = sorted[Math.max(0, index)];
    });

    return result;
  }

  clear(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    this.results = [];
    this.errorDetails.clear();
    this.vuStartEvents = [];
    this.batchBuffer = [];
    this.batchCounter = 0;
    this.csvHeaderWritten = false;
    this.startTime = 0;
  }
}
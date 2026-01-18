import { EventEmitter } from 'events';
import { MetricsSummary, TestResult, CapturedNetworkCall } from './types';
import { logger } from '../utils/logger';
import { StatisticsEngine } from './core/statistics-engine';
import { ErrorTracker } from './core/error-tracker';
import { ResultStorage } from './core/result-storage';
import { BatchProcessor } from './batch/batch-processor';
import { FileWriter, IncrementalFilesConfig } from './output/file-writer';
import { RealtimeDispatcher, RealtimeEndpoint } from './realtime/dispatcher';
import { SummaryGenerator } from './reporting/summary-generator';
import { InfluxDBWriter, InfluxDBWriterConfig } from './output/influxdb-writer';

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
  };
  /** InfluxDB configuration for storing test metrics */
  influxdb?: {
    enabled: boolean;
    url?: string;
    token?: string;
    org?: string;
    bucket?: string;
    batch_size?: number;
    flush_interval?: number;
  };
}

export { RealtimeEndpoint };

export class MetricsCollector extends EventEmitter {
  private startTime: number = 0;

  // Core modules
  private statisticsEngine: StatisticsEngine;
  private errorTracker: ErrorTracker;
  private resultStorage: ResultStorage;
  private batchProcessor: BatchProcessor;
  private fileWriter: FileWriter;
  private realtimeDispatcher: RealtimeDispatcher;
  private summaryGenerator: SummaryGenerator;
  private influxDBWriter: InfluxDBWriter | null = null;

  // Configuration
  private realtimeConfig: RealtimeConfig;

  // Default output path for live results (used by dashboard)
  private defaultJsonPath: string = 'results/live-results.json';

  // Current test info for InfluxDB
  private currentTestId: string = '';
  private currentTestName: string = '';

  constructor(realtimeConfig?: RealtimeConfig) {
    super();

    // Initialize core modules
    this.statisticsEngine = new StatisticsEngine();
    this.errorTracker = new ErrorTracker();
    this.resultStorage = new ResultStorage();
    this.fileWriter = new FileWriter();
    this.realtimeDispatcher = new RealtimeDispatcher();
    this.summaryGenerator = new SummaryGenerator();

    // Enable incremental files by default for dashboard support
    this.realtimeConfig = {
      enabled: true,
      batch_size: 10,
      incremental_files: {
        enabled: true,
        json_path: this.defaultJsonPath
      },
      ...realtimeConfig
    };

    // Initialize batch processor with flush handler
    this.batchProcessor = new BatchProcessor({
      batchSize: this.realtimeConfig.batch_size || 10,
      intervalMs: this.realtimeConfig.interval_ms,
      maxBufferSize: 1000
    });

    this.batchProcessor.setFlushHandler(async (batch, batchNumber) => {
      await this.handleBatchFlush(batch, batchNumber);
    });

    // Note: initializeRealtime is called separately via initialize() to properly await async operations
  }

  /**
   * Initialize async components (call before starting metrics collection)
   */
  async initialize(): Promise<void> {
    if (this.realtimeConfig.enabled) {
      await this.initializeRealtime();
    }
  }

  private async initializeRealtime(): Promise<void> {
    if (this.realtimeConfig.interval_ms) {
      this.batchProcessor.start();
      logger.info(`Real-time metrics enabled with ${this.realtimeConfig.interval_ms}ms intervals`);
    } else {
      const batchSize = this.realtimeConfig.batch_size || 10;
      logger.info(`Real-time metrics enabled with batch size: ${batchSize}`);
    }

    if (this.realtimeConfig.file_output?.enabled) {
      logger.info(`Real-time file output enabled: ${this.realtimeConfig.file_output.path}`);
    }

    if (this.realtimeConfig.incremental_files?.enabled) {
      const config = this.realtimeConfig.incremental_files;
      logger.info(`Live results file enabled: ${config.json_path}`);

      await this.fileWriter.initialize({
        enabled: true,
        jsonPath: config.json_path
      });
    }

    if (this.realtimeConfig.endpoints) {
      this.realtimeDispatcher.setEndpoints(this.realtimeConfig.endpoints);
    }

    // Initialize InfluxDB writer if configured
    if (this.realtimeConfig.influxdb?.enabled) {
      logger.info(`Initializing InfluxDB connection to ${this.realtimeConfig.influxdb.url || 'default URL'}...`);
      this.influxDBWriter = new InfluxDBWriter({
        url: this.realtimeConfig.influxdb.url,
        token: this.realtimeConfig.influxdb.token,
        org: this.realtimeConfig.influxdb.org,
        bucket: this.realtimeConfig.influxdb.bucket,
        batchSize: this.realtimeConfig.influxdb.batch_size,
        flushInterval: this.realtimeConfig.influxdb.flush_interval
      });
      const connected = await this.influxDBWriter.connect();
      if (connected) {
        logger.info('InfluxDB test metrics storage enabled and connected');
      } else {
        logger.warn('InfluxDB configured but connection failed - metrics will only be stored in files');
      }
    } else {
      logger.debug('InfluxDB not configured - test metrics will be stored in files only');
    }
  }

  private async handleBatchFlush(batch: TestResult[], batchNumber: number): Promise<void> {
    try {
      // Write to file if configured
      if (this.realtimeConfig.file_output?.enabled) {
        await this.fileWriter.writeBatchToFile(batch, {
          enabled: true,
          path: this.realtimeConfig.file_output.path,
          format: this.realtimeConfig.file_output.format
        }, batchNumber);
      }

      // Send to real-time endpoints
      await this.realtimeDispatcher.dispatch(batch, batchNumber);

      // Update live results file (for dashboard)
      if (this.realtimeConfig.incremental_files?.enabled) {
        await this.fileWriter.updateIncrementalFiles(batch);
      }

      // Write to InfluxDB if enabled
      if (this.influxDBWriter?.isEnabled()) {
        await this.influxDBWriter.writeBatch(batch);
      }

      // Emit batch event for custom listeners
      this.emit('batch', {
        batch_number: batchNumber,
        batch_size: batch.length,
        results: batch,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to flush metrics batch:', error);
    }
  }

  start(testName?: string): void {
    this.startTime = Date.now();
    this.currentTestId = `test-${this.startTime}`;
    this.currentTestName = testName || 'unnamed-test';

    // Reset all modules
    this.statisticsEngine.reset();
    this.errorTracker.clear();
    this.resultStorage.clear();
    this.batchProcessor.reset();
    this.fileWriter.reset();
    this.realtimeDispatcher.setStartTime(this.startTime);

    // Start InfluxDB test if enabled
    if (this.influxDBWriter?.isEnabled()) {
      this.influxDBWriter.startTest(this.currentTestId, this.currentTestName);
    }

    if (this.realtimeConfig.enabled && this.realtimeConfig.interval_ms) {
      this.batchProcessor.start();
    }
  }

  /**
   * Set the test name/ID for InfluxDB tagging
   */
  setTestInfo(testName: string, testId?: string): void {
    this.currentTestName = testName;
    this.currentTestId = testId || `test-${Date.now()}`;
    if (this.influxDBWriter?.isEnabled()) {
      this.influxDBWriter.startTest(this.currentTestId, this.currentTestName);
    }
  }

  recordVUStart(vuId: number): void {
    this.resultStorage.recordVUStart(vuId);
  }

  recordResult(result: TestResult): void {
    // Update running statistics
    const duration = result.duration || 0;
    this.statisticsEngine.recordResult(duration, result.success);

    // Store result
    this.resultStorage.addResult(result);

    this.emit('result', result);

    // Track error details
    if (!result.success) {
      this.errorTracker.trackError(result);
    }

    // Add to batch for real-time processing
    if (this.realtimeConfig.enabled) {
      this.batchProcessor.add(result);
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

  async finalize(): Promise<void> {
    await this.batchProcessor.finalize();

    // Write summary to InfluxDB and finalize
    if (this.influxDBWriter?.isEnabled()) {
      const summary = this.getSummary();
      await this.influxDBWriter.writeSummary(summary);
      await this.influxDBWriter.finalize();
    }

    logger.info(`Metrics collection finalized. Total batches: ${this.batchProcessor.getBatchCounter()}, Total results: ${this.resultStorage.getResultCount()}`);
  }

  /**
   * Record a network call to InfluxDB (if enabled)
   */
  recordNetworkCall(call: CapturedNetworkCall): void {
    if (this.influxDBWriter?.isEnabled()) {
      this.influxDBWriter.writeNetworkCall(call);
    }
  }

  /**
   * Get the InfluxDB writer instance (for direct access if needed)
   */
  getInfluxDBWriter(): InfluxDBWriter | null {
    return this.influxDBWriter;
  }

  getResults(): TestResult[] {
    return this.resultStorage.getResults();
  }

  getSummary(): MetricsSummary {
    return this.summaryGenerator.generate({
      statisticsEngine: this.statisticsEngine,
      errorTracker: this.errorTracker,
      results: this.resultStorage.getResults(),
      vuStartEvents: this.resultStorage.getVUStartEvents(),
      startTime: this.startTime
    });
  }

  clear(): void {
    this.batchProcessor.stop();
    this.statisticsEngine.reset();
    this.errorTracker.clear();
    this.resultStorage.clear();
    this.batchProcessor.reset();
    this.fileWriter.reset();
    this.startTime = 0;
    this.currentTestId = '';
    this.currentTestName = '';
  }

  /**
   * Close all connections (call when done with the collector)
   */
  async close(): Promise<void> {
    this.clear();
    if (this.influxDBWriter) {
      await this.influxDBWriter.close();
    }
  }
}

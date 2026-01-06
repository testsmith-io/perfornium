import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
import { FileManager } from '../utils/file-manager';
import { logger } from '../utils/logger';

export interface StreamingCSVConfig {
  batchSize?: number;           // Write every N results
  flushInterval?: number;       // Write every N milliseconds
  immediateWrite?: boolean;     // Write immediately without batching
  rotateSize?: number;         // Rotate file when it reaches N bytes
  maxFiles?: number;           // Keep max N rotated files
}

export class StreamingCSVOutput implements OutputHandler {
  private filePath: string;
  private csvWriter: any;
  private pendingResults: TestResult[] = [];
  private config: StreamingCSVConfig;
  private flushTimer?: NodeJS.Timeout;
  private fileStream?: fs.WriteStream;
  private headerWritten: boolean = false;
  private totalResults: number = 0;
  private currentFileSize: number = 0;
  private rotationIndex: number = 0;

  private readonly DEFAULT_CONFIG: StreamingCSVConfig = {
    batchSize: 100,
    flushInterval: 5000,
    immediateWrite: false,
    rotateSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 5
  };

  constructor(filePath: string, config?: StreamingCSVConfig) {
    this.filePath = filePath;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    // Process template in file path
    this.filePath = FileManager.processFilePath(this.filePath);
    
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize CSV writer
    this.csvWriter = createObjectCsvWriter({
      path: this.filePath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'vu_id', title: 'vu_id' },
        { id: 'iteration', title: 'iteration' },
        { id: 'scenario', title: 'scenario' },
        { id: 'name', title: 'request_name' },
        { id: 'response_time', title: 'response_time_ms' },
        { id: 'success', title: 'success' },
        { id: 'status', title: 'http_status' },
        { id: 'error', title: 'error' },
        { id: 'response_size', title: 'response_size_bytes' },
        { id: 'request_url', title: 'url' }
      ]
    });

    // Start flush timer if configured
    if (this.config.flushInterval! > 0 && !this.config.immediateWrite) {
      this.flushTimer = setInterval(() => {
        this.flushPending();
      }, this.config.flushInterval!);
    }

    logger.info(`📊 Streaming CSV output initialized: ${this.filePath}`);
    logger.debug(`📊 Config: batch=${this.config.batchSize}, flush=${this.config.flushInterval}ms`);
  }

  async writeResult(result: TestResult): Promise<void> {
    // Add processed timestamp and normalize data
    const processedResult = {
      ...result,
      timestamp: result.timestamp || Date.now(),
      response_time: result.response_time || result.duration || 0,
      name: result.name || result.action || 'request',
      iteration: result.iteration || 0
    };

    this.pendingResults.push(processedResult);
    this.totalResults++;

    if (this.config.immediateWrite) {
      await this.flushPending();
    } else if (this.pendingResults.length >= this.config.batchSize!) {
      await this.flushPending();
    }
  }

  private async flushPending(): Promise<void> {
    if (this.pendingResults.length === 0) return;

    try {
      // Check if we need to rotate the file
      if (this.config.rotateSize! > 0 && this.currentFileSize > this.config.rotateSize!) {
        await this.rotateFile();
      }

      // Write the batch
      const recordsToWrite = [...this.pendingResults];
      this.pendingResults = [];

      await this.csvWriter.writeRecords(recordsToWrite);
      
      // Update file size estimate
      this.currentFileSize += recordsToWrite.length * 200; // Rough estimate

      logger.debug(`📊 Wrote ${recordsToWrite.length} results to CSV (total: ${this.totalResults})`);

    } catch (error) {
      logger.error('❌ Failed to write CSV batch:', error);
      // Re-add results to pending for retry
      this.pendingResults.unshift(...this.pendingResults);
    }
  }

  private async rotateFile(): Promise<void> {
    try {
      // Close current file
      if (this.fileStream) {
        this.fileStream.end();
        this.fileStream = undefined;
      }

      // Create rotated filename
      const ext = path.extname(this.filePath);
      const base = this.filePath.slice(0, -ext.length);
      const rotatedPath = `${base}.${this.rotationIndex}${ext}`;

      // Rename current file
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, rotatedPath);
      }

      // Clean up old files if needed
      if (this.config.maxFiles! > 0) {
        this.cleanupOldFiles(base, ext);
      }

      // Reset for new file
      this.rotationIndex++;
      this.currentFileSize = 0;
      
      // Recreate CSV writer for new file
      await this.initialize();

      logger.info(`🔄 Rotated CSV file: ${this.filePath}`);

    } catch (error) {
      logger.error('❌ Failed to rotate CSV file:', error);
    }
  }

  private cleanupOldFiles(basePath: string, extension: string): void {
    try {
      const dir = path.dirname(basePath);
      const basename = path.basename(basePath);
      
      const files = fs.readdirSync(dir)
        .filter(file => file.startsWith(basename) && file.endsWith(extension))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          index: this.extractRotationIndex(file)
        }))
        .filter(file => file.index >= 0)
        .sort((a, b) => b.index - a.index);

      // Remove excess files
      const filesToRemove = files.slice(this.config.maxFiles!);
      for (const file of filesToRemove) {
        fs.unlinkSync(file.path);
        logger.debug(`🗑️ Removed old CSV file: ${file.name}`);
      }

    } catch (error) {
      logger.warn('⚠️ Failed to cleanup old CSV files:', error);
    }
  }

  private extractRotationIndex(filename: string): number {
    const match = filename.match(/\.(\d+)\.csv$/);
    return match ? parseInt(match[1], 10) : -1;
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    // Write summary to separate file
    const summaryPath = this.filePath.replace('.csv', '_summary.csv');
    const summaryWriter = createObjectCsvWriter({
      path: summaryPath,
      header: [
        { id: 'metric', title: 'metric' },
        { id: 'value', title: 'value' },
        { id: 'unit', title: 'unit' },
        { id: 'timestamp', title: 'timestamp' }
      ]
    });

    const timestamp = Date.now();
    const summaryData = [
      { metric: 'total_requests', value: summary.total_requests, unit: 'count', timestamp },
      { metric: 'successful_requests', value: summary.successful_requests, unit: 'count', timestamp },
      { metric: 'failed_requests', value: summary.failed_requests, unit: 'count', timestamp },
      { metric: 'success_rate', value: summary.success_rate?.toFixed(2) || '0', unit: 'percent', timestamp },
      { metric: 'avg_response_time', value: summary.avg_response_time?.toFixed(2) || '0', unit: 'ms', timestamp },
      { metric: 'min_response_time', value: summary.min_response_time || 0, unit: 'ms', timestamp },
      { metric: 'max_response_time', value: summary.max_response_time || 0, unit: 'ms', timestamp },
      { metric: 'requests_per_second', value: summary.requests_per_second?.toFixed(2) || '0', unit: 'req/s', timestamp },
      { metric: 'total_duration', value: summary.total_duration || 0, unit: 'ms', timestamp }
    ];

    // Add percentiles
    if (summary.percentiles) {
      Object.entries(summary.percentiles).forEach(([p, value]) => {
        summaryData.push({
          metric: `p${p}_response_time`,
          value: typeof value === 'number' ? value.toFixed(2) : '0',
          unit: 'ms',
          timestamp
        });
      });
    }

    await summaryWriter.writeRecords(summaryData);
    logger.info(`📊 Written CSV summary: ${summaryPath}`);
  }

  async finalize(): Promise<void> {
    // Flush any remaining results
    await this.flushPending();

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Close file stream
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = undefined;
    }

    logger.info(`📊 Streaming CSV finalized. Total results: ${this.totalResults}`);
  }

  // Real-time statistics
  getStats(): {
    totalResults: number;
    pendingResults: number;
    currentFileSize: number;
    rotationIndex: number;
  } {
    return {
      totalResults: this.totalResults,
      pendingResults: this.pendingResults.length,
      currentFileSize: this.currentFileSize,
      rotationIndex: this.rotationIndex
    };
  }
}
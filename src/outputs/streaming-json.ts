import * as fs from 'fs';
import * as path from 'path';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
import { FileManager } from '../utils/file-manager';
import { logger } from '../utils/logger';

export interface StreamingJSONConfig {
  format?: 'ndjson' | 'json-array' | 'json-stream';  // Output format
  batchSize?: number;                                  // Write every N results
  flushInterval?: number;                             // Write every N milliseconds
  prettify?: boolean;                                 // Pretty-print JSON
  includeMetadata?: boolean;                          // Include run metadata
  rotateSize?: number;                               // Rotate file when it reaches N bytes
  maxFiles?: number;                                 // Keep max N rotated files
}

export class StreamingJSONOutput implements OutputHandler {
  private filePath: string;
  private config: StreamingJSONConfig;
  private pendingResults: TestResult[] = [];
  private fileStream?: fs.WriteStream;
  private flushTimer?: NodeJS.Timeout;
  private totalResults: number = 0;
  private currentFileSize: number = 0;
  private rotationIndex: number = 0;
  private isFirstWrite: boolean = true;
  private testStartTime: number = Date.now();

  private readonly DEFAULT_CONFIG: StreamingJSONConfig = {
    format: 'ndjson',
    batchSize: 50,
    flushInterval: 3000,
    prettify: false,
    includeMetadata: true,
    rotateSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 3
  };

  constructor(filePath: string, config?: StreamingJSONConfig) {
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

    // Create write stream
    this.fileStream = fs.createWriteStream(this.filePath, { flags: 'w' });
    
    // Write file header based on format
    await this.writeHeader();

    // Start flush timer
    if (this.config.flushInterval! > 0) {
      this.flushTimer = setInterval(() => {
        this.flushPending();
      }, this.config.flushInterval!);
    }

    logger.info(`📊 Streaming JSON output initialized: ${this.filePath}`);
    logger.debug(`📊 Format: ${this.config.format}, batch: ${this.config.batchSize}`);
  }

  private async writeHeader(): Promise<void> {
    if (!this.fileStream) return;

    switch (this.config.format) {
      case 'json-array':
        if (this.config.includeMetadata) {
          const metadata = {
            _metadata: {
              format: 'perfornium-results',
              version: '1.0',
              test_start: new Date(this.testStartTime).toISOString(),
              generator: 'perfornium-streaming-json'
            },
            results: []
          };
          this.fileStream.write('{\n');
          this.fileStream.write(`  "_metadata": ${JSON.stringify(metadata._metadata, null, 2).replace(/\n/g, '\n  ')},\n`);
          this.fileStream.write('  "results": [\n');
        } else {
          this.fileStream.write('[\n');
        }
        break;
        
      case 'json-stream':
        if (this.config.includeMetadata) {
          const metadata = {
            type: 'metadata',
            format: 'perfornium-results',
            version: '1.0',
            test_start: new Date(this.testStartTime).toISOString(),
            generator: 'perfornium-streaming-json'
          };
          this.fileStream.write(JSON.stringify(metadata) + '\n');
        }
        break;
        
      case 'ndjson':
      default:
        // NDJSON doesn't need a header, but we can add metadata as first line
        if (this.config.includeMetadata) {
          const metadata = {
            _type: 'metadata',
            format: 'perfornium-results',
            version: '1.0',
            test_start: new Date(this.testStartTime).toISOString(),
            generator: 'perfornium-streaming-json'
          };
          this.fileStream.write(JSON.stringify(metadata) + '\n');
        }
        break;
    }

    this.currentFileSize = this.fileStream.bytesWritten || 0;
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

    if (this.pendingResults.length >= this.config.batchSize!) {
      await this.flushPending();
    }
  }

  private async flushPending(): Promise<void> {
    if (this.pendingResults.length === 0 || !this.fileStream) return;

    try {
      // Check if we need to rotate the file
      if (this.config.rotateSize! > 0 && this.currentFileSize > this.config.rotateSize!) {
        await this.rotateFile();
      }

      const recordsToWrite = [...this.pendingResults];
      this.pendingResults = [];

      // Write records based on format
      await this.writeRecords(recordsToWrite);
      
      this.currentFileSize = this.fileStream!.bytesWritten || 0;

      logger.debug(`📊 Wrote ${recordsToWrite.length} JSON results (total: ${this.totalResults})`);

    } catch (error) {
      logger.error('❌ Failed to write JSON batch:', error);
      // Re-add results to pending for retry
      this.pendingResults.unshift(...this.pendingResults);
    }
  }

  private async writeRecords(records: TestResult[]): Promise<void> {
    if (!this.fileStream) return;

    switch (this.config.format) {
      case 'json-array':
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          const isLast = i === records.length - 1;
          const json = this.config.prettify 
            ? JSON.stringify(record, null, 2).replace(/\n/g, '\n    ')
            : JSON.stringify(record);
          
          if (!this.isFirstWrite) {
            this.fileStream.write(',\n');
          }
          this.fileStream.write(`    ${json}`);
          this.isFirstWrite = false;
        }
        break;

      case 'json-stream':
        for (const record of records) {
          const streamRecord = {
            type: 'result',
            timestamp: Date.now(),
            data: record
          };
          const json = this.config.prettify 
            ? JSON.stringify(streamRecord, null, 2)
            : JSON.stringify(streamRecord);
          this.fileStream.write(json + '\n');
        }
        break;

      case 'ndjson':
      default:
        for (const record of records) {
          const json = this.config.prettify 
            ? JSON.stringify(record, null, 2)
            : JSON.stringify(record);
          this.fileStream.write(json + '\n');
        }
        break;
    }
  }

  private async rotateFile(): Promise<void> {
    try {
      // Close current file properly
      await this.closeCurrentFile();

      // Create rotated filename
      const ext = path.extname(this.filePath);
      const base = this.filePath.slice(0, -ext.length);
      const rotatedPath = `${base}.${this.rotationIndex}${ext}`;

      // Rename current file
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, rotatedPath);
      }

      // Clean up old files
      this.cleanupOldFiles(base, ext);

      // Reset state
      this.rotationIndex++;
      this.currentFileSize = 0;
      this.isFirstWrite = true;
      
      // Reinitialize for new file
      await this.initialize();

      logger.info(`🔄 Rotated JSON file: ${this.filePath}`);

    } catch (error) {
      logger.error('❌ Failed to rotate JSON file:', error);
    }
  }

  private async closeCurrentFile(): Promise<void> {
    if (!this.fileStream) return;

    // Write file footer based on format
    switch (this.config.format) {
      case 'json-array':
        this.fileStream.write('\n  ]');
        if (this.config.includeMetadata) {
          const endMetadata = {
            test_end: new Date().toISOString(),
            total_results: this.totalResults,
            duration_ms: Date.now() - this.testStartTime
          };
          this.fileStream.write(',\n  "_summary": ' + JSON.stringify(endMetadata, null, 2).replace(/\n/g, '\n  '));
        }
        this.fileStream.write('\n}\n');
        break;

      case 'json-stream':
        if (this.config.includeMetadata) {
          const endMetadata = {
            type: 'summary',
            test_end: new Date().toISOString(),
            total_results: this.totalResults,
            duration_ms: Date.now() - this.testStartTime
          };
          this.fileStream.write(JSON.stringify(endMetadata) + '\n');
        }
        break;

      case 'ndjson':
      default:
        if (this.config.includeMetadata) {
          const endMetadata = {
            _type: 'summary',
            test_end: new Date().toISOString(),
            total_results: this.totalResults,
            duration_ms: Date.now() - this.testStartTime
          };
          this.fileStream.write(JSON.stringify(endMetadata) + '\n');
        }
        break;
    }

    return new Promise((resolve) => {
      this.fileStream!.end(() => {
        this.fileStream = undefined;
        resolve();
      });
    });
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
        logger.debug(`🗑️ Removed old JSON file: ${file.name}`);
      }

    } catch (error) {
      logger.warn('⚠️ Failed to cleanup old JSON files:', error);
    }
  }

  private extractRotationIndex(filename: string): number {
    const match = filename.match(/\.(\d+)\.json$/);
    return match ? parseInt(match[1], 10) : -1;
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    // Write summary to separate file
    const summaryPath = this.filePath.replace('.json', '_summary.json');
    
    const summaryData = {
      test_summary: {
        timestamp: Date.now(),
        test_end: new Date().toISOString(),
        total_duration_ms: Date.now() - this.testStartTime,
        ...summary
      }
    };

    const json = this.config.prettify 
      ? JSON.stringify(summaryData, null, 2)
      : JSON.stringify(summaryData);

    fs.writeFileSync(summaryPath, json);
    logger.info(`📊 Written JSON summary: ${summaryPath}`);
  }

  async finalize(): Promise<void> {
    // Flush any remaining results
    await this.flushPending();

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Close file properly
    await this.closeCurrentFile();

    logger.info(`📊 Streaming JSON finalized. Total results: ${this.totalResults}`);
  }

  getStats(): {
    totalResults: number;
    pendingResults: number;
    currentFileSize: number;
    rotationIndex: number;
    format: string;
  } {
    return {
      totalResults: this.totalResults,
      pendingResults: this.pendingResults.length,
      currentFileSize: this.currentFileSize,
      rotationIndex: this.rotationIndex,
      format: this.config.format || 'ndjson'
    };
  }
}
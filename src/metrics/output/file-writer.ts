import * as fs from 'fs/promises';
import * as path from 'path';
import { TestResult } from '../types';
import { logger } from '../../utils/logger';

export interface FileOutputConfig {
  enabled: boolean;
  path: string;
  format: 'jsonl' | 'csv';
}

export interface IncrementalFilesConfig {
  enabled: boolean;
  jsonPath?: string;
}

export class FileWriter {
  private incrementalConfig: IncrementalFilesConfig | null = null;

  async initialize(config: IncrementalFilesConfig): Promise<void> {
    this.incrementalConfig = config;

    if (!config.enabled) return;

    try {
      // Initialize JSON file
      if (config.jsonPath) {
        const dir = path.dirname(config.jsonPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(config.jsonPath, '[]');
        logger.debug(`Initialized incremental JSON file: ${config.jsonPath}`);
      }
    } catch (error) {
      logger.error('Failed to initialize incremental files:', error);
    }
  }

  reset(): void {
    // No state to reset
  }

  async writeBatchToFile(batch: TestResult[], config: FileOutputConfig, batchNumber: number): Promise<void> {
    if (!config.enabled) return;

    try {
      const dir = path.dirname(config.path);
      await fs.mkdir(dir, { recursive: true });

      let content: string;

      if (config.format === 'csv') {
        content = this.formatBatchAsCSV(batch, batchNumber);
      } else {
        // JSONL format (default)
        content = batch.map(result => JSON.stringify({
          ...result,
          timestamp: new Date(result.timestamp).toISOString(),
          batch_number: batchNumber
        })).join('\n') + '\n';
      }

      await fs.appendFile(config.path, content);
    } catch (error) {
      logger.error('Failed to write batch to file:', error);
    }
  }

  private formatBatchAsCSV(batch: TestResult[], batchNumber: number): string {
    return batch.map(result => [
      new Date(result.timestamp).toISOString(),
      batchNumber,
      result.vu_id,
      result.scenario,
      result.action,
      result.step_name || '',
      result.duration,
      result.success,
      result.status || '',
      (result.error || '').replace(/"/g, '""')
    ].join(',')).join('\n') + '\n';
  }

  async updateIncrementalFiles(batch: TestResult[]): Promise<void> {
    if (!this.incrementalConfig?.enabled) return;

    try {
      if (this.incrementalConfig.jsonPath) {
        await this.updateIncrementalJSON(batch, this.incrementalConfig.jsonPath);
      }
    } catch (error) {
      logger.error('Failed to update incremental files:', error);
    }
  }

  private async updateIncrementalJSON(batch: TestResult[], filePath: string): Promise<void> {
    try {
      const existingContent = await fs.readFile(filePath, 'utf8');
      let existingData: TestResult[] = [];

      if (existingContent.trim()) {
        existingData = JSON.parse(existingContent);
      }

      const updatedData = [...existingData, ...batch];
      await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2));
    } catch (error) {
      await fs.writeFile(filePath, JSON.stringify(batch, null, 2));
    }
  }

}

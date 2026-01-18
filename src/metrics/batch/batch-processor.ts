import { TestResult } from '../types';
import { logger } from '../../utils/logger';

export interface BatchConfig {
  batchSize: number;
  intervalMs?: number;
  maxBufferSize: number;
}

export interface BatchFlushHandler {
  (batch: TestResult[], batchNumber: number): Promise<void>;
}

export class BatchProcessor {
  private config: BatchConfig;
  private buffer: TestResult[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchCounter: number = 0;
  private onFlush: BatchFlushHandler | null = null;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      batchSize: config.batchSize || 10,
      intervalMs: config.intervalMs,
      maxBufferSize: config.maxBufferSize || 1000
    };
  }

  setFlushHandler(handler: BatchFlushHandler): void {
    this.onFlush = handler;
  }

  start(): void {
    if (this.config.intervalMs) {
      this.startTimer();
    }
  }

  stop(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  reset(): void {
    this.stop();
    this.buffer = [];
    this.batchCounter = 0;
  }

  private startTimer(): void {
    this.batchTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.intervalMs);
  }

  add(result: TestResult): void {
    // Safety limit: force flush if buffer exceeds max size
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }

    this.buffer.push(result);

    // Check if we should flush based on batch size (if not using intervals)
    if (!this.config.intervalMs) {
      if (this.buffer.length >= this.config.batchSize) {
        this.flush();
      }
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];
    this.batchCounter++;

    logger.debug(`Flushing batch #${this.batchCounter} with ${batch.length} results`);

    if (this.onFlush) {
      try {
        await this.onFlush(batch, this.batchCounter);
      } catch (error) {
        logger.error('Failed to flush metrics batch:', error);
      }
    }
  }

  async finalize(): Promise<void> {
    this.stop();
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  getBatchCounter(): number {
    return this.batchCounter;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}

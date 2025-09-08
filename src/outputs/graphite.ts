import * as net from 'net';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
import { logger } from '../utils/logger';

export class GraphiteOutput implements OutputHandler {
  private host: string;
  private port: number;
  private prefix: string;
  private client?: net.Socket;

  constructor(host: string = 'localhost', port: number = 2003, prefix: string = 'perfornium') {
    this.host = host;
    this.port = port;
    this.prefix = prefix;
  }

  async initialize(): Promise<void> {
    try {
      this.client = new net.Socket();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Graphite connection timeout'));
        }, 5000);

        this.client!.connect(this.port, this.host, () => {
          clearTimeout(timeout);
          logger.debug(`📊 Connected to Graphite at ${this.host}:${this.port}`);
          resolve();
        });

        this.client!.on('error', (error) => {
          clearTimeout(timeout);
          logger.warn('⚠️  Graphite connection error:', error);
          reject(error);
        });
      });
    } catch (error) {
      logger.warn('⚠️  Failed to connect to Graphite:', error);
      throw error;
    }
  }

  async writeResult(result: TestResult): Promise<void> {
    if (!this.client || this.client.destroyed) {
      return; // Skip if not connected
    }

    try {
      const timestamp = Math.floor(result.timestamp / 1000);
      const metricPrefix = `${this.prefix}.${result.scenario}.${result.action}`;
      
      const metrics = [
        `${metricPrefix}.duration ${result.duration} ${timestamp}`,
        `${metricPrefix}.success ${result.success ? 1 : 0} ${timestamp}`
      ];

      if (result.status) {
        metrics.push(`${metricPrefix}.status ${result.status} ${timestamp}`);
      }

      if (result.response_size) {
        metrics.push(`${metricPrefix}.response_size ${result.response_size} ${timestamp}`);
      }

      const data = metrics.join('\n') + '\n';
      this.client.write(data);

    } catch (error) {
      logger.warn('⚠️  Failed to write to Graphite:', error);
    }
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    if (!this.client || this.client.destroyed) {
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const summaryPrefix = `${this.prefix}.summary`;
      
      const metrics = [
        `${summaryPrefix}.total_requests ${summary.total_requests} ${timestamp}`,
        `${summaryPrefix}.successful_requests ${summary.successful_requests} ${timestamp}`,
        `${summaryPrefix}.failed_requests ${summary.failed_requests} ${timestamp}`,
        `${summaryPrefix}.success_rate ${summary.success_rate} ${timestamp}`,
        `${summaryPrefix}.avg_response_time ${summary.avg_response_time} ${timestamp}`,
        `${summaryPrefix}.requests_per_second ${summary.requests_per_second} ${timestamp}`,
        `${summaryPrefix}.total_duration ${summary.total_duration} ${timestamp}`
      ];

      // Add percentiles
      Object.entries(summary.percentiles).forEach(([percentile, value]) => {
        metrics.push(`${summaryPrefix}.p${percentile} ${value} ${timestamp}`);
      });

      const data = metrics.join('\n') + '\n';
      this.client.write(data);

    } catch (error) {
      logger.warn('⚠️  Failed to write summary to Graphite:', error);
    }
  }

  async finalize(): Promise<void> {
    if (this.client && !this.client.destroyed) {
      this.client.end();
    }
  }
}

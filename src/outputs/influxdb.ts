import { InfluxDB, IPoint } from 'influx';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
import { logger } from '../utils/logger';

export class InfluxDBOutput implements OutputHandler {
  private client: InfluxDB;
  private database: string;
  private tags: Record<string, string>;

  constructor(url: string, database: string, tags: Record<string, string> = {}) {
    this.client = new InfluxDB(url);
    this.database = database;
    this.tags = tags;
  }

  async initialize(): Promise<void> {
    try {
      const databases = await this.client.getDatabaseNames();
      if (!databases.includes(this.database)) {
        await this.client.createDatabase(this.database);
      }
      logger.debug(`📊 InfluxDB output initialized: ${this.database}`);
    } catch (error) {
      logger.warn('⚠️  Could not initialize InfluxDB:', error);
      throw error;
    }
  }

  async writeResult(result: TestResult): Promise<void> {
    try {
      const point: IPoint = {
        measurement: 'performance_test',
        tags: {
          ...this.tags,
          scenario: result.scenario,
          action: result.action,
          success: result.success.toString(),
          vu_id: result.vu_id.toString()
        },
        fields: {
          duration: result.duration,
          response_size: result.response_size || 0,
          status: result.status || 0
        },
        timestamp: new Date(result.timestamp)
      };

      if (result.error) {
        point.tags!.error = result.error;
      }

      await this.client.writePoints([point], { database: this.database });
    } catch (error) {
      logger.warn('⚠️  Could not write to InfluxDB:', error);
    }
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    try {
      const summaryPoints: IPoint[] = [
        {
          measurement: 'test_summary',
          tags: this.tags,
          fields: {
            total_requests: summary.total_requests,
            successful_requests: summary.successful_requests,
            failed_requests: summary.failed_requests,
            success_rate: summary.success_rate,
            avg_response_time: summary.avg_response_time,
            min_response_time: summary.min_response_time,
            max_response_time: summary.max_response_time,
            requests_per_second: summary.requests_per_second,
            total_duration: summary.total_duration
          },
          timestamp: new Date()
        }
      ];

      await this.client.writePoints(summaryPoints, { database: this.database });
    } catch (error) {
      logger.warn('⚠️  Could not write summary to InfluxDB:', error);
    }
  }

  async finalize(): Promise<void> {
    // InfluxDB doesn't need explicit finalization
  }
}
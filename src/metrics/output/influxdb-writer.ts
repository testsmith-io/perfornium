import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { logger } from '../../utils/logger';
import { TestResult, MetricsSummary, CapturedNetworkCall } from '../types';

export interface InfluxDBWriterConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  /** Batch size for writing points (default: 100) */
  batchSize?: number;
  /** Flush interval in ms (default: 1000) */
  flushInterval?: number;
}

export interface TestMetricsQueryOptions {
  testId?: string;
  testName?: string;
  startTime?: Date;
  endTime?: Date;
  scenario?: string;
  limit?: number;
}

/**
 * InfluxDB writer for test metrics (response times, network calls, etc.)
 * This is optional - test results can still be stored as JSON files.
 */
export class InfluxDBWriter {
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private queryApi: QueryApi | null = null;
  private config: InfluxDBWriterConfig;
  private enabled: boolean = false;
  private currentTestId: string = '';
  private currentTestName: string = '';

  constructor(config?: Partial<InfluxDBWriterConfig>) {
    this.config = {
      url: config?.url || process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: config?.token || process.env.INFLUXDB_TOKEN || '',
      org: config?.org || process.env.INFLUXDB_ORG || 'perfornium',
      bucket: config?.bucket || process.env.INFLUXDB_BUCKET || 'metrics',
      batchSize: config?.batchSize || 100,
      flushInterval: config?.flushInterval || 1000
    };
  }

  async connect(): Promise<boolean> {
    if (!this.config.token) {
      logger.debug('InfluxDB token not configured, test metrics will only be stored in files');
      return false;
    }

    try {
      this.client = new InfluxDB({
        url: this.config.url,
        token: this.config.token
      });

      this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket, 'ms', {
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval
      });
      this.queryApi = this.client.getQueryApi(this.config.org);

      // Test connection
      const query = `from(bucket: "${this.config.bucket}") |> range(start: -1s) |> limit(n: 1)`;
      await this.queryApi.collectRows(query);

      this.enabled = true;
      logger.info(`InfluxDB connected for test metrics at ${this.config.url}`);
      return true;
    } catch (error: any) {
      logger.warn(`Failed to connect to InfluxDB for test metrics: ${error.message}`);
      this.enabled = false;
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start a new test run - sets the test ID and name for all subsequent writes
   */
  startTest(testId: string, testName: string): void {
    this.currentTestId = testId;
    this.currentTestName = testName;
    logger.debug(`InfluxDB writer started for test: ${testName} (${testId})`);
  }

  /**
   * Write a single test result to InfluxDB
   */
  async writeResult(result: TestResult): Promise<void> {
    if (!this.enabled || !this.writeApi) return;

    try {
      const point = new Point('test_result')
        .tag('test_id', this.currentTestId)
        .tag('test_name', this.currentTestName)
        .tag('scenario', result.scenario || 'default')
        .tag('action', result.action || result.step_name || 'unknown')
        .tag('success', result.success ? 'true' : 'false')
        .intField('vu_id', result.vu_id)
        .intField('iteration', result.iteration || 0)
        .floatField('duration', result.duration || 0)
        .intField('status', result.status || 0)
        .timestamp(new Date(result.timestamp));

      if (result.response_size) {
        point.intField('response_size', result.response_size);
      }
      if (result.connect_time !== undefined) {
        point.floatField('connect_time', result.connect_time);
      }
      if (result.latency !== undefined) {
        point.floatField('latency', result.latency);
      }
      if (result.error) {
        point.stringField('error', result.error.substring(0, 255));
      }
      if (result.request_url) {
        point.stringField('request_url', result.request_url.substring(0, 500));
      }
      if (result.request_method) {
        point.tag('method', result.request_method);
      }

      this.writeApi.writePoint(point);
    } catch (error: any) {
      logger.error(`Failed to write test result to InfluxDB: ${error.message}`);
    }
  }

  /**
   * Write a batch of test results to InfluxDB
   */
  async writeBatch(results: TestResult[]): Promise<void> {
    if (!this.enabled || !this.writeApi) return;

    for (const result of results) {
      await this.writeResult(result);
    }

    try {
      await this.writeApi.flush();
    } catch (error: any) {
      logger.error(`Failed to flush test results to InfluxDB: ${error.message}`);
    }
  }

  /**
   * Write a network call to InfluxDB
   */
  async writeNetworkCall(call: CapturedNetworkCall): Promise<void> {
    if (!this.enabled || !this.writeApi) return;

    try {
      const point = new Point('network_call')
        .tag('test_id', this.currentTestId)
        .tag('test_name', this.currentTestName)
        .tag('method', call.request_method || 'GET')
        .tag('success', call.success ? 'true' : 'false')
        .tag('resource_type', call.resource_type || 'other')
        .intField('vu_id', call.vu_id)
        .floatField('duration', call.duration || 0)
        .intField('status', call.response_status || 0)
        .intField('response_size', call.response_size || 0)
        .stringField('url', (call.request_url || '').substring(0, 500))
        .timestamp(new Date(call.timestamp));

      if (call.scenario) {
        point.tag('scenario', call.scenario);
      }
      if (call.step_name) {
        point.tag('step_name', call.step_name);
      }
      if (call.error) {
        point.stringField('error', call.error.substring(0, 255));
      }

      this.writeApi.writePoint(point);
    } catch (error: any) {
      logger.error(`Failed to write network call to InfluxDB: ${error.message}`);
    }
  }

  /**
   * Write test summary to InfluxDB
   */
  async writeSummary(summary: MetricsSummary): Promise<void> {
    if (!this.enabled || !this.writeApi) return;

    try {
      const point = new Point('test_summary')
        .tag('test_id', this.currentTestId)
        .tag('test_name', this.currentTestName)
        .intField('total_requests', summary.total_requests)
        .intField('successful_requests', summary.successful_requests)
        .intField('failed_requests', summary.failed_requests)
        .floatField('success_rate', summary.success_rate)
        .floatField('avg_response_time', summary.avg_response_time)
        .floatField('min_response_time', summary.min_response_time)
        .floatField('max_response_time', summary.max_response_time)
        .floatField('p50', summary.percentiles[50] || 0)
        .floatField('p90', summary.percentiles[90] || 0)
        .floatField('p95', summary.percentiles[95] || 0)
        .floatField('p99', summary.percentiles[99] || 0)
        .floatField('requests_per_second', summary.requests_per_second)
        .floatField('total_duration', summary.total_duration)
        .timestamp(new Date());

      this.writeApi.writePoint(point);
      await this.writeApi.flush();
    } catch (error: any) {
      logger.error(`Failed to write test summary to InfluxDB: ${error.message}`);
    }
  }

  /**
   * Query test results from InfluxDB
   */
  async queryResults(options: TestMetricsQueryOptions = {}): Promise<TestResult[]> {
    if (!this.enabled || !this.queryApi) return [];

    try {
      const startTime = options.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = options.endTime || new Date();

      // Validate time range
      if (startTime.getTime() >= endTime.getTime()) {
        logger.debug('Invalid time range for test results query');
        return [];
      }

      let query = `from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "test_result")`;

      if (options.testId) {
        query += `\n        |> filter(fn: (r) => r.test_id == "${options.testId}")`;
      }
      if (options.testName) {
        query += `\n        |> filter(fn: (r) => r.test_name == "${options.testName}")`;
      }
      if (options.scenario) {
        query += `\n        |> filter(fn: (r) => r.scenario == "${options.scenario}")`;
      }

      query += `\n        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;

      if (options.limit) {
        query += `\n        |> limit(n: ${options.limit})`;
      }

      const rows = await this.queryApi.collectRows(query);
      return this.rowsToResults(rows);
    } catch (error: any) {
      logger.error(`Failed to query test results from InfluxDB: ${error.message}`);
      return [];
    }
  }

  /**
   * Query network calls from InfluxDB
   */
  async queryNetworkCalls(options: TestMetricsQueryOptions = {}): Promise<CapturedNetworkCall[]> {
    if (!this.enabled || !this.queryApi) return [];

    try {
      const startTime = options.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = options.endTime || new Date();

      // Validate time range
      if (startTime.getTime() >= endTime.getTime()) {
        logger.debug('Invalid time range for network calls query');
        return [];
      }

      let query = `from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "network_call")`;

      if (options.testId) {
        query += `\n        |> filter(fn: (r) => r.test_id == "${options.testId}")`;
      }
      if (options.testName) {
        query += `\n        |> filter(fn: (r) => r.test_name == "${options.testName}")`;
      }

      query += `\n        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;

      if (options.limit) {
        query += `\n        |> limit(n: ${options.limit})`;
      }

      const rows = await this.queryApi.collectRows(query);
      return this.rowsToNetworkCalls(rows);
    } catch (error: any) {
      logger.error(`Failed to query network calls from InfluxDB: ${error.message}`);
      return [];
    }
  }

  /**
   * Get list of test runs
   */
  async getTestRuns(limit: number = 100): Promise<Array<{ testId: string; testName: string; timestamp: Date }>> {
    if (!this.enabled || !this.queryApi) return [];

    try {
      const query = `from(bucket: "${this.config.bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "test_summary")
        |> keep(columns: ["test_id", "test_name", "_time"])
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})`;

      const rows = await this.queryApi.collectRows(query);
      return rows.map((row: any) => ({
        testId: row.test_id,
        testName: row.test_name,
        timestamp: new Date(row._time)
      }));
    } catch (error: any) {
      logger.error(`Failed to get test runs from InfluxDB: ${error.message}`);
      return [];
    }
  }

  /**
   * Export test data for a specific test run
   */
  async exportTestData(testId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const results = await this.queryResults({ testId });
    const networkCalls = await this.queryNetworkCalls({ testId });

    const data = {
      testId,
      results,
      networkCalls,
      exportedAt: new Date().toISOString()
    };

    if (format === 'csv') {
      return this.resultsToCSV(results);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Finalize the current test - flush all pending writes
   */
  async finalize(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.flush();
        logger.debug('InfluxDB writer finalized for test: ' + this.currentTestName);
      } catch (error: any) {
        logger.error(`Failed to finalize InfluxDB writes: ${error.message}`);
      }
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.writeApi) {
      await this.writeApi.close();
    }
  }

  private rowsToResults(rows: any[]): TestResult[] {
    return rows.map(row => ({
      id: `${row.test_id}-${row._time}`,
      vu_id: row.vu_id || 0,
      iteration: row.iteration || 0,
      scenario: row.scenario || 'default',
      action: row.action || 'unknown',
      timestamp: new Date(row._time).getTime(),
      duration: row.duration || 0,
      success: row.success === 'true',
      status: row.status || 0,
      response_size: row.response_size,
      connect_time: row.connect_time,
      latency: row.latency,
      error: row.error,
      request_url: row.request_url,
      request_method: row.method
    }));
  }

  private rowsToNetworkCalls(rows: any[]): CapturedNetworkCall[] {
    return rows.map(row => ({
      id: `${row.test_id}-${row._time}`,
      vu_id: row.vu_id || 0,
      timestamp: new Date(row._time).getTime(),
      request_url: row.url || '',
      request_method: row.method || 'GET',
      response_status: row.status || 0,
      response_size: row.response_size || 0,
      start_time: new Date(row._time).getTime(),
      duration: row.duration || 0,
      resource_type: row.resource_type || 'other',
      success: row.success === 'true',
      error: row.error,
      scenario: row.scenario,
      step_name: row.step_name
    }));
  }

  private resultsToCSV(results: TestResult[]): string {
    const headers = [
      'timestamp', 'vu_id', 'iteration', 'scenario', 'action', 'success',
      'duration', 'status', 'response_size', 'connect_time', 'latency',
      'request_url', 'request_method', 'error'
    ];

    const rows = results.map(r => [
      new Date(r.timestamp).toISOString(),
      r.vu_id,
      r.iteration || 0,
      r.scenario,
      r.action || '',
      r.success,
      r.duration || 0,
      r.status || 0,
      r.response_size || 0,
      r.connect_time || 0,
      r.latency || 0,
      (r.request_url || '').replace(/,/g, ';'),
      r.request_method || '',
      (r.error || '').replace(/,/g, ';').replace(/\n/g, ' ')
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}

// Singleton instance for global access
let influxDBWriter: InfluxDBWriter | null = null;

export function getInfluxDBWriter(): InfluxDBWriter | null {
  return influxDBWriter;
}

export function setInfluxDBWriter(writer: InfluxDBWriter): void {
  influxDBWriter = writer;
}

export async function initInfluxDBWriter(config?: Partial<InfluxDBWriterConfig>): Promise<InfluxDBWriter> {
  influxDBWriter = new InfluxDBWriter(config);
  await influxDBWriter.connect();
  return influxDBWriter;
}

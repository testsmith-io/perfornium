import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { logger } from '../../utils/logger';
import { InfrastructureMetrics } from '../types';

export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

export interface InfraQueryOptions {
  host?: string;
  startTime?: Date;
  endTime?: Date;
  testId?: string;
  limit?: number;
}

export class InfluxDBService {
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private queryApi: QueryApi | null = null;
  private config: InfluxDBConfig;
  private enabled: boolean = false;
  private fallbackBuffer: Map<string, InfrastructureMetrics[]> = new Map();
  private readonly MAX_BUFFER_SIZE = 120;

  constructor(config?: Partial<InfluxDBConfig>) {
    this.config = {
      url: config?.url || process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: config?.token || process.env.INFLUXDB_TOKEN || '',
      org: config?.org || process.env.INFLUXDB_ORG || 'perfornium',
      bucket: config?.bucket || process.env.INFLUXDB_BUCKET || 'metrics'
    };
  }

  async connect(): Promise<boolean> {
    if (!this.config.token) {
      logger.info('InfluxDB token not configured, using in-memory storage');
      return false;
    }

    try {
      this.client = new InfluxDB({
        url: this.config.url,
        token: this.config.token
      });

      this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket, 'ms');
      this.queryApi = this.client.getQueryApi(this.config.org);

      // Test connection with a simple query
      const query = `from(bucket: "${this.config.bucket}") |> range(start: -1s) |> limit(n: 1)`;
      await this.queryApi.collectRows(query);

      this.enabled = true;
      logger.info(`Connected to InfluxDB at ${this.config.url}`);
      return true;
    } catch (error: any) {
      logger.warn(`Failed to connect to InfluxDB: ${error.message}. Using in-memory storage.`);
      this.enabled = false;
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async writeMetrics(data: InfrastructureMetrics): Promise<void> {
    // Always store in fallback buffer for real-time display
    this.addToFallbackBuffer(data);

    if (!this.enabled || !this.writeApi) {
      return;
    }

    try {
      const point = new Point('infrastructure_metrics')
        .tag('host', data.host)
        .floatField('cpu_usage', data.metrics?.cpu?.usage_percent || 0)
        .floatField('memory_usage', data.metrics?.memory?.usage_percent || 0)
        .floatField('memory_used_mb', data.metrics?.memory?.used_mb || 0)
        .floatField('memory_total_mb', data.metrics?.memory?.total_mb || 0)
        .floatField('disk_usage', data.metrics?.disk?.usage_percent || 0)
        .floatField('disk_used_gb', data.metrics?.disk?.used_gb || 0)
        .floatField('disk_total_gb', data.metrics?.disk?.total_gb || 0)
        .stringField('disk_path', data.metrics?.disk?.path || '/')
        .floatField('network_bytes_in', data.metrics?.network?.bytes_in || 0)
        .floatField('network_bytes_out', data.metrics?.network?.bytes_out || 0)
        .stringField('network_interface', data.metrics?.network?.interface || 'eth0')
        .intField('interval_seconds', data.interval_seconds || 5)
        .timestamp(new Date(data.timestamp));

      this.writeApi.writePoint(point);
      await this.writeApi.flush();
    } catch (error: any) {
      logger.error(`Failed to write to InfluxDB: ${error.message}`);
    }
  }

  async queryMetrics(options: InfraQueryOptions = {}): Promise<InfrastructureMetrics[]> {
    if (!this.enabled || !this.queryApi) {
      return this.queryFallbackBuffer(options);
    }

    try {
      const startTime = options.startTime || new Date(Date.now() - 10 * 60 * 1000); // Default 10 minutes
      const endTime = options.endTime || new Date();

      // Validate time range - start must be before end
      if (startTime.getTime() >= endTime.getTime()) {
        logger.debug('Invalid time range for InfluxDB query, using fallback buffer');
        return this.queryFallbackBuffer(options);
      }

      let query = `from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "infrastructure_metrics")`;

      if (options.host) {
        query += `\n        |> filter(fn: (r) => r.host == "${options.host}")`;
      }

      query += `\n        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;

      if (options.limit) {
        query += `\n        |> limit(n: ${options.limit})`;
      }

      const rows = await this.queryApi.collectRows(query);
      return this.rowsToMetrics(rows);
    } catch (error: any) {
      logger.error(`Failed to query InfluxDB: ${error.message}`);
      return this.queryFallbackBuffer(options);
    }
  }

  async queryMetricsByTestRun(testId: string, startTime: Date, endTime: Date): Promise<Record<string, InfrastructureMetrics[]>> {
    const metrics = await this.queryMetrics({ startTime, endTime });

    // Group by host
    const grouped: Record<string, InfrastructureMetrics[]> = {};
    for (const metric of metrics) {
      if (!grouped[metric.host]) {
        grouped[metric.host] = [];
      }
      grouped[metric.host].push(metric);
    }

    return grouped;
  }

  async getHosts(): Promise<string[]> {
    if (!this.enabled || !this.queryApi) {
      return Array.from(this.fallbackBuffer.keys());
    }

    try {
      const query = `from(bucket: "${this.config.bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "infrastructure_metrics")
        |> keep(columns: ["host"])
        |> distinct(column: "host")`;

      const rows = await this.queryApi.collectRows(query);
      return rows.map((row: any) => row.host).filter(Boolean);
    } catch (error: any) {
      logger.error(`Failed to get hosts from InfluxDB: ${error.message}`);
      return Array.from(this.fallbackBuffer.keys());
    }
  }

  async getLatestMetrics(): Promise<Record<string, InfrastructureMetrics | null>> {
    const hosts = await this.getHosts();
    const result: Record<string, InfrastructureMetrics | null> = {};

    for (const host of hosts) {
      const metrics = await this.queryMetrics({ host, limit: 1 });
      result[host] = metrics.length > 0 ? metrics[metrics.length - 1] : null;
    }

    // Include fallback buffer hosts
    for (const [host, buffer] of this.fallbackBuffer) {
      if (!result[host] && buffer.length > 0) {
        result[host] = buffer[buffer.length - 1];
      }
    }

    return result;
  }

  async exportMetrics(options: InfraQueryOptions, format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.queryMetrics(options);

    if (format === 'csv') {
      return this.metricsToCSV(metrics);
    }

    return JSON.stringify(metrics, null, 2);
  }

  async importMetrics(data: string, format: 'json' | 'csv' = 'json'): Promise<number> {
    let metrics: InfrastructureMetrics[];

    if (format === 'csv') {
      metrics = this.csvToMetrics(data);
    } else {
      metrics = JSON.parse(data);
    }

    let count = 0;
    for (const metric of metrics) {
      await this.writeMetrics(metric);
      count++;
    }

    return count;
  }

  async deleteMetrics(options: InfraQueryOptions): Promise<void> {
    if (!this.enabled || !this.client) {
      // Clear fallback buffer for host if specified
      if (options.host) {
        this.fallbackBuffer.delete(options.host);
      } else {
        this.fallbackBuffer.clear();
      }
      return;
    }

    // Note: InfluxDB 2.x delete requires Delete API
    // For simplicity, we'll just let data expire via retention policy
    logger.warn('Delete operation not fully implemented for InfluxDB. Consider using retention policies.');
  }

  getSnapshot(): Record<string, InfrastructureMetrics[]> {
    const snapshot: Record<string, InfrastructureMetrics[]> = {};
    for (const [host, metrics] of this.fallbackBuffer) {
      snapshot[host] = [...metrics];
    }
    return snapshot;
  }

  private addToFallbackBuffer(data: InfrastructureMetrics): void {
    if (!this.fallbackBuffer.has(data.host)) {
      this.fallbackBuffer.set(data.host, []);
    }
    const buffer = this.fallbackBuffer.get(data.host)!;
    buffer.push(data);
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  private queryFallbackBuffer(options: InfraQueryOptions): InfrastructureMetrics[] {
    let result: InfrastructureMetrics[] = [];

    if (options.host) {
      result = this.fallbackBuffer.get(options.host) || [];
    } else {
      for (const buffer of this.fallbackBuffer.values()) {
        result = result.concat(buffer);
      }
    }

    // Filter by time range
    if (options.startTime || options.endTime) {
      result = result.filter(m => {
        const ts = new Date(m.timestamp).getTime();
        if (options.startTime && ts < options.startTime.getTime()) return false;
        if (options.endTime && ts > options.endTime.getTime()) return false;
        return true;
      });
    }

    // Sort by timestamp
    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (options.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  private rowsToMetrics(rows: any[]): InfrastructureMetrics[] {
    return rows.map(row => ({
      host: row.host,
      timestamp: row._time,
      interval_seconds: row.interval_seconds || 5,
      metrics: {
        cpu: { usage_percent: row.cpu_usage || 0 },
        memory: {
          usage_percent: row.memory_usage || 0,
          used_mb: row.memory_used_mb || 0,
          total_mb: row.memory_total_mb || 0
        },
        disk: {
          usage_percent: row.disk_usage || 0,
          used_gb: row.disk_used_gb || 0,
          total_gb: row.disk_total_gb || 0,
          path: row.disk_path || '/'
        },
        network: {
          bytes_in: row.network_bytes_in || 0,
          bytes_out: row.network_bytes_out || 0,
          interface: row.network_interface || 'eth0'
        }
      }
    }));
  }

  private metricsToCSV(metrics: InfrastructureMetrics[]): string {
    const headers = [
      'timestamp', 'host', 'interval_seconds',
      'cpu_usage', 'memory_usage', 'memory_used_mb', 'memory_total_mb',
      'disk_usage', 'disk_used_gb', 'disk_total_gb', 'disk_path',
      'network_bytes_in', 'network_bytes_out', 'network_interface'
    ];

    const rows = metrics.map(m => [
      m.timestamp,
      m.host,
      m.interval_seconds || 5,
      m.metrics?.cpu?.usage_percent || 0,
      m.metrics?.memory?.usage_percent || 0,
      m.metrics?.memory?.used_mb || 0,
      m.metrics?.memory?.total_mb || 0,
      m.metrics?.disk?.usage_percent || 0,
      m.metrics?.disk?.used_gb || 0,
      m.metrics?.disk?.total_gb || 0,
      m.metrics?.disk?.path || '/',
      m.metrics?.network?.bytes_in || 0,
      m.metrics?.network?.bytes_out || 0,
      m.metrics?.network?.interface || 'eth0'
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  private csvToMetrics(csv: string): InfrastructureMetrics[] {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',');
    const metrics: InfrastructureMetrics[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row: any = {};
      headers.forEach((h, idx) => row[h] = values[idx]);

      metrics.push({
        timestamp: row.timestamp,
        host: row.host,
        interval_seconds: parseInt(row.interval_seconds) || 5,
        metrics: {
          cpu: { usage_percent: parseFloat(row.cpu_usage) || 0 },
          memory: {
            usage_percent: parseFloat(row.memory_usage) || 0,
            used_mb: parseFloat(row.memory_used_mb) || 0,
            total_mb: parseFloat(row.memory_total_mb) || 0
          },
          disk: {
            usage_percent: parseFloat(row.disk_usage) || 0,
            used_gb: parseFloat(row.disk_used_gb) || 0,
            total_gb: parseFloat(row.disk_total_gb) || 0,
            path: row.disk_path || '/'
          },
          network: {
            bytes_in: parseFloat(row.network_bytes_in) || 0,
            bytes_out: parseFloat(row.network_bytes_out) || 0,
            interface: row.network_interface || 'eth0'
          }
        }
      });
    }

    return metrics;
  }

  async close(): Promise<void> {
    if (this.writeApi) {
      await this.writeApi.close();
    }
  }
}

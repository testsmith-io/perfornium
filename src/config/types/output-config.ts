export interface OutputConfig {
  type: 'csv' | 'json' | 'html' | 'influxdb' | 'graphite' | 'webhook';
  enabled?: boolean;
  file?: string;
  url?: string;
  database?: string;
  tags?: Record<string, string>;
  headers?: Record<string, string>;
  template?: string;
}
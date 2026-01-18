import { ChildProcess } from 'child_process';

export interface DashboardOptions {
  port: number;
  resultsDir: string;
  testsDir?: string;
  workersFile?: string;
}

export interface TestResultSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_response_time: number;
  min_response_time: number;
  max_response_time: number;
  p50_response_time: number;
  p75_response_time: number;
  p90_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  requests_per_second: number;
  error_rate: number;
  success_rate: number;
}

export interface ErrorDetail {
  scenario: string;
  action: string;
  status?: number;
  error: string;
  request_url?: string;
  count: number;
}

export interface NetworkCall {
  id: string;
  vuId: number;
  url: string;
  method: string;
  status: number;
  statusText?: string;
  duration: number;
  size: number;
  type: string;
  success: boolean;
  error?: string;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface TestResult {
  id: string;
  name: string;
  timestamp: string;
  duration: number;
  summary: TestResultSummary;
  scenarios: any[];
  step_statistics?: any[];
  timeline_data?: any[];
  vu_ramp_up?: any[];
  response_time_distribution?: any[];
  timeseries?: any[];
  error_details?: ErrorDetail[];
  network_calls?: any[];
  infrastructure_metrics?: Record<string, InfrastructureMetrics[]>;
  /** Individual test results (can come from file or InfluxDB) */
  results?: any[];
  raw?: any;
}

export interface TestFile {
  name: string;
  path: string;
  relativePath: string;
  type: 'api' | 'web' | 'mixed';
  lastModified: string;
}

export interface LiveTestMetrics {
  requests: number;
  errors: number;
  avgResponseTime: number;
  currentVUs: number;
  p50ResponseTime?: number;
  p90ResponseTime?: number;
  p95ResponseTime?: number;
  p99ResponseTime?: number;
  minResponseTime?: number;
  maxResponseTime?: number;
  requestsPerSecond?: number;
  successRate?: number;
}

export interface StepStats {
  stepName: string;
  scenario: string;
  requests: number;
  errors: number;
  avgResponseTime: number;
  p50?: number;
  p95?: number;
  p99?: number;
  successRate: number;
}

export interface ResponseTimePoint {
  timestamp: number;
  value: number;
  success: boolean;
  stepName?: string;
}

export interface TopError {
  scenario: string;
  action: string;
  status?: number;
  error: string;
  url?: string;
  count: number;
}

export interface HistoryPoint {
  timestamp: number;
  requests: number;
  errors: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  vus: number;
  rps: number;
}

export interface InfrastructureMetrics {
  host: string;
  timestamp: string;
  interval_seconds: number;
  metrics: {
    cpu?: { usage_percent: number };
    memory?: { used_mb: number; total_mb: number; usage_percent: number };
    disk?: { used_gb: number; total_gb: number; usage_percent: number; path: string };
    network?: { bytes_in: number; bytes_out: number; interface: string };
  };
}

export interface LiveTest {
  id: string;
  name: string;
  startTime: Date;
  status: 'running' | 'completed' | 'failed';
  metrics: LiveTestMetrics;
  stepStats: StepStats[];
  responseTimes: ResponseTimePoint[];
  topErrors: TopError[];
  history: HistoryPoint[];
  networkCalls?: NetworkCall[];
  infrastructure?: Map<string, InfrastructureMetrics[]>;
}

export interface RunningProcess {
  process: ChildProcess;
  testId: string;
  output: string[];
}

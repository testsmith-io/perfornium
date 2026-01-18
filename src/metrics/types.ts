export interface TestResult {
  shouldRecord?: any;
  id?: string;
  vu_id: number;
  iteration?: number;
  scenario: string;
  name?: string;
  action?: string;
  step_name?: string; // New: specific step name for detailed tracking
  thread_name?: string; // JMeter-style thread name (e.g., "7. Protected API 1-1")
  timestamp: number;
  sample_start?: number; // Request start timestamp
  duration?: number;
  response_time?: number; // Add response_time property
  success: boolean;

  // Enhanced response details
  status?: number;
  status_text?: string;
  error?: string;
  error_code?: string;
  response_size?: number;
  response_headers?: Record<string, string>;
  response_body?: string;
  request_url?: string;
  request_method?: string;
  request_headers?: Record<string, string>;
  request_body?: string;

  // JMeter-style timing breakdown
  connect_time?: number; // Time to establish TCP connection (ms)
  latency?: number; // Time to first byte / TTFB (ms)

  // JMeter-style size breakdown
  sent_bytes?: number; // Total bytes sent (headers + body)
  headers_size_sent?: number; // Request headers size in bytes
  body_size_sent?: number; // Request body size in bytes
  headers_size_received?: number; // Response headers size in bytes
  body_size_received?: number; // Response body size in bytes
  data_type?: 'text' | 'bin' | ''; // Response data type

  custom_metrics?: Record<string, any>;
}

export interface VUStartEvent {
  vu_id: number;
  start_time: number;
  load_pattern: string;
}

export interface StepStatistics {
  step_name: string;
  scenario: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  avg_response_time: number;
  min_response_time: number;
  max_response_time: number;
  percentiles: Record<number, number>;
  response_times: number[];
  error_distribution: Record<string, number>;
  status_distribution: Record<number, number>;
}

export interface TestSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  avg_response_time: number;
  min_response_time: number;
  max_response_time: number;
  percentiles: Record<string, number>;
  requests_per_second: number;
  bytes_per_second: number;
  bytes_received?: number;
  total_duration: number;
  error_distribution?: Record<string, number>;
  status_distribution: Record<number, number>;
  error_details: ErrorDetail[];
}

export interface MetricsSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  avg_response_time: number;
  min_response_time: number;
  max_response_time: number;
  percentiles: Record<number, number>;
  requests_per_second: number;
  bytes_per_second: number;
  total_duration: number;
  error_distribution: Record<string, number>;
  status_distribution: Record<number, number>;
  error_details: ErrorDetail[];
  
  // Enhanced statistics
  step_statistics: StepStatistics[];
  vu_ramp_up: VUStartEvent[];
  timeline_data: TimelineData[];

  // Core Web Vitals (optional)
  web_vitals_data?: {
    lcp?: number;
    fid?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    tti?: number;
    tbt?: number;
    speedIndex?: number;
  };
  vitals_score?: 'good' | 'needs-improvement' | 'poor';
  vitals_details?: Record<string, { value: number; score: 'good' | 'needs-improvement' | 'poor' }>;

  // Verification metrics (optional)
  verification_metrics?: {
    total_verifications: number;
    success_rate: number;
    average_duration: number;
    p95_duration: number;
    slowest_step: any;
    fastest_step: any;
  };
}

export interface TimelineData {
  timestamp: number;
  time_label: string;
  active_vus: number;
  requests_count: number;
  avg_response_time: number;
  success_rate: number;
  throughput: number;
  // Enhanced metrics for charts
  error_count: number;
  p50_response_time: number;
  p90_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  min_response_time: number;
  max_response_time: number;
  bytes_sent: number;
  bytes_received: number;
  connect_time_avg: number;
  latency_avg: number;
  status_codes: Record<number, number>;
}

export interface ErrorDetail {
  timestamp: number;
  vu_id: number;
  scenario: string;
  action: string;
  status?: number;
  error: string;
  request_url?: string;
  response_body?: string;
  count: number;
}

export interface CapturedNetworkCall {
  /** Unique request ID */
  id: string;
  /** Virtual user ID */
  vu_id: number;
  /** Timestamp when request was initiated */
  timestamp: number;
  /** Full request URL */
  request_url: string;
  /** HTTP method (GET, POST, etc.) */
  request_method: string;
  /** Request headers */
  request_headers?: Record<string, string>;
  /** Request body (may be truncated) */
  request_body?: string;
  /** Whether request body was truncated */
  request_body_truncated?: boolean;
  /** HTTP response status code */
  response_status?: number;
  /** HTTP response status text */
  response_status_text?: string;
  /** Response headers */
  response_headers?: Record<string, string>;
  /** Response body (may be truncated) */
  response_body?: string;
  /** Whether response body was truncated */
  response_body_truncated?: boolean;
  /** Response size in bytes */
  response_size?: number;
  /** Request start time (high-resolution) */
  start_time: number;
  /** Response end time (high-resolution) */
  end_time?: number;
  /** Total duration in ms */
  duration?: number;
  /** Resource type (document, xhr, fetch, script, etc.) */
  resource_type?: string;
  /** Whether the request succeeded (2xx/3xx status) */
  success: boolean;
  /** Error message if request failed */
  error?: string;
  /** Associated scenario name */
  scenario?: string;
  /** Associated step name */
  step_name?: string;
}
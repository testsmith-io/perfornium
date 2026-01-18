export interface GlobalConfig {
  base_url?: string;
  wsdl_url?: string;
  timeout?: number;
  think_time?: string | number;
  headers?: Record<string, string>;
  variables?: Record<string, any>;
  browser?: BrowserConfig;
  faker?: FakerConfig;
  debug?: DebugConfig;
  /** Global CSV data configuration - variables available across all scenarios */
  csv_data?: GlobalCSVConfig;
  /** CSV data access mode: next (round-robin), unique (exhaustible), random */
  csv_mode?: 'next' | 'unique' | 'random';
  /** InfluxDB configuration for storing test metrics (optional) */
  influxdb?: InfluxDBConfig;
}

export interface InfluxDBConfig {
  /** Enable InfluxDB storage for test metrics */
  enabled: boolean;
  /** InfluxDB server URL (default: http://localhost:8086 or INFLUXDB_URL env var) */
  url?: string;
  /** InfluxDB authentication token (default: INFLUXDB_TOKEN env var) */
  token?: string;
  /** InfluxDB organization (default: 'perfornium' or INFLUXDB_ORG env var) */
  org?: string;
  /** InfluxDB bucket name (default: 'metrics' or INFLUXDB_BUCKET env var) */
  bucket?: string;
  /** Write batch size (default: 100) */
  batch_size?: number;
  /** Flush interval in ms (default: 1000) */
  flush_interval?: number;
}

export interface GlobalCSVConfig {
  /** Path to the CSV file */
  file: string;
  /** Column delimiter (default: ',') */
  delimiter?: string;
  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;
  /** Skip empty lines (default: true) */
  skipEmptyLines?: boolean;
  /** Skip the first line (header row treated as data) */
  skipFirstLine?: boolean;
  /** Select only specific columns */
  columns?: string[];
  /** Filter expression (e.g., "status=active") */
  filter?: string;
  /** Shuffle data randomly (alias for distribution.order = 'random') */
  randomize?: boolean;
  /** Restart from beginning when data is exhausted (default: true) - legacy, use distribution.on_exhausted */
  cycleOnExhaustion?: boolean;
  /** Map CSV column names to custom variable names: { "csv_column": "variable_name" } */
  variables?: Record<string, string>;

  // ============================================
  // Enhanced Data Variable Policies
  // ============================================

  /**
   * Value Change Policy - determines when a new value is fetched
   * - each_use: New value for every request/step (default for unique scope)
   * - each_iteration: New value at the start of each iteration (default for global/local scope)
   * - each_vu: Same value for all iterations of a VU (sticky per VU)
   */
  change_policy?: 'each_use' | 'each_iteration' | 'each_vu';

  /**
   * Value Distribution Policy - comprehensive control over data distribution
   */
  distribution?: DataDistributionPolicy;
}

/**
 * Value Distribution Policy
 * Controls how data values are distributed across virtual users
 */
export interface DataDistributionPolicy {
  /**
   * Scope - determines value sharing between VUs
   * - local: Each VU has its own copy of the data (values can repeat across VUs)
   * - global: Values are shared across all VUs (round-robin distribution)
   * - unique: Global scope with exclusive locking - a value can only be used by one VU at a time,
   *           returned to the pool when the VU's iteration/use completes
   */
  scope?: 'local' | 'global' | 'unique';

  /**
   * Order - how values are selected from the data
   * - sequential: Values are taken in the order they appear in the file
   * - random: Values are taken in random order
   * - any: Best-effort sequential (more efficient, may vary under high concurrency)
   */
  order?: 'sequential' | 'random' | 'any';

  /**
   * On Exhausted - what happens when all values have been used
   * - cycle: Start over from the beginning (default)
   * - stop_vu: Stop the current VU (it won't get more data)
   * - stop_test: Stop the entire test
   * - no_value: Return undefined/empty for subsequent requests
   */
  on_exhausted?: 'cycle' | 'stop_vu' | 'stop_test' | 'no_value';
}

export interface FakerConfig {
  locale?: string;
  seed?: number;
}

export interface BrowserConfig {
  type: 'chromium' | 'firefox' | 'webkit' | 'msedge' | 'chrome';
  headless?: boolean;
  viewport?: { width: number; height: number };
  slow_mo?: number;
  base_url?: string;
  highlight?: boolean | HighlightConfig;
  clear_storage?: boolean | ClearStorageConfig;
  /** Capture screenshot on test failure */
  screenshot_on_failure?: boolean | ScreenshotConfig;
  /** Capture HTTP network calls during web tests */
  network_capture?: NetworkCaptureConfig;
}

export interface NetworkCaptureConfig {
  /** Enable network call capturing */
  enabled: boolean;
  /** Glob patterns for URLs to capture - if empty, captures all */
  include_patterns?: string[];
  /** Glob patterns for URLs to exclude */
  exclude_patterns?: string[];
  /** Capture request body (default: false) */
  capture_request_body?: boolean;
  /** Capture response body (default: false) */
  capture_response_body?: boolean;
  /** Maximum body size to capture in bytes (default: 10240 = 10KB) */
  max_body_size?: number;
  /** Only capture bodies with these content types */
  content_type_filters?: string[];
  /** Store network calls in TestResult.custom_metrics (default: true) */
  store_inline?: boolean;
  /** Emit NETWORK events for dashboard live updates (default: true) */
  store_separate?: boolean;
}

export interface ScreenshotConfig {
  enabled: boolean;
  /** Directory to save screenshots (default: 'screenshots') */
  output_dir?: string;
  /** Capture full page screenshot (default: true) */
  full_page?: boolean;
}

export interface ClearStorageConfig {
  local_storage?: boolean;   // Clear localStorage (default: true)
  session_storage?: boolean; // Clear sessionStorage (default: true)
  cookies?: boolean;         // Clear cookies (default: true)
  cache?: boolean;           // Clear cache (default: false)
}

export interface HighlightConfig {
  enabled: boolean;
  duration?: number;  // ms to show highlight (default: 500)
  color?: string;     // border color (default: 'red')
  style?: 'border' | 'background' | 'both';  // highlight style (default: 'border')
}

export interface DebugConfig {
  // Internal names
  capture_request_headers?: boolean;
  capture_request_body?: boolean;
  capture_response_headers?: boolean;
  capture_response_body?: boolean;
  max_response_body_size?: number;
  capture_only_failures?: boolean;
  log_level?: 'debug' | 'info' | 'warn' | 'error';

  // User-friendly aliases
  log_requests?: boolean;   // Logs all HTTP requests
  log_responses?: boolean;  // Logs all HTTP responses
  log_headers?: boolean;    // Include headers in logs
  log_body?: boolean;       // Include request/response body in logs
  log_timings?: boolean;    // Log timing information
}
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
  /** Shuffle data randomly */
  randomize?: boolean;
  /** Restart from beginning when data is exhausted (default: true) */
  cycleOnExhaustion?: boolean;
  /** Map CSV column names to custom variable names: { "csv_column": "variable_name" } */
  variables?: Record<string, string>;
}

export interface FakerConfig {
  locale?: string;
  seed?: number;
}

export interface BrowserConfig {
  type: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  viewport?: { width: number; height: number };
  slow_mo?: number;
  base_url?: string;
  highlight?: boolean | HighlightConfig;
  clear_storage?: boolean | ClearStorageConfig;
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
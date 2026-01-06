I # Configuration Schema Reference

This document provides a comprehensive reference for all configuration options available in Perfornium. The schema applies to both YAML and TypeScript configurations.

## Root Configuration

### Test Metadata

```yaml
name: string                    # Test name (required)
description?: string            # Test description
version?: string               # Test version
tags?: string[]                # Categorization tags
author?: string                # Test author
created?: string               # Creation date
modified?: string              # Last modified date
```

### Global Configuration

```yaml
global:
  base_url?: string             # Base URL for all requests
  timeout?: number              # Default timeout in milliseconds (default: 30000)
  think_time?: string           # Default think time between requests
  headers?: Record<string, string>  # Default headers for all requests
  debug?: DebugConfig           # Debug configuration
  ssl?: SSLConfig               # SSL/TLS configuration
  proxy?: ProxyConfig           # Proxy configuration
  connection_pool?: ConnectionPoolConfig  # Connection pooling
```

#### Debug Configuration

```yaml
debug:
  log_level?: 'debug' | 'info' | 'warn' | 'error'  # Log level (default: info)
  capture_request_headers?: boolean        # Capture request headers (default: false)
  capture_request_body?: boolean           # Capture request body (default: false)
  capture_response_headers?: boolean       # Capture response headers (default: false)
  capture_response_body?: boolean          # Capture response body (default: true)
  capture_only_failures?: boolean          # Only capture on failures (default: false)
  max_response_body_size?: number          # Max response body size to capture (default: 5000)
```

#### SSL Configuration

```yaml
ssl:
  verify_certificates?: boolean     # Verify SSL certificates (default: true)
  client_cert?: string             # Client certificate path
  client_key?: string              # Client private key path
  ca_cert?: string                 # CA certificate path
  client_cert_password?: string    # Client certificate password
```

#### Proxy Configuration

```yaml
proxy:
  http?: string                    # HTTP proxy URL
  https?: string                   # HTTPS proxy URL
  no_proxy?: string[]              # Domains to bypass proxy
  auth?: ProxyAuth                 # Proxy authentication
```

```yaml
ProxyAuth:
  username: string
  password: string
```

#### Connection Pool Configuration

```yaml
connection_pool:
  max_connections?: number               # Maximum total connections (default: 100)
  max_connections_per_host?: number      # Maximum connections per host (default: 10)
  keep_alive_timeout?: number            # Keep-alive timeout in ms (default: 30000)
  connection_timeout?: number            # Connection timeout in ms (default: 5000)
```

## Load Pattern Configuration

### Basic Load Pattern

```yaml
load:
  pattern: 'basic'
  virtual_users: number           # Number of virtual users (required)
  ramp_up?: string               # Ramp-up duration (default: "0s")
  duration?: string              # Test duration
  ramp_down?: string             # Ramp-down duration (default: "0s")
  think_time?: string            # Think time between requests
  preallocate_vus?: number       # Pre-allocated VUs (default: 10)
```

### Stepping Load Pattern

```yaml
load:
  pattern: 'stepping'
  start_users?: number           # Initial users (default: 1)
  step_users: number             # Users to add per step (required)
  step_duration: string          # Duration of each step (required)
  max_users: number              # Maximum users (required)
  duration?: string              # Total duration (auto-calculated if not specified)
  ramp_step?: string             # Ramp time within each step (default: "0s")
  hold_final?: string            # Hold final load duration (default: "0s")
```

### Arrival Rate Load Pattern

```yaml
load:
  pattern: 'arrivals'
  rate?: number                  # Constant arrival rate (RPS)
  rate_profile?: RateProfile[]   # Variable rate profile
  duration?: string              # Test duration
  max_virtual_users: number      # Maximum concurrent VUs (required)
  preallocation?: number         # Pre-allocated VUs (default: 10)
  vu_timeout?: string            # VU timeout (default: "60s")
```

#### Rate Profile

```yaml
RateProfile:
  - rate: number                 # Requests per second
    duration: string             # Duration for this rate
```

### Virtual User Options

```yaml
vu_options:
  max_iterations?: number        # Maximum iterations per VU
  max_duration?: string          # Maximum time per VU
  restart_on_error?: boolean     # Restart VU on error (default: false)
  graceful_shutdown?: string     # Time to finish current iteration (default: "10s")
```

## Scenario Configuration

```yaml
scenarios:
  - name: string                 # Scenario name (required)
    weight?: number              # Scenario selection weight (default: 1)
    loop?: number                # Number of times to repeat scenario (default: 1)
    think_time?: string          # Override global think time
    csv_data?: CSVDataConfig     # CSV data configuration
    variables?: Record<string, any>  # Scenario variables
    hooks?: ScenarioHooks        # Scenario lifecycle hooks
    steps: Step[]                # Scenario steps (required)
```

### CSV Data Configuration

```yaml
csv_data:
  file: string                   # CSV file path (required)
  mode?: 'sequential' | 'random' | 'shared'  # Data access mode (default: sequential)
  delimiter?: string             # CSV delimiter (default: ",")
  header?: boolean               # First row contains headers (default: true)
  cycling?: boolean              # Restart from beginning when exhausted (default: true)
  encoding?: string              # File encoding (default: "utf-8")
```

### Scenario Hooks

```yaml
hooks:
  beforeScenario?: string        # JavaScript code to run before scenario
  afterScenario?: string         # JavaScript code to run after scenario
```

## Step Configuration

### REST Step

```yaml
- name: string                   # Step name (required)
  type: 'rest'                   # Step type (required)
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'  # HTTP method (required)
  path: string                   # Request path (required)
  headers?: Record<string, string>  # Request headers
  body?: string                  # Request body
  timeout?: number               # Request timeout in ms
  follow_redirects?: boolean     # Follow redirects (default: true)
  max_redirects?: number         # Maximum redirects (default: 5)
  retry?: RetryConfig            # Retry configuration
  checks?: Check[]               # Response validation checks
  extract?: Extract[]            # Data extraction rules
  on_error?: ErrorHandling       # Error handling
  hooks?: StepHooks              # Step lifecycle hooks
```

### SOAP Step

```yaml
- name: string                   # Step name (required)
  type: 'soap'                   # Step type (required)
  wsdl?: string                  # WSDL URL or file path
  endpoint?: string              # SOAP endpoint URL (if not using WSDL)
  operation?: string             # SOAP operation name
  binding?: string               # WSDL binding name
  envelope?: string              # Custom SOAP envelope
  parameters?: Record<string, any>  # Operation parameters (for WSDL-based)
  headers?: Record<string, string>  # Request headers
  security?: SOAPSecurity        # SOAP security configuration
  timeout?: number               # Request timeout in ms
  attachments?: Attachment[]     # SOAP attachments
  checks?: Check[]               # Response validation checks
  extract?: Extract[]            # Data extraction rules
  on_error?: ErrorHandling       # Error handling
```

#### SOAP Security

```yaml
security:
  type: 'username_token' | 'certificate'  # Security type
  username?: string              # Username (for username_token)
  password?: string              # Password (for username_token)
  password_type?: 'text' | 'digest'  # Password type (default: digest)
  certificate?: string           # Certificate path (for certificate)
  private_key?: string           # Private key path (for certificate)
```

#### Attachment

```yaml
attachments:
  - name: string                 # Attachment name (required)
    path: string                 # File path (required)
    content_type: string         # MIME type (required)
```

### Web Step

```yaml
- name: string                   # Step name (required)
  type: 'web'                    # Step type (required)
  action: WebAction              # Web action configuration (required)
  context?: string               # Browser context name
  timeout?: number               # Action timeout in ms
  checks?: Check[]               # Response validation checks
  extract?: Extract[]            # Data extraction rules
  on_error?: ErrorHandling       # Error handling
```

#### Web Action

```yaml
action:
  command: string                # Action command (required)
  url?: string                   # URL (for navigation commands)
  selector?: string              # Element selector
  value?: string                 # Input value
  text?: string                  # Text to type
  key?: string                   # Key to press
  options?: Record<string, any>  # Command-specific options
  script?: string                # JavaScript to evaluate
  files?: string[]               # Files for upload
```

### Wait Step

```yaml
- name: string                   # Step name (required)
  type: 'wait'                   # Step type (required)
  duration: string               # Wait duration (required)
```

### Custom Step

```yaml
- name: string                   # Step name (required)
  type: 'custom'                 # Step type (required)
  script: string                 # JavaScript code to execute (required)
  timeout?: number               # Script timeout in ms (default: 30000)
  checks?: Check[]               # Response validation checks
  extract?: Extract[]            # Data extraction rules
  on_error?: ErrorHandling       # Error handling
```

### Common Step Configuration

#### Retry Configuration

```yaml
retry:
  count: number                  # Number of retries (required)
  delay: string                  # Delay between retries (required)
  on_status?: number[]           # HTTP status codes to retry on
  on_timeout?: boolean           # Retry on timeout (default: false)
  on_error?: boolean             # Retry on general errors (default: true)
```

#### Error Handling

```yaml
on_error:
  continue?: boolean             # Continue test on error (default: false)
  log_full_response?: boolean    # Log full response on error (default: false)
  extract?: Extract[]            # Data extraction rules for errors
```

#### Step Hooks

```yaml
hooks:
  beforeStep?: string            # JavaScript code to run before step
  afterStep?: string             # JavaScript code to run after step
```

## Validation Checks

### Status Check

```yaml
- type: 'status'
  value: number | number[]       # Expected status code(s) (required)
  description?: string           # Check description
```

### Response Time Check

```yaml
- type: 'response_time'
  value: string                  # Threshold expression (e.g., "<2000") (required)
  description?: string           # Check description
```

### JSON Path Check

```yaml
- type: 'json_path'
  value: string                  # JSON path expression (required)
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'matches' | 'exists'  # Comparison operator
  expected?: any                 # Expected value
  description?: string           # Check description
```

### XPath Check (SOAP)

```yaml
- type: 'xpath'
  expression: string             # XPath expression (required)
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'matches' | 'exists'  # Comparison operator
  expected?: any                 # Expected value
  namespaces?: Record<string, string>  # XML namespaces
  description?: string           # Check description
```

### Text Content Check

```yaml
- type: 'text_contains'
  value: string                  # Text to search for (required)
  description?: string           # Check description
```

### Header Check

```yaml
- type: 'header'
  name: string                   # Header name (required)
  value?: string                 # Expected header value
  operator?: '==' | '!=' | 'contains' | 'matches' | 'exists'  # Comparison operator
  expected?: string              # Expected value (alternative to value)
  description?: string           # Check description
```

### Custom Check

```yaml
- type: 'custom'
  script: string                 # JavaScript validation function (required)
  expected?: any                 # Expected return value
  description?: string           # Check description
```

### Web Element Check

```yaml
- type: 'web_element'
  selector: string               # Element selector (required)
  state: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'checked' | 'unchecked'  # Expected state (required)
  description?: string           # Check description
```

### Web Text Check

```yaml
- type: 'web_text'
  selector: string               # Element selector (required)
  operator?: '==' | '!=' | 'contains' | 'matches'  # Comparison operator
  expected: string               # Expected text (required)
  description?: string           # Check description
```

### Web URL Check

```yaml
- type: 'web_url'
  operator?: '==' | '!=' | 'contains' | 'matches'  # Comparison operator
  expected: string               # Expected URL (required)
  description?: string           # Check description
```

## Data Extraction

### JSON Path Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'json_path'              # Extraction type (required)
  expression: string             # JSON path expression (required)
  default?: any                  # Default value if extraction fails
```

### XPath Extraction (SOAP)

```yaml
- name: string                   # Variable name (required)
  type: 'xpath'                  # Extraction type (required)
  expression: string             # XPath expression (required)
  namespaces?: Record<string, string>  # XML namespaces
  return_type?: 'text' | 'xml' | 'number' | 'array'  # Return type (default: text)
  default?: any                  # Default value if extraction fails
```

### Regex Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'regex'                  # Extraction type (required)
  expression: string             # Regular expression (required)
  group?: number                 # Capture group (default: 1)
  default?: any                  # Default value if extraction fails
```

### Header Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'header'                 # Extraction type (required)
  name: string                   # Header name (required)
  default?: any                  # Default value if extraction fails
```

### Custom Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'custom'                 # Extraction type (required)
  script: string                 # JavaScript extraction function (required)
  default?: any                  # Default value if extraction fails
```

### Web Text Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'web_text'               # Extraction type (required)
  selector: string               # Element selector (required)
  return_type?: 'text' | 'array' # Return type (default: text)
  default?: any                  # Default value if extraction fails
```

### Web Attribute Extraction

```yaml
- name: string                   # Variable name (required)
  type: 'web_attribute'          # Extraction type (required)
  selector: string               # Element selector (required)
  attribute: string              # Attribute name (required)
  return_type?: 'text' | 'array' # Return type (default: text)
  default?: any                  # Default value if extraction fails
```

## Output Configuration

### JSON Output

```yaml
outputs:
  - type: 'json'
    file: string                 # Output file path (required)
    format?: 'array' | 'ndjson' | 'stream'  # Output format (default: array)
    batch_size?: number          # Batch size for streaming (default: 100)
    flush_interval?: string      # Flush interval (default: "10s")
    buffer_size?: number         # Buffer size (default: 1000)
    compression?: 'none' | 'gzip' | 'deflate'  # Compression (default: none)
    pretty_print?: boolean       # Pretty print JSON (default: false)
    include_request_headers?: boolean    # Include request headers (default: false)
    include_response_headers?: boolean   # Include response headers (default: false)
    include_request_body?: boolean       # Include request body (default: false)
    include_response_body?: boolean      # Include response body (default: false)
    max_body_size?: number       # Maximum body size to include (default: 5000)
    include_extracted_data?: boolean     # Include extracted variables (default: true)
    include_check_results?: boolean      # Include validation results (default: true)
    include_system_metrics?: boolean     # Include system metrics (default: false)
    file_rotation?: FileRotation # File rotation configuration
```

### CSV Output

```yaml
outputs:
  - type: 'csv'
    file: string                 # Output file path (required)
    fields?: string[]            # Fields to include
    field_mapping?: Record<string, string>  # Field name mapping
    calculated_fields?: CalculatedField[]   # Calculated fields
    csv_options?: CSVOptions     # CSV formatting options
    real_time?: boolean          # Real-time writing (default: false)
    batch_size?: number          # Batch size for real-time (default: 50)
    flush_interval?: string      # Flush interval (default: "15s")
    buffer_size?: number         # Buffer size (default: 2000)
    compression?: 'none' | 'gzip' | 'deflate'  # Compression (default: none)
    encoding?: string            # Character encoding (default: "utf-8")
    date_format?: 'iso' | 'unix' | 'custom'  # Date format (default: iso)
    custom_date_format?: string  # Custom date format string
    file_rotation?: FileRotation # File rotation configuration
    aggregation?: Aggregation    # Data aggregation configuration
    filter?: string              # Filter expression
```

#### CSV Options

```yaml
csv_options:
  delimiter?: string             # Field delimiter (default: ",")
  quote_char?: string            # Quote character (default: '"')
  escape_char?: string           # Escape character (default: "\\")
  line_terminator?: string       # Line ending (default: "\n")
  header?: boolean               # Include header row (default: true)
  quote_mode?: 'minimal' | 'all' | 'non_numeric' | 'none'  # Quoting mode (default: minimal)
```

#### Calculated Field

```yaml
calculated_fields:
  - name: string                 # Field name (required)
    expression: string           # Calculation expression (required)
    format?: string              # Output format
```

#### File Rotation

```yaml
file_rotation:
  enabled: boolean               # Enable file rotation (required)
  max_size: string               # Maximum file size (required)
  max_files: number              # Maximum number of files (required)
  compress_rotated?: boolean     # Compress rotated files (default: false)
```

#### Aggregation

```yaml
aggregation:
  type: 'summary' | 'timeseries' # Aggregation type (required)
  group_by?: string[]            # Group by fields (for summary)
  interval?: string              # Time interval (for timeseries)
  update_interval?: string       # Update interval for real-time
  metrics: AggregationMetric[]   # Metrics to calculate (required)
```

#### Aggregation Metric

```yaml
metrics:
  - name: string                 # Metric name (required)
    field: string                # Source field (required)
    function: 'count' | 'mean' | 'sum' | 'min' | 'max' | 'percentile' | 'rate' | 'throughput'  # Aggregation function (required)
    percentile?: number          # Percentile value (for percentile function)
```

## Report Configuration

```yaml
report:
  generate: boolean              # Generate HTML report (required)
  output: string                 # Report file path (required)
  template?: 'default' | 'minimal' | 'detailed' | 'custom' | 'comparison'  # Report template (default: default)
  title?: string                 # Report title
  description?: string           # Report description
  include_raw_data?: boolean     # Include raw data (default: false)
  auto_refresh?: boolean         # Auto-refresh for real-time (default: false)
  refresh_interval?: number      # Refresh interval in seconds (default: 30)
  real_time?: boolean            # Real-time report updates (default: false)
  websocket_enabled?: boolean    # WebSocket for real-time updates (default: false)
  sections?: string[]            # Sections to include
  charts?: ChartConfig           # Chart configurations
  tables?: TableConfig           # Table configurations
  styling?: StylingConfig        # Custom styling
  branding?: BrandingConfig      # Branding configuration
  interactive?: InteractiveConfig # Interactive features
  comparison?: ComparisonConfig  # Comparison configuration
  sla_reporting?: SLAReportingConfig  # SLA compliance reporting
  performance?: ReportPerformanceConfig  # Report generation performance
```

## Browser Configuration (Web Testing)

```yaml
global:
  browser:
    type?: 'chromium' | 'firefox' | 'webkit'  # Browser type (default: chromium)
    headless?: boolean           # Run in headless mode (default: true)
    viewport?: Viewport          # Viewport configuration
    user_agent?: string          # Custom user agent
    device?: string              # Predefined device name
    custom_device?: CustomDevice # Custom device configuration
    context_options?: BrowserContextOptions  # Browser context options
    pool_size?: number           # Browser pool size (default: 5)
    reuse_contexts?: boolean     # Reuse browser contexts (default: true)
    context_timeout?: number     # Context timeout in ms (default: 300000)
    block_resources?: string[]   # Resource types to block
    disable_javascript?: boolean # Disable JavaScript (default: false)
    disable_images?: boolean     # Disable images (default: false)
    disable_css?: boolean        # Disable CSS (default: false)
    debug?: BrowserDebugConfig   # Browser debug configuration
```

### Viewport

```yaml
viewport:
  width: number                  # Viewport width (required)
  height: number                 # Viewport height (required)
```

### Custom Device

```yaml
custom_device:
  name: string                   # Device name (required)
  viewport: Viewport             # Viewport configuration (required)
  user_agent: string             # User agent string (required)
  device_scale_factor: number    # Device scale factor (required)
  is_mobile: boolean             # Is mobile device (required)
  has_touch: boolean             # Has touch support (required)
```

### Browser Context Options

```yaml
context_options:
  geolocation?: Geolocation      # Geolocation override
  permissions?: string[]         # Granted permissions
  locale?: string                # Locale setting
  timezone?: string              # Timezone setting
  color_scheme?: 'light' | 'dark' | 'no-preference'  # Color scheme
  extra_http_headers?: Record<string, string>  # Extra HTTP headers
  offline?: boolean              # Offline mode
  http_credentials?: HTTPCredentials  # HTTP authentication
```

### Geolocation

```yaml
geolocation:
  latitude: number               # Latitude (required)
  longitude: number              # Longitude (required)
  accuracy?: number              # Accuracy in meters
```

### HTTP Credentials

```yaml
http_credentials:
  username: string               # Username (required)
  password: string               # Password (required)
  origin?: string                # Origin URL
```

### Browser Debug Configuration

```yaml
debug:
  slow_mo?: number               # Slow motion delay in ms
  devtools?: boolean             # Open DevTools (default: false)
  console_logs?: boolean         # Capture console logs (default: false)
  network_logs?: boolean         # Capture network logs (default: false)
  screenshot_on_failure?: boolean # Take screenshots on failure (default: false)
  full_page_screenshot?: boolean # Full page screenshots (default: false)
  video_recording?: boolean      # Record videos (default: false)
  video_dir?: string            # Video recording directory
```

## Environment Configuration

```yaml
environments:
  [environment_name]:
    global?: GlobalConfig        # Override global configuration
    load?: LoadConfig            # Override load configuration
    scenarios?: ScenarioConfig[] # Override scenario configuration
    outputs?: OutputConfig[]     # Override output configuration
    report?: ReportConfig        # Override report configuration
```

## TypeScript Configuration Types

When using TypeScript configuration, these interfaces are available:

```typescript
interface PerforniumConfig {
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  author?: string;
  created?: string;
  modified?: string;
  global?: GlobalConfig;
  load: LoadConfig;
  scenarios: ScenarioConfig[];
  outputs?: OutputConfig[];
  report?: ReportConfig;
  environments?: Record<string, Partial<PerforniumConfig>>;
}

interface GlobalConfig {
  base_url?: string;
  timeout?: number;
  think_time?: string;
  headers?: Record<string, string>;
  debug?: DebugConfig;
  ssl?: SSLConfig;
  proxy?: ProxyConfig;
  connection_pool?: ConnectionPoolConfig;
  browser?: BrowserConfig;
}

// Additional interfaces follow the same pattern as YAML schema
```

This schema reference provides the complete structure for configuring Perfornium tests, ensuring type safety and comprehensive functionality across all supported protocols and features.
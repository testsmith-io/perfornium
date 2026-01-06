# CSV Output

CSV (Comma-Separated Values) output in Perfornium provides tabular test results that are easy to import into spreadsheet applications, databases, and data analysis tools. CSV format is ideal for statistical analysis and reporting.

## Basic Configuration

### Simple CSV Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/test-results.csv"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/test-results.csv')
  .run();
```

<!-- tabs:end -->

### Timestamped CSV Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/test-{{timestamp}}.csv"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/test-{{timestamp}}.csv')
  .run();
```

<!-- tabs:end -->

### Real-time CSV Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/streaming-{{timestamp}}.csv"
    real_time: true             # Write results as they happen
    batch_size: 100             # Write every 100 results
    flush_interval: "15s"       # Flush at least every 15 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/streaming-{{timestamp}}.csv', {
    real_time: true,
    batch_size: 100,
    flush_interval: '15s'
  })
  .run();
```

<!-- tabs:end -->

## Default CSV Format

The default CSV includes these columns:

```csv
timestamp,vu_id,scenario,action,step_name,duration,success,status,error,request_url
"2024-01-15T10:30:25.123Z",1,"User Login","Login Request","Login Request",156,true,200,"","/api/login"
"2024-01-15T10:30:25.456Z",1,"User Login","Get Profile","Get Profile",89,true,200,"","/api/profile"
"2024-01-15T10:30:25.789Z",2,"Browse Products","Product List","Product List",234,true,200,"","/api/products"
"2024-01-15T10:30:26.012Z",2,"Browse Products","Product Details","Product Details",145,true,200,"","/api/products/123"
"2024-01-15T10:30:26.345Z",1,"User Login","Logout","Logout",67,true,200,"","/api/logout"
```

## Custom Field Configuration

### Specify Custom Fields

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/custom-fields.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "duration"
      - "success"
      - "status"
      - "method"
      - "url"
      - "response_size"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/custom-fields.csv', {
    fields: [
      'timestamp',
      'vu_id',
      'duration',
      'success',
      'status',
      'method',
      'url',
      'response_size'
    ]
  })
  .run();
```

<!-- tabs:end -->

### Field Mapping

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/mapped-fields.csv"
    field_mapping:
      time: "timestamp"
      user: "vu_id"
      test: "scenario"
      step: "step_name"
      response_time: "duration"
      ok: "success"
      http_status: "status"
      endpoint: "request_url"
      error_message: "error"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/mapped-fields.csv', {
    field_mapping: {
      time: 'timestamp',
      user: 'vu_id',
      test: 'scenario',
      step: 'step_name',
      response_time: 'duration',
      ok: 'success',
      http_status: 'status',
      endpoint: 'request_url',
      error_message: 'error'
    }
  })
  .run();
```

<!-- tabs:end -->

### Calculated Fields

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/calculated-fields.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "duration"
      - "success"
      - "status"
    calculated_fields:
      - name: "response_time_seconds"
        expression: "duration / 1000"
        format: "%.3f"
      - name: "response_category"
        expression: |
          if duration < 1000 then 'fast'
          else if duration < 5000 then 'medium'
          else 'slow'
      - name: "timestamp_readable"
        expression: "strftime('%Y-%m-%d %H:%M:%S', timestamp/1000)"
      - name: "success_flag"
        expression: "if success then 1 else 0"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/calculated-fields.csv', {
    fields: [
      'timestamp',
      'vu_id',
      'duration',
      'success',
      'status'
    ],
    calculated_fields: [
      {
        name: 'response_time_seconds',
        expression: 'duration / 1000',
        format: '%.3f'
      },
      {
        name: 'response_category',
        expression: `
          if duration < 1000 then 'fast'
          else if duration < 5000 then 'medium'
          else 'slow'
        `
      },
      {
        name: 'timestamp_readable',
        expression: "strftime('%Y-%m-%d %H:%M:%S', timestamp/1000)"
      },
      {
        name: 'success_flag',
        expression: 'if success then 1 else 0'
      }
    ]
  })
  .run();
```

<!-- tabs:end -->

## Advanced Configuration

### Complete CSV Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/comprehensive-{{timestamp}}.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "method"
      - "url"
      - "error"
    csv_options:
      delimiter: ","                    # Field delimiter
      quote_char: '"'                   # Quote character
      escape_char: "\\"                 # Escape character
      line_terminator: "\n"             # Line ending
      header: true                      # Include header row
      quote_mode: "minimal"             # minimal, all, non_numeric, none
    real_time: true
    batch_size: 50
    flush_interval: "10s"
    buffer_size: 2000
    compression: "gzip"                 # Compress output file
    encoding: "utf-8"                   # Character encoding
    date_format: "iso"                  # iso, unix, custom
    custom_date_format: "%Y-%m-%d %H:%M:%S"
    file_rotation:
      enabled: true
      max_size: "50MB"
      max_files: 10
      compress_rotated: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/comprehensive-{{timestamp}}.csv', {
    fields: [
      'timestamp',
      'vu_id',
      'scenario',
      'step_name',
      'duration',
      'success',
      'status',
      'method',
      'url',
      'error'
    ],
    csv_options: {
      delimiter: ',',
      quote_char: '"',
      escape_char: '\\',
      line_terminator: '\n',
      header: true,
      quote_mode: 'minimal'
    },
    real_time: true,
    batch_size: 50,
    flush_interval: '10s',
    buffer_size: 2000,
    compression: 'gzip',
    encoding: 'utf-8',
    date_format: 'iso',
    custom_date_format: '%Y-%m-%d %H:%M:%S',
    file_rotation: {
      enabled: true,
      max_size: '50MB',
      max_files: 10,
      compress_rotated: true
    }
  })
  .run();
```

<!-- tabs:end -->

## Protocol-Specific Fields

### REST Protocol Fields

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "csv"
    file: "results/rest-detailed.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "method"
      - "url"
      - "request_size"
      - "response_size"
      - "content_type"
      - "server_header"
      - "ssl_time"
      - "connect_time"
      - "dns_time"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withCSVOutput('results/rest-detailed.csv', {
    fields: [
      'timestamp',
      'vu_id',
      'scenario',
      'step_name',
      'duration',
      'success',
      'status',
      'method',
      'url',
      'request_size',
      'response_size',
      'content_type',
      'server_header',
      'ssl_time',
      'connect_time',
      'dns_time'
    ]
  })
  .run();
```

<!-- tabs:end -->

Example output:
```csv
timestamp,vu_id,scenario,step_name,duration,success,status,method,url,request_size,response_size,content_type,server_header,ssl_time,connect_time,dns_time
"2024-01-15T10:30:25.123Z",1,"API Test","Get Users",156,true,200,"GET","/api/users",0,2048,"application/json","nginx/1.18.0",45,12,5
"2024-01-15T10:30:25.456Z",1,"API Test","Create User",289,true,201,"POST","/api/users",512,256,"application/json","nginx/1.18.0",0,0,0
```

### SOAP Protocol Fields

```yaml
outputs:
  - type: "csv"
    file: "results/soap-detailed.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "operation"
      - "soap_action"
      - "wsdl_url"
      - "soap_fault"
      - "fault_code"
      - "fault_string"
      - "envelope_size"
      - "response_size"
```

### Web/Playwright Fields

```yaml
outputs:
  - type: "csv"
    file: "results/web-detailed.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "action_type"
      - "selector"
      - "page_url"
      - "page_title"
      - "dom_ready_time"
      - "load_complete_time"
      - "screenshot_path"
      - "error"
```

## Data Aggregation

### Summary Statistics

```yaml
outputs:
  - type: "csv"
    file: "results/summary-{{timestamp}}.csv"
    aggregation:
      type: "summary"
      group_by: ["scenario", "step_name"]
      metrics:
        - name: "count"
          field: "*"
          function: "count"
        - name: "avg_response_time"
          field: "duration"
          function: "mean"
        - name: "p50_response_time"
          field: "duration"
          function: "percentile"
          percentile: 50
        - name: "p95_response_time"
          field: "duration"
          function: "percentile"
          percentile: 95
        - name: "p99_response_time"
          field: "duration"
          function: "percentile"
          percentile: 99
        - name: "success_rate"
          field: "success"
          function: "mean"
        - name: "error_rate"
          field: "success"
          function: "error_rate"
        - name: "throughput_rps"
          field: "*"
          function: "throughput"
```

Example summary output:
```csv
scenario,step_name,count,avg_response_time,p50_response_time,p95_response_time,p99_response_time,success_rate,error_rate,throughput_rps
"User Login","Login Request",500,156.78,145,289,345,0.998,0.002,8.33
"User Login","Get Profile",500,89.45,82,156,189,1.000,0.000,8.33
"Browse Products","Product List",750,234.12,201,445,567,0.996,0.004,12.50
"Browse Products","Product Details",750,145.89,134,267,298,0.999,0.001,12.50
```

### Time-Based Aggregation

```yaml
outputs:
  - type: "csv"
    file: "results/timeseries-{{timestamp}}.csv"
    aggregation:
      type: "timeseries"
      interval: "30s"                  # 30-second windows
      metrics:
        - name: "window_start"
          function: "window_timestamp"
        - name: "total_requests"
          field: "*"
          function: "count"
        - name: "successful_requests"
          field: "success"
          function: "count_true"
        - name: "failed_requests"
          field: "success"
          function: "count_false"
        - name: "avg_response_time"
          field: "duration"
          function: "mean"
        - name: "p95_response_time"
          field: "duration"
          function: "percentile"
          percentile: 95
        - name: "throughput_rps"
          field: "*"
          function: "rate"
```

Example timeseries output:
```csv
window_start,total_requests,successful_requests,failed_requests,avg_response_time,p95_response_time,throughput_rps
"2024-01-15T10:30:00.000Z",245,244,1,167.89,289,8.17
"2024-01-15T10:30:30.000Z",278,276,2,178.45,312,9.27
"2024-01-15T10:31:00.000Z",298,295,3,156.78,278,9.93
"2024-01-15T10:31:30.000Z",312,310,2,149.56,267,10.40
```

## Multiple CSV Outputs

### Separate Files for Different Data

```yaml
outputs:
  # Raw request data
  - type: "csv"
    file: "results/raw-data-{{timestamp}}.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "url"
      - "error"
    real_time: true
    batch_size: 100

  # Summary statistics
  - type: "csv"
    file: "results/summary-{{timestamp}}.csv"
    aggregation:
      type: "summary"
      group_by: ["scenario"]
      update_interval: "60s"      # Update every minute
    
  # Error details
  - type: "csv"
    file: "results/errors-{{timestamp}}.csv"
    filter: "success == false"    # Only failed requests
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "status"
      - "url"
      - "error"
      - "duration"
```

## Data Processing and Analysis

### Import to Excel/Google Sheets

```yaml
# Excel-friendly format
outputs:
  - type: "csv"
    file: "results/excel-ready-{{timestamp}}.csv"
    csv_options:
      delimiter: ","
      quote_mode: "all"
      date_format: "custom"
      custom_date_format: "%m/%d/%Y %H:%M:%S"
    calculated_fields:
      - name: "response_time_seconds" 
        expression: "duration / 1000"
        format: "%.3f"
      - name: "success_text"
        expression: "if success then 'Success' else 'Failed'"
```

### Database Import

```yaml
# Database-friendly format
outputs:
  - type: "csv"
    file: "results/db-import-{{timestamp}}.csv"
    fields:
      - "id"
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "method"
      - "url"
      - "error"
    csv_options:
      quote_mode: "minimal"
      escape_char: "\\"
      date_format: "iso"
    validation:
      max_field_length: 1000        # Truncate long fields
      sanitize_strings: true        # Remove problematic characters
```

### Statistical Analysis Integration

#### R Integration

```r
# Load CSV data in R
library(readr)
library(dplyr)
library(ggplot2)

# Read the CSV file
data <- read_csv("results/test-results.csv")

# Basic statistics
summary(data$duration)

# Success rate by scenario
success_rates <- data %>%
  group_by(scenario) %>%
  summarise(
    total_requests = n(),
    success_rate = mean(success),
    avg_response_time = mean(duration),
    p95_response_time = quantile(duration, 0.95)
  )

# Plot response time distribution
ggplot(data, aes(x = duration)) +
  geom_histogram(bins = 50, alpha = 0.7) +
  facet_wrap(~scenario) +
  labs(title = "Response Time Distribution by Scenario",
       x = "Response Time (ms)", 
       y = "Frequency")
```

#### Python/Pandas Integration

```python
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Load CSV data
df = pd.read_csv('results/test-results.csv', parse_dates=['timestamp'])

# Basic statistics
print(df['duration'].describe())

# Success rate by scenario
success_summary = df.groupby('scenario').agg({
    'success': ['count', 'mean'],
    'duration': ['mean', 'median', lambda x: x.quantile(0.95)]
}).round(3)

print(success_summary)

# Time series analysis
df.set_index('timestamp', inplace=True)
df['duration'].resample('1min').mean().plot(
    title='Average Response Time Over Time',
    ylabel='Response Time (ms)'
)
plt.show()
```

## Performance Optimization

### High-Volume Testing

```yaml
outputs:
  - type: "csv"
    file: "results/high-volume-{{timestamp}}.csv"
    fields:
      - "timestamp"
      - "duration" 
      - "success"
      - "status"
      # Minimal fields for performance
    real_time: true
    batch_size: 1000              # Large batches
    flush_interval: "5s"          # Frequent flushes
    buffer_size: 10000            # Large buffer
    compression: "gzip"           # Reduce I/O
    csv_options:
      quote_mode: "minimal"       # Faster writing
```

### Memory-Efficient Configuration

```yaml
outputs:
  - type: "csv"
    file: "results/memory-efficient-{{timestamp}}.csv"
    fields:
      - "timestamp"
      - "duration"
      - "success"
      - "status"
    real_time: true
    batch_size: 100
    buffer_size: 500              # Small buffer
    immediate_flush: true         # Don't accumulate in memory
    file_rotation:
      enabled: true
      max_size: "10MB"            # Smaller files
      max_files: 20
```

## Error Handling

### Resilient CSV Output

```yaml
outputs:
  - type: "csv"
    file: "results/resilient-{{timestamp}}.csv"
    error_handling:
      continue_on_write_error: true   # Continue test if write fails
      retry_writes: 3                 # Retry failed writes
      retry_delay: "1s"               # Delay between retries
      fallback_file: "results/fallback.csv"
      log_write_errors: true          # Log write failures
      validate_data: true             # Validate data before writing
    data_sanitization:
      remove_newlines: true           # Remove newlines from fields
      escape_quotes: true             # Properly escape quotes
      max_field_length: 5000          # Truncate overly long fields
      encoding_errors: "replace"      # Handle encoding issues
```

## Best Practices

### 1. Choose Appropriate Fields

```yaml
# Minimal fields for high-performance testing
outputs:
  - type: "csv"
    file: "results/minimal.csv"
    fields:
      - "timestamp"
      - "duration"
      - "success"
      - "status"

# Comprehensive fields for detailed analysis
outputs:
  - type: "csv" 
    file: "results/detailed.csv"
    fields:
      - "timestamp"
      - "vu_id"
      - "scenario"
      - "step_name"
      - "duration"
      - "success"
      - "status"
      - "method"
      - "url"
      - "request_size"
      - "response_size"
      - "error"
```

### 2. Use Real-time Output for Long Tests

```yaml
outputs:
  - type: "csv"
    file: "results/long-test-{{timestamp}}.csv"
    real_time: true
    batch_size: 200
    flush_interval: "30s"
    file_rotation:
      enabled: true
      max_size: "100MB"
```

### 3. Separate Raw Data and Summaries

```yaml
outputs:
  # Raw data for detailed analysis
  - type: "csv"
    file: "results/raw-{{timestamp}}.csv"
    real_time: true
    
  # Summary for quick insights
  - type: "csv"
    file: "results/summary-{{timestamp}}.csv" 
    aggregation:
      type: "summary"
      group_by: ["scenario", "step_name"]
```

### 4. Consider File Size and Performance

```yaml
outputs:
  - type: "csv"
    file: "results/optimized-{{timestamp}}.csv"
    compression: "gzip"           # Reduce file size
    batch_size: 500               # Balance memory and I/O
    csv_options:
      quote_mode: "minimal"       # Faster writing
```

CSV output provides an excellent balance of simplicity, compatibility, and analysis capabilities, making it ideal for performance testing results that need to be shared, analyzed, or imported into various tools.
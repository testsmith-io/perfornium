# JSON Output

JSON output in Perfornium provides structured, machine-readable test results that can be easily processed, analyzed, and integrated with other tools. The JSON format includes detailed information about each request, response metrics, and test metadata.

## Basic Configuration

### Simple JSON Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/test-results.json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/test-results.json')
  .run();
```

<!-- tabs:end -->

### Timestamped JSON Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/test-{{timestamp}}.json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/test-{{timestamp}}.json')
  .run();
```

<!-- tabs:end -->

### Real-time JSON Output

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/streaming-{{timestamp}}.json"
    format: "stream"        # Write results as they happen
    batch_size: 50          # Write every 50 results
    flush_interval: "10s"   # Flush at least every 10 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/streaming-{{timestamp}}.json', {
    format: 'stream',
    batch_size: 50,
    flush_interval: '10s'
  })
  .run();
```

<!-- tabs:end -->

## Output Formats

### Array Format (Default)

Stores all results in a single JSON array:

```json
[
  {
    "id": "1-1642248625123",
    "vu_id": 1,
    "scenario": "User Login",
    "step_name": "Login Request",
    "timestamp": 1642248625123,
    "duration": 156,
    "success": true,
    "status": 200,
    "method": "POST",
    "url": "/api/login",
    "request_headers": {
      "Content-Type": "application/json"
    },
    "response_headers": {
      "Content-Type": "application/json",
      "Set-Cookie": "session=abc123"
    },
    "error": null
  },
  {
    "id": "1-1642248625456",
    "vu_id": 1,
    "scenario": "User Login", 
    "step_name": "Get Profile",
    "timestamp": 1642248625456,
    "duration": 89,
    "success": true,
    "status": 200,
    "method": "GET",
    "url": "/api/profile"
  }
]
```

### NDJSON Format (Newline Delimited)

Each result is a separate JSON object on its own line:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/test-results.ndjson"
    format: "ndjson"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/test-results.ndjson', {
    format: 'ndjson'
  })
  .run();
```

<!-- tabs:end -->

```json
{"id": "1-1642248625123", "vu_id": 1, "scenario": "User Login", "timestamp": 1642248625123, "duration": 156, "success": true}
{"id": "1-1642248625456", "vu_id": 1, "scenario": "User Login", "timestamp": 1642248625456, "duration": 89, "success": true}
{"id": "2-1642248625789", "vu_id": 2, "scenario": "Browse Products", "timestamp": 1642248625789, "duration": 234, "success": true}
```

### Streaming Format

Enables real-time result writing during test execution:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/live-results.json"
    format: "stream"
    batch_size: 25          # Write every 25 results
    buffer_size: 1000       # Buffer up to 1000 results
    compression: "gzip"     # Compress output file
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/live-results.json', {
    format: 'stream',
    batch_size: 25,
    buffer_size: 1000,
    compression: 'gzip'
  })
  .run();
```

<!-- tabs:end -->

## Configuration Options

### Complete Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/comprehensive-{{timestamp}}.json"
    format: "array"                    # array, ndjson, stream
    batch_size: 100                    # Results per batch (stream mode)
    flush_interval: "30s"              # Force flush interval
    buffer_size: 5000                  # Memory buffer size
    compression: "gzip"                # none, gzip, deflate
    pretty_print: true                 # Format JSON for readability
    include_request_headers: true      # Include request headers
    include_response_headers: true     # Include response headers
    include_request_body: false        # Include request body (can be large)
    include_response_body: false       # Include response body (can be large)
    max_body_size: 5000               # Maximum body size to include (bytes)
    include_extracted_data: true       # Include extracted variables
    include_check_results: true        # Include validation check results
    include_system_metrics: false     # Include system resource usage
    file_rotation:
      enabled: true
      max_size: "100MB"               # Rotate when file exceeds size
      max_files: 10                   # Keep 10 historical files
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/comprehensive-{{timestamp}}.json', {
    format: 'array',
    batch_size: 100,
    flush_interval: '30s',
    buffer_size: 5000,
    compression: 'gzip',
    pretty_print: true,
    include_request_headers: true,
    include_response_headers: true,
    include_request_body: false,
    include_response_body: false,
    max_body_size: 5000,
    include_extracted_data: true,
    include_check_results: true,
    include_system_metrics: false,
    file_rotation: {
      enabled: true,
      max_size: '100MB',
      max_files: 10
    }
  })
  .run();
```

<!-- tabs:end -->

## Field Reference

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the result |
| `vu_id` | number | Virtual user ID that made the request |
| `scenario` | string | Name of the scenario |
| `step_name` | string | Name of the step within the scenario |
| `timestamp` | number | Unix timestamp (milliseconds) when request started |
| `duration` | number | Request duration in milliseconds |
| `success` | boolean | Whether the request succeeded |
| `status` | number | HTTP status code (for REST requests) |
| `method` | string | HTTP method (GET, POST, etc.) |
| `url` | string | Full request URL |
| `error` | string/null | Error message if request failed |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `request_headers` | object | Request headers (if enabled) |
| `response_headers` | object | Response headers (if enabled) |
| `request_body` | string | Request body (if enabled and within size limit) |
| `response_body` | string | Response body (if enabled and within size limit) |
| `extracted_data` | object | Variables extracted from response |
| `check_results` | array | Results of validation checks |
| `custom_metrics` | object | Custom metrics from script steps |
| `system_metrics` | object | System resource usage at time of request |

### Protocol-Specific Fields

#### REST Protocol
```json
{
  "protocol": "rest",
  "method": "POST",
  "url": "https://api.example.com/users",
  "status": 201,
  "request_headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  "response_headers": {
    "Content-Type": "application/json",
    "Location": "/users/456"
  }
}
```

#### SOAP Protocol
```json
{
  "protocol": "soap",
  "operation": "GetUserInfo",
  "wsdl": "http://service.example.com?WSDL",
  "soap_action": "http://service.example.com/GetUserInfo",
  "soap_fault": false,
  "fault_code": null,
  "fault_string": null
}
```

#### Web/Playwright Protocol
```json
{
  "protocol": "web",
  "action": "click",
  "selector": "#submit-button",
  "page_url": "https://app.example.com/form",
  "page_title": "User Registration",
  "screenshot_path": "screenshots/step-123.png",
  "performance_metrics": {
    "dom_content_loaded": 1234,
    "load_complete": 2345
  }
}
```

## Advanced Configuration

### Custom Field Selection

Choose which fields to include:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/minimal.json"
    fields:
      - "timestamp"
      - "vu_id"
      - "duration"
      - "success"
      - "status"
      - "url"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/minimal.json', {
    fields: [
      'timestamp',
      'vu_id',
      'duration',
      'success',
      'status',
      'url'
    ]
  })
  .run();
```

<!-- tabs:end -->

### Conditional Field Inclusion

Include fields based on conditions:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/conditional.json"
    conditional_fields:
      request_body:
        condition: "method == 'POST'"
      response_body:
        condition: "status >= 400"      # Only for errors
      extracted_data:
        condition: "success == true"
      error:
        condition: "success == false"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/conditional.json', {
    conditional_fields: {
      request_body: {
        condition: "method == 'POST'"
      },
      response_body: {
        condition: 'status >= 400'
      },
      extracted_data: {
        condition: 'success == true'
      },
      error: {
        condition: 'success == false'
      }
    }
  })
  .run();
```

<!-- tabs:end -->

### Custom Transformations

Transform data before writing:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/transformed.json"
    transformations:
      - field: "timestamp"
        type: "iso_date"              # Convert to ISO date string
      - field: "duration"
        type: "seconds"               # Convert ms to seconds
        decimal_places: 3
      - field: "url"
        type: "path_only"             # Extract path from full URL
      - field: "custom_field"
        type: "script"
        script: |
          function transform(value, record) {
            return {
              response_time_category: value < 1000 ? 'fast' :
                                    value < 5000 ? 'medium' : 'slow',
              timestamp_readable: new Date(record.timestamp).toISOString()
            };
          }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/transformed.json', {
    transformations: [
      {
        field: 'timestamp',
        type: 'iso_date'
      },
      {
        field: 'duration',
        type: 'seconds',
        decimal_places: 3
      },
      {
        field: 'url',
        type: 'path_only'
      },
      {
        field: 'custom_field',
        type: 'script',
        script: `
          function transform(value, record) {
            return {
              response_time_category: value < 1000 ? 'fast' :
                                    value < 5000 ? 'medium' : 'slow',
              timestamp_readable: new Date(record.timestamp).toISOString()
            };
          }
        `
      }
    ]
  })
  .run();
```

<!-- tabs:end -->

## Integration Examples

### Data Analysis with Python

```python
import json
import pandas as pd
import matplotlib.pyplot as plt

# Load JSON results
with open('results/test-results.json', 'r') as f:
    data = json.load(f)

# Convert to DataFrame
df = pd.DataFrame(data)

# Basic analysis
print(f"Total requests: {len(df)}")
print(f"Success rate: {df['success'].mean():.2%}")
print(f"Average response time: {df['duration'].mean():.2f}ms")

# Response time percentiles
percentiles = df['duration'].quantile([0.5, 0.95, 0.99])
print(f"P50: {percentiles[0.5]:.2f}ms")
print(f"P95: {percentiles[0.95]:.2f}ms") 
print(f"P99: {percentiles[0.99]:.2f}ms")

# Plot response time distribution
plt.hist(df['duration'], bins=50, alpha=0.7)
plt.xlabel('Response Time (ms)')
plt.ylabel('Frequency')
plt.title('Response Time Distribution')
plt.show()
```

### Elasticsearch Integration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/elasticsearch-{{timestamp}}.json"
    format: "ndjson"              # Elasticsearch bulk format
    elasticsearch:
      index_name: "perfornium-results"
      type_name: "_doc"
      include_metadata: true
    transformations:
      - field: "@timestamp"
        source: "timestamp"
        type: "iso_date"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/elasticsearch-{{timestamp}}.json', {
    format: 'ndjson',
    elasticsearch: {
      index_name: 'perfornium-results',
      type_name: '_doc',
      include_metadata: true
    },
    transformations: [
      {
        field: '@timestamp',
        source: 'timestamp',
        type: 'iso_date'
      }
    ]
  })
  .run();
```

<!-- tabs:end -->

### Database Import

```sql
-- PostgreSQL example
CREATE TABLE test_results (
    id VARCHAR(50) PRIMARY KEY,
    vu_id INTEGER,
    scenario VARCHAR(100),
    step_name VARCHAR(100),
    timestamp TIMESTAMP,
    duration INTEGER,
    success BOOLEAN,
    status INTEGER,
    method VARCHAR(10),
    url TEXT,
    error TEXT
);

-- Import JSON data using a script
-- python import_json_to_postgres.py results/test-results.json
```

### Real-time Monitoring

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/monitoring-{{timestamp}}.json"
    format: "stream"
    batch_size: 1                     # Immediate writing
    webhook_integration:
      url: "http://monitor.example.com/webhook"
      method: "POST"
      headers:
        Content-Type: "application/json"
      batch_webhook: true             # Send batches to webhook
      webhook_batch_size: 10
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/monitoring-{{timestamp}}.json', {
    format: 'stream',
    batch_size: 1,
    webhook_integration: {
      url: 'http://monitor.example.com/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      batch_webhook: true,
      webhook_batch_size: 10
    }
  })
  .run();
```

<!-- tabs:end -->

## Performance Considerations

### File Size Management

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/large-test-{{timestamp}}.json"
    file_rotation:
      enabled: true
      max_size: "50MB"                # Rotate at 50MB
      max_files: 20                   # Keep 20 files
      compress_rotated: true          # Compress old files
    memory_optimization:
      buffer_size: 1000               # Smaller buffer for less memory
      batch_processing: true          # Process in batches
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/large-test-{{timestamp}}.json', {
    file_rotation: {
      enabled: true,
      max_size: '50MB',
      max_files: 20,
      compress_rotated: true
    },
    memory_optimization: {
      buffer_size: 1000,
      batch_processing: true
    }
  })
  .run();
```

<!-- tabs:end -->

### High-Throughput Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/high-throughput-{{timestamp}}.json"
    format: "ndjson"                  # More efficient for streaming
    batch_size: 500                   # Larger batches
    flush_interval: "5s"              # More frequent flushes
    compression: "gzip"               # Reduce I/O
    async_writing: true               # Non-blocking writes
    write_buffer_size: "64KB"         # Larger write buffers
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/high-throughput-{{timestamp}}.json', {
    format: 'ndjson',
    batch_size: 500,
    flush_interval: '5s',
    compression: 'gzip',
    async_writing: true,
    write_buffer_size: '64KB'
  })
  .run();
```

<!-- tabs:end -->

### Memory-Optimized Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/memory-optimized-{{timestamp}}.json"
    format: "stream"
    include_request_body: false       # Exclude large fields
    include_response_body: false
    include_request_headers: false
    include_response_headers: false
    buffer_size: 100                  # Small buffer
    immediate_flush: true             # Don't buffer in memory
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/memory-optimized-{{timestamp}}.json', {
    format: 'stream',
    include_request_body: false,
    include_response_body: false,
    include_request_headers: false,
    include_response_headers: false,
    buffer_size: 100,
    immediate_flush: true
  })
  .run();
```

<!-- tabs:end -->

## Error Handling

### Resilient Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/resilient-{{timestamp}}.json"
    error_handling:
      continue_on_write_error: true   # Continue test if write fails
      retry_writes: 3                 # Retry failed writes
      retry_delay: "1s"               # Delay between retries
      fallback_file: "results/fallback.json"  # Fallback location
      log_write_errors: true          # Log write failures
    validation:
      validate_json: true             # Validate JSON structure
      max_record_size: "1MB"          # Reject overly large records
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withJSONOutput('results/resilient-{{timestamp}}.json', {
    error_handling: {
      continue_on_write_error: true,
      retry_writes: 3,
      retry_delay: '1s',
      fallback_file: 'results/fallback.json',
      log_write_errors: true
    },
    validation: {
      validate_json: true,
      max_record_size: '1MB'
    }
  })
  .run();
```

<!-- tabs:end -->

## Best Practices

### 1. Choose Appropriate Format

<!-- tabs:start -->

#### **YAML**
```yaml
# For real-time analysis - use streaming NDJSON
outputs:
  - type: "json"
    file: "results/realtime.ndjson"
    format: "ndjson"
    batch_size: 10

# For post-test analysis - use array format
outputs:
  - type: "json"
    file: "results/analysis.json"
    format: "array"
    pretty_print: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// For real-time analysis - use streaming NDJSON
test('Load Test')
  .withJSONOutput('results/realtime.ndjson', {
    format: 'ndjson',
    batch_size: 10
  })
  .run();

// For post-test analysis - use array format
test('Load Test')
  .withJSONOutput('results/analysis.json', {
    format: 'array',
    pretty_print: true
  })
  .run();
```

<!-- tabs:end -->

### 2. Optimize Field Selection

<!-- tabs:start -->

#### **YAML**
```yaml
# Include only necessary fields for performance
outputs:
  - type: "json"
    file: "results/optimized.json"
    fields:
      - "timestamp"
      - "duration"
      - "success"
      - "status"
      - "error"
    # Exclude expensive fields like response bodies
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Include only necessary fields for performance
test('Load Test')
  .withJSONOutput('results/optimized.json', {
    fields: [
      'timestamp',
      'duration',
      'success',
      'status',
      'error'
    ]
  })
  .run();
```

<!-- tabs:end -->

### 3. Use File Rotation

<!-- tabs:start -->

#### **YAML**
```yaml
# Prevent files from becoming too large
outputs:
  - type: "json"
    file: "results/rotated-{{timestamp}}.json"
    file_rotation:
      enabled: true
      max_size: "100MB"
      max_files: 5
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Prevent files from becoming too large
test('Load Test')
  .withJSONOutput('results/rotated-{{timestamp}}.json', {
    file_rotation: {
      enabled: true,
      max_size: '100MB',
      max_files: 5
    }
  })
  .run();
```

<!-- tabs:end -->

### 4. Plan for Integration

<!-- tabs:start -->

#### **YAML**
```yaml
# Structure output for your analysis tools
outputs:
  - type: "json"
    file: "results/elasticsearch-ready.json"
    format: "ndjson"
    transformations:
      - field: "@timestamp"
        source: "timestamp"
        type: "iso_date"
      - field: "response_time_ms"
        source: "duration"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Structure output for your analysis tools
test('Load Test')
  .withJSONOutput('results/elasticsearch-ready.json', {
    format: 'ndjson',
    transformations: [
      {
        field: '@timestamp',
        source: 'timestamp',
        type: 'iso_date'
      },
      {
        field: 'response_time_ms',
        source: 'duration'
      }
    ]
  })
  .run();
```

<!-- tabs:end -->

JSON output provides the most flexible format for storing and analyzing Perfornium test results, supporting everything from simple analysis scripts to complex real-time monitoring systems.
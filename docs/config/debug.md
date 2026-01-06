# Debug Settings

Debug settings in Perfornium provide comprehensive visibility into test execution, helping you diagnose issues, optimize performance, and understand system behavior. This guide covers all debugging capabilities and troubleshooting techniques.

## Overview

Perfornium's debug mode offers:
- Detailed request/response logging
- Performance profiling
- Memory analysis
- Network inspection
- Error diagnostics
- Step-by-step execution

## Enabling Debug Mode

### Command Line

```bash
# Basic debug mode
perfornium run --debug

# Verbose debug output
perfornium run --debug --verbose

# Debug specific components
perfornium run --debug-http --debug-timings
```

### Configuration File

<!-- tabs:start -->

#### **YAML**

```yaml
debug:
  enabled: true
  level: "verbose"
  components:
    - http
    - timings
    - memory
    - network
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Debug Configuration')
  .debug({
    enabled: true,
    level: 'verbose',
    components: ['http', 'timings', 'memory', 'network']
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Environment Variable

```bash
export PERFORNIUM_DEBUG=true
export PERFORNIUM_LOG_LEVEL=debug
perfornium run
```

## Debug Levels

### Available Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `error` | Only errors | Production |
| `warn` | Errors and warnings | Staging |
| `info` | General information | Default |
| `debug` | Detailed debugging | Development |
| `verbose` | Everything including internals | Deep troubleshooting |

### Configuration

<!-- tabs:start -->

#### **YAML**

```yaml
debug:
  level: "debug"

  # Component-specific levels
  components:
    http: "verbose"
    database: "debug"
    cache: "info"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Component-Specific Debug Levels')
  .debug({
    level: 'debug',
    components: {
      http: 'verbose',
      database: 'debug',
      cache: 'info'
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

## Component Debugging

### HTTP Debugging

<!-- tabs:start -->

#### **YAML**

```yaml
debug:
  http:
    enabled: true
    log_headers: true
    log_body: true
    log_cookies: true
    max_body_size: 10000  # Limit body logging

scenarios:
  - name: "API Test"
    debug:
      http: true
    requests:
      - url: "https://api.example.com/users"
        debug:
          log_request: true
          log_response: true
          log_timing: true
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('HTTP Debug Test')
  .debug({
    http: {
      enabled: true,
      log_headers: true,
      log_body: true,
      log_cookies: true,
      max_body_size: 10000
    }
  })
  .scenario('API Test', {
    debug: { http: true }
  })
    .get('https://api.example.com/users')
    .debug({
      log_request: true,
      log_response: true,
      log_timing: true
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

Output example:
```
[DEBUG] HTTP Request:
  Method: GET
  URL: https://api.example.com/users
  Headers:
    User-Agent: Perfornium/1.0
    Accept: application/json
  
[DEBUG] HTTP Response:
  Status: 200 OK
  Time: 234ms
  Headers:
    Content-Type: application/json
    Content-Length: 1234
  Body: {"users": [...]}
```

### Timing Analysis

<!-- tabs:start -->

#### **YAML**

```yaml
debug:
  timings:
    enabled: true
    breakdown: true
    thresholds:
      dns: 100
      tcp: 200
      tls: 300
      request: 1000
      response: 500
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Timing Analysis')
  .debug({
    timings: {
      enabled: true,
      breakdown: true,
      thresholds: {
        dns: 100,
        tcp: 200,
        tls: 300,
        request: 1000,
        response: 500
      }
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

Output:
```
[TIMING] Request Breakdown:
  DNS Lookup:      45ms
  TCP Connect:     120ms
  TLS Handshake:   250ms
  Request Send:    5ms
  Response Wait:   800ms
  Response Read:   34ms
  Total:          1254ms
```

### Memory Profiling

<!-- tabs:start -->

#### **YAML**

```yaml
debug:
  memory:
    enabled: true
    interval: 5s
    gc_stats: true
    heap_snapshot: true
    snapshot_interval: 30s
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Memory Profiling')
  .debug({
    memory: {
      enabled: true,
      interval: '5s',
      gc_stats: true,
      heap_snapshot: true,
      snapshot_interval: '30s'
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

Output:
```
[MEMORY] Statistics:
  RSS: 245MB
  Heap Used: 189MB
  Heap Total: 220MB
  External: 12MB
  GC Count: 45
  GC Time: 234ms
```

## Request Tracing

### Enable Request Tracing

```yaml
debug:
  tracing:
    enabled: true
    sample_rate: 1.0  # Trace all requests
    propagate: true    # Propagate trace headers
    
scenarios:
  - name: "Traced Test"
    requests:
      - url: "https://api.example.com/users"
        trace: true
        trace_id: "{{faker.string.uuid()}}"
```

### Trace Output

```
[TRACE] Request Flow:
  Trace ID: 123e4567-e89b-12d3-a456-426614174000
  
  1. DNS Resolution (45ms)
     - Resolved to 192.168.1.100
  
  2. TCP Connection (120ms)
     - Connected to 192.168.1.100:443
  
  3. TLS Handshake (250ms)
     - Protocol: TLSv1.3
     - Cipher: TLS_AES_256_GCM_SHA384
  
  4. Request Sent (5ms)
     - Bytes: 234
  
  5. Response Received (800ms)
     - Status: 200
     - Bytes: 5678
```

## Error Debugging

### Detailed Error Logging

```yaml
debug:
  errors:
    enabled: true
    stack_trace: true
    request_context: true
    retry_details: true
    suggestions: true
```

### Error Output

```
[ERROR] Request Failed:
  URL: https://api.example.com/users
  Method: GET
  Error: ECONNREFUSED
  
  Stack Trace:
    at Socket.connectionRefused (net.js:123:45)
    at Request.send (request.js:456:78)
    ...
  
  Context:
    Virtual User: 45
    Iteration: 3
    Scenario: "Load Test"
  
  Suggestion: Check if the server is running and accessible
```

## Performance Debugging

### Bottleneck Detection

```yaml
debug:
  performance:
    enabled: true
    cpu_profiling: true
    profile_duration: 30s
    flamegraph: true
    output: "./profiles"
```

### Slow Request Analysis

```yaml
debug:
  slow_requests:
    enabled: true
    threshold: 1000  # ms
    capture_count: 10
    analyze: true
```

Output:
```
[SLOW REQUEST] Analysis:
  URL: https://api.example.com/heavy-operation
  Duration: 3456ms
  
  Breakdown:
    - Server Processing: 3200ms (92.6%)
    - Network Latency: 200ms (5.8%)
    - Client Processing: 56ms (1.6%)
  
  Recommendations:
    - Consider implementing caching
    - Check database query performance
    - Enable response compression
```

## Network Debugging

### Connection Pooling

```yaml
debug:
  network:
    connection_pool: true
    socket_reuse: true
    keepalive: true
    
output:
  console:
    show_connections: true
```

### DNS Debugging

```yaml
debug:
  dns:
    enabled: true
    cache_info: true
    resolution_time: true
    fallback_servers: true
```

## Virtual User Debugging

### VU Lifecycle Tracking

```yaml
debug:
  virtual_users:
    lifecycle: true
    state_changes: true
    errors_per_vu: true
    
scenarios:
  - name: "VU Debug Test"
    debug:
      vu_ids: [1, 5, 10]  # Debug specific VUs
```

Output:
```
[VU:5] State Change: idle -> active
[VU:5] Starting iteration 1
[VU:5] Request 1/3: GET /users
[VU:5] Request completed: 234ms
[VU:5] Think time: 2000ms
[VU:5] State Change: active -> idle
```

## Debug Output Options

### File Output

```yaml
debug:
  output:
    file:
      enabled: true
      path: "./debug.log"
      rotate: true
      max_size: "100MB"
      max_files: 5
```

### Structured Logging

```yaml
debug:
  output:
    format: "json"
    timestamp: true
    metadata:
      test_id: "{{env.TEST_ID}}"
      environment: "{{env.ENV}}"
```

### Real-time Streaming

```yaml
debug:
  output:
    stream:
      enabled: true
      websocket: "ws://localhost:8080/debug"
      filter: "error|slow"
```

## Interactive Debugging

### Step-by-Step Mode

```yaml
debug:
  interactive:
    enabled: true
    breakpoints:
      - before: "Login Request"
      - after: "Data Extraction"
      - on_error: true
```

### Debug REPL

```bash
# Start with REPL
perfornium run --debug-repl

# Commands in REPL
> .requests        # List all requests
> .vu 5           # Inspect VU 5
> .pause          # Pause execution
> .step           # Execute next step
> .continue       # Resume execution
```

## Debugging Specific Issues

### Connection Issues

```yaml
debug:
  connection:
    timeout_details: true
    retry_attempts: true
    ssl_verification: false  # For testing only
    proxy_debug: true
```

### Authentication Problems

```yaml
debug:
  auth:
    token_lifecycle: true
    header_inspection: true
    cookie_tracking: true
```

### Data Issues

```yaml
debug:
  data:
    csv_parsing: true
    variable_resolution: true
    extraction_details: true
    
scenarios:
  - name: "Data Debug"
    debug:
      log_variables: true
      log_extractions: true
```

## Production Debugging

### Safe Production Settings

```yaml
debug:
  production:
    enabled: true
    level: "warn"
    sampling: 0.01  # 1% of requests
    sensitive_data_mask: true
    pii_removal: true
    
  filters:
    exclude_headers:
      - Authorization
      - Cookie
    exclude_body_paths:
      - "$.password"
      - "$.credit_card"
```

### Conditional Debugging

```yaml
debug:
  conditional:
    enabled: true
    conditions:
      - error_rate: "> 5%"
        action: "enable_verbose"
      
      - response_time_p95: "> 2000ms"
        action: "enable_tracing"
      
      - memory_usage: "> 1GB"
        action: "heap_snapshot"
```

## Debug Commands

### CLI Debug Commands

```bash
# Validate configuration
perfornium validate --debug

# Dry run with debug
perfornium run --dry-run --debug

# Debug specific scenario
perfornium run --scenario "Login Test" --debug

# Export debug report
perfornium debug --export report.html
```

### Runtime Debug Control

```yaml
debug:
  runtime_control:
    enabled: true
    port: 9229
    commands:
      - "toggle"     # Toggle debug on/off
      - "increase"   # Increase debug level
      - "decrease"   # Decrease debug level
      - "snapshot"   # Take heap snapshot
```

## Best Practices

### Development Debugging

```yaml
# dev-debug.yml
debug:
  enabled: true
  level: "debug"
  components: ["http", "timing", "errors"]
  output:
    console: true
    file: "./debug.log"
```

### CI/CD Debugging

```yaml
# ci-debug.yml
debug:
  enabled: "{{env.CI_DEBUG || false}}"
  level: "info"
  errors:
    detailed: true
    suggestions: true
  output:
    file: "./test-results/debug.log"
```

### Performance Impact

```yaml
# Minimal impact debugging
debug:
  enabled: true
  level: "warn"
  sampling: 0.1  # 10% sampling
  async: true    # Non-blocking logging
  buffer_size: 1000
```

## Troubleshooting Guide

### Common Debug Scenarios

1. **High response times**
   ```yaml
   debug:
     timings: true
     slow_requests:
       threshold: 500
   ```

2. **Memory leaks**
   ```yaml
   debug:
     memory:
       interval: 10s
       heap_snapshot: true
   ```

3. **Connection failures**
   ```yaml
   debug:
     network: true
     connection:
       timeout_details: true
   ```

4. **Data validation issues**
   ```yaml
   debug:
     data:
       extraction_details: true
       validation_errors: true
   ```

Debug settings are essential for understanding test behavior, diagnosing issues, and optimizing performance. Use them wisely to maintain the balance between visibility and performance.
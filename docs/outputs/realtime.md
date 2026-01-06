# Real-time Metrics

Real-time metrics provide live performance data during test execution, enabling immediate visibility into your application's behavior under load. This allows you to monitor test progress, detect issues early, and make real-time adjustments.

## Overview

Real-time metrics are continuously updated during test execution and can be consumed through various channels including console output, web dashboards, external monitoring systems, and APIs.

## Configuration

### Enable Real-time Metrics

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  realtime:
    enabled: true
    interval: 5s
    console: true
    web: true
    port: 3001
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withRealtime({
    enabled: true,
    interval: '5s',
    console: true,
    web: true,
    port: 3001
  })
  .run();
```

<!-- tabs:end -->

### Basic Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 100
  duration: "10m"

outputs:
  realtime:
    enabled: true
    interval: 1s
    channels:
      - console
      - web
      - websocket
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    duration: '10m'
  })
  .withRealtime({
    enabled: true,
    interval: '1s',
    channels: ['console', 'web', 'websocket']
  })
  .run();
```

<!-- tabs:end -->

## Available Metrics

### Core Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| `active_vus` | Currently active virtual users | count |
| `requests_per_second` | Request rate | req/s |
| `response_time_avg` | Average response time | ms |
| `response_time_p95` | 95th percentile response time | ms |
| `response_time_p99` | 99th percentile response time | ms |
| `success_rate` | Percentage of successful requests | % |
| `error_rate` | Percentage of failed requests | % |
| `bytes_sent` | Data transmitted | bytes/s |
| `bytes_received` | Data received | bytes/s |

### Advanced Metrics

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  realtime:
    enabled: true
    metrics:
      - active_vus
      - requests_per_second
      - response_times
      - success_rate
      - custom_counters
      - memory_usage
      - cpu_usage
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withRealtime({
    enabled: true,
    metrics: [
      'active_vus',
      'requests_per_second',
      'response_times',
      'success_rate',
      'custom_counters',
      'memory_usage',
      'cpu_usage'
    ]
  })
  .run();
```

<!-- tabs:end -->

## Output Channels

### Console Output

Real-time metrics displayed in the terminal:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  realtime:
    console:
      enabled: true
      format: "table"
      refresh_rate: 1s
      show_percentiles: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withRealtime({
    console: {
      enabled: true,
      format: 'table',
      refresh_rate: '1s',
      show_percentiles: true
    }
  })
  .run();
```

<!-- tabs:end -->

Sample console output:
```
┌─────────────────┬─────────┬──────────┬─────────┬─────────┬──────────┐
│ Time            │ VUs     │ Req/s    │ Avg (ms)│ P95 (ms)│ Success  │
├─────────────────┼─────────┼──────────┼─────────┼─────────┼──────────┤
│ 00:01:30        │ 50/100  │ 125.3    │ 245     │ 512     │ 99.2%    │
│ 00:01:35        │ 75/100  │ 183.7    │ 289     │ 634     │ 98.8%    │
│ 00:01:40        │ 100/100 │ 234.1    │ 312     │ 723     │ 98.5%    │
└─────────────────┴─────────┴──────────┴─────────┴─────────┴──────────┘
```

### Web Dashboard

Built-in web dashboard for visual monitoring:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  realtime:
    web:
      enabled: true
      port: 3001
      host: "localhost"
      update_interval: 2s
      charts:
        - response_times
        - throughput
        - virtual_users
        - error_rate
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withRealtime({
    web: {
      enabled: true,
      port: 3001,
      host: 'localhost',
      update_interval: '2s',
      charts: [
        'response_times',
        'throughput',
        'virtual_users',
        'error_rate'
      ]
    }
  })
  .run();
```

<!-- tabs:end -->

Access dashboard at: `http://localhost:3001`

### WebSocket Stream

Real-time streaming for custom integrations:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  realtime:
    websocket:
      enabled: true
      port: 3002
      path: "/metrics"
      format: "json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withRealtime({
    websocket: {
      enabled: true,
      port: 3002,
      path: '/metrics',
      format: 'json'
    }
  })
  .run();
```

<!-- tabs:end -->

Connect to: `ws://localhost:3002/metrics`

## Custom Metrics

### Define Custom Counters

```yaml
scenarios:
  - name: "API Load Test"
    requests:
      - url: "https://api.example.com/users"
        method: GET
        extract:
          - name: "user_count"
            type: "json_path"
            expression: "$.length"
        checks:
          - type: "custom_counter"
            name: "users_processed"
            increment: "{{user_count}}"

outputs:
  realtime:
    custom_metrics:
      - name: "users_processed"
        type: "counter"
        description: "Total users processed"
```

### Custom Gauges

```yaml
outputs:
  realtime:
    custom_metrics:
      - name: "queue_depth"
        type: "gauge"
        description: "Current queue depth"
        expression: "{{extracted.queue_size}}"
```

## Integration Examples

### Prometheus Integration

```yaml
outputs:
  realtime:
    prometheus:
      enabled: true
      port: 9090
      path: "/metrics"
      labels:
        environment: "staging"
        test_name: "api_load_test"
```

### InfluxDB Integration

```yaml
outputs:
  realtime:
    influxdb:
      enabled: true
      url: "http://localhost:8086"
      database: "performance_tests"
      measurement: "load_test_metrics"
      tags:
        test_id: "{{env.TEST_ID}}"
        branch: "{{env.GIT_BRANCH}}"
```

### Grafana Dashboard

```yaml
outputs:
  realtime:
    grafana:
      enabled: true
      dashboard_url: "http://localhost:3000/d/perfornium"
      annotations: true
      alerts:
        - metric: "response_time_p95"
          threshold: 1000
          action: "alert"
```

## Alerting

### Threshold-based Alerts

```yaml
outputs:
  realtime:
    alerts:
      - name: "High Response Time"
        metric: "response_time_p95"
        condition: "> 1000"
        action: "webhook"
        webhook_url: "https://hooks.slack.com/services/..."
      
      - name: "High Error Rate"
        metric: "error_rate"
        condition: "> 5"
        action: "email"
        email: "alerts@company.com"
      
      - name: "Low Success Rate"
        metric: "success_rate"
        condition: "< 95"
        action: "stop_test"
```

### Custom Alert Actions

```yaml
outputs:
  realtime:
    alerts:
      - name: "Performance Degradation"
        conditions:
          - metric: "response_time_avg"
            condition: "> baseline * 1.5"
          - metric: "requests_per_second"
            condition: "< baseline * 0.8"
        action: "script"
        script: |
          console.log('Performance degradation detected!');
          // Custom remediation logic
```

## Advanced Configuration

### Sampling and Aggregation

```yaml
outputs:
  realtime:
    sampling:
      enabled: true
      rate: 0.1  # Sample 10% of requests
    
    aggregation:
      window_size: 10s
      functions:
        - avg
        - p95
        - p99
        - count
        - sum
```

### Data Retention

```yaml
outputs:
  realtime:
    retention:
      memory_limit: "500MB"
      time_window: "1h"
      cleanup_interval: "5m"
```

### Performance Optimization

```yaml
outputs:
  realtime:
    performance:
      buffer_size: 1000
      batch_size: 100
      async_updates: true
      compression: true
```

## Monitoring Multiple Tests

### Test Comparison

```yaml
outputs:
  realtime:
    comparison:
      enabled: true
      baseline_test: "test_20231201_143022"
      show_diff: true
      diff_threshold: 10  # Show differences > 10%
```

### Multi-test Dashboard

```yaml
outputs:
  realtime:
    multi_test:
      enabled: true
      tests:
        - name: "API Test"
          config: "api-test.yml"
        - name: "Frontend Test"
          config: "frontend-test.yml"
      sync_timeline: true
```

## API Access

### REST API Endpoints

Access real-time metrics via REST API:

```yaml
outputs:
  realtime:
    api:
      enabled: true
      port: 3003
      endpoints:
        - "/metrics/current"
        - "/metrics/history"
        - "/metrics/summary"
```

Example API calls:
```bash
# Current metrics
curl http://localhost:3003/metrics/current

# Historical data
curl http://localhost:3003/metrics/history?from=2023-12-01T10:00:00Z

# Test summary
curl http://localhost:3003/metrics/summary
```

## Best Practices

### Performance Considerations

1. **Update Intervals**: Balance between real-time visibility and system overhead
   ```yaml
   # Good for development
   interval: 1s
   
   # Good for production
   interval: 5s
   ```

2. **Selective Metrics**: Only collect metrics you need
   ```yaml
   metrics:
     - active_vus
     - requests_per_second
     - response_time_p95
     # Avoid collecting all metrics in high-load tests
   ```

3. **Sampling**: Use sampling for high-volume tests
   ```yaml
   sampling:
     rate: 0.05  # 5% sampling for very high load
   ```

### Monitoring Strategy

1. **Key Metrics**: Focus on business-critical metrics
2. **Baseline Comparison**: Always compare against known baselines
3. **Alert Thresholds**: Set meaningful thresholds based on SLAs
4. **Historical Context**: Keep historical data for trend analysis

### Integration Patterns

```yaml
# Development environment
outputs:
  realtime:
    console: true
    web: true

# CI/CD pipeline
outputs:
  realtime:
    api: true
    alerts:
      - action: "fail_build"
        condition: "error_rate > 1"

# Production monitoring
outputs:
  realtime:
    prometheus: true
    grafana: true
    alerts:
      - action: "webhook"
        webhook_url: "{{env.ALERT_WEBHOOK}}"
```

Real-time metrics provide immediate insights into your application's performance, enabling faster feedback loops and more effective performance testing workflows.
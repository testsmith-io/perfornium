# Metrics Format

This document describes the metrics collected and reported by Perfornium.

## MetricsSummary

The main metrics summary object containing all aggregated metrics from a test run.

### Core Metrics

| Field | Type | Description |
|-------|------|-------------|
| `total_requests` | number | Total number of requests made |
| `successful_requests` | number | Number of successful requests |
| `failed_requests` | number | Number of failed requests |
| `success_rate` | number | Success rate (0.0 - 1.0) |
| `total_duration` | number | Total test duration in milliseconds |

### Response Time Metrics

| Field | Type | Description |
|-------|------|-------------|
| `avg_response_time` | number | Average response time in milliseconds |
| `min_response_time` | number | Minimum response time in milliseconds |
| `max_response_time` | number | Maximum response time in milliseconds |
| `percentiles` | object | Response time percentiles (p50, p90, p95, p99) |

### Throughput Metrics

| Field | Type | Description |
|-------|------|-------------|
| `requests_per_second` | number | Average requests per second |
| `bytes_per_second` | number | Average data throughput in bytes/second |

### Distribution Metrics

| Field | Type | Description |
|-------|------|-------------|
| `error_distribution` | object | Count of errors grouped by error type |
| `status_distribution` | object | Count of responses grouped by HTTP status code |
| `error_details` | array | Detailed information about each error type |

### Enhanced Statistics

| Field | Type | Description |
|-------|------|-------------|
| `step_statistics` | array | Per-step aggregated statistics |
| `vu_ramp_up` | array | Virtual user start events |
| `timeline_data` | array | Time-series data for visualization |

## Example MetricsSummary

```json
{
  "total_requests": 50000,
  "successful_requests": 49500,
  "failed_requests": 500,
  "success_rate": 0.99,
  "avg_response_time": 145.6,
  "min_response_time": 12,
  "max_response_time": 4523,
  "percentiles": {
    "50": 120,
    "90": 280,
    "95": 450,
    "99": 1200
  },
  "requests_per_second": 166.67,
  "bytes_per_second": 2048000,
  "total_duration": 300000,
  "error_distribution": {
    "timeout": 300,
    "connection_refused": 150,
    "http_500": 50
  },
  "status_distribution": {
    "200": 48000,
    "201": 1500,
    "400": 200,
    "500": 250,
    "503": 50
  },
  "step_statistics": [],
  "vu_ramp_up": [],
  "timeline_data": [],
  "error_details": []
}
```

## Core Web Vitals (Optional)

When browser testing is enabled, Perfornium can capture Core Web Vitals metrics.

| Field | Type | Description |
|-------|------|-------------|
| `lcp` | number | Largest Contentful Paint (ms) |
| `fid` | number | First Input Delay (ms) |
| `cls` | number | Cumulative Layout Shift (score) |
| `fcp` | number | First Contentful Paint (ms) |
| `ttfb` | number | Time to First Byte (ms) |
| `tti` | number | Time to Interactive (ms) |
| `tbt` | number | Total Blocking Time (ms) |
| `speedIndex` | number | Speed Index (score) |

### Web Vitals Scoring

| Field | Type | Description |
|-------|------|-------------|
| `vitals_score` | string | Overall score: 'good', 'needs-improvement', 'poor' |
| `vitals_details` | object | Per-metric scores and values |

### Example

```json
{
  "web_vitals_data": {
    "lcp": 2500,
    "fid": 100,
    "cls": 0.1,
    "fcp": 1800,
    "ttfb": 600,
    "tti": 3500,
    "tbt": 300,
    "speedIndex": 3200
  },
  "vitals_score": "good",
  "vitals_details": {
    "lcp": { "value": 2500, "score": "good" },
    "fid": { "value": 100, "score": "good" },
    "cls": { "value": 0.1, "score": "good" },
    "fcp": { "value": 1800, "score": "good" },
    "ttfb": { "value": 600, "score": "needs-improvement" }
  }
}
```

## Verification Metrics (Optional)

When verification/assertion checks are enabled:

| Field | Type | Description |
|-------|------|-------------|
| `total_verifications` | number | Total number of verification checks |
| `success_rate` | number | Verification success rate (0.0 - 1.0) |
| `average_duration` | number | Average verification duration (ms) |
| `p95_duration` | number | 95th percentile verification duration |
| `slowest_step` | object | Information about the slowest verified step |
| `fastest_step` | object | Information about the fastest verified step |

## Percentile Calculations

Perfornium calculates the following percentiles by default:

| Percentile | Description |
|------------|-------------|
| p50 (median) | 50% of requests completed within this time |
| p75 | 75% of requests completed within this time |
| p90 | 90% of requests completed within this time |
| p95 | 95% of requests completed within this time |
| p99 | 99% of requests completed within this time |
| p99.9 | 99.9% of requests completed within this time |

### Percentile Example

```json
{
  "percentiles": {
    "50": 120,
    "75": 180,
    "90": 280,
    "95": 450,
    "99": 1200,
    "99.9": 3500
  }
}
```

## Real-time Metrics

During test execution, Perfornium can stream metrics in real-time.

### Real-time Data Point

```json
{
  "timestamp": 1704067260000,
  "elapsed_seconds": 60,
  "active_vus": 50,
  "requests_total": 3500,
  "requests_ok": 3480,
  "requests_failed": 20,
  "rps": 58.3,
  "avg_response_time": 142,
  "p95_response_time": 380
}
```

### Streaming Configuration

```yaml
outputs:
  - type: "json"
    file: "metrics-stream.json"
    format: "stream"
    metrics_interval: "5s"  # Emit aggregated metrics every 5 seconds
```

## CSV Metrics Format

When using CSV output, metrics are written with the following columns:

| Column | Description |
|--------|-------------|
| timestamp | Unix timestamp in milliseconds |
| elapsed | Elapsed time since test start |
| thread_name | Virtual user thread identifier |
| scenario | Scenario name |
| step_name | Step name |
| response_time | Response time in milliseconds |
| latency | Time to first byte |
| connect_time | Connection establishment time |
| success | true/false |
| status | HTTP status code |
| bytes_sent | Request size in bytes |
| bytes_received | Response size in bytes |
| error | Error message (if any) |

### Example CSV

```csv
timestamp,elapsed,thread_name,scenario,step_name,response_time,latency,connect_time,success,status,bytes_sent,bytes_received,error
1704067200123,123,1-1,User Login,POST /login,245,180,45,true,200,256,1024,
1704067200456,456,1-2,User Login,GET /profile,89,65,0,true,200,128,2048,
1704067200789,789,2-1,Browse Products,GET /products,156,120,35,true,200,64,8192,
```

## InfluxDB Metrics Format

When sending metrics to InfluxDB:

```
perfornium,scenario=UserLogin,step=POST_login response_time=245,latency=180,success=1,status=200 1704067200123000000
```

### Tags

| Tag | Description |
|-----|-------------|
| scenario | Scenario name |
| step | Step name |
| vu_id | Virtual user ID |
| status_group | Status code group (2xx, 4xx, 5xx) |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| response_time | float | Response time in ms |
| latency | float | Time to first byte |
| connect_time | float | Connection time |
| success | integer | 1 for success, 0 for failure |
| status | integer | HTTP status code |
| bytes_sent | integer | Request size |
| bytes_received | integer | Response size |

## Graphite Metrics Format

When sending metrics to Graphite:

```
perfornium.scenario.UserLogin.step.POST_login.response_time 245 1704067200
perfornium.scenario.UserLogin.step.POST_login.success 1 1704067200
perfornium.scenario.UserLogin.step.POST_login.status.200 1 1704067200
```

### Metric Paths

```
perfornium.<scenario>.<step>.response_time
perfornium.<scenario>.<step>.latency
perfornium.<scenario>.<step>.success
perfornium.<scenario>.<step>.failure
perfornium.<scenario>.<step>.status.<code>
perfornium.summary.requests_total
perfornium.summary.requests_ok
perfornium.summary.requests_failed
perfornium.summary.active_vus
perfornium.summary.rps
```

## Aggregation Intervals

Metrics can be aggregated at different intervals:

| Interval | Use Case |
|----------|----------|
| 1s | Real-time monitoring, dashboards |
| 5s | Detailed analysis |
| 30s | Summary reports |
| 1m | Long-running tests |

### Configuration

```yaml
outputs:
  - type: "influxdb"
    url: "http://localhost:8086"
    database: "perfornium"
    aggregation_interval: "5s"
```

## Threshold Evaluation

Metrics can be evaluated against thresholds:

```yaml
thresholds:
  - metric: "response_time.p95"
    operator: "<"
    value: 500
    abort_on_fail: false

  - metric: "success_rate"
    operator: ">="
    value: 0.99
    abort_on_fail: true
```

### Threshold Result

```json
{
  "thresholds": [
    {
      "metric": "response_time.p95",
      "expected": "< 500",
      "actual": 450,
      "passed": true
    },
    {
      "metric": "success_rate",
      "expected": ">= 0.99",
      "actual": 0.995,
      "passed": true
    }
  ],
  "all_passed": true
}
```

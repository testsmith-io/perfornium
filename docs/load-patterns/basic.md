# Basic Load Pattern

The Basic Load Pattern is the simplest and most commonly used load pattern in Perfornium. It creates a specified number of virtual users (VUs) with a configurable ramp-up period and maintains that load for a defined duration.

## Configuration

### Simple Basic Load

```yaml
load:
  pattern: "basic"
  virtual_users: 10
  duration: "2m"
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })`

This creates 10 virtual users immediately and runs the test for 2 minutes.

### Basic Load with Ramp-Up

```yaml
load:
  pattern: "basic"
  virtual_users: 50
  ramp_up: "30s"
  duration: "5m"
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 50, ramp_up: '30s', duration: '5m' })`

This gradually creates 50 virtual users over 30 seconds, then maintains that load for 5 minutes.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `virtual_users` | number | Yes | - | Number of virtual users to create |
| `ramp_up` | string | No | "0s" | Time to gradually create all VUs |
| `duration` | string | No | ∞ | How long to maintain the load |
| `ramp_down` | string | No | "0s" | Time to gradually stop VUs |

## Duration Formats

Perfornium supports flexible duration formats:

```yaml
# Seconds
duration: "30s"
duration: "30"      # Defaults to seconds

# Minutes  
duration: "5m"
duration: "2.5m"    # 2 minutes 30 seconds

# Hours
duration: "1h"
duration: "1.5h"    # 1 hour 30 minutes

# Combinations
duration: "1h30m45s"  # 1 hour, 30 minutes, 45 seconds
```

## Load Patterns

### Immediate Load

Start all virtual users immediately without ramp-up:

```yaml
load:
  pattern: "basic"
  virtual_users: 20
  duration: "3m"
  # No ramp_up specified = immediate start
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 20, duration: '3m' })`

**Timeline:**
```
VUs
 20 |████████████████████████
 15 |████████████████████████
 10 |████████████████████████
  5 |████████████████████████
  0 +────────────────────────
    0    1m   2m   3m   Time
```

### Gradual Ramp-Up

Gradually increase load to avoid overwhelming the system:

```yaml
load:
  pattern: "basic"
  virtual_users: 100
  ramp_up: "2m"
  duration: "10m"
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 100, ramp_up: '2m', duration: '10m' })`

**Timeline:**
```
VUs
100 |    ████████████████████
 75 |  ██████████████████████
 50 |████████████████████████  
 25 |████████████████████████
  0 +────────────────────────
    0  2m  4m  6m  8m 10m 12m
       │    └─ Steady State ─┘
       └─ Ramp Up
```

### Controlled Ramp-Down

Gradually reduce load at the end of the test:

```yaml
load:
  pattern: "basic"
  virtual_users: 50
  ramp_up: "1m"
  duration: "5m"
  ramp_down: "30s"
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 50, ramp_up: '1m', duration: '5m', ramp_down: '30s' })`

**Timeline:**
```
VUs
 50 |  ████████████████████
 40 |████████████████████████
 30 |████████████████████████
 20 |████████████████████████
 10 |████████████████████████
  0 +────────────────────────
    0   1m  2m  3m  4m  5m  6m 6.5m
        │   └─ Duration ─┘   │  │
        └─ Ramp Up          └─ Down
```

## Advanced Configuration

### Think Time Between Requests

Add realistic delays between user actions:

```yaml
load:
  pattern: "basic"
  virtual_users: 25
  duration: "3m"
  think_time: "1-3"  # Random delay between 1-3 seconds
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 25, duration: '3m', think_time: '1-3' })`

### Pre-allocation for Faster Startup

Pre-allocate virtual users for immediate availability:

```yaml
load:
  pattern: "basic"
  virtual_users: 100
  ramp_up: "30s"
  duration: "5m"
  preallocate_vus: 20  # Keep 20 VUs ready
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 100, ramp_up: '30s', duration: '5m', preallocate_vus: 20 })`

### VU Lifecycle Options

```yaml
load:
  pattern: "basic"
  virtual_users: 50
  duration: "10m"
  vu_options:
    max_iterations: 100      # Max iterations per VU
    max_duration: "15m"      # Max time per VU
    restart_on_error: true   # Restart VU if it fails
    graceful_shutdown: "10s" # Time to finish current iteration
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 50, duration: '10m', vu_options: { max_iterations: 100, max_duration: '15m', restart_on_error: true, graceful_shutdown: '10s' } })`

## Use Cases

### 1. Smoke Testing

Quick validation that the system can handle minimal load:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Smoke Test - API Health Check"

load:
  pattern: "basic"
  virtual_users: 1
  duration: "30s"

scenarios:
  - name: "Health Check"
    steps:
      - name: "Check API Status"
        type: "rest"
        method: "GET"
        path: "/health"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Smoke Test - API Health Check')
  .scenario('Health Check')
    .get('/health', { name: 'Check API Status' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 1,
    duration: '30s'
  })
  .build();
```

<!-- tabs:end -->

### 2. Load Testing

Test system behavior under expected production load:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Load Test - Normal Traffic"

load:
  pattern: "basic"
  virtual_users: 100
  ramp_up: "2m"
  duration: "10m"
  think_time: "2-5"

scenarios:
  - name: "Typical User Journey"
    steps:
      - name: "Browse Products"
        type: "rest"
        method: "GET"
        path: "/products"
      - name: "View Product Details"
        type: "rest"
        method: "GET"
        path: "/products/{{product_id}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test - Normal Traffic')
  .scenario('Typical User Journey')
    .get('/products', { name: 'Browse Products' })
    .get('/products/{{product_id}}', { name: 'View Product Details' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    ramp_up: '2m',
    duration: '10m',
    think_time: '2-5'
  })
  .build();
```

<!-- tabs:end -->

### 3. Stress Testing

Test system limits by applying sustained high load:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Stress Test - Peak Load"

load:
  pattern: "basic"
  virtual_users: 500
  ramp_up: "5m"
  duration: "30m"
  ramp_down: "2m"

scenarios:
  - name: "High Load Scenario"
    weight: 1
    steps:
      - name: "API Calls"
        type: "rest"
        method: "GET"
        path: "/api/data"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Stress Test - Peak Load')
  .scenario('High Load Scenario', { weight: 1 })
    .get('/api/data', { name: 'API Calls' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 500,
    ramp_up: '5m',
    duration: '30m',
    ramp_down: '2m'
  })
  .build();
```

<!-- tabs:end -->

### 4. Endurance Testing

Test system stability over extended periods:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Endurance Test - Long Running"

load:
  pattern: "basic"
  virtual_users: 50
  ramp_up: "2m"
  duration: "2h"
  think_time: "5-10"

scenarios:
  - name: "Long Running Operations"
    steps:
      - name: "Database Query"
        type: "rest"
        method: "POST"
        path: "/search"
        body: '{"query": "{{search_term}}"}'
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Endurance Test - Long Running')
  .scenario('Long Running Operations')
    .post('/search', {
      name: 'Database Query',
      body: { query: '{{search_term}}' }
    })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 50,
    ramp_up: '2m',
    duration: '2h',
    think_time: '5-10'
  })
  .build();
```

<!-- tabs:end -->

## Performance Considerations

### Memory Usage

Basic load pattern memory usage is predictable:

```yaml
# Low memory usage
load:
  pattern: "basic"
  virtual_users: 50      # ~5-10MB per VU

# High memory usage
load:
  pattern: "basic"
  virtual_users: 1000    # ~500MB-1GB total
```

> **Note:** In TypeScript DSL, these would use `.withLoad({ pattern: 'basic', virtual_users: 50 })` and `.withLoad({ pattern: 'basic', virtual_users: 1000 })` respectively.

### CPU Usage

CPU usage scales with virtual user count and activity:

```yaml
# CPU-intensive scenario
load:
  pattern: "basic"
  virtual_users: 100
  think_time: "0"        # No delays = max CPU usage

# CPU-friendly scenario
load:
  pattern: "basic"
  virtual_users: 100
  think_time: "2-5"      # Delays reduce CPU usage
```

> **Note:** In TypeScript DSL, these would use `.withLoad({ pattern: 'basic', virtual_users: 100, think_time: '0' })` and `.withLoad({ pattern: 'basic', virtual_users: 100, think_time: '2-5' })` respectively.

### Network Connections

Consider connection limits:

```yaml
global:
  connection_pool:
    max_connections: 200        # Limit total connections
    max_connections_per_host: 50 # Per-host limit

load:
  pattern: "basic"
  virtual_users: 100
  # Will reuse connections efficiently
```

> **Note:** In TypeScript DSL, this would use `.withGlobal({ connection_pool: { max_connections: 200, max_connections_per_host: 50 } })` and `.withLoad({ pattern: 'basic', virtual_users: 100 })`.

## Monitoring and Metrics

### Key Metrics

When using basic load patterns, monitor these metrics:

1. **Response Time Percentiles** (50th, 95th, 99th)
2. **Throughput** (requests per second)
3. **Error Rate** (percentage of failed requests)
4. **Resource Utilization** (CPU, memory, network)

### Real-time Monitoring

```yaml
outputs:
  - type: "json"
    file: "results/basic-load-{{timestamp}}.json"
    real_time: true
    batch_size: 100
    
  - type: "csv"
    file: "results/basic-load-{{timestamp}}.csv"
    real_time: true
    batch_size: 50

report:
  generate: true
  output: "reports/basic-load-report.html"
  refresh_interval: 10  # Update every 10 seconds
```

## Troubleshooting

### Common Issues

#### 1. Slow Ramp-Up
```yaml
# Problem: Ramp-up takes too long
load:
  pattern: "basic"
  virtual_users: 1000
  ramp_up: "10m"         # Too long for 1000 VUs

# Solution: Adjust ramp-up time
load:
  pattern: "basic"
  virtual_users: 1000
  ramp_up: "2m"          # Faster ramp-up
  preallocate_vus: 100   # Pre-allocate for speed
```

> **Note:** In TypeScript DSL, the problem would be `.withLoad({ pattern: 'basic', virtual_users: 1000, ramp_up: '10m' })` and the solution would be `.withLoad({ pattern: 'basic', virtual_users: 1000, ramp_up: '2m', preallocate_vus: 100 })`.

#### 2. System Overload
```yaml
# Problem: Too many VUs cause system overload
load:
  pattern: "basic"
  virtual_users: 1000
  ramp_up: "30s"         # Too fast

# Solution: Gradual increase
load:
  pattern: "basic"
  virtual_users: 1000
  ramp_up: "5m"          # Slower ramp-up
  think_time: "1-3"      # Add delays
```

> **Note:** In TypeScript DSL, the problem would be `.withLoad({ pattern: 'basic', virtual_users: 1000, ramp_up: '30s' })` and the solution would be `.withLoad({ pattern: 'basic', virtual_users: 1000, ramp_up: '5m', think_time: '1-3' })`.

#### 3. Uneven Load Distribution

**Problem:** VUs finish at different times

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 100
  duration: "5m"

scenarios:
  - name: "Mixed Operations"
    steps:
      - name: "Fast Operation"
        type: "rest"
        method: "GET"
        path: "/fast"
      - name: "Slow Operation"  # Some VUs get stuck here
        type: "rest"
        method: "POST"
        path: "/slow"
        timeout: 30000
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Uneven Load Problem')
  .scenario('Mixed Operations')
    .get('/fast', { name: 'Fast Operation' })
    .post('/slow', {
      name: 'Slow Operation',
      timeout: 30000
    })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**Solution:** Add timeouts and error handling

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Reliable Operations"
    steps:
      - name: "Fast Operation"
        type: "rest"
        method: "GET"
        path: "/fast"
        timeout: 5000
      - name: "Slow Operation"
        type: "rest"
        method: "POST"
        path: "/slow"
        timeout: 10000
        retry:
          count: 2
          delay: "1s"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Uneven Load Solution')
  .scenario('Reliable Operations')
    .get('/fast', {
      name: 'Fast Operation',
      timeout: 5000
    })
    .post('/slow', {
      name: 'Slow Operation',
      timeout: 10000,
      retry: { count: 2, delay: '1s' }
    })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Best Practices

### 1. Start Small

```yaml
# Begin with minimal load
load:
  pattern: "basic"
  virtual_users: 5
  duration: "1m"
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 5, duration: '1m' })`

### 2. Gradual Scaling

```yaml
# Scale up gradually across test runs
# Run 1:
virtual_users: 10
# Run 2:
virtual_users: 25
# Run 3:
virtual_users: 50
```

> **Note:** These are partial configurations showing the virtual_users parameter only.

### 3. Realistic Think Time

```yaml
load:
  pattern: "basic"
  virtual_users: 50
  think_time: "2-8"  # Realistic user behavior
```

> **Note:** In TypeScript DSL, this would be: `.withLoad({ pattern: 'basic', virtual_users: 50, think_time: '2-8' })`

### 4. Monitor Resource Usage

```yaml
# Include system monitoring
outputs:
  - type: "influxdb"
    url: "http://localhost:8086"
    database: "performance"

  - type: "webhook"
    url: "http://monitoring.example.com/webhook"
    interval: "30s"
```

> **Note:** In TypeScript DSL, this would use `.withOutputs([{ type: 'influxdb', url: 'http://localhost:8086', database: 'performance' }, { type: 'webhook', url: 'http://monitoring.example.com/webhook', interval: '30s' }])`.

### 5. Define Success Criteria

```yaml
# Set clear performance goals
checks:
  - type: "response_time"
    value: "<2000"
    description: "95th percentile < 2s"

  - type: "error_rate"
    value: "<1%"
    description: "Error rate < 1%"
```

> **Note:** In TypeScript DSL, this would use `.withChecks([{ type: 'response_time', value: '<2000', description: '95th percentile < 2s' }, { type: 'error_rate', value: '<1%', description: 'Error rate < 1%' }])`.

The Basic Load Pattern provides a solid foundation for most performance testing scenarios, offering predictable load generation with flexible configuration options.
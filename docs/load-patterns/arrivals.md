# Arrival Rate Load Pattern

The Arrival Rate Load Pattern generates load based on request arrival rate (requests per second) rather than a fixed number of virtual users. This pattern more closely simulates real-world traffic patterns and is ideal for testing system throughput capabilities.

## Configuration

### Basic Arrival Rate

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "arrivals"
  rate: 50                    # 50 requests per second
  duration: "5m"
  max_virtual_users: 200      # Limit concurrent VUs
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Arrival Rate Test')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate: 50,                    // 50 requests per second
    duration: '5m',
    max_virtual_users: 200      // Limit concurrent VUs
  })
  .build();
```

<!-- tabs:end -->

This generates 50 requests per second for 5 minutes, with a maximum of 200 concurrent virtual users.

### Variable Arrival Rate

```yaml
load:
  pattern: "arrivals"
  rate_profile:
    - rate: 10
      duration: "2m"
    - rate: 50
      duration: "3m"
    - rate: 100
      duration: "5m"
    - rate: 25
      duration: "2m"
  max_virtual_users: 300
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rate` | number | Yes* | - | Constant arrival rate (RPS) |
| `rate_profile` | array | Yes* | - | Variable rate configuration |
| `duration` | string | No | ∞ | Total test duration |
| `max_virtual_users` | number | Yes | - | Maximum concurrent VUs |
| `preallocation` | number | No | 10 | Pre-allocated VUs for efficiency |
| `vu_timeout` | string | No | "60s" | Maximum time a VU can run |

*Either `rate` or `rate_profile` is required

## Rate Profiles

### Constant Rate

Maintain steady request rate:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "arrivals"
  rate: 100
  duration: "10m"
  max_virtual_users: 500
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Constant Rate Test')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate: 100,
    duration: '10m',
    max_virtual_users: 500
  })
  .build();
```

<!-- tabs:end -->

**Timeline:**
```
RPS
100 |████████████████████████████
 75 |████████████████████████████
 50 |████████████████████████████
 25 |████████████████████████████
  0 +────────────────────────────
    0   2m   4m   6m   8m   10m
```

### Stepped Rate Increase

Gradually increase arrival rate:

```yaml
load:
  pattern: "arrivals"
  rate_profile:
    - rate: 25
      duration: "2m"
    - rate: 50
      duration: "2m"
    - rate: 100
      duration: "3m"
    - rate: 200
      duration: "3m"
  max_virtual_users: 1000
```

**Timeline:**
```
RPS
200 |                    ████████
150 |                    ████████
100 |          ████████████████████
 50 |    ████████████████████████
 25 |████████████████████████████
  0 +────────────────────────────
    0   2m   4m   6m   8m   10m
```

### Realistic Traffic Pattern

Simulate daily traffic variations:

```yaml
load:
  pattern: "arrivals"
  rate_profile:
    # Morning ramp-up
    - rate: 10
      duration: "30m"
    - rate: 50
      duration: "1h"
    # Peak hours
    - rate: 200
      duration: "4h"
    - rate: 150
      duration: "2h"
    # Evening decline
    - rate: 75
      duration: "2h"
    - rate: 25
      duration: "30m"
  max_virtual_users: 800
```

### Spike Testing

Test system resilience to traffic spikes:

```yaml
load:
  pattern: "arrivals"
  rate_profile:
    - rate: 50      # Normal load
      duration: "2m"
    - rate: 500     # Sudden spike
      duration: "30s"
    - rate: 50      # Return to normal
      duration: "2m"
    - rate: 1000    # Extreme spike
      duration: "15s"
    - rate: 50      # Recovery
      duration: "3m"
  max_virtual_users: 2000
```

## Advanced Configuration

### Pre-allocation for Performance

Pre-allocate virtual users for immediate availability:

```yaml
load:
  pattern: "arrivals"
  rate: 200
  duration: "5m"
  max_virtual_users: 1000
  preallocation: 100        # Keep 100 VUs ready
  vu_pool_size: 200         # Total VU pool
```

### Dynamic Rate Adjustment

Adjust rate based on system performance:

```yaml
load:
  pattern: "arrivals"
  adaptive_rate: true
  initial_rate: 100
  max_rate: 500
  min_rate: 10
  duration: "15m"
  
  # Reduce rate if performance degrades
  rate_adjustment:
    increase_factor: 1.2
    decrease_factor: 0.8
    adjustment_interval: "30s"
    
  performance_thresholds:
    p95_response_time: 2000   # Reduce rate if P95 > 2s
    error_rate: 0.05          # Reduce rate if errors > 5%
```

### Rate Distribution

Control how requests are distributed:

```yaml
load:
  pattern: "arrivals"
  rate: 100
  duration: "10m"
  max_virtual_users: 400
  
  distribution:
    type: "poisson"           # poisson, uniform, normal
    # For normal distribution
    mean: 100
    std_dev: 20
    # For uniform distribution  
    jitter: 0.1               # ±10% variation
```

## Virtual User Management

### VU Lifecycle in Arrival Rate

```yaml
load:
  pattern: "arrivals"
  rate: 150
  duration: "8m"
  max_virtual_users: 600
  
  vu_options:
    max_iterations: 50        # Max requests per VU
    max_duration: "5m"        # Max VU lifetime
    idle_timeout: "30s"       # Kill idle VUs after 30s
    spawn_rate: 20            # Max VU spawns per second
```

### VU Pool Configuration

```yaml
global:
  vu_pool:
    warm_pool_size: 50        # Keep warm VUs ready
    max_pool_size: 1000       # Maximum total VUs
    cleanup_interval: "60s"   # Pool cleanup frequency
    
load:
  pattern: "arrivals"
  rate: 200
  duration: "10m"
  max_virtual_users: 800
  use_vu_pool: true
```

## Use Cases

### 1. Throughput Testing

Test maximum system throughput:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Throughput Test - Max RPS Capacity"

load:
  pattern: "arrivals"
  rate_profile:
    - rate: 50
      duration: "2m"
    - rate: 100
      duration: "2m"
    - rate: 200
      duration: "2m"
    - rate: 400
      duration: "2m"
    - rate: 800
      duration: "3m"
  max_virtual_users: 2000

scenarios:
  - name: "API Throughput"
    steps:
      - name: "Fast Endpoint"
        type: "rest"
        method: "GET"
        path: "/api/quick"

checks:
  - type: "response_time"
    percentile: 95
    value: "<5000"
  - type: "throughput"
    min_value: 400    # Expect at least 400 RPS
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Throughput Test - Max RPS Capacity')
  .baseUrl('https://api.example.com')
  .scenario('API Throughput')
    .get('/api/quick', { name: 'Fast Endpoint' })
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate_profile: [
      { rate: 50, duration: '2m' },
      { rate: 100, duration: '2m' },
      { rate: 200, duration: '2m' },
      { rate: 400, duration: '2m' },
      { rate: 800, duration: '3m' }
    ],
    max_virtual_users: 2000
  })
  .build();
```

<!-- tabs:end -->

### 2. Real-World Traffic Simulation

Simulate actual user traffic patterns:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Production Traffic Simulation"

load:
  pattern: "arrivals"
  rate_profile:
    # Business hours pattern
    - rate: 20      # Early morning
      duration: "1h"
    - rate: 100     # Morning rush
      duration: "2h"
    - rate: 150     # Peak business hours
      duration: "6h"
    - rate: 80      # Afternoon decline
      duration: "2h"
    - rate: 30      # Evening
      duration: "1h"
  max_virtual_users: 500

scenarios:
  - name: "User Browse"
    weight: 60
    steps:
      - name: "Home Page"
        type: "rest"
        method: "GET"
        path: "/"
      - name: "Browse Products"
        type: "rest"
        method: "GET"
        path: "/products?page={{random(1,20)}}"

  - name: "User Purchase"
    weight: 25
    steps:
      - name: "Add to Cart"
        type: "rest"
        method: "POST"
        path: "/cart/add"
      - name: "Checkout"
        type: "rest"
        method: "POST"
        path: "/checkout"

  - name: "Admin Tasks"
    weight: 15
    steps:
      - name: "Admin Dashboard"
        type: "rest"
        method: "GET"
        path: "/admin/dashboard"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Production Traffic Simulation')
  .baseUrl('https://api.example.com')
  .scenario('User Browse', { weight: 60 })
    .get('/', { name: 'Home Page' })
    .get('/products?page={{random(1,20)}}', { name: 'Browse Products' })
  .done()
  .scenario('User Purchase', { weight: 25 })
    .post('/cart/add', { name: 'Add to Cart' })
    .post('/checkout', { name: 'Checkout' })
  .done()
  .scenario('Admin Tasks', { weight: 15 })
    .get('/admin/dashboard', { name: 'Admin Dashboard' })
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate_profile: [
      { rate: 20, duration: '1h' },      // Early morning
      { rate: 100, duration: '2h' },     // Morning rush
      { rate: 150, duration: '6h' },     // Peak business hours
      { rate: 80, duration: '2h' },      // Afternoon decline
      { rate: 30, duration: '1h' }       // Evening
    ],
    max_virtual_users: 500
  })
  .build();
```

<!-- tabs:end -->

### 3. Auto-Scaling Validation

Test system auto-scaling behavior:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Auto-Scaling Test"

load:
  pattern: "arrivals"
  rate_profile:
    - rate: 50      # Baseline
      duration: "5m"
    - rate: 200     # Trigger scaling
      duration: "3m"
    - rate: 500     # Heavy load
      duration: "10m"
    - rate: 100     # Scale down
      duration: "5m"
  max_virtual_users: 1500

# Monitor scaling events
outputs:
  - type: "webhook"
    url: "http://monitor.example.com/scaling"
    interval: "30s"
    data:
      current_rate: "{{current_arrival_rate}}"
      active_vus: "{{active_virtual_users}}"
      avg_response_time: "{{avg_response_time}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Auto-Scaling Test')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate_profile: [
      { rate: 50, duration: '5m' },      // Baseline
      { rate: 200, duration: '3m' },     // Trigger scaling
      { rate: 500, duration: '10m' },    // Heavy load
      { rate: 100, duration: '5m' }      // Scale down
    ],
    max_virtual_users: 1500
  })
  .build();
```

<!-- tabs:end -->

### 4. SLA Validation

Validate service level agreements under various loads:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "SLA Validation Test"

load:
  pattern: "arrivals"
  rate_profile:
    - rate: 100     # Normal SLA load
      duration: "10m"
    - rate: 250     # Peak SLA load
      duration: "5m"
  max_virtual_users: 800

scenarios:
  - name: "Critical API"
    sla_requirements:
      p95_response_time: 1000   # 95% < 1s
      p99_response_time: 2000   # 99% < 2s
      availability: 99.9        # 99.9% uptime
      throughput: 200           # Min 200 RPS
    steps:
      - name: "SLA Critical Endpoint"
        type: "rest"
        method: "GET"
        path: "/api/critical"

checks:
  - type: "sla_compliance"
    requirements: "{{sla_requirements}}"
    fail_test_on_violation: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('SLA Validation Test')
  .baseUrl('https://api.example.com')
  .scenario('Critical API')
    .get('/api/critical', { name: 'SLA Critical Endpoint' })
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate_profile: [
      { rate: 100, duration: '10m' },    // Normal SLA load
      { rate: 250, duration: '5m' }      // Peak SLA load
    ],
    max_virtual_users: 800
  })
  .build();
```

<!-- tabs:end -->

## Monitoring and Analysis

### Real-time Rate Monitoring

```yaml
extract:
  - name: "current_rate"
    type: "custom"
    script: |
      // Calculate current arrival rate
      const windowSize = 10000; // 10 second window
      const now = Date.now();
      const requests = context.global.requests || [];
      
      // Filter requests in current window
      const recentRequests = requests.filter(r => 
        now - r.timestamp < windowSize
      );
      
      return (recentRequests.length / windowSize) * 1000;
      
  - name: "vu_utilization"
    type: "custom"
    script: |
      return {
        active_vus: context.global.activeVUs,
        max_vus: context.config.max_virtual_users,
        utilization: context.global.activeVUs / context.config.max_virtual_users
      };
```

### Performance vs Rate Analysis

```yaml
outputs:
  - type: "csv"
    file: "results/rate-performance-{{timestamp}}.csv"
    fields:
      - "timestamp"
      - "target_rate"
      - "actual_rate" 
      - "active_vus"
      - "avg_response_time"
      - "p95_response_time"
      - "error_rate"
      - "throughput"
    real_time: true
    batch_size: 100
```

## Performance Optimization

### Efficient VU Management

```yaml
load:
  pattern: "arrivals"
  rate: 300
  max_virtual_users: 1000
  
  # Optimize VU usage
  vu_efficiency:
    reuse_vus: true
    max_vu_reuse: 100         # Reuse VU for 100 requests
    vu_spawn_limit: 50        # Max 50 VU spawns/second  
    vu_cleanup_threshold: 200 # Cleanup when 200+ idle VUs
```

### Connection Pooling

```yaml
global:
  connection_pool:
    max_connections_per_host: 100
    keep_alive_timeout: 60000
    connection_timeout: 5000
    
load:
  pattern: "arrivals"
  rate: 500
  max_virtual_users: 1200
  # High rate requires efficient connections
```

## Best Practices

### 1. Set Appropriate Max VUs

```yaml
# Rule of thumb: Max VUs = Target RPS × Average Response Time (seconds) × 1.5

# For 200 RPS with 2s avg response time:
load:
  pattern: "arrivals"
  rate: 200
  max_virtual_users: 600  # 200 × 2 × 1.5
```

### 2. Monitor VU Utilization

```yaml
# Alert if VU utilization is too high
checks:
  - type: "vu_utilization"
    max_utilization: 0.8    # < 80% utilization
    description: "VU pool not overloaded"
```

### 3. Use Realistic Rate Profiles

```yaml
# Base on production traffic analysis
load:
  pattern: "arrivals"
  rate_profile:
    # Copy from production monitoring
    - rate: 45      # 3AM traffic
      duration: "1h"
    - rate: 150     # 9AM traffic  
      duration: "1h"
    - rate: 200     # 12PM traffic
      duration: "1h"
```

### 4. Handle Rate Limiting

```yaml
scenarios:
  - name: "Rate Limited API"
    steps:
      - name: "API Call"
        type: "rest"
        method: "GET"
        path: "/api/limited"
        retry:
          count: 3
          delay: "1s"
          on_status: [429]  # Rate limited
```

### 5. Plan for System Limits

```yaml
load:
  pattern: "arrivals"
  rate: 1000
  max_virtual_users: 3000
  
  # Graceful degradation
  fallback_strategy:
    - condition: "active_vus > max_virtual_users * 0.9"
      action: "reduce_rate"
      factor: 0.8
    - condition: "p95_response_time > 5000"
      action: "reduce_rate"
      factor: 0.7
```

The Arrival Rate Load Pattern provides more realistic load generation by focusing on request rate rather than user count, making it ideal for throughput testing and production traffic simulation.
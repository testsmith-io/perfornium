# Stepping Load Pattern

The Stepping Load Pattern gradually increases the number of virtual users in discrete steps, allowing you to observe how your system behaves as load incrementally increases. This pattern is ideal for finding breaking points and understanding system behavior under progressively increasing load.

## Configuration

### Basic Stepping Load

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "stepping"
  start_users: 5
  step_users: 5
  step_duration: "2m"
  max_users: 50
  duration: "20m"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Stepping Load Test')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 5,
    step_users: 5,
    step_duration: '2m',
    max_users: 50,
    duration: '20m'
  })
  .build();
```

<!-- tabs:end -->

This starts with 5 users, adds 5 more users every 2 minutes, up to a maximum of 50 users, running for a total of 20 minutes.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_users` | number | No | 1 | Initial number of virtual users |
| `step_users` | number | Yes | - | Number of VUs to add per step |
| `step_duration` | string | Yes | - | Duration of each step |
| `max_users` | number | Yes | - | Maximum number of virtual users |
| `duration` | string | No | Auto | Total test duration (auto-calculated if not specified) |
| `ramp_step` | string | No | "0s" | Time to ramp up VUs within each step |
| `hold_final` | string | No | "0s" | Time to hold final load after reaching max_users |

## Step Progression

### Linear Stepping

The most common pattern with equal increments:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "stepping"
  start_users: 10
  step_users: 10      # +10 users each step
  step_duration: "3m"
  max_users: 100
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Linear Stepping Test')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 10,
    step_users: 10,      // +10 users each step
    step_duration: '3m',
    max_users: 100
  })
  .build();
```

<!-- tabs:end -->

**Timeline:**
```
VUs
100 |              ████████████
 90 |            ██████████████
 80 |          ████████████████
 70 |        ██████████████████
 60 |      ████████████████████
 50 |    ██████████████████████
 40 |  ████████████████████████
 30 |██████████████████████████
 20 |██████████████████████████
 10 |██████████████████████████
  0 +──────────────────────────
    0   3m  6m  9m 12m 15m 18m 21m 24m 27m
```

### Variable Step Sizes

You can use different step sizes for more complex patterns:

```yaml
load:
  pattern: "stepping"
  steps:
    - users: 5
      duration: "2m"
    - users: 15      # +10 users
      duration: "3m"
    - users: 35      # +20 users  
      duration: "3m"
    - users: 75      # +40 users
      duration: "5m"
    - users: 100     # +25 users
      duration: "5m"
```

## Advanced Configuration

### Stepping with Ramp-Up

Add gradual ramp-up within each step:

```yaml
load:
  pattern: "stepping"
  start_users: 10
  step_users: 20
  step_duration: "5m"
  max_users: 100
  ramp_step: "30s"    # 30s to add new VUs within each step
```

**Timeline:**
```
VUs
100 |                    ╱████████████
 80 |              ╱████████████████
 60 |        ╱████████████████████
 40 |  ╱████████████████████████
 20 |██████████████████████████
  0 +──────────────────────────
    0    5m   10m  15m   20m  25m
    └─ 30s ramp per step
```

### Hold Final Load

Maintain maximum load for extended observation:

```yaml
load:
  pattern: "stepping"
  start_users: 5
  step_users: 15
  step_duration: "2m"
  max_users: 80
  hold_final: "10m"    # Hold at 80 VUs for 10 minutes
```

### Custom Step Configuration

Define precise step behavior:

```yaml
load:
  pattern: "stepping"
  step_config:
    initial_step:
      users: 10
      duration: "1m"
    steps:
      - increment: 5
        duration: "2m"
        ramp_time: "15s"
      - increment: 10
        duration: "3m"
        ramp_time: "30s"
      - increment: 25
        duration: "5m"
        ramp_time: "1m"
    final_step:
      hold_duration: "15m"
      ramp_down: "2m"
```

## Use Cases

### 1. Capacity Planning

Find the maximum number of users your system can handle:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Capacity Test - Find Breaking Point"

load:
  pattern: "stepping"
  start_users: 50
  step_users: 50
  step_duration: "5m"
  max_users: 500
  hold_final: "5m"

scenarios:
  - name: "Standard User Load"
    steps:
      - name: "Home Page"
        type: "rest"
        method: "GET"
        path: "/"
      - name: "Product Browse"
        type: "rest"
        method: "GET"
        path: "/products"

checks:
  - type: "response_time"
    value: "<3000"
    fail_test: true
  - type: "error_rate"
    value: "<5%"
    fail_test: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Capacity Test - Find Breaking Point')
  .baseUrl('https://api.example.com')
  .scenario('Standard User Load')
    .get('/', { name: 'Home Page' })
    .get('/products', { name: 'Product Browse' })
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 50,
    step_users: 50,
    step_duration: '5m',
    max_users: 500,
    hold_final: '5m'
  })
  .build();
```

<!-- tabs:end -->

### 2. Performance Profiling

Understand how performance metrics change with load:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Performance Profile - Response Time Analysis"

load:
  pattern: "stepping"
  start_users: 10
  step_users: 10
  step_duration: "3m"
  max_users: 200

scenarios:
  - name: "API Performance Profile"
    steps:
      - name: "Database Query"
        type: "rest"
        method: "POST"
        path: "/api/search"
        body: '{"query": "performance test"}'
      - name: "Cache Lookup"
        type: "rest"
        method: "GET"
        path: "/api/cache/{{item_id}}"

outputs:
  - type: "json"
    file: "results/stepping-profile-{{timestamp}}.json"
    include_percentiles: [50, 90, 95, 99]
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Performance Profile - Response Time Analysis')
  .baseUrl('https://api.example.com')
  .scenario('API Performance Profile')
    .post('/api/search', {
      name: 'Database Query',
      body: { query: 'performance test' }
    })
    .get('/api/cache/{{item_id}}', { name: 'Cache Lookup' })
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 10,
    step_users: 10,
    step_duration: '3m',
    max_users: 200
  })
  .build();
```

<!-- tabs:end -->

### 3. Bottleneck Identification

Identify which system components fail first:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Bottleneck Analysis - Component Stress"

load:
  pattern: "stepping"
  start_users: 20
  step_users: 20
  step_duration: "2m"
  max_users: 300

scenarios:
  - name: "Database Heavy"
    weight: 3
    steps:
      - name: "Complex Query"
        type: "rest"
        method: "POST"
        path: "/api/complex-query"

  - name: "CPU Heavy"
    weight: 2
    steps:
      - name: "Compute Operation"
        type: "rest"
        method: "POST"
        path: "/api/compute"

  - name: "Memory Heavy"
    weight: 1
    steps:
      - name: "Large Data Processing"
        type: "rest"
        method: "POST"
        path: "/api/process-large-data"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Bottleneck Analysis - Component Stress')
  .baseUrl('https://api.example.com')
  .scenario('Database Heavy', { weight: 3 })
    .post('/api/complex-query', { name: 'Complex Query' })
  .done()
  .scenario('CPU Heavy', { weight: 2 })
    .post('/api/compute', { name: 'Compute Operation' })
  .done()
  .scenario('Memory Heavy', { weight: 1 })
    .post('/api/process-large-data', { name: 'Large Data Processing' })
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 20,
    step_users: 20,
    step_duration: '2m',
    max_users: 300
  })
  .build();
```

<!-- tabs:end -->

### 4. Scalability Testing

Test how your system scales with auto-scaling:

<!-- tabs:start -->

#### **YAML**
```yaml
name: "Auto-Scaling Test"

load:
  pattern: "stepping"
  start_users: 25
  step_users: 25
  step_duration: "4m"    # Allow time for scaling
  max_users: 400
  hold_final: "10m"

# Monitor auto-scaling metrics
outputs:
  - type: "webhook"
    url: "http://monitoring.example.com/scaling-webhook"
    interval: "30s"
    data:
      test_phase: "{{current_step}}"
      current_users: "{{active_vus}}"
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
    pattern: 'stepping',
    start_users: 25,
    step_users: 25,
    step_duration: '4m',    // Allow time for scaling
    max_users: 400,
    hold_final: '10m'
  })
  .build();
```

<!-- tabs:end -->

## Monitoring Step Progression

### Step-Aware Metrics

Track performance changes across steps:

```yaml
extract:
  - name: "current_step"
    type: "custom"
    script: |
      const stepDuration = 3 * 60 * 1000; // 3 minutes in ms
      const elapsed = Date.now() - context.testStartTime;
      return Math.floor(elapsed / stepDuration) + 1;
      
  - name: "step_performance"
    type: "custom"
    script: |
      return {
        step: context.variables.current_step,
        responseTime: result.duration,
        timestamp: Date.now()
      };
```

### Step Transition Detection

Detect when stepping to the next level:

```yaml
scenarios:
  - name: "Step Monitoring"
    hooks:
      beforeStep: |
        const now = Date.now();
        const stepSize = 3 * 60 * 1000; // 3m steps
        const currentStep = Math.floor((now - context.testStartTime) / stepSize);
        
        if (currentStep !== context.variables.lastStep) {
          console.log(`Stepped up to level ${currentStep + 1}`);
          context.variables.lastStep = currentStep;
        }
    steps:
      - name: "Monitor Performance"
        type: "rest"
        method: "GET"
        path: "/api/health"
```

## Performance Analysis

### Step-by-Step Analysis

Analyze performance degradation patterns:

```yaml
report:
  generate: true
  output: "reports/stepping-analysis-{{timestamp}}.html"
  sections:
    - step_progression:
        title: "Load Step Progression"
        metrics: ["response_time", "throughput", "error_rate"]
        group_by_step: true
    - breaking_point:
        title: "System Breaking Point Analysis"
        thresholds:
          response_time: 5000
          error_rate: 0.1
    - resource_utilization:
        title: "Resource Usage by Step"
        include_system_metrics: true
```

### Comparative Step Analysis

```yaml
outputs:
  - type: "csv"
    file: "results/step-comparison-{{timestamp}}.csv"
    fields:
      - "step_number"
      - "active_vus"
      - "avg_response_time"
      - "p95_response_time"
      - "throughput_rps"
      - "error_rate"
      - "timestamp"
```

## Optimization Strategies

### Dynamic Step Adjustment

Adjust stepping based on performance:

```yaml
load:
  pattern: "stepping"
  adaptive: true
  start_users: 10
  step_users: 10
  step_duration: "2m"
  max_users: 500
  
  # Stop if performance degrades
  stop_conditions:
    - metric: "p95_response_time"
      threshold: 5000
      consecutive_violations: 2
    - metric: "error_rate"
      threshold: 0.05
      consecutive_violations: 1
```

### Variable Step Timing

Adjust step duration based on system behavior:

```yaml
load:
  pattern: "stepping"
  dynamic_timing: true
  steps:
    - users: 25
      min_duration: "1m"
      max_duration: "5m"
      stability_criteria:
        response_time_cv: 0.1  # Coefficient of variation < 10%
        error_rate: 0.01       # Error rate < 1%
    - users: 50
      min_duration: "2m"
      max_duration: "10m"
      stability_criteria:
        response_time_cv: 0.15
        error_rate: 0.02
```

## Best Practices

### 1. Choose Appropriate Step Sizes

```yaml
# Small steps for precision
load:
  pattern: "stepping"
  start_users: 5
  step_users: 5      # Small increments for precise breaking point
  step_duration: "3m"
  max_users: 100

# Large steps for broad testing  
load:
  pattern: "stepping"
  start_users: 50
  step_users: 50     # Large increments for quick capacity assessment
  step_duration: "2m"
  max_users: 1000
```

### 2. Allow Sufficient Step Duration

```yaml
# Too short - system doesn't stabilize
step_duration: "30s"  # Not enough time to observe behavior

# Good - allows stabilization
step_duration: "2-5m"  # Time for system to adjust and stabilize
```

### 3. Monitor Key Metrics

```yaml
# Essential stepping metrics
checks:
  - type: "response_time"
    percentile: 95
    threshold: 3000
  - type: "throughput"
    min_threshold: 100  # RPS
  - type: "error_rate"
    max_threshold: 0.02 # 2%
  - type: "resource_utilization"
    cpu_threshold: 0.8  # 80%
    memory_threshold: 0.85 # 85%
```

### 4. Plan for System Recovery

```yaml
load:
  pattern: "stepping"
  start_users: 10
  step_users: 20
  step_duration: "3m"
  max_users: 200
  
  # Allow recovery between major steps
  recovery_steps:
    - at_users: 100
      pause_duration: "2m"
      reduce_to: 50
    - at_users: 200
      pause_duration: "5m" 
      reduce_to: 100
```

### 5. Define Clear Exit Criteria

```yaml
load:
  pattern: "stepping"
  exit_criteria:
    - condition: "p95_response_time > 10000"
      message: "Response time degraded beyond acceptable limits"
    - condition: "error_rate > 0.1"
      message: "Error rate exceeded 10%"
    - condition: "system_cpu > 0.95"
      message: "System CPU usage critical"
```

The Stepping Load Pattern is powerful for understanding system behavior under increasing load, making it essential for capacity planning and performance optimization.
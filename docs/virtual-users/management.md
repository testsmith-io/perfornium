# Virtual User Management

Virtual Users (VUs) are the foundation of Perfornium's performance testing. Each VU simulates a real user executing test scenarios concurrently, allowing you to generate realistic load patterns on your system.

## Understanding Virtual Users

### What is a Virtual User?

A Virtual User is an independent execution thread that:
- Runs test scenarios concurrently with other VUs
- Maintains its own context and variables
- Can be started, stopped, and managed independently
- Simulates realistic user behavior with think time and data

### VU Lifecycle

```yaml
# Basic VU lifecycle
1. Creation    -> VU is spawned and initialized
2. Execution   -> VU runs scenario steps repeatedly
3. Think Time  -> VU pauses between requests (optional)
4. Completion  -> VU finishes and releases resources
```

## VU Configuration

### Basic VU Settings

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 50          # Number of VUs to create
  ramp_up: "30s"            # Time to create all VUs
  duration: "5m"            # How long VUs run
  ramp_down: "10s"          # Time to gracefully stop VUs

# Global VU options
vu_options:
  max_iterations: 100       # Max scenario iterations per VU
  max_duration: "10m"       # Max time a VU can run
  restart_on_error: false   # Restart VU if it fails
  graceful_shutdown: "10s"  # Time to finish current iteration
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Basic VU Settings')
  .withLoad({
    pattern: 'basic',
    virtual_users: 50,
    ramp_up: '30s',
    duration: '5m',
    ramp_down: '10s',
    vu_options: {
      max_iterations: 100,
      max_duration: '10m',
      restart_on_error: false,
      graceful_shutdown: '10s'
    }
  })
  .build();
```

<!-- tabs:end -->

### Advanced VU Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 100
  duration: "10m"

  # VU pool management
  vu_pool:
    warm_pool_size: 20      # Keep 20 VUs ready
    max_pool_size: 200      # Maximum total VUs
    cleanup_interval: "60s"  # Pool cleanup frequency
    reuse_vus: true         # Reuse VUs for efficiency

  # VU behavior
  vu_behavior:
    think_time: "1-3s"      # Think time between requests
    timeout: "30s"          # Default request timeout
    retry_count: 2          # Retry failed requests
    continue_on_error: true # Continue on non-fatal errors

  # Resource limits per VU
  resource_limits:
    max_memory: "100MB"     # Memory limit per VU
    max_connections: 10     # Connection limit per VU
    max_cookies: 50         # Cookie jar limit
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Advanced VU Configuration')
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    duration: '10m',
    vu_pool: {
      warm_pool_size: 20,
      max_pool_size: 200,
      cleanup_interval: '60s',
      reuse_vus: true
    },
    vu_behavior: {
      think_time: '1-3s',
      timeout: '30s',
      retry_count: 2,
      continue_on_error: true
    },
    resource_limits: {
      max_memory: '100MB',
      max_connections: 10,
      max_cookies: 50
    }
  })
  .build();
```

<!-- tabs:end -->

## VU Spawning Strategies

### Immediate Spawning

All VUs start immediately:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 50
  # No ramp_up = immediate start
  duration: "5m"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Immediate Spawning')
  .withLoad({
    pattern: 'basic',
    virtual_users: 50,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Gradual Ramp-Up

VUs are created gradually over time:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 100
  ramp_up: "2m"             # Create 100 VUs over 2 minutes
  duration: "10m"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Gradual Ramp-Up')
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    ramp_up: '2m',
    duration: '10m'
  })
  .build();
```

<!-- tabs:end -->

### Pre-allocation

Pre-create VUs for immediate availability:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 200
  ramp_up: "1m"
  preallocate_vus: 50       # Keep 50 VUs ready before test
  duration: "15m"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Pre-allocation')
  .withLoad({
    pattern: 'basic',
    virtual_users: 200,
    ramp_up: '1m',
    preallocate_vus: 50,
    duration: '15m'
  })
  .build();
```

<!-- tabs:end -->

## VU Execution Models

### Scenario-per-VU Model

Each VU runs one scenario repeatedly:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "User Journey"
    weight: 1               # All VUs run this scenario
    loop: 0                 # Infinite loop (until duration)
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
      - name: "Browse"
        type: "rest"
        method: "GET"
        path: "/products"
      - name: "Logout"
        type: "rest"
        method: "POST"
        path: "/logout"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('User Journey')
  .baseUrl('https://api.example.com')
  .scenario('User Journey', {
    weight: 1,
    loop: 0
  })
    .post('/login')
    .get('/products')
    .post('/logout')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Weighted Scenario Selection

VUs randomly select scenarios based on weights:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Heavy User"
    weight: 3               # 60% of VUs (3/5)
    steps:
      - name: "Multiple API Calls"
        type: "rest"
        method: "GET"
        path: "/heavy-endpoint"

  - name: "Light User"
    weight: 2               # 40% of VUs (2/5)
    steps:
      - name: "Simple API Call"
        type: "rest"
        method: "GET"
        path: "/light-endpoint"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Weighted Scenarios')
  .baseUrl('https://api.example.com')
  .scenario('Heavy User', { weight: 3 })
    .get('/heavy-endpoint')
  .done()
  .scenario('Light User', { weight: 2 })
    .get('/light-endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Sequential Scenario Execution

VUs execute multiple scenarios in sequence:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Setup"
    sequence: 1             # Run first
    steps:
      - name: "Initialize"
        type: "rest"
        method: "POST"
        path: "/setup"

  - name: "Main Test"
    sequence: 2             # Run second
    loop: 10                # Repeat 10 times
    steps:
      - name: "Test Action"
        type: "rest"
        method: "GET"
        path: "/test"

  - name: "Cleanup"
    sequence: 3             # Run last
    steps:
      - name: "Cleanup"
        type: "rest"
        method: "DELETE"
        path: "/cleanup"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Sequential Scenarios')
  .baseUrl('https://api.example.com')
  .scenario('Setup', { sequence: 1 })
    .post('/setup')
  .done()
  .scenario('Main Test', { sequence: 2, loop: 10 })
    .get('/test')
  .done()
  .scenario('Cleanup', { sequence: 3 })
    .delete('/cleanup')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## VU State Management

### VU Context

Each VU maintains its own context:

```yaml
scenarios:
  - name: "Stateful User"
    hooks:
      beforeScenario: |
        // Initialize VU state
        context.variables.userId = faker.string.uuid();
        context.variables.sessionId = null;
        context.variables.requestCount = 0;
        
      beforeStep: |
        // Update state before each step
        context.variables.requestCount++;
        
      afterStep: |
        // Process state after each step
        if (context.variables.sessionId) {
          console.log(`VU ${context.vu_id}: Request ${context.variables.requestCount}`);
        }
```

### Cross-VU Communication

Share data between VUs using global context:

```yaml
scenarios:
  - name: "Coordinator VU"
    weight: 1               # Only 1 VU runs this
    steps:
      - name: "Setup Global Data"
        type: "custom"
        script: |
          // Share data across all VUs
          context.global.sharedData = {
            testStartTime: Date.now(),
            globalCounter: 0,
            sharedTokens: []
          };
          
  - name: "Worker VU"
    weight: 9               # 9 VUs run this
    steps:
      - name: "Use Global Data"
        type: "custom"
        script: |
          // Access shared data
          if (context.global.sharedData) {
            context.global.sharedData.globalCounter++;
            const token = context.global.sharedData.sharedTokens.pop();
            if (token) {
              context.variables.authToken = token;
            }
          }
```

## VU Performance Optimization

### Connection Pooling

Reuse connections across VU requests:

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  connection_pool:
    max_connections: 100
    max_connections_per_host: 10
    keep_alive_timeout: 30000
    connection_timeout: 5000

load:
  virtual_users: 50
  # Each VU will reuse connections from the pool
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Connection Pooling')
  .global({
    connection_pool: {
      max_connections: 100,
      max_connections_per_host: 10,
      keep_alive_timeout: 30000,
      connection_timeout: 5000
    }
  })
  .withLoad({
    pattern: 'basic',
    virtual_users: 50,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Memory Management

Optimize memory usage for high VU counts:

```yaml
load:
  virtual_users: 1000
  
  # Memory optimization
  memory_optimization:
    garbage_collection: "aggressive"  # Frequent GC
    max_heap_per_vu: "50MB"          # Limit VU memory
    response_body_limit: "1MB"        # Limit response size
    request_history_limit: 100        # Limit request history
```

### CPU Optimization

Distribute VU load across CPU cores:

```yaml
load:
  virtual_users: 200
  
  # CPU optimization
  cpu_optimization:
    worker_threads: 4               # Use 4 worker threads
    vus_per_thread: 50             # 50 VUs per thread
    thread_affinity: true          # Pin threads to cores
```

## VU Monitoring

### Real-time VU Metrics

Monitor VU performance in real-time:

```yaml
outputs:
  - type: "json"
    file: "results/vu-metrics-{{timestamp}}.json"
    include_vu_metrics: true
    vu_metrics:
      - "vu_id"
      - "scenario_name"
      - "iteration_count"
      - "total_requests"
      - "successful_requests"
      - "failed_requests"
      - "avg_response_time"
      - "memory_usage"
      - "cpu_usage"
    real_time: true
    batch_size: 50
```

### VU Health Checks

Monitor VU health and restart unhealthy VUs:

```yaml
load:
  virtual_users: 100
  
  # Health monitoring
  health_checks:
    enabled: true
    check_interval: "30s"
    max_response_time: "10s"        # Consider VU unhealthy if slow
    max_error_rate: 0.1             # 10% error rate threshold
    restart_unhealthy: true         # Restart unhealthy VUs
    max_restarts: 3                 # Maximum restarts per VU
```

## VU Debugging

### VU Logging

Enable detailed VU logging:

```yaml
global:
  debug:
    log_level: "debug"
    vu_logging: true
    log_vu_lifecycle: true
    log_vu_context: true

scenarios:
  - name: "Debug Scenario"
    steps:
      - name: "Debug Step"
        type: "custom"
        script: |
          console.log(`VU ${context.vu_id}: Starting step at ${new Date().toISOString()}`);
          console.log(`Context:`, JSON.stringify(context.variables, null, 2));
```

### VU Profiling

Profile VU performance:

```yaml
load:
  virtual_users: 10
  
  # Profiling
  profiling:
    enabled: true
    profile_interval: "10s"
    metrics:
      - "memory_usage"
      - "cpu_usage"
      - "gc_duration"
      - "request_rate"
    output_file: "vu-profile-{{timestamp}}.json"
```

## VU Error Handling

### Error Recovery

Configure how VUs handle errors:

```yaml
scenarios:
  - name: "Resilient Scenario"
    error_handling:
      continue_on_error: true
      max_errors: 5               # Stop VU after 5 errors
      retry_count: 2              # Retry failed requests
      retry_delay: "1s"           # Delay between retries
      restart_on_fatal_error: true # Restart VU on fatal errors
    steps:
      - name: "Risky Operation"
        type: "rest"
        method: "POST"
        path: "/risky-endpoint"
        on_error:
          log_error: true
          extract_error_details: true
```

### Graceful Shutdown

Handle VU shutdown gracefully:

```yaml
load:
  virtual_users: 100
  duration: "10m"
  
  # Graceful shutdown
  shutdown:
    grace_period: "30s"           # Time for VUs to finish
    force_stop_timeout: "10s"     # Force stop after timeout
    save_incomplete_data: true    # Save data from incomplete VUs
```

## Best Practices

### 1. Right-size VU Count

```yaml
# Start small and scale up
load:
  virtual_users: 10
  duration: "2m"
  
# Monitor system resources and increase gradually
# Rule of thumb: 1 VU per 10-50 RPS depending on response time
```

### 2. Use Appropriate Think Time

```yaml
# Simulate realistic user behavior
scenarios:
  - name: "Realistic User"
    think_time: "2-8s"          # Human-like pauses
    steps:
      - name: "Browse"
        type: "rest"
        method: "GET"
        path: "/products"
```

### 3. Monitor VU Resource Usage

```yaml
# Include VU metrics in outputs
outputs:
  - type: "csv"
    file: "results/vu-monitoring.csv"
    fields:
      - "vu_id"
      - "memory_usage"
      - "request_count"
      - "error_count"
    real_time: true
```

### 4. Plan for Scalability

```yaml
# Use VU pools for large tests
load:
  virtual_users: 1000
  vu_pool:
    warm_pool_size: 100
    reuse_vus: true
    cleanup_interval: "60s"
```

### 5. Handle VU Failures

```yaml
# Always plan for VU failures
scenarios:
  - name: "Production-like Test"
    error_handling:
      continue_on_error: true
      max_errors: 10
      restart_on_fatal_error: true
```

Virtual User management is critical for effective performance testing. Proper VU configuration ensures your tests accurately simulate real user behavior while efficiently using system resources.
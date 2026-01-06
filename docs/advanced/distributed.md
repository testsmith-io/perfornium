# Distributed Testing

Distributed testing in Perfornium enables you to generate massive load from multiple machines, test geographically distributed systems, and overcome single-machine limitations. This capability is essential for testing at enterprise scale.

## Overview

Distributed testing provides:
- Scale beyond single machine limits
- Geographic load distribution
- Cloud and on-premise deployment
- Centralized coordination and results
- Fault tolerance and redundancy

---

## CLI Quick Start

### 1. Start Worker Nodes

Start workers on each machine (or multiple ports on localhost for testing):

```bash
# Terminal 1
perfornium worker --port 8081

# Terminal 2
perfornium worker --port 8082

# Terminal 3
perfornium worker --port 8083
```

### 2. Run Distributed Test

```bash
perfornium distributed your-test.yaml \
  -w "localhost:8081,localhost:8082,localhost:8083" \
  -s even \
  --sync-start \
  --report
```

### Workers File Format

Create a `workers.json` file:

```json
[
  { "host": "localhost", "port": 8081 },
  { "host": "localhost", "port": 8082 },
  { "host": "localhost", "port": 8083 }
]
```

**Full format with all options:**
```json
[
  { "host": "worker1.example.com", "port": 8080, "capacity": 100, "region": "us-east" },
  { "host": "worker2.example.com", "port": 8080, "capacity": 150, "region": "us-west" },
  { "host": "worker3.example.com", "port": 8080, "capacity": 50,  "region": "eu-west" }
]
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `host` | Yes | - | Worker hostname or IP |
| `port` | Yes | `8080` | Worker port |
| `capacity` | No | `100` | Relative capacity for load distribution |
| `region` | No | `'default'` | Geographic region (for `geographic` strategy) |

Then run:
```bash
perfornium distributed test.yaml --workers-file workers.json -s even --sync-start --report
```

### Distribution Strategies (`-s`)

| Strategy | Description |
|----------|-------------|
| `even` | Distributes VUs equally across all workers (recommended for equal workers) |
| `capacity_based` | Distributes VUs proportionally based on worker `capacity` values (default) |
| `round_robin` | Assigns VUs one at a time to each worker in rotation |
| `geographic` | Groups workers by `region`, distributes evenly across regions |

**Example:** 30 VUs across 3 workers with `-s even` = 10 VUs per worker

### Synchronized Start (`--sync-start`)

Controls how workers begin the test:

| Mode | Behavior |
|------|----------|
| **With `--sync-start`** | All workers prepare first, then start simultaneously |
| **Without** | Workers start sequentially as they receive the config |

**How synchronized start works:**
1. Controller sends test config to all workers
2. Workers prepare (load config, initialize browsers, etc.)
3. Controller waits for ALL workers to be ready
4. Controller sends a future start time (`now + 5 seconds`)
5. All workers begin at exactly the same moment

**When to use `--sync-start`:**
- Load testing where simultaneous load matters
- Comparing performance across workers
- Testing system behavior under sudden load spikes

**When it's optional:**
- Casual testing or development
- When staggered worker start is acceptable

### Network Requirements (Physical/Remote Machines)

When running workers on separate physical machines or VMs, ensure proper network connectivity:

**Firewall Rules:**

| Machine | Port | Protocol | Direction | Purpose |
|---------|------|----------|-----------|---------|
| Worker | 8080 (or custom) | TCP/HTTP | Inbound from controller | API communication |

**Required connectivity:**
- Controller must be able to reach all workers on their configured ports
- Workers do NOT need to reach back to the controller (pull-based architecture)
- All communication (config, commands, results) goes over the single worker port
- No additional ports needed for reporting - controller pulls results via `GET /results`

**Example firewall setup (Linux/iptables):**
```bash
# On each worker machine, allow inbound on worker port
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

# Or with ufw
sudo ufw allow 8080/tcp
```

**Example firewall setup (Windows):**
```powershell
# Allow inbound on worker port
New-NetFirewallRule -DisplayName "Perfornium Worker" -Direction Inbound -Port 8080 -Protocol TCP -Action Allow
```

**Cloud security groups (AWS/GCP/Azure):**
- Create inbound rule allowing TCP port 8080 (or custom) from controller IP/subnet

**Bind to all interfaces for remote access:**
```bash
# On worker machine - bind to 0.0.0.0 to accept remote connections
perfornium worker --host 0.0.0.0 --port 8080
```

> **Note:** Using `--host localhost` (default) only accepts local connections. Use `--host 0.0.0.0` for remote access.

### Common Issues

**Only 1 VU running instead of expected count?**
- Use `-s even` strategy, or add `capacity` to your workers.json

**Workers not synchronized?**
- Add `--sync-start` flag

**Connection refused to remote worker?**
- Ensure worker is bound to `0.0.0.0`: `perfornium worker --host 0.0.0.0 --port 8080`
- Check firewall allows inbound TCP on the worker port
- Verify network connectivity: `curl http://worker-ip:8080/health`

---

## Architecture

### Master-Worker Model

```
                    ┌─────────────────────────────────────────┐
                    │              MASTER NODE                │
                    │  ┌─────────────┐  ┌─────────────────┐   │
                    │  │ Test        │  │ Load            │   │
                    │  │ Coordinator │  │ Orchestrator    │   │
                    │  └─────────────┘  └─────────────────┘   │
                    │  ┌─────────────┐  ┌─────────────────┐   │
                    │  │ Results     │  │ Health          │   │
                    │  │ Aggregator  │  │ Monitor         │   │
                    │  └─────────────┘  └─────────────────┘   │
                    └─────────────┬───────────────────────────┘
                                  │ gRPC/HTTP/WebSocket
                    ┌─────────────┴───────────────────────────┐
                    │                                         │
        ┌───────────▼──────────┐                 ┌───────────▼──────────┐
        │    WORKER NODE 1     │                 │    WORKER NODE N     │
        │ ┌─────────────────┐  │                 │ ┌─────────────────┐  │
        │ │ Virtual Users   │  │                 │ │ Virtual Users   │  │
        │ │ (VUs 1-100)     │  │       ...       │ │ (VUs 901-1000)  │  │
        │ └─────────────────┘  │                 │ └─────────────────┘  │
        │ ┌─────────────────┐  │                 │ ┌─────────────────┐  │
        │ │ Metrics         │  │                 │ │ Metrics         │  │
        │ │ Collector       │  │                 │ │ Collector       │  │
        │ └─────────────────┘  │                 │ └─────────────────┘  │
        └──────────────────────┘                 └──────────────────────┘
                    │                                         │
                    ▼                                         ▼
        ┌──────────────────────┐                 ┌──────────────────────┐
        │   TARGET SYSTEM 1    │                 │   TARGET SYSTEM N    │
        │                      │                 │                      │
        │  ┌────┐  ┌────┐      │                 │  ┌────┐  ┌────┐      │
        │  │API │  │Web │      │                 │  │API │  │DB  │      │
        │  └────┘  └────┘      │                 │  └────┘  └────┘      │
        └──────────────────────┘                 └──────────────────────┘

Communication Flow:
1. Master coordinates test execution and distributes load
2. Workers receive test configuration and execute virtual users
3. Real-time metrics flow back to master for aggregation
4. Workers generate load against target systems
5. Master collects and consolidates final results
```

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  enabled: true
  mode: "master"  # master, worker, standalone

  coordinator:
    host: "0.0.0.0"
    port: 8080
    max_workers: 50

  communication:
    protocol: "grpc"  # grpc, http, websocket
    encryption: true
    compression: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Distributed Master Test')
  .baseUrl('https://api.example.com')
  .distributed({
    enabled: true,
    mode: 'master',
    coordinator: {
      host: '0.0.0.0',
      port: 8080,
      maxWorkers: 50
    },
    communication: {
      protocol: 'grpc',
      encryption: true,
      compression: true
    }
  })
  .scenario('Main Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### Worker Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
# worker-config.yml
distributed:
  enabled: true
  mode: "worker"

  master:
    host: "master.company.com"
    port: 8080
    authentication:
      token: "{{env.WORKER_TOKEN}}"

  worker:
    id: "worker-{{env.HOSTNAME}}"
    capacity:
      max_vus: 1000
      max_rps: 5000

    resources:
      cpu_limit: "4"
      memory_limit: "8Gi"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Distributed Worker Test')
  .baseUrl('https://api.example.com')
  .distributed({
    enabled: true,
    mode: 'worker',
    master: {
      host: 'master.company.com',
      port: 8080,
      authentication: {
        token: process.env.WORKER_TOKEN
      }
    },
    worker: {
      id: `worker-${process.env.HOSTNAME}`,
      capacity: {
        maxVus: 1000,
        maxRps: 5000
      },
      resources: {
        cpuLimit: '4',
        memoryLimit: '8Gi'
      }
    }
  })
  .scenario('Worker Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .build();
```

<!-- tabs:end -->

## Deployment Strategies

### Kubernetes Deployment

```yaml
# k8s-distributed.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: perfornium-master
spec:
  replicas: 1
  selector:
    matchLabels:
      app: perfornium-master
  template:
    metadata:
      labels:
        app: perfornium-master
    spec:
      containers:
      - name: perfornium
        image: perfornium/master:latest
        ports:
        - containerPort: 8080
        env:
        - name: PERFORNIUM_MODE
          value: "master"
        - name: PERFORNIUM_CONFIG
          value: "/config/perfornium.yml"
        volumeMounts:
        - name: config
          mountPath: /config
      volumes:
      - name: config
        configMap:
          name: perfornium-config

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: perfornium-workers
spec:
  replicas: 5
  selector:
    matchLabels:
      app: perfornium-worker
  template:
    metadata:
      labels:
        app: perfornium-worker
    spec:
      containers:
      - name: perfornium
        image: perfornium/worker:latest
        env:
        - name: PERFORNIUM_MODE
          value: "worker"
        - name: MASTER_HOST
          value: "perfornium-master-service"
        resources:
          limits:
            cpu: 2
            memory: 4Gi
          requests:
            cpu: 1
            memory: 2Gi
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  master:
    image: perfornium/master:latest
    ports:
      - "8080:8080"
    environment:
      - PERFORNIUM_MODE=master
      - PERFORNIUM_CONFIG=/config/perfornium.yml
    volumes:
      - ./config:/config
      - ./results:/results
    networks:
      - perfornium-network

  worker-1:
    image: perfornium/worker:latest
    environment:
      - PERFORNIUM_MODE=worker
      - MASTER_HOST=master
      - WORKER_ID=worker-1
    depends_on:
      - master
    networks:
      - perfornium-network

  worker-2:
    image: perfornium/worker:latest
    environment:
      - PERFORNIUM_MODE=worker
      - MASTER_HOST=master
      - WORKER_ID=worker-2
    depends_on:
      - master
    networks:
      - perfornium-network

networks:
  perfornium-network:
    driver: bridge
```

### Cloud Deployment

<!-- tabs:start -->

#### **YAML**
```yaml
# AWS deployment example
distributed:
  cloud:
    provider: "aws"
    region: "us-west-2"

    master:
      instance_type: "c5.xlarge"
      ami: "ami-0abcdef1234567890"
      security_groups: ["sg-perfornium-master"]
      subnet: "subnet-12345"

    workers:
      count: 10
      instance_type: "c5.2xlarge"
      ami: "ami-0abcdef1234567890"
      security_groups: ["sg-perfornium-worker"]
      subnets:
        - "subnet-12345"
        - "subnet-67890"

      auto_scaling:
        enabled: true
        min_workers: 5
        max_workers: 50
        scale_metric: "cpu_utilization"
        scale_threshold: 80
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('AWS Cloud Deployment Test')
  .baseUrl('https://api.example.com')
  .distributed({
    cloud: {
      provider: 'aws',
      region: 'us-west-2',
      master: {
        instanceType: 'c5.xlarge',
        ami: 'ami-0abcdef1234567890',
        securityGroups: ['sg-perfornium-master'],
        subnet: 'subnet-12345'
      },
      workers: {
        count: 10,
        instanceType: 'c5.2xlarge',
        ami: 'ami-0abcdef1234567890',
        securityGroups: ['sg-perfornium-worker'],
        subnets: ['subnet-12345', 'subnet-67890'],
        autoScaling: {
          enabled: true,
          minWorkers: 5,
          maxWorkers: 50,
          scaleMetric: 'cpu_utilization',
          scaleThreshold: 80
        }
      }
    }
  })
  .scenario('Cloud Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .build();
```

<!-- tabs:end -->

## Load Distribution

### Virtual User Distribution

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "basic"
  virtual_users: 1000

  distributed:
    strategy: "even"  # even, weighted, geographic, custom

    # Even distribution
    distribution:
      worker-1: 200
      worker-2: 200
      worker-3: 200
      worker-4: 200
      worker-5: 200

# Weighted distribution
distributed:
  strategy: "weighted"
  weights:
    us-east-workers: 40    # 40% of load
    us-west-workers: 30    # 30% of load
    eu-workers: 20         # 20% of load
    asia-workers: 10       # 10% of load
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Even distribution
test('Even Distribution Test')
  .baseUrl('https://api.example.com')
  .distributed({
    strategy: 'even',
    distribution: {
      'worker-1': 200,
      'worker-2': 200,
      'worker-3': 200,
      'worker-4': 200,
      'worker-5': 200
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();

// Weighted distribution
test('Weighted Distribution Test')
  .baseUrl('https://api.example.com')
  .distributed({
    strategy: 'weighted',
    weights: {
      'us-east-workers': 40,
      'us-west-workers': 30,
      'eu-workers': 20,
      'asia-workers': 10
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### Geographic Distribution

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  geographic:
    enabled: true

    regions:
      - name: "us-east"
        workers: ["worker-us-east-1", "worker-us-east-2"]
        load_percentage: 40
        timezone: "America/New_York"

      - name: "us-west"
        workers: ["worker-us-west-1", "worker-us-west-2"]
        load_percentage: 30
        timezone: "America/Los_Angeles"

      - name: "europe"
        workers: ["worker-eu-1", "worker-eu-2"]
        load_percentage: 20
        timezone: "Europe/London"

      - name: "asia"
        workers: ["worker-asia-1"]
        load_percentage: 10
        timezone: "Asia/Tokyo"

    coordination:
      synchronized_start: true
      time_skew_tolerance: 5000  # 5 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Geographic Distribution Test')
  .baseUrl('https://api.example.com')
  .distributed({
    geographic: {
      enabled: true,
      regions: [
        {
          name: 'us-east',
          workers: ['worker-us-east-1', 'worker-us-east-2'],
          loadPercentage: 40,
          timezone: 'America/New_York'
        },
        {
          name: 'us-west',
          workers: ['worker-us-west-1', 'worker-us-west-2'],
          loadPercentage: 30,
          timezone: 'America/Los_Angeles'
        },
        {
          name: 'europe',
          workers: ['worker-eu-1', 'worker-eu-2'],
          loadPercentage: 20,
          timezone: 'Europe/London'
        },
        {
          name: 'asia',
          workers: ['worker-asia-1'],
          loadPercentage: 10,
          timezone: 'Asia/Tokyo'
        }
      ],
      coordination: {
        synchronizedStart: true,
        timeSkewTolerance: 5000
      }
    }
  })
  .scenario('Geographic Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### Dynamic Load Balancing

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  load_balancing:
    enabled: true
    algorithm: "adaptive"  # round_robin, least_loaded, adaptive

    health_checks:
      enabled: true
      interval: 10s
      timeout: 5s

    failover:
      enabled: true
      redistribute_load: true
      worker_replacement: true

    metrics_based:
      cpu_threshold: 80
      memory_threshold: 85
      response_time_threshold: 2000
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Dynamic Load Balancing Test')
  .baseUrl('https://api.example.com')
  .distributed({
    loadBalancing: {
      enabled: true,
      algorithm: 'adaptive',
      healthChecks: {
        enabled: true,
        interval: '10s',
        timeout: '5s'
      },
      failover: {
        enabled: true,
        redistributeLoad: true,
        workerReplacement: true
      },
      metricsBased: {
        cpuThreshold: 80,
        memoryThreshold: 85,
        responseTimeThreshold: 2000
      }
    }
  })
  .scenario('Load Balanced Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

## Coordination and Synchronization

### Test Orchestration

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  orchestration:
    synchronization:
      start_barrier: true      # Wait for all workers
      phase_synchronization: true  # Sync load pattern phases
      clock_sync: true         # Synchronize clocks

    coordination_timeout: 60s
    heartbeat_interval: 5s

    failure_handling:
      worker_failure_threshold: 20  # % of workers that can fail
      continue_on_partial_failure: true
      graceful_degradation: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Test Orchestration')
  .baseUrl('https://api.example.com')
  .distributed({
    orchestration: {
      synchronization: {
        startBarrier: true,
        phaseSynchronization: true,
        clockSync: true
      },
      coordinationTimeout: '60s',
      heartbeatInterval: '5s',
      failureHandling: {
        workerFailureThreshold: 20,
        continueOnPartialFailure: true,
        gracefulDegradation: true
      }
    }
  })
  .scenario('Orchestrated Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### Data Consistency

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  data_consistency:
    csv_data:
      distribution_mode: "partition"  # shared, partition, replicate
      partition_strategy: "round_robin"

    variables:
      global_variables: true
      variable_synchronization: true

    state_management:
      shared_state: true
      state_backend: "redis"  # redis, etcd, database
      state_ttl: 3600
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Data Consistency Test')
  .baseUrl('https://api.example.com')
  .distributed({
    dataConsistency: {
      csvData: {
        distributionMode: 'partition',
        partitionStrategy: 'round_robin'
      },
      variables: {
        globalVariables: true,
        variableSynchronization: true
      },
      stateManagement: {
        sharedState: true,
        stateBackend: 'redis',
        stateTtl: 3600
      }
    }
  })
  .scenario('Consistent Data Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

## Communication Protocols

### gRPC Communication

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  communication:
    protocol: "grpc"

    grpc:
      max_message_size: "4MB"
      keepalive_time: 30s
      keepalive_timeout: 5s
      max_connection_idle: 300s

      security:
        tls_enabled: true
        mutual_tls: true
        cert_file: "/certs/worker.crt"
        key_file: "/certs/worker.key"
        ca_file: "/certs/ca.crt"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('gRPC Communication Test')
  .baseUrl('https://api.example.com')
  .distributed({
    communication: {
      protocol: 'grpc',
      grpc: {
        maxMessageSize: '4MB',
        keepaliveTime: '30s',
        keepaliveTimeout: '5s',
        maxConnectionIdle: '300s',
        security: {
          tlsEnabled: true,
          mutualTls: true,
          certFile: '/certs/worker.crt',
          keyFile: '/certs/worker.key',
          caFile: '/certs/ca.crt'
        }
      }
    }
  })
  .scenario('gRPC Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### HTTP Communication

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  communication:
    protocol: "http"

    http:
      compression: true
      keep_alive: true
      timeout: 30s
      max_connections: 100

      authentication:
        type: "bearer_token"
        token: "{{env.WORKER_TOKEN}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('HTTP Communication Test')
  .baseUrl('https://api.example.com')
  .distributed({
    communication: {
      protocol: 'http',
      http: {
        compression: true,
        keepAlive: true,
        timeout: '30s',
        maxConnections: 100,
        authentication: {
          type: 'bearer_token',
          token: process.env.WORKER_TOKEN
        }
      }
    }
  })
  .scenario('HTTP Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### WebSocket Communication

<!-- tabs:start -->

#### **YAML**
```yaml
distributed:
  communication:
    protocol: "websocket"

    websocket:
      ping_interval: 30s
      pong_timeout: 10s
      max_reconnect_attempts: 5
      reconnect_delay: 5s

      message_compression: true
      max_message_size: "1MB"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('WebSocket Communication Test')
  .baseUrl('https://api.example.com')
  .distributed({
    communication: {
      protocol: 'websocket',
      websocket: {
        pingInterval: '30s',
        pongTimeout: '10s',
        maxReconnectAttempts: 5,
        reconnectDelay: '5s',
        messageCompression: true,
        maxMessageSize: '1MB'
      }
    }
  })
  .scenario('WebSocket Test')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 1000, duration: '5m' })
  .build();
```

<!-- tabs:end -->

## Results Aggregation

### Real-time Aggregation

```yaml
distributed:
  results:
    aggregation:
      real_time: true
      interval: 5s
      
      metrics:
        - response_times
        - throughput
        - error_rates
        - virtual_user_counts
      
      streaming:
        enabled: true
        protocol: "websocket"
        compression: true
```

### Final Results Collection

```yaml
distributed:
  results:
    collection:
      strategy: "pull"  # push, pull, hybrid
      
      storage:
        backend: "s3"  # local, s3, gcs, azure
        bucket: "perfornium-results"
        prefix: "{{test_name}}/{{timestamp}}"
      
      format:
        raw_data: true
        aggregated: true
        compressed: true
      
      retention:
        worker_cleanup: true
        cleanup_delay: 3600  # 1 hour
```

## Monitoring and Observability

### Distributed Monitoring

```yaml
distributed:
  monitoring:
    enabled: true
    
    metrics:
      worker_health: true
      communication_latency: true
      load_distribution: true
      resource_utilization: true
    
    dashboards:
      master_dashboard: true
      worker_dashboards: true
      network_topology: true
    
    alerting:
      worker_failures: true
      communication_issues: true
      load_imbalance: true
```

### Logging

```yaml
distributed:
  logging:
    centralized: true
    
    log_aggregation:
      backend: "elasticsearch"
      index: "perfornium-distributed-{{date}}"
      
    log_levels:
      master: "info"
      workers: "warn"
      communication: "debug"
    
    structured_logging: true
    correlation_id: true
```

## Fault Tolerance

### Worker Failure Handling

```yaml
distributed:
  fault_tolerance:
    worker_failures:
      detection_timeout: 30s
      max_failure_rate: 20  # %
      
      recovery:
        auto_restart: true
        load_redistribution: true
        replacement_workers: true
      
      graceful_degradation:
        enabled: true
        min_workers_threshold: 3
        scale_down_load: true
```

### Network Partition Handling

```yaml
distributed:
  fault_tolerance:
    network_partitions:
      detection_method: "heartbeat"
      detection_timeout: 60s
      
      recovery:
        auto_reconnect: true
        state_reconciliation: true
        conflict_resolution: "master_wins"
      
      split_brain_prevention: true
```

### Master Failure Recovery

```yaml
distributed:
  fault_tolerance:
    master_failure:
      high_availability: true
      
      failover:
        backup_masters: 2
        election_timeout: 30s
        election_algorithm: "raft"
      
      state_persistence:
        enabled: true
        backend: "etcd"
        backup_interval: 60s
```

## Security

### Authentication and Authorization

```yaml
distributed:
  security:
    authentication:
      method: "mutual_tls"  # token, mutual_tls, oauth
      
      token_auth:
        algorithm: "HS256"
        secret: "{{env.JWT_SECRET}}"
        expiration: 3600
      
      tls_auth:
        ca_cert: "/certs/ca.crt"
        client_cert: "/certs/client.crt"
        client_key: "/certs/client.key"
    
    authorization:
      enabled: true
      rbac:
        roles:
          - name: "worker"
            permissions: ["execute_tests", "report_metrics"]
          - name: "admin"
            permissions: ["manage_workers", "view_all_results"]
```

### Network Security

```yaml
distributed:
  security:
    network:
      encryption: true
      cipher_suites:
        - "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
        - "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
      
      firewall_rules:
        master_ports: [8080]
        worker_ports: [8081, 8082]
        allowed_networks: ["10.0.0.0/8", "172.16.0.0/12"]
```

## Performance Optimization

### Network Optimization

```yaml
distributed:
  performance:
    network:
      tcp_nodelay: true
      tcp_keepalive: true
      send_buffer_size: "64KB"
      receive_buffer_size: "64KB"
      
      compression:
        algorithm: "gzip"
        level: 6
        threshold: 1024  # bytes
```

### Resource Management

```yaml
distributed:
  performance:
    resources:
      worker_affinity: true
      numa_awareness: true
      
      memory_management:
        gc_tuning: true
        memory_pools: true
        buffer_management: true
      
      cpu_management:
        thread_pinning: true
        cpu_isolation: true
```

## Best Practices

### Deployment Best Practices

1. **Infrastructure Sizing**
   ```yaml
   # Conservative sizing
   master:
     cpu: "2 cores"
     memory: "4GB"
     workers: "up to 20"
   
   # Large scale sizing
   master:
     cpu: "8 cores"
     memory: "16GB"
     workers: "up to 100"
   ```

2. **Network Configuration**
   ```yaml
   # Optimize for low latency
   distributed:
     communication:
       buffer_sizes:
         send: "128KB"
         receive: "128KB"
       compression: false  # Trade CPU for latency
   ```

3. **Monitoring Setup**
   ```yaml
   # Essential monitoring
   monitoring:
     - worker_health
     - network_latency
     - load_distribution
     - error_rates
   ```

Distributed testing enables Perfornium to scale beyond single-machine limitations and test systems at enterprise scale with geographic distribution and fault tolerance.
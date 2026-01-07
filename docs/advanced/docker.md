# Docker Containers

Perfornium ships Docker containers for easy deployment in containerized environments. Three images are available:

| Image | Description | Size | Use Case |
|-------|-------------|------|----------|
| `controller` | Test orchestrator | ~200MB | Run and coordinate tests |
| `worker` | Worker with browser support | ~1.5GB | Web + API testing |
| `worker-slim` | Lightweight worker | ~300MB | API-only testing |

## Quick Start

### Pull Images

```bash
docker pull testsmithio/perfornium-controller
docker pull testsmithio/perfornium-worker
docker pull testsmithio/perfornium-worker-slim
```

### Run a Simple Test

```bash
# Run a test directly
docker run -v $(pwd)/tests:/tests -v $(pwd)/results:/results \
  testsmithio/perfornium-controller \
  run /tests/my-test.yml --report
```

### Start a Worker

```bash
# Start a worker on port 8080
docker run -p 8080:8080 testsmithio/perfornium-worker

# Start a slim worker (API only)
docker run -p 8080:8080 testsmithio/perfornium-worker-slim

# With custom capacity
docker run -p 8080:8080 testsmithio/perfornium-worker --port 8080 --capacity 200
```

## Distributed Testing with Docker

### Using Docker Compose

The easiest way to run distributed tests:

```bash
# Clone the repository or copy docker/ folder
cd perfornium/docker

# Create directories
mkdir -p tests results data

# Copy your test files
cp /path/to/my-test.yml tests/
cp /path/to/data.csv data/

# Start workers
docker compose up -d worker-1 worker-2 worker-3

# Run a distributed test
docker compose run controller distributed /tests/my-test.yml \
  --workers worker-1:8080,worker-2:8080,worker-3:8080 \
  --sync-start --report

# View results
ls results/

# Stop workers
docker compose down
```

### Manual Docker Network

```bash
# Create a network
docker network create perfornium-net

# Start workers
docker run -d --name worker-1 --network perfornium-net \
  testsmithio/perfornium-worker

docker run -d --name worker-2 --network perfornium-net \
  testsmithio/perfornium-worker

docker run -d --name worker-3 --network perfornium-net \
  testsmithio/perfornium-worker

# Run distributed test
docker run --rm --network perfornium-net \
  -v $(pwd)/tests:/tests \
  -v $(pwd)/results:/results \
  testsmithio/perfornium-controller \
  distributed /tests/my-test.yml \
  --workers worker-1:8080,worker-2:8080,worker-3:8080 \
  --sync-start --report

# Cleanup
docker stop worker-1 worker-2 worker-3
docker rm worker-1 worker-2 worker-3
docker network rm perfornium-net
```

## Kubernetes Deployment

### Worker Deployment

```yaml
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
      - name: worker
        image: testsmithio/perfornium-worker-slim
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1"
            memory: "1Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: perfornium-workers
spec:
  selector:
    app: perfornium-worker
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP
```

### Controller Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: perfornium-test
spec:
  template:
    spec:
      containers:
      - name: controller
        image: testsmithio/perfornium-controller
        args:
        - distributed
        - /tests/load-test.yml
        - --workers
        - perfornium-workers:8080
        - --sync-start
        - --report
        volumeMounts:
        - name: tests
          mountPath: /tests
        - name: results
          mountPath: /results
      volumes:
      - name: tests
        configMap:
          name: perfornium-tests
      - name: results
        persistentVolumeClaim:
          claimName: perfornium-results
      restartPolicy: Never
  backoffLimit: 1
```

## Environment Variables

### Controller

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `PERFORNIUM_RESULTS_DIR` | `/results` | Results output directory |

### Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `PERFORNIUM_WORKER_PORT` | `8080` | Worker listen port |
| `PERFORNIUM_WORKER_CAPACITY` | `100` | Max VUs this worker handles |
| `PERFORNIUM_WORKER_REGION` | `default` | Region identifier |
| `PERFORNIUM_SKIP_BROWSER` | `false` | Skip browser initialization |

## Volume Mounts

| Path | Purpose | Mode |
|------|---------|------|
| `/tests` | Test configuration files | Read-only |
| `/results` | Test results and reports | Read-write |
| `/data` | CSV and test data files | Read-only |

## Building Locally

```bash
# Build all images
npm run docker:build:all

# Build individual images
npm run docker:build:controller
npm run docker:build:worker
npm run docker:build:worker-slim

# Start local workers with Docker Compose
npm run docker:up

# Or slim workers for API-only testing
npm run docker:up:slim

# View logs
npm run docker:logs

# Stop workers
npm run docker:down
```

## Image Tags

Images are tagged with:
- `latest` - Most recent release
- `X.Y.Z` - Specific version (e.g., `0.2.0`)

```bash
# Use specific version
docker pull testsmithio/perfornium-worker:0.2.0

# Use latest
docker pull testsmithio/perfornium-worker:latest
```

## Worker vs Worker-Slim

| Feature | `worker` | `worker-slim` |
|---------|----------|---------------|
| REST API testing | Yes | Yes |
| SOAP testing | Yes | Yes |
| Web/Browser testing | Yes | No |
| Image size | ~1.5GB | ~300MB |
| Memory usage | Higher | Lower |
| Startup time | Slower | Faster |
| Multi-arch | amd64 only | amd64, arm64 |

**Use `worker-slim` when:**
- Only testing REST/SOAP APIs
- Running on resource-constrained environments
- Deploying many worker replicas
- Running on ARM architecture (Apple Silicon, Graviton)

**Use `worker` when:**
- Testing web applications with Playwright
- Need browser-based performance metrics
- Running Core Web Vitals measurements

## Troubleshooting

### Worker not responding

```bash
# Check worker health
curl http://localhost:8080/health

# View worker logs
docker logs perfornium-worker-1
```

### Controller can't reach workers

```bash
# Ensure workers are on same network
docker network inspect perfornium-net

# Test connectivity
docker exec perfornium-controller curl http://worker-1:8080/health
```

### Out of memory

```bash
# Increase memory limit
docker run -m 4g testsmithio/perfornium-worker

# Or reduce worker capacity
docker run testsmithio/perfornium-worker --capacity 50
```

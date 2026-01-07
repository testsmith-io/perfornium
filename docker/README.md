# Perfornium Docker

Docker containers for distributed performance testing.

## Images

| Image | Description | Dockerfile |
|-------|-------------|------------|
| `controller` | Test orchestrator | `Dockerfile.controller` |
| `worker` | Worker with Playwright | `Dockerfile.worker` |
| `worker-slim` | Lightweight API-only worker | `Dockerfile.worker-slim` |

## Quick Start

```bash
# Build images
npm run docker:build:all

# Start 3 workers
docker compose up -d worker-1 worker-2 worker-3

# Run a distributed test
docker compose run controller distributed /tests/my-test.yml \
  --workers worker-1:8080,worker-2:8080,worker-3:8080 \
  --sync-start --report

# Stop workers
docker compose down
```

## Directory Structure

```
docker/
├── Dockerfile.controller    # Controller/orchestrator image
├── Dockerfile.worker        # Full worker with browser support
├── Dockerfile.worker-slim   # Slim worker for API testing
├── docker-compose.yml       # Full stack with browser workers
├── docker-compose.slim.yml  # Slim stack for API testing
└── README.md
```

## Usage

### Prepare Test Files

```bash
mkdir -p tests results data
cp /path/to/my-test.yml tests/
cp /path/to/data.csv data/
```

### Run with Docker Compose

```bash
# Full workers (with browser)
docker compose up -d worker-1 worker-2 worker-3
docker compose run controller distributed /tests/my-test.yml \
  --workers worker-1:8080,worker-2:8080,worker-3:8080 --report

# Slim workers (API only)
docker compose -f docker-compose.slim.yml up -d
docker compose -f docker-compose.slim.yml run controller \
  distributed /tests/my-test.yml \
  --workers worker-1:8080,worker-2:8080,worker-3:8080 --report
```

## Environment Variables

### Worker

- `PERFORNIUM_WORKER_PORT` - Listen port (default: 8080)
- `PERFORNIUM_WORKER_CAPACITY` - Max VUs (default: 100)
- `PERFORNIUM_WORKER_REGION` - Region name (default: default)

## See Also

- [Docker Documentation](../docs/advanced/docker.md)
- [Distributed Testing](../docs/advanced/distributed.md)

# Perfornium Infrastructure Agents

Lightweight agents that collect system metrics from target machines and push them to the Perfornium dashboard.

## Quick Start

### Linux/macOS

```bash
./infra-agent.sh -e http://localhost:3000/api/infra
```

### Windows (PowerShell)

```powershell
.\infra-agent.ps1 -Endpoint http://localhost:3000/api/infra
```

## Overview

These agents collect infrastructure metrics and push them to the Perfornium dashboard via HTTP POST. This allows you to correlate system resource usage with load test results.

**Metrics collected:**
- CPU usage (percentage)
- Memory usage (used/total MB, percentage)
- Disk usage (used/total GB, percentage)
- Network I/O (bytes in/out)

## Bash Agent (Linux/macOS)

### Requirements

- Bash 4.0+
- curl
- bc (for floating-point math)
- Standard Unix utilities (df, awk, grep)

### Usage

```bash
./infra-agent.sh [OPTIONS]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--endpoint` | `-e` | HTTP endpoint URL (required) | - |
| `--host` | `-h` | Host label | hostname |
| `--interval` | `-i` | Collection interval (seconds) | 5 |
| `--interface` | `-n` | Network interface to monitor | auto-detect |
| `--disk` | `-d` | Disk path to monitor | / |
| `--verbose` | `-v` | Enable verbose output | false |
| `--help` | | Show help message | - |

### Examples

```bash
# Basic usage
./infra-agent.sh -e http://localhost:3000/api/infra

# Custom host label and interval
./infra-agent.sh -e http://perfornium:3000/api/infra -h web-server-01 -i 10

# Monitor specific interface and disk
./infra-agent.sh -e http://localhost:3000/api/infra -n eth0 -d /home -v
```

### Platform-Specific Notes

**Linux:**
- CPU: Reads `/proc/stat`
- Memory: Reads `/proc/meminfo`
- Network: Reads `/sys/class/net/*/statistics`

**macOS:**
- CPU: Uses `top -l 2`
- Memory: Uses `vm_stat` + `sysctl`
- Network: Uses `netstat -ibn`

## PowerShell Agent (Windows)

### Requirements

- PowerShell 5.1 or later
- Administrator privileges (for some metrics)

### Usage

```powershell
.\infra-agent.ps1 -Endpoint <URL> [OPTIONS]
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Endpoint` | HTTP endpoint URL (required) | - |
| `-HostLabel` | Host label | Computer name |
| `-Interval` | Collection interval (seconds) | 5 |
| `-NetworkInterface` | Network interface name | auto-detect |
| `-DiskDrive` | Drive letter to monitor | C |
| `-VerboseOutput` | Enable verbose output | false |

### Examples

```powershell
# Basic usage
.\infra-agent.ps1 -Endpoint http://localhost:3000/api/infra

# Custom host label and interval
.\infra-agent.ps1 -Endpoint http://perfornium:3000/api/infra -HostLabel "web-server-01" -Interval 10

# Monitor D: drive with verbose output
.\infra-agent.ps1 -Endpoint http://localhost:3000/api/infra -DiskDrive D -VerboseOutput
```

### Platform-Specific Notes

- CPU: Uses `Get-Counter '\Processor(_Total)\% Processor Time'`
- Memory: Uses `Get-CimInstance Win32_OperatingSystem`
- Disk: Uses `Get-CimInstance Win32_LogicalDisk`
- Network: Uses `Get-NetAdapterStatistics`

## JSON Payload Format

The agents send metrics in the following format:

```json
{
  "type": "infrastructure_metrics",
  "host": "web-server-01",
  "timestamp": "2026-01-17T12:00:00.000Z",
  "interval_seconds": 5,
  "metrics": {
    "cpu": { "usage_percent": 45.2 },
    "memory": { "used_mb": 4096, "total_mb": 8192, "usage_percent": 50.0 },
    "disk": { "used_gb": 120.5, "total_gb": 500.0, "usage_percent": 24.1, "path": "/" },
    "network": { "bytes_in": 1234567890, "bytes_out": 987654321, "interface": "eth0" }
  }
}
```

## Error Handling

Both agents implement:
- Connection timeout: 5 seconds
- Request timeout: 10 seconds
- Consecutive failure tracking: exits after 10 failures
- Graceful degradation: returns 0 for metrics that fail to collect

## Running as a Service

### Linux (systemd)

Create `/etc/systemd/system/perfornium-agent.service`:

```ini
[Unit]
Description=Perfornium Infrastructure Agent
After=network.target

[Service]
Type=simple
ExecStart=/path/to/infra-agent.sh -e http://perfornium:3000/api/infra -h my-server
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable perfornium-agent
sudo systemctl start perfornium-agent
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create a new task
3. Set trigger to "At startup"
4. Set action to run PowerShell with arguments:
   ```
   -ExecutionPolicy Bypass -File "C:\path\to\infra-agent.ps1" -Endpoint http://perfornium:3000/api/infra
   ```

## Troubleshooting

### Agent can't connect

- Verify the endpoint URL is correct
- Check firewall rules allow outbound HTTP
- Try with `-v` / `-VerboseOutput` to see detailed logs

### Missing metrics

- Ensure the agent has sufficient permissions
- On Windows, run PowerShell as Administrator
- Check if the specified interface/disk exists

### High CPU usage

- Increase the collection interval (e.g., `-i 30`)
- The bash agent's CPU measurement uses a 0.1s sampling delay

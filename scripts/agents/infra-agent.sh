#!/bin/bash
#
# Perfornium Infrastructure Metrics Agent
# Collects system metrics and pushes them to the Perfornium dashboard
# Supports: Linux and macOS
#

set -e

# Default configuration
ENDPOINT=""
HOST_LABEL=""
INTERVAL=5
NETWORK_INTERFACE=""
DISK_PATH="/"
VERBOSE=false
MAX_FAILURES=10
CONNECT_TIMEOUT=5
REQUEST_TIMEOUT=10

# Track consecutive failures
failure_count=0

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Perfornium Infrastructure Metrics Agent - collects and pushes system metrics

Required:
  -e, --endpoint URL     HTTP endpoint URL (e.g., http://localhost:3000/api/infra)

Options:
  -h, --host LABEL       Host label (default: system hostname)
  -i, --interval SECS    Collection interval in seconds (default: 5)
  -n, --interface NAME   Network interface to monitor (default: auto-detect)
  -d, --disk PATH        Disk path to monitor (default: /)
  -v, --verbose          Enable verbose output
      --help             Show this help message

Examples:
  $(basename "$0") -e http://localhost:3000/api/infra
  $(basename "$0") -e http://perfornium:3000/api/infra -h web-server-01 -i 10
  $(basename "$0") -e http://localhost:3000/api/infra -n eth0 -d /home -v

EOF
    exit 0
}

log() {
    if [ "$VERBOSE" = true ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    fi
}

error() {
    echo "[ERROR] $*" >&2
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--endpoint)
            ENDPOINT="$2"
            shift 2
            ;;
        -h|--host)
            HOST_LABEL="$2"
            shift 2
            ;;
        -i|--interval)
            INTERVAL="$2"
            shift 2
            ;;
        -n|--interface)
            NETWORK_INTERFACE="$2"
            shift 2
            ;;
        -d|--disk)
            DISK_PATH="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required arguments
if [ -z "$ENDPOINT" ]; then
    error "Endpoint URL is required"
    usage
fi

# Set default host label
if [ -z "$HOST_LABEL" ]; then
    HOST_LABEL=$(hostname)
fi

# Detect OS
OS_TYPE="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="macos"
else
    error "Unsupported OS: $OSTYPE"
    exit 1
fi

log "Detected OS: $OS_TYPE"

# Auto-detect network interface
detect_network_interface() {
    if [ -n "$NETWORK_INTERFACE" ]; then
        echo "$NETWORK_INTERFACE"
        return
    fi

    if [ "$OS_TYPE" = "linux" ]; then
        # Try to find the default route interface
        local iface
        iface=$(ip route | grep '^default' | awk '{print $5}' | head -n1 2>/dev/null) || true
        if [ -z "$iface" ]; then
            # Fallback: find first non-loopback interface
            iface=$(ls /sys/class/net | grep -v '^lo$' | head -n1 2>/dev/null) || true
        fi
        echo "${iface:-eth0}"
    else
        # macOS: find first non-loopback interface with traffic
        local iface
        iface=$(route -n get default 2>/dev/null | grep 'interface:' | awk '{print $2}') || true
        if [ -z "$iface" ]; then
            iface=$(networksetup -listallhardwareports | grep -A1 "Hardware Port:" | grep "Device:" | head -n1 | awk '{print $2}') || true
        fi
        echo "${iface:-en0}"
    fi
}

NETWORK_INTERFACE=$(detect_network_interface)
log "Using network interface: $NETWORK_INTERFACE"
log "Using disk path: $DISK_PATH"
log "Collection interval: ${INTERVAL}s"
log "Pushing to: $ENDPOINT"

# CPU collection
get_cpu_linux() {
    # Read /proc/stat twice with a small delay
    local cpu1 cpu2 idle1 idle2 total1 total2

    read -r _ user1 nice1 system1 idle1 iowait1 irq1 softirq1 _ < /proc/stat
    sleep 0.1
    read -r _ user2 nice2 system2 idle2 iowait2 irq2 softirq2 _ < /proc/stat

    total1=$((user1 + nice1 + system1 + idle1 + iowait1 + irq1 + softirq1))
    total2=$((user2 + nice2 + system2 + idle2 + iowait2 + irq2 + softirq2))

    local total_diff=$((total2 - total1))
    local idle_diff=$((idle2 - idle1))

    if [ "$total_diff" -gt 0 ]; then
        local usage=$(( (total_diff - idle_diff) * 1000 / total_diff ))
        echo "$((usage / 10)).$((usage % 10))"
    else
        echo "0.0"
    fi
}

get_cpu_macos() {
    # Use top to get CPU usage (sample twice for accuracy)
    local cpu_line
    cpu_line=$(top -l 2 -n 0 -s 0 2>/dev/null | grep "CPU usage" | tail -n1)

    if [ -n "$cpu_line" ]; then
        # Parse "CPU usage: X.XX% user, Y.YY% sys, Z.ZZ% idle" using regex-style matching
        # Extract percentages more robustly by looking for patterns
        local user sys
        user=$(echo "$cpu_line" | sed -n 's/.*[^0-9]\([0-9]*\.[0-9]*\)% user.*/\1/p')
        sys=$(echo "$cpu_line" | sed -n 's/.*[^0-9]\([0-9]*\.[0-9]*\)% sys.*/\1/p')

        # Handle integer percentages (no decimal point)
        if [ -z "$user" ]; then
            user=$(echo "$cpu_line" | sed -n 's/.*[^0-9]\([0-9]*\)% user.*/\1/p')
        fi
        if [ -z "$sys" ]; then
            sys=$(echo "$cpu_line" | sed -n 's/.*[^0-9]\([0-9]*\)% sys.*/\1/p')
        fi

        user=${user:-0}
        sys=${sys:-0}
        echo "$(echo "$user + $sys" | bc 2>/dev/null || echo "0.0")"
    else
        echo "0.0"
    fi
}

get_cpu() {
    if [ "$OS_TYPE" = "linux" ]; then
        get_cpu_linux
    else
        get_cpu_macos
    fi
}

# Memory collection
get_memory_linux() {
    local total_kb available_kb used_kb
    total_kb=$(grep '^MemTotal:' /proc/meminfo | awk '{print $2}')
    available_kb=$(grep '^MemAvailable:' /proc/meminfo | awk '{print $2}')

    if [ -z "$available_kb" ]; then
        # Fallback for older kernels
        local free_kb buffers_kb cached_kb
        free_kb=$(grep '^MemFree:' /proc/meminfo | awk '{print $2}')
        buffers_kb=$(grep '^Buffers:' /proc/meminfo | awk '{print $2}')
        cached_kb=$(grep '^Cached:' /proc/meminfo | awk '{print $2}')
        available_kb=$((free_kb + buffers_kb + cached_kb))
    fi

    used_kb=$((total_kb - available_kb))
    local used_mb=$((used_kb / 1024))
    local total_mb=$((total_kb / 1024))
    local usage_percent=$((used_kb * 1000 / total_kb))

    echo "${used_mb},${total_mb},$((usage_percent / 10)).$((usage_percent % 10))"
}

get_memory_macos() {
    local page_size
    page_size=$(pagesize 2>/dev/null || sysctl -n hw.pagesize)

    # Get total memory
    local total_bytes
    total_bytes=$(sysctl -n hw.memsize)
    local total_mb=$((total_bytes / 1024 / 1024))

    # Get vm_stat for used memory calculation
    local vm_stat_output
    vm_stat_output=$(vm_stat)

    # Parse vm_stat values (they end with a period)
    local pages_active pages_wired pages_compressed pages_app
    pages_active=$(echo "$vm_stat_output" | grep "Pages active:" | awk '{print $3}' | tr -d '.')
    pages_wired=$(echo "$vm_stat_output" | grep "Pages wired down:" | awk '{print $4}' | tr -d '.')
    pages_compressed=$(echo "$vm_stat_output" | grep "Pages occupied by compressor:" | awk '{print $5}' | tr -d '.')

    # Handle missing values (older macOS versions may not have compressed pages)
    pages_active=${pages_active:-0}
    pages_wired=${pages_wired:-0}
    pages_compressed=${pages_compressed:-0}

    # Calculate used memory: active + wired + compressed (matches Activity Monitor)
    local used_pages=$((pages_active + pages_wired + pages_compressed))
    local used_bytes=$((used_pages * page_size))
    local used_mb=$((used_bytes / 1024 / 1024))

    local usage_percent=$((used_mb * 1000 / total_mb))

    echo "${used_mb},${total_mb},$((usage_percent / 10)).$((usage_percent % 10))"
}

get_memory() {
    if [ "$OS_TYPE" = "linux" ]; then
        get_memory_linux
    else
        get_memory_macos
    fi
}

# Disk collection
get_disk_macos() {
    # For macOS APFS, use diskutil to get accurate container usage when monitoring /
    if [ "$DISK_PATH" = "/" ]; then
        # Get the disk device for root
        local root_device
        root_device=$(df / | tail -n1 | awk '{print $1}')

        # Extract base disk (e.g., disk3s1s1 -> disk3)
        local base_disk
        base_disk=$(echo "$root_device" | sed 's|/dev/||' | sed 's/s[0-9]*$//' | sed 's/s[0-9]*$//')

        # Try to get APFS container info
        local container_info
        container_info=$(diskutil apfs list "$base_disk" 2>/dev/null)

        if [ -n "$container_info" ]; then
            # Parse "Capacity In Use By Volumes:" line
            local capacity_line
            capacity_line=$(echo "$container_info" | grep "Capacity In Use By Volumes:")

            if [ -n "$capacity_line" ]; then
                # Extract bytes and percentage: "781221187584 B (781.2 GB) (78.5% used)"
                local used_gb total_gb usage_percent
                used_gb=$(echo "$capacity_line" | grep -oE '\([0-9]+\.?[0-9]* [GT]B\)' | head -1 | tr -d '()' | awk '{print $1}')
                usage_percent=$(echo "$capacity_line" | grep -oE '\([0-9]+\.?[0-9]*% used\)' | grep -oE '[0-9]+\.?[0-9]*')

                # Get total from "Size (Capacity Ceiling)"
                local size_line
                size_line=$(echo "$container_info" | grep "Size (Capacity Ceiling):")
                total_gb=$(echo "$size_line" | grep -oE '\([0-9]+\.?[0-9]* [GT]B\)' | tr -d '()' | awk '{print $1}')

                if [ -n "$used_gb" ] && [ -n "$total_gb" ] && [ -n "$usage_percent" ]; then
                    echo "${used_gb},${total_gb},${usage_percent}"
                    return
                fi
            fi
        fi
    fi

    # Fallback to standard df for non-APFS or non-root paths
    get_disk_standard
}

get_disk_standard() {
    local df_output
    df_output=$(df -m "$DISK_PATH" 2>/dev/null | tail -n1)

    if [ -n "$df_output" ]; then
        local total_mb used_mb
        total_mb=$(echo "$df_output" | awk '{print $2}')
        used_mb=$(echo "$df_output" | awk '{print $3}')

        local total_gb used_gb
        total_gb=$(echo "scale=1; $total_mb / 1024" | bc)
        used_gb=$(echo "scale=1; $used_mb / 1024" | bc)

        local usage_percent
        if [ "$total_mb" -gt 0 ]; then
            usage_percent=$(echo "scale=1; $used_mb * 100 / $total_mb" | bc)
        else
            usage_percent="0.0"
        fi

        echo "${used_gb},${total_gb},${usage_percent}"
    else
        echo "0.0,0.0,0.0"
    fi
}

get_disk() {
    if [ "$OS_TYPE" = "linux" ]; then
        get_disk_standard
    else
        get_disk_macos
    fi
}

# Network collection
prev_bytes_in=0
prev_bytes_out=0
first_run=true

get_network_linux() {
    local iface="$NETWORK_INTERFACE"
    local rx_file="/sys/class/net/${iface}/statistics/rx_bytes"
    local tx_file="/sys/class/net/${iface}/statistics/tx_bytes"

    if [ -f "$rx_file" ] && [ -f "$tx_file" ]; then
        local bytes_in bytes_out
        bytes_in=$(cat "$rx_file")
        bytes_out=$(cat "$tx_file")
        echo "${bytes_in},${bytes_out}"
    else
        echo "0,0"
    fi
}

get_network_macos() {
    local iface="$NETWORK_INTERFACE"

    # Use netstat -I for interface-specific stats (more reliable than parsing -ibn)
    local netstat_output
    netstat_output=$(netstat -I "$iface" -b 2>/dev/null | tail -n1)

    if [ -n "$netstat_output" ]; then
        local bytes_in bytes_out
        # netstat -I -b columns: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
        # Fields: 1=Name 2=Mtu 3=Network 4=Address 5=Ipkts 6=Ierrs 7=Ibytes 8=Opkts 9=Oerrs 10=Obytes
        bytes_in=$(echo "$netstat_output" | awk '{print $7}')
        bytes_out=$(echo "$netstat_output" | awk '{print $10}')

        # Validate we got numbers (not header text)
        if [[ "$bytes_in" =~ ^[0-9]+$ ]] && [[ "$bytes_out" =~ ^[0-9]+$ ]]; then
            echo "${bytes_in},${bytes_out}"
        else
            echo "0,0"
        fi
    else
        echo "0,0"
    fi
}

get_network() {
    if [ "$OS_TYPE" = "linux" ]; then
        get_network_linux
    else
        get_network_macos
    fi
}

# Build and send JSON payload
send_metrics() {
    local cpu_usage mem_info disk_info net_info

    cpu_usage=$(get_cpu)
    mem_info=$(get_memory)
    disk_info=$(get_disk)
    net_info=$(get_network)

    IFS=',' read -r mem_used mem_total mem_percent <<< "$mem_info"
    IFS=',' read -r disk_used disk_total disk_percent <<< "$disk_info"
    IFS=',' read -r bytes_in bytes_out <<< "$net_info"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

    local payload
    payload=$(cat << EOF
{
  "type": "infrastructure_metrics",
  "host": "${HOST_LABEL}",
  "timestamp": "${timestamp}",
  "interval_seconds": ${INTERVAL},
  "metrics": {
    "cpu": { "usage_percent": ${cpu_usage} },
    "memory": { "used_mb": ${mem_used}, "total_mb": ${mem_total}, "usage_percent": ${mem_percent} },
    "disk": { "used_gb": ${disk_used}, "total_gb": ${disk_total}, "usage_percent": ${disk_percent}, "path": "${DISK_PATH}" },
    "network": { "bytes_in": ${bytes_in}, "bytes_out": ${bytes_out}, "interface": "${NETWORK_INTERFACE}" }
  }
}
EOF
)

    log "Sending metrics: CPU=${cpu_usage}%, Mem=${mem_used}/${mem_total}MB, Disk=${disk_used}/${disk_total}GB, Net in/out=${bytes_in}/${bytes_out}"

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout "$CONNECT_TIMEOUT" \
        --max-time "$REQUEST_TIMEOUT" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$ENDPOINT" 2>/dev/null) || true

    if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
        log "Metrics sent successfully (HTTP $http_code)"
        failure_count=0
        return 0
    else
        failure_count=$((failure_count + 1))
        error "Failed to send metrics (HTTP $http_code) - failure $failure_count/$MAX_FAILURES"

        if [ "$failure_count" -ge "$MAX_FAILURES" ]; then
            error "Max consecutive failures reached. Exiting."
            exit 1
        fi
        return 1
    fi
}

# Main loop
echo "Perfornium Infrastructure Agent started"
echo "Host: $HOST_LABEL"
echo "Endpoint: $ENDPOINT"
echo "Interval: ${INTERVAL}s"
echo "Press Ctrl+C to stop"
echo ""

trap 'echo ""; echo "Agent stopped."; exit 0' INT TERM

while true; do
    send_metrics || true
    sleep "$INTERVAL"
done

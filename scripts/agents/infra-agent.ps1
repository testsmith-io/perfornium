#Requires -Version 5.1
<#
.SYNOPSIS
    Perfornium Infrastructure Metrics Agent for Windows

.DESCRIPTION
    Collects system metrics (CPU, Memory, Disk, Network) and pushes them to
    the Perfornium dashboard via HTTP POST.

.PARAMETER Endpoint
    Required. The HTTP endpoint URL (e.g., http://localhost:3000/api/infra)

.PARAMETER HostLabel
    Optional. Host label for identification (default: system hostname)

.PARAMETER Interval
    Optional. Collection interval in seconds (default: 5)

.PARAMETER NetworkInterface
    Optional. Network interface name to monitor (default: auto-detect primary)

.PARAMETER DiskDrive
    Optional. Drive letter to monitor (default: C)

.PARAMETER VerboseOutput
    Optional. Enable verbose output

.EXAMPLE
    .\infra-agent.ps1 -Endpoint http://localhost:3000/api/infra

.EXAMPLE
    .\infra-agent.ps1 -Endpoint http://perfornium:3000/api/infra -HostLabel "web-server-01" -Interval 10

.EXAMPLE
    .\infra-agent.ps1 -Endpoint http://localhost:3000/api/infra -DiskDrive D -VerboseOutput
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Endpoint,

    [Parameter(Mandatory = $false)]
    [string]$HostLabel = $env:COMPUTERNAME,

    [Parameter(Mandatory = $false)]
    [int]$Interval = 5,

    [Parameter(Mandatory = $false)]
    [string]$NetworkInterface = "",

    [Parameter(Mandatory = $false)]
    [string]$DiskDrive = "C",

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutput
)

# Configuration
$MaxFailures = 10
$ConnectTimeout = 5
$RequestTimeout = 10
$FailureCount = 0

function Write-Log {
    param([string]$Message)
    if ($VerboseOutput) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "[$timestamp] $Message"
    }
}

function Write-Error-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [ERROR] $Message" -ForegroundColor Red
}

# Auto-detect network interface
function Get-PrimaryNetworkInterface {
    if ($NetworkInterface) {
        return $NetworkInterface
    }

    try {
        # Get the adapter with the default route
        $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
            Sort-Object -Property RouteMetric |
            Select-Object -First 1

        if ($defaultRoute) {
            $adapter = Get-NetAdapter -InterfaceIndex $defaultRoute.InterfaceIndex -ErrorAction SilentlyContinue
            if ($adapter) {
                return $adapter.Name
            }
        }

        # Fallback: get first active adapter
        $adapter = Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1
        if ($adapter) {
            return $adapter.Name
        }
    }
    catch {
        Write-Log "Failed to auto-detect network interface: $_"
    }

    return "Ethernet"
}

$NetworkInterface = Get-PrimaryNetworkInterface
Write-Log "Using network interface: $NetworkInterface"
Write-Log "Using disk drive: $DiskDrive"
Write-Log "Collection interval: ${Interval}s"
Write-Log "Pushing to: $Endpoint"

# Get CPU usage
function Get-CpuUsage {
    try {
        $counter = Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue
        if ($counter) {
            $value = $counter.CounterSamples[0].CookedValue
            return [math]::Round($value, 1)
        }
    }
    catch {
        Write-Log "Failed to get CPU usage: $_"
    }
    return 0.0
}

# Get Memory usage
function Get-MemoryUsage {
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $totalMB = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
            $freeMB = [math]::Round($os.FreePhysicalMemory / 1024, 0)
            $usedMB = $totalMB - $freeMB
            $usagePercent = [math]::Round(($usedMB / $totalMB) * 100, 1)

            return @{
                UsedMB = $usedMB
                TotalMB = $totalMB
                UsagePercent = $usagePercent
            }
        }
    }
    catch {
        Write-Log "Failed to get memory usage: $_"
    }

    return @{
        UsedMB = 0
        TotalMB = 0
        UsagePercent = 0.0
    }
}

# Get Disk usage
function Get-DiskUsage {
    param([string]$Drive)

    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${Drive}:'" -ErrorAction SilentlyContinue
        if ($disk) {
            $totalGB = [math]::Round($disk.Size / 1GB, 1)
            $freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
            $usedGB = [math]::Round($totalGB - $freeGB, 1)
            $usagePercent = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0.0 }

            return @{
                UsedGB = $usedGB
                TotalGB = $totalGB
                UsagePercent = $usagePercent
                Path = "${Drive}:"
            }
        }
    }
    catch {
        Write-Log "Failed to get disk usage: $_"
    }

    return @{
        UsedGB = 0.0
        TotalGB = 0.0
        UsagePercent = 0.0
        Path = "${Drive}:"
    }
}

# Get Network stats
function Get-NetworkStats {
    param([string]$InterfaceName)

    try {
        $stats = Get-NetAdapterStatistics -Name $InterfaceName -ErrorAction SilentlyContinue
        if ($stats) {
            return @{
                BytesIn = $stats.ReceivedBytes
                BytesOut = $stats.SentBytes
                Interface = $InterfaceName
            }
        }
    }
    catch {
        Write-Log "Failed to get network stats: $_"
    }

    return @{
        BytesIn = 0
        BytesOut = 0
        Interface = $InterfaceName
    }
}

# Send metrics to endpoint
function Send-Metrics {
    $cpu = Get-CpuUsage
    $memory = Get-MemoryUsage
    $disk = Get-DiskUsage -Drive $DiskDrive
    $network = Get-NetworkStats -InterfaceName $NetworkInterface

    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

    $payload = @{
        type = "infrastructure_metrics"
        host = $HostLabel
        timestamp = $timestamp
        interval_seconds = $Interval
        metrics = @{
            cpu = @{
                usage_percent = $cpu
            }
            memory = @{
                used_mb = $memory.UsedMB
                total_mb = $memory.TotalMB
                usage_percent = $memory.UsagePercent
            }
            disk = @{
                used_gb = $disk.UsedGB
                total_gb = $disk.TotalGB
                usage_percent = $disk.UsagePercent
                path = $disk.Path
            }
            network = @{
                bytes_in = $network.BytesIn
                bytes_out = $network.BytesOut
                interface = $network.Interface
            }
        }
    }

    $jsonPayload = $payload | ConvertTo-Json -Depth 4 -Compress

    Write-Log "Sending metrics: CPU=${cpu}%, Mem=$($memory.UsedMB)/$($memory.TotalMB)MB, Disk=$($disk.UsedGB)/$($disk.TotalGB)GB, Net in/out=$($network.BytesIn)/$($network.BytesOut)"

    try {
        $response = Invoke-RestMethod -Uri $Endpoint `
            -Method Post `
            -ContentType "application/json" `
            -Body $jsonPayload `
            -TimeoutSec $RequestTimeout `
            -ErrorAction Stop

        Write-Log "Metrics sent successfully"
        $script:FailureCount = 0
        return $true
    }
    catch {
        $script:FailureCount++
        Write-Error-Log "Failed to send metrics: $_ - failure $($script:FailureCount)/$MaxFailures"

        if ($script:FailureCount -ge $MaxFailures) {
            Write-Error-Log "Max consecutive failures reached. Exiting."
            exit 1
        }
        return $false
    }
}

# Main execution
Write-Host "Perfornium Infrastructure Agent started"
Write-Host "Host: $HostLabel"
Write-Host "Endpoint: $Endpoint"
Write-Host "Interval: ${Interval}s"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

# Register cleanup handler
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Write-Host ""
    Write-Host "Agent stopped."
}

try {
    while ($true) {
        $null = Send-Metrics
        Start-Sleep -Seconds $Interval
    }
}
catch {
    if ($_.Exception.Message -notmatch "Sleep") {
        Write-Error-Log "Unexpected error: $_"
    }
}
finally {
    Write-Host ""
    Write-Host "Agent stopped."
}

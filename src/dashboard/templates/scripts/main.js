/* global Chart, document, window, location, WebSocket, setTimeout, setInterval, clearInterval, fetch, console, confirm, alert, URL, URLSearchParams, requestAnimationFrame */

// State
let ws, liveTests = {}, results = [], testFiles = [], selectedForCompare = new Set(), charts = {}, runningTestId = null, workersData = null, infraMetrics = {};

// Shared crosshair state
let sharedCrosshair = { x: null, sourceChartId: null, timestamp: null, labelIndex: null };

// Get all active Chart.js instances
function getAllCharts() {
  return Object.values(Chart.instances || {});
}

// Store timestamp arrays for charts using category labels
const chartTimestamps = {};

// Shared crosshair plugin - syncs by x-axis time across all time-based charts
const sharedCrosshairPlugin = {
  id: 'sharedCrosshair',
  afterEvent(chart, args) {
    const event = args.event;
    // Skip charts with crosshair disabled
    if (chart.options.plugins?.sharedCrosshair?.enabled === false) return;

    if (event.type === 'mousemove' && args.inChartArea) {
      const xScale = chart.scales.x;
      if (!xScale) return;

      sharedCrosshair.x = event.x;
      sharedCrosshair.sourceChartId = chart.id;

      // Get the x-value at the cursor position
      const xValue = xScale.getValueForPixel(event.x);

      // For scatter/linear charts, xValue is the actual timestamp
      if (xScale.type === 'linear' || xScale.type === 'time' || xScale.type === 'timeseries') {
        sharedCrosshair.timestamp = xValue;
        sharedCrosshair.labelIndex = null;
      }
      // For category charts, find the label index and get timestamp from stored mapping
      if (xScale.type === 'category') {
        const labelIndex = Math.round(xValue);
        sharedCrosshair.labelIndex = labelIndex;
        // Try to get actual timestamp from stored mapping
        const timestamps = chartTimestamps[chart.canvas.id];
        if (timestamps && timestamps[labelIndex] !== undefined) {
          sharedCrosshair.timestamp = timestamps[labelIndex];
        }
      }

      // Trigger redraw on all charts
      getAllCharts().forEach(c => {
        if (c && c.id !== chart.id && c.options.plugins?.sharedCrosshair?.enabled !== false) {
          c.draw();
        }
      });
    } else if (event.type === 'mouseout') {
      sharedCrosshair.x = null;
      sharedCrosshair.sourceChartId = null;
      sharedCrosshair.timestamp = null;
      sharedCrosshair.labelIndex = null;
      getAllCharts().forEach(c => {
        if (c && c.options.plugins?.sharedCrosshair?.enabled !== false) {
          c.draw();
        }
      });
    }
  },
  afterDraw(chart) {
    // Skip if no crosshair or chart has it disabled
    if (sharedCrosshair.x === null && sharedCrosshair.timestamp === null) return;
    if (chart.options.plugins?.sharedCrosshair?.enabled === false) return;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;

    if (!xScale || !chartArea) return;

    let xPos;

    if (chart.id === sharedCrosshair.sourceChartId) {
      // Source chart - use exact pixel position
      xPos = sharedCrosshair.x;
    } else if (sharedCrosshair.timestamp !== null) {
      // Try to sync by timestamp
      if (xScale.type === 'linear' || xScale.type === 'time' || xScale.type === 'timeseries') {
        // Linear/time scale - use timestamp directly
        xPos = xScale.getPixelForValue(sharedCrosshair.timestamp);
      } else if (xScale.type === 'category') {
        // Category scale - find the closest timestamp in stored mapping
        const timestamps = chartTimestamps[chart.canvas.id];
        if (timestamps && timestamps.length > 0) {
          // Find index with closest timestamp
          let closestIdx = 0;
          let closestDiff = Math.abs(timestamps[0] - sharedCrosshair.timestamp);
          for (let i = 1; i < timestamps.length; i++) {
            const diff = Math.abs(timestamps[i] - sharedCrosshair.timestamp);
            if (diff < closestDiff) {
              closestDiff = diff;
              closestIdx = i;
            }
          }
          xPos = xScale.getPixelForValue(closestIdx);
        } else if (sharedCrosshair.labelIndex !== null) {
          // Fallback to label index if no timestamp mapping
          const idx = sharedCrosshair.labelIndex;
          if (idx >= 0 && idx < (chart.data.labels?.length || 0)) {
            xPos = xScale.getPixelForValue(idx);
          } else {
            return;
          }
        } else {
          return;
        }
      }
    } else if (sharedCrosshair.labelIndex !== null) {
      // Fallback to label index sync
      const idx = sharedCrosshair.labelIndex;
      if (idx >= 0 && idx < (chart.data.labels?.length || 0)) {
        xPos = xScale.getPixelForValue(idx);
      } else {
        return;
      }
    } else {
      return;
    }

    if (xPos === undefined || xPos < chartArea.left || xPos > chartArea.right) return;

    // Draw vertical crosshair line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xPos, chartArea.top);
    ctx.lineTo(xPos, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }
};

// Register crosshair plugin globally
Chart.register(sharedCrosshairPlugin);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  loadResults();
  loadTests();
  loadWorkers();
  loadInfrastructure();
  setupTabs();
  document.getElementById('compareBtn').addEventListener('click', runComparison);
});

// WebSocket
function initWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host);
  ws.onopen = () => { document.getElementById('connectionStatus').innerHTML = '<span class="live-badge">Dashboard</span>'; };
  ws.onclose = () => { document.getElementById('connectionStatus').innerHTML = '<span style="color: var(--text-secondary); font-size: 12px;">Reconnecting...</span>'; setTimeout(initWebSocket, 3000); };
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function handleMessage(msg) {
  if (msg.type === 'live_tests') { msg.data.forEach(t => liveTests[t.id] = t); renderLive(); }
  else if (msg.type === 'live_update') { liveTests[msg.data.id] = msg.data; renderLive(); }
  else if (msg.type === 'test_complete') { liveTests[msg.data.id] = msg.data; renderLive(); loadResults(); }
  else if (msg.type === 'test_output') { appendConsole(msg.data); }
  else if (msg.type === 'test_finished') { onTestFinished(msg.testId, msg.exitCode); }
  else if (msg.type === 'infra_update') { handleInfraUpdate(msg.data); }
}

// Infrastructure metrics handling
function handleInfraUpdate(data) {
  const host = data.host;
  if (!infraMetrics[host]) {
    infraMetrics[host] = [];
  }
  infraMetrics[host].push(data);
  // Keep last 120 entries (10 minutes at 5s intervals)
  if (infraMetrics[host].length > 120) {
    infraMetrics[host].shift();
  }
  renderInfrastructure();
  // Also update Results tab if visible
  const resultsPanel = document.getElementById('results');
  if (resultsPanel && resultsPanel.classList.contains('active')) {
    renderResults();
  }
}

// Tests
async function loadTests() {
  try {
    console.log('Loading tests...');
    const res = await fetch('/api/tests');
    testFiles = await res.json();
    console.log('Loaded tests:', testFiles);
    renderTests();
  } catch (e) { console.error('Failed to load tests:', e); }
}

async function loadWorkers() {
  try {
    const res = await fetch('/api/workers');
    workersData = await res.json();
    const section = document.getElementById('workersSection');
    const info = document.getElementById('workersInfo');
    const headerStatus = document.getElementById('workersStatus');
    if (workersData.available && workersData.workers.length > 0) {
      section.style.display = 'block';
      const totalCapacity = workersData.workers.reduce((sum, w) => sum + (w.capacity || 0), 0);
      const workerCount = workersData.workers.length;
      info.textContent = '(' + workerCount + ' workers, ' + totalCapacity + ' total capacity)';
      // Show workers info in header
      const workerNames = workersData.workers.map(w => w.name || (w.host + ':' + w.port)).join(', ');
      headerStatus.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: linear-gradient(135deg, #9c40ff 0%, #00d4ff 100%); border-radius: 20px; font-size: 12px; color: white; font-weight: 500; cursor: help;" title="' + workerNames + '"><span style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></span>' + workerCount + ' Worker' + (workerCount > 1 ? 's' : '') + '</span>';
    } else {
      headerStatus.innerHTML = '';
    }
  } catch (e) { console.error('Failed to load workers:', e); }
}

// Infrastructure
async function loadInfrastructure() {
  try {
    const res = await fetch('/api/infra');
    const data = await res.json();
    // data is { host: latestMetrics, ... } format, fetch full history for each
    for (const host of Object.keys(data)) {
      if (data[host]) {
        const histRes = await fetch('/api/infra/' + encodeURIComponent(host));
        const histData = await histRes.json();
        infraMetrics[host] = histData.metrics || [];
      }
    }
    renderInfrastructure();
  } catch (e) { console.error('Failed to load infrastructure metrics:', e); }
}

// Track rendered infra hosts to avoid DOM rebuilds
let renderedInfraHosts = new Set();

// Create HTML for a single infra host card
function createInfraHostCard(host) {
  return `
    <div class="card" id="infra-host-${host.replace(/[^a-zA-Z0-9]/g, '_')}">
      <div class="card-header">
        <h3>${host}</h3>
        <span class="live-badge">Connected</span>
      </div>
      <p class="infra-last-update" style="color: var(--text-secondary); font-size: 11px; margin-bottom: 16px;">Last update: -</p>

      <!-- Current Metrics -->
      <div class="grid-4" style="margin-bottom: 20px;">
        <div class="metric-card">
          <div class="value infra-cpu-value">-%</div>
          <div class="label">CPU</div>
        </div>
        <div class="metric-card">
          <div class="value infra-mem-value">-%</div>
          <div class="label infra-mem-label">Memory</div>
        </div>
        <div class="metric-card">
          <div class="value infra-disk-value">-%</div>
          <div class="label infra-disk-label">Disk</div>
        </div>
        <div class="metric-card">
          <div class="value infra-net-value">-</div>
          <div class="label">Network I/O</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2" style="gap: 12px;">
        <div class="card expandable" style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 0;">
          ${expandBtnHtml()}
          <h4 style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">CPU Usage</h4>
          <div class="chart-container" style="height: 120px;"><canvas id="infra-cpu-${host}"></canvas></div>
        </div>
        <div class="card expandable" style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 0;">
          ${expandBtnHtml()}
          <h4 class="infra-mem-chart-label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Memory Usage</h4>
          <div class="chart-container" style="height: 120px;"><canvas id="infra-mem-${host}"></canvas></div>
        </div>
        <div class="card expandable" style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 0;">
          ${expandBtnHtml()}
          <h4 style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Disk Usage</h4>
          <div class="chart-container" style="height: 120px;"><canvas id="infra-disk-${host}"></canvas></div>
        </div>
        <div class="card expandable" style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 0;">
          ${expandBtnHtml()}
          <h4 style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Network I/O</h4>
          <div class="chart-container" style="height: 120px;"><canvas id="infra-net-${host}"></canvas></div>
        </div>
      </div>
    </div>
  `;
}

// Update metrics display for a host without rebuilding DOM
function updateInfraHostMetrics(host) {
  const hostId = host.replace(/[^a-zA-Z0-9]/g, '_');
  const card = document.getElementById('infra-host-' + hostId);
  if (!card) return;

  const history = infraMetrics[host] || [];
  const latest = history[history.length - 1] || {};
  const metrics = latest.metrics || {};

  const cpu = metrics.cpu?.usage_percent ?? '-';
  const mem = metrics.memory?.usage_percent ?? '-';
  const memUsed = metrics.memory?.used_mb ?? 0;
  const memTotal = metrics.memory?.total_mb ?? 0;
  const disk = metrics.disk?.usage_percent ?? '-';
  const diskUsed = metrics.disk?.used_gb ?? 0;
  const diskTotal = metrics.disk?.total_gb ?? 0;
  const netIn = metrics.network?.bytes_in ?? 0;
  const netOut = metrics.network?.bytes_out ?? 0;
  const interval = latest.interval_seconds || 5;
  const netRate = (netIn + netOut) / interval;
  const lastUpdate = latest.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '-';

  // Update text values
  const lastUpdateEl = card.querySelector('.infra-last-update');
  if (lastUpdateEl) lastUpdateEl.textContent = 'Last update: ' + lastUpdate;

  const cpuEl = card.querySelector('.infra-cpu-value');
  if (cpuEl) {
    cpuEl.textContent = (typeof cpu === 'number' ? cpu.toFixed(1) : cpu) + '%';
    cpuEl.style.color = cpu !== '-' && cpu > 80 ? '#ef4444' : cpu !== '-' && cpu > 60 ? '#eab308' : '';
    cpuEl.style.webkitTextFillColor = cpuEl.style.color || '';
  }

  const memEl = card.querySelector('.infra-mem-value');
  if (memEl) {
    memEl.textContent = (typeof mem === 'number' ? mem.toFixed(1) : mem) + '%';
    memEl.style.color = mem !== '-' && mem > 85 ? '#ef4444' : mem !== '-' && mem > 70 ? '#eab308' : '';
    memEl.style.webkitTextFillColor = memEl.style.color || '';
  }

  const memLabelEl = card.querySelector('.infra-mem-label');
  if (memLabelEl && memTotal) {
    memLabelEl.textContent = 'Memory';
  }

  const memChartLabel = card.querySelector('.infra-mem-chart-label');
  if (memChartLabel && memTotal) {
    memChartLabel.textContent = `Memory Usage (${(memUsed/1024).toFixed(1)}/${(memTotal/1024).toFixed(1)} GB)`;
  }

  const diskEl = card.querySelector('.infra-disk-value');
  if (diskEl) {
    diskEl.textContent = (typeof disk === 'number' ? disk.toFixed(1) : disk) + '%';
    diskEl.style.color = disk !== '-' && disk > 90 ? '#ef4444' : disk !== '-' && disk > 80 ? '#eab308' : '';
    diskEl.style.webkitTextFillColor = diskEl.style.color || '';
  }

  const diskLabelEl = card.querySelector('.infra-disk-label');
  if (diskLabelEl && diskTotal) {
    diskLabelEl.textContent = `Disk (${diskUsed.toFixed(0)}/${diskTotal.toFixed(0)} GB)`;
  }

  const netEl = card.querySelector('.infra-net-value');
  if (netEl) {
    netEl.textContent = formatBytesPerSec(netRate);
  }

  // Update charts
  if (history.length >= 2) {
    const labels = history.map(h => {
      const d = new Date(h.timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
    });
    const infraTimestamps = history.map(h => new Date(h.timestamp).getTime());

    createOrUpdateChart('infra-cpu-' + host, 'line', labels, [{
      label: 'CPU %',
      data: history.map(h => h.metrics?.cpu?.usage_percent ?? 0),
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0, 212, 255, 0.1)',
      fill: true,
      tension: 0.3
    }], infraTimestamps);

    createOrUpdateChart('infra-mem-' + host, 'line', labels, [{
      label: 'Memory %',
      data: history.map(h => h.metrics?.memory?.usage_percent ?? 0),
      borderColor: '#9c40ff',
      backgroundColor: 'rgba(156, 64, 255, 0.1)',
      fill: true,
      tension: 0.3
    }], infraTimestamps);

    createOrUpdateChart('infra-disk-' + host, 'line', labels, [{
      label: 'Disk %',
      data: history.map(h => h.metrics?.disk?.usage_percent ?? 0),
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      fill: true,
      tension: 0.3
    }], infraTimestamps);

    createOrUpdateChart('infra-net-' + host, 'line', labels, [{
      label: 'In',
      data: history.map(h => (h.metrics?.network?.bytes_in ?? 0) / 1024),
      borderColor: '#00d4ff',
      fill: false,
      tension: 0.3
    }, {
      label: 'Out',
      data: history.map(h => (h.metrics?.network?.bytes_out ?? 0) / 1024),
      borderColor: '#ef4444',
      fill: false,
      tension: 0.3
    }], infraTimestamps);
  }
}

function renderInfrastructure() {
  const container = document.getElementById('infraContainer');
  if (!container) return;

  const hosts = Object.keys(infraMetrics);

  // Show empty state if no hosts
  if (!hosts.length) {
    renderedInfraHosts.clear();
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0;">Infrastructure Monitoring</h2>
        <div style="display: flex; gap: 8px;">
          <button onclick="importInfraMetrics('json')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Import JSON
          </button>
          <button onclick="importInfraMetrics('csv')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Import CSV
          </button>
        </div>
      </div>
      <div class="empty-state">
        <h3>No infrastructure agents connected</h3>
        <p>Send metrics to <code>POST /api/infra</code> to see server monitoring</p>
        <div style="margin-top: 16px; text-align: left; background: var(--bg-secondary); border-radius: 8px; padding: 16px; max-width: 600px;">
          <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 8px;">Example curl command:</p>
          <code style="font-size: 11px; color: #00d4ff; word-break: break-all;">curl -X POST localhost:3000/api/infra -H "Content-Type: application/json" -d '{"host":"server1","type":"infrastructure_metrics","metrics":{"cpu":{"usage_percent":45},"memory":{"used_mb":8192,"total_mb":16384,"usage_percent":50}}}'</code>
        </div>
      </div>
    `;
    return;
  }

  // Check if we need to rebuild the DOM (new hosts added or hosts removed)
  const currentHostSet = new Set(hosts);
  const needsRebuild = hosts.some(h => !renderedInfraHosts.has(h)) ||
                       [...renderedInfraHosts].some(h => !currentHostSet.has(h)) ||
                       !container.querySelector('.grid-2');

  if (needsRebuild) {
    renderedInfraHosts = currentHostSet;
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0;">Infrastructure Monitoring <span id="infraHostCount" style="font-size: 14px; color: var(--text-secondary); font-weight: normal;">(${hosts.length} host${hosts.length > 1 ? 's' : ''})</span></h2>
        <div style="display: flex; gap: 8px;">
          <button onclick="exportAllInfra('json')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Export JSON
          </button>
          <button onclick="exportAllInfra('csv')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Export CSV
          </button>
          <button onclick="importInfraMetrics('json')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Import JSON
          </button>
          <button onclick="importInfraMetrics('csv')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            Import CSV
          </button>
        </div>
      </div>
      <div class="grid-2" id="infraHostsGrid">
        ${hosts.map(host => createInfraHostCard(host)).join('')}
      </div>
    `;
  }

  // Update metrics for each host (without rebuilding DOM)
  hosts.forEach(host => updateInfraHostMetrics(host));
}

function formatBytesPerSec(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderLiveInfrastructure(testId) {
  const hosts = Object.keys(infraMetrics);
  if (!hosts.length) return '';

  return `
    <div class="card" style="margin-top: 20px;">
      <h3 style="color: #00d4ff;">Infrastructure Metrics</h3>
      <p style="color: var(--text-secondary); font-size: 11px; margin-bottom: 16px;">${hosts.length} host(s) connected</p>
      <div class="grid-${Math.min(hosts.length, 2)}">
        ${hosts.map(host => {
          const history = infraMetrics[host] || [];
          const latest = history[history.length - 1] || {};
          const metrics = latest.metrics || {};
          const cpu = metrics.cpu?.usage_percent ?? '-';
          const mem = metrics.memory?.usage_percent ?? '-';
          const disk = metrics.disk?.usage_percent ?? '-';
          const netIn = metrics.network?.bytes_in ?? 0;
          const netOut = metrics.network?.bytes_out ?? 0;
          const interval = latest.interval_seconds || 5;
          const netRate = (netIn + netOut) / interval;

          return `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong>${host}</strong>
                <span class="live-badge" style="font-size: 10px;">Live</span>
              </div>
              <div class="grid-4" style="gap: 8px;">
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${cpu !== '-' && cpu > 80 ? '#ef4444' : cpu !== '-' && cpu > 60 ? '#eab308' : '#00d4ff'};">${typeof cpu === 'number' ? cpu.toFixed(0) : cpu}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">CPU</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${mem !== '-' && mem > 85 ? '#ef4444' : mem !== '-' && mem > 70 ? '#eab308' : '#9c40ff'};">${typeof mem === 'number' ? mem.toFixed(0) : mem}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Memory</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${disk !== '-' && disk > 90 ? '#ef4444' : '#22c55e'};">${typeof disk === 'number' ? disk.toFixed(0) : disk}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Disk</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold;">${formatBytesPerSec(netRate)}</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Net I/O</div>
                </div>
              </div>
              <div class="grid-2" style="margin-top: 12px; gap: 8px;">
                <div style="height: 80px;"><canvas id="live-infra-cpu-${testId}-${host}"></canvas></div>
                <div style="height: 80px;"><canvas id="live-infra-mem-${testId}-${host}"></canvas></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTests() {
  const container = document.getElementById('testsList');
  console.log('Rendering tests:', testFiles.length, 'files');
  if (!testFiles.length) {
    container.innerHTML = '<div class="empty-state"><h3>No tests found</h3><p>Add test files to your tests/ folder</p></div>';
    return;
  }
  container.innerHTML = testFiles.map((t, idx) => `
    <div class="test-item">
      <div class="test-info">
        <div class="test-name">${t.name}</div>
        <div class="test-path">${t.relativePath}</div>
      </div>
      <span class="test-type ${t.type}">${t.type}</span>
      <button class="btn btn-primary btn-sm" style="margin-left: 12px;" onclick="runTestByIndex(${idx})" ${runningTestId ? 'disabled' : ''}>Run</button>
    </div>
  `).join('');
}

function runTestByIndex(idx) {
  if (idx >= 0 && idx < testFiles.length) {
    runTest(testFiles[idx].path);
  }
}

async function runTest(testPath) {
  if (runningTestId) return;

  // Get load override values
  const vus = document.getElementById('loadVus').value;
  const iterations = document.getElementById('loadIterations').value;
  const duration = document.getElementById('loadDuration').value;
  const rampUp = document.getElementById('loadRampUp').value;

  // Build options object
  const options = { verbose: true };
  if (vus) options.vus = parseInt(vus);
  if (iterations) options.iterations = parseInt(iterations);
  if (duration) options.duration = duration;
  if (rampUp) options.rampUp = rampUp;

  // Check for headless mode
  const headless = document.getElementById('headlessMode')?.checked;
  if (headless) {
    options.headless = true;
  }

  // Check for distributed workers
  const useWorkers = document.getElementById('useWorkers')?.checked;
  if (useWorkers && workersData?.workers?.length > 0) {
    options.workers = workersData.workers.map(w => w.host + ':' + w.port).join(',');
  }

  // Show what's being run
  let loadInfo = '';
  const parts = [];
  if (vus) parts.push('VUs: ' + vus);
  if (iterations) parts.push('Iterations: ' + iterations);
  if (duration) parts.push('Duration: ' + duration);
  if (rampUp) parts.push('Ramp-up: ' + rampUp);
  if (headless) parts.push('Headless');
  if (useWorkers) parts.push('Workers: ' + workersData.workers.length);
  if (parts.length) loadInfo = ' (' + parts.join(', ') + ')';

  document.getElementById('testConsole').innerHTML = 'Starting test...' + loadInfo + '\n';
  document.getElementById('testRunStatus').innerHTML = '<span class="live-badge">Running</span> <button class="btn btn-danger btn-sm" onclick="stopTest()" style="margin-left: 12px;">Stop Test</button>';

  try {
    const res = await fetch('/api/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testPath, options })
    });
    const data = await res.json();
    runningTestId = data.testId;
    renderTests();
  } catch (e) {
    appendConsole('Error: ' + e.message);
    document.getElementById('testRunStatus').innerHTML = '';
  }
}

async function stopTest() {
  if (!runningTestId) return;
  try {
    await fetch('/api/tests/stop/' + runningTestId, { method: 'POST' });
  } catch (e) { console.error(e); }
}

function appendConsole(text) {
  const consoleEl = document.getElementById('testConsole');
  consoleEl.innerHTML += text;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function onTestFinished(testId, exitCode) {
  if (testId === runningTestId) {
    runningTestId = null;
    const status = exitCode === 0 ? '<span class="status-badge good">Completed</span>' : '<span class="status-badge bad">Failed</span>';
    document.getElementById('testRunStatus').innerHTML = status;
    appendConsole('\n--- Test finished with exit code ' + exitCode + ' ---');
    renderTests();
    loadResults();
  }
}

// Live Tests
function renderLive() {
  const container = document.getElementById('liveTestsContainer');
  const running = Object.values(liveTests).filter(t => t.status === 'running');

  if (!running.length) {
    container.innerHTML = '<div class="empty-state"><h3>No tests running</h3><p>Start a test with <code>perfornium run your-test.yml</code> or from the Tests tab</p></div>';
    return;
  }

  container.innerHTML = running.map(test => `
    <div class="card" id="live-${test.id}">
      <div class="card-header">
        <h3>${test.name}</h3>
        <span class="live-badge">Running</span>
      </div>

      <!-- Primary Metrics Row -->
      <div class="grid-6" style="margin-bottom: 20px;">
        <div class="metric-card"><div class="value">${test.metrics.requests.toLocaleString()}</div><div class="label">Requests</div></div>
        <div class="metric-card"><div class="value">${test.metrics.currentVUs}</div><div class="label">VUs</div></div>
        <div class="metric-card"><div class="value">${test.metrics.avgResponseTime.toFixed(0)}ms</div><div class="label">Avg RT</div></div>
        <div class="metric-card"><div class="value">${(test.history.length > 0 ? test.history[test.history.length-1].rps : 0).toFixed(1)}</div><div class="label">Req/s</div></div>
        <div class="metric-card"><div class="value" style="${test.metrics.errors > 0 ? 'color: #ef4444 !important; -webkit-text-fill-color: #ef4444;' : ''}">${test.metrics.errors}</div><div class="label">Errors</div></div>
        <div class="metric-card"><div class="value">${test.metrics.successRate ? test.metrics.successRate.toFixed(1) : (test.metrics.requests > 0 ? ((test.metrics.requests - test.metrics.errors) / test.metrics.requests * 100).toFixed(1) : 100)}%</div><div class="label">Success</div></div>
      </div>

      <!-- Response Time Percentiles Row -->
      <div class="card" style="margin-bottom: 20px; padding: 16px;">
        <h3 style="margin-bottom: 12px;">Response Time Percentiles</h3>
        <div class="grid-4">
          <div class="metric-card"><div class="value">${(test.metrics.p50ResponseTime || 0).toFixed(0)}ms</div><div class="label">P50 (Median)</div></div>
          <div class="metric-card"><div class="value">${(test.metrics.p90ResponseTime || 0).toFixed(0)}ms</div><div class="label">P90</div></div>
          <div class="metric-card"><div class="value" style="color: #eab308 !important; -webkit-text-fill-color: #eab308;">${(test.metrics.p95ResponseTime || 0).toFixed(0)}ms</div><div class="label">P95</div></div>
          <div class="metric-card"><div class="value" style="color: #ef4444 !important; -webkit-text-fill-color: #ef4444;">${(test.metrics.p99ResponseTime || 0).toFixed(0)}ms</div><div class="label">P99</div></div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2">
        <div class="card expandable" style="margin-bottom: 0;">
          ${expandBtnHtml()}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3>Individual Response Times</h3>
            <div style="display: flex; gap: 16px; font-size: 12px;">
              <span style="color: #22c55e;">Success</span>
              <span style="color: #ef4444;">Failed</span>
              <span style="color: var(--text-secondary);">(${test.responseTimes ? test.responseTimes.length : 0} samples)</span>
            </div>
          </div>
          <div class="chart-container"><canvas id="chart-rt-${test.id}"></canvas></div>
        </div>
        <div class="card expandable" style="margin-bottom: 0;">
          ${expandBtnHtml()}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3>Throughput (req/s)</h3>
            <span style="color: #9c40ff; font-size: 12px;">Current: <strong>${(test.history.length > 0 ? test.history[test.history.length-1].rps : 0).toFixed(1)} req/s</strong></span>
          </div>
          <div class="chart-container"><canvas id="chart-rps-${test.id}"></canvas></div>
        </div>
      </div>
      <div class="grid-2" style="margin-top: 20px;">
        <div class="card expandable" style="margin-bottom: 0;">
          ${expandBtnHtml()}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3>Virtual Users</h3>
            <span style="color: #22c55e; font-size: 12px;">Active: <strong>${test.metrics.currentVUs}</strong></span>
          </div>
          <div class="chart-container"><canvas id="chart-vus-${test.id}"></canvas></div>
        </div>
        <div class="card expandable" style="margin-bottom: 0;">
          ${expandBtnHtml()}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3>Cumulative Errors</h3>
            <span style="color: #ef4444; font-size: 12px;">Total: <strong>${test.metrics.errors}</strong></span>
          </div>
          <div class="chart-container"><canvas id="chart-err-${test.id}"></canvas></div>
        </div>
      </div>

      <!-- Step Performance Statistics -->
      ${test.stepStats && test.stepStats.length > 0 ? `
      <div class="card" style="margin-top: 20px;">
        <h3>Step Performance Statistics</h3>
        <div style="overflow-x: auto; margin-top: 12px;">
          <table class="step-stats-table">
            <thead>
              <tr>
                <th>Step Name</th>
                <th>Scenario</th>
                <th>Requests</th>
                <th>Errors</th>
                <th>Success Rate</th>
                <th>Avg RT</th>
                <th>P50</th>
                <th>P95</th>
                <th>P99</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${test.stepStats.map(s => `
                <tr>
                  <td><strong>${s.stepName}</strong></td>
                  <td>${s.scenario}</td>
                  <td>${s.requests}</td>
                  <td style="${s.errors > 0 ? 'color: #ef4444;' : ''}">${s.errors}</td>
                  <td>${s.successRate.toFixed(1)}%</td>
                  <td>${s.avgResponseTime}ms</td>
                  <td>${s.p50 || 0}ms</td>
                  <td>${s.p95 || 0}ms</td>
                  <td>${s.p99 || 0}ms</td>
                  <td><span class="status-badge ${s.successRate < 90 || (s.p95 || 0) >= 10000 ? 'bad' : s.successRate < 98 || (s.p95 || 0) >= 5000 ? 'warn' : 'good'}">
                    ${s.successRate < 90 || (s.p95 || 0) >= 10000 ? 'Poor' : s.successRate < 98 || (s.p95 || 0) >= 5000 ? 'Warn' : 'Good'}
                  </span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      <!-- Top Errors -->
      ${test.topErrors && test.topErrors.length > 0 ? `
      <div class="card" style="margin-top: 20px;">
        <h3 style="color: #ef4444;">Top Errors (${test.topErrors.length})</h3>
        <div style="overflow-x: auto; margin-top: 12px;">
          <table class="step-stats-table">
            <thead>
              <tr>
                <th>Count</th>
                <th>Scenario</th>
                <th>Action</th>
                <th>Status</th>
                <th>Error Message</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              ${test.topErrors.map(e => `
                <tr>
                  <td style="color: #ef4444; font-weight: bold;">${e.count}</td>
                  <td>${e.scenario || '-'}</td>
                  <td>${e.action || '-'}</td>
                  <td>${e.status !== undefined && e.status !== null ? e.status : '-'}</td>
                  <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.error}">${e.error || '-'}</td>
                  <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.url || ''}">${e.url || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      <!-- Infrastructure Metrics -->
      ${renderLiveInfrastructure(test.id)}
    </div>
  `).join('');

  running.forEach(test => {
    const history = test.history || [];
    const _startTime = test.startTime ? new Date(test.startTime).getTime() : (history.length > 0 ? history[0].timestamp : Date.now()); // eslint-disable-line @typescript-eslint/no-unused-vars
    const labels = history.map(h => {
      const d = new Date(h.timestamp);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      const ss = d.getSeconds().toString().padStart(2, '0');
      const ms = d.getMilliseconds().toString().padStart(3, '0');
      return `${hh}:${mm}:${ss}.${ms}`;
    });
    // Store timestamps for crosshair sync
    const historyTimestamps = history.map(h => h.timestamp);

    // Create scatter plot for individual response times - colored by step
    const responseTimes = test.responseTimes || [];
    const rtStartTime = test.startTime ? new Date(test.startTime).getTime() : (responseTimes.length > 0 ? responseTimes[0].timestamp : Date.now());

    // Color palette for different steps
    const stepColors = [
      { bg: 'rgba(34, 197, 94, 0.6)', border: '#22c55e' },   // green
      { bg: 'rgba(59, 130, 246, 0.6)', border: '#3b82f6' },  // blue
      { bg: 'rgba(168, 85, 247, 0.6)', border: '#a855f7' },  // purple
      { bg: 'rgba(245, 158, 11, 0.6)', border: '#f59e0b' },  // amber
      { bg: 'rgba(236, 72, 153, 0.6)', border: '#ec4899' },  // pink
      { bg: 'rgba(20, 184, 166, 0.6)', border: '#14b8a6' },  // teal
      { bg: 'rgba(99, 102, 241, 0.6)', border: '#6366f1' },  // indigo
      { bg: 'rgba(249, 115, 22, 0.6)', border: '#f97316' },  // orange
    ];

    // Helper to format timestamp as hh:mm:ss.mmm
    const formatLiveTime = (ts) => {
      const d = new Date(ts);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      const ss = d.getSeconds().toString().padStart(2, '0');
      const ms = d.getMilliseconds().toString().padStart(3, '0');
      return `${hh}:${mm}:${ss}.${ms}`;
    };

    // Group response times by step name
    const stepGroups = {};
    const failedData = [];
    responseTimes.forEach(r => {
      const point = { x: r.timestamp, y: r.value, timestamp: r.timestamp };
      if (!r.success) {
        failedData.push(point);
      } else {
        const stepName = r.stepName || 'unknown';
        if (!stepGroups[stepName]) stepGroups[stepName] = [];
        stepGroups[stepName].push(point);
      }
    });

    // Create datasets for each step
    const stepNames = Object.keys(stepGroups);
    const datasets = stepNames.map((name, i) => {
      const colors = stepColors[i % stepColors.length];
      return {
        label: name,
        data: stepGroups[name],
        backgroundColor: colors.bg,
        borderColor: colors.border,
        pointRadius: 3
      };
    });

    // Add failed requests as a separate dataset (always red)
    if (failedData.length > 0) {
      datasets.push({
        label: 'Failed',
        data: failedData,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: '#ef4444',
        pointRadius: 4
      });
    }

    createScatterChart('chart-rt-' + test.id, datasets, rtStartTime, formatLiveTime);
    createOrUpdateChart('chart-rps-' + test.id, 'line', labels, [{
      label: 'Requests/sec', data: history.map(h => h.rps),
      borderColor: '#9c40ff', backgroundColor: 'rgba(156, 64, 255, 0.1)', fill: true, tension: 0.3
    }], historyTimestamps);
    createOrUpdateChart('chart-vus-' + test.id, 'line', labels, [{
      label: 'Virtual Users', data: history.map(h => h.vus),
      borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.3, stepped: true
    }], historyTimestamps);
    createOrUpdateChart('chart-err-' + test.id, 'line', labels, [{
      label: 'Errors', data: history.map(h => h.errors),
      borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3
    }], historyTimestamps);

    // Create infrastructure charts for each host
    Object.keys(infraMetrics).forEach(host => {
      const infraHistory = infraMetrics[host] || [];
      if (infraHistory.length < 2) return;

      const infraLabels = infraHistory.slice(-30).map((h, i) => i + 's');
      const recentHistory = infraHistory.slice(-30);

      createOrUpdateChart('live-infra-cpu-' + test.id + '-' + host, 'line', infraLabels, [{
        label: 'CPU',
        data: recentHistory.map(h => h.metrics?.cpu?.usage_percent ?? 0),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0
      }]);

      createOrUpdateChart('live-infra-mem-' + test.id + '-' + host, 'line', infraLabels, [{
        label: 'Memory',
        data: recentHistory.map(h => h.metrics?.memory?.usage_percent ?? 0),
        borderColor: '#9c40ff',
        backgroundColor: 'rgba(156, 64, 255, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0
      }]);
    });
  });
}

// Results
async function loadResults() {
  try {
    const res = await fetch('/api/results');
    results = await res.json();
    renderResults();
    renderCompareSelect();
  } catch (e) { console.error('Failed to load results:', e); }
}

async function deleteResult(id, event) {
  event.stopPropagation();
  if (!confirm('Are you sure you want to delete this result?')) return;
  try {
    const res = await fetch('/api/results/' + id, { method: 'DELETE' });
    if (res.ok) {
      loadResults();
    } else {
      const data = await res.json();
      console.error('Failed to delete result:', data);
      alert('Failed to delete result: ' + (data.details || data.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Failed to delete result:', e);
    alert('Failed to delete result: ' + e.message);
  }
}

function renderResults() {
  const container = document.getElementById('resultsContainer');
  if (!results.length) {
    container.innerHTML = `
      ${renderResultsInfrastructure()}
      <div class="empty-state"><h3>No test results yet</h3><p>Run a test to see results here</p></div>
    `;
    renderResultsInfraCharts();
    return;
  }
  container.innerHTML = `
    ${renderResultsInfrastructure()}
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">Test Results</h3>
        <div style="display: flex; gap: 8px;">
          <button onclick="importResult()" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
            <span style="margin-right: 4px;">&#8593;</span> Import Result
          </button>
          <input type="file" id="importFileInput" accept=".json" style="display: none;" onchange="handleImportFile(event)">
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Test Name</th><th>Date</th><th>Duration</th><th>Requests</th>
          <th>Avg</th><th>P95</th><th>P99</th>
          <th>RPS</th><th>Success Rate</th><th></th>
        </tr></thead>
        <tbody>
          ${results.map(r => `<tr class="clickable" onclick="showDetail('${encodeURIComponent(r.id)}')">
            <td><strong>${r.name}</strong></td>
            <td>${new Date(r.timestamp).toLocaleString()}</td>
            <td>${formatDuration(r.duration)}</td>
            <td>${r.summary.total_requests.toLocaleString()}</td>
            <td>${r.summary.avg_response_time.toFixed(0)}ms</td>
            <td>${r.summary.p95_response_time.toFixed(0)}ms</td>
            <td>${r.summary.p99_response_time.toFixed(0)}ms</td>
            <td>${r.summary.requests_per_second.toFixed(1)}</td>
            <td><span class="status-badge ${r.summary.success_rate < 95 ? 'bad' : r.summary.success_rate < 99 ? 'warn' : 'good'}">${r.summary.success_rate.toFixed(1)}%</span></td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteResult('${encodeURIComponent(r.id)}', event)" title="Delete result">&#10005;</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  renderResultsInfraCharts();
}

function renderResultsInfrastructure() {
  const hosts = Object.keys(infraMetrics);
  if (!hosts.length) return '';

  return `
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h3 style="color: #00d4ff;">Live Infrastructure</h3>
        <span class="live-badge">${hosts.length} host(s)</span>
      </div>
      <div class="grid-${Math.min(hosts.length, 3)}" style="margin-top: 16px;">
        ${hosts.map(host => {
          const history = infraMetrics[host] || [];
          const latest = history[history.length - 1] || {};
          const metrics = latest.metrics || {};
          const cpu = metrics.cpu?.usage_percent ?? '-';
          const mem = metrics.memory?.usage_percent ?? '-';
          const disk = metrics.disk?.usage_percent ?? '-';
          const netIn = metrics.network?.bytes_in ?? 0;
          const netOut = metrics.network?.bytes_out ?? 0;
          const interval = latest.interval_seconds || 5;
          const netRate = (netIn + netOut) / interval;
          const lastUpdate = latest.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '-';

          return `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong>${host}</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">${lastUpdate}</span>
              </div>
              <div class="grid-4" style="gap: 8px; margin-bottom: 12px;">
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${cpu !== '-' && cpu > 80 ? '#ef4444' : cpu !== '-' && cpu > 60 ? '#eab308' : '#00d4ff'};">${typeof cpu === 'number' ? cpu.toFixed(0) : cpu}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">CPU</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${mem !== '-' && mem > 85 ? '#ef4444' : mem !== '-' && mem > 70 ? '#eab308' : '#9c40ff'};">${typeof mem === 'number' ? mem.toFixed(0) : mem}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Memory</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: ${disk !== '-' && disk > 90 ? '#ef4444' : '#22c55e'};">${typeof disk === 'number' ? disk.toFixed(0) : disk}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Disk</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 18px; font-weight: bold;">${formatBytesPerSec(netRate)}</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Net I/O</div>
                </div>
              </div>
              <div class="grid-2" style="gap: 8px;">
                <div style="height: 60px;"><canvas id="results-infra-cpu-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
                <div style="height: 60px;"><canvas id="results-infra-mem-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderResultsInfraCharts() {
  const hosts = Object.keys(infraMetrics);
  hosts.forEach(host => {
    const history = infraMetrics[host] || [];
    if (history.length < 2) return;

    const hostId = host.replace(/[^a-zA-Z0-9]/g, '_');
    const recentHistory = history.slice(-30);
    const labels = recentHistory.map((h, i) => i + 's');

    createOrUpdateChart('results-infra-cpu-' + hostId, 'line', labels, [{
      label: 'CPU',
      data: recentHistory.map(h => h.metrics?.cpu?.usage_percent ?? 0),
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0, 212, 255, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0
    }]);

    createOrUpdateChart('results-infra-mem-' + hostId, 'line', labels, [{
      label: 'Memory',
      data: recentHistory.map(h => h.metrics?.memory?.usage_percent ?? 0),
      borderColor: '#9c40ff',
      backgroundColor: 'rgba(156, 64, 255, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0
    }]);
  });
}

function renderDetailLiveInfrastructure() {
  const hosts = Object.keys(infraMetrics);
  if (!hosts.length) return '';

  return `
    <div class="card">
      <div class="card-header">
        <h3 style="color: #00d4ff;">Live Infrastructure</h3>
        <span class="live-badge">${hosts.length} host(s)</span>
      </div>
      <div class="grid-${Math.min(hosts.length, 2)}" style="margin-top: 16px;">
        ${hosts.map(host => {
          const history = infraMetrics[host] || [];
          const latest = history[history.length - 1] || {};
          const metrics = latest.metrics || {};
          const cpu = metrics.cpu?.usage_percent ?? '-';
          const mem = metrics.memory?.usage_percent ?? '-';
          const disk = metrics.disk?.usage_percent ?? '-';
          const diskUsed = metrics.disk?.used_gb ?? 0;
          const diskTotal = metrics.disk?.total_gb ?? 0;
          const netIn = metrics.network?.bytes_in ?? 0;
          const netOut = metrics.network?.bytes_out ?? 0;
          const interval = latest.interval_seconds || 5;
          const netRate = (netIn + netOut) / interval;
          const lastUpdate = latest.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '-';

          return `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong>${host}</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">${lastUpdate}</span>
              </div>
              <div class="grid-4" style="gap: 8px; margin-bottom: 12px;">
                <div style="text-align: center;">
                  <div style="font-size: 20px; font-weight: bold; color: ${cpu !== '-' && cpu > 80 ? '#ef4444' : cpu !== '-' && cpu > 60 ? '#eab308' : '#00d4ff'};">${typeof cpu === 'number' ? cpu.toFixed(0) : cpu}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">CPU</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 20px; font-weight: bold; color: ${mem !== '-' && mem > 85 ? '#ef4444' : mem !== '-' && mem > 70 ? '#eab308' : '#9c40ff'};">${typeof mem === 'number' ? mem.toFixed(0) : mem}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Memory</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 20px; font-weight: bold; color: ${disk !== '-' && disk > 90 ? '#ef4444' : '#22c55e'};">${typeof disk === 'number' ? disk.toFixed(0) : disk}%</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Disk${diskTotal ? ' (' + diskUsed.toFixed(0) + '/' + diskTotal.toFixed(0) + 'G)' : ''}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 20px; font-weight: bold;">${formatBytesPerSec(netRate)}</div>
                  <div style="font-size: 10px; color: var(--text-secondary);">Net I/O</div>
                </div>
              </div>
              <div class="grid-2" style="gap: 8px;">
                <div style="height: 80px;"><canvas id="detail-live-infra-cpu-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
                <div style="height: 80px;"><canvas id="detail-live-infra-mem-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderDetailLiveInfraCharts() {
  const hosts = Object.keys(infraMetrics);
  hosts.forEach(host => {
    const history = infraMetrics[host] || [];
    if (history.length < 2) return;

    const hostId = host.replace(/[^a-zA-Z0-9]/g, '_');
    const recentHistory = history.slice(-30);
    const labels = recentHistory.map((h, i) => i + 's');

    createOrUpdateChart('detail-live-infra-cpu-' + hostId, 'line', labels, [{
      label: 'CPU',
      data: recentHistory.map(h => h.metrics?.cpu?.usage_percent ?? 0),
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0, 212, 255, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0
    }]);

    createOrUpdateChart('detail-live-infra-mem-' + hostId, 'line', labels, [{
      label: 'Memory',
      data: recentHistory.map(h => h.metrics?.memory?.usage_percent ?? 0),
      borderColor: '#9c40ff',
      backgroundColor: 'rgba(156, 64, 255, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0
    }]);
  });
}

// Detail View - Enhanced with Report-style Charts
async function showDetail(id, skipHashUpdate = false) {
  // Update URL hash unless called from hash change handler
  if (!skipHashUpdate) {
    window.history.pushState(null, '', '#results/detail/' + id);
  }

  const res = await fetch('/api/results/' + id);
  const data = await res.json();

  if (!res.ok || !data.summary) {
    console.error('Failed to load result:', data);
    alert('Failed to load result: ' + (data.error || 'Unknown error'));
    return;
  }

  // Try to fetch infrastructure metrics from InfluxDB if not embedded in result
  if (!data.infrastructure_metrics || Object.keys(data.infrastructure_metrics).length === 0) {
    try {
      const startTime = new Date(data.timestamp);
      const endTime = new Date(startTime.getTime() + (data.duration * 1000));
      const infraRes = await fetch(`/api/infra/by-time?start=${startTime.toISOString()}&end=${endTime.toISOString()}`);
      if (infraRes.ok) {
        const infraData = await infraRes.json();
        if (infraData.infrastructure_metrics && Object.keys(infraData.infrastructure_metrics).length > 0) {
          data.infrastructure_metrics = infraData.infrastructure_metrics;
        }
      }
    } catch (e) {
      console.log('Could not fetch infra from InfluxDB:', e.message);
    }
  }

  // Store data for export functionality
  window.currentDetailData = data;

  const stepStats = data.step_statistics || [];

  document.getElementById('detailContent').innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0;">${data.name}</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer;">
          <input type="checkbox" id="includeNetworkCalls" ${(data.network_calls?.length || 0) > 0 ? 'checked' : ''}>
          Include Network Calls
        </label>
        <button onclick="exportResult('json')" class="btn btn-primary" style="font-size: 12px; padding: 6px 12px;">
          <span style="margin-right: 4px;">&#8595;</span> Export (JSON)
        </button>
        <button onclick="exportResult('csv')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
          <span style="margin-right: 4px;">&#8595;</span> Export (CSV)
        </button>
        ${data.infrastructure_metrics && Object.keys(data.infrastructure_metrics).length > 0 ? `
        <button onclick="exportInfraMetrics('json')" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;">
          <span style="margin-right: 4px;">&#128202;</span> Infra (JSON)
        </button>
        ` : ''}
      </div>
    </div>

    <!-- Summary Metrics -->
    <div class="grid-6" style="margin-bottom: 24px;">
      <div class="metric-card"><div class="value">${data.summary.total_requests.toLocaleString()}</div><div class="label">Total Requests</div></div>
      <div class="metric-card"><div class="value">${data.summary.successful_requests.toLocaleString()}</div><div class="label">Successful</div></div>
      <div class="metric-card"><div class="value" style="${data.summary.failed_requests > 0 ? 'color:#ef4444!important;-webkit-text-fill-color:#ef4444;' : ''}">${data.summary.failed_requests.toLocaleString()}</div><div class="label">Failed</div></div>
      <div class="metric-card"><div class="value">${data.summary.requests_per_second.toFixed(2)}</div><div class="label">Requests/sec</div></div>
      <div class="metric-card"><div class="value">${data.summary.avg_response_time.toFixed(0)}ms</div><div class="label">Avg Response</div></div>
      <div class="metric-card"><div class="value">${formatDuration(data.duration)}</div><div class="label">Duration</div></div>
    </div>

    <!-- Response Time Distribution -->
    <div class="card">
      <h3>Response Time Distribution</h3>
      <div class="chart-container tall"><canvas id="detail-distribution"></canvas></div>
    </div>

    <!-- Response Times Over Time (with percentiles) -->
    ${(data.timeline_data && data.timeline_data.length > 0) ? `
    <div class="card">
      <h3>Response Times Over Time</h3>
      <div class="chart-container tall"><canvas id="detail-rt-over-time"></canvas></div>
    </div>
    ` : ''}

    <!-- Throughput & VUs Over Time -->
    ${(data.timeline_data && data.timeline_data.length > 0) ? `
    <div class="grid-2">
      <div class="card expandable">${expandBtnHtml()}<h3>Throughput Over Time</h3><div class="chart-container"><canvas id="detail-throughput"></canvas></div></div>
      <div class="card expandable">${expandBtnHtml()}<h3>Active Virtual Users</h3><div class="chart-container"><canvas id="detail-vus"></canvas></div></div>
    </div>
    ` : ''}

    <!-- Errors & Status Codes Over Time -->
    ${(data.timeline_data && data.timeline_data.length > 0) ? `
    <div class="grid-2">
      <div class="card expandable">${expandBtnHtml()}<h3>Errors Over Time</h3><div class="chart-container"><canvas id="detail-errors-time"></canvas></div></div>
      <div class="card expandable">${expandBtnHtml()}<h3>Response Codes Over Time</h3><div class="chart-container"><canvas id="detail-status-codes"></canvas></div></div>
    </div>
    ` : ''}

    <!-- Latency Breakdown & Bytes Throughput -->
    ${(data.timeline_data && data.timeline_data.length > 0) ? `
    <div class="grid-2">
      <div class="card expandable">${expandBtnHtml()}<h3>Latency Breakdown</h3><div class="chart-container"><canvas id="detail-latency"></canvas></div></div>
      <div class="card expandable">${expandBtnHtml()}<h3>Bytes Throughput</h3><div class="chart-container"><canvas id="detail-bytes"></canvas></div></div>
    </div>
    ` : ''}

    <!-- Individual Response Times (colored by step) -->
    ${stepStats.length ? `
    <div class="card">
      <h3>Individual Response Times by Step</h3>
      <div class="chart-container tall"><canvas id="detail-rt-scatter"></canvas></div>
    </div>
    ` : ''}

    <!-- Throughput Charts -->
    <div class="grid-2">
      <div class="card expandable">${expandBtnHtml()}<h3>Response Time Percentiles</h3><div class="chart-container"><canvas id="detail-percentiles"></canvas></div></div>
      <div class="card expandable">${expandBtnHtml()}<h3>Success vs Failures</h3><div class="chart-container"><canvas id="detail-success"></canvas></div></div>
    </div>

    <!-- Step Performance -->
    ${stepStats.length ? `
    <div class="card">
      <h3>Step Performance Statistics</h3>
      <div class="grid-2" style="margin-bottom: 20px;">
        <div class="card expandable" style="margin-bottom: 0;">${expandBtnHtml()}<div class="chart-container tall"><canvas id="detail-step-percentiles"></canvas></div></div>
        <div class="card expandable" style="margin-bottom: 0;">${expandBtnHtml()}<div class="chart-container tall"><canvas id="detail-step-distribution"></canvas></div></div>
      </div>
      <div style="overflow-x: auto;">
        <table class="step-stats-table">
          <thead><tr>
            <th>Step Name</th><th>Scenario</th><th>Requests</th><th>Success Rate</th>
            <th>Min</th><th>Avg</th><th>P50</th><th>P90</th><th>P95</th><th>P99</th><th>Max</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${stepStats.map(s => `<tr>
              <td><strong>${s.step_name}</strong></td>
              <td>${s.scenario || '-'}</td>
              <td>${s.total_requests || 0}</td>
              <td>${(s.success_rate || 100).toFixed(1)}%</td>
              <td>${(s.min_response_time || 0).toFixed(0)}ms</td>
              <td>${(s.avg_response_time || 0).toFixed(0)}ms</td>
              <td>${(s.percentiles?.['50'] || 0).toFixed(0)}ms</td>
              <td>${(s.percentiles?.['90'] || 0).toFixed(0)}ms</td>
              <td>${(s.percentiles?.['95'] || 0).toFixed(0)}ms</td>
              <td>${(s.percentiles?.['99'] || 0).toFixed(0)}ms</td>
              <td>${(s.max_response_time || 0).toFixed(0)}ms</td>
              <td><span class="status-badge ${(s.success_rate || 100) < 90 || (s.percentiles?.['95'] || 0) >= 10000 ? 'bad' : (s.success_rate || 100) < 98 || (s.percentiles?.['95'] || 0) >= 5000 ? 'warn' : 'good'}">
                ${(s.success_rate || 100) < 90 || (s.percentiles?.['95'] || 0) >= 10000 ? 'Poor' : (s.success_rate || 100) < 98 || (s.percentiles?.['95'] || 0) >= 5000 ? 'Warn' : 'Good'}
              </span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Response Time Stats Table -->
    <div class="grid-2">
      <div class="card">
        <h3>Response Time Statistics</h3>
        <table>
          <tr><td>Minimum</td><td>${data.summary.min_response_time.toFixed(0)}ms</td></tr>
          <tr><td>Average</td><td>${data.summary.avg_response_time.toFixed(0)}ms</td></tr>
          <tr><td>Median (P50)</td><td>${data.summary.p50_response_time.toFixed(0)}ms</td></tr>
          <tr><td>P75</td><td>${data.summary.p75_response_time.toFixed(0)}ms</td></tr>
          <tr><td>P90</td><td>${data.summary.p90_response_time.toFixed(0)}ms</td></tr>
          <tr><td>P95</td><td>${data.summary.p95_response_time.toFixed(0)}ms</td></tr>
          <tr><td>P99</td><td>${data.summary.p99_response_time.toFixed(0)}ms</td></tr>
          <tr><td>Maximum</td><td>${data.summary.max_response_time.toFixed(0)}ms</td></tr>
        </table>
      </div>
      <div class="card">
        <h3>Test Summary</h3>
        <table>
          <tr><td>Duration</td><td>${formatDuration(data.duration)}</td></tr>
          <tr><td>Total Requests</td><td>${data.summary.total_requests.toLocaleString()}</td></tr>
          <tr><td>Throughput</td><td>${data.summary.requests_per_second.toFixed(2)} req/s</td></tr>
          <tr><td>Success Rate</td><td><span class="status-badge ${data.summary.success_rate < 95 ? 'bad' : data.summary.success_rate < 99 ? 'warn' : 'good'}">${data.summary.success_rate.toFixed(2)}%</span></td></tr>
          <tr><td>Error Rate</td><td><span class="status-badge ${data.summary.error_rate > 5 ? 'bad' : data.summary.error_rate > 1 ? 'warn' : 'good'}">${data.summary.error_rate.toFixed(2)}%</span></td></tr>
          <tr><td>Timestamp</td><td>${new Date(data.timestamp).toLocaleString()}</td></tr>
        </table>
      </div>
    </div>

    ${data.scenarios && data.scenarios.length ? `
    <div class="card">
      <h3>Scenarios</h3>
      <table>
        <thead><tr><th>Scenario</th><th>Requests</th><th>Avg Response</th><th>Errors</th></tr></thead>
        <tbody>
          ${data.scenarios.map(s => `<tr>
            <td>${s.name}</td>
            <td>${s.total_requests || s.requests || 0}</td>
            <td>${(s.avg_response_time || 0).toFixed(0)}ms</td>
            <td>${s.failed_requests || s.errors || 0}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Top Errors -->
    ${data.error_details && data.error_details.length > 0 ? `
    <div class="card">
      <h3 style="color: #ef4444;">Top Errors (${data.error_details.length})</h3>
      <div style="overflow-x: auto; margin-top: 12px;">
        <table class="step-stats-table">
          <thead>
            <tr>
              <th>Count</th>
              <th>Scenario</th>
              <th>Action</th>
              <th>Status</th>
              <th>Error Message</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            ${data.error_details.slice(0, 20).map(e => `
              <tr>
                <td style="color: #ef4444; font-weight: bold;">${e.count || 1}</td>
                <td>${e.scenario || '-'}</td>
                <td>${e.action || '-'}</td>
                <td>${e.status !== undefined && e.status !== null ? e.status : '-'}</td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.error || ''}">${e.error || '-'}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${e.request_url || ''}">${e.request_url || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Network Calls -->
    ${data.network_calls && data.network_calls.length > 0 ? `
    <div class="card">
      <h3 style="color: #00d4ff;">Network Calls (${data.network_calls.length})</h3>

      <!-- Network Charts -->
      <div style="background: #111827; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="color: #9ca3af; margin: 0 0 12px 0; font-size: 14px;">Network Requests Over Time</h4>
        <div style="height: 250px;"><canvas id="network-scatter-chart"></canvas></div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div style="background: #111827; border-radius: 8px; padding: 16px;">
          <h4 style="color: #9ca3af; margin: 0 0 12px 0; font-size: 14px;">Request Timeline (Duration by Request)</h4>
          <div style="height: 200px;"><canvas id="network-timeline-chart"></canvas></div>
        </div>
        <div style="background: #111827; border-radius: 8px; padding: 16px;">
          <h4 style="color: #9ca3af; margin: 0 0 12px 0; font-size: 14px;">Response Time by Endpoint</h4>
          <div style="height: 200px;"><canvas id="network-endpoint-chart"></canvas></div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div style="background: #111827; border-radius: 8px; padding: 16px;">
          <h4 style="color: #9ca3af; margin: 0 0 12px 0; font-size: 14px;">Status Code Distribution</h4>
          <div style="height: 180px;"><canvas id="network-status-chart"></canvas></div>
        </div>
        <div style="background: #111827; border-radius: 8px; padding: 16px;">
          <h4 style="color: #9ca3af; margin: 0 0 12px 0; font-size: 14px;">Request Type Distribution</h4>
          <div style="height: 180px;"><canvas id="network-type-chart"></canvas></div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <input type="text" id="network-filter" placeholder="Filter by URL, method, or status..."
               style="width: 300px; padding: 8px 12px; border: 1px solid #374151; border-radius: 6px; background: #1f2937; color: #e5e7eb;"
               onkeyup="filterNetworkCalls()">
        <select id="network-type-filter" onchange="filterNetworkCalls()"
                style="margin-left: 8px; padding: 8px 12px; border: 1px solid #374151; border-radius: 6px; background: #1f2937; color: #e5e7eb;">
          <option value="">All Types</option>
          <option value="xhr">XHR</option>
          <option value="fetch">Fetch</option>
          <option value="document">Document</option>
          <option value="script">Script</option>
          <option value="stylesheet">Stylesheet</option>
          <option value="image">Image</option>
        </select>
        <select id="network-status-filter" onchange="filterNetworkCalls()"
                style="margin-left: 8px; padding: 8px 12px; border: 1px solid #374151; border-radius: 6px; background: #1f2937; color: #e5e7eb;">
          <option value="">All Status</option>
          <option value="success">Success (2xx/3xx)</option>
          <option value="error">Errors (4xx/5xx/0)</option>
        </select>
      </div>
      <div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">
        <table class="step-stats-table" id="network-calls-table">
          <thead style="position: sticky; top: 0; background: #1f2937;">
            <tr>
              <th style="cursor: pointer;" onclick="sortNetworkTable('method')">Method <span id="sort-method"></span></th>
              <th style="cursor: pointer;" onclick="sortNetworkTable('url')">URL <span id="sort-url"></span></th>
              <th style="cursor: pointer;" onclick="sortNetworkTable('status')">Status <span id="sort-status"></span></th>
              <th style="cursor: pointer;" onclick="sortNetworkTable('type')">Type <span id="sort-type"></span></th>
              <th style="cursor: pointer;" onclick="sortNetworkTable('duration')">Duration <span id="sort-duration"></span></th>
              <th style="cursor: pointer;" onclick="sortNetworkTable('size')">Size <span id="sort-size"></span></th>
            </tr>
          </thead>
          <tbody>
            ${data.network_calls.map((c, idx) => `
              <tr class="network-row" style="cursor: pointer;" onclick="showNetworkDetail(${idx})"
                  data-method="${c.request_method || c.method || ''}"
                  data-url="${c.request_url || c.url || ''}"
                  data-type="${c.resource_type || c.type || ''}"
                  data-status="${c.response_status || c.status || 0}"
                  data-duration="${c.duration || 0}"
                  data-size="${c.response_size || c.size || 0}"
                  data-idx="${idx}">
                <td><span style="padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; background: ${(c.request_method || c.method) === 'GET' ? '#065f46' : (c.request_method || c.method) === 'POST' ? '#1e40af' : '#6b21a8'}; color: white;">${c.request_method || c.method}</span></td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.request_url || c.url || ''}">${c.request_url || c.url || '-'}</td>
                <td><span class="status-badge ${(c.response_status || c.status || 0) >= 400 || (c.response_status || c.status || 0) === 0 ? 'bad' : 'good'}">${c.response_status || c.status || 0}${c.error ? ' (' + c.error.substring(0, 20) + ')' : ''}</span></td>
                <td>${c.resource_type || c.type || '-'}</td>
                <td>${c.duration || 0}ms</td>
                <td>${c.response_size || c.size || 0}B</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Live Infrastructure -->
    ${renderDetailLiveInfrastructure()}

    <!-- Infrastructure Correlation (Historical) -->
    ${data.infrastructure_metrics && Object.keys(data.infrastructure_metrics).length > 0 ? `
    <div class="card">
      <h3 style="color: #9c40ff;">Test Infrastructure (Historical)</h3>
      <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 16px;">Server metrics captured during this test execution (${Object.keys(data.infrastructure_metrics).length} host(s))</p>
      ${Object.entries(data.infrastructure_metrics).map(([host, metrics]) => {
        const avgCpu = metrics.length > 0 ? (metrics.reduce((sum, x) => sum + (x.metrics?.cpu?.usage_percent || 0), 0) / metrics.length).toFixed(1) : '-';
        const avgMem = metrics.length > 0 ? (metrics.reduce((sum, x) => sum + (x.metrics?.memory?.usage_percent || 0), 0) / metrics.length).toFixed(1) : '-';
        const maxCpu = metrics.length > 0 ? Math.max(...metrics.map(x => x.metrics?.cpu?.usage_percent || 0)).toFixed(1) : '-';
        const maxMem = metrics.length > 0 ? Math.max(...metrics.map(x => x.metrics?.memory?.usage_percent || 0)).toFixed(1) : '-';

        return `
          <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <strong>${host}</strong>
              <span style="color: var(--text-secondary); font-size: 11px;">${metrics.length} data points</span>
            </div>
            <div class="grid-4" style="margin-bottom: 16px; gap: 12px;">
              <div class="metric-card">
                <div class="value">${avgCpu}%</div>
                <div class="label">Avg CPU</div>
              </div>
              <div class="metric-card">
                <div class="value" style="${parseFloat(maxCpu) > 80 ? 'color:#ef4444!important;-webkit-text-fill-color:#ef4444;' : ''}">${maxCpu}%</div>
                <div class="label">Max CPU</div>
              </div>
              <div class="metric-card">
                <div class="value">${avgMem}%</div>
                <div class="label">Avg Memory</div>
              </div>
              <div class="metric-card">
                <div class="value" style="${parseFloat(maxMem) > 85 ? 'color:#ef4444!important;-webkit-text-fill-color:#ef4444;' : ''}">${maxMem}%</div>
                <div class="label">Max Memory</div>
              </div>
            </div>
            <div class="grid-2" style="gap: 16px;">
              <div style="height: 150px;"><canvas id="detail-infra-cpu-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
              <div style="height: 150px;"><canvas id="detail-infra-mem-${host.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

  <!-- Network Detail Modal -->
  <div id="network-detail-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; overflow-y: auto;">
    <div style="max-width: 900px; margin: 40px auto; background: #1f2937; border-radius: 8px; border: 1px solid #374151;">
      <div style="padding: 16px 20px; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; color: #00d4ff;">Request Details</h3>
        <button onclick="closeNetworkModal()" style="background: none; border: none; color: #9ca3af; font-size: 24px; cursor: pointer;">&times;</button>
      </div>
      <div id="network-detail-content" style="padding: 20px;"></div>
    </div>
  </div>
  `;

  // Store network calls data for detail view
  window.networkCallsData = data.network_calls || [];

  // Network calls filter function
  window.filterNetworkCalls = function() {
    const filter = document.getElementById('network-filter')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('network-type-filter')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('network-status-filter')?.value || '';
    const rows = document.querySelectorAll('.network-row');
    rows.forEach(row => {
      const url = row.getAttribute('data-url')?.toLowerCase() || '';
      const type = row.getAttribute('data-type')?.toLowerCase() || '';
      const status = parseInt(row.getAttribute('data-status') || '0');
      const matchesFilter = !filter || url.includes(filter) || type.includes(filter);
      const matchesType = !typeFilter || type === typeFilter;
      const matchesStatus = !statusFilter ||
        (statusFilter === 'success' && status >= 200 && status < 400) ||
        (statusFilter === 'error' && (status >= 400 || status === 0));
      row.style.display = (matchesFilter && matchesType && matchesStatus) ? '' : 'none';
    });
  };

  // Network table sorting
  let networkSortColumn = '';
  let networkSortAsc = true;
  window.sortNetworkTable = function(column) {
    const tbody = document.querySelector('#network-calls-table tbody');
    if (!tbody) return;

    // Toggle sort direction if same column
    if (networkSortColumn === column) {
      networkSortAsc = !networkSortAsc;
    } else {
      networkSortColumn = column;
      networkSortAsc = true;
    }

    // Update sort indicators
    ['method', 'url', 'status', 'type', 'duration', 'size'].forEach(col => {
      const span = document.getElementById('sort-' + col);
      if (span) span.textContent = col === column ? (networkSortAsc ? '\u25B2' : '\u25BC') : '';
    });

    const rows = Array.from(tbody.querySelectorAll('.network-row'));
    const numericCols = ['status', 'duration', 'size'];

    rows.sort((a, b) => {
      let aVal = a.getAttribute('data-' + column) || '';
      let bVal = b.getAttribute('data-' + column) || '';

      if (numericCols.includes(column)) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
        return networkSortAsc ? aVal - bVal : bVal - aVal;
      } else {
        return networkSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
    });

    rows.forEach(row => tbody.appendChild(row));
  };

  // Show network call detail modal
  window.showNetworkDetail = function(idx) {
    const call = window.networkCallsData[idx];
    if (!call) return;

    const modal = document.getElementById('network-detail-modal');
    const content = document.getElementById('network-detail-content');
    if (!modal || !content) return;

    const method = call.request_method || call.method || 'GET';
    const url = call.request_url || call.url || '';
    const status = call.response_status || call.status || 0;
    const statusText = call.response_status_text || call.statusText || '';
    const duration = call.duration || 0;
    const reqHeaders = call.request_headers || call.requestHeaders || {};
    const reqBody = call.request_body || call.requestBody || '';
    const resHeaders = call.response_headers || call.responseHeaders || {};
    const resBody = call.response_body || call.responseBody || '';
    const error = call.error || '';

    const formatHeaders = (headers) => {
      if (!headers || Object.keys(headers).length === 0) return '<span style="color: #6b7280;">No headers captured</span>';
      return Object.entries(headers).map(([k, v]) =>
        '<div style="margin: 4px 0; word-break: break-all;"><span style="color: #00d4ff;">' + k + ':</span> <span style="color: #e5e7eb; word-break: break-all; overflow-wrap: break-word;">' + v + '</span></div>'
      ).join('');
    };

    const formatBody = (body) => {
      if (!body) return '<span style="color: #6b7280;">No body captured</span>';
      try {
        const parsed = JSON.parse(body);
        return '<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; color: #e5e7eb;">' + JSON.stringify(parsed, null, 2) + '</pre>';
      } catch {
        return '<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; color: #e5e7eb;">' + body + '</pre>';
      }
    };

    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span style="padding: 4px 10px; border-radius: 4px; font-weight: bold; background: ${method === 'GET' ? '#065f46' : method === 'POST' ? '#1e40af' : '#6b21a8'}; color: white;">${method}</span>
          <span style="color: #e5e7eb; word-break: break-all;">${url}</span>
        </div>
        <div style="display: flex; gap: 20px; color: #9ca3af;">
          <span>Status: <span class="status-badge ${status >= 400 || status === 0 ? 'bad' : 'good'}">${status} ${statusText}</span></span>
          <span>Duration: <strong style="color: #e5e7eb;">${duration}ms</strong></span>
          <span>Type: <strong style="color: #e5e7eb;">${call.resource_type || call.type || '-'}</strong></span>
        </div>
        ${error ? '<div style="margin-top: 12px; padding: 12px; background: #7f1d1d; border-radius: 6px; color: #fecaca;"><strong>Error:</strong> ' + error + '</div>' : ''}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <h4 style="color: #00d4ff; margin: 0 0 12px 0; border-bottom: 1px solid #374151; padding-bottom: 8px;">Request</h4>
          <div style="margin-bottom: 16px;">
            <h5 style="color: #9ca3af; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Headers</h5>
            <div style="background: #111827; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 200px; overflow: auto; word-break: break-all;">
              ${formatHeaders(reqHeaders)}
            </div>
          </div>
          <div>
            <h5 style="color: #9ca3af; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Body</h5>
            <div style="background: #111827; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 300px; overflow: auto; word-break: break-word;">
              ${formatBody(reqBody)}
            </div>
          </div>
        </div>

        <div>
          <h4 style="color: #22c55e; margin: 0 0 12px 0; border-bottom: 1px solid #374151; padding-bottom: 8px;">Response</h4>
          <div style="margin-bottom: 16px;">
            <h5 style="color: #9ca3af; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Headers</h5>
            <div style="background: #111827; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 200px; overflow: auto; word-break: break-word;">
              ${formatHeaders(resHeaders)}
            </div>
          </div>
          <div>
            <h5 style="color: #9ca3af; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;">Body</h5>
            <div style="background: #111827; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 300px; overflow: auto; word-break: break-word;">
              ${formatBody(resBody)}
            </div>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'block';
  };

  window.closeNetworkModal = function() {
    const modal = document.getElementById('network-detail-modal');
    if (modal) modal.style.display = 'none';
  };

  // Close modal on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.closeNetworkModal();
  });

  // Close modal on outside click
  document.getElementById('network-detail-modal')?.addEventListener('click', function(e) {
    if (e.target === this) window.closeNetworkModal();
  });

  showPanel('detail');

  setTimeout(() => {
    // Render live infrastructure charts
    renderDetailLiveInfraCharts();

    // Response Time Distribution Histogram - disable crosshair (not time-based)
    const buckets = generateHistogramBuckets(data.summary);
    new Chart(document.getElementById('detail-distribution'), {
      type: 'bar',
      data: {
        labels: buckets.labels,
        datasets: [{
          label: 'Request Count', data: buckets.values,
          backgroundColor: 'rgba(0, 212, 255, 0.6)', borderColor: 'rgba(0, 212, 255, 1)', borderWidth: 1, borderRadius: 2
        }, {
          label: 'Percentage', data: buckets.percentages, type: 'line',
          borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', yAxisID: 'y1', tension: 0.4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#9ca3af' } }, sharedCrosshair: { enabled: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Count', color: '#9ca3af' } },
          y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: '#9ca3af' }, title: { display: true, text: '%', color: '#9ca3af' } },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45 } }
        }
      }
    });

    // Percentiles Bar Chart - disable crosshair (not time-based)
    new Chart(document.getElementById('detail-percentiles'), {
      type: 'bar',
      data: {
        labels: ['Min', 'P50', 'P75', 'P90', 'P95', 'P99', 'Max'],
        datasets: [{
          data: [data.summary.min_response_time, data.summary.p50_response_time, data.summary.p75_response_time,
                 data.summary.p90_response_time, data.summary.p95_response_time, data.summary.p99_response_time,
                 data.summary.max_response_time],
          backgroundColor: ['#22c55e', '#00d4ff', '#00d4ff', '#00d4ff', '#eab308', '#ef4444', '#ef4444'],
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, sharedCrosshair: { enabled: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } }
    });

    // Success/Failure Donut - disable crosshair (not time-based)
    new Chart(document.getElementById('detail-success'), {
      type: 'doughnut',
      data: {
        labels: ['Successful', 'Failed'],
        datasets: [{ data: [data.summary.successful_requests, data.summary.failed_requests], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } }, sharedCrosshair: { enabled: false } } }
    });

    // Timeline-based charts (if timeline data exists)
    if (data.timeline_data && data.timeline_data.length > 0) {
      const timeline = data.timeline_data;
      const timeLabels = timeline.map(t => {
        const d = new Date(t.timestamp);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        const s = d.getSeconds().toString().padStart(2, '0');
        const ms = d.getMilliseconds().toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
      });
      // Store timestamps for crosshair sync
      const timelineTimestamps = timeline.map(t => new Date(t.timestamp).getTime());

      // Response Times Over Time (with percentiles)
      const rtOverTimeCtx = document.getElementById('detail-rt-over-time');
      if (rtOverTimeCtx) {
        chartTimestamps['detail-rt-over-time'] = timelineTimestamps;
        new Chart(rtOverTimeCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [
              { label: 'P50 (Median)', data: timeline.map(t => t.p50_response_time || 0), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'P90', data: timeline.map(t => t.p90_response_time || 0), borderColor: '#00d4ff', backgroundColor: 'rgba(0, 212, 255, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'P95', data: timeline.map(t => t.p95_response_time || 0), borderColor: '#eab308', backgroundColor: 'rgba(234, 179, 8, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'P99', data: timeline.map(t => t.p99_response_time || 0), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'Avg', data: timeline.map(t => t.avg_response_time || 0), borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.1)', fill: false, tension: 0.3, pointRadius: 1, borderDash: [5, 5] }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#9ca3af', usePointStyle: true } } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Response Time (ms)', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 20 } }
            }
          }
        });
      }

      // Throughput Over Time
      const throughputCtx = document.getElementById('detail-throughput');
      if (throughputCtx) {
        chartTimestamps['detail-throughput'] = timelineTimestamps;
        new Chart(throughputCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Requests/sec',
              data: timeline.map(t => t.throughput || 0),
              borderColor: '#00d4ff',
              backgroundColor: 'rgba(0, 212, 255, 0.2)',
              fill: true,
              tension: 0.3,
              pointRadius: 1
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Req/s', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }

      // Active VUs Over Time
      const vusCtx = document.getElementById('detail-vus');
      if (vusCtx) {
        chartTimestamps['detail-vus'] = timelineTimestamps;
        new Chart(vusCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Active VUs',
              data: timeline.map(t => t.active_vus || 0),
              borderColor: '#a855f7',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              fill: true,
              tension: 0.3,
              pointRadius: 1,
              stepped: 'before'
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', stepSize: 1 }, title: { display: true, text: 'VUs', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }

      // Errors Over Time
      const errorsCtx = document.getElementById('detail-errors-time');
      if (errorsCtx) {
        chartTimestamps['detail-errors-time'] = timelineTimestamps;
        new Chart(errorsCtx, {
          type: 'bar',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Errors',
              data: timeline.map(t => t.error_count || 0),
              backgroundColor: 'rgba(239, 68, 68, 0.7)',
              borderColor: '#ef4444',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', stepSize: 1 }, title: { display: true, text: 'Errors', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }

      // Response Codes Over Time (stacked area)
      const statusCodesCtx = document.getElementById('detail-status-codes');
      if (statusCodesCtx) {
        chartTimestamps['detail-status-codes'] = timelineTimestamps;
        // Collect all unique status codes
        const allStatusCodes = new Set();
        timeline.forEach(t => {
          if (t.status_codes) Object.keys(t.status_codes).forEach(code => allStatusCodes.add(parseInt(code)));
        });
        const statusCodeList = Array.from(allStatusCodes).sort((a, b) => a - b);

        // Color mapping for status codes
        const getStatusColor = (code) => {
          if (code >= 200 && code < 300) return { bg: 'rgba(34, 197, 94, 0.7)', border: '#22c55e' }; // Green for 2xx
          if (code >= 300 && code < 400) return { bg: 'rgba(59, 130, 246, 0.7)', border: '#3b82f6' }; // Blue for 3xx
          if (code >= 400 && code < 500) return { bg: 'rgba(234, 179, 8, 0.7)', border: '#eab308' }; // Yellow for 4xx
          if (code >= 500) return { bg: 'rgba(239, 68, 68, 0.7)', border: '#ef4444' }; // Red for 5xx
          return { bg: 'rgba(156, 163, 175, 0.7)', border: '#9ca3af' }; // Gray for others
        };

        const statusDatasets = statusCodeList.map(code => {
          const colors = getStatusColor(code);
          return {
            label: code.toString(),
            data: timeline.map(t => (t.status_codes && t.status_codes[code]) || 0),
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: 1,
            stack: 'status'
          };
        });

        new Chart(statusCodesCtx, {
          type: 'bar',
          data: { labels: timeLabels, datasets: statusDatasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#9ca3af', boxWidth: 12 } } },
            scales: {
              y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Requests', color: '#9ca3af' } },
              x: { stacked: true, grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }

      // Latency Breakdown (Connect Time vs TTFB vs Total)
      const latencyCtx = document.getElementById('detail-latency');
      if (latencyCtx) {
        chartTimestamps['detail-latency'] = timelineTimestamps;
        new Chart(latencyCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [
              { label: 'Connect Time', data: timeline.map(t => t.connect_time_avg || 0), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'Latency (TTFB)', data: timeline.map(t => t.latency_avg || 0), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'Total Response Time', data: timeline.map(t => t.avg_response_time || 0), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: false, tension: 0.3, pointRadius: 1 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#9ca3af', usePointStyle: true } } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Time (ms)', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }

      // Bytes Throughput
      const bytesCtx = document.getElementById('detail-bytes');
      if (bytesCtx) {
        chartTimestamps['detail-bytes'] = timelineTimestamps;
        new Chart(bytesCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [
              { label: 'Bytes Sent', data: timeline.map(t => (t.bytes_sent || 0) / 1024), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: false, tension: 0.3, pointRadius: 1 },
              { label: 'Bytes Received', data: timeline.map(t => (t.bytes_received || 0) / 1024), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: false, tension: 0.3, pointRadius: 1 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#9ca3af', usePointStyle: true } } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'KB', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45, maxTicksLimit: 15 } }
            }
          }
        });
      }
    }

    // Step Percentiles Chart (if step data exists) - disable crosshair (not time-based)
    if (stepStats.length) {
      const sortedSteps = [...stepStats].sort((a, b) => (b.percentiles?.['95'] || 0) - (a.percentiles?.['95'] || 0)).slice(0, 10);
      new Chart(document.getElementById('detail-step-percentiles'), {
        type: 'bar',
        data: {
          labels: sortedSteps.map(s => s.step_name.substring(0, 20)),
          datasets: [
            { label: 'P50', data: sortedSteps.map(s => s.percentiles?.['50'] || 0), backgroundColor: 'rgba(0, 212, 255, 0.7)' },
            { label: 'P95', data: sortedSteps.map(s => s.percentiles?.['95'] || 0), backgroundColor: 'rgba(234, 179, 8, 0.7)' },
            { label: 'P99', data: sortedSteps.map(s => s.percentiles?.['99'] || 0), backgroundColor: 'rgba(239, 68, 68, 0.7)' }
          ]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: '#9ca3af' } }, title: { display: true, text: 'Response Time Percentiles (Slowest Steps)', color: '#9ca3af' }, sharedCrosshair: { enabled: false } },
          scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'ms', color: '#9ca3af' } }, y: { grid: { display: false }, ticks: { color: '#9ca3af' } } }
        }
      });

      // Step Distribution Doughnut - disable crosshair (not time-based)
      new Chart(document.getElementById('detail-step-distribution'), {
        type: 'doughnut',
        data: {
          labels: stepStats.map(s => s.step_name.substring(0, 15)),
          datasets: [{ data: stepStats.map(s => s.total_requests || 0), backgroundColor: stepStats.map((_, i) => `hsl(${i * 137.5 % 360}, 70%, 50%)`) }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12 } }, title: { display: true, text: 'Request Distribution by Step', color: '#9ca3af' }, sharedCrosshair: { enabled: false } }
        }
      });

      // Individual Response Times Scatter Chart (colored by step)
      // Use raw results with actual timestamps if available
      const rawResults = data.raw?.results || [];

      if (rawResults.length > 0) {
        const stepColors = [
          { bg: 'rgba(34, 197, 94, 0.6)', border: '#22c55e' },   // green
          { bg: 'rgba(59, 130, 246, 0.6)', border: '#3b82f6' },  // blue
          { bg: 'rgba(168, 85, 247, 0.6)', border: '#a855f7' },  // purple
          { bg: 'rgba(245, 158, 11, 0.6)', border: '#f59e0b' },  // amber
          { bg: 'rgba(236, 72, 153, 0.6)', border: '#ec4899' },  // pink
          { bg: 'rgba(20, 184, 166, 0.6)', border: '#14b8a6' },  // teal
          { bg: 'rgba(99, 102, 241, 0.6)', border: '#6366f1' },  // indigo
          { bg: 'rgba(249, 115, 22, 0.6)', border: '#f97316' },  // orange
        ];

        // Sample if too many results (limit to 2000 total)
        let resultsToPlot = rawResults;
        if (resultsToPlot.length > 2000) {
          const sampleStep = Math.ceil(resultsToPlot.length / 2000);
          resultsToPlot = resultsToPlot.filter((_, i) => i % sampleStep === 0);
        }

        // Find test start time
        const startTime = Math.min(...resultsToPlot.map(r => r.timestamp || 0));

        // Helper to format timestamp as hh:mm:ss.mmm
        const formatTimeMs = (ts) => {
          const d = new Date(ts);
          const h = d.getHours().toString().padStart(2, '0');
          const m = d.getMinutes().toString().padStart(2, '0');
          const s = d.getSeconds().toString().padStart(2, '0');
          const ms = d.getMilliseconds().toString().padStart(3, '0');
          return `${h}:${m}:${s}.${ms}`;
        };

        // Group results by step name
        const stepGroups = {};
        const failedData = [];

        resultsToPlot.forEach(r => {
          const rt = r.duration || r.response_time || 0;
          const ts = r.timestamp || 0;
          const point = { x: ts, y: rt, timestamp: ts };

          if (r.success === false) {
            failedData.push(point);
          } else {
            const stepName = r.step_name || r.action || 'unknown';
            if (!stepGroups[stepName]) stepGroups[stepName] = [];
            stepGroups[stepName].push(point);
          }
        });

        // Create datasets for each step
        const stepNames = Object.keys(stepGroups);
        const scatterDatasets = stepNames.map((name, i) => {
          const colors = stepColors[i % stepColors.length];
          return {
            label: name.substring(0, 20),
            data: stepGroups[name],
            backgroundColor: colors.bg,
            borderColor: colors.border,
            pointRadius: 2
          };
        });

        // Add failed requests as separate dataset (always red)
        if (failedData.length > 0) {
          scatterDatasets.push({
            label: 'Failed',
            data: failedData,
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderColor: '#ef4444',
            pointRadius: 3
          });
        }

        if (scatterDatasets.length > 0) {
          createScatterChart('detail-rt-scatter', scatterDatasets, startTime, formatTimeMs);
        }
      }
    }

    // Network Charts
    if (data.network_calls && data.network_calls.length > 0) {
      const networkCalls = data.network_calls;

      // Helper to format timestamp as hh:mm:ss.mmm
      const formatNetworkTime = (ts) => {
        const d = new Date(ts);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        const s = d.getSeconds().toString().padStart(2, '0');
        const ms = d.getMilliseconds().toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
      };

      // 0. Scatter Chart - Each request as a dot over time
      const scatterCtx = document.getElementById('network-scatter-chart');
      if (scatterCtx) {
        // Group by resource type for different colors
        const typeGroups = {};
        const failedPoints = [];

        networkCalls.forEach(c => {
          const ts = c.timestamp || c.start_time || 0;
          const duration = c.duration || 0;
          const status = c.response_status || c.status || 0;
          const type = (c.resource_type || c.type || 'other').toLowerCase();
          const url = c.request_url || c.url || '';

          const point = {
            x: ts,  // Store actual timestamp
            y: duration,
            url: url,
            status: status,
            type: type,
            timestamp: ts
          };

          if (status === 0 || status >= 400) {
            failedPoints.push(point);
          } else {
            if (!typeGroups[type]) typeGroups[type] = [];
            typeGroups[type].push(point);
          }
        });

        const typeColors = {
          'xhr': { bg: 'rgba(0, 212, 255, 0.6)', border: '#00d4ff' },
          'fetch': { bg: 'rgba(34, 197, 94, 0.6)', border: '#22c55e' },
          'document': { bg: 'rgba(168, 85, 247, 0.6)', border: '#a855f7' },
          'script': { bg: 'rgba(245, 158, 11, 0.6)', border: '#f59e0b' },
          'stylesheet': { bg: 'rgba(236, 72, 153, 0.6)', border: '#ec4899' },
          'image': { bg: 'rgba(20, 184, 166, 0.6)', border: '#14b8a6' },
          'font': { bg: 'rgba(99, 102, 241, 0.6)', border: '#6366f1' },
          'other': { bg: 'rgba(156, 163, 175, 0.6)', border: '#9ca3af' }
        };

        const scatterDatasets = Object.entries(typeGroups).map(([type, points]) => {
          const colors = typeColors[type] || typeColors['other'];
          return {
            label: type.toUpperCase(),
            data: points,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            pointRadius: 4,
            pointHoverRadius: 6
          };
        });

        // Add failed requests as red dots
        if (failedPoints.length > 0) {
          scatterDatasets.push({
            label: 'Failed/Error',
            data: failedPoints,
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderColor: '#ef4444',
            pointRadius: 5,
            pointHoverRadius: 7
          });
        }

        new Chart(scatterCtx, {
          type: 'scatter',
          data: { datasets: scatterDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { color: '#9ca3af', boxWidth: 12, padding: 15 } },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const point = items[0].raw;
                    const url = point.url || '';
                    return url.length > 70 ? url.substring(0, 70) + '...' : url;
                  },
                  label: (item) => {
                    const point = item.raw;
                    return `Duration: ${point.y}ms | Status: ${point.status} | Time: ${formatNetworkTime(point.x)}`;
                  }
                }
              }
            },
            scales: {
              x: {
                type: 'linear',
                position: 'bottom',
                title: { display: true, text: 'Time', color: '#9ca3af' },
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: {
                  color: '#9ca3af',
                  maxTicksLimit: 10,
                  callback: function(value) {
                    return formatNetworkTime(value);
                  }
                }
              },
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Duration (ms)', color: '#9ca3af' },
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#9ca3af' }
              }
            }
          }
        });
      }

      // 1. Timeline Chart - Duration by request order
      const timelineCtx = document.getElementById('network-timeline-chart');
      if (timelineCtx) {
        const timelineData = networkCalls.slice(0, 50).map((c, i) => ({
          x: i,
          y: c.duration || 0,
          url: c.request_url || c.url || '',
          status: c.response_status || c.status || 0
        }));

        new Chart(timelineCtx, {
          type: 'bar',
          data: {
            labels: timelineData.map((_, i) => '#' + (i + 1)),
            datasets: [{
              label: 'Duration (ms)',
              data: timelineData.map(d => d.y),
              backgroundColor: timelineData.map(d =>
                d.status >= 400 || d.status === 0 ? 'rgba(239, 68, 68, 0.7)' :
                d.status >= 300 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(0, 212, 255, 0.7)'
              ),
              borderRadius: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const idx = items[0].dataIndex;
                    const url = timelineData[idx].url;
                    return url.length > 60 ? url.substring(0, 60) + '...' : url;
                  },
                  label: (item) => {
                    const idx = item.dataIndex;
                    return 'Duration: ' + timelineData[idx].y + 'ms (Status: ' + timelineData[idx].status + ')';
                  }
                }
              }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'ms', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 0 } }
            }
          }
        });
      }

      // 2. Endpoint Response Time Chart - Avg duration by endpoint
      const endpointCtx = document.getElementById('network-endpoint-chart');
      if (endpointCtx) {
        const endpointStats = {};
        networkCalls.forEach(c => {
          const url = c.request_url || c.url || '';
          try {
            const pathname = new URL(url).pathname;
            if (!endpointStats[pathname]) endpointStats[pathname] = { total: 0, count: 0 };
            endpointStats[pathname].total += (c.duration || 0);
            endpointStats[pathname].count++;
          } catch { /* ignore invalid URLs */ }
        });

        const endpoints = Object.entries(endpointStats)
          .map(([path, stats]) => ({ path, avg: stats.total / stats.count, count: stats.count }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 10);

        new Chart(endpointCtx, {
          type: 'bar',
          data: {
            labels: endpoints.map(e => e.path.length > 25 ? '...' + e.path.slice(-22) : e.path),
            datasets: [{
              label: 'Avg Duration (ms)',
              data: endpoints.map(e => e.avg.toFixed(0)),
              backgroundColor: 'rgba(34, 197, 94, 0.7)',
              borderRadius: 2
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => endpoints[items[0].dataIndex].path,
                  label: (item) => 'Avg: ' + item.raw + 'ms (' + endpoints[item.dataIndex].count + ' calls)'
                }
              }
            },
            scales: {
              x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
              y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
            }
          }
        });
      }

      // 3. Status Code Distribution
      const statusCtx = document.getElementById('network-status-chart');
      if (statusCtx) {
        const statusCounts = {};
        networkCalls.forEach(c => {
          const status = c.response_status || c.status || 0;
          const category = status === 0 ? 'Failed' :
                          status < 300 ? '2xx Success' :
                          status < 400 ? '3xx Redirect' :
                          status < 500 ? '4xx Client Error' : '5xx Server Error';
          statusCounts[category] = (statusCounts[category] || 0) + 1;
        });

        const statusLabels = Object.keys(statusCounts);
        const statusColors = statusLabels.map(s =>
          s.includes('Success') ? '#22c55e' :
          s.includes('Redirect') ? '#eab308' :
          s.includes('Client') ? '#f97316' :
          s.includes('Server') ? '#ef4444' : '#6b7280'
        );

        new Chart(statusCtx, {
          type: 'doughnut',
          data: {
            labels: statusLabels,
            datasets: [{ data: Object.values(statusCounts), backgroundColor: statusColors, borderWidth: 0 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12, padding: 8 } } }
          }
        });
      }

      // 4. Request Type Distribution
      const typeCtx = document.getElementById('network-type-chart');
      if (typeCtx) {
        const typeCounts = {};
        networkCalls.forEach(c => {
          const type = (c.resource_type || c.type || 'other').toLowerCase();
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        const typeLabels = Object.keys(typeCounts);
        const typeColors = ['#00d4ff', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#f97316'];

        new Chart(typeCtx, {
          type: 'doughnut',
          data: {
            labels: typeLabels,
            datasets: [{ data: Object.values(typeCounts), backgroundColor: typeColors.slice(0, typeLabels.length), borderWidth: 0 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12, padding: 8 } } }
          }
        });
      }
    }

    // Infrastructure Correlation Charts
    if (data.infrastructure_metrics && Object.keys(data.infrastructure_metrics).length > 0) {
      Object.entries(data.infrastructure_metrics).forEach(([host, metrics]) => {
        if (!metrics || metrics.length < 2) return;

        const hostId = host.replace(/[^a-zA-Z0-9]/g, '_');
        const labels = metrics.map((h, i) => {
          const elapsed = i * (h.interval_seconds || 5);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          return mins > 0 ? mins + 'm' + secs + 's' : secs + 's';
        });

        // CPU Chart
        const cpuCtx = document.getElementById('detail-infra-cpu-' + hostId);
        if (cpuCtx) {
          new Chart(cpuCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: 'CPU %',
                data: metrics.map(h => h.metrics?.cpu?.usage_percent ?? 0),
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                fill: true,
                tension: 0.3
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                x: { grid: { display: false }, ticks: { color: '#9ca3af', maxTicksLimit: 10 } }
              }
            }
          });
        }

        // Memory Chart
        const memCtx = document.getElementById('detail-infra-mem-' + hostId);
        if (memCtx) {
          new Chart(memCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: 'Memory %',
                data: metrics.map(h => h.metrics?.memory?.usage_percent ?? 0),
                borderColor: '#9c40ff',
                backgroundColor: 'rgba(156, 64, 255, 0.1)',
                fill: true,
                tension: 0.3
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                x: { grid: { display: false }, ticks: { color: '#9ca3af', maxTicksLimit: 10 } }
              }
            }
          });
        }
      });
    }
  }, 100);
}

function generateHistogramBuckets(summary) {
  const max = summary.max_response_time || 1000;
  const bucketCount = 15;
  const bucketSize = Math.ceil(max / bucketCount);
  const labels = [], values = [], percentages = [];
  const total = summary.total_requests || 1;

  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = (i + 1) * bucketSize;
    labels.push(start + '-' + end + 'ms');

    // Estimate distribution based on percentiles
    const mid = (start + end) / 2;
    let count = 0;
    if (mid <= summary.p50_response_time) count = Math.floor(total * 0.5 / (bucketCount / 2));
    else if (mid <= summary.p75_response_time) count = Math.floor(total * 0.25 / (bucketCount / 4));
    else if (mid <= summary.p90_response_time) count = Math.floor(total * 0.15 / (bucketCount / 6));
    else if (mid <= summary.p95_response_time) count = Math.floor(total * 0.05 / (bucketCount / 10));
    else if (mid <= summary.p99_response_time) count = Math.floor(total * 0.04 / (bucketCount / 10));
    else count = Math.floor(total * 0.01 / (bucketCount / 15));

    values.push(Math.max(0, count));
    percentages.push((count / total * 100).toFixed(1));
  }
  return { labels, values, percentages };
}

// Compare
function renderCompareSelect() {
  const container = document.getElementById('compareSelectContainer');
  if (!results.length) {
    container.innerHTML = '<p style="color: var(--text-secondary);">No results available</p>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th style="width:40px;"></th><th>Test Name</th><th>Date</th><th>Avg Response</th><th>P95</th><th>RPS</th></tr></thead>
      <tbody>
        ${results.map(r => `<tr>
          <td><input type="checkbox" ${selectedForCompare.has(r.id) ? 'checked' : ''} onchange="toggleCompare('${r.id}')"></td>
          <td>${r.name}</td>
          <td>${new Date(r.timestamp).toLocaleString()}</td>
          <td>${r.summary.avg_response_time.toFixed(0)}ms</td>
          <td>${r.summary.p95_response_time.toFixed(0)}ms</td>
          <td>${r.summary.requests_per_second.toFixed(1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

function toggleCompare(id) {
  if (selectedForCompare.has(id)) {
    selectedForCompare.delete(id);
  } else {
    selectedForCompare.add(id);
  }
  document.getElementById('compareBtn').disabled = selectedForCompare.size < 2;
  renderCompareSelect();
}

async function runComparison() {
  const ids = Array.from(selectedForCompare);
  const res = await fetch('/api/compare?ids=' + ids.join(','));
  const data = await res.json();
  renderComparison(data);
}

function renderComparison(data) {
  const container = document.getElementById('comparisonResults');
  if (!data.comparison) { container.innerHTML = '<div class="empty-state"><h3>Cannot compare</h3></div>'; return; }

  const { baseline, comparisons, stepComparisons, timelineComparisons } = data.comparison;
  const allResults = data.results;
  const colors = ['#00d4ff', '#9c40ff', '#22c55e', '#eab308', '#ef4444', '#f97316', '#8b5cf6', '#06b6d4'];

  // Build step comparison HTML
  let stepCompareHtml = '';
  if (stepComparisons && stepComparisons.length > 0) {
    stepCompareHtml = `
      <div class="card">
        <h3>Per-Request Comparison</h3>
        <div style="overflow-x: auto;">
          <table class="step-stats-table">
            <thead>
              <tr>
                <th>Request/Step</th>
                ${allResults.map(r => '<th colspan="3" style="text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);">' + r.name.substring(0, 20) + '</th>').join('')}
              </tr>
              <tr>
                <th></th>
                ${allResults.map(() => '<th>Avg RT</th><th>P95</th><th>Success</th>').join('')}
              </tr>
            </thead>
            <tbody>
              ${stepComparisons.map((step) => `
                <tr>
                  <td><strong>${step.step_name}</strong></td>
                  ${step.results.map((r, i) => {
                    if (!r) return '<td colspan="3" style="color:#6b7280;">N/A</td>';
                    const diff = i > 0 && step.diffs ? step.diffs[i-1] : null;
                    return `
                      <td>${r.avg_response_time?.toFixed(0) || 0}ms ${diff ? diffBadge(diff.avg_response_time) : (i === 0 ? '<span style="font-size:9px;color:#6b7280;">(base)</span>' : '')}</td>
                      <td>${r.p95?.toFixed(0) || 0}ms ${diff ? diffBadge(diff.p95) : ''}</td>
                      <td><span class="status-badge ${r.success_rate < 95 ? 'bad' : r.success_rate < 99 ? 'warn' : 'good'}">${(r.success_rate || 0).toFixed(1)}%</span></td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Build timeline chart section
  const hasTimeline = timelineComparisons && timelineComparisons.some(t => t.timeline && t.timeline.length > 0);

  container.innerHTML = `
    <div class="card">
      <h3>Comparison: ${allResults.length} Test Runs</h3>
      <p style="color: var(--text-secondary); margin-bottom: 20px;">Baseline: ${baseline.name} (${new Date(baseline.timestamp).toLocaleString()})</p>

      <div class="grid-2" style="margin-bottom: 20px;">
        <div class="card" style="margin-bottom: 0;"><h3>Average Response Times</h3><div class="chart-container tall"><canvas id="compare-rt"></canvas></div></div>
        <div class="card" style="margin-bottom: 0;"><h3>Percentiles Comparison</h3><div class="chart-container tall"><canvas id="compare-percentiles"></canvas></div></div>
      </div>
      <div class="grid-2" style="margin-bottom: 20px;">
        <div class="card" style="margin-bottom: 0;"><h3>Throughput</h3><div class="chart-container"><canvas id="compare-rps"></canvas></div></div>
        <div class="card" style="margin-bottom: 0;"><h3>Error Rates</h3><div class="chart-container"><canvas id="compare-errors"></canvas></div></div>
      </div>

      ${hasTimeline ? `
      <div class="card" style="margin-bottom: 20px;">
        <h3>Response Time Over Time</h3>
        <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">Line graph comparing response times throughout each test run</p>
        <div class="chart-container" style="height: 350px;"><canvas id="compare-timeline"></canvas></div>
      </div>
      ` : ''}
    </div>

    <div class="card">
      <h3>Overall Metrics Comparison</h3>
      <div style="overflow-x: auto;">
        <table>
          <thead><tr><th>Metric</th>${allResults.map(r => '<th>' + r.name.substring(0, 25) + '</th>').join('')}</tr></thead>
          <tbody>
            <tr><td>Avg Response</td>${allResults.map((r, i) => '<td>' + r.summary.avg_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.avg_response_time) : '<span style="font-size:10px;color:#9ca3af;">(baseline)</span>') + '</td>').join('')}</tr>
            <tr><td>P50</td>${allResults.map((r, i) => '<td>' + r.summary.p50_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p50_response_time) : '') + '</td>').join('')}</tr>
            <tr><td>P90</td>${allResults.map(r => '<td>' + r.summary.p90_response_time.toFixed(0) + 'ms</td>').join('')}</tr>
            <tr><td>P95</td>${allResults.map((r, i) => '<td>' + r.summary.p95_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p95_response_time) : '') + '</td>').join('')}</tr>
            <tr><td>P99</td>${allResults.map((r, i) => '<td>' + r.summary.p99_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p99_response_time) : '') + '</td>').join('')}</tr>
            <tr><td>Throughput</td>${allResults.map((r, i) => '<td>' + r.summary.requests_per_second.toFixed(1) + ' req/s ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.requests_per_second, true) : '') + '</td>').join('')}</tr>
            <tr><td>Error Rate</td>${allResults.map(r => '<td><span class="status-badge ' + (r.summary.error_rate > 5 ? 'bad' : r.summary.error_rate > 1 ? 'warn' : 'good') + '">' + r.summary.error_rate.toFixed(2) + '%</span></td>').join('')}</tr>
            <tr><td>Total Requests</td>${allResults.map(r => '<td>' + (r.summary.total_requests || 0).toLocaleString() + '</td>').join('')}</tr>
            <tr><td>Duration</td>${allResults.map(r => '<td>' + (r.summary.total_duration || 0).toFixed(1) + 's</td>').join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>

    ${stepCompareHtml}
  `;

  setTimeout(() => {
    const labels = allResults.map(r => r.name.substring(0, 15));

    new Chart(document.getElementById('compare-rt'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Avg Response (ms)', data: allResults.map(r => r.summary.avg_response_time), backgroundColor: colors.slice(0, allResults.length), borderRadius: 4 }] },
      options: chartOptions('ms')
    });

    new Chart(document.getElementById('compare-percentiles'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'P50', data: allResults.map(r => r.summary.p50_response_time), backgroundColor: '#22c55e' },
          { label: 'P90', data: allResults.map(r => r.summary.p90_response_time), backgroundColor: '#00d4ff' },
          { label: 'P95', data: allResults.map(r => r.summary.p95_response_time), backgroundColor: '#eab308' },
          { label: 'P99', data: allResults.map(r => r.summary.p99_response_time), backgroundColor: '#ef4444' }
        ]
      },
      options: chartOptions('ms')
    });

    new Chart(document.getElementById('compare-rps'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Requests/sec', data: allResults.map(r => r.summary.requests_per_second), backgroundColor: colors.slice(0, allResults.length), borderRadius: 4 }] },
      options: chartOptions('req/s')
    });

    new Chart(document.getElementById('compare-errors'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Error Rate (%)', data: allResults.map(r => r.summary.error_rate), backgroundColor: allResults.map(r => r.summary.error_rate > 5 ? '#ef4444' : r.summary.error_rate > 1 ? '#eab308' : '#22c55e'), borderRadius: 4 }] },
      options: chartOptions('%')
    });

    // Timeline line chart
    if (hasTimeline) {
      const timelineDatasets = timelineComparisons.map((tc, idx) => {
        const timeline = tc.timeline || [];
        // Normalize to elapsed seconds from start
        const startTime = timeline.length > 0 ? timeline[0].timestamp : 0;
        return {
          label: tc.name.substring(0, 20),
          data: timeline.map(t => ({ x: (t.timestamp - startTime) / 1000, y: t.avg_response_time || t.p95 || 0 })),
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length] + '33',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2
        };
      });

      new Chart(document.getElementById('compare-timeline'), {
        type: 'line',
        data: { datasets: timelineDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9ca3af', usePointStyle: true } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(0) + 'ms' } },
            sharedCrosshair: { enabled: false }
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Elapsed Time (seconds)', color: '#9ca3af' },
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { color: '#9ca3af' }
            },
            y: {
              title: { display: true, text: 'Response Time (ms)', color: '#9ca3af' },
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { color: '#9ca3af', callback: v => v + ' ms' }
            }
          }
        }
      });
    }
  }, 100);
}

function diffBadge(diff, higherIsBetter = false) {
  if (!diff) return '';
  const improved = higherIsBetter ? parseFloat(diff.change) > 0 : parseFloat(diff.change) < 0;
  return '<span style="font-size:11px;color:' + (improved ? '#22c55e' : '#ef4444') + ';">' + (parseFloat(diff.change) > 0 ? '+' : '') + diff.change + '</span>';
}

function chartOptions(unit) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } }, sharedCrosshair: { enabled: false } },
    scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', callback: v => v + (unit ? ' ' + unit : '') } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } }
  };
}

// Scatter chart helper for response times
// Optional: startTime and formatFn for time-based x-axis formatting
function createScatterChart(id, datasets, startTime, formatFn) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  // If chart exists but canvas was recreated (DOM rebuild), destroy old chart
  if (charts[id] && charts[id].canvas !== canvas) {
    charts[id].destroy();
    delete charts[id];
  }

  // Default time formatter (hh:mm:ss.mmm)
  const defaultFormatTime = (ts) => {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  };

  const formatter = formatFn || defaultFormatTime;
  const useTimeAxis = startTime !== undefined;

  if (charts[id]) {
    charts[id].data.datasets = datasets;
    charts[id].update('none');
  } else {
    charts[id] = new Chart(canvas, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#9ca3af', boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const point = ctx.raw;
                const timeStr = useTimeAxis ? formatter(point.x) : point.x.toFixed(2) + 's';
                return `${ctx.dataset.label}: ${point.y.toFixed(0)}ms @ ${timeStr}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9ca3af' },
            title: { display: true, text: 'Response Time (ms)', color: '#9ca3af' }
          },
          x: {
            type: useTimeAxis ? 'linear' : 'linear',
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#9ca3af',
              maxTicksLimit: 12,
              callback: function(value) {
                if (useTimeAxis) {
                  return formatter(value);
                }
                return value.toFixed(1) + 's';
              }
            },
            title: { display: true, text: 'Time', color: '#9ca3af' }
          }
        }
      }
    });
  }
}

// Chart helper
function createOrUpdateChart(id, type, labels, datasets, timestamps) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  // Store timestamps for crosshair sync if provided
  if (timestamps) {
    chartTimestamps[id] = timestamps;
  }

  // If chart exists but canvas was recreated (DOM rebuild), destroy old chart
  if (charts[id] && charts[id].canvas !== canvas) {
    charts[id].destroy();
    delete charts[id];
  }

  // Check if this is a multi-line chart (response time with percentiles)
  const showLegend = datasets.length > 1;

  if (charts[id]) {
    charts[id].data.labels = labels;
    charts[id].data.datasets = datasets;
    charts[id].update('none');
  } else {
    charts[id] = new Chart(canvas, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: showLegend,
            position: 'top',
            labels: { color: '#9ca3af', boxWidth: 12, padding: 8, font: { size: 11 } }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
          x: { display: true, grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
        }
      }
    });
  }
}

// Tabs and URL routing
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      // Update URL hash
      window.location.hash = tabName;
    });
  });

  // Handle browser back/forward
  window.addEventListener('hashchange', handleHashChange);

  // Handle initial hash on page load
  handleHashChange();
}

function handleHashChange() {
  let hash = window.location.hash.slice(1); // Remove #

  // Handle detail view routes like #results/detail/abc123
  if (hash.startsWith('results/detail/')) {
    const resultId = hash.replace('results/detail/', '');
    showPanel('results');
    // Load the detail view after a short delay to ensure panel is visible
    setTimeout(() => showDetail(resultId, true), 100);
    return;
  }

  // Default to 'tests' if no valid hash
  const validPanels = ['tests', 'live', 'infra', 'results', 'compare'];
  if (!validPanels.includes(hash)) {
    hash = 'tests';
    window.history.replaceState(null, '', '#' + hash);
  }

  showPanel(hash);
}

function showPanel(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === name));
}

// Helpers
function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'm';
}

// Infrastructure Export/Import Functions
async function exportInfraMetrics(format) {
  const data = window.currentDetailData;
  if (!data || !data.infrastructure_metrics) {
    alert('No infrastructure metrics available to export');
    return;
  }

  const startTime = new Date(data.timestamp);
  const endTime = new Date(startTime.getTime() + (data.duration * 1000));

  try {
    const url = `/api/infra/export?format=${format}&start=${startTime.toISOString()}&end=${endTime.toISOString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const filename = `infra-${data.name}-${new Date(data.timestamp).toISOString().slice(0, 10)}.${format}`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert('Failed to export: ' + e.message);
  }
}

async function importInfraMetrics(format) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = format === 'csv' ? '.csv' : '.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const content = await file.text();
      const res = await fetch(`/api/infra/import?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': format === 'csv' ? 'text/csv' : 'application/json' },
        body: content
      });

      if (!res.ok) throw new Error('Import failed');
      const result = await res.json();
      alert(`Successfully imported ${result.imported} metrics records`);

      // Refresh infrastructure view if visible
      if (document.getElementById('infra')?.classList.contains('active')) {
        loadInfrastructure();
      }
    } catch (e) {
      alert('Failed to import: ' + e.message);
    }
  };

  input.click();
}

async function exportAllInfra(format) {
  try {
    const res = await fetch(`/api/infra/export?format=${format}`);
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const filename = `infra-all-${new Date().toISOString().slice(0, 10)}.${format}`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert('Failed to export: ' + e.message);
  }
}

// Result Export/Import Functions
async function exportResult(format) {
  const data = window.currentDetailData;
  if (!data) {
    alert('No result data available to export');
    return;
  }

  try {
    const includeNetworkCalls = document.getElementById('includeNetworkCalls')?.checked || false;
    const params = new URLSearchParams({ format });
    if (includeNetworkCalls) {
      params.set('includeNetworkCalls', 'true');
    }

    const res = await fetch(`/api/results/${encodeURIComponent(data.id)}/export?${params}`);
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const timestamp = new Date(data.timestamp).toISOString().slice(0, 10);
    const filename = `${data.name}-${timestamp}.${format}`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert('Failed to export: ' + e.message);
  }
}

function importResult() {
  document.getElementById('importFileInput').click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const content = await file.text();
    const res = await fetch('/api/results/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: content
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Import failed');
    }

    const result = await res.json();
    alert(`Successfully imported result: ${result.name}`);

    // Refresh results list
    loadResults();

    // Show the imported result
    if (result.id) {
      showDetail(encodeURIComponent(result.id));
    }
  } catch (e) {
    alert('Failed to import: ' + e.message);
  } finally {
    // Reset file input
    event.target.value = '';
  }
}

// Chart modal state
let chartModal = null;
let modalChart = null;
let modalSourceCanvasId = null;
let modalUpdateInterval = null;

// Create modal element if it doesn't exist
function getChartModal() {
  if (!chartModal) {
    chartModal = document.createElement('div');
    chartModal.className = 'chart-modal-overlay';
    chartModal.innerHTML = `
      <div class="chart-modal">
        <div class="chart-modal-header">
          <h3 class="chart-modal-title"></h3>
          <button class="chart-modal-close" onclick="closeChartModal()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="chart-modal-body">
          <div class="chart-container">
            <canvas id="modal-chart-canvas"></canvas>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(chartModal);

    // Close on overlay click
    chartModal.addEventListener('click', (e) => {
      if (e.target === chartModal) closeChartModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chartModal.classList.contains('active')) {
        closeChartModal();
      }
    });
  }
  return chartModal;
}

// Sync modal chart with source chart data
function syncModalChart() {
  if (!modalChart || !modalSourceCanvasId) return;

  const sourceCanvas = document.getElementById(modalSourceCanvasId);
  if (!sourceCanvas) return;

  const sourceChart = Chart.getChart(sourceCanvas);
  if (!sourceChart) return;

  // Update modal chart data from source
  modalChart.data.labels = [...sourceChart.data.labels];
  modalChart.data.datasets = sourceChart.data.datasets.map(ds => ({
    ...ds,
    data: [...ds.data]
  }));
  modalChart.update('none');
}

// Open chart in modal
function toggleChartExpand(btn) {
  const card = btn.closest('.card.expandable');
  if (!card) return;

  const canvas = card.querySelector('canvas');
  if (!canvas) return;

  const originalChart = Chart.getChart(canvas);
  if (!originalChart) return;

  // Store source canvas ID for live updates
  modalSourceCanvasId = canvas.id;

  // Get chart title from card
  const titleEl = card.querySelector('h3, h4');
  const title = titleEl ? titleEl.textContent : 'Chart';

  // Open modal
  const modal = getChartModal();
  modal.querySelector('.chart-modal-title').textContent = title;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Destroy previous modal chart if exists
  if (modalChart) {
    modalChart.destroy();
    modalChart = null;
  }

  // Clear previous update interval
  if (modalUpdateInterval) {
    clearInterval(modalUpdateInterval);
    modalUpdateInterval = null;
  }

  // Clone the chart configuration
  const modalCanvas = document.getElementById('modal-chart-canvas');
  const config = originalChart.config;

  // Deep clone the config to avoid mutating the original
  const clonedConfig = {
    type: config.type,
    data: JSON.parse(JSON.stringify(config.data)),
    options: JSON.parse(JSON.stringify(config.options || {}))
  };

  // Ensure responsive options
  clonedConfig.options.responsive = true;
  clonedConfig.options.maintainAspectRatio = false;

  // Create chart in modal
  requestAnimationFrame(() => {
    modalChart = new Chart(modalCanvas, clonedConfig);

    // Start live update interval (sync every 1 second)
    modalUpdateInterval = setInterval(syncModalChart, 1000);
  });
}

// Close chart modal
function closeChartModal() {
  if (chartModal) {
    chartModal.classList.remove('active');
    document.body.style.overflow = '';

    // Clear update interval
    if (modalUpdateInterval) {
      clearInterval(modalUpdateInterval);
      modalUpdateInterval = null;
    }

    modalSourceCanvasId = null;

    // Destroy modal chart after transition
    setTimeout(() => {
      if (modalChart) {
        modalChart.destroy();
        modalChart = null;
      }
    }, 200);
  }
}

// Helper to create expand button HTML
function expandBtnHtml() {
  return '<button class="expand-btn" onclick="toggleChartExpand(this)" title="Toggle full width"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>';
}

// Export functions for onclick handlers
window.runTestByIndex = runTestByIndex;
window.stopTest = stopTest;
window.deleteResult = deleteResult;
window.toggleCompare = toggleCompare;
window.exportInfraMetrics = exportInfraMetrics;
window.importInfraMetrics = importInfraMetrics;
window.exportAllInfra = exportAllInfra;
window.exportResult = exportResult;
window.importResult = importResult;
window.handleImportFile = handleImportFile;
window.toggleChartExpand = toggleChartExpand;

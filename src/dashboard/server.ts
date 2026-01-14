import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

interface DashboardOptions {
  port: number;
  resultsDir: string;
  testsDir?: string;
  workersFile?: string;
}

interface TestResult {
  id: string;
  name: string;
  timestamp: string;
  duration: number;
  summary: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time: number;
    min_response_time: number;
    max_response_time: number;
    p50_response_time: number;
    p75_response_time: number;
    p90_response_time: number;
    p95_response_time: number;
    p99_response_time: number;
    requests_per_second: number;
    error_rate: number;
    success_rate: number;
  };
  scenarios: any[];
  step_statistics?: any[];
  timeline_data?: any[];
  vu_ramp_up?: any[];
  response_time_distribution?: any[];
  timeseries?: any[];
  error_details?: {
    scenario: string;
    action: string;
    status?: number;
    error: string;
    request_url?: string;
    count: number;
  }[];
  raw?: any;
}

interface TestFile {
  name: string;
  path: string;
  relativePath: string;
  type: 'api' | 'web' | 'mixed';
  lastModified: string;
}

interface LiveTest {
  id: string;
  name: string;
  startTime: Date;
  status: 'running' | 'completed' | 'failed';
  metrics: {
    requests: number;
    errors: number;
    avgResponseTime: number;
    currentVUs: number;
    p50ResponseTime?: number;
    p90ResponseTime?: number;
    p95ResponseTime?: number;
    p99ResponseTime?: number;
    minResponseTime?: number;
    maxResponseTime?: number;
    requestsPerSecond?: number;
    successRate?: number;
  };
  stepStats: {
    stepName: string;
    scenario: string;
    requests: number;
    errors: number;
    avgResponseTime: number;
    p50?: number;
    p95?: number;
    p99?: number;
    successRate: number;
  }[];
  responseTimes: {
    timestamp: number;
    value: number;
    success: boolean;
    stepName?: string;
  }[];
  topErrors: {
    scenario: string;
    action: string;
    status?: number;
    error: string;
    url?: string;
    count: number;
  }[];
  history: {
    timestamp: number;
    requests: number;
    errors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    vus: number;
    rps: number;
  }[];
}

interface RunningProcess {
  process: ChildProcess;
  testId: string;
  output: string[];
}

export class DashboardServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private options: DashboardOptions;
  private clients: Set<WebSocket> = new Set();
  private liveTests: Map<string, LiveTest> = new Map();
  private runningProcesses: Map<string, RunningProcess> = new Map();

  constructor(options: DashboardOptions) {
    this.options = {
      ...options,
      testsDir: options.testsDir || process.cwd()
    };
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.debug('Dashboard client connected');

      ws.send(JSON.stringify({
        type: 'live_tests',
        data: Array.from(this.liveTests.values())
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.debug('Dashboard client disconnected');
      });
    });

    return new Promise((resolve) => {
      this.server!.listen(this.options.port, () => {
        logger.info(`Dashboard running at http://localhost:${this.options.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Kill any running test processes
    for (const [id, proc] of this.runningProcesses) {
      proc.process.kill();
      this.runningProcesses.delete(id);
    }
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }

  reportLiveUpdate(testId: string, update: Partial<LiveTest>): void {
    const existing = this.liveTests.get(testId) || {
      id: testId,
      name: 'Unknown Test',
      startTime: new Date(),
      status: 'running' as const,
      metrics: { requests: 0, errors: 0, avgResponseTime: 0, currentVUs: 0 },
      stepStats: [],
      responseTimes: [],
      topErrors: [],
      history: []
    };

    const updated = { ...existing, ...update };

    if (update.metrics) {
      const lastHistory = updated.history[updated.history.length - 1];
      const now = Date.now();
      const rps = lastHistory ?
        (update.metrics.requests - lastHistory.requests) / ((now - lastHistory.timestamp) / 1000) : 0;

      updated.history.push({
        timestamp: now,
        requests: update.metrics.requests,
        errors: update.metrics.errors,
        avgResponseTime: update.metrics.avgResponseTime,
        p95ResponseTime: update.metrics.p95ResponseTime || 0,
        p99ResponseTime: update.metrics.p99ResponseTime || 0,
        vus: update.metrics.currentVUs,
        rps: Math.max(0, rps)
      });

      if (updated.history.length > 120) updated.history.shift();
    }

    this.liveTests.set(testId, updated);
    this.broadcast({ type: 'live_update', data: updated });
  }

  reportTestComplete(testId: string): void {
    const test = this.liveTests.get(testId);
    if (test) {
      test.status = 'completed';
      this.broadcast({ type: 'test_complete', data: test });
      setTimeout(() => this.liveTests.delete(testId), 30000);
    }
  }

  private broadcast(message: any): void {
    const json = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(json);
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.options.port}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/api/results') {
        await this.handleGetResults(res);
      } else if (url.pathname.startsWith('/api/results/') && req.method === 'DELETE') {
        const id = url.pathname.replace('/api/results/', '');
        await this.handleDeleteResult(res, id);
      } else if (url.pathname.startsWith('/api/results/')) {
        const id = url.pathname.replace('/api/results/', '');
        await this.handleGetResult(res, id);
      } else if (url.pathname === '/api/compare') {
        const ids = url.searchParams.get('ids')?.split(',') || [];
        await this.handleCompare(res, ids);
      } else if (url.pathname === '/api/live') {
        this.handleGetLive(res);
      } else if (url.pathname === '/api/tests') {
        await this.handleGetTests(res);
      } else if (url.pathname === '/api/tests/run' && req.method === 'POST') {
        await this.handleRunTest(req, res);
      } else if (url.pathname.startsWith('/api/tests/stop/') && req.method === 'POST') {
        const id = url.pathname.replace('/api/tests/stop/', '');
        this.handleStopTest(res, id);
      } else if (url.pathname === '/api/workers') {
        await this.handleGetWorkers(res);
      } else {
        await this.serveStatic(req, res, url.pathname);
      }
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  private async handleGetResults(res: http.ServerResponse): Promise<void> {
    const results = await this.scanResults();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
  }

  private async handleGetResult(res: http.ServerResponse, id: string): Promise<void> {
    const fullResult = await this.loadFullResult(id);
    if (!fullResult) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Result not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fullResult));
  }

  private async handleDeleteResult(res: http.ServerResponse, id: string): Promise<void> {
    try {
      const decodedId = decodeURIComponent(id);
      const filePath = path.join(this.options.resultsDir, `${decodedId}.json`);
      logger.debug(`Deleting result file: ${filePath}`);
      await fs.unlink(filePath);
      logger.info(`Deleted result: ${decodedId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'deleted', id: decodedId }));
    } catch (e: any) {
      logger.error(`Failed to delete result ${id}:`, e.message);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Result not found', details: e.message }));
    }
  }

  private async handleCompare(res: http.ServerResponse, ids: string[]): Promise<void> {
    const results = await Promise.all(ids.map(id => this.loadFullResult(id)));
    const validResults = results.filter(r => r !== null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      results: validResults,
      comparison: this.generateComparison(validResults)
    }));
  }

  private handleGetLive(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.from(this.liveTests.values())));
  }

  private async handleGetTests(res: http.ServerResponse): Promise<void> {
    const tests = await this.scanTestFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tests));
  }

  private async handleGetWorkers(res: http.ServerResponse): Promise<void> {
    try {
      // Try explicit workers file first, then check common locations
      let workersFile = this.options.workersFile;

      if (!workersFile) {
        // Auto-detect workers.json in common locations
        const searchPaths = [
          path.join(this.options.testsDir || '.', 'config', 'workers.json'),
          path.join(this.options.testsDir || '.', 'workers.json'),
          path.join(this.options.resultsDir, '..', 'config', 'workers.json'),
          path.join(process.cwd(), 'config', 'workers.json'),
          path.join(process.cwd(), 'workers.json')
        ];

        for (const searchPath of searchPaths) {
          try {
            await fs.access(searchPath);
            workersFile = searchPath;
            break;
          } catch {
            // File doesn't exist, try next
          }
        }
      }

      if (!workersFile) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ available: false, workers: [] }));
        return;
      }

      const content = await fs.readFile(workersFile, 'utf-8');
      const workers = JSON.parse(content);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: true, workers, file: workersFile }));
    } catch (e: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false, workers: [], error: e.message }));
    }
  }

  private async handleRunTest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { testPath, options } = JSON.parse(body);

    // Normalize the test path to use native separators for the OS
    const normalizedTestPath = path.normalize(testPath);

    const testId = `run-${Date.now()}`;
    const testName = path.basename(normalizedTestPath).replace(/\.(yml|yaml|json)$/, '');
    const args = ['run', normalizedTestPath];

    if (options?.verbose) args.push('-v');
    if (options?.report) args.push('-r');
    // Always save results to the dashboard's results directory
    args.push('-o', options?.output || this.options.resultsDir);

    // Load pattern overrides
    if (options?.vus) args.push('--vus', options.vus.toString());
    if (options?.iterations) args.push('--iterations', options.iterations.toString());
    if (options?.duration) args.push('--duration', options.duration);
    if (options?.rampUp) args.push('--ramp-up', options.rampUp);

    // Headless mode override for web tests
    if (options?.headless) args.push('--global', 'browser.headless=true');

    // Distributed workers
    if (options?.workers) args.push('--workers', options.workers);

    // Initialize live test tracking for dashboard-spawned tests
    const liveTest: LiveTest = {
      id: testId,
      name: testName,
      startTime: new Date(),
      status: 'running',
      metrics: { requests: 0, errors: 0, avgResponseTime: 0, currentVUs: 0 },
      stepStats: [],
      responseTimes: [],
      topErrors: [],
      history: []
    };
    this.liveTests.set(testId, liveTest);
    this.broadcast({ type: 'live_update', data: liveTest });

    // Use the CLI from the dist folder (../cli/cli.js from dist/dashboard/)
    const cliPath = path.join(__dirname, '../cli/cli.js');
    const proc = spawn('node', [cliPath, ...args], {
      cwd: this.options.testsDir,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    const runningProc: RunningProcess = { process: proc, testId, output: [] };
    this.runningProcesses.set(testId, runningProc);

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      runningProc.output.push(chunk);
      this.broadcast({ type: 'test_output', testId, data: chunk });

      // Parse each line for live metrics (chunk may contain multiple lines)
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.parseOutputForMetrics(testId, line);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      const line = data.toString();
      runningProc.output.push(line);
      this.broadcast({ type: 'test_output', testId, data: line });
    });

    proc.on('close', (code) => {
      this.runningProcesses.delete(testId);

      // Mark test as completed in liveTests
      const test = this.liveTests.get(testId);
      if (test) {
        test.status = code === 0 ? 'completed' : 'failed';
        this.broadcast({ type: 'test_complete', data: test });
        setTimeout(() => this.liveTests.delete(testId), 30000);
      }

      this.broadcast({ type: 'test_finished', testId, exitCode: code });
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ testId, status: 'started' }));
  }

  private parseOutputForMetrics(testId: string, line: string): void {
    const test = this.liveTests.get(testId);
    if (!test) return;

    // Parse [RT] JSON data for individual response times
    const rtMatch = line.match(/\[RT\]\s*(.+)/);
    if (rtMatch) {
      try {
        const rtData = JSON.parse(rtMatch[1]);
        const newRTs = rtData.map((r: any) => ({
          timestamp: r.t,
          value: r.v,
          success: r.s === 1,
          stepName: r.n || 'unknown'
        }));
        test.responseTimes = [...test.responseTimes, ...newRTs].slice(-500); // Keep last 500
        this.broadcast({ type: 'live_update', data: test });
      } catch (e) {
        // Ignore JSON parse errors
      }
      return;
    }

    // Parse [STEPS] JSON data for step statistics
    const stepsMatch = line.match(/\[STEPS\]\s*(.+)/);
    if (stepsMatch) {
      try {
        const stepData = JSON.parse(stepsMatch[1]);
        test.stepStats = stepData.map((s: any) => ({
          stepName: s.n,
          scenario: s.s,
          requests: s.r,
          errors: s.e,
          avgResponseTime: s.a,
          p50: s.p50,
          p95: s.p95,
          p99: s.p99,
          successRate: s.sr
        }));
        this.broadcast({ type: 'live_update', data: test });
      } catch (e) {
        // Ignore JSON parse errors
      }
      return;
    }

    // Parse [ERRORS] JSON data for top errors
    const topErrorsMatch = line.match(/\[ERRORS\]\s*(.+)/);
    if (topErrorsMatch) {
      try {
        const errorData = JSON.parse(topErrorsMatch[1]);
        test.topErrors = errorData.map((e: any) => ({
          scenario: e.scenario,
          action: e.action,
          status: e.status,
          error: e.error,
          url: e.url,
          count: e.count
        }));
        this.broadcast({ type: 'live_update', data: test });
      } catch (e) {
        // Ignore JSON parse errors
      }
      return;
    }

    // Parse the extended [PROGRESS] format with percentiles
    // Format: [PROGRESS] VUs: 5 | Requests: 100 | Errors: 2 | Avg RT: 150ms | RPS: 10.5 | P50: 100ms | P90: 200ms | P95: 300ms | P99: 500ms | Success: 98.5%
    const progressLineMatch = line.match(/\[PROGRESS\]\s*VUs:\s*(\d+)\s*\|\s*Requests:\s*(\d+)\s*\|\s*Errors:\s*(\d+)\s*\|\s*Avg RT:\s*(\d+(?:\.\d+)?)\s*ms\s*\|\s*RPS:\s*(\d+(?:\.\d+)?)/i);

    if (progressLineMatch) {
      test.metrics.currentVUs = parseInt(progressLineMatch[1]);
      test.metrics.requests = parseInt(progressLineMatch[2]);
      test.metrics.errors = parseInt(progressLineMatch[3]);
      test.metrics.avgResponseTime = parseFloat(progressLineMatch[4]);
      test.metrics.requestsPerSecond = parseFloat(progressLineMatch[5]);

      // Parse percentiles if present
      const p50Match = line.match(/P50:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p90Match = line.match(/P90:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p95Match = line.match(/P95:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const p99Match = line.match(/P99:\s*(\d+(?:\.\d+)?)\s*ms/i);
      const successMatch = line.match(/Success:\s*(\d+(?:\.\d+)?)\s*%/i);

      if (p50Match) test.metrics.p50ResponseTime = parseFloat(p50Match[1]);
      if (p90Match) test.metrics.p90ResponseTime = parseFloat(p90Match[1]);
      if (p95Match) test.metrics.p95ResponseTime = parseFloat(p95Match[1]);
      if (p99Match) test.metrics.p99ResponseTime = parseFloat(p99Match[1]);
      if (successMatch) test.metrics.successRate = parseFloat(successMatch[1]);

      // Add to history
      const now = Date.now();
      test.history.push({
        timestamp: now,
        requests: test.metrics.requests,
        errors: test.metrics.errors,
        avgResponseTime: test.metrics.avgResponseTime,
        p95ResponseTime: test.metrics.p95ResponseTime || 0,
        p99ResponseTime: test.metrics.p99ResponseTime || 0,
        vus: test.metrics.currentVUs,
        rps: test.metrics.requestsPerSecond || 0
      });

      if (test.history.length > 120) test.history.shift();

      this.broadcast({ type: 'live_update', data: test });
      return;
    }

    // Fallback: Parse various loose output formats for metrics
    const vusMatch = line.match(/VUs?[:\s]+(\d+)/i);
    const requestsMatch = line.match(/(?:total\s+)?requests?[:\s]+(\d+)/i);
    const errorsMatch = line.match(/(?:failed|errors?)[:\s]+(\d+)/i);
    const avgRtMatch = line.match(/(?:avg|average)\s*(?:rt|response\s*time)?[:\s]+(\d+(?:\.\d+)?)\s*ms/i);
    const rpsMatch = line.match(/(?:rps|req\/s|requests\/s(?:ec)?)[:\s]+(\d+(?:\.\d+)?)/i);

    let updated = false;

    if (vusMatch) {
      test.metrics.currentVUs = parseInt(vusMatch[1]);
      updated = true;
    }
    if (requestsMatch) {
      test.metrics.requests = parseInt(requestsMatch[1]);
      updated = true;
    }
    if (errorsMatch) {
      test.metrics.errors = parseInt(errorsMatch[1]);
      updated = true;
    }
    if (avgRtMatch) {
      test.metrics.avgResponseTime = parseFloat(avgRtMatch[1]);
      updated = true;
    }
    if (rpsMatch) {
      test.metrics.requestsPerSecond = parseFloat(rpsMatch[1]);
      updated = true;
    }

    if (updated) {
      // Add to history
      const now = Date.now();
      const lastHistory = test.history[test.history.length - 1];
      const rps = lastHistory && (now - lastHistory.timestamp) > 0
        ? (test.metrics.requests - lastHistory.requests) / ((now - lastHistory.timestamp) / 1000)
        : (test.metrics.requestsPerSecond || 0);

      test.history.push({
        timestamp: now,
        requests: test.metrics.requests,
        errors: test.metrics.errors,
        avgResponseTime: test.metrics.avgResponseTime,
        p95ResponseTime: test.metrics.p95ResponseTime || 0,
        p99ResponseTime: test.metrics.p99ResponseTime || 0,
        vus: test.metrics.currentVUs,
        rps: Math.max(0, rps)
      });

      if (test.history.length > 120) test.history.shift();

      this.broadcast({ type: 'live_update', data: test });
    }
  }

  private handleStopTest(res: http.ServerResponse, testId: string): void {
    const proc = this.runningProcesses.get(testId);
    if (proc) {
      proc.process.kill('SIGTERM');
      this.runningProcesses.delete(testId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'stopped' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Test not found' }));
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private async scanTestFiles(): Promise<TestFile[]> {
    const tests: TestFile[] = [];
    // Only scan dedicated test directories
    const searchDirs = [
      path.join(this.options.testsDir!, 'tests'),
      path.join(this.options.testsDir!, 'tmp/tests')
    ];

    for (const dir of searchDirs) {
      try {
        await this.scanDirForTests(dir, tests, this.options.testsDir!);
      } catch (e) {
        // Directory might not exist
      }
    }

    return tests.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async scanDirForTests(dir: string, tests: TestFile[], baseDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' &&
            entry.name !== 'data' && entry.name !== 'config' && entry.name !== 'environments') {
          await this.scanDirForTests(fullPath, tests, baseDir);
        } else if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') || entry.name.endsWith('.json'))) {
          // Skip obvious non-test files
          if (entry.name.includes('package') || entry.name.includes('tsconfig') ||
              entry.name.includes('env') || entry.name === 'CNAME' ||
              entry.name.includes('credentials') || entry.name.includes('config')) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');

            // Only include files that look like actual test configs (have scenarios or steps)
            if (!content.includes('scenarios:') && !content.includes('steps:') &&
                !content.includes('"scenarios"') && !content.includes('"steps"')) {
              continue;
            }

            const stat = await fs.stat(fullPath);
            const relativePath = path.relative(baseDir, fullPath);

            // Detect test type from content or path (use forward slashes for cross-platform matching)
            const normalizedPath = fullPath.replace(/\\/g, '/');
            let testType: 'api' | 'web' | 'mixed' = 'api';
            if (content.includes('protocol: web') || content.includes('playwright') || normalizedPath.includes('/web/')) {
              testType = 'web';
            } else if (content.includes('protocol: http') || content.includes('protocol: https') || normalizedPath.includes('/api/')) {
              testType = 'api';
            }

            // Normalize paths to forward slashes for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, '/');

            tests.push({
              name: entry.name.replace(/\.(yml|yaml|json)$/, ''),
              path: fullPath,  // Keep native path for filesystem operations
              relativePath: normalizedRelativePath,  // Use forward slashes for display/URLs
              type: testType,
              lastModified: stat.mtime.toISOString()
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }

  private async scanResults(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    try {
      const files = await fs.readdir(this.options.resultsDir);
      const excludePatterns = ['metrics', 'live-results', 'summary-incremental'];
      const jsonFiles = files.filter(f => f.endsWith('.json') && !excludePatterns.some(p => f.includes(p)));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.options.resultsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          const stat = await fs.stat(filePath);

          results.push({
            id: file.replace('.json', ''),
            name: data.name || data.test_name || file.replace('.json', ''),
            timestamp: data.timestamp || stat.mtime.toISOString(),
            duration: data.duration || data.total_duration || 0,
            summary: this.extractSummary(data),
            scenarios: data.scenarios || [],
            step_statistics: data.step_statistics || data.summary?.step_statistics || []
          });
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      // Results dir might not exist
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  }

  private extractSummary(data: any): TestResult['summary'] {
    const s = data.summary || data;
    const percentiles = s.percentiles || {};
    const totalReq = s.total_requests || 0;
    const failedReq = s.failed_requests || 0;

    return {
      total_requests: totalReq,
      successful_requests: s.successful_requests || (totalReq - failedReq),
      failed_requests: failedReq,
      avg_response_time: s.avg_response_time || s.mean_response_time || 0,
      min_response_time: s.min_response_time || 0,
      max_response_time: s.max_response_time || 0,
      p50_response_time: percentiles['50'] || s.p50_response_time || s.median_response_time || 0,
      p75_response_time: percentiles['75'] || s.p75_response_time || 0,
      p90_response_time: percentiles['90'] || s.p90_response_time || 0,
      p95_response_time: percentiles['95'] || s.p95_response_time || 0,
      p99_response_time: percentiles['99'] || s.p99_response_time || 0,
      requests_per_second: s.requests_per_second || s.throughput || 0,
      error_rate: s.error_rate ?? (failedReq / Math.max(1, totalReq) * 100),
      success_rate: s.success_rate ?? ((totalReq - failedReq) / Math.max(1, totalReq) * 100)
    };
  }

  private async loadFullResult(id: string): Promise<TestResult | null> {
    try {
      const decodedId = decodeURIComponent(id);
      const filePath = path.join(this.options.resultsDir, `${decodedId}.json`);
      logger.debug(`Loading result from: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const stat = await fs.stat(filePath);

      return {
        id: decodedId,
        name: data.name || data.test_name || decodedId,
        timestamp: data.timestamp || stat.mtime.toISOString(),
        duration: data.duration || data.total_duration || 0,
        summary: this.extractSummary(data),
        scenarios: data.scenarios || [],
        step_statistics: data.step_statistics || data.summary?.step_statistics || [],
        timeline_data: data.timeline_data || data.summary?.timeline_data || [],
        vu_ramp_up: data.vu_ramp_up || data.summary?.vu_ramp_up || [],
        response_time_distribution: data.response_time_distribution || [],
        timeseries: data.timeseries || data.time_series || [],
        error_details: data.error_details || data.summary?.error_details || [],
        raw: data
      };
    } catch (e: any) {
      logger.error(`Failed to load result ${id}:`, e.message);
      return null;
    }
  }

  private generateComparison(results: (TestResult | null)[]): any {
    const valid = results.filter(r => r !== null) as TestResult[];
    if (valid.length < 2) return null;

    const baseline = valid[0];
    const comparisons = valid.slice(1).map(result => ({
      id: result.id,
      name: result.name,
      timestamp: result.timestamp,
      diff: {
        avg_response_time: this.calcDiff(baseline.summary.avg_response_time, result.summary.avg_response_time),
        p50_response_time: this.calcDiff(baseline.summary.p50_response_time, result.summary.p50_response_time),
        p95_response_time: this.calcDiff(baseline.summary.p95_response_time, result.summary.p95_response_time),
        p99_response_time: this.calcDiff(baseline.summary.p99_response_time, result.summary.p99_response_time),
        requests_per_second: this.calcDiff(baseline.summary.requests_per_second, result.summary.requests_per_second, true),
        error_rate: {
          value: result.summary.error_rate,
          baseline: baseline.summary.error_rate,
          change: (result.summary.error_rate - baseline.summary.error_rate).toFixed(2) + '%',
          improved: result.summary.error_rate < baseline.summary.error_rate
        }
      }
    }));

    // Generate step-level comparisons
    const stepComparisons = this.generateStepComparisons(valid);

    // Get timeline data for line graphs
    const timelineComparisons = valid.map(result => ({
      id: result.id,
      name: result.name,
      timeline: result.timeline_data || []
    }));

    return {
      baseline: { id: baseline.id, name: baseline.name, timestamp: baseline.timestamp },
      comparisons,
      stepComparisons,
      timelineComparisons
    };
  }

  private generateStepComparisons(results: TestResult[]): any[] {
    // Collect all unique step names across all results
    const allSteps = new Set<string>();
    results.forEach(result => {
      (result.step_statistics || []).forEach((step: any) => {
        allSteps.add(step.step_name);
      });
    });

    // For each step, gather metrics from all results
    const stepComparisons: any[] = [];
    allSteps.forEach(stepName => {
      const stepData: any = {
        step_name: stepName,
        results: results.map(result => {
          const step = (result.step_statistics || []).find((s: any) => s.step_name === stepName);
          if (!step) return null;
          return {
            testId: result.id,
            testName: result.name,
            total_requests: step.total_requests,
            failed_requests: step.failed_requests,
            success_rate: step.success_rate,
            avg_response_time: step.avg_response_time,
            min_response_time: step.min_response_time,
            max_response_time: step.max_response_time,
            p50: step.percentiles?.[50] || step.p50 || 0,
            p95: step.percentiles?.[95] || step.p95 || 0,
            p99: step.percentiles?.[99] || step.p99 || 0
          };
        })
      };

      // Calculate diffs from baseline (first result)
      const baseline = stepData.results[0];
      if (baseline) {
        stepData.diffs = stepData.results.slice(1).map((current: any) => {
          if (!current) return null;
          return {
            avg_response_time: this.calcDiff(baseline.avg_response_time, current.avg_response_time),
            p95: this.calcDiff(baseline.p95, current.p95),
            p99: this.calcDiff(baseline.p99, current.p99),
            success_rate: {
              value: current.success_rate,
              baseline: baseline.success_rate,
              change: (current.success_rate - baseline.success_rate).toFixed(2) + '%',
              improved: current.success_rate > baseline.success_rate
            }
          };
        });
      }

      stepComparisons.push(stepData);
    });

    return stepComparisons;
  }

  private calcDiff(baseline: number, current: number, higherIsBetter = false): any {
    const change = baseline ? ((current - baseline) / baseline * 100) : 0;
    return {
      value: current,
      baseline,
      change: change.toFixed(2) + '%',
      improved: higherIsBetter ? current > baseline : current < baseline
    };
  }

  private async serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getDashboardHTML());
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Perfornium Dashboard</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2300d4ff'/%3E%3Cstop offset='100%25' stop-color='%239c40ff'/%3E%3C/linearGradient%3E%3ClinearGradient id='grad2' x1='0%25' y1='100%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%2300d4ff'/%3E%3Cstop offset='100%25' stop-color='%239c40ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='4' y='4' width='120' height='120' rx='24' fill='%230f0f23'/%3E%3Crect x='32' y='28' width='12' height='72' rx='6' fill='url(%23grad)'/%3E%3Cpath d='M 38 28 L 62 28 C 88 28 88 60 62 60 L 38 60' fill='none' stroke='url(%23grad)' stroke-width='12' stroke-linecap='round' stroke-linejoin='round'/%3E%3Crect x='76' y='68' width='8' height='32' rx='4' fill='url(%23grad2)' opacity='0.9'/%3E%3Crect x='88' y='54' width='8' height='46' rx='4' fill='url(%23grad)' opacity='0.9'/%3E%3C/svg%3E">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
  <style>
    :root {
      --bg-primary: #0f0f23;
      --bg-secondary: #1a1a2e;
      --bg-card: rgba(255, 255, 255, 0.03);
      --border: rgba(255, 255, 255, 0.1);
      --text-primary: #e2e8f0;
      --text-secondary: #9ca3af;
      --accent-cyan: #00d4ff;
      --accent-purple: #9c40ff;
      --success: #22c55e;
      --warning: #eab308;
      --error: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; }

    .header { background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(156, 64, 255, 0.1)); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(10px); }
    .logo { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; color: white; }
    .logo svg { width: 36px; height: 36px; }

    .container { max-width: 1800px; margin: 0 auto; padding: 24px; }

    .tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .tab { padding: 10px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); cursor: pointer; transition: all 0.2s; font-size: 14px; font-weight: 500; }
    .tab:hover { border-color: var(--accent-cyan); color: white; }
    .tab.active { background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); border-color: transparent; color: white; }

    .panel { display: none; }
    .panel.active { display: block; }

    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .grid-6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
    @media (max-width: 1400px) { .grid-6 { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 1200px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 900px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } .grid-4, .grid-6 { grid-template-columns: repeat(2, 1fr); } }

    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card h3 { font-size: 16px; font-weight: 600; color: var(--accent-cyan); }
    .card-full { grid-column: 1 / -1; }

    .metric-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-align: center; }
    .metric-card .value { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .metric-card .label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-card .change { font-size: 11px; margin-top: 4px; }
    .metric-card .change.up { color: var(--error); }
    .metric-card .change.down { color: var(--success); }

    .chart-container { position: relative; height: 280px; }
    .chart-container.tall { height: 380px; }
    .chart-container.short { height: 200px; }

    .live-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(34, 197, 94, 0.2); border-radius: 20px; font-size: 12px; color: var(--success); font-weight: 500; }
    .live-badge::before { content: ''; width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.9); } }

    .status-badge { padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .status-badge.good { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .status-badge.warn { background: rgba(234, 179, 8, 0.2); color: var(--warning); }
    .status-badge.bad { background: rgba(239, 68, 68, 0.2); color: var(--error); }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-secondary); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    .clickable { color: var(--accent-cyan); cursor: pointer; }
    .clickable:hover { text-decoration: underline; }

    .btn { padding: 10px 20px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 14px; }
    .btn-primary { background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); color: white; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-secondary { background: var(--bg-secondary); border: 1px solid var(--border); color: white; }
    .btn-danger { background: var(--error); color: white; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
    .empty-state h3 { color: var(--text-primary); margin-bottom: 8px; font-size: 18px; }
    .empty-state code { background: var(--bg-secondary); padding: 2px 8px; border-radius: 4px; font-size: 13px; }

    .progress-bar { height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
    .progress-bar .fill { height: 100%; background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple)); transition: width 0.3s; }

    .test-list { max-height: 500px; overflow-y: auto; }
    .test-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background 0.2s; }
    .test-item:hover { background: rgba(255, 255, 255, 0.02); }
    .test-item .test-info { flex: 1; }
    .test-item .test-name { font-weight: 500; color: var(--text-primary); }
    .test-item .test-path { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .test-type { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; text-transform: uppercase; }
    .test-type.api { background: rgba(0, 212, 255, 0.2); color: var(--accent-cyan); }
    .test-type.web { background: rgba(156, 64, 255, 0.2); color: var(--accent-purple); }

    .console-output { background: #0d1117; border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
    .console-output .line { padding: 2px 0; }
    .console-output .error { color: var(--error); }
    .console-output .success { color: var(--success); }

    .section-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .section-tab { padding: 8px 16px; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 13px; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -9px; transition: all 0.2s; }
    .section-tab:hover { color: var(--text-primary); }
    .section-tab.active { color: var(--accent-cyan); border-bottom-color: var(--accent-cyan); }

    .step-stats-table { font-size: 13px; }
    .step-stats-table th { font-size: 10px; padding: 8px 6px; white-space: nowrap; }
    .step-stats-table th:nth-child(n+4) { text-align: right; }
    .step-stats-table td { padding: 8px 6px; }
    .step-stats-table td:nth-child(n+4) { text-align: right; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; }

    .back-btn { margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 128 128"><defs><linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#9c40ff"/></linearGradient><linearGradient id="lg2" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#9c40ff"/></linearGradient></defs><rect x="4" y="4" width="120" height="120" rx="24" fill="#0f0f23"/><rect x="32" y="28" width="12" height="72" rx="6" fill="url(#lg1)"/><path d="M 38 28 L 62 28 C 88 28 88 60 62 60 L 38 60" fill="none" stroke="url(#lg1)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><rect x="76" y="68" width="8" height="32" rx="4" fill="url(#lg2)" opacity="0.9"/><rect x="88" y="54" width="8" height="46" rx="4" fill="url(#lg1)" opacity="0.9"/></svg>
      Perfornium Dashboard
    </div>
    <div style="display: flex; align-items: center; gap: 16px;">
      <div id="workersStatus"></div>
      <div id="connectionStatus"></div>
    </div>
  </div>

  <div class="container">
    <div class="tabs">
      <div class="tab active" data-tab="tests">Tests</div>
      <div class="tab" data-tab="live">Live</div>
      <div class="tab" data-tab="results">Results</div>
      <div class="tab" data-tab="compare">Compare</div>
    </div>

    <!-- Tests Panel -->
    <div id="tests" class="panel active">
      <div class="grid-3">
        <div class="card">
          <div class="card-header">
            <h3>Available Tests</h3>
            <button class="btn btn-secondary btn-sm" onclick="loadTests()">Refresh</button>
          </div>
          <div class="test-list" id="testsList"></div>
        </div>
        <div class="card">
          <h3>Load Override</h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 16px;">Override load settings when running tests (leave empty to use test defaults)</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Virtual Users</label>
              <input type="number" id="loadVus" placeholder="e.g., 10" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: white; font-size: 14px;">
            </div>
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Iterations</label>
              <input type="number" id="loadIterations" placeholder="e.g., 5" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: white; font-size: 14px;">
            </div>
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Duration</label>
              <input type="text" id="loadDuration" placeholder="e.g., 30s, 1m" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: white; font-size: 14px;">
            </div>
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Ramp-up</label>
              <input type="text" id="loadRampUp" placeholder="e.g., 10s" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: white; font-size: 14px;">
            </div>
          </div>
          <div style="margin-top: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="headlessMode" style="width: 16px; height: 16px; cursor: pointer;">
              <span style="font-size: 14px;">Headless Mode</span>
              <span style="color: var(--text-secondary); font-size: 12px;">(web tests only)</span>
            </label>
          </div>
          <div id="workersSection" style="margin-top: 12px; display: none;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="useWorkers" style="width: 16px; height: 16px; cursor: pointer;">
              <span style="font-size: 14px;">Use Distributed Workers</span>
              <span id="workersInfo" style="color: var(--text-secondary); font-size: 12px;"></span>
            </label>
          </div>
          <p style="color: var(--text-secondary); font-size: 11px; margin-top: 12px;">Note: Duration overrides iterations. Leave both empty for test default.</p>
        </div>
        <div class="card">
          <h3>Test Console</h3>
          <div id="testRunStatus" style="margin-bottom: 16px;"></div>
          <div class="console-output" id="testConsole">Ready to run tests...</div>
        </div>
      </div>
    </div>

    <!-- Live Tests Panel -->
    <div id="live" class="panel">
      <div id="liveTestsContainer"></div>
    </div>

    <!-- Results Panel -->
    <div id="results" class="panel">
      <div id="resultsContainer"></div>
    </div>

    <!-- Compare Panel -->
    <div id="compare" class="panel">
      <div class="card">
        <h3>Select Tests to Compare</h3>
        <div id="compareSelectContainer"></div>
        <button class="btn btn-primary" id="compareBtn" disabled style="margin-top: 16px;">Compare Selected</button>
      </div>
      <div id="comparisonResults"></div>
    </div>

    <!-- Detail Panel -->
    <div id="detail" class="panel">
      <button class="btn btn-secondary back-btn" onclick="showPanel('results')">← Back to Results</button>
      <div id="detailContent"></div>
    </div>
  </div>

  <script>
    // State
    let ws, liveTests = {}, results = [], testFiles = [], selectedForCompare = new Set(), charts = {}, runningTestId = null, workersData = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      initWebSocket();
      loadResults();
      loadTests();
      loadWorkers();
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

    function renderTests() {
      const container = document.getElementById('testsList');
      console.log('Rendering tests:', testFiles.length, 'files');
      if (!testFiles.length) {
        container.innerHTML = '<div class="empty-state"><h3>No tests found</h3><p>Add test files to your tests/ folder</p></div>';
        return;
      }
      container.innerHTML = testFiles.map(t => \`
        <div class="test-item">
          <div class="test-info">
            <div class="test-name">\${t.name}</div>
            <div class="test-path">\${t.relativePath}</div>
          </div>
          <span class="test-type \${t.type}">\${t.type}</span>
          <button class="btn btn-primary btn-sm" style="margin-left: 12px;" onclick="runTest('\${t.path}')" \${runningTestId ? 'disabled' : ''}>Run</button>
        </div>
      \`).join('');
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

      document.getElementById('testConsole').innerHTML = 'Starting test...' + loadInfo + '\\n';
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
      const console = document.getElementById('testConsole');
      console.innerHTML += text;
      console.scrollTop = console.scrollHeight;
    }

    function onTestFinished(testId, exitCode) {
      if (testId === runningTestId) {
        runningTestId = null;
        const status = exitCode === 0 ? '<span class="status-badge good">Completed</span>' : '<span class="status-badge bad">Failed</span>';
        document.getElementById('testRunStatus').innerHTML = status;
        appendConsole('\\n--- Test finished with exit code ' + exitCode + ' ---');
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

      container.innerHTML = running.map(test => \`
        <div class="card" id="live-\${test.id}">
          <div class="card-header">
            <h3>\${test.name}</h3>
            <span class="live-badge">Running</span>
          </div>

          <!-- Primary Metrics Row -->
          <div class="grid-6" style="margin-bottom: 20px;">
            <div class="metric-card"><div class="value">\${test.metrics.requests.toLocaleString()}</div><div class="label">Requests</div></div>
            <div class="metric-card"><div class="value">\${test.metrics.currentVUs}</div><div class="label">VUs</div></div>
            <div class="metric-card"><div class="value">\${test.metrics.avgResponseTime.toFixed(0)}ms</div><div class="label">Avg RT</div></div>
            <div class="metric-card"><div class="value">\${(test.history.length > 0 ? test.history[test.history.length-1].rps : 0).toFixed(1)}</div><div class="label">Req/s</div></div>
            <div class="metric-card"><div class="value" style="\${test.metrics.errors > 0 ? 'color: #ef4444 !important; -webkit-text-fill-color: #ef4444;' : ''}">\${test.metrics.errors}</div><div class="label">Errors</div></div>
            <div class="metric-card"><div class="value">\${test.metrics.successRate ? test.metrics.successRate.toFixed(1) : (test.metrics.requests > 0 ? ((test.metrics.requests - test.metrics.errors) / test.metrics.requests * 100).toFixed(1) : 100)}%</div><div class="label">Success</div></div>
          </div>

          <!-- Response Time Percentiles Row -->
          <div class="card" style="margin-bottom: 20px; padding: 16px;">
            <h3 style="margin-bottom: 12px;">Response Time Percentiles</h3>
            <div class="grid-4">
              <div class="metric-card"><div class="value">\${(test.metrics.p50ResponseTime || 0).toFixed(0)}ms</div><div class="label">P50 (Median)</div></div>
              <div class="metric-card"><div class="value">\${(test.metrics.p90ResponseTime || 0).toFixed(0)}ms</div><div class="label">P90</div></div>
              <div class="metric-card"><div class="value" style="color: #eab308 !important; -webkit-text-fill-color: #eab308;">\${(test.metrics.p95ResponseTime || 0).toFixed(0)}ms</div><div class="label">P95</div></div>
              <div class="metric-card"><div class="value" style="color: #ef4444 !important; -webkit-text-fill-color: #ef4444;">\${(test.metrics.p99ResponseTime || 0).toFixed(0)}ms</div><div class="label">P99</div></div>
            </div>
          </div>

          <!-- Charts -->
          <div class="grid-2">
            <div class="card" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3>Individual Response Times</h3>
                <div style="display: flex; gap: 16px; font-size: 12px;">
                  <span style="color: #22c55e;">Success</span>
                  <span style="color: #ef4444;">Failed</span>
                  <span style="color: var(--text-secondary);">(\${test.responseTimes ? test.responseTimes.length : 0} samples)</span>
                </div>
              </div>
              <div class="chart-container"><canvas id="chart-rt-\${test.id}"></canvas></div>
            </div>
            <div class="card" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3>Throughput (req/s)</h3>
                <span style="color: #9c40ff; font-size: 12px;">Current: <strong>\${(test.history.length > 0 ? test.history[test.history.length-1].rps : 0).toFixed(1)} req/s</strong></span>
              </div>
              <div class="chart-container"><canvas id="chart-rps-\${test.id}"></canvas></div>
            </div>
          </div>
          <div class="grid-2" style="margin-top: 20px;">
            <div class="card" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3>Virtual Users</h3>
                <span style="color: #22c55e; font-size: 12px;">Active: <strong>\${test.metrics.currentVUs}</strong></span>
              </div>
              <div class="chart-container"><canvas id="chart-vus-\${test.id}"></canvas></div>
            </div>
            <div class="card" style="margin-bottom: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3>Cumulative Errors</h3>
                <span style="color: #ef4444; font-size: 12px;">Total: <strong>\${test.metrics.errors}</strong></span>
              </div>
              <div class="chart-container"><canvas id="chart-err-\${test.id}"></canvas></div>
            </div>
          </div>

          <!-- Step Performance Statistics -->
          \${test.stepStats && test.stepStats.length > 0 ? \`
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
                  \${test.stepStats.map(s => \`
                    <tr>
                      <td><strong>\${s.stepName}</strong></td>
                      <td>\${s.scenario}</td>
                      <td>\${s.requests}</td>
                      <td style="\${s.errors > 0 ? 'color: #ef4444;' : ''}">\${s.errors}</td>
                      <td>\${s.successRate.toFixed(1)}%</td>
                      <td>\${s.avgResponseTime}ms</td>
                      <td>\${s.p50 || 0}ms</td>
                      <td>\${s.p95 || 0}ms</td>
                      <td>\${s.p99 || 0}ms</td>
                      <td><span class="status-badge \${s.successRate < 90 || (s.p95 || 0) >= 10000 ? 'bad' : s.successRate < 98 || (s.p95 || 0) >= 5000 ? 'warn' : 'good'}">
                        \${s.successRate < 90 || (s.p95 || 0) >= 10000 ? 'Poor' : s.successRate < 98 || (s.p95 || 0) >= 5000 ? 'Warn' : 'Good'}
                      </span></td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          \` : ''}

          <!-- Top Errors -->
          \${test.topErrors && test.topErrors.length > 0 ? \`
          <div class="card" style="margin-top: 20px;">
            <h3 style="color: #ef4444;">Top Errors (${`\${test.topErrors.length}`})</h3>
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
                  \${test.topErrors.map(e => \`
                    <tr>
                      <td style="color: #ef4444; font-weight: bold;">\${e.count}</td>
                      <td>\${e.scenario || '-'}</td>
                      <td>\${e.action || '-'}</td>
                      <td>\${e.status || '-'}</td>
                      <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${e.error}">\${e.error || '-'}</td>
                      <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${e.url || ''}">\${e.url || '-'}</td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          \` : ''}
        </div>
      \`).join('');

      running.forEach(test => {
        const history = test.history || [];
        const startTime = test.startTime ? new Date(test.startTime).getTime() : (history.length > 0 ? history[0].timestamp : Date.now());
        const labels = history.map(h => {
          const elapsed = Math.round((h.timestamp - startTime) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          return mins > 0 ? mins + 'm' + secs + 's' : secs + 's';
        });

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

        // Group response times by step name
        const stepGroups = {};
        const failedData = [];
        responseTimes.forEach(r => {
          const point = { x: (r.timestamp - rtStartTime) / 1000, y: r.value };
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

        createScatterChart('chart-rt-' + test.id, datasets);
        createOrUpdateChart('chart-rps-' + test.id, 'line', labels, [{
          label: 'Requests/sec', data: history.map(h => h.rps),
          borderColor: '#9c40ff', backgroundColor: 'rgba(156, 64, 255, 0.1)', fill: true, tension: 0.3
        }]);
        createOrUpdateChart('chart-vus-' + test.id, 'line', labels, [{
          label: 'Virtual Users', data: history.map(h => h.vus),
          borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.3, stepped: true
        }]);
        createOrUpdateChart('chart-err-' + test.id, 'line', labels, [{
          label: 'Errors', data: history.map(h => h.errors),
          borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3
        }]);
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
        container.innerHTML = '<div class="empty-state"><h3>No test results yet</h3><p>Run a test to see results here</p></div>';
        return;
      }
      container.innerHTML = \`
        <div class="card">
          <table>
            <thead><tr>
              <th>Test Name</th><th>Date</th><th>Duration</th><th>Requests</th>
              <th>Avg</th><th>P95</th><th>P99</th>
              <th>RPS</th><th>Success Rate</th><th></th>
            </tr></thead>
            <tbody>
              \${results.map(r => \`<tr class="clickable" onclick="showDetail('\${encodeURIComponent(r.id)}')">
                <td><strong>\${r.name}</strong></td>
                <td>\${new Date(r.timestamp).toLocaleString()}</td>
                <td>\${formatDuration(r.duration)}</td>
                <td>\${r.summary.total_requests.toLocaleString()}</td>
                <td>\${r.summary.avg_response_time.toFixed(0)}ms</td>
                <td>\${r.summary.p95_response_time.toFixed(0)}ms</td>
                <td>\${r.summary.p99_response_time.toFixed(0)}ms</td>
                <td>\${r.summary.requests_per_second.toFixed(1)}</td>
                <td><span class="status-badge \${r.summary.success_rate < 95 ? 'bad' : r.summary.success_rate < 99 ? 'warn' : 'good'}">\${r.summary.success_rate.toFixed(1)}%</span></td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteResult('\${encodeURIComponent(r.id)}', event)" title="Delete result">✕</button></td>
              </tr>\`).join('')}
            </tbody>
          </table>
        </div>
      \`;
    }

    // Detail View - Enhanced with Report-style Charts
    async function showDetail(id) {
      const res = await fetch('/api/results/' + id);
      const data = await res.json();

      if (!res.ok || !data.summary) {
        console.error('Failed to load result:', data);
        alert('Failed to load result: ' + (data.error || 'Unknown error'));
        return;
      }

      const stepStats = data.step_statistics || [];
      const timelineData = data.timeline_data || [];
      const vuRampup = data.vu_ramp_up || [];

      document.getElementById('detailContent').innerHTML = \`
        <h2 style="margin-bottom: 24px;">\${data.name}</h2>

        <!-- Summary Metrics -->
        <div class="grid-6" style="margin-bottom: 24px;">
          <div class="metric-card"><div class="value">\${data.summary.total_requests.toLocaleString()}</div><div class="label">Total Requests</div></div>
          <div class="metric-card"><div class="value">\${data.summary.successful_requests.toLocaleString()}</div><div class="label">Successful</div></div>
          <div class="metric-card"><div class="value" style="\${data.summary.failed_requests > 0 ? 'color:#ef4444!important;-webkit-text-fill-color:#ef4444;' : ''}">\${data.summary.failed_requests.toLocaleString()}</div><div class="label">Failed</div></div>
          <div class="metric-card"><div class="value">\${data.summary.requests_per_second.toFixed(2)}</div><div class="label">Requests/sec</div></div>
          <div class="metric-card"><div class="value">\${data.summary.avg_response_time.toFixed(0)}ms</div><div class="label">Avg Response</div></div>
          <div class="metric-card"><div class="value">\${formatDuration(data.duration)}</div><div class="label">Duration</div></div>
        </div>

        <!-- Response Time Distribution -->
        <div class="card">
          <h3>Response Time Distribution</h3>
          <div class="chart-container tall"><canvas id="detail-distribution"></canvas></div>
        </div>

        <!-- Individual Response Times (colored by step) -->
        \${stepStats.length ? \`
        <div class="card">
          <h3>Individual Response Times by Step</h3>
          <div class="chart-container tall"><canvas id="detail-rt-scatter"></canvas></div>
        </div>
        \` : ''}

        <!-- Throughput Charts -->
        <div class="grid-2">
          <div class="card"><h3>Response Time Percentiles</h3><div class="chart-container"><canvas id="detail-percentiles"></canvas></div></div>
          <div class="card"><h3>Success vs Failures</h3><div class="chart-container"><canvas id="detail-success"></canvas></div></div>
        </div>

        <!-- Step Performance -->
        \${stepStats.length ? \`
        <div class="card">
          <h3>Step Performance Statistics</h3>
          <div class="grid-2" style="margin-bottom: 20px;">
            <div class="chart-container tall"><canvas id="detail-step-percentiles"></canvas></div>
            <div class="chart-container tall"><canvas id="detail-step-distribution"></canvas></div>
          </div>
          <div style="overflow-x: auto;">
            <table class="step-stats-table">
              <thead><tr>
                <th>Step Name</th><th>Scenario</th><th>Requests</th><th>Success Rate</th>
                <th>Min</th><th>Avg</th><th>P50</th><th>P90</th><th>P95</th><th>P99</th><th>Max</th><th>Status</th>
              </tr></thead>
              <tbody>
                \${stepStats.map(s => \`<tr>
                  <td><strong>\${s.step_name}</strong></td>
                  <td>\${s.scenario || '-'}</td>
                  <td>\${s.total_requests || 0}</td>
                  <td>\${(s.success_rate || 100).toFixed(1)}%</td>
                  <td>\${(s.min_response_time || 0).toFixed(0)}ms</td>
                  <td>\${(s.avg_response_time || 0).toFixed(0)}ms</td>
                  <td>\${(s.percentiles?.['50'] || 0).toFixed(0)}ms</td>
                  <td>\${(s.percentiles?.['90'] || 0).toFixed(0)}ms</td>
                  <td>\${(s.percentiles?.['95'] || 0).toFixed(0)}ms</td>
                  <td>\${(s.percentiles?.['99'] || 0).toFixed(0)}ms</td>
                  <td>\${(s.max_response_time || 0).toFixed(0)}ms</td>
                  <td><span class="status-badge \${(s.success_rate || 100) < 90 || (s.percentiles?.['95'] || 0) >= 10000 ? 'bad' : (s.success_rate || 100) < 98 || (s.percentiles?.['95'] || 0) >= 5000 ? 'warn' : 'good'}">
                    \${(s.success_rate || 100) < 90 || (s.percentiles?.['95'] || 0) >= 10000 ? 'Poor' : (s.success_rate || 100) < 98 || (s.percentiles?.['95'] || 0) >= 5000 ? 'Warn' : 'Good'}
                  </span></td>
                </tr>\`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        \` : ''}

        <!-- Response Time Stats Table -->
        <div class="grid-2">
          <div class="card">
            <h3>Response Time Statistics</h3>
            <table>
              <tr><td>Minimum</td><td>\${data.summary.min_response_time.toFixed(0)}ms</td></tr>
              <tr><td>Average</td><td>\${data.summary.avg_response_time.toFixed(0)}ms</td></tr>
              <tr><td>Median (P50)</td><td>\${data.summary.p50_response_time.toFixed(0)}ms</td></tr>
              <tr><td>P75</td><td>\${data.summary.p75_response_time.toFixed(0)}ms</td></tr>
              <tr><td>P90</td><td>\${data.summary.p90_response_time.toFixed(0)}ms</td></tr>
              <tr><td>P95</td><td>\${data.summary.p95_response_time.toFixed(0)}ms</td></tr>
              <tr><td>P99</td><td>\${data.summary.p99_response_time.toFixed(0)}ms</td></tr>
              <tr><td>Maximum</td><td>\${data.summary.max_response_time.toFixed(0)}ms</td></tr>
            </table>
          </div>
          <div class="card">
            <h3>Test Summary</h3>
            <table>
              <tr><td>Duration</td><td>\${formatDuration(data.duration)}</td></tr>
              <tr><td>Total Requests</td><td>\${data.summary.total_requests.toLocaleString()}</td></tr>
              <tr><td>Throughput</td><td>\${data.summary.requests_per_second.toFixed(2)} req/s</td></tr>
              <tr><td>Success Rate</td><td><span class="status-badge \${data.summary.success_rate < 95 ? 'bad' : data.summary.success_rate < 99 ? 'warn' : 'good'}">\${data.summary.success_rate.toFixed(2)}%</span></td></tr>
              <tr><td>Error Rate</td><td><span class="status-badge \${data.summary.error_rate > 5 ? 'bad' : data.summary.error_rate > 1 ? 'warn' : 'good'}">\${data.summary.error_rate.toFixed(2)}%</span></td></tr>
              <tr><td>Timestamp</td><td>\${new Date(data.timestamp).toLocaleString()}</td></tr>
            </table>
          </div>
        </div>

        \${data.scenarios && data.scenarios.length ? \`
        <div class="card">
          <h3>Scenarios</h3>
          <table>
            <thead><tr><th>Scenario</th><th>Requests</th><th>Avg Response</th><th>Errors</th></tr></thead>
            <tbody>
              \${data.scenarios.map(s => \`<tr>
                <td>\${s.name}</td>
                <td>\${s.total_requests || s.requests || 0}</td>
                <td>\${(s.avg_response_time || 0).toFixed(0)}ms</td>
                <td>\${s.failed_requests || s.errors || 0}</td>
              </tr>\`).join('')}
            </tbody>
          </table>
        </div>
        \` : ''}

        <!-- Top Errors -->
        \${data.error_details && data.error_details.length > 0 ? \`
        <div class="card">
          <h3 style="color: #ef4444;">Top Errors (\${data.error_details.length})</h3>
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
                \${data.error_details.slice(0, 20).map(e => \`
                  <tr>
                    <td style="color: #ef4444; font-weight: bold;">\${e.count || 1}</td>
                    <td>\${e.scenario || '-'}</td>
                    <td>\${e.action || '-'}</td>
                    <td>\${e.status || '-'}</td>
                    <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${e.error || ''}">\${e.error || '-'}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${e.request_url || ''}">\${e.request_url || '-'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        \` : ''}
      \`;

      showPanel('detail');

      setTimeout(() => {
        // Response Time Distribution Histogram
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
            plugins: { legend: { position: 'top', labels: { color: '#9ca3af' } } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'Count', color: '#9ca3af' } },
              y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: '#9ca3af' }, title: { display: true, text: '%', color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { color: '#9ca3af', maxRotation: 45 } }
            }
          }
        });

        // Percentiles Bar Chart
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
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } }
        });

        // Success/Failure Donut
        new Chart(document.getElementById('detail-success'), {
          type: 'doughnut',
          data: {
            labels: ['Successful', 'Failed'],
            datasets: [{ data: [data.summary.successful_requests, data.summary.failed_requests], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0 }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }
        });

        // Step Percentiles Chart (if step data exists)
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
              plugins: { legend: { position: 'top', labels: { color: '#9ca3af' } }, title: { display: true, text: 'Response Time Percentiles (Slowest Steps)', color: '#9ca3af' } },
              scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'ms', color: '#9ca3af' } }, y: { grid: { display: false }, ticks: { color: '#9ca3af' } } }
            }
          });

          // Step Distribution Doughnut
          new Chart(document.getElementById('detail-step-distribution'), {
            type: 'doughnut',
            data: {
              labels: stepStats.map(s => s.step_name.substring(0, 15)),
              datasets: [{ data: stepStats.map(s => s.total_requests || 0), backgroundColor: stepStats.map((_, i) => \`hsl(\${i * 137.5 % 360}, 70%, 50%)\`) }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12 } }, title: { display: true, text: 'Request Distribution by Step', color: '#9ca3af' } }
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
            let results = rawResults;
            if (results.length > 2000) {
              const sampleStep = Math.ceil(results.length / 2000);
              results = results.filter((_, i) => i % sampleStep === 0);
            }

            // Find test start time
            const startTime = Math.min(...results.map(r => r.timestamp || 0));

            // Group results by step name
            const stepGroups = {};
            const failedData = [];

            results.forEach(r => {
              const rt = r.duration || r.response_time || 0;
              const ts = r.timestamp || 0;
              const point = { x: (ts - startTime) / 1000, y: rt };

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
              createScatterChart('detail-rt-scatter', scatterDatasets);
            }
          }
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
      container.innerHTML = \`
        <table>
          <thead><tr><th style="width:40px;"></th><th>Test Name</th><th>Date</th><th>Avg Response</th><th>P95</th><th>RPS</th></tr></thead>
          <tbody>
            \${results.map(r => \`<tr>
              <td><input type="checkbox" \${selectedForCompare.has(r.id) ? 'checked' : ''} onchange="toggleCompare('\${r.id}')"></td>
              <td>\${r.name}</td>
              <td>\${new Date(r.timestamp).toLocaleString()}</td>
              <td>\${r.summary.avg_response_time.toFixed(0)}ms</td>
              <td>\${r.summary.p95_response_time.toFixed(0)}ms</td>
              <td>\${r.summary.requests_per_second.toFixed(1)}</td>
            </tr>\`).join('')}
          </tbody>
        </table>
      \`;
    }

    function toggleCompare(id) {
      selectedForCompare.has(id) ? selectedForCompare.delete(id) : selectedForCompare.add(id);
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
        stepCompareHtml = \`
          <div class="card">
            <h3>Per-Request Comparison</h3>
            <div style="overflow-x: auto;">
              <table class="step-stats-table">
                <thead>
                  <tr>
                    <th>Request/Step</th>
                    \${allResults.map(r => '<th colspan="3" style="text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);">' + r.name.substring(0, 20) + '</th>').join('')}
                  </tr>
                  <tr>
                    <th></th>
                    \${allResults.map(() => '<th>Avg RT</th><th>P95</th><th>Success</th>').join('')}
                  </tr>
                </thead>
                <tbody>
                  \${stepComparisons.map((step, stepIdx) => \`
                    <tr>
                      <td><strong>\${step.step_name}</strong></td>
                      \${step.results.map((r, i) => {
                        if (!r) return '<td colspan="3" style="color:#6b7280;">N/A</td>';
                        const diff = i > 0 && step.diffs ? step.diffs[i-1] : null;
                        return \`
                          <td>\${r.avg_response_time?.toFixed(0) || 0}ms \${diff ? diffBadge(diff.avg_response_time) : (i === 0 ? '<span style="font-size:9px;color:#6b7280;">(base)</span>' : '')}</td>
                          <td>\${r.p95?.toFixed(0) || 0}ms \${diff ? diffBadge(diff.p95) : ''}</td>
                          <td><span class="status-badge \${r.success_rate < 95 ? 'bad' : r.success_rate < 99 ? 'warn' : 'good'}">\${(r.success_rate || 0).toFixed(1)}%</span></td>
                        \`;
                      }).join('')}
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        \`;
      }

      // Build timeline chart section
      const hasTimeline = timelineComparisons && timelineComparisons.some(t => t.timeline && t.timeline.length > 0);

      container.innerHTML = \`
        <div class="card">
          <h3>Comparison: \${allResults.length} Test Runs</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">Baseline: \${baseline.name} (\${new Date(baseline.timestamp).toLocaleString()})</p>

          <div class="grid-2" style="margin-bottom: 20px;">
            <div class="card" style="margin-bottom: 0;"><h3>Average Response Times</h3><div class="chart-container tall"><canvas id="compare-rt"></canvas></div></div>
            <div class="card" style="margin-bottom: 0;"><h3>Percentiles Comparison</h3><div class="chart-container tall"><canvas id="compare-percentiles"></canvas></div></div>
          </div>
          <div class="grid-2" style="margin-bottom: 20px;">
            <div class="card" style="margin-bottom: 0;"><h3>Throughput</h3><div class="chart-container"><canvas id="compare-rps"></canvas></div></div>
            <div class="card" style="margin-bottom: 0;"><h3>Error Rates</h3><div class="chart-container"><canvas id="compare-errors"></canvas></div></div>
          </div>

          \${hasTimeline ? \`
          <div class="card" style="margin-bottom: 20px;">
            <h3>Response Time Over Time</h3>
            <p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">Line graph comparing response times throughout each test run</p>
            <div class="chart-container" style="height: 350px;"><canvas id="compare-timeline"></canvas></div>
          </div>
          \` : ''}
        </div>

        <div class="card">
          <h3>Overall Metrics Comparison</h3>
          <div style="overflow-x: auto;">
            <table>
              <thead><tr><th>Metric</th>\${allResults.map(r => '<th>' + r.name.substring(0, 25) + '</th>').join('')}</tr></thead>
              <tbody>
                <tr><td>Avg Response</td>\${allResults.map((r, i) => '<td>' + r.summary.avg_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.avg_response_time) : '<span style="font-size:10px;color:#9ca3af;">(baseline)</span>') + '</td>').join('')}</tr>
                <tr><td>P50</td>\${allResults.map((r, i) => '<td>' + r.summary.p50_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p50_response_time) : '') + '</td>').join('')}</tr>
                <tr><td>P90</td>\${allResults.map(r => '<td>' + r.summary.p90_response_time.toFixed(0) + 'ms</td>').join('')}</tr>
                <tr><td>P95</td>\${allResults.map((r, i) => '<td>' + r.summary.p95_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p95_response_time) : '') + '</td>').join('')}</tr>
                <tr><td>P99</td>\${allResults.map((r, i) => '<td>' + r.summary.p99_response_time.toFixed(0) + 'ms ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.p99_response_time) : '') + '</td>').join('')}</tr>
                <tr><td>Throughput</td>\${allResults.map((r, i) => '<td>' + r.summary.requests_per_second.toFixed(1) + ' req/s ' + (i > 0 ? diffBadge(comparisons[i-1]?.diff?.requests_per_second, true) : '') + '</td>').join('')}</tr>
                <tr><td>Error Rate</td>\${allResults.map(r => '<td><span class="status-badge ' + (r.summary.error_rate > 5 ? 'bad' : r.summary.error_rate > 1 ? 'warn' : 'good') + '">' + r.summary.error_rate.toFixed(2) + '%</span></td>').join('')}</tr>
                <tr><td>Total Requests</td>\${allResults.map(r => '<td>' + (r.summary.total_requests || 0).toLocaleString() + '</td>').join('')}</tr>
                <tr><td>Duration</td>\${allResults.map(r => '<td>' + (r.summary.total_duration || 0).toFixed(1) + 's</td>').join('')}</tr>
              </tbody>
            </table>
          </div>
        </div>

        \${stepCompareHtml}
      \`;

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
                tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(0) + 'ms' } }
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
        plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', callback: v => v + (unit ? ' ' + unit : '') } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } }
      };
    }

    // Scatter chart helper for response times
    function createScatterChart(id, datasets) {
      const canvas = document.getElementById(id);
      if (!canvas) return;

      // If chart exists but canvas was recreated (DOM rebuild), destroy old chart
      if (charts[id] && charts[id].canvas !== canvas) {
        charts[id].destroy();
        delete charts[id];
      }

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
              legend: { display: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#9ca3af' },
                title: { display: true, text: 'ms', color: '#9ca3af' }
              },
              x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#9ca3af' },
                title: { display: true, text: 'Time (s)', color: '#9ca3af' }
              }
            }
          }
        });
      }
    }

    // Chart helper
    function createOrUpdateChart(id, type, labels, datasets) {
      const canvas = document.getElementById(id);
      if (!canvas) return;

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

    // Tabs
    function setupTabs() {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => showPanel(tab.dataset.tab));
      });
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
  </script>
</body>
</html>`;
  }
}

// Singleton for global access
let dashboardInstance: DashboardServer | null = null;

export function getDashboard(): DashboardServer | null {
  return dashboardInstance;
}

export function setDashboard(dashboard: DashboardServer): void {
  dashboardInstance = dashboard;
}

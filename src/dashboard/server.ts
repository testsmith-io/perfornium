import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { DashboardOptions, LiveTest } from './types';
import { FileScanner, ResultsManager, TestExecutor, WorkersManager } from './services';
import { InfluxDBService } from './services/influxdb-service';
import { ApiRoutes, StaticRoutes } from './routes';

export class DashboardServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private options: DashboardOptions;
  private clients: Set<WebSocket> = new Set();
  private liveTests: Map<string, LiveTest> = new Map();

  // Services
  private fileScanner: FileScanner;
  private resultsManager: ResultsManager;
  private testExecutor: TestExecutor;
  private workersManager: WorkersManager;
  private influxService: InfluxDBService;

  // Routes
  private apiRoutes: ApiRoutes;
  private staticRoutes: StaticRoutes;

  constructor(options: DashboardOptions) {
    this.options = {
      ...options,
      testsDir: options.testsDir || process.cwd()
    };

    // Initialize services
    this.fileScanner = new FileScanner(this.options.testsDir!);
    this.resultsManager = new ResultsManager(this.options.resultsDir);
    this.workersManager = new WorkersManager(
      this.options.testsDir!,
      this.options.resultsDir,
      this.options.workersFile
    );
    this.influxService = new InfluxDBService();

    // Initialize routes first so we can get infra snapshot
    this.staticRoutes = new StaticRoutes();
    this.apiRoutes = new ApiRoutes(
      this.fileScanner,
      this.resultsManager,
      null as any, // Will be set after testExecutor is created
      this.workersManager,
      this.liveTests,
      {
        onInfraUpdate: (data) => this.broadcast({ type: 'infra_update', data })
      },
      this.influxService
    );

    // Initialize test executor with callbacks (including getInfraSnapshot from apiRoutes)
    // Check if InfluxDB is configured (token provided) - if so, don't limit response times
    const influxEnabled = !!(process.env.INFLUXDB_TOKEN);
    this.testExecutor = new TestExecutor(
      this.options.testsDir!,
      this.options.resultsDir,
      this.liveTests,
      {
        onOutput: (testId, data) => this.broadcast({ type: 'test_output', testId, data }),
        onLiveUpdate: (test) => this.broadcast({ type: 'live_update', data: test }),
        onNetworkUpdate: (testId, data) => this.broadcast({ type: 'network_update', testId, data }),
        onTestComplete: (test) => this.broadcast({ type: 'test_complete', data: test }),
        onTestFinished: (testId, exitCode) => this.broadcast({ type: 'test_finished', testId, exitCode }),
        getInfraSnapshot: () => this.apiRoutes.getInfraSnapshot()
      },
      { influxEnabled }
    );

    // Now set the testExecutor in apiRoutes
    (this.apiRoutes as any).testExecutor = this.testExecutor;
  }

  async start(): Promise<void> {
    // Initialize InfluxDB connection
    await this.apiRoutes.initialize();

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
    this.testExecutor.killAllProcesses();
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
        await this.apiRoutes.handleGetResults(res);
      } else if (url.pathname === '/api/results/import' && req.method === 'POST') {
        await this.apiRoutes.handleImportResult(req, res);
      } else if (url.pathname.match(/^\/api\/results\/.*\/export$/)) {
        const id = url.pathname.replace('/api/results/', '').replace('/export', '');
        await this.apiRoutes.handleExportResult(res, id, url);
      } else if (url.pathname.startsWith('/api/results/') && req.method === 'DELETE') {
        const id = url.pathname.replace('/api/results/', '');
        await this.apiRoutes.handleDeleteResult(res, id);
      } else if (url.pathname.startsWith('/api/results/')) {
        const id = url.pathname.replace('/api/results/', '');
        await this.apiRoutes.handleGetResult(res, id);
      } else if (url.pathname === '/api/compare') {
        const ids = url.searchParams.get('ids')?.split(',') || [];
        await this.apiRoutes.handleCompare(res, ids);
      } else if (url.pathname === '/api/live') {
        this.apiRoutes.handleGetLive(res);
      } else if (url.pathname === '/api/tests') {
        await this.apiRoutes.handleGetTests(res);
      } else if (url.pathname === '/api/tests/run' && req.method === 'POST') {
        await this.apiRoutes.handleRunTest(req, res);
      } else if (url.pathname.startsWith('/api/tests/stop/') && req.method === 'POST') {
        const id = url.pathname.replace('/api/tests/stop/', '');
        this.apiRoutes.handleStopTest(res, id);
      } else if (url.pathname === '/api/workers') {
        await this.apiRoutes.handleGetWorkers(res);
      } else if (url.pathname === '/api/metrics/runs') {
        await this.apiRoutes.handleGetTestRuns(res);
      } else if (url.pathname === '/api/metrics/query') {
        await this.apiRoutes.handleGetTestMetrics(res, url);
      } else if (url.pathname === '/api/metrics/export') {
        await this.apiRoutes.handleExportTestData(res, url);
      } else if (url.pathname === '/api/metrics/status') {
        await this.apiRoutes.handleGetTestMetricsStatus(res);
      } else if (url.pathname === '/api/infra/export') {
        await this.apiRoutes.handleExportInfra(req, res, url);
      } else if (url.pathname === '/api/infra/import' && req.method === 'POST') {
        await this.apiRoutes.handleImportInfra(req, res, url);
      } else if (url.pathname === '/api/infra/status') {
        await this.apiRoutes.handleGetInfraStatus(res);
      } else if (url.pathname === '/api/infra/by-time') {
        const start = url.searchParams.get('start') || '';
        const end = url.searchParams.get('end') || '';
        await this.apiRoutes.handleGetInfraByTestRun(res, start, end);
      } else if (url.pathname === '/api/infra' && req.method === 'POST') {
        await this.apiRoutes.handleInfraMetrics(req, res);
      } else if (url.pathname === '/api/infra') {
        await this.apiRoutes.handleGetInfra(res);
      } else if (url.pathname.startsWith('/api/infra/')) {
        const host = decodeURIComponent(url.pathname.replace('/api/infra/', ''));
        await this.apiRoutes.handleGetInfra(res, host);
      } else {
        await this.staticRoutes.serve(req, res, url.pathname);
      }
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
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

import { logger } from '../../utils/logger';
import * as http from 'http';
import { URL } from 'url';
import { TestRunner } from '../../core/test-runner';
import { TestConfiguration } from '../../config/types';
import { WorkerStatus } from '../../distributed/remote-worker';

export class WorkerServer {
  private server: http.Server;
  private host: string;
  private port: number;
  private status: WorkerStatus;
  private activeRunner: TestRunner | null = null;
  private preparedConfig: TestConfiguration | null = null;
  private completedRunner: TestRunner | null = null;

  constructor(host: string = 'localhost', port: number = 8080) {
    this.host = host;
    this.port = port;
    this.status = {
      connected: true,
      running: false,
      virtualUsers: 0,
      requestsPerSecond: 0,
      responseTime: 0,
      errorRate: 0
    };

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const method = req.method || 'GET';

    try {
      switch (`${method} ${url.pathname}`) {
        case 'GET /health':
          await this.handleHealth(res);
          break;
        case 'GET /status':
          await this.handleStatus(res);
          break;
        case 'POST /prepare':
          await this.handlePrepare(req, res);
          break;
        case 'POST /start':
          await this.handleStart(req, res);
          break;
        case 'GET /results':
          await this.handleResults(res);
          break;
        case 'POST /stop':
          await this.handleStop(res);
          break;
        default:
          this.sendError(res, 404, 'Not Found', `Endpoint ${method} ${url.pathname} not found`);
      }
    } catch (error: any) {
      logger.error(`❌ Error handling ${method} ${url.pathname}:`, error);
      this.sendError(res, 500, 'Internal Server Error', error.message);
    }
  }

  private async handleHealth(res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  }

  private async handleStatus(res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, {
      ...this.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeRunner: this.activeRunner ? 'running' : 'idle'
    });
  }

  private async handlePrepare(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readRequestBody(req);
    
    try {
      const testConfig: TestConfiguration = JSON.parse(body);
      this.preparedConfig = testConfig;
      
      logger.info(`📋 Test prepared: ${testConfig.name}`);
      
      this.sendJson(res, 200, {
        status: 'prepared',
        testName: testConfig.name,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      this.sendError(res, 400, 'Bad Request', `Invalid test configuration: ${error.message}`);
    }
  }

  private async handleStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.preparedConfig) {
      this.sendError(res, 400, 'Bad Request', 'No test configuration prepared. Call /prepare first.');
      return;
    }

    if (this.status.running) {
      this.sendError(res, 409, 'Conflict', 'Test is already running');
      return;
    }

    try {
      const body = await this.readRequestBody(req);
      let startOptions: { startTime?: number } = {};
      
      if (body) {
        startOptions = JSON.parse(body);
      }

      // If startTime is provided (for synchronized start), wait until that time
      if (startOptions.startTime) {
        const delay = startOptions.startTime - Date.now();
        if (delay > 0) {
          logger.info(`⏰ Waiting ${delay}ms for synchronized start...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      this.activeRunner = new TestRunner(this.preparedConfig);
      this.status.running = true;
      const { getPrimaryLoadPhase } = await import('../../config/types/load-config');
      const primaryPhase = getPrimaryLoadPhase(this.preparedConfig.load);
      this.status.virtualUsers = primaryPhase.virtual_users || primaryPhase.vus || 1;

      logger.info(`🚀 Starting test: ${this.preparedConfig.name}`);

      // Start the test asynchronously and collect results
      this.activeRunner.run().then(() => {
        this.status.running = false;
        logger.info(`✅ Test completed: ${this.preparedConfig?.name}`);
        
        // Store completed runner for results retrieval
        this.completedRunner = this.activeRunner;
        
        // Get final metrics and store them for retrieval
        if (this.activeRunner) {
          const metrics = this.activeRunner.getMetrics();
          this.status.responseTime = metrics.getSummary().avg_response_time || 0;
          this.status.requestsPerSecond = metrics.getSummary().requests_per_second || 0;
          this.status.errorRate = (1 - (metrics.getSummary().success_rate / 100)) * 100;
        }
        
        this.activeRunner = null;
      }).catch((error) => {
        this.status.running = false;
        this.activeRunner = null;
        logger.error(`❌ Test failed: ${error.message}`);
      });

      this.sendJson(res, 200, {
        status: 'started',
        testName: this.preparedConfig.name,
        virtualUsers: this.status.virtualUsers,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.status.running = false;
      this.sendError(res, 500, 'Internal Server Error', `Failed to start test: ${error.message}`);
    }
  }

  private async handleResults(res: http.ServerResponse): Promise<void> {
    if (!this.completedRunner) {
      this.sendError(res, 404, 'Not Found', 'No completed test results available');
      return;
    }

    try {
      const metrics = this.completedRunner.getMetrics();
      const summary = metrics.getSummary();
      const results = metrics.getResults();

      this.sendJson(res, 200, {
        summary,
        results,
        worker: {
          host: this.host,
          port: this.port,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      this.sendError(res, 500, 'Internal Server Error', `Failed to get results: ${error.message}`);
    }
  }

  private async handleStop(res: http.ServerResponse): Promise<void> {
    if (!this.status.running || !this.activeRunner) {
      this.sendError(res, 400, 'Bad Request', 'No test is currently running');
      return;
    }

    try {
      await this.activeRunner.stop();
      this.status.running = false;
      this.activeRunner = null;

      logger.info(`⏹️ Test stopped`);

      this.sendJson(res, 200, {
        status: 'stopped',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      this.sendError(res, 500, 'Internal Server Error', `Failed to stop test: ${error.message}`);
    }
  }

  private async readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private sendError(res: http.ServerResponse, statusCode: number, error: string, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error,
      message,
      timestamp: new Date().toISOString()
    }));
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        logger.info(`🚀 Worker server started on ${this.host}:${this.port}`);
        logger.info(`📋 Available endpoints:`);
        logger.info(`   GET  http://${this.host}:${this.port}/health`);
        logger.info(`   GET  http://${this.host}:${this.port}/status`);
        logger.info(`   POST http://${this.host}:${this.port}/prepare`);
        logger.info(`   POST http://${this.host}:${this.port}/start`);
        logger.info(`   POST http://${this.host}:${this.port}/stop`);
        logger.info(`   GET  http://${this.host}:${this.port}/results`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeRunner) {
        this.activeRunner.stop().catch(err => 
          logger.error('❌ Error stopping runner:', err)
        );
      }

      this.server.close(() => {
        logger.info('👋 Worker server stopped');
        resolve();
      });
    });
  }

  getStatus(): any {
    return {
      host: this.host,
      port: this.port,
      status: this.status,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

// Updated worker command function
export async function workerCommand(options: {
  port?: string;
  host?: string;
}): Promise<void> {
  const port = parseInt(options.port || '8080');
  const host = options.host || 'localhost';

  const workerServer = new WorkerServer(host, port);

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('🛑 Received shutdown signal, stopping worker...');
    await workerServer.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await workerServer.start();
    
    // Keep the process alive
    process.on('exit', () => {
      logger.info('👋 Worker process exiting');
    });

  } catch (error: any) {
    logger.error(`❌ Failed to start worker: ${error.message}`);
    process.exit(1);
  }
}
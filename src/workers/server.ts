import * as http from 'http';
import * as WebSocket from 'ws';
import { TestConfiguration } from '../config/types';
import { TestRunner } from '../core/test-runner';
import { logger } from '../utils/logger';

export class WorkerServer {
  private server: http.Server;
  private wss: WebSocket.Server;
  private port: number;
  private host: string;
  private activeRunners: Map<WebSocket, TestRunner> = new Map();

  constructor(port: number = 8080, host: string = 'localhost') {
    this.port = port;
    this.host = host;
    
    this.server = http.createServer();
    this.wss = new WebSocket.Server({ 
      server: this.server, 
      path: '/perfornium'
    });
    
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientIP = req.socket.remoteAddress;
      logger.info(`👤 Worker client connected from ${clientIP}`);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error('❌ Error handling message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        logger.info('👋 Worker client disconnected');
        this.cleanup(ws);
      });

      ws.on('error', (error) => {
        logger.error('❌ WebSocket error:', error);
        this.cleanup(ws);
      });

      // Send initial heartbeat
      this.sendHeartbeat(ws);
    });
  }

  private async handleMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'execute_test':
        await this.executeTest(ws, message.config);
        break;
      
      case 'stop_test':
        await this.stopTest(ws);
        break;
      
      case 'heartbeat_ack':
        // Client is alive, do nothing
        break;
      
      default:
        logger.warn(`⚠️  Unknown message type: ${message.type}`);
    }
  }

  private async executeTest(ws: WebSocket, config: TestConfiguration): Promise<void> {
    try {
      // Stop any existing test for this connection
      await this.stopTest(ws);

      logger.info(`🚀 Starting test: ${config.name}`);
      
      const runner = new TestRunner(config);
      this.activeRunners.set(ws, runner);

      // Forward results to coordinator
      runner.getMetrics().on('result', (result) => {
        this.sendMessage(ws, {
          type: 'test_result',
          data: result
        });
      });

      // Execute test
      await runner.run();

      // Test completed
      const summary = runner.getMetrics().getSummary();
      this.sendMessage(ws, {
        type: 'test_completed',
        summary: summary
      });

      logger.info(`✅ Test completed: ${config.name}`);

    } catch (error: any) {
      logger.error('❌ Test execution failed:', error);
      this.sendError(ws, error.message);
    } finally {
      this.activeRunners.delete(ws);
    }
  }

  private async stopTest(ws: WebSocket): Promise<void> {
    const runner = this.activeRunners.get(ws);
    if (runner) {
      logger.info('⏹️  Stopping test...');
      await runner.stop();
      this.activeRunners.delete(ws);
    }
  }

  private sendMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'test_error',
      error: error,
      timestamp: Date.now()
    });
  }

  private sendHeartbeat(ws: WebSocket): void {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, { 
          type: 'heartbeat',
          timestamp: Date.now()
        });
      } else {
        clearInterval(interval);
      }
    }, 30000); // 30 seconds
  }

  private cleanup(ws: WebSocket): void {
    const runner = this.activeRunners.get(ws);
    if (runner) {
      runner.stop().catch(err => 
        logger.error('❌ Error stopping runner during cleanup:', err)
      );
      this.activeRunners.delete(ws);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        logger.info(`🚀 Worker server started on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop all active tests
      for (const [ws, runner] of this.activeRunners) {
        runner.stop().catch(err => 
          logger.error('❌ Error stopping runner:', err)
        );
      }
      
      this.wss.close(() => {
        this.server.close(() => {
          logger.info('👋 Worker server stopped');
          resolve();
        });
      });
    });
  }

  getActiveConnections(): number {
    return this.wss.clients.size;
  }

  getActiveTests(): number {
    return this.activeRunners.size;
  }

  getStatus(): any {
    return {
      host: this.host,
      port: this.port,
      active_connections: this.getActiveConnections(),
      active_tests: this.getActiveTests(),
      uptime: process.uptime(),
      memory_usage: process.memoryUsage()
    };
  }
}
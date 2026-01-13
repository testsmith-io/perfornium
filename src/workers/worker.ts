import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { TestConfiguration } from '../config/types';
import { TestResult } from '../metrics/types';
import { logger } from '../utils/logger';

export class WorkerNode extends EventEmitter {
  private address: string;
  private ws?: WebSocket;
  private isRunning: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 3;

  constructor(address: string) {
    super();
    this.address = address;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.address}/perfornium`;
      logger.debug(`🔌 Connecting to worker: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to worker ${this.address}`));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connectionRetries = 0;
        logger.debug(`✅ Connected to worker: ${this.address}`);
        resolve();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        logger.error(`❌ Connection error to worker ${this.address}:`, error);
        reject(error);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('❌ Invalid message from worker:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        logger.debug(`🔌 Worker ${this.address} disconnected: ${code} ${reason}`);
        this.emit('disconnected');
        
        // Attempt reconnection if unexpected disconnect
        if (this.isRunning && this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          logger.info(`🔄 Attempting to reconnect to worker ${this.address} (${this.connectionRetries}/${this.maxRetries})`);
          setTimeout(() => this.connect(), 5000);
        }
      });
    });
  }

  async executeTest(config: TestConfiguration): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Worker ${this.address} is not connected`);
    }

    this.isRunning = true;
    
    const message = {
      type: 'execute_test',
      config: config,
      timestamp: Date.now()
    };

    logger.debug(`🚀 Starting test on worker ${this.address}`);
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'test_result':
        this.emit('result', message.data as TestResult);
        break;
      
      case 'test_progress':
        logger.debug(`📊 Worker ${this.address} progress: ${message.data.completed}/${message.data.total}`);
        this.emit('progress', message.data);
        break;
      
      case 'test_completed':
        this.isRunning = false;
        logger.info(`✅ Worker ${this.address} completed test`);
        this.emit('completed', message.summary);
        break;
      
      case 'test_error':
        this.isRunning = false;
        logger.error(`❌ Worker ${this.address} test error: ${message.error}`);
        this.emit('error', new Error(message.error));
        break;
      
      case 'heartbeat':
        this.sendHeartbeat();
        break;
      
      case 'log':
        logger.debug(`📝 Worker ${this.address}: ${message.message}`);
        break;
      
      default:
        logger.warn(`⚠️  Unknown message type from worker ${this.address}: ${message.type}`);
    }
  }

  private sendHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ 
        type: 'heartbeat_ack',
        timestamp: Date.now()
      }));
    }
  }

  async waitForCompletion(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${this.address} completion timeout`));
      }, 300000); // 5 minute timeout

      this.once('completed', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      this.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop_test' }));
    }
    this.isRunning = false;
  }

  async disconnect(): Promise<void> {
    this.isRunning = false;
    if (this.ws) {
      // Remove all listeners to prevent memory leaks and allow process to exit
      this.ws.removeAllListeners();
      // Use terminate() for immediate close instead of close() which waits for graceful handshake
      this.ws.terminate();
      this.ws = undefined;
    }
  }

  getAddress(): string {
    return this.address;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
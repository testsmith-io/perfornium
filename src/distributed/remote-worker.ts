import { EventEmitter } from 'events';
import { TestConfiguration } from '../config/types';
import { logger } from '../utils/logger';
import * as http from 'http';

export interface RemoteWorkerConfig {
  host: string;
  port: number;
  capacity: number;
  region: string;
}

export interface WorkerStatus {
  connected: boolean;
  running: boolean;
  virtualUsers: number;
  requestsPerSecond: number;
  responseTime: number;
  errorRate: number;
  activeRunner?: string; // Add this optional property
}

export class RemoteWorker extends EventEmitter {
  private config: RemoteWorkerConfig;
  private connected: boolean = false;
  private status: WorkerStatus;

  constructor(config: RemoteWorkerConfig) {
    super();
    this.config = config;
    this.status = {
      connected: false,
      running: false,
      virtualUsers: 0,
      requestsPerSecond: 0,
      responseTime: 0,
      errorRate: 0
    };
  }

  async connect(): Promise<void> {
    try {
      // Implement connection logic to worker
      await this.sendHealthCheck();
      this.connected = true;
      this.status.connected = true;
      logger.debug(`🔗 Connected to worker ${this.getAddress()}`);
    } catch (error) {
      this.connected = false;
      this.status.connected = false;
      throw new Error(`Failed to connect to worker ${this.getAddress()}: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.status.connected = false;
    logger.debug(`🔌 Disconnected from worker ${this.getAddress()}`);
  }

  async prepareTest(testConfig: TestConfiguration): Promise<void> {
    if (!this.connected) {
      throw new Error(`Worker ${this.getAddress()} not connected`);
    }

    try {
      await this.sendRequest('/prepare', {
        method: 'POST',
        data: testConfig
      });
      logger.debug(`📋 Test prepared on worker ${this.getAddress()}`);
    } catch (error) {
      throw new Error(`Failed to prepare test on worker ${this.getAddress()}: ${error}`);
    }
  }

  async startTest(startTime?: number): Promise<void> {
    if (!this.connected) {
      throw new Error(`Worker ${this.getAddress()} not connected`);
    }

    try {
      await this.sendRequest('/start', {
        method: 'POST',
        data: { startTime }
      });
      this.status.running = true;
      logger.debug(`🚀 Test started on worker ${this.getAddress()}`);
    } catch (error) {
      throw new Error(`Failed to start test on worker ${this.getAddress()}: ${error}`);
    }
  }

  async executeTest(testConfig: TestConfiguration): Promise<void> {
    await this.prepareTest(testConfig);
    await this.startTest();
  }

  async stop(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.sendRequest('/stop', { method: 'POST' });
      this.status.running = false;
      logger.debug(`⏹️ Test stopped on worker ${this.getAddress()}`);
    } catch (error) {
      logger.warn(`Failed to stop test on worker ${this.getAddress()}: ${error}`);
    }
  }

  async waitForCompletion(): Promise<void> {
    if (!this.status.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      const checkCompletion = async () => {
        try {
          const status = await this.getWorkerStatus();
          logger.debug(`🔍 Worker ${this.getAddress()} status: running=${status.running}, activeRunner=${status.activeRunner}`);
          
          // Check if worker is no longer running AND has no active runner
          if (!status.running && (!status.activeRunner || status.activeRunner === 'idle')) {
            this.status.running = false;
            logger.debug(`✅ Worker ${this.getAddress()} completed`);
            resolve();
          } else {
            // Continue checking
            setTimeout(checkCompletion, 2000); // Check every 2 seconds
          }
        } catch (error) {
          logger.warn(`⚠️ Error checking worker ${this.getAddress()} status:`, error);
          // On connection error, assume worker completed
          this.status.running = false;
          resolve();
        }
      };

      checkCompletion();
    });
  }

  async getWorkerStatus(): Promise<WorkerStatus> {
    if (!this.connected) {
      return this.status;
    }

    try {
      const response = await this.sendRequest('/status', { method: 'GET' });
      this.status = { ...this.status, ...response };
      this.emit('status', this.status);
      return this.status;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async sendHealthCheck(): Promise<void> {
    const response = await this.sendRequest('/health', { method: 'GET' });
    if (response.status !== 'healthy') {
      throw new Error(`Worker health check failed: ${JSON.stringify(response)}`);
    }
  }

  private async sendRequest(path: string, options: {
    method: string;
    data?: any;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = options.data ? JSON.stringify(options.data) : undefined;
      
      const requestOptions: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path,
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        },
        timeout: 30000
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = data ? JSON.parse(data) : {};
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${response.message || 'Request failed'}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }

  getAddress(): string {
    return `${this.config.host}:${this.config.port}`;
  }

  getCapacity(): number {
    return this.config.capacity;
  }

  getRegion(): string {
    return this.config.region;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConfig(): RemoteWorkerConfig {
    return { ...this.config };
  }

  async getResults(): Promise<any> {
    if (!this.connected) {
      throw new Error(`Worker ${this.getAddress()} not connected`);
    }

    try {
      return await this.sendRequest('/results', { method: 'GET' });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}
import { Worker } from 'worker_threads';
import { VirtualUser } from './virtual-user';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { Scenario } from '../config/types/hooks';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface VUPoolConfig {
  maxWorkers?: number;
  maxVUsPerWorker?: number;
  reuseVUs?: boolean;
  preWarmVUs?: number;
  workerIdleTimeout?: number;
}

export interface VUTask {
  id: number;
  scenarios: Scenario[];
  priority?: number;
}

interface WorkerState {
  worker: Worker;
  activeVUs: Set<number>;
  isIdle: boolean;
  lastActivity: number;
}

export class VirtualUserPool extends EventEmitter {
  private config: VUPoolConfig;
  private metrics: MetricsCollector;
  private handlers: Map<string, ProtocolHandler>;
  private testName: string;
  
  private vuPool: Map<number, VirtualUser> = new Map();
  private availableVUs: Set<number> = new Set();
  private busyVUs: Set<number> = new Set();
  private workers: Map<number, WorkerState> = new Map();
  private taskQueue: VUTask[] = [];
  private nextVUId: number = 1;
    private readonly DEFAULT_MAX_WORKERS = 4;
    private readonly DEFAULT_MAX_VUS_PER_WORKER = 50;
    private readonly DEFAULT_WORKER_IDLE_TIMEOUT = 30000;

    constructor(
        metrics: MetricsCollector,
        handlers: Map<string, ProtocolHandler>,
        testName: string = 'Load Test',
        config?: VUPoolConfig
    ) {
        super();
        this.metrics = metrics;
        this.handlers = handlers;
        this.testName = testName;
        this.config = {
            maxWorkers: config?.maxWorkers || this.DEFAULT_MAX_WORKERS,
            maxVUsPerWorker: config?.maxVUsPerWorker || this.DEFAULT_MAX_VUS_PER_WORKER,
            reuseVUs: config?.reuseVUs ?? true,
            preWarmVUs: config?.preWarmVUs || 0,
            workerIdleTimeout: config?.workerIdleTimeout || this.DEFAULT_WORKER_IDLE_TIMEOUT
        };
    }

    async initialize(): Promise<void> {
        logger.debug(`🏊 Initializing VU pool with config:`, this.config);

        if (this.config.preWarmVUs && this.config.preWarmVUs > 0) {
            await this.preWarmVUs(this.config.preWarmVUs);
        }

        this.startWorkerCleanup();
    }

    private async preWarmVUs(count: number): Promise<void> {
        logger.debug(`🔥 Pre-warming ${count} virtual users...`);
        const promises: Promise<number>[] = [];

        for (let i = 0; i < count; i++) {
            promises.push(this.createVU());
        }

        await Promise.all(promises);
        logger.debug(`✅ Pre-warmed ${count} virtual users`);
    }

    private async createVU(): Promise<number> {
        const vuId = this.nextVUId++;
        const vu = new VirtualUser(
            vuId,
            this.metrics,
            this.handlers,
            this.testName
        );

        this.vuPool.set(vuId, vu);
        this.availableVUs.add(vuId);

        return vuId;
    }

    async getVU(scenarios: Scenario[]): Promise<VirtualUser> {
        let vuId: number;

        if (this.config.reuseVUs && this.availableVUs.size > 0) {
            const iterator = this.availableVUs.values().next();
            if (!iterator.done) {
                vuId = iterator.value;
                this.availableVUs.delete(vuId);
            } else {
                vuId = await this.createVU();
            }
        } else {
            vuId = await this.createVU();
        }

        this.busyVUs.add(vuId);
        const vu = this.vuPool.get(vuId)!;

        await vu.setScenarios(scenarios);

        return vu;
    }

    releaseVU(vuId: number): void {
        if (!this.busyVUs.has(vuId)) {
            return;
        }

        this.busyVUs.delete(vuId);

        if (this.config.reuseVUs) {
            this.availableVUs.add(vuId);
        } else {
            const vu = this.vuPool.get(vuId);
            if (vu) {
                vu.stop();
                this.vuPool.delete(vuId);
            }
        }
    }

    async executeTask(task: VUTask): Promise<void> {
        const vu = await this.getVU(task.scenarios);

        try {
            await vu.executeScenarios();
        } finally {
            this.releaseVU(vu.getId());
        }
    }

    private startWorkerCleanup(): void {
        if (!this.config.workerIdleTimeout || this.config.workerIdleTimeout <= 0) {
            return;
        }

        setInterval(() => {
            const now = Date.now();

            for (const [workerId, state] of this.workers.entries()) {
                if (state.isIdle &&
                    state.activeVUs.size === 0 &&
                    now - state.lastActivity > this.config.workerIdleTimeout!) {

                    this.terminateWorker(workerId);
                }
            }
        }, 10000);
    }

    private terminateWorker(workerId: number): void {
        const state = this.workers.get(workerId);
        if (!state) return;

        state.worker.terminate();
        this.workers.delete(workerId);
        logger.debug(`🧹 Terminated idle worker ${workerId}`);
    }

    async shutdown(): Promise<void> {
        logger.debug('🛑 Shutting down VU pool...');

        for (const [vuId, vu] of this.vuPool) {
      await vu.stop();
    }
    
    for (const [workerId, state] of this.workers) {
      await state.worker.terminate();
    }
    
    this.vuPool.clear();
    this.availableVUs.clear();
    this.busyVUs.clear();
    this.workers.clear();
    
    logger.debug('✅ VU pool shut down complete');
  }
}
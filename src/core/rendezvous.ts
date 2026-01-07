/**
 * Rendezvous Manager for synchronized VU coordination
 *
 * Rendezvous points allow Virtual Users to wait for each other at specific
 * points in the test execution, creating coordinated load spikes.
 *
 * Like a fairground ride queue:
 * - VUs enter the queue and wait
 * - When enough VUs are waiting (release count), they all proceed together
 * - If timeout expires, waiting VUs are released regardless of count
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface RendezvousConfig {
  name: string;           // Unique name for the rendezvous point
  count: number;          // Number of VUs to wait for before releasing
  timeout?: number;       // Timeout in ms (default: 30000, 0 = no timeout)
  releasePolicy?: 'all' | 'count';  // 'all' releases all waiting, 'count' releases exactly count
}

interface WaitingVU {
  vuId: number;
  resolve: () => void;
  reject: (error: Error) => void;
  arrivalTime: number;
}

interface RendezvousPoint {
  config: RendezvousConfig;
  waiting: WaitingVU[];
  releasedCount: number;
  timeoutHandle?: NodeJS.Timeout;
}

export class RendezvousManager extends EventEmitter {
  private static instance: RendezvousManager;
  private rendezvousPoints: Map<string, RendezvousPoint> = new Map();
  private isActive: boolean = true;

  private constructor() {
    super();
  }

  static getInstance(): RendezvousManager {
    if (!RendezvousManager.instance) {
      RendezvousManager.instance = new RendezvousManager();
    }
    return RendezvousManager.instance;
  }

  /**
   * Reset the manager for a new test run
   */
  reset(): void {
    // Clear all timeout handles
    for (const point of this.rendezvousPoints.values()) {
      if (point.timeoutHandle) {
        clearTimeout(point.timeoutHandle);
      }
      // Release any waiting VUs
      for (const vu of point.waiting) {
        vu.reject(new Error('Rendezvous manager reset'));
      }
    }
    this.rendezvousPoints.clear();
    this.isActive = true;
    logger.debug('RendezvousManager reset');
  }

  /**
   * Stop the manager and release all waiting VUs
   */
  stop(): void {
    this.isActive = false;
    for (const point of this.rendezvousPoints.values()) {
      if (point.timeoutHandle) {
        clearTimeout(point.timeoutHandle);
      }
      // Release all waiting VUs
      this.releaseWaitingVUs(point, 'Test stopped');
    }
    logger.debug('RendezvousManager stopped');
  }

  /**
   * Wait at a rendezvous point
   * Returns when either:
   * - The required number of VUs are waiting (synchronized release)
   * - The timeout expires
   * - The test is stopped
   */
  async wait(config: RendezvousConfig, vuId: number): Promise<RendezvousResult> {
    if (!this.isActive) {
      return {
        released: true,
        reason: 'manager_inactive',
        waitTime: 0,
        vuCount: 0
      };
    }

    const startTime = Date.now();
    const pointName = config.name;

    // Get or create rendezvous point
    let point = this.rendezvousPoints.get(pointName);
    if (!point) {
      point = {
        config: {
          ...config,
          timeout: config.timeout ?? 30000,
          releasePolicy: config.releasePolicy ?? 'all'
        },
        waiting: [],
        releasedCount: 0
      };
      this.rendezvousPoints.set(pointName, point);
      logger.debug(`Rendezvous point '${pointName}' created (count: ${config.count}, timeout: ${point.config.timeout}ms)`);
    }

    logger.debug(`VU${vuId} arriving at rendezvous '${pointName}' (${point.waiting.length + 1}/${config.count})`);

    return new Promise<RendezvousResult>((resolve, reject) => {
      const waitingVU: WaitingVU = {
        vuId,
        resolve: () => {
          const waitTime = Date.now() - startTime;
          resolve({
            released: true,
            reason: 'count_reached',
            waitTime,
            vuCount: point!.waiting.length + 1
          });
        },
        reject,
        arrivalTime: startTime
      };

      point!.waiting.push(waitingVU);

      // Emit event for monitoring
      this.emit('vu_arrived', {
        rendezvousName: pointName,
        vuId,
        waitingCount: point!.waiting.length,
        requiredCount: config.count
      });

      // Check if we've reached the required count
      if (point!.waiting.length >= config.count) {
        logger.debug(`Rendezvous '${pointName}' reached count (${point!.waiting.length}/${config.count}) - releasing VUs`);
        this.releaseVUs(point!);
        return;
      }

      // Set up timeout if not already set and timeout > 0
      if (!point!.timeoutHandle && point!.config.timeout && point!.config.timeout > 0) {
        point!.timeoutHandle = setTimeout(() => {
          if (point!.waiting.length > 0) {
            logger.debug(`Rendezvous '${pointName}' timeout - releasing ${point!.waiting.length} VUs`);
            this.releaseVUs(point!, 'timeout');
          }
        }, point!.config.timeout);
      }
    });
  }

  /**
   * Release VUs from a rendezvous point
   */
  private releaseVUs(point: RendezvousPoint, reason: string = 'count_reached'): void {
    // Clear timeout
    if (point.timeoutHandle) {
      clearTimeout(point.timeoutHandle);
      point.timeoutHandle = undefined;
    }

    const toRelease = point.config.releasePolicy === 'count'
      ? point.waiting.splice(0, point.config.count)
      : point.waiting.splice(0);

    const releaseTime = Date.now();

    for (const vu of toRelease) {
      const waitTime = releaseTime - vu.arrivalTime;
      point.releasedCount++;

      // Resolve the promise
      vu.resolve();

      logger.debug(`VU${vu.vuId} released from rendezvous '${point.config.name}' (waited ${waitTime}ms, reason: ${reason})`);
    }

    // Emit release event
    this.emit('vus_released', {
      rendezvousName: point.config.name,
      releasedCount: toRelease.length,
      reason
    });

    // Reset timeout for next batch if there are remaining VUs
    if (point.waiting.length > 0 && point.config.timeout && point.config.timeout > 0) {
      point.timeoutHandle = setTimeout(() => {
        if (point.waiting.length > 0) {
          this.releaseVUs(point, 'timeout');
        }
      }, point.config.timeout);
    }
  }

  /**
   * Force release all waiting VUs (used during shutdown)
   */
  private releaseWaitingVUs(point: RendezvousPoint, reason: string): void {
    const toRelease = point.waiting.splice(0);
    for (const vu of toRelease) {
      vu.resolve();
    }

    this.emit('vus_released', {
      rendezvousName: point.config.name,
      releasedCount: toRelease.length,
      reason
    });
  }

  /**
   * Get statistics for a rendezvous point
   */
  getStats(name: string): RendezvousStats | null {
    const point = this.rendezvousPoints.get(name);
    if (!point) return null;

    return {
      name: point.config.name,
      requiredCount: point.config.count,
      currentlyWaiting: point.waiting.length,
      totalReleased: point.releasedCount,
      timeout: point.config.timeout ?? 0
    };
  }

  /**
   * Get all rendezvous statistics
   */
  getAllStats(): RendezvousStats[] {
    const stats: RendezvousStats[] = [];
    for (const point of this.rendezvousPoints.values()) {
      stats.push({
        name: point.config.name,
        requiredCount: point.config.count,
        currentlyWaiting: point.waiting.length,
        totalReleased: point.releasedCount,
        timeout: point.config.timeout ?? 0
      });
    }
    return stats;
  }
}

export interface RendezvousResult {
  released: boolean;
  reason: 'count_reached' | 'timeout' | 'manager_inactive' | 'error';
  waitTime: number;
  vuCount: number;
}

export interface RendezvousStats {
  name: string;
  requiredCount: number;
  currentlyWaiting: number;
  totalReleased: number;
  timeout: number;
}

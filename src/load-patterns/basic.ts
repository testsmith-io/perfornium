import { LoadPattern, VUFactory } from './base';
import { VirtualUser } from '../core';
import { parseTime, sleep } from '../utils/time';
import { logger } from '../utils/logger';

export class BasicPattern implements LoadPattern {
  async execute(config: any, vuFactory: VUFactory): Promise<void> {
    const virtualUsers = config.users || config.virtual_users || 1;
    const rampUpMs = parseTime(config.ramp_up || '0s');
    const durationMs = config.duration ? parseTime(config.duration) : null;

    if (durationMs) {
      logger.info(`🎯 Basic load: ${virtualUsers} VUs, ramp-up: ${(rampUpMs/1000).toFixed(1)}s, duration: ${(durationMs/1000).toFixed(1)}s`);
    } else {
      logger.info(`🎯 Basic load: ${virtualUsers} VUs, ramp-up: ${(rampUpMs/1000).toFixed(1)}s, run once`);
    }

    const intervalMs = rampUpMs > 0 ? rampUpMs / virtualUsers : 0;
    const vuPromises: Promise<void>[] = [];

    // Start virtual users with ramp-up
    for (let i = 0; i < virtualUsers; i++) {
      const vuPromise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          const vuStartTime = Date.now();
          
          try {
            // CRITICAL: Await VU creation to ensure CSV initialization
            logger.debug(`Creating VU ${i + 1}...`);
            const vu = await this.createVU(vuFactory, i + 1);
            logger.debug(`VU ${i + 1} ready`);

            // Record VU start for metrics and reporting
            const metrics = vuFactory.getMetrics();
            metrics.recordVUStart(vu.getId());

            logger.debug(`👤 Started VU ${vu.getId()}`);

            if (durationMs) {
              // Run for specified duration
              await this.runVUForDuration(vu, durationMs, vuStartTime);
            } else {
              // Run scenarios once
              await this.runVUOnce(vu);
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('terminated due to CSV data exhaustion')) {
              logger.info(`⏹️ VU ${i + 1} terminated due to CSV data exhaustion`);
            } else {
              logger.error(`❌ VU ${i + 1} error:`, error);
            }
          } finally {
            logger.debug(`🏁 VU ${i + 1} completed`);
          }
          resolve();
        }, i * intervalMs);
      });
      vuPromises.push(vuPromise);
    }

    // Wait for all VUs to complete (some may terminate early due to CSV exhaustion)
    await Promise.all(vuPromises);
    logger.debug(`✅ Basic pattern completed`);
  }

  private async createVU(vuFactory: VUFactory, id: number): Promise<VirtualUser> {
    const vu = vuFactory.create(id);
    if (vu instanceof Promise) {
      return await vu;
    }
    return vu as VirtualUser;
  }

  private async runVUOnce(vu: VirtualUser): Promise<void> {
    try {
      if (vu.isRunning()) {
        await vu.executeScenarios();
        logger.debug(`🏁 VU ${vu.getId()} completed scenario execution`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('terminated due to CSV data exhaustion')) {
        // This is expected - VU stopped due to CSV exhaustion
        throw error; // Re-throw to be caught by the calling code
      }
      logger.error(`⚠ VU ${vu.getId()} error during execution:`, error);
    } finally {
      vu.stop();
      logger.debug(`🏁 VU ${vu.getId()} completed and stopped`);
    }
  }

  private async runVUForDuration(vu: VirtualUser, durationMs: number, startTime: number): Promise<void> {
    const endTime = startTime + durationMs;

    while (Date.now() < endTime && vu.isRunning()) {
      try {
        // Execute all scenarios for this VU
        await vu.executeScenarios();
        
        // Check if we still have time for another iteration
        if (Date.now() >= endTime) {
          break;
        }
        
        // Small pause between full scenario loops
        await sleep(100);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('terminated due to CSV data exhaustion')) {
          logger.info(`⏹️ VU ${vu.getId()} terminated due to CSV data exhaustion`);
          break; // Exit the loop, but don't propagate the error
        }
        logger.error(`❌ VU ${vu.getId()} error during execution:`, error);
        break;
      }
    }
    
    vu.stop();
    logger.debug(`🏁 VU ${vu.getId()} completed after ${((Date.now() - startTime)/1000).toFixed(1)}s`);
  }
}
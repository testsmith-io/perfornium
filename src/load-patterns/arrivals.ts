import { LoadPattern, VUFactory } from './base';
import { parseTime, sleep } from '../utils/time';
import { logger } from '../utils/logger';
import { VirtualUser } from '../core';

export class ArrivalsPattern implements LoadPattern {
  async execute(config: any, vuFactory: VUFactory): Promise<void> {
    const rate = config.rate; // users per second
    const duration = parseTime(config.duration || '5m');
    const rampUp = parseTime(config.ramp_up || '0s');
    const vuDuration = parseTime(config.vu_duration || '30s'); // How long each VU runs

    if (!rate || rate <= 0) {
      throw new Error('Arrivals pattern requires a positive rate');
    }

    logger.info(`🎯 Arrivals: ${rate} users/sec, test duration: ${(duration/1000).toFixed(1)}s, VU duration: ${(vuDuration/1000).toFixed(1)}s`);

    const targetIntervalMs = 1000 / rate;
    let vuId = 0;
    let currentRate = 0;
    const testStartTime = Date.now();
    const testEndTime = testStartTime + duration;

    // Gradually ramp up to target rate
    if (rampUp > 0) {
      const rampSteps = Math.ceil(rampUp / 1000); // 1 second intervals
      const rateIncrement = rate / rampSteps;

      for (let step = 1; step <= rampSteps && Date.now() < testEndTime; step++) {
        currentRate = Math.min(rate, step * rateIncrement);
        const stepInterval = 1000 / currentRate;

        logger.debug(`📈 Ramp-up step ${step}/${rampSteps}: ${currentRate.toFixed(2)} users/sec`);

        const stepEndTime = Math.min(Date.now() + 1000, testEndTime);
        while (Date.now() < stepEndTime) {
          const vuStartTime = Date.now();
          
          // CRITICAL: Create and run VU but don't block the arrivals rate
          this.createAndRunVU(vuFactory, ++vuId, vuDuration, vuStartTime);

          await sleep(stepInterval);
          if (Date.now() >= testEndTime) {
            break;
          }
        }
      }
    }

    // Run at target rate for remaining duration
    const remainingTestTime = testEndTime - Date.now();
    if (remainingTestTime > 0) {
      logger.debug(`🎯 Running at target rate: ${rate} users/sec for ${(remainingTestTime/1000).toFixed(1)}s`);
      
      while (Date.now() < testEndTime) {
        const vuStartTime = Date.now();
        
        // CRITICAL: Create and run VU but don't block the arrivals rate
        this.createAndRunVU(vuFactory, ++vuId, vuDuration, vuStartTime);

        await sleep(targetIntervalMs);
      }
    }

    // Wait for the last VUs to complete (they might run beyond test end time)
    const lastVUEndTime = Date.now() + vuDuration;
    const finalWaitTime = Math.max(lastVUEndTime - Date.now(), 0);
    if (finalWaitTime > 0) {
      logger.debug(`⏳ Waiting ${(finalWaitTime/1000).toFixed(1)}s for last VUs to complete...`);
      await sleep(finalWaitTime);
    }

    logger.debug('✅ Arrivals pattern completed');
  }

  private async createAndRunVU(vuFactory: VUFactory, vuId: number, durationMs: number, startTime: number): Promise<void> {
    // Run VU creation and execution asynchronously to not block arrivals rate
    (async () => {
      try {
        logger.debug(`Creating VU ${vuId}...`);
        const vu = await this.createVU(vuFactory, vuId);
        logger.debug(`VU ${vuId} ready`);

        // Record VU start for metrics and reporting
        const metrics = vuFactory.getMetrics();
        metrics.recordVUStart(vu.getId());

        logger.debug(`👤 Started VU ${vu.getId()}`);
        
        // Run VU for its individual duration
        await this.runVUForDuration(vu, durationMs, startTime);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('terminated due to CSV data exhaustion')) {
          logger.info(`⏹️ VU ${vuId} terminated due to CSV data exhaustion`);
        } else {
          logger.error(`❌ Failed to create/run VU ${vuId}:`, error);
        }
      }
    })();
  }

  private async createVU(vuFactory: VUFactory, id: number): Promise<VirtualUser> {
    // Handle both sync and async factories
    const vu = vuFactory.create(id);
    if (vu instanceof Promise) {
      return await vu;
    }
    return vu as VirtualUser;
  }

  private async runVUForDuration(vu: VirtualUser, durationMs: number, startTime: number): Promise<void> {
    const endTime = startTime + durationMs;

    while (Date.now() < endTime && vu.isRunning()) {
      try {
        await vu.executeScenarios();
        if (Date.now() >= endTime) {
          break;
        }
        await sleep(100); // Small pause between iterations
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('terminated due to CSV data exhaustion')) {
          logger.info(`⏹️ VU ${vu.getId()} terminated due to CSV data exhaustion`);
          break; // Exit the loop, VU is already stopped
        }
        logger.error(`❌ VU ${vu.getId()} error:`, error);
        break;
      }
    }
    
    // VU cleanup happens automatically when it goes out of scope
    logger.debug(`🏁 VU ${vu.getId()} completed after ${((Date.now() - startTime)/1000).toFixed(1)}s`);
  }
}
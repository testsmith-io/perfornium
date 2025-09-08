import { LoadPattern, VUFactory } from './base';
import { parseTime, sleep } from '../utils/time';
import { logger } from '../utils/logger';
import { VirtualUser } from '../core/virtual-user';

export class SteppingPattern implements LoadPattern {
  async execute(config: any, vuFactory: VUFactory): Promise<void> {
    const steps = config.steps;
    if (!steps || steps.length === 0) {
      throw new Error('Stepping pattern requires steps configuration');
    }

    let currentVUs = 0;
    const activeVUs: Array<{ vu: VirtualUser; startTime: number; endTime: number }> = [];

    logger.info(`📊 Stepping load: ${steps.length} steps`);

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      const targetUsers = step.users;
      const stepDuration = parseTime(step.duration);
      const rampUp = parseTime(step.ramp_up || '0s');

      logger.info(`📈 Step ${stepIndex + 1}/${steps.length}: ${currentVUs} → ${targetUsers} users over ${(stepDuration/1000).toFixed(1)}s`);

      if (targetUsers > currentVUs) {
        // Scale up: Add new users
        const usersToAdd = targetUsers - currentVUs;
        const rampUpInterval = rampUp > 0 ? rampUp / usersToAdd : 0;

        for (let i = 0; i < usersToAdd; i++) {
          setTimeout(async () => {
            const vuStartTime = Date.now();
            const vuEndTime = vuStartTime + stepDuration;
            const vuId = currentVUs + i + 1;
            
            try {
              // CRITICAL: Await VU creation to ensure CSV initialization
              console.log(`🔧 Creating VU ${vuId}...`);
              const vu = await this.createVU(vuFactory, vuId);
              console.log(`✅ VU ${vuId} ready`);

              activeVUs.push({ vu, startTime: vuStartTime, endTime: vuEndTime });

              logger.debug(`👤 Started VU ${vu.getId()}`);

              // Run VU for this step's duration
              await this.runVUForDuration(vu, stepDuration, vuStartTime);
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              if (errorMessage.includes('terminated due to CSV data exhaustion')) {
                logger.info(`⏹️ VU ${vuId} terminated due to CSV data exhaustion`);
              } else {
                logger.error(`❌ Failed to create/run VU ${vuId}:`, error);
              }
            }
          }, i * rampUpInterval);
        }

        // Wait for ramp-up
        if (rampUp > 0) {
          await sleep(rampUp);
        }
      } else if (targetUsers < currentVUs) {
        // Scale down: Stop some users
        logger.debug(`📉 Scaling down from ${currentVUs} to ${targetUsers} users`);
        const usersToStop = currentVUs - targetUsers;
        
        // Stop the most recently started VUs
        const vusToStop = activeVUs
          .filter(vuInfo => vuInfo.vu.isRunning())
          .slice(-usersToStop);

        vusToStop.forEach(vuInfo => {
          vuInfo.vu.stop();
          logger.debug(`⏹️ Stopped VU ${vuInfo.vu.getId()}`);
        });
      }

      currentVUs = targetUsers;

      // Wait for step duration (minus ramp-up time)
      const waitTime = Math.max(stepDuration - rampUp, 0);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }

    // Wait for all remaining VUs to complete
    const remainingVUs = activeVUs.filter(vuInfo => vuInfo.vu.isRunning());
    if (remainingVUs.length > 0) {
      logger.debug(`⏳ Waiting for ${remainingVUs.length} VUs to complete...`);
      const maxEndTime = Math.max(...remainingVUs.map(vuInfo => vuInfo.endTime));
      const waitTime = Math.max(maxEndTime - Date.now(), 0);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }

    logger.debug('✅ Stepping pattern completed');
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
    logger.debug(`🏁 VU ${vu.getId()} completed step execution`);
  }
}

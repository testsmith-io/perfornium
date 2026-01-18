import { Scenario } from '../../config/types/hooks';
import { sleep, randomBetween, parseTime } from '../../utils/time';
import { logger } from '../../utils/logger';

export class ThinkTimeStrategy {
  private globalThinkTime?: string | number;

  constructor(globalThinkTime?: string | number) {
    this.globalThinkTime = globalThinkTime;
  }

  /**
   * Get effective think time using hierarchical override:
   * Step think_time > Scenario think_time > Global think_time
   */
  getEffectiveThinkTime(step: any, scenario: Scenario): string | number | undefined {
    // Step level has highest priority
    if (step.think_time !== undefined) {
      return step.think_time;
    }

    // Scenario level is next
    if (scenario.think_time !== undefined) {
      return scenario.think_time;
    }

    // Global level is fallback
    return this.globalThinkTime;
  }

  async applyThinkTime(thinkTime?: string | number): Promise<void> {
    if (!thinkTime) {
      return;
    }

    if (typeof thinkTime === 'number') {
      logger.debug(`Applying thinktime: ${thinkTime} seconds`);
      await sleep(thinkTime * 1000);
      return;
    }

    const rangeMatch = thinkTime.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([sm])?$/);
    if (rangeMatch) {
      const [, minStr, maxStr, unit] = rangeMatch;
      let min = parseFloat(minStr);
      let max = parseFloat(maxStr);

      if (unit === 's' || !unit) {
        min *= 1000;
        max *= 1000;
      }

      const thinkTimeMs = randomBetween(min, max);
      await sleep(thinkTimeMs);
    } else {
      try {
        const thinkTimeMs = parseTime(thinkTime);
        await sleep(thinkTimeMs);
      } catch (error) {
        logger.warn(`⚠️ Invalid think time format: ${thinkTime}`);
        await sleep(randomBetween(1000, 3000));
      }
    }
  }

  /**
   * Check if the next step is a verification/wait step that should not have think time before it
   */
  shouldSkipThinkTime(nextStep: any): boolean {
    if (!nextStep) return false;

    const nextCommand = nextStep?.action?.command || '';
    return nextCommand.startsWith('verify_') ||
           nextCommand.startsWith('wait_for_') ||
           nextCommand === 'measure_web_vitals' ||
           nextCommand === 'performance_audit';
  }
}

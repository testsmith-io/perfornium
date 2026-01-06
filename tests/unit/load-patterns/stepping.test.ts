import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SteppingPattern } from '../../../src/load-patterns/stepping';
import { VUFactory } from '../../../src/load-patterns/base';
import { MetricsCollector } from '../../../src/metrics/collector';

// Mock VirtualUser
const createMockVU = (id: number) => {
  let running = true;
  let executionCount = 0;

  return {
    getId: () => id,
    isRunning: () => running,
    stop: () => { running = false; },
    executeScenarios: vi.fn(async () => {
      executionCount++;
      await new Promise(resolve => setTimeout(resolve, 5));
    }),
    getExecutionCount: () => executionCount
  };
};

// Mock VUFactory
const createMockFactory = () => {
  const metrics = new MetricsCollector({
    enabled: false,
    incremental_files: { enabled: false }
  });
  metrics.start();

  const createdVUs: ReturnType<typeof createMockVU>[] = [];

  return {
    factory: {
      create: vi.fn((id: number) => {
        const vu = createMockVU(id);
        createdVUs.push(vu);
        return vu;
      }),
      getMetrics: () => metrics
    } as unknown as VUFactory,
    metrics,
    getCreatedVUs: () => createdVUs
  };
};

describe('SteppingPattern', () => {
  let pattern: SteppingPattern;

  beforeEach(() => {
    pattern = new SteppingPattern();
  });

  describe('execute()', () => {
    it('should throw error when steps is not specified', async () => {
      const { factory } = createMockFactory();

      await expect(pattern.execute({}, factory)).rejects.toThrow('Stepping pattern requires steps configuration');
    });

    it('should throw error when steps is empty', async () => {
      const { factory } = createMockFactory();

      await expect(pattern.execute({
        steps: []
      }, factory)).rejects.toThrow('Stepping pattern requires steps configuration');
    });

    it('should execute single step correctly', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 3, duration: '100ms' }
        ]
      }, factory);

      expect(getCreatedVUs().length).toBe(3);
    });

    it('should scale up users between steps', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 2, duration: '50ms' },
          { users: 5, duration: '50ms' }
        ]
      }, factory);

      // Should have created 5 VUs total (2 in step 1 + 3 more in step 2)
      expect(getCreatedVUs().length).toBe(5);
    });

    it('should scale down users between steps', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 4, duration: '50ms' },
          { users: 2, duration: '50ms' }
        ]
      }, factory);

      const vus = getCreatedVUs();
      // Should have created 4 VUs in step 1
      expect(vus.length).toBe(4);

      // Some VUs should be stopped
      const stoppedVUs = vus.filter(vu => !vu.isRunning());
      expect(stoppedVUs.length).toBeGreaterThanOrEqual(2);
    });

    it('should record VU start events in metrics', async () => {
      const { factory, metrics } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 3, duration: '50ms' }
        ]
      }, factory);

      const summary = metrics.getSummary();
      expect(summary.vu_ramp_up.length).toBe(3);
    });

    it('should handle multiple steps with varying user counts', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 2, duration: '30ms' },
          { users: 4, duration: '30ms' },
          { users: 3, duration: '30ms' },
          { users: 1, duration: '30ms' }
        ]
      }, factory);

      // Should have created max(2, 4, 3, 1) = 4 VUs total
      expect(getCreatedVUs().length).toBe(4);
    });

    it('should handle ramp_up within steps', async () => {
      const { factory, getCreatedVUs } = createMockFactory();
      const startTime = Date.now();

      await pattern.execute({
        steps: [
          { users: 3, duration: '100ms', ramp_up: '50ms' }
        ]
      }, factory);

      const elapsed = Date.now() - startTime;
      // Should take at least step duration
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(getCreatedVUs().length).toBe(3);
    });

    it('should handle steps with same user count', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 3, duration: '30ms' },
          { users: 3, duration: '30ms' } // Same count
        ]
      }, factory);

      // Should maintain the same VUs
      expect(getCreatedVUs().length).toBe(3);
    });

    it('should assign sequential VU IDs', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 3, duration: '50ms' }
        ]
      }, factory);

      const vus = getCreatedVUs();
      const ids = vus.map(vu => vu.getId());
      // IDs should be sequential (consecutive numbers)
      expect(ids.length).toBe(3);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBe(ids[i - 1] + 1);
      }
    });

    it('should execute scenarios during step duration', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 1, duration: '100ms' }
        ]
      }, factory);

      const vus = getCreatedVUs();
      // VU should have executed scenarios at least once
      expect(vus[0].executeScenarios).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle VU execution errors gracefully', async () => {
      const metrics = new MetricsCollector({
        enabled: false,
        incremental_files: { enabled: false }
      });
      metrics.start();

      const errorVU = {
        getId: () => 1,
        isRunning: () => true,
        stop: vi.fn(),
        executeScenarios: vi.fn(async () => {
          throw new Error('Test error');
        })
      };

      const factory: VUFactory = {
        create: () => errorVU as any,
        getMetrics: () => metrics
      };

      // Should not throw
      await expect(pattern.execute({
        steps: [{ users: 1, duration: '50ms' }]
      }, factory)).resolves.not.toThrow();
    });

    it('should handle CSV exhaustion gracefully', async () => {
      const metrics = new MetricsCollector({
        enabled: false,
        incremental_files: { enabled: false }
      });
      metrics.start();

      const csvExhaustedVU = {
        getId: () => 1,
        isRunning: () => true,
        stop: vi.fn(),
        executeScenarios: vi.fn(async () => {
          throw new Error('terminated due to CSV data exhaustion');
        })
      };

      const factory: VUFactory = {
        create: () => csvExhaustedVU as any,
        getMetrics: () => metrics
      };

      // Should not throw
      await expect(pattern.execute({
        steps: [{ users: 1, duration: '50ms' }]
      }, factory)).resolves.not.toThrow();
    });

    it('should handle VU creation errors gracefully', async () => {
      const metrics = new MetricsCollector({
        enabled: false,
        incremental_files: { enabled: false }
      });
      metrics.start();

      let callCount = 0;
      const factory: VUFactory = {
        create: () => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Creation failed');
          }
          return createMockVU(callCount) as any;
        },
        getMetrics: () => metrics
      };

      // Should not throw even if some VU creations fail
      await expect(pattern.execute({
        steps: [{ users: 3, duration: '50ms' }]
      }, factory)).resolves.not.toThrow();
    });
  });

  describe('step transitions', () => {
    it('should wait for step duration before transitioning', async () => {
      const { factory } = createMockFactory();
      const startTime = Date.now();

      await pattern.execute({
        steps: [
          { users: 2, duration: '80ms' },
          { users: 1, duration: '80ms' }
        ]
      }, factory);

      const elapsed = Date.now() - startTime;
      // Should take at least sum of step durations
      expect(elapsed).toBeGreaterThanOrEqual(140);
    });

    it('should stop extra VUs when scaling down', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        steps: [
          { users: 5, duration: '50ms' },
          { users: 2, duration: '50ms' }
        ]
      }, factory);

      const vus = getCreatedVUs();
      const runningVUs = vus.filter(vu => vu.isRunning());
      const stoppedVUs = vus.filter(vu => !vu.isRunning());

      // After scaling down from 5 to 2, at least 3 should be stopped
      expect(stoppedVUs.length).toBeGreaterThanOrEqual(3);
    });
  });
});

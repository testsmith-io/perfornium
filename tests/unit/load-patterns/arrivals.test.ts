import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArrivalsPattern } from '../../../src/load-patterns/arrivals';
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

describe('ArrivalsPattern', () => {
  let pattern: ArrivalsPattern;

  beforeEach(() => {
    pattern = new ArrivalsPattern();
  });

  describe('execute()', () => {
    it('should throw error when rate is not specified', async () => {
      const { factory } = createMockFactory();

      await expect(pattern.execute({
        duration: '1s'
      }, factory)).rejects.toThrow('Arrivals pattern requires a positive rate');
    });

    it('should throw error when rate is zero', async () => {
      const { factory } = createMockFactory();

      await expect(pattern.execute({
        rate: 0,
        duration: '1s'
      }, factory)).rejects.toThrow('Arrivals pattern requires a positive rate');
    });

    it('should throw error when rate is negative', async () => {
      const { factory } = createMockFactory();

      await expect(pattern.execute({
        rate: -5,
        duration: '1s'
      }, factory)).rejects.toThrow('Arrivals pattern requires a positive rate');
    });

    it('should create VUs at specified rate', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      // 10 users/sec for 500ms = ~5 users
      await pattern.execute({
        rate: 10,
        duration: '500ms',
        vu_duration: '100ms'
      }, factory);

      const vus = getCreatedVUs();
      // Allow some variance due to timing
      expect(vus.length).toBeGreaterThanOrEqual(3);
      expect(vus.length).toBeLessThanOrEqual(7);
    });

    it('should record VU start events in metrics', async () => {
      const { factory, metrics, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        rate: 5,
        duration: '300ms',
        vu_duration: '100ms'
      }, factory);

      const summary = metrics.getSummary();
      // Should have recorded start events for all created VUs
      expect(summary.vu_ramp_up.length).toBe(getCreatedVUs().length);
    });

    it('should use default duration when not specified', async () => {
      const { factory } = createMockFactory();

      // This will use default 5m duration - we just verify it doesn't throw
      const executePromise = pattern.execute({
        rate: 100, // High rate
        vu_duration: '10ms'
      }, factory);

      // Cancel after a short time to not wait for full duration
      await Promise.race([
        executePromise,
        new Promise(resolve => setTimeout(resolve, 100))
      ]);
    });

    it('should use provided vu_duration', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        rate: 10,
        duration: '200ms',
        vu_duration: '100ms' // Short duration for test
      }, factory);

      // VUs should be created
      expect(getCreatedVUs().length).toBeGreaterThan(0);
    });

    it('should handle ramp_up period', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        rate: 10,
        duration: '300ms',
        ramp_up: '100ms',
        vu_duration: '50ms'
      }, factory);

      // Should have created VUs during both ramp-up and steady state
      expect(getCreatedVUs().length).toBeGreaterThan(0);
    });

    it('should not block arrivals rate while VUs run', async () => {
      const { factory, getCreatedVUs } = createMockFactory();
      const startTime = Date.now();

      await pattern.execute({
        rate: 20, // 20 users/sec
        duration: '200ms',
        vu_duration: '500ms' // VUs run longer than test duration
      }, factory);

      const elapsed = Date.now() - startTime;

      // Should complete in roughly duration + vu_duration time
      // Allow for timing variance
      expect(elapsed).toBeLessThan(1500);
      expect(getCreatedVUs().length).toBeGreaterThan(0);
    });

    it('should assign incrementing VU IDs', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        rate: 5,
        duration: '200ms',
        vu_duration: '50ms'
      }, factory);

      const vus = getCreatedVUs();
      // IDs should be sequential
      for (let i = 0; i < vus.length - 1; i++) {
        expect(vus[i + 1].getId()).toBeGreaterThan(vus[i].getId());
      }
    });
  });

  describe('error handling', () => {
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
        rate: 10,
        duration: '200ms',
        vu_duration: '50ms'
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
        rate: 5,
        duration: '100ms',
        vu_duration: '50ms'
      }, factory)).resolves.not.toThrow();
    });
  });
});

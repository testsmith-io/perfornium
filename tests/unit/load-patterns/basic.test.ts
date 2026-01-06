import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasicPattern } from '../../../src/load-patterns/basic';
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
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
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

describe('BasicPattern', () => {
  let pattern: BasicPattern;

  beforeEach(() => {
    pattern = new BasicPattern();
  });

  describe('execute()', () => {
    it('should create correct number of virtual users', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        users: 3
      }, factory);

      expect(getCreatedVUs().length).toBe(3);
    });

    it('should use virtual_users as alias for users', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        virtual_users: 5
      }, factory);

      expect(getCreatedVUs().length).toBe(5);
    });

    it('should default to 1 user when not specified', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({}, factory);

      expect(getCreatedVUs().length).toBe(1);
    });

    it('should record VU start events in metrics', async () => {
      const { factory, metrics } = createMockFactory();

      await pattern.execute({
        users: 2
      }, factory);

      const summary = metrics.getSummary();
      expect(summary.vu_ramp_up.length).toBe(2);
    });

    it('should execute scenarios once when no duration specified', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        users: 1
      }, factory);

      const vus = getCreatedVUs();
      expect(vus[0].executeScenarios).toHaveBeenCalled();
    });

    it('should stop VUs after execution completes', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        users: 2
      }, factory);

      const vus = getCreatedVUs();
      vus.forEach(vu => {
        expect(vu.isRunning()).toBe(false);
      });
    });

    it('should handle ramp_up timing', async () => {
      const { factory, getCreatedVUs } = createMockFactory();
      const startTime = Date.now();

      await pattern.execute({
        users: 3,
        ramp_up: '150ms'
      }, factory);

      const elapsed = Date.now() - startTime;
      // Should take at least ~150ms for ramp-up (allow some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(getCreatedVUs().length).toBe(3);
    });

    it('should run for specified duration', async () => {
      const { factory, getCreatedVUs } = createMockFactory();
      const startTime = Date.now();

      await pattern.execute({
        users: 1,
        duration: '200ms'
      }, factory);

      const elapsed = Date.now() - startTime;
      // Should run for approximately the duration
      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(elapsed).toBeLessThan(500);

      // VU should have executed scenarios multiple times
      const vus = getCreatedVUs();
      expect(vus[0].getExecutionCount()).toBeGreaterThan(1);
    });

    it('should handle zero ramp_up', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        users: 3,
        ramp_up: '0s'
      }, factory);

      expect(getCreatedVUs().length).toBe(3);
    });

    it('should assign sequential VU IDs', async () => {
      const { factory, getCreatedVUs } = createMockFactory();

      await pattern.execute({
        users: 5
      }, factory);

      const vus = getCreatedVUs();
      expect(vus.map(vu => vu.getId())).toEqual([1, 2, 3, 4, 5]);
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
      await expect(pattern.execute({ users: 1 }, factory)).resolves.not.toThrow();
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
      await expect(pattern.execute({ users: 1 }, factory)).resolves.not.toThrow();
    });
  });
});

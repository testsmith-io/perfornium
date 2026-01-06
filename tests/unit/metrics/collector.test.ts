import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector } from '../../../src/metrics/collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    // Create collector with real-time disabled to avoid file operations
    collector = new MetricsCollector({
      enabled: false,
      incremental_files: { enabled: false }
    });
    collector.start();
  });

  describe('constructor', () => {
    it('should create a new MetricsCollector instance', () => {
      expect(collector).toBeInstanceOf(MetricsCollector);
    });
  });

  describe('start()', () => {
    it('should reset metrics on start', () => {
      const summary = collector.getSummary();

      expect(summary.total_requests).toBe(0);
      expect(summary.failed_requests).toBe(0);
    });
  });

  describe('recordResult()', () => {
    it('should record a successful result', () => {
      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /test',
        step_name: 'Test Step',
        duration: 100,
        success: true,
        status: 200
      });

      const summary = collector.getSummary();
      expect(summary.total_requests).toBe(1);
      expect(summary.failed_requests).toBe(0);
      expect(summary.success_rate).toBe(100);
    });

    it('should record a failed result', () => {
      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /test',
        step_name: 'Test Step',
        duration: 100,
        success: false,
        status: 500,
        error: 'Server error'
      });

      const summary = collector.getSummary();
      expect(summary.total_requests).toBe(1);
      expect(summary.failed_requests).toBe(1);
      expect(summary.success_rate).toBe(0);
    });

    it('should track multiple results', () => {
      // Record 3 successful, 1 failed
      for (let i = 0; i < 3; i++) {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: 1,
          scenario: 'Test',
          action: 'GET /test',
          step_name: 'Test Step',
          duration: 100 + i * 10,
          success: true,
          status: 200
        });
      }

      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /test',
        step_name: 'Test Step',
        duration: 500,
        success: false,
        status: 500
      });

      const summary = collector.getSummary();
      expect(summary.total_requests).toBe(4);
      expect(summary.failed_requests).toBe(1);
      expect(summary.success_rate).toBe(75);
    });

    it('should emit result event', () => {
      const eventHandler = vi.fn();
      collector.on('result', eventHandler);

      const result = {
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /test',
        step_name: 'Test Step',
        duration: 100,
        success: true,
        status: 200
      };

      collector.recordResult(result);

      expect(eventHandler).toHaveBeenCalledWith(result);
    });
  });

  describe('recordVUStart()', () => {
    it('should record VU start events', () => {
      collector.recordVUStart(1);
      collector.recordVUStart(2);
      collector.recordVUStart(3);

      const summary = collector.getSummary();
      expect(summary.vu_ramp_up).toBeDefined();
      expect(summary.vu_ramp_up.length).toBe(3);
    });

    it('should record VU start with correct VU ID', () => {
      collector.recordVUStart(42);

      const summary = collector.getSummary();
      expect(summary.vu_ramp_up[0].vu_id).toBe(42);
    });

    it('should record start time for VU', () => {
      const beforeTime = Date.now();
      collector.recordVUStart(1);
      const afterTime = Date.now();

      const summary = collector.getSummary();
      expect(summary.vu_ramp_up[0].start_time).toBeGreaterThanOrEqual(beforeTime);
      expect(summary.vu_ramp_up[0].start_time).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getSummary()', () => {
    it('should return correct summary for empty results', () => {
      const summary = collector.getSummary();

      expect(summary.total_requests).toBe(0);
      expect(summary.failed_requests).toBe(0);
      // Empty results should have 100% success rate (no failures)
      expect(summary.avg_response_time).toBe(0);
    });

    it('should calculate average response time correctly', () => {
      const durations = [100, 200, 300];
      durations.forEach((duration) => {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: 1,
          scenario: 'Test',
          action: 'GET /test',
          step_name: 'Test Step',
          duration,
          success: true,
          status: 200
        });
      });

      const summary = collector.getSummary();
      expect(summary.avg_response_time).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should track min and max response times', () => {
      const durations = [50, 100, 200, 150];
      durations.forEach((duration) => {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: 1,
          scenario: 'Test',
          action: 'GET /test',
          step_name: 'Test Step',
          duration,
          success: true,
          status: 200
        });
      });

      const summary = collector.getSummary();
      expect(summary.min_response_time).toBe(50);
      expect(summary.max_response_time).toBe(200);
    });

    it('should track status code distribution', () => {
      const statuses = [200, 200, 201, 404, 500];
      statuses.forEach((status) => {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: 1,
          scenario: 'Test',
          action: 'GET /test',
          step_name: 'Test Step',
          duration: 100,
          success: status < 400,
          status
        });
      });

      const summary = collector.getSummary();
      expect(summary.status_distribution['200']).toBe(2);
      expect(summary.status_distribution['201']).toBe(1);
      expect(summary.status_distribution['404']).toBe(1);
      expect(summary.status_distribution['500']).toBe(1);
    });
  });

  describe('getResults()', () => {
    it('should return all recorded results', () => {
      for (let i = 0; i < 5; i++) {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: i + 1,
          scenario: 'Test',
          action: `GET /test/${i}`,
          step_name: `Step ${i}`,
          duration: 100,
          success: true,
          status: 200
        });
      }

      const results = collector.getResults();
      expect(results.length).toBe(5);
    });

    it('should preserve result order', () => {
      for (let i = 0; i < 3; i++) {
        collector.recordResult({
          timestamp: Date.now() + i,
          vu_id: i + 1,
          scenario: 'Test',
          action: `Action ${i}`,
          step_name: `Step ${i}`,
          duration: 100,
          success: true,
          status: 200
        });
      }

      const results = collector.getResults();
      expect(results[0].action).toBe('Action 0');
      expect(results[1].action).toBe('Action 1');
      expect(results[2].action).toBe('Action 2');
    });
  });

  describe('error tracking', () => {
    it('should track error details', () => {
      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /test',
        step_name: 'Test Step',
        duration: 100,
        success: false,
        status: 500,
        error: 'Connection timeout',
        request_url: 'http://example.com/test'
      });

      const summary = collector.getSummary();
      expect(summary.error_details).toBeDefined();
      expect(summary.error_details.length).toBeGreaterThan(0);
    });

    it('should aggregate same errors', () => {
      // Record same error multiple times
      for (let i = 0; i < 5; i++) {
        collector.recordResult({
          timestamp: Date.now(),
          vu_id: 1,
          scenario: 'Test',
          action: 'GET /test',
          step_name: 'Test Step',
          duration: 100,
          success: false,
          status: 500,
          error: 'Connection timeout'
        });
      }

      const summary = collector.getSummary();
      // Should aggregate into one error detail with count of 5
      const timeoutErrors = summary.error_details.filter(
        (e: any) => e.error === 'Connection timeout'
      );
      expect(timeoutErrors.length).toBe(1);
      expect(timeoutErrors[0].count).toBe(5);
    });
  });

  describe('step statistics', () => {
    it('should track per-step statistics', () => {
      // Record results for different steps
      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'GET /users',
        step_name: 'Get Users',
        duration: 100,
        success: true,
        status: 200
      });

      collector.recordResult({
        timestamp: Date.now(),
        vu_id: 1,
        scenario: 'Test',
        action: 'POST /users',
        step_name: 'Create User',
        duration: 200,
        success: true,
        status: 201
      });

      const summary = collector.getSummary();
      expect(summary.step_statistics).toBeDefined();
    });
  });
});

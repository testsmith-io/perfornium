import { describe, it, expect } from 'vitest';
import { parseTime, sleep } from '../../../src/utils/time';

describe('Time Utilities', () => {
  describe('parseTime()', () => {
    describe('seconds parsing', () => {
      it('should parse seconds with "s" suffix', () => {
        expect(parseTime('1s')).toBe(1000);
        expect(parseTime('10s')).toBe(10000);
        expect(parseTime('60s')).toBe(60000);
      });

      it('should parse decimal seconds', () => {
        expect(parseTime('0.5s')).toBe(500);
        expect(parseTime('1.5s')).toBe(1500);
        expect(parseTime('2.25s')).toBe(2250);
      });
    });

    describe('milliseconds parsing', () => {
      it('should parse milliseconds with "ms" suffix', () => {
        expect(parseTime('100ms')).toBe(100);
        expect(parseTime('500ms')).toBe(500);
        expect(parseTime('1000ms')).toBe(1000);
      });

      it('should parse decimal milliseconds', () => {
        expect(parseTime('100.5ms')).toBe(100.5);
      });
    });

    describe('minutes parsing', () => {
      it('should parse minutes with "m" suffix', () => {
        expect(parseTime('1m')).toBe(60000);
        expect(parseTime('5m')).toBe(300000);
        expect(parseTime('10m')).toBe(600000);
      });

      it('should parse decimal minutes', () => {
        expect(parseTime('0.5m')).toBe(30000);
        expect(parseTime('1.5m')).toBe(90000);
      });
    });

    describe('hours parsing', () => {
      it('should parse hours with "h" suffix', () => {
        expect(parseTime('1h')).toBe(3600000);
        expect(parseTime('2h')).toBe(7200000);
      });

      it('should parse decimal hours', () => {
        expect(parseTime('0.5h')).toBe(1800000);
      });
    });

    describe('numeric input', () => {
      it('should return number input as-is (treated as ms)', () => {
        expect(parseTime(1000)).toBe(1000);
        expect(parseTime(500)).toBe(500);
      });
    });

    describe('edge cases', () => {
      it('should handle zero values', () => {
        expect(parseTime('0s')).toBe(0);
        expect(parseTime('0ms')).toBe(0);
        expect(parseTime('0m')).toBe(0);
        expect(parseTime(0)).toBe(0);
      });
    });

    describe('invalid input', () => {
      it('should throw for invalid suffix', () => {
        expect(() => parseTime('10x')).toThrow('Invalid time format');
        expect(() => parseTime('abc')).toThrow('Invalid time format');
      });

      it('should throw for empty string', () => {
        expect(() => parseTime('')).toThrow('Invalid time format');
      });

      it('should throw for undefined/null', () => {
        expect(() => parseTime(undefined as any)).toThrow();
        expect(() => parseTime(null as any)).toThrow();
      });

      it('should throw for numeric string without suffix', () => {
        expect(() => parseTime('1000')).toThrow('Invalid time format');
      });

      it('should throw for whitespace-padded input', () => {
        expect(() => parseTime(' 10s ')).toThrow('Invalid time format');
      });

      it('should throw for uppercase suffixes', () => {
        expect(() => parseTime('10S')).toThrow('Invalid time format');
      });
    });
  });

  describe('sleep()', () => {
    it('should delay execution for specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });

    it('should resolve with undefined', async () => {
      const result = await sleep(10);
      expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { TimestampHelper } from '../../../src/utils/timestamp-helper';

describe('TimestampHelper', () => {
  describe('getTimestamp()', () => {
    describe('unix format', () => {
      it('should return unix timestamp as string', () => {
        const result = TimestampHelper.getTimestamp('unix');
        expect(typeof result).toBe('string');

        const timestamp = parseInt(result);
        expect(timestamp).toBeGreaterThan(Date.now() - 1000);
        expect(timestamp).toBeLessThanOrEqual(Date.now());
      });

      it('should return numeric characters only', () => {
        const result = TimestampHelper.getTimestamp('unix');
        expect(result).toMatch(/^\d+$/);
      });
    });

    describe('iso format', () => {
      it('should return ISO 8601 format', () => {
        const result = TimestampHelper.getTimestamp('iso');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should be parseable as date', () => {
        const result = TimestampHelper.getTimestamp('iso');
        const date = new Date(result);
        expect(date.getTime()).not.toBeNaN();
      });
    });

    describe('readable format', () => {
      it('should return human-readable format', () => {
        const result = TimestampHelper.getTimestamp('readable');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should not contain slashes, spaces, or colons', () => {
        const result = TimestampHelper.getTimestamp('readable');
        expect(result).not.toMatch(/[/\s:]/);
      });
    });

    describe('file format', () => {
      it('should return filename-safe format', () => {
        const result = TimestampHelper.getTimestamp('file');

        // Should be YYYYMMDD-HHMMSS-mmm format
        expect(result).toMatch(/^\d{8}-\d{6}-\d{3}$/);
      });

      it('should not contain characters invalid for filenames', () => {
        const result = TimestampHelper.getTimestamp('file');
        expect(result).not.toMatch(/[/\\:*?"<>|]/);
      });

      it('should be unique across calls', async () => {
        const results = new Set<string>();

        for (let i = 0; i < 10; i++) {
          results.add(TimestampHelper.getTimestamp('file'));
          // Wait 2ms to ensure millisecond component differs
          await new Promise(resolve => setTimeout(resolve, 2));
        }

        // Most timestamps should be unique (allow for minor timing variance)
        expect(results.size).toBeGreaterThanOrEqual(8);
      });
    });

    describe('default format', () => {
      it('should default to unix format', () => {
        const result = TimestampHelper.getTimestamp();
        expect(result).toMatch(/^\d+$/);
      });
    });
  });

  describe('createTimestampedPath()', () => {
    it('should replace {{timestamp}} placeholder', () => {
      const template = 'results/test-{{timestamp}}.json';
      const result = TimestampHelper.createTimestampedPath(template);

      expect(result).not.toContain('{{timestamp}}');
      expect(result).toContain('results/test-');
      expect(result).toContain('.json');
    });

    it('should replace multiple placeholders', () => {
      const template = '{{timestamp}}/report-{{timestamp}}.html';
      const result = TimestampHelper.createTimestampedPath(template);

      expect(result).not.toContain('{{timestamp}}');
    });

    it('should use specified format', () => {
      const template = 'results/test-{{timestamp}}.json';
      const result = TimestampHelper.createTimestampedPath(template, 'file');

      // Should have file format timestamp (YYYYMMDD-HHMMSS-mmm)
      expect(result).toMatch(/test-\d{8}-\d{6}-\d{3}\.json$/);
    });

    it('should return template unchanged if no placeholder', () => {
      const template = 'results/test.json';
      const result = TimestampHelper.createTimestampedPath(template);

      expect(result).toBe(template);
    });
  });

  describe('generateUniqueFilename()', () => {
    it('should replace {{timestamp}} placeholder', () => {
      const template = 'output-{{timestamp}}.csv';
      const result = TimestampHelper.generateUniqueFilename(template);

      expect(result).not.toContain('{{timestamp}}');
      expect(result).toContain('output-');
      expect(result).toContain('.csv');
    });

    it('should replace {{unique}} placeholder', () => {
      const template = 'output-{{unique}}.csv';
      const result = TimestampHelper.generateUniqueFilename(template);

      expect(result).not.toContain('{{unique}}');
    });

    it('should generate unique values', async () => {
      const template = 'output-{{unique}}.csv';
      const results = new Set<string>();

      for (let i = 0; i < 10; i++) {
        results.add(TimestampHelper.generateUniqueFilename(template));
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      expect(results.size).toBe(10);
    });

    it('should handle both placeholders', () => {
      const template = '{{timestamp}}/file-{{unique}}.txt';
      const result = TimestampHelper.generateUniqueFilename(template);

      expect(result).not.toContain('{{timestamp}}');
      expect(result).not.toContain('{{unique}}');
    });
  });

  describe('edge cases', () => {
    it('should handle empty template', () => {
      const result = TimestampHelper.createTimestampedPath('');
      expect(result).toBe('');
    });

    it('should handle template with only placeholder', () => {
      const result = TimestampHelper.createTimestampedPath('{{timestamp}}');
      // Default format is 'file' which returns YYYYMMDD-HHMMSS-mmm
      expect(result).toMatch(/^\d{8}-\d{6}-\d{3}$/);
    });
  });
});

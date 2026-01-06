import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateProcessor } from '../../../src/utils/template';

describe('TemplateProcessor', () => {
  let processor: TemplateProcessor;

  beforeEach(() => {
    processor = new TemplateProcessor();
  });

  describe('process()', () => {
    it('should return string unchanged when no templates present', () => {
      const result = processor.process('Hello World', {});
      expect(result).toBe('Hello World');
    });

    it('should replace simple variables', () => {
      const result = processor.process('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should replace multiple variables', () => {
      const result = processor.process('{{greeting}} {{name}}!', {
        greeting: 'Hello',
        name: 'World'
      });
      expect(result).toBe('Hello World!');
    });

    it('should handle nested object access', () => {
      const result = processor.process('User: {{user.name}}, Email: {{user.email}}', {
        user: {
          name: 'John',
          email: 'john@example.com'
        }
      });
      expect(result).toBe('User: John, Email: john@example.com');
    });

    it('should handle VU context variables', () => {
      const result = processor.process('VU {{__VU}}, Iteration {{__ITER}}', {
        __VU: 1,
        __ITER: 5
      });
      expect(result).toBe('VU 1, Iteration 5');
    });

    it('should handle vu_id and iteration aliases', () => {
      const result = processor.process('VU {{vu_id}}, Iteration {{iteration}}', {
        vu_id: 1,
        iteration: 5
      });
      expect(result).toBe('VU 1, Iteration 5');
    });
  });

  describe('faker integration', () => {
    it('should generate faker person firstName', () => {
      const result = processor.process('{{faker.person.firstName}}', {
        vu_id: 1,
        iteration: 1
      });
      expect(result).toBeTruthy();
      expect(result).not.toBe('{{faker.person.firstName}}');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate faker person lastName', () => {
      const result = processor.process('{{faker.person.lastName}}', {
        vu_id: 1,
        iteration: 1
      });
      expect(result).toBeTruthy();
      expect(result).not.toBe('{{faker.person.lastName}}');
    });

    it('should generate faker internet email', () => {
      const result = processor.process('{{faker.internet.email}}', {
        vu_id: 1,
        iteration: 1
      });
      expect(result).toMatch(/@/);
    });

    it('should generate faker string uuid', () => {
      const result = processor.process('{{faker.string.uuid}}', {
        vu_id: 1,
        iteration: 1
      });
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate different values for different VU/iteration combinations', () => {
      const results = new Set<string>();

      for (let vu = 1; vu <= 3; vu++) {
        for (let iter = 1; iter <= 3; iter++) {
          const result = processor.process('{{faker.person.firstName}}', {
            vu_id: vu,
            iteration: iter
          });
          results.add(result);
        }
      }

      // Should have generated multiple different names
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('helper functions', () => {
    it('should handle randomInt helper with single closing brace', () => {
      // Note: Helper function syntax uses {{function()} not {{function()}}
      const result = processor.process('{{randomInt(1, 10)}', { vu_id: 1, iteration: 1 });
      const num = parseInt(result);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(10);
    });

    it('should handle randomChoice helper with single closing brace', () => {
      const result = processor.process("{{randomChoice('a', 'b', 'c')}", { vu_id: 1, iteration: 1 });
      expect(['a', 'b', 'c']).toContain(result);
    });

    it('should handle uuid via faker syntax', () => {
      // Use the faker syntax which is more reliable
      const result = processor.process('{{faker.string.uuid}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should handle timestamp variable', () => {
      // The {{timestamp}} syntax (without parens) uses file format by default
      const result = processor.process('{{timestamp}}', { vu_id: 1, iteration: 1 });
      // File format: YYYYMMDD-HHMMSS-mmm
      expect(result).toMatch(/^\d{8}-\d{6}-\d{3}$/);
    });

    it('should handle timestamp with unix format', () => {
      const result = processor.process('{{timestamp:unix}}', { vu_id: 1, iteration: 1 });
      const timestamp = parseInt(result);
      expect(timestamp).toBeGreaterThan(Date.now() - 10000);
      expect(timestamp).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('should handle isoDate helper', () => {
      const result = processor.process('{{isoDate(0)}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('JSON template processing', () => {
    it('should process JSON string with faker values', () => {
      const template = JSON.stringify({
        name: '{{faker.person.fullName}}',
        email: '{{faker.internet.email}}',
        id: '{{faker.string.uuid}}'
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.name).toBeTruthy();
      expect(parsed.email).toMatch(/@/);
      expect(parsed.id).toMatch(/^[0-9a-f-]+$/i);
    });

    it('should handle mixed static and dynamic values', () => {
      const template = JSON.stringify({
        type: 'user',
        name: '{{faker.person.firstName}}',
        active: true,
        count: 42
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.type).toBe('user');
      expect(parsed.name).toBeTruthy();
      expect(parsed.active).toBe(true);
      expect(parsed.count).toBe(42);
    });
  });

  describe('configureFaker()', () => {
    it('should accept valid locale', () => {
      expect(() => {
        processor.configureFaker({ locale: 'de' });
      }).not.toThrow();
    });

    it('should warn for invalid locale', () => {
      // This should not throw, just warn
      expect(() => {
        processor.configureFaker({ locale: 'invalid_locale' });
      }).not.toThrow();
    });

    it('should accept seed configuration', () => {
      expect(() => {
        processor.configureFaker({ seed: 12345 });
      }).not.toThrow();
    });
  });

  describe('getAvailableLocales()', () => {
    it('should return array of available locales', () => {
      const locales = processor.getAvailableLocales();

      expect(Array.isArray(locales)).toBe(true);
      expect(locales).toContain('en');
      expect(locales.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = processor.process('', {});
      expect(result).toBe('');
    });

    it('should handle template with only spaces', () => {
      const result = processor.process('   ', {});
      expect(result).toBe('   ');
    });

    it('should handle undefined context values gracefully', () => {
      const result = processor.process('Value: {{missing}}', {});
      // Should either return empty or the original template
      expect(result).toBeDefined();
    });

    it('should handle malformed template syntax', () => {
      const result = processor.process('Unclosed {{template', {});
      expect(result).toBeDefined();
    });

    it('should handle special characters in values', () => {
      const result = processor.process('Value: {{value}}', {
        value: 'Test <>&"\' special chars'
      });
      expect(result).toBe('Value: Test <>&"\' special chars');
    });
  });
});

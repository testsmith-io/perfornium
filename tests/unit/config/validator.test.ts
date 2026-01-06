import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigValidator } from '../../../src/config/validator';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validate()', () => {
    it('should return valid for a complete valid configuration', () => {
      const config = {
        name: 'Test Config',
        load: {
          pattern: 'basic',
          virtual_users: 10,
          duration: '30s'
        },
        scenarios: [
          {
            name: 'Test Scenario',
            steps: [
              {
                name: 'GET Request',
                type: 'rest',
                method: 'GET',
                path: '/api/test'
              }
            ]
          }
        ]
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when name is missing', () => {
      const config = {
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Test name is required');
    });

    it('should fail when load configuration is missing', () => {
      const config = {
        name: 'Test',
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Load configuration is required');
    });

    it('should fail when scenarios are missing', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 }
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one scenario must be configured');
    });

    it('should fail when scenarios array is empty', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: []
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one scenario must be configured');
    });
  });

  describe('load pattern validation', () => {
    it('should fail for invalid load pattern', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'invalid_pattern' },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid load pattern'))).toBe(true);
    });

    it('should accept valid load patterns', () => {
      const validPatterns = ['basic', 'stepping', 'arrivals', 'mixed'];

      validPatterns.forEach(pattern => {
        const config = {
          name: 'Test',
          load: {
            pattern,
            virtual_users: pattern === 'basic' ? 10 : undefined,
            steps: pattern === 'stepping' ? [{ users: 10, duration: '10s' }] : undefined,
            rate: pattern === 'arrivals' ? 10 : undefined
          },
          scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
        };

        const result = validator.validate(config as any);
        expect(result.errors.some(e => e.includes('Invalid load pattern'))).toBe(false);
      });
    });

    it('should require virtual_users for basic pattern', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic' },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.errors).toContain('virtual_users is required for basic load pattern');
    });

    it('should require steps for stepping pattern', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'stepping' },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.errors).toContain('steps configuration is required for stepping load pattern');
    });

    it('should require rate for arrivals pattern', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'arrivals' },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.errors).toContain('rate is required for arrivals load pattern');
    });

    it('should warn for high virtual user count', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 1500 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.warnings.some(w => w.includes('High virtual user count'))).toBe(true);
    });
  });

  describe('scenario validation', () => {
    it('should fail when scenario has no name', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ steps: [{ type: 'rest', method: 'GET', path: '/' }] }]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes('must have a name'))).toBe(true);
    });

    it('should fail when scenario has no steps', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Empty Scenario', steps: [] }]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes('must have at least one step'))).toBe(true);
    });

    it('should warn for weight outside 0-100 range', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{
          name: 'Test',
          weight: 150,
          steps: [{ type: 'rest', method: 'GET', path: '/' }]
        }]
      };

      const result = validator.validate(config as any);

      expect(result.warnings.some(w => w.includes('weight should be between 0-100'))).toBe(true);
    });
  });

  describe('step validation', () => {
    it('should fail for invalid step type', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{
          name: 'Test',
          steps: [{ type: 'invalid_type', name: 'Invalid Step' }]
        }]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes("Invalid step type 'invalid_type'"))).toBe(true);
    });

    it('should accept all valid step types', () => {
      const validTypes = ['rest', 'soap', 'web', 'custom', 'wait', 'script'];

      validTypes.forEach(type => {
        const step: any = { type, name: `${type} step` };

        // Add required fields for each type
        if (type === 'rest') {
          step.method = 'GET';
          step.path = '/test';
        } else if (type === 'soap') {
          step.operation = 'TestOperation';
        } else if (type === 'web') {
          step.action = { command: 'goto', url: 'http://test.com' };
        } else if (type === 'custom') {
          step.script = 'console.log("test")';
        } else if (type === 'wait') {
          step.duration = '1s';
        } else if (type === 'script') {
          step.file = 'test.js';
          step.function = 'testFunc';
        }

        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{ name: 'Test', steps: [step] }]
        };

        const result = validator.validate(config as any);
        expect(result.errors.some(e => e.includes('Invalid step type'))).toBe(false);
      });
    });

    describe('REST step validation', () => {
      it('should require method for REST step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'rest', path: '/test' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a method'))).toBe(true);
      });

      it('should require path for REST step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'rest', method: 'GET' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a path'))).toBe(true);
      });
    });

    describe('SOAP step validation', () => {
      it('should require operation for SOAP step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'soap', name: 'SOAP Call' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have an operation'))).toBe(true);
      });
    });

    describe('Web step validation', () => {
      it('should require action for web step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'web', name: 'Web Step' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have an action'))).toBe(true);
      });

      it('should require command in action for web step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'web', action: {} }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a command'))).toBe(true);
      });

      it('should fail for invalid web command', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'web', action: { command: 'invalid_command' } }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes("Invalid web command 'invalid_command'"))).toBe(true);
      });
    });

    describe('Custom step validation', () => {
      it('should require script for custom step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'custom', name: 'Custom Step' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a script'))).toBe(true);
      });

      it('should warn about eval() usage in custom scripts', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'custom', script: 'eval("dangerous code")' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.warnings.some(w => w.includes('uses eval()'))).toBe(true);
      });
    });

    describe('Wait step validation', () => {
      it('should require duration for wait step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'wait', name: 'Wait Step' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a duration'))).toBe(true);
      });
    });

    describe('Script step validation', () => {
      it('should require file and function for script step', () => {
        const config = {
          name: 'Test',
          load: { pattern: 'basic', virtual_users: 10 },
          scenarios: [{
            name: 'Test',
            steps: [{ type: 'script', name: 'Script Step' }]
          }]
        };

        const result = validator.validate(config as any);

        expect(result.errors.some(e => e.includes('must have a file'))).toBe(true);
        expect(result.errors.some(e => e.includes('must have a function name'))).toBe(true);
      });
    });
  });

  describe('output validation', () => {
    it('should fail for invalid output type', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }],
        outputs: [{ type: 'invalid_output' }]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes("Invalid output type 'invalid_output'"))).toBe(true);
    });

    it('should require file for csv/json outputs', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }],
        outputs: [
          { type: 'csv' },
          { type: 'json' }
        ]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes('CSV output') && e.includes('must specify a file'))).toBe(true);
      expect(result.errors.some(e => e.includes('JSON output') && e.includes('must specify a file'))).toBe(true);
    });

    it('should require url for influxdb/graphite/webhook outputs', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }],
        outputs: [
          { type: 'influxdb', database: 'test' },
          { type: 'graphite' },
          { type: 'webhook' }
        ]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes('influxdb output') && e.includes('must specify a URL'))).toBe(true);
      expect(result.errors.some(e => e.includes('graphite output') && e.includes('must specify a URL'))).toBe(true);
      expect(result.errors.some(e => e.includes('webhook output') && e.includes('must specify a URL'))).toBe(true);
    });

    it('should require database for influxdb output', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }],
        outputs: [{ type: 'influxdb', url: 'http://localhost:8086' }]
      };

      const result = validator.validate(config as any);

      expect(result.errors.some(e => e.includes('InfluxDB output') && e.includes('must specify a database'))).toBe(true);
    });

    it('should warn about duplicate output files', () => {
      const config = {
        name: 'Test',
        load: { pattern: 'basic', virtual_users: 10 },
        scenarios: [{ name: 'Test', steps: [{ type: 'rest', method: 'GET', path: '/' }] }],
        outputs: [
          { type: 'csv', file: 'results.csv' },
          { type: 'csv', file: 'results.csv' }
        ]
      };

      const result = validator.validate(config as any);

      expect(result.warnings.some(w => w.includes('Duplicate output files'))).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigParser } from '../../../src/config/parser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigParser', () => {
  let parser: ConfigParser;
  let tempDir: string;
  let testCounter = 0;

  beforeEach(() => {
    parser = new ConfigParser();
    testCounter++;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `parser-test-${testCounter}-`));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('parse()', () => {
    describe('YAML parsing', () => {
      it('should parse valid YAML configuration', async () => {
        const configPath = path.join(tempDir, 'test.yml');
        const yamlContent = `
name: Test Config
load:
  pattern: basic
  users: 5
  duration: 10s
scenarios:
  - name: Test Scenario
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.name).toBe('Test Config');
        expect(config.load.pattern).toBe('basic');
        expect(config.load.users).toBe(5);
        expect(config.scenarios).toHaveLength(1);
        expect(config.scenarios[0].name).toBe('Test Scenario');
      });

      it('should parse YAML with .yaml extension', async () => {
        const configPath = path.join(tempDir, 'test.yaml');
        const yamlContent = `
name: YAML Extension Test
load:
  pattern: basic
  users: 1
scenarios:
  - name: Scenario
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.name).toBe('YAML Extension Test');
      });
    });

    describe('JSON parsing', () => {
      it('should parse valid JSON configuration', async () => {
        const configPath = path.join(tempDir, 'test.json');
        const jsonContent = JSON.stringify({
          name: 'JSON Test',
          load: {
            pattern: 'basic',
            users: 3
          },
          scenarios: [
            {
              name: 'JSON Scenario',
              steps: [
                {
                  rest: {
                    method: 'GET',
                    url: 'http://example.com'
                  }
                }
              ]
            }
          ]
        });
        fs.writeFileSync(configPath, jsonContent);

        const config = await parser.parse(configPath);

        expect(config.name).toBe('JSON Test');
        expect(config.load.users).toBe(3);
      });
    });

    describe('validation', () => {
      it('should throw error for missing name field', async () => {
        const configPath = path.join(tempDir, 'invalid.yml');
        const yamlContent = `
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow('Required field missing: name');
      });

      it('should throw error for missing load field', async () => {
        const configPath = path.join(tempDir, 'invalid.yml');
        const yamlContent = `
name: Test
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow('Required field missing: load');
      });

      it('should throw error for missing scenarios', async () => {
        const configPath = path.join(tempDir, 'invalid.yml');
        const yamlContent = `
name: Test
load:
  pattern: basic
  users: 1
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow('Required field missing: scenarios');
      });

      it('should throw error for empty scenarios array', async () => {
        const configPath = path.join(tempDir, 'invalid.yml');
        const yamlContent = `
name: Test
load:
  pattern: basic
  users: 1
scenarios: []
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow('At least one scenario must be defined');
      });
    });

    describe('file not found', () => {
      it('should throw error for non-existent file', async () => {
        const configPath = path.join(tempDir, 'non-existent.yml');

        await expect(parser.parse(configPath)).rejects.toThrow('Configuration file not found');
      });
    });

    describe('faker configuration', () => {
      it('should accept valid faker locale', async () => {
        const configPath = path.join(tempDir, 'faker.yml');
        const yamlContent = `
name: Faker Test
global:
  faker:
    locale: de
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.global?.faker?.locale).toBe('de');
      });

      it('should throw error for invalid faker locale', async () => {
        const configPath = path.join(tempDir, 'faker-invalid.yml');
        const yamlContent = `
name: Faker Test
global:
  faker:
    locale: invalid_locale_xyz
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow('Unsupported faker locale');
      });
    });

    describe('CSV configuration validation', () => {
      it('should throw error for CSV config without file property', async () => {
        const configPath = path.join(tempDir, 'csv-invalid.yml');
        const yamlContent = `
name: CSV Test
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    csv_data:
      mode: next
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow("CSV configuration missing 'file' property");
      });

      it('should throw error for invalid CSV mode', async () => {
        const configPath = path.join(tempDir, 'csv-mode.yml');
        const yamlContent = `
name: CSV Test
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    csv_data:
      file: data.csv
      mode: invalid_mode
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        await expect(parser.parse(configPath)).rejects.toThrow("Invalid csv_mode 'invalid_mode'");
      });

      it('should accept valid CSV modes', async () => {
        const csvPath = path.join(tempDir, 'data.csv');
        fs.writeFileSync(csvPath, 'id,name\n1,test\n');

        for (const mode of ['next', 'unique', 'random']) {
          const configPath = path.join(tempDir, `csv-${mode}.yml`);
          const yamlContent = `
name: CSV Test ${mode}
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    csv_data:
      file: data.csv
      mode: ${mode}
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
          fs.writeFileSync(configPath, yamlContent);

          const config = await parser.parse(configPath);
          expect(config.scenarios[0].csv_data?.mode).toBe(mode);
        }
      });
    });

    describe('load patterns', () => {
      it('should parse basic load pattern', async () => {
        const configPath = path.join(tempDir, 'basic.yml');
        const yamlContent = `
name: Basic Pattern
load:
  pattern: basic
  users: 10
  duration: 30s
  ramp_up: 5s
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.load.pattern).toBe('basic');
        expect(config.load.users).toBe(10);
        expect(config.load.duration).toBe('30s');
        expect(config.load.ramp_up).toBe('5s');
      });

      it('should parse arrivals load pattern', async () => {
        const configPath = path.join(tempDir, 'arrivals.yml');
        const yamlContent = `
name: Arrivals Pattern
load:
  pattern: arrivals
  rate: 5
  duration: 60s
  vu_duration: 30s
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.load.pattern).toBe('arrivals');
        expect(config.load.rate).toBe(5);
      });

      it('should parse stepping load pattern', async () => {
        const configPath = path.join(tempDir, 'stepping.yml');
        const yamlContent = `
name: Stepping Pattern
load:
  pattern: stepping
  steps:
    - users: 5
      duration: 30s
    - users: 10
      duration: 60s
    - users: 5
      duration: 30s
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.load.pattern).toBe('stepping');
        expect(config.load.steps).toHaveLength(3);
        expect(config.load.steps![0].users).toBe(5);
        expect(config.load.steps![1].users).toBe(10);
      });
    });

    describe('outputs configuration', () => {
      it('should parse output configurations', async () => {
        const configPath = path.join(tempDir, 'outputs.yml');
        const yamlContent = `
name: Outputs Test
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
outputs:
  - type: json
    file: results.json
  - type: csv
    file: results.csv
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.outputs).toHaveLength(2);
        expect(config.outputs![0].type).toBe('json');
        expect(config.outputs![1].type).toBe('csv');
      });
    });

    describe('report configuration', () => {
      it('should parse report configuration', async () => {
        const configPath = path.join(tempDir, 'report.yml');
        const yamlContent = `
name: Report Test
load:
  pattern: basic
  users: 1
scenarios:
  - name: Test
    steps:
      - rest:
          method: GET
          url: http://example.com
report:
  generate: true
  output: custom-report.html
`;
        fs.writeFileSync(configPath, yamlContent);

        const config = await parser.parse(configPath);

        expect(config.report?.generate).toBe(true);
        expect(config.report?.output).toBe('custom-report.html');
      });
    });
  });

  describe('processTemplates()', () => {
    it('should return config unchanged (basic processing)', () => {
      const config: any = {
        name: 'Test',
        load: { pattern: 'basic', users: 1 },
        scenarios: []
      };

      const context = {
        env: process.env,
        timestamp: Date.now(),
        datetime: new Date().toISOString()
      };

      const result = parser.processTemplates(config, context);

      expect(result.name).toBe('Test');
    });
  });
});

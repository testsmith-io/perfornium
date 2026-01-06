import * as path from 'path';
import * as http from 'http';
import { ConfigParser } from '../../config/parser';
import { ConfigValidator } from '../../config/validator';
import { TestRunner } from '../../core/test-runner';
import { logger, LogLevel } from '../../utils/logger';

export interface RunOptions {
  env?: string;
  workers?: string;
  output?: string;
  report?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  maxUsers?: string;
  global?: string[];  // Array of "key=value" or "key.nested=value" strings
}

// Lightweight mock server for testing
let mockServer: http.Server | null = null;
let mockRequestCount = 0;
const mockStartTime = Date.now();

function startMockServer(port: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer((req, res) => {
      mockRequestCount++;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Simple /status endpoint
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - mockStartTime) / 1000),
        requests: mockRequestCount
      }));
    });

    mockServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} in use, mock server not started`);
        resolve(); // Continue without mock server
      } else {
        reject(err);
      }
    });

    mockServer.listen(port, 'localhost', () => {
      logger.info(`🎯 Mock server started at http://localhost:${port}/status`);
      resolve();
    });
  });
}

function stopMockServer(): void {
  if (mockServer) {
    mockServer.close();
    mockServer = null;
  }
}

export async function runCommand(
  configPath: string,
  options: RunOptions
): Promise<void> {
  try {
    if (options.verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }

    logger.info(`Loading configuration: ${configPath}`);

    const parser = new ConfigParser();
    const config = await parser.parse(configPath, options.env);

    // Apply CLI global variable overrides
    applyGlobalOverrides(config, options);

    // Auto-start mock server if base_url targets localhost:3000
    const baseUrl = config.global?.base_url || '';
    if (baseUrl.match(/^https?:\/\/localhost:3000/)) {
      await startMockServer(3000);
    }

    // Apply max users override
    if (options.maxUsers) {
      const maxUsers = parseInt(options.maxUsers);
      const { getPrimaryLoadPhase } = await import('../../config/types/load-config');
      const primaryPhase = getPrimaryLoadPhase(config.load);
      const currentUsers = primaryPhase.virtual_users || primaryPhase.vus;

      if (currentUsers && currentUsers > maxUsers) {
        logger.warn(`Limiting virtual users from ${currentUsers} to ${maxUsers}`);
        primaryPhase.virtual_users = maxUsers;
      }
    }
    
    // Process templates with environment variables
    const processedConfig = parser.processTemplates(config, {
      env: process.env,
      timestamp: Date.now(),
      datetime: new Date().toISOString()
    });

    logger.info(`Validating configuration...`);
    const validator = new ConfigValidator();
    const validation = validator.validate(processedConfig);
    
    if (!validation.valid) {
      logger.error('Configuration validation failed:');
      validation.errors.forEach(error => logger.error(`  - ${error}`));
      process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('Configuration warnings:');
      validation.warnings.forEach(warning => logger.warn(`  - ${warning}`));
    }

    if (options.dryRun) {
      logger.success('Configuration is valid');
      return;
    }

    // Override output directory if specified
    if (options.output && processedConfig.outputs) {
      processedConfig.outputs.forEach(output => {
        if (output.file) {
          output.file = path.join(options.output!, path.basename(output.file));
        }
      });
    }

    // Enable report generation if requested
    if (options.report) {
      processedConfig.report = {
        generate: true,
        output: options.output ? path.join(options.output, 'report.html') : 'report.html',
        ...processedConfig.report
      };
    }

    if (options.workers) {
      const { WorkerManager } = await import('../../workers/manager');
      const manager = new WorkerManager();
      
      const workerAddresses = options.workers.split(',').map(w => w.trim());
      for (const address of workerAddresses) {
        await manager.addWorker(address);
      }
      
      await manager.distributeTest(processedConfig);
      await manager.waitForCompletion();
      
      const metrics = manager.getAggregatedMetrics();
      const summary = metrics.getSummary();
      logger.success(`Distributed test completed: ${summary.success_rate.toFixed(2)}% success rate`);
      
      await manager.cleanup();
    } else {
      const runner = new TestRunner(processedConfig);
      
      // Set up graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, stopping test...');
        await runner.stop();
        process.exit(0);
      });
      
      await runner.run();
    }

  } catch (error: any) {
    logger.error(`Test execution failed: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Stop mock server if it was started
    stopMockServer();
  }
}

/**
 * Apply CLI global variable overrides to the config
 * Supports dot notation for nested properties: browser.headless=false
 */
function applyGlobalOverrides(config: any, options: RunOptions): void {
  if (!options.global || options.global.length === 0) {
    return;
  }

  // Ensure global config exists
  if (!config.global) {
    config.global = {};
  }

  for (const override of options.global) {
    const eqIndex = override.indexOf('=');
    if (eqIndex === -1) {
      logger.warn(`Invalid global override format: ${override} (expected key=value)`);
      continue;
    }

    const key = override.substring(0, eqIndex);
    const rawValue = override.substring(eqIndex + 1);
    const value = parseValue(rawValue);

    logger.info(`Overriding global.${key} = ${JSON.stringify(value)}`);
    setNestedValue(config.global, key, value);
  }
}

/**
 * Parse a string value to its appropriate type
 */
function parseValue(value: string): any {
  // Boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Number (integer or float)
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // JSON object or array
  if ((value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      // Not valid JSON, return as string
    }
  }

  // String (keep as-is)
  return value;
}

/**
 * Set a nested value using dot notation
 * Example: setNestedValue(obj, 'browser.headless', false)
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}
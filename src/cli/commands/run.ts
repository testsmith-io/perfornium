import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
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
  debug?: boolean;
  maxUsers?: string;
  vus?: string;
  iterations?: string;
  duration?: string;
  rampUp?: string;
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
    // Set log level: default=WARN, --verbose=INFO, --debug=DEBUG
    if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (options.verbose) {
      logger.setLevel(LogLevel.INFO);
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

    // Apply load pattern overrides
    if (options.maxUsers || options.vus || options.iterations || options.duration || options.rampUp) {
      const { getPrimaryLoadPhase } = await import('../../config/types/load-config');
      const primaryPhase = getPrimaryLoadPhase(config.load);

      // Virtual users override
      if (options.vus) {
        const vus = parseInt(options.vus);
        logger.info(`Overriding virtual users to ${vus}`);
        primaryPhase.virtual_users = vus;
        if (primaryPhase.vus) primaryPhase.vus = vus;
      }

      // Max users override (limit, not set)
      if (options.maxUsers) {
        const maxUsers = parseInt(options.maxUsers);
        const currentUsers = primaryPhase.virtual_users || primaryPhase.vus;
        if (currentUsers && currentUsers > maxUsers) {
          logger.warn(`Limiting virtual users from ${currentUsers} to ${maxUsers}`);
          primaryPhase.virtual_users = maxUsers;
        }
      }

      // Iterations override
      if (options.iterations) {
        const iterations = parseInt(options.iterations);
        logger.info(`Overriding iterations to ${iterations}`);
        primaryPhase.iterations = iterations;
      }

      // Duration override
      if (options.duration) {
        logger.info(`Overriding duration to ${options.duration}`);
        primaryPhase.duration = options.duration;
        // Remove iterations if duration is set (they're mutually exclusive)
        delete primaryPhase.iterations;
      }

      // Ramp-up override
      if (options.rampUp) {
        logger.info(`Overriding ramp-up to ${options.rampUp}`);
        primaryPhase.ramp_up = options.rampUp;
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
    if (options.output) {
      // Ensure output directory exists
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const testName = processedConfig.name || path.basename(configPath, path.extname(configPath));
      const defaultOutputFile = path.join(options.output, `${testName}-${timestamp}.json`);

      if (processedConfig.outputs && processedConfig.outputs.length > 0) {
        // Modify existing outputs to use the specified directory
        processedConfig.outputs.forEach(output => {
          if (output.file) {
            output.file = path.join(options.output!, path.basename(output.file));
          }
        });
      } else {
        // No outputs configured - add default JSON output
        processedConfig.outputs = [{
          type: 'json',
          file: defaultOutputFile
        }];
      }
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

      // Initialize metrics before distributing test
      const metrics = manager.getAggregatedMetrics();
      metrics.start();

      // Track results as they come in
      let resultCount = 0;
      manager.on('result', () => {
        resultCount++;
      });

      await manager.distributeTest(processedConfig);
      logger.info('📡 Test distributed to workers, starting progress reporting...');

      // Start live progress reporting for dashboard
      let lastReportedResultIndex = 0;
      let isRunning = true;

      // Output function for progress reporting
      const outputProgress = () => {
        if (!isRunning) return;

        const summary = metrics.getSummary();
        const currentRequests = summary.total_requests || 0;
        const rps = summary.requests_per_second || 0;
        const p50 = summary.percentiles?.[50] || 0;
        const p90 = summary.percentiles?.[90] || 0;
        const p95 = summary.percentiles?.[95] || 0;
        const p99 = summary.percentiles?.[99] || 0;
        const successRate = summary.success_rate || 0;

        // Output progress line for dashboard parsing
        const progressLine = `[PROGRESS] VUs: ${manager.getWorkerCount()} | Requests: ${currentRequests} | Errors: ${summary.failed_requests || 0} | Avg RT: ${(summary.avg_response_time || 0).toFixed(0)}ms | RPS: ${rps.toFixed(1)} | P50: ${p50.toFixed(0)}ms | P90: ${p90.toFixed(0)}ms | P95: ${p95.toFixed(0)}ms | P99: ${p99.toFixed(0)}ms | Success: ${successRate.toFixed(1)}%`;
        console.log(progressLine);

        // Output step statistics if available
        if (summary.step_statistics && summary.step_statistics.length > 0) {
          const stepData = summary.step_statistics.map((s: any) => ({
            n: s.step_name,
            s: s.scenario,
            r: s.total_requests,
            e: s.failed_requests,
            a: Math.round(s.avg_response_time),
            p50: Math.round(s.percentiles?.[50] || 0),
            p95: Math.round(s.percentiles?.[95] || 0),
            p99: Math.round(s.percentiles?.[99] || 0),
            sr: Math.round(s.success_rate * 10) / 10
          }));
          console.log(`[STEPS] ${JSON.stringify(stepData)}`);
        }

        // Output individual response times for charts
        const allResults = metrics.getResults();
        if (allResults.length > lastReportedResultIndex) {
          const newResults = allResults.slice(lastReportedResultIndex, lastReportedResultIndex + 50);
          const rtData = newResults.map((r: any) => ({
            t: r.timestamp,
            v: Math.round(r.duration),
            s: r.success ? 1 : 0,
            n: r.step_name || r.action || 'unknown'  // Include step/request name for coloring
          }));
          if (rtData.length > 0) {
            console.log(`[RT] ${JSON.stringify(rtData)}`);
          }
          lastReportedResultIndex = Math.min(allResults.length, lastReportedResultIndex + 50);
        }

        // Output top 10 errors if any
        if (summary.error_details && summary.error_details.length > 0) {
          const topErrors = summary.error_details.slice(0, 10).map((e: any) => ({
            scenario: e.scenario,
            action: e.action,
            status: e.status,
            error: e.error?.substring(0, 200), // Truncate long error messages
            url: e.request_url,
            count: e.count
          }));
          console.log(`[ERRORS] ${JSON.stringify(topErrors)}`);
        }
      };

      // Output initial progress immediately
      outputProgress();

      // Then continue outputting every 500ms
      const progressInterval = setInterval(outputProgress, 500);

      await manager.waitForCompletion();
      logger.info('✅ All workers completed, cleaning up...');

      // Stop progress reporting
      isRunning = false;
      clearInterval(progressInterval);

      const summary = metrics.getSummary();
      logger.success(`Distributed test completed: ${summary.success_rate.toFixed(2)}% success rate`);
      logger.info(`📊 Total requests: ${summary.total_requests}, Success rate: ${summary.success_rate.toFixed(1)}%`);

      logger.info('🧹 Starting cleanup...');
      await manager.cleanup();
      logger.info('✅ Cleanup completed, exiting...');

      // Force exit after distributed test cleanup to ensure process terminates
      process.exit(0);
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
    if (options.verbose || options.debug) {
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
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { LiveTest, RunningProcess, InfrastructureMetrics } from '../types';
import { MetricsParser, MetricsParserOptions } from './metrics-parser';
import { logger } from '../../utils/logger';

export interface TestRunOptions {
  verbose?: boolean;
  report?: boolean;
  output?: string;
  vus?: number;
  iterations?: number;
  duration?: string;
  rampUp?: string;
  headless?: boolean;
  workers?: string;
}

export interface TestExecutorCallbacks {
  onOutput: (testId: string, data: string) => void;
  onLiveUpdate: (test: LiveTest) => void;
  onNetworkUpdate: (testId: string, data: any) => void;
  onTestComplete: (test: LiveTest) => void;
  onTestFinished: (testId: string, exitCode: number | null) => void;
  getInfraSnapshot?: () => Record<string, InfrastructureMetrics[]>;
}

export interface TestExecutorOptions {
  /** When InfluxDB is enabled, don't limit response times in memory */
  influxEnabled?: boolean;
}

export class TestExecutor {
  private testsDir: string;
  private resultsDir: string;
  private runningProcesses: Map<string, RunningProcess> = new Map();
  private liveTests: Map<string, LiveTest>;
  private metricsParser: MetricsParser;
  private callbacks: TestExecutorCallbacks;

  constructor(
    testsDir: string,
    resultsDir: string,
    liveTests: Map<string, LiveTest>,
    callbacks: TestExecutorCallbacks,
    options?: TestExecutorOptions
  ) {
    this.testsDir = testsDir;
    this.resultsDir = resultsDir;
    this.liveTests = liveTests;
    this.metricsParser = new MetricsParser({ influxEnabled: options?.influxEnabled });
    this.callbacks = callbacks;
  }

  runTest(testPath: string, options: TestRunOptions): { testId: string; status: string } {
    // Normalize the test path to use native separators for the OS
    const normalizedTestPath = path.normalize(testPath);

    const testId = `run-${Date.now()}`;
    const testName = path.basename(normalizedTestPath).replace(/\.(yml|yaml|json)$/, '');
    const args = ['run', normalizedTestPath];

    if (options?.verbose) args.push('-v');
    if (options?.report) args.push('-r');
    // Always save results to the dashboard's results directory
    args.push('-o', options?.output || this.resultsDir);

    // Load pattern overrides
    if (options?.vus) args.push('--vus', options.vus.toString());
    if (options?.iterations) args.push('--iterations', options.iterations.toString());
    if (options?.duration) args.push('--duration', options.duration);
    if (options?.rampUp) args.push('--ramp-up', options.rampUp);

    // Headless mode override for web tests
    if (options?.headless) args.push('--global', 'browser.headless=true');

    // Distributed workers
    if (options?.workers) args.push('--workers', options.workers);

    // Initialize live test tracking for dashboard-spawned tests
    const liveTest: LiveTest = {
      id: testId,
      name: testName,
      startTime: new Date(),
      status: 'running',
      metrics: { requests: 0, errors: 0, avgResponseTime: 0, currentVUs: 0 },
      stepStats: [],
      responseTimes: [],
      topErrors: [],
      history: []
    };
    this.liveTests.set(testId, liveTest);
    this.callbacks.onLiveUpdate(liveTest);

    // Use the CLI from the dist folder (../../cli/cli.js from dist/dashboard/services/)
    const cliPath = path.join(__dirname, '../../cli/cli.js');
    const proc = spawn('node', [cliPath, ...args], {
      cwd: this.testsDir,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    const runningProc: RunningProcess = { process: proc, testId, output: [] };
    this.runningProcesses.set(testId, runningProc);

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      runningProc.output.push(chunk);
      this.callbacks.onOutput(testId, chunk);

      // Parse each line for live metrics (chunk may contain multiple lines)
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.parseOutputLine(testId, line);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      const line = data.toString();
      runningProc.output.push(line);
      this.callbacks.onOutput(testId, line);
    });

    proc.on('close', async (code) => {
      this.runningProcesses.delete(testId);

      // Mark test as completed in liveTests
      const test = this.liveTests.get(testId);
      if (test) {
        test.status = code === 0 ? 'completed' : 'failed';

        // Inject infrastructure metrics into the result file
        await this.injectInfraMetrics(testName, test.startTime);

        this.callbacks.onTestComplete(test);
        setTimeout(() => this.liveTests.delete(testId), 30000);
      }

      this.callbacks.onTestFinished(testId, code);
    });

    return { testId, status: 'started' };
  }

  stopTest(testId: string): boolean {
    const proc = this.runningProcesses.get(testId);
    if (proc) {
      proc.process.kill('SIGTERM');
      this.runningProcesses.delete(testId);
      return true;
    }
    return false;
  }

  killAllProcesses(): void {
    for (const [id, proc] of this.runningProcesses) {
      proc.process.kill();
      this.runningProcesses.delete(id);
    }
  }

  private async injectInfraMetrics(testName: string, startTime: Date): Promise<void> {
    if (!this.callbacks.getInfraSnapshot) return;

    try {
      const infraSnapshot = this.callbacks.getInfraSnapshot();
      if (!infraSnapshot || Object.keys(infraSnapshot).length === 0) {
        logger.debug('No infrastructure metrics to inject');
        return;
      }

      const testStartMs = startTime.getTime();
      const testEndMs = Date.now();

      // Filter infrastructure metrics to only those collected during the test
      const filteredInfra: Record<string, InfrastructureMetrics[]> = {};
      for (const [host, metrics] of Object.entries(infraSnapshot)) {
        const filtered = metrics.filter(m => {
          const ts = new Date(m.timestamp).getTime();
          return ts >= testStartMs && ts <= testEndMs;
        });
        if (filtered.length > 0) {
          filteredInfra[host] = filtered;
        }
      }

      if (Object.keys(filteredInfra).length === 0) {
        logger.debug('No infrastructure metrics within test time range');
        return;
      }

      // Wait a bit for the result file to be written by the CLI
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if results directory exists
      try {
        await fs.access(this.resultsDir);
      } catch {
        logger.debug(`Results directory does not exist: ${this.resultsDir}`);
        return;
      }

      // Find the most recent result file matching the test name
      const files = await fs.readdir(this.resultsDir);
      const jsonFiles = files
        .filter(f => f.endsWith('.json') && f.includes(testName))
        .sort()
        .reverse();

      if (jsonFiles.length === 0) {
        logger.debug(`No result file found for test: ${testName}`);
        return;
      }

      // Use the most recent file
      const resultFile = path.join(this.resultsDir, jsonFiles[0]);
      const content = await fs.readFile(resultFile, 'utf-8');
      const result = JSON.parse(content);

      // Add infrastructure metrics
      result.infrastructure_metrics = filteredInfra;

      // Write back
      await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8');
      logger.info(`Injected infrastructure metrics (${Object.keys(filteredInfra).length} hosts) into ${jsonFiles[0]}`);
    } catch (error: any) {
      logger.error(`Failed to inject infrastructure metrics: ${error.message}`);
    }
  }

  private parseOutputLine(testId: string, line: string): void {
    const test = this.liveTests.get(testId);
    if (!test) return;

    // Check for network data first (needs special handling for broadcast)
    const networkData = this.metricsParser.parseNetworkData(line);
    if (networkData) {
      // Initialize network calls array if not present
      if (!test.networkCalls) {
        test.networkCalls = [];
      }

      test.networkCalls.push({
        id: networkData.id,
        vuId: networkData.vu,
        url: networkData.url,
        method: networkData.method,
        status: networkData.status,
        statusText: networkData.statusText,
        duration: networkData.duration,
        size: networkData.size,
        type: networkData.type,
        success: networkData.success,
        error: networkData.error,
        timestamp: Date.now(),
        requestHeaders: networkData.requestHeaders,
        requestBody: networkData.requestBody,
        responseHeaders: networkData.responseHeaders,
        responseBody: networkData.responseBody
      });

      // Keep last 100 network calls to prevent memory issues
      if (test.networkCalls.length > 100) {
        test.networkCalls = test.networkCalls.slice(-100);
      }

      this.callbacks.onNetworkUpdate(testId, networkData);
      return;
    }

    // Parse other metrics
    const updated = this.metricsParser.parseOutputForMetrics(line, test);
    if (updated) {
      this.callbacks.onLiveUpdate(test);
    }
  }
}

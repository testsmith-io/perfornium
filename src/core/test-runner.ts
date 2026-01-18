import { TestConfiguration } from '../config';
import { MetricsCollector } from '../metrics/collector';
import { VirtualUser } from './virtual-user';
import { DataProvider, DataOptions } from './data';
import { ProtocolHandler } from '../protocols/base';
import { BasicPattern } from '../load-patterns/basic';
import { SteppingPattern } from '../load-patterns/stepping';
import { ArrivalsPattern } from '../load-patterns/arrivals';
import { LoadPattern, VUFactory } from '../load-patterns/base';
import { OutputHandler } from '../outputs/base';
import { logger, LogLevel } from '../utils/logger';
import { sleep } from '../utils/time';
import { RendezvousManager } from './rendezvous';
import { FileManager } from '../utils/file-manager';
import { ProtocolHandlerFactory } from './factories/protocol-handler-factory';
import { OutputHandlerFactory } from './factories/output-handler-factory';
import { DashboardReporter } from './reporting/dashboard-reporter';

export class TestRunner {
  private config: TestConfiguration;
  private metrics: MetricsCollector;
  private handlers: Map<string, ProtocolHandler> = new Map();
  private outputs: OutputHandler[] = [];
  private activeVUs: VirtualUser[] = [];
  private isRunning: boolean = false;
  private startTime: number = 0;
  private testId: string = '';
  private dashboardReporter: DashboardReporter | null = null;

  // Factories
  private protocolHandlerFactory: ProtocolHandlerFactory;
  private outputHandlerFactory: OutputHandlerFactory;

  constructor(config: TestConfiguration) {
    this.config = config;

    // Build realtime config including InfluxDB settings
    const realtimeConfig: any = {
      enabled: true,
      batch_size: 10,
      incremental_files: {
        enabled: true
      }
    };

    // Add InfluxDB config if enabled in global config
    if (config.global?.influxdb?.enabled) {
      realtimeConfig.influxdb = {
        enabled: true,
        url: config.global.influxdb.url,
        token: config.global.influxdb.token,
        org: config.global.influxdb.org,
        bucket: config.global.influxdb.bucket,
        batch_size: config.global.influxdb.batch_size,
        flush_interval: config.global.influxdb.flush_interval
      };
    }

    this.metrics = new MetricsCollector(realtimeConfig);

    // Initialize factories (pass metrics collector for network call recording)
    this.protocolHandlerFactory = new ProtocolHandlerFactory(config, this.metrics);
    this.outputHandlerFactory = new OutputHandlerFactory(config.name);

    // Set log level based on debug config
    if (config.debug?.log_level || config.global?.debug?.log_level) {
      const logLevel = config.debug?.log_level || config.global?.debug?.log_level;
      switch (logLevel) {
        case 'debug':
          logger.setLevel(LogLevel.DEBUG);
          break;
        case 'info':
          logger.setLevel(LogLevel.INFO);
          break;
        case 'warn':
          logger.setLevel(LogLevel.WARN);
          break;
        case 'error':
          logger.setLevel(LogLevel.ERROR);
          break;
      }
    }
  }

  async run(): Promise<void> {
    logger.info(`Starting test: ${this.config.name}`);
    this.isRunning = true;
    this.startTime = Date.now();
    this.testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Reset rendezvous manager for this test run
    RendezvousManager.getInstance().reset();

    // Start dashboard reporting
    this.startDashboardReporting();

    try {
      await this.initialize();
      await this.executeLoadPattern();
      await this.finalize();

      const duration = Date.now() - this.startTime;
      logger.success(`Test completed successfully in ${(duration / 1000).toFixed(1)}s`);
    } catch (error) {
      logger.error('Test failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.stopDashboardReporting();
    }
  }

  private startDashboardReporting(): void {
    this.dashboardReporter = new DashboardReporter({
      testId: this.testId,
      testName: this.config.name
    });

    this.dashboardReporter.start(
      this.metrics,
      () => this.activeVUs,
      () => this.isRunning
    );
  }

  private stopDashboardReporting(): void {
    if (this.dashboardReporter) {
      this.dashboardReporter.stop();
      this.dashboardReporter = null;
    }
  }

  private setupCSVBaseDirectory(): void {
    const hasCSVScenarios = this.config.scenarios?.some((s: any) => s.csv_data);

    if (hasCSVScenarios) {
      const baseDir = process.cwd();
      DataProvider.setBaseDir(baseDir);

      const hasStopOnExhaustion = this.config.scenarios?.some((s: any) =>
        s.csv_data && s.csv_data.cycleOnExhaustion === false
      );

      if (hasStopOnExhaustion) {
        logger.info('CSV exhaustion handling enabled - individual VUs will stop when CSV data is exhausted');
      }

      logger.debug(`Set CSV base directory: ${baseDir}`);
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping test...');
    this.isRunning = false;

    // Stop rendezvous manager - releases any waiting VUs
    RendezvousManager.getInstance().stop();

    // Stop all active VUs
    this.activeVUs.forEach(vu => vu.stop());

    // Wait for VUs to finish current operations
    await this.waitForVUsToComplete(10000);

    // Finalize metrics (stops batch processor timers)
    await this.metrics.finalize();

    // Cleanup handlers
    await ProtocolHandlerFactory.cleanupHandlers(this.handlers);

    // Generate summary and finalize outputs (ensures results files are properly closed)
    const summary = this.metrics.getSummary();
    await OutputHandlerFactory.finalizeOutputs(this.outputs, summary);
  }

  private async initialize(): Promise<void> {
    logger.debug('Initializing test runner...');

    // Initialize protocol handlers using factory
    this.handlers = await this.protocolHandlerFactory.createHandlers();

    // Initialize outputs using factory
    this.outputs = await this.outputHandlerFactory.createOutputs(this.config.outputs);

    // Initialize metrics collector (connects to InfluxDB if configured)
    await this.metrics.initialize();

    // Setup metrics collection with test name for InfluxDB tagging
    this.metrics.start(this.config.name);
    this.metrics.on('result', (result) => {
      this.outputs.forEach(output => {
        if (output && typeof output.writeResult === 'function') {
          output.writeResult(result).catch(err =>
            logger.warn('Output write failed:', err)
          );
        }
      });
    });

    logger.debug('Test runner initialized');
  }

  private async executeLoadPattern(): Promise<void> {
    // Setup base directory for CSV files BEFORE creating VUs
    this.setupCSVBaseDirectory();

    const vuFactory = this.createVUFactory();

    // Support both single load config and array of phases
    const loadPhases = Array.isArray(this.config.load) ? this.config.load : [this.config.load];

    logger.info(`Executing ${loadPhases.length} load phase(s)`);

    // Execute each load phase sequentially
    for (let i = 0; i < loadPhases.length; i++) {
      const phase = loadPhases[i];
      const phaseName = phase.name || `Phase ${i + 1}`;

      logger.info(`\nStarting ${phaseName}: ${phase.pattern} pattern`);
      if (phase.virtual_users || phase.vus) {
        logger.info(`   Users: ${phase.virtual_users || phase.vus}, Duration: ${phase.duration}`);
      }

      const pattern = this.getLoadPatternForPhase(phase);
      await pattern.execute(phase, vuFactory);

      // Wait for phase to complete
      if (phase.duration) {
        await this.waitForVUsToComplete();
      } else {
        // For "run once" mode, clear activeVUs
        this.activeVUs.forEach(vu => vu.stop());
        this.activeVUs.length = 0;
      }

      logger.success(`Completed ${phaseName}`);

      // Small gap between phases
      if (i < loadPhases.length - 1) {
        logger.info('Pausing 2s between phases...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    logger.success(`\nAll ${loadPhases.length} load phase(s) completed`);
  }

  private getLoadPatternForPhase(phase: any): LoadPattern {
    let pattern: LoadPattern;

    switch (phase.pattern) {
      case 'basic':
        pattern = new BasicPattern();
        if ('setTestRunningChecker' in pattern) {
          (pattern as any).setTestRunningChecker(() => this.isRunning);
        }
        break;
      case 'stepping':
        pattern = new SteppingPattern();
        break;
      case 'arrivals':
        pattern = new ArrivalsPattern();
        break;
      default:
        throw new Error(`Unsupported load pattern: ${phase.pattern}`);
    }

    return pattern;
  }

  private createVUFactory(): VUFactory {
    return {
      create: async (id: number): Promise<VirtualUser> => {
        // Pass global think time to VU
        const globalThinkTime = this.config.global?.think_time;

        // Build global CSV options if configured
        let globalCSV: DataOptions | undefined;
        if (this.config.global?.csv_data) {
          globalCSV = {
            config: this.config.global.csv_data,
            mode: this.config.global.csv_mode || 'next'
          };
          logger.debug(`VU ${id}: Global CSV configured from test config`);
        }

        const vu = new VirtualUser(
          id,
          this.metrics,
          this.handlers,
          this.config.name,
          undefined, // vuHooks
          globalThinkTime,
          globalCSV
        );

        // CRITICAL: Must await the CSV initialization
        logger.debug(`Initializing VU ${id} with scenarios (including CSV)...`);
        await vu.setScenarios(this.config.scenarios);
        logger.debug(`VU ${id} fully initialized`);

        this.activeVUs.push(vu);
        return vu;
      },
      getMetrics: () => this.metrics
    };
  }

  private async waitForVUsToComplete(timeoutMs: number = 60000): Promise<void> {
    const startTime = Date.now();

    const getRunningVUs = () => this.activeVUs.filter(vu => vu.isRunning());

    while (getRunningVUs().length > 0 && this.isRunning) {
      const elapsed = Date.now() - startTime;
      const runningCount = getRunningVUs().length;

      if (elapsed > timeoutMs) {
        logger.warn(`Timeout waiting for ${runningCount} VUs to complete`);
        this.activeVUs.forEach(vu => vu.stop());
        break;
      }

      await sleep(100);

      if (runningCount > 0 && elapsed % 5000 === 0) {
        logger.debug(`Waiting for ${runningCount} VUs to complete...`);
      }
    }

    this.activeVUs.length = 0;
    logger.debug('All VUs completed');
  }

  private async finalize(): Promise<void> {
    logger.debug('Finalizing test...');

    // Finalize metrics (stops batch processor timers)
    await this.metrics.finalize();

    // Cleanup handlers
    await ProtocolHandlerFactory.cleanupHandlers(this.handlers);

    // Generate summary and write to outputs
    const summary = this.metrics.getSummary();
    this.logSummary(summary);
    this.logErrorDetails(summary);

    // Finalize outputs
    await OutputHandlerFactory.finalizeOutputs(this.outputs, summary);

    // Generate HTML report if configured
    if (this.config.report?.generate) {
      await this.generateReport(summary);
    }
  }

  private logSummary(summary: any): void {
    logger.info('Test Summary:');
    logger.info(`   Total Requests: ${summary.total_requests}`);
    logger.info(`   Success Rate: ${summary.success_rate.toFixed(2)}%`);
    logger.info(`   Avg Response Time: ${summary.avg_response_time.toFixed(2)}ms`);
    logger.info(`   Requests/sec: ${summary.requests_per_second.toFixed(2)}`);
    logger.info(`   Duration: ${(summary.total_duration / 1000).toFixed(1)}s`);
  }

  private logErrorDetails(summary: any): void {
    if (summary.failed_requests > 0) {
      logger.warn(`${summary.failed_requests} requests failed`);

      // Log status code distribution
      logger.info('Status Code Distribution:');
      Object.entries(summary.status_distribution)
        .sort(([a], [b]) => parseInt(a as string) - parseInt(b as string))
        .forEach(([status, count]) => {
          const statusNum = parseInt(status);
          const isError = statusNum >= 400;
          const indicator = isError ? 'ERROR' : 'OK';
          logger.info(`   ${indicator} ${status}: ${count} requests`);
        });

      // Log top errors
      if (summary.error_details && summary.error_details.length > 0) {
        logger.warn('Top Error Details:');
        summary.error_details.slice(0, 5).forEach((error: any, index: number) => {
          logger.warn(`   ${index + 1}. ${error.error} (${error.count}x)`);
          if (error.status) {
            logger.warn(`      Status: ${error.status}`);
          }
          if (error.request_url) {
            logger.warn(`      URL: ${error.request_url}`);
          }
          if (error.response_body && error.response_body.length < 200) {
            logger.warn(`      Response: ${error.response_body}`);
          }
        });
      }
    }
  }

  private async generateReport(summary: any): Promise<void> {
    try {
      const { HTMLReportGenerator } = await import('../reporting/html-generator');
      const generator = new HTMLReportGenerator();

      // Process report path with automatic timestamp
      const reportPath = this.processTemplateFilePath(this.config.report!.output);

      await generator.generate(
        {
          testName: this.config.name,
          summary,
          results: this.metrics.getResults()
        },
        reportPath
      );
    } catch (error) {
      logger.error('Report generation failed:', error);
    }
  }

  private processTemplateFilePath(filePath?: string): string {
    if (!filePath) {
      return `results/${this.config.name}-{{timestamp}}.html`;
    }

    let processedPath = filePath;
    if (!filePath.includes('{{timestamp}}')) {
      const lastDot = filePath.lastIndexOf('.');
      if (lastDot > 0) {
        const name = filePath.substring(0, lastDot);
        const ext = filePath.substring(lastDot);
        processedPath = `${name}-{{timestamp}}${ext}`;
      } else {
        processedPath = `${filePath}-{{timestamp}}`;
      }
    }

    return FileManager.processFilePath(processedPath);
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }
}

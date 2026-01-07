import { TestConfiguration } from '../config';
import { MetricsCollector } from '../metrics/collector';
import { VirtualUser, GlobalCSVOptions } from './virtual-user';
import { ProtocolHandler } from '../protocols/base';
import { RESTHandler } from '../protocols/rest/handler';
import { SOAPHandler } from '../protocols/soap/handler';
import { WebHandler } from '../protocols/web/handler';
import { BasicPattern } from '../load-patterns/basic';
import { SteppingPattern } from '../load-patterns/stepping';
import { ArrivalsPattern } from '../load-patterns/arrivals';
import { LoadPattern, VUFactory } from '../load-patterns/base';
import { OutputHandler } from '../outputs/base';
import { CSVOutput } from '../outputs/csv';
import { JSONOutput } from '../outputs/json';
import { InfluxDBOutput } from '../outputs/influxdb';
import { GraphiteOutput } from '../outputs/graphite';
import { WebhookOutput } from '../outputs/webhook';
import { logger, LogLevel } from '../utils/logger';
import { sleep } from '../utils/time';
import { CSVDataProvider } from './csv-data-provider';
import { RendezvousManager } from './rendezvous';
import { FileManager } from '../utils/file-manager';

export class TestRunner {
  private config: TestConfiguration;
  private metrics: MetricsCollector;
  private handlers: Map<string, ProtocolHandler> = new Map();
  private outputs: OutputHandler[] = [];
  private activeVUs: VirtualUser[] = [];
  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor(config: TestConfiguration) {
    this.config = config;
    this.metrics = new MetricsCollector();

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
    logger.info(`🚀 Starting test: ${this.config.name}`);
    this.isRunning = true;
    this.startTime = Date.now();

    // Reset rendezvous manager for this test run
    RendezvousManager.getInstance().reset();

    try {
      await this.initialize();
      
      // NO CSV termination callback setup needed anymore
      
      await this.executeLoadPattern();
      await this.finalize();

      const duration = Date.now() - this.startTime;
      logger.success(`✅ Test completed successfully in ${(duration / 1000).toFixed(1)}s`);
    } catch (error) {
      logger.error('❌ Test failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private setupCSVBaseDirectory(): void {
    const hasCSVScenarios = this.config.scenarios?.some((s: any) => s.csv_data);
    
    if (hasCSVScenarios) {
      const baseDir = process.cwd();
      CSVDataProvider.setBaseDir(baseDir);
      
      // Check if any scenario has cycleOnExhaustion: false
      const hasStopOnExhaustion = this.config.scenarios?.some((s: any) => 
        s.csv_data && s.csv_data.cycleOnExhaustion === false
      );
      
      if (hasStopOnExhaustion) {
        logger.info('⏹️ CSV exhaustion handling enabled - individual VUs will stop when CSV data is exhausted');
      }

      logger.debug(`Set CSV base directory: ${baseDir}`);
    }
  }

  // FIXED: Added stop method that was missing
  async stop(): Promise<void> {
    logger.info('⏹️  Stopping test...');
    this.isRunning = false;

    // Stop rendezvous manager - releases any waiting VUs
    RendezvousManager.getInstance().stop();

    // Stop all active VUs
    this.activeVUs.forEach(vu => vu.stop());

    // Wait for VUs to finish current operations
    await this.waitForVUsToComplete(10000); // 10 second timeout

    // Cleanup handlers
    await this.cleanup();
  }

  private async initialize(): Promise<void> {
    logger.debug('🔧 Initializing test runner...');

    // Initialize protocol handlers
    await this.initializeProtocolHandlers();

    // Initialize outputs
    await this.initializeOutputs();

    // Setup metrics collection
    this.metrics.start();
    this.metrics.on('result', (result) => {
      this.outputs.forEach(output => {
        if (output && typeof output.writeResult === 'function') {
          output.writeResult(result).catch(err =>
            logger.warn('⚠️  Output write failed:', err)
          );
        }
      });
    });

    logger.debug('✅ Test runner initialized');
  }

  private async initializeProtocolHandlers(): Promise<void> {
    // Check which protocols are needed based on scenarios
    const protocolsNeeded = this.getRequiredProtocols();
    const debugConfig = this.config.debug || this.config.global?.debug;

    // Initialize REST handler if needed
    if (protocolsNeeded.has('rest')) {
      const handler = new RESTHandler(
        this.config.global?.base_url,
        this.config.global?.headers || {},
        this.config.global?.timeout,
        debugConfig // Pass debug config to handler
      );
      this.handlers.set('rest', handler);
      logger.debug('🌐 REST handler initialized');
    }

    // Initialize SOAP handler if needed
    if (protocolsNeeded.has('soap')) {
      const wsdlUrl = this.findWSDLUrl();
      if (wsdlUrl) {
        const handler = new SOAPHandler(wsdlUrl);
        await handler.initialize();
        this.handlers.set('soap', handler);
        logger.debug('🧼 SOAP handler initialized');
      }
    }

    // Initialize Web handler if needed
    if (protocolsNeeded.has('web')) {
      const browserConfig = (this.config.global as any)?.web || this.config.global?.browser || {};
      const webConfig = {
        type: browserConfig.type || 'chromium',
        headless: browserConfig.headless ?? true,
        base_url: browserConfig.base_url || this.config.global?.base_url,
        viewport: browserConfig.viewport,
        slow_mo: browserConfig.slow_mo,
        highlight: browserConfig.highlight,
        clear_storage: browserConfig.clear_storage
      };
      const handler = new WebHandler(webConfig as any);
      await handler.initialize();
      this.handlers.set('web', handler);
      logger.debug('🌐 Web handler initialized');
    }
  }

  private getRequiredProtocols(): Set<string> {
    const protocols = new Set<string>();

    for (const scenario of this.config.scenarios) {
      for (const step of scenario.steps) {
        protocols.add(step.type || 'rest');
      }
    }

    return protocols;
  }

  private findWSDLUrl(): string | null {
    // First check global config
    if (this.config.global?.wsdl_url) {
      return this.config.global.wsdl_url;
    }

    // Fallback: check individual steps (for backward compatibility)
    for (const scenario of this.config.scenarios) {
      for (const step of scenario.steps) {
        if (step.type === 'soap' && 'wsdl' in step && step.wsdl) {
          return step.wsdl;
        }
      }
    }
    return null;
  }

  private async initializeOutputs(): Promise<void> {
    if (!this.config.outputs) return;

    for (const outputConfig of this.config.outputs) {
      // Skip disabled outputs
      if (outputConfig.enabled === false) {
        continue;
      }

      let output: OutputHandler;

      try {
        // Process timestamp templates in file paths
        const processedFilePath = this.processTemplateFilePath(outputConfig.file);
        
        switch (outputConfig.type) {
          case 'csv':
            output = new CSVOutput(processedFilePath);
            break;
          case 'json':
            output = new JSONOutput(processedFilePath);
            break;
          case 'influxdb':
            output = new InfluxDBOutput(
              outputConfig.url!,
              outputConfig.database!,
              outputConfig.tags
            );
            break;
          case 'graphite':
            const [host, port] = (outputConfig.url || 'localhost:2003').split(':');
            output = new GraphiteOutput(
              host,
              parseInt(port || '2003'),
              'perfornium'
            );
            break;
          case 'webhook':
            output = new WebhookOutput(
              outputConfig.url!,
              outputConfig.headers || {},
              'json',
              outputConfig.template
            );
            break;
          default:
            logger.warn(`⚠️  Unsupported output type: ${outputConfig.type}`);
            continue;
        }

        await output.initialize();
        this.outputs.push(output);
        logger.debug(`📊 ${outputConfig.type} output initialized`);

      } catch (error) {
        logger.warn(`⚠️  Failed to initialize ${outputConfig.type} output:`, error);
      }
    }
  }

  /**
   * Process template variables in file paths and automatically add timestamp if not present
   */
  private processTemplateFilePath(filePath?: string): string {
    if (!filePath) {
      return `results/${this.config.name}-{{timestamp}}.csv`;
    }

    // If no timestamp placeholder exists, automatically add one before the extension
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

    // Use FileManager to process timestamp templates
    return FileManager.processFilePath(processedPath);
  }

  private async executeLoadPattern(): Promise<void> {
    // Setup base directory for CSV files BEFORE creating VUs
    this.setupCSVBaseDirectory();

    const vuFactory = this.createVUFactory();

    // Support both single load config and array of phases
    const loadPhases = Array.isArray(this.config.load) ? this.config.load : [this.config.load];

    logger.info(`📈 Executing ${loadPhases.length} load phase(s)`);

    // Execute each load phase sequentially
    for (let i = 0; i < loadPhases.length; i++) {
      const phase = loadPhases[i];
      const phaseName = phase.name || `Phase ${i + 1}`;

      logger.info(`\n🔄 Starting ${phaseName}: ${phase.pattern} pattern`);
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

      logger.success(`✅ Completed ${phaseName}`);

      // Small gap between phases
      if (i < loadPhases.length - 1) {
        logger.info('⏸️  Pausing 2s between phases...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    logger.success(`\n🎉 All ${loadPhases.length} load phase(s) completed`);
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
        let globalCSV: GlobalCSVOptions | undefined;
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

    while (this.activeVUs.length > 0 && this.isRunning) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeoutMs) {
        logger.warn(`⚠️  Timeout waiting for ${this.activeVUs.length} VUs to complete`);
        // Force stop remaining VUs
        this.activeVUs.forEach(vu => vu.stop());
        break;
      }

      await sleep(1000);

      if (this.activeVUs.length > 0 && elapsed % 5000 === 0) { // Log every 5 seconds
        logger.debug(`⏳ Waiting for ${this.activeVUs.length} VUs to complete...`);
      }
    }

    logger.debug('✅ All VUs completed');
  }

  private async cleanup(): Promise<void> {
    logger.debug('🧹 Cleaning up handlers...');

    // Cleanup protocol handlers
    for (const [name, handler] of this.handlers) {
      try {
        if (handler.cleanup) {
          await handler.cleanup();
        }
      } catch (error) {
        logger.warn(`⚠️  Error cleaning up ${name} handler:`, error);
      }
    }
  }

  private async finalize(): Promise<void> {
    logger.debug('🏁 Finalizing test...');

    // Cleanup handlers
    await this.cleanup();

    // Generate summary and write to outputs
    const summary = this.metrics.getSummary();
    this.logSummary(summary);
    this.logErrorDetails(summary);

    // Write summary to outputs
    for (const output of this.outputs) {
      try {
        await output.writeSummary(summary);
        await output.finalize();
      } catch (error) {
        logger.warn('⚠️  Output finalization failed:', error);
      }
    }

    // Generate HTML report if configured
    if (this.config.report?.generate) {
      await this.generateReport(summary);
    }
  }

  private logSummary(summary: any): void {
    logger.info('📊 Test Summary:');
    logger.info(`   Total Requests: ${summary.total_requests}`);
    logger.info(`   Success Rate: ${summary.success_rate.toFixed(2)}%`);
    logger.info(`   Avg Response Time: ${summary.avg_response_time.toFixed(2)}ms`);
    logger.info(`   Requests/sec: ${summary.requests_per_second.toFixed(2)}`);
    logger.info(`   Duration: ${(summary.total_duration / 1000).toFixed(1)}s`);
  }

  private logErrorDetails(summary: any): void {
    if (summary.failed_requests > 0) {
      logger.warn(`❌ ${summary.failed_requests} requests failed`);

      // Log status code distribution
      logger.info('📊 Status Code Distribution:');
      Object.entries(summary.status_distribution)
        .sort(([a], [b]) => parseInt(a as string) - parseInt(b as string))
        .forEach(([status, count]) => {
          const statusNum = parseInt(status);
          const isError = statusNum >= 400;
          const emoji = isError ? '❌' : '✅';
          logger.info(`   ${emoji} ${status}: ${count} requests`);
        });

      // Log top errors
      if (summary.error_details && summary.error_details.length > 0) {
        logger.warn('🔍 Top Error Details:');
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
      const { EnhancedHTMLReportGenerator } = await import('../reporting/enhanced-html-generator');
      const generator = new EnhancedHTMLReportGenerator();

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
      logger.error('❌ Report generation failed:', error);
    }
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

}
import { Page } from 'playwright';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, WebAction, BrowserConfig } from '../../config';
import { logger } from '../../utils/logger';
import {
  CoreWebVitalsCollector,
  VerificationMetricsCollector,
  VerificationStepMetrics
} from './core-web-vitals';
import { CapturedNetworkCall } from '../../metrics/types';

// Extracted modules
import { BrowserManager, StorageManager, ElementHighlighter, ScreenshotCapture } from './browser';
import { NetworkCaptureManager, NetworkCallCallback } from './network';
import { NavigationCommands, InteractionCommands, VerificationCommands, MeasurementCommands } from './commands';

export class WebHandler implements ProtocolHandler {
  private config: BrowserConfig;
  private verificationMetrics: Map<number, VerificationStepMetrics[]> = new Map();

  // Extracted managers
  private browserManager: BrowserManager;
  private networkManager: NetworkCaptureManager;
  private storageManager: StorageManager;
  private highlighter: ElementHighlighter;
  private screenshotCapture: ScreenshotCapture;

  // Command handlers
  private navigationCommands: NavigationCommands;
  private interactionCommands: InteractionCommands;
  private verificationCommands: VerificationCommands;
  private measurementCommands: MeasurementCommands;

  constructor(config: BrowserConfig, onNetworkCall?: NetworkCallCallback) {
    this.config = {
      ...config,
      type: config.type || 'chromium',
      headless: config.headless !== undefined ? config.headless : true
    };

    // Initialize managers
    this.browserManager = new BrowserManager(this.config);
    this.networkManager = new NetworkCaptureManager(onNetworkCall);
    this.storageManager = new StorageManager();
    this.highlighter = new ElementHighlighter(this.config.highlight);
    this.screenshotCapture = new ScreenshotCapture(this.config.screenshot_on_failure);

    // Initialize command handlers
    this.navigationCommands = new NavigationCommands(this.config);
    this.interactionCommands = new InteractionCommands(
      (page, selector) => this.highlighter.highlightElement(page, selector)
    );
    this.verificationCommands = new VerificationCommands();
    this.measurementCommands = new MeasurementCommands();
  }

  async initialize(): Promise<void> {
    logger.debug(`Enhanced WebHandler initialized - Core Web Vitals tracking enabled (type: ${this.config.type}, headless: ${this.config.headless})`);
  }

  async execute(action: WebAction, context: VUContext): Promise<ProtocolResult> {
    try {
      logger.info(`🎬 WebHandler.execute: command="${action.command}", selector="${action.selector || 'N/A'}", url="${action.url || 'N/A'}"`);

      this.networkManager.updateContext(context.vu_id, {
        scenario: (context as any).scenario,
        step_name: action.name || action.command
      });

      const page = await this.getPage(context.vu_id);
      let result: any;
      let verificationMetrics: VerificationStepMetrics | undefined;
      let webVitals: any;
      let performanceMetrics: any;

      await CoreWebVitalsCollector.injectVitalsCollector(page);

      switch (action.command) {
        case 'goto':
          result = await this.executeWithTiming(
            () => this.navigationCommands.handleGoto(page, action)
          );
          if (action.collectWebVitals !== false) {
            webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
          }
          break;

        case 'click':
          ({ result, verificationMetrics } = await this.executeInteractionWithMeasurement(
            page, action, 'click',
            () => this.interactionCommands.handleClick(page, action)
          ));
          if (action.collectWebVitals) {
            webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
          }
          break;

        case 'fill':
          ({ result, verificationMetrics } = await this.executeInteractionWithMeasurement(
            page, action, 'fill',
            () => this.interactionCommands.handleFill(page, action)
          ));
          if (action.collectWebVitals) {
            webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
          }
          break;

        case 'select':
          result = await this.executeWithTiming(
            () => this.interactionCommands.handleSelect(page, action)
          );
          break;

        case 'press':
          result = await this.executeWithTiming(
            () => this.interactionCommands.handlePress(page, action)
          );
          break;

        case 'wait_for_selector':
          ({ result, verificationMetrics } = await this.executeVerificationWithMeasurement(
            page, action, 'wait',
            () => this.verificationCommands.handleWaitForSelector(page, action)
          ));
          break;

        case 'verify_exists':
          ({ result, verificationMetrics } = await this.executeVerification(
            page, action, () => this.verificationCommands.handleVerifyExists(page, action)
          ));
          break;

        case 'verify_visible':
          ({ result, verificationMetrics } = await this.executeVerification(
            page, action, () => this.verificationCommands.handleVerifyVisible(page, action)
          ));
          break;

        case 'verify_text':
          ({ result, verificationMetrics } = await this.executeVerification(
            page, action, () => this.verificationCommands.handleVerifyText(page, action)
          ));
          break;

        case 'verify_contains':
          ({ result, verificationMetrics } = await this.executeVerification(
            page, action, () => this.verificationCommands.handleVerifyContains(page, action)
          ));
          break;

        case 'verify_not_exists':
          ({ result, verificationMetrics } = await this.executeVerification(
            page, action, () => this.verificationCommands.handleVerifyNotExists(page, action)
          ));
          break;

        case 'measure_web_vitals':
          result = await this.measurementCommands.handleMeasureWebVitals(page, action);
          webVitals = result.web_vitals;
          break;

        case 'performance_audit':
          result = await this.measurementCommands.handlePerformanceAudit(page, action, verificationMetrics);
          performanceMetrics = result.performance_audit;
          break;

        case 'wait_for_load_state':
          result = await this.navigationCommands.handleWaitForLoadState(page, action);
          break;

        case 'network_idle':
          result = await this.navigationCommands.handleNetworkIdle(page, action);
          break;

        case 'dom_ready':
          result = await this.navigationCommands.handleDomReady(page, action);
          break;

        case 'screenshot':
          result = await this.measurementCommands.handleScreenshot(page, action);
          if (verificationMetrics) {
            verificationMetrics.screenshot_size = result.screenshot;
          }
          break;

        case 'hover':
          result = await this.interactionCommands.handleHover(page, action);
          break;

        case 'evaluate':
          result = await this.interactionCommands.handleEvaluate(page, action);
          break;

        default:
          throw new Error(`Unsupported web action: ${action.command}`);
      }

      // Store verification metrics
      if (verificationMetrics) {
        const vuMetrics = this.verificationMetrics.get(context.vu_id) || [];
        vuMetrics.push(verificationMetrics);
        this.verificationMetrics.set(context.vu_id, vuMetrics);
      }

      // Evaluate Web Vitals
      let vitalsScore: 'good' | 'needs-improvement' | 'poor' | undefined;
      let vitalsDetails: any;
      if (webVitals) {
        const evaluation = this.measurementCommands.evaluateVitals(webVitals, action.webVitalsThresholds as any);
        vitalsScore = evaluation.score;
        vitalsDetails = evaluation.details;
      }

      const responseTime = result?.action_time || verificationMetrics?.duration;

      // Check for measurable commands
      const measurableCommands = [
        'verify_exists', 'verify_visible', 'verify_text', 'verify_contains', 'verify_not_exists',
        'wait_for_selector', 'wait_for_text',
        'measure_web_vitals', 'performance_audit'
      ];
      const shouldRecord = measurableCommands.includes(action.command);

      // Check for effective timeout
      const timeout = action.timeout || 30000;
      const timeoutThreshold = timeout * 0.95;
      const isEffectiveTimeout = responseTime && responseTime >= timeoutThreshold && measurableCommands.includes(action.command);

      if (isEffectiveTimeout) {
        return {
          success: false,
          error: `Verification timeout: took ${responseTime}ms (>= ${timeoutThreshold}ms threshold)`,
          shouldRecord: true,
          response_time: responseTime,
          custom_metrics: {
            page_url: page.url(),
            page_title: await page.title(),
            vu_id: context.vu_id,
            command: action.command,
            timeout_threshold: timeoutThreshold,
            verification_metrics: verificationMetrics
          }
        };
      }

      // Get captured network calls
      const networkConfig = this.config.network_capture;
      const capturedNetworkCalls = (networkConfig?.enabled && networkConfig?.store_inline !== false)
        ? this.networkManager.getAndClearNetworkCalls(context.vu_id)
        : undefined;

      if (capturedNetworkCalls?.length) {
        logger.info(`VU ${context.vu_id}: Captured ${capturedNetworkCalls.length} network calls for this step`);
      }

      return {
        success: true,
        data: result,
        shouldRecord,
        response_time: responseTime,
        custom_metrics: {
          page_url: page.url(),
          page_title: await page.title(),
          vu_id: context.vu_id,
          command: action.command,
          action_time: result?.action_time,
          web_vitals: webVitals,
          vitals_score: vitalsScore,
          vitals_details: vitalsDetails,
          verification_metrics: verificationMetrics,
          performance_metrics: performanceMetrics,
          network_calls: capturedNetworkCalls?.length ? capturedNetworkCalls : undefined,
          network_call_count: capturedNetworkCalls?.length || 0
        }
      };

    } catch (error: any) {
      return this.handleExecutionError(error, action, context);
    }
  }

  private async executeWithTiming<T extends { action_time?: number }>(
    fn: () => Promise<T>
  ): Promise<T> {
    const actionStart = Date.now();
    const result = await fn();
    result.action_time = Date.now() - actionStart;
    return result;
  }

  private async executeInteractionWithMeasurement(
    page: Page,
    action: WebAction,
    actionType: string,
    fn: () => Promise<any>
  ): Promise<{ result: any; verificationMetrics?: VerificationStepMetrics }> {
    const actionStart = Date.now();
    let result: any;
    let verificationMetrics: VerificationStepMetrics | undefined;

    if (action.measureVerification) {
      const measured = await VerificationMetricsCollector.measureVerificationStep(
        action.verificationName || `${actionType}_action`,
        actionType,
        fn,
        { selector: action.selector, expected_text: action.value as string }
      );
      result = measured.result;
      verificationMetrics = measured.metrics;
    } else {
      result = await fn();
    }

    result.action_time = Date.now() - actionStart;
    return { result, verificationMetrics };
  }

  private async executeVerificationWithMeasurement(
    page: Page,
    action: WebAction,
    actionType: string,
    fn: () => Promise<any>
  ): Promise<{ result: any; verificationMetrics?: VerificationStepMetrics }> {
    const actionStart = Date.now();
    let result: any;
    let verificationMetrics: VerificationStepMetrics | undefined;

    if (action.measureVerification) {
      const measured = await VerificationMetricsCollector.measureVerificationStep(
        action.verificationName || action.command,
        actionType,
        fn,
        { selector: action.selector }
      );
      result = measured.result;
      verificationMetrics = measured.metrics;
    } else {
      result = await fn();
    }

    result.action_time = Date.now() - actionStart;
    return { result, verificationMetrics };
  }

  private async executeVerification(
    page: Page,
    action: WebAction,
    fn: () => Promise<any>
  ): Promise<{ result: any; verificationMetrics: VerificationStepMetrics }> {
    const measured = await VerificationMetricsCollector.measureVerificationStep(
      action.verificationName || action.name || action.command,
      'verification',
      fn,
      { selector: action.selector, expected_text: action.expected_text }
    );
    return { result: measured.result, verificationMetrics: measured.metrics };
  }

  private async handleExecutionError(error: any, action: WebAction, context: VUContext): Promise<ProtocolResult> {
    const measurableCommands = [
      'verify_exists', 'verify_visible', 'verify_text', 'verify_contains', 'verify_not_exists',
      'wait_for_selector', 'wait_for_text',
      'measure_web_vitals', 'performance_audit'
    ];
    const shouldRecordError = measurableCommands.includes(action.command);
    const verificationMetrics = error.verificationMetrics;

    let screenshotPath: string | undefined;
    if (this.screenshotCapture.isEnabled()) {
      logger.debug(`Screenshot on failure enabled, attempting capture for VU ${context.vu_id}`);
      try {
        const page = this.browserManager.getExistingPage(context.vu_id);
        if (page && !page.isClosed()) {
          screenshotPath = await this.screenshotCapture.captureFailureScreenshot(page, context.vu_id, action.command);
        } else {
          logger.warn(`Cannot capture screenshot: page is ${page ? 'closed' : 'not found'} for VU ${context.vu_id}`);
        }
      } catch (screenshotError: any) {
        logger.warn(`Failed to capture failure screenshot: ${screenshotError.message}`);
      }
    }

    return {
      success: false,
      error: error.message,
      shouldRecord: shouldRecordError,
      response_time: verificationMetrics?.duration,
      custom_metrics: {
        vu_id: context.vu_id,
        command: action.command,
        error_type: error.constructor.name,
        error_stack: error.stack?.split('\n').slice(0, 3).join('; '),
        verification_metrics: verificationMetrics,
        screenshot: screenshotPath
      }
    };
  }

  private async getPage(vuId: number): Promise<Page> {
    return this.browserManager.getPage(vuId, async (page, context) => {
      logger.info(`VU ${vuId}: network_capture config = ${JSON.stringify(this.config.network_capture)}`);
      if (this.config.network_capture?.enabled) {
        this.networkManager.setupNetworkCapture(page, vuId, this.config.network_capture);
      } else {
        logger.info(`VU ${vuId}: Network capture NOT enabled`);
      }

      await this.storageManager.clearStorageIfConfigured(page, context, this.config.clear_storage);
    });
  }

  getVerificationMetrics(vuId: number): VerificationStepMetrics[] {
    return this.verificationMetrics.get(vuId) || [];
  }

  getNetworkCalls(vuId: number): CapturedNetworkCall[] {
    return this.networkManager.getNetworkCalls(vuId);
  }

  getAggregatedVerificationMetrics(): {
    total_verifications: number;
    success_rate: number;
    average_duration: number;
    p95_duration: number;
    slowest_step: VerificationStepMetrics | null;
    fastest_step: VerificationStepMetrics | null;
  } {
    const allMetrics: VerificationStepMetrics[] = [];
    for (const metrics of this.verificationMetrics.values()) {
      allMetrics.push(...metrics);
    }

    if (allMetrics.length === 0) {
      return {
        total_verifications: 0,
        success_rate: 0,
        average_duration: 0,
        p95_duration: 0,
        slowest_step: null,
        fastest_step: null
      };
    }

    const successful = allMetrics.filter(m => m.success);
    const durations = allMetrics.map(m => m.duration).sort((a, b) => a - b);

    return {
      total_verifications: allMetrics.length,
      success_rate: successful.length / allMetrics.length,
      average_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p95_duration: durations[Math.floor(durations.length * 0.95)],
      slowest_step: allMetrics.reduce((prev, current) =>
        prev.duration > current.duration ? prev : current
      ),
      fastest_step: allMetrics.reduce((prev, current) =>
        prev.duration < current.duration ? prev : current
      )
    };
  }

  async cleanup(): Promise<void> {
    logger.debug(`Cleaning up enhanced browsers with Web Vitals data...`);
    logger.info('Final verification metrics summary:', this.getAggregatedVerificationMetrics());

    await this.browserManager.cleanupAll();
    this.verificationMetrics.clear();
    this.networkManager.clearAll();

    logger.debug(`Enhanced cleanup completed`);
  }

  async cleanupVU(vuId: number): Promise<void> {
    await this.browserManager.cleanupVU(vuId);
    this.verificationMetrics.delete(vuId);
    this.networkManager.clearVU(vuId);
  }

  getBrowserInfo(vuId: number): { connected: boolean } | null {
    return this.browserManager.getBrowserInfo(vuId);
  }

  getActiveVUCount(): number {
    return this.browserManager.getActiveVUCount();
  }
}

import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, WebAction, BrowserConfig, HighlightConfig, ClearStorageConfig } from '../../config';
import { logger } from '../../utils/logger';
import { 
  CoreWebVitalsCollector, 
  VerificationMetricsCollector, 
  WebPerformanceCollector,
  CoreWebVitals,
  VerificationStepMetrics,
  WebPerformanceMetrics
} from './core-web-vitals';

export class WebHandler implements ProtocolHandler {
  private browsers: Map<number, Browser> = new Map();
  private contexts: Map<number, BrowserContext> = new Map();
  private pages: Map<number, Page> = new Map();
  private verificationMetrics: Map<number, VerificationStepMetrics[]> = new Map();
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = {
      ...config,
      type: config.type || 'chromium',
      headless: config.headless !== undefined ? config.headless : true
    };
  }

  async initialize(): Promise<void> {
    logger.debug(`Enhanced WebHandler initialized - Core Web Vitals tracking enabled (type: ${this.config.type}, headless: ${this.config.headless})`);
  }

  async execute(action: WebAction, context: VUContext): Promise<ProtocolResult> {
    try {
      logger.info(`🎬 WebHandler.execute: command="${action.command}", selector="${action.selector || 'N/A'}", url="${action.url || 'N/A'}"`);

      const page = await this.getPage(context.vu_id);
      let result: any;
      let verificationMetrics: VerificationStepMetrics | undefined;
      let webVitals: CoreWebVitals | undefined;
      let performanceMetrics: WebPerformanceMetrics | undefined;

      // Always inject Web Vitals collector for browser tests
      await CoreWebVitalsCollector.injectVitalsCollector(page);

      switch (action.command) {
        case 'goto':
          {
            const actionStart = Date.now();
            result = await this.handleGoto(page, action);
            result.action_time = Date.now() - actionStart;
            // Collect Web Vitals after navigation (optional, doesn't affect action_time)
            if (action.collectWebVitals !== false) {
              webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
            }
          }
          break;

        case 'click':
          {
            const actionStart = Date.now();
            if (action.measureVerification) {
              const measured = await VerificationMetricsCollector.measureVerificationStep(
                action.verificationName || 'click_action',
                'click',
                () => this.handleClick(page, action),
                { selector: action.selector }
              );
              result = measured.result;
              verificationMetrics = measured.metrics;
            } else {
              result = await this.handleClick(page, action);
            }
            result.action_time = Date.now() - actionStart;
            // Only collect Web Vitals if explicitly requested
            if (action.collectWebVitals) {
              webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
            }
          }
          break;

        case 'fill':
          {
            const actionStart = Date.now();
            if (action.measureVerification) {
              const measured = await VerificationMetricsCollector.measureVerificationStep(
                action.verificationName || 'fill_action',
                'fill',
                () => this.handleFill(page, action),
                { selector: action.selector, expected_text: action.value as string }
              );
              result = measured.result;
              verificationMetrics = measured.metrics;
            } else {
              result = await this.handleFill(page, action);
            }
            result.action_time = Date.now() - actionStart;
            // Only collect Web Vitals if explicitly requested
            if (action.collectWebVitals) {
              webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
            }
          }
          break;

        case 'select':
          {
            const actionStart = Date.now();
            result = await this.handleSelect(page, action);
            result.action_time = Date.now() - actionStart;
          }
          break;

        case 'wait_for_selector':
          {
            const actionStart = Date.now();
            if (action.measureVerification) {
              const measured = await VerificationMetricsCollector.measureVerificationStep(
                action.verificationName || 'wait_for_selector',
                'wait',
                () => this.handleWaitForSelector(page, action),
                { selector: action.selector }
              );
              result = measured.result;
              verificationMetrics = measured.metrics;
            } else {
              result = await this.handleWaitForSelector(page, action);
            }
            result.action_time = Date.now() - actionStart;
          }
          break;

        case 'verify_exists':
          const measured = await VerificationMetricsCollector.measureVerificationStep(
            action.verificationName || action.name || 'verify_exists',
            'verification',
            () => this.handleVerifyExists(page, action),
            { selector: action.selector }
          );
          result = measured.result;
          verificationMetrics = measured.metrics;
          break;

        case 'verify_visible':
          const visibleMeasured = await VerificationMetricsCollector.measureVerificationStep(
            action.verificationName || action.name || 'verify_visible',
            'verification',
            () => this.handleVerifyVisible(page, action),
            { selector: action.selector }
          );
          result = visibleMeasured.result;
          verificationMetrics = visibleMeasured.metrics;
          break;

        case 'verify_text':
          const textMeasured = await VerificationMetricsCollector.measureVerificationStep(
            action.verificationName || action.name || 'verify_text',
            'verification',
            () => this.handleVerifyText(page, action),
            { selector: action.selector, expected_text: action.expected_text }
          );
          result = textMeasured.result;
          verificationMetrics = textMeasured.metrics;
          break;

        case 'verify_not_exists':
          const notExistsMeasured = await VerificationMetricsCollector.measureVerificationStep(
            action.verificationName || action.name || 'verify_not_exists',
            'verification',
            () => this.handleVerifyNotExists(page, action),
            { selector: action.selector }
          );
          result = notExistsMeasured.result;
          verificationMetrics = notExistsMeasured.metrics;
          break;

        case 'measure_web_vitals':
          webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 3000);
          result = { web_vitals: webVitals };
          break;

        case 'performance_audit':
          performanceMetrics = await WebPerformanceCollector.collectAllMetrics(page, verificationMetrics);
          result = { performance_audit: performanceMetrics };
          break;

        case 'wait_for_load_state':
          const waitUntil = action.waitUntil === 'commit' ? 'load' : (action.waitUntil || 'load');
          await page.waitForLoadState(waitUntil as 'load' | 'domcontentloaded' | 'networkidle', { timeout: action.timeout || 30000 });
          result = { load_state: waitUntil };
          break;

        case 'network_idle':
          await page.waitForLoadState('networkidle', { timeout: action.networkIdleTimeout || 30000 });
          result = { network_idle: true };
          break;

        case 'dom_ready':
          await page.waitForLoadState('domcontentloaded', { timeout: action.timeout || 30000 });
          result = { dom_ready: true };
          break;

        case 'screenshot':
          const screenshot = await page.screenshot({
            type: 'png',
            fullPage: action.options?.fullPage || false
          });
          result = { 
            screenshot: screenshot.length,
            screenshot_data: action.options?.includeData ? screenshot.toString('base64') : undefined
          };
          if (verificationMetrics) {
            verificationMetrics.screenshot_size = screenshot.length;
          }
          break;

        default:
          // Fall back to original handler methods for backward compatibility
          result = await this.handleLegacyAction(page, action, context);
      }

      // Store verification metrics for later analysis
      if (verificationMetrics) {
        const vuMetrics = this.verificationMetrics.get(context.vu_id) || [];
        vuMetrics.push(verificationMetrics);
        this.verificationMetrics.set(context.vu_id, vuMetrics);
      }

      // Evaluate Web Vitals if collected
      let vitalsScore: 'good' | 'needs-improvement' | 'poor' | undefined;
      let vitalsDetails: any;
      if (webVitals) {
        const evaluation = CoreWebVitalsCollector.evaluateVitals(
          webVitals, 
          action.webVitalsThresholds as any
        );
        vitalsScore = evaluation.score;
        vitalsDetails = evaluation.details;
      }

      // Use action_time if available (actual action duration without web vitals collection)
      // Or verification metrics duration for verify steps
      const responseTime = result?.action_time || verificationMetrics?.duration;

      const enhancedResult: ProtocolResult = {
        success: true,
        data: result,
        shouldRecord: true,  // Always record web results for Web Vitals
        response_time: responseTime,  // Actual action time for accurate graphs
        custom_metrics: {
          page_url: page.url(),
          page_title: await page.title(),
          vu_id: context.vu_id,
          action_time: result?.action_time,
          web_vitals: webVitals,
          vitals_score: vitalsScore,
          vitals_details: vitalsDetails,
          verification_metrics: verificationMetrics,
          performance_metrics: performanceMetrics
        }
      };

      return enhancedResult;

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        shouldRecord: true,  // Record errors too for analysis
        custom_metrics: {
          vu_id: context.vu_id,
          error_type: error.constructor.name,
          error_stack: error.stack?.split('\n').slice(0, 3).join('; ')
        }
      };
    }
  }

  private async handleGoto(page: Page, action: WebAction): Promise<any> {
    const fullUrl = action.url?.startsWith('http')
        ? action.url
        : `${this.config.base_url}${action.url || ''}`;

    const response = await page.goto(fullUrl, {
      timeout: action.timeout || 30000,
      waitUntil: action.waitUntil || 'domcontentloaded'
    });

    return { 
      url: page.url(),
      status: response?.status(),
      headers: await response?.allHeaders(),
      loading_time: Date.now() - performance.now()
    };
  }

  private async handleClick(page: Page, action: WebAction): Promise<any> {
    const timeout = action.timeout || 30000;
    const selector = action.selector!;

    // Wait for the element to be visible and stable before clicking
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout
    });

    // Highlight element before clicking (if enabled)
    await this.highlightElement(page, selector);

    // Click using locator for reliability
    await page.locator(selector).click({ timeout });

    return { clicked: selector };
  }

  private async handleFill(page: Page, action: WebAction): Promise<any> {
    const timeout = action.timeout || 30000;

    // Wait for the element to be visible before filling
    await page.waitForSelector(action.selector!, {
      state: 'visible',
      timeout
    });

    // Highlight element before filling (if enabled)
    await this.highlightElement(page, action.selector!);

    await page.locator(action.selector!).fill(action.value as string, { timeout });

    return { filled: action.selector, value: action.value };
  }

  private async handleSelect(page: Page, action: WebAction): Promise<any> {
    const timeout = action.timeout || 30000;

    await page.waitForSelector(action.selector!, {
      state: 'visible',
      timeout
    });

    // Highlight element before selecting (if enabled)
    await this.highlightElement(page, action.selector!);

    await page.locator(action.selector!).selectOption(action.value as string, { timeout });

    return { selected: action.selector, value: action.value };
  }

  private async handleWaitForSelector(page: Page, action: WebAction): Promise<any> {
    await page.waitForSelector(action.selector!, {
      timeout: action.timeout || 30000
    });
    return { waited_for: action.selector };
  }

  private async handleVerifyExists(page: Page, action: WebAction): Promise<any> {
    await page.waitForSelector(action.selector!, {
      state: 'attached',
      timeout: action.timeout || 30000
    });

    const elementCount = await page.locator(action.selector!).count();
    return {
      verified: 'exists',
      selector: action.selector,
      name: action.name,
      found_elements: elementCount,
      element_count: elementCount
    };
  }

  private async handleVerifyVisible(page: Page, action: WebAction): Promise<any> {
    await page.waitForSelector(action.selector!, {
      state: 'visible',
      timeout: action.timeout || 30000
    });

    return {
      verified: 'visible',
      selector: action.selector,
      name: action.name,
      is_visible: true
    };
  }

  private async handleVerifyText(page: Page, action: WebAction): Promise<any> {
    await page.waitForSelector(action.selector!, {
      state: 'attached',
      timeout: action.timeout || 30000
    });

    const textLocator = page.locator(action.selector!);
    const actualText = await textLocator.textContent();
    const expectedText = action.expected_text as string;

    if (!actualText || !actualText.includes(expectedText)) {
      throw new Error(`Verification failed: Element "${action.selector}" text "${actualText}" does not contain expected text "${expectedText}"${action.name ? ` (${action.name})` : ''}`);
    }

    return {
      verified: 'text',
      selector: action.selector,
      name: action.name,
      expected_text: expectedText,
      actual_text: actualText,
      text_match: true
    };
  }

  private async handleVerifyNotExists(page: Page, action: WebAction): Promise<any> {
    try {
      await page.waitForSelector(action.selector!, {
        state: 'detached',
        timeout: action.timeout || 5000
      });
    } catch (error) {
      const count = await page.locator(action.selector!).count();
      if (count > 0) {
        throw new Error(`Verification failed: Element "${action.selector}" exists but should not exist${action.name ? ` (${action.name})` : ''}`);
      }
    }

    return {
      verified: 'not_exists',
      selector: action.selector,
      name: action.name,
      found_elements: 0
    };
  }

  private async handleLegacyAction(page: Page, action: WebAction, context: VUContext): Promise<any> {
    // Handle any legacy actions not covered by new implementation
    switch (action.command) {
      case 'evaluate':
        if (action.script) {
          const result = await page.evaluate(action.script);
          return { evaluation_result: result };
        }
        break;
      case 'hover':
        await page.hover(action.selector!);
        return { hovered: action.selector };
      default:
        throw new Error(`Unsupported web action: ${action.command}`);
    }
  }

  private async getPage(vuId: number): Promise<Page> {
    let page = this.pages.get(vuId);

    if (!page) {
      const browser = await this.createBrowserForVU(vuId);
      this.browsers.set(vuId, browser);

      const context = await browser.newContext({
        viewport: this.config.viewport || { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        storageState: undefined
      });

      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Clear storage if configured
      await this.clearStorageIfConfigured(page, context);

      this.contexts.set(vuId, context);
      this.pages.set(vuId, page);

      logger.debug(`VU ${vuId}: Created enhanced browser with Web Vitals support`);
    }

    return page;
  }

  private async createBrowserForVU(vuId: number): Promise<Browser> {
    const browserType = this.config.type || 'chromium';

    const launchOptions: any = {
      headless: this.config.headless !== false,
      slowMo: this.config.slow_mo || 0,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-http-cache',
        '--disable-cache',
        '--disable-application-cache',
        '--disable-offline-load-stale-cache',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--disable-renderer-backgrounding',
        // Enable performance monitoring
        '--enable-precise-memory-info',
        '--enable-performance-manager-web-contents-observer',
        '--enable-experimental-web-platform-features'
      ]
    };

    let browser: Browser;

    try {
      switch (browserType) {
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          throw new Error(`Unsupported browser type: ${browserType}`);
      }

      logger.debug(`VU ${vuId}: Launched enhanced ${browserType} browser with Web Vitals support`);
      return browser;

    } catch (error) {
      logger.error(`VU ${vuId}: Failed to launch ${browserType} browser:`, error);
      throw error;
    }
  }

  // Get verification metrics for a specific VU
  getVerificationMetrics(vuId: number): VerificationStepMetrics[] {
    return this.verificationMetrics.get(vuId) || [];
  }

  // Get aggregated verification metrics across all VUs
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
    const browserCount = this.browsers.size;
    logger.debug(`Cleaning up ${browserCount} enhanced browsers with Web Vitals data...`);

    // Log final verification metrics summary
    const aggregatedMetrics = this.getAggregatedVerificationMetrics();
    logger.info('Final verification metrics summary:', aggregatedMetrics);

    // Close all resources
    for (const [vuId, page] of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing page:`, error);
      }
    }

    for (const [vuId, context] of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing context:`, error);
      }
    }

    for (const [vuId, browser] of this.browsers) {
      try {
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing browser:`, error);
      }
    }

    this.pages.clear();
    this.contexts.clear();
    this.browsers.clear();
    this.verificationMetrics.clear();

    logger.debug(`Enhanced cleanup completed - ${browserCount} browsers closed`);
  }

  async cleanupVU(vuId: number): Promise<void> {
    logger.debug(`Cleaning up enhanced browser resources for VU ${vuId}...`);

    const page = this.pages.get(vuId);
    if (page) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing page:`, error);
      }
      this.pages.delete(vuId);
    }

    const context = this.contexts.get(vuId);
    if (context) {
      try {
        await context.close();
      } catch (error: any) {
        // Ignore "context already closed" errors - this is expected when browser closes first
        if (!error?.message?.includes('Failed to find context') &&
            !error?.message?.includes('Target closed') &&
            !error?.message?.includes('has been closed')) {
          logger.warn(`VU ${vuId}: Error closing context:`, error);
        }
      }
      this.contexts.delete(vuId);
    }

    const browser = this.browsers.get(vuId);
    if (browser) {
      try {
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing browser:`, error);
      }
      this.browsers.delete(vuId);
    }

    // Clean up verification metrics
    this.verificationMetrics.delete(vuId);

    logger.debug(`VU ${vuId}: Enhanced browser cleanup completed`);
  }

  getBrowserInfo(vuId: number): { connected: boolean } | null {
    const browser = this.browsers.get(vuId);
    if (!browser) return null;

    return {
      connected: browser.isConnected()
    };
  }

  getActiveVUCount(): number {
    return this.browsers.size;
  }

  /**
   * Clear browser storage (localStorage, sessionStorage, cookies) if configured
   */
  private async clearStorageIfConfigured(page: Page, context: BrowserContext): Promise<void> {
    const clearConfig = this.config.clear_storage;

    if (!clearConfig) return;

    const config: ClearStorageConfig = typeof clearConfig === 'boolean'
      ? { local_storage: true, session_storage: true, cookies: true, cache: false }
      : clearConfig;

    try {
      // We need to navigate to a page first to access storage
      // Use about:blank or a data URL
      await page.goto('about:blank');

      // Clear cookies
      if (config.cookies !== false) {
        await context.clearCookies();
        logger.debug('Cleared cookies');
      }

      // Clear localStorage and sessionStorage
      if (config.local_storage !== false || config.session_storage !== false) {
        await page.evaluate((opts) => {
          if (opts.local_storage !== false) {
            try { localStorage.clear(); } catch (e) { /* ignore */ }
          }
          if (opts.session_storage !== false) {
            try { sessionStorage.clear(); } catch (e) { /* ignore */ }
          }
        }, { local_storage: config.local_storage, session_storage: config.session_storage });

        if (config.local_storage !== false) logger.debug('Cleared localStorage');
        if (config.session_storage !== false) logger.debug('Cleared sessionStorage');
      }

      logger.debug('Browser storage cleared');

    } catch (error) {
      logger.warn('Failed to clear storage:', error);
    }
  }

  /**
   * Highlight an element before interacting with it (for debugging)
   */
  private async highlightElement(page: Page, selector: string): Promise<void> {
    const highlightConfig = this.config.highlight;

    // Skip if highlight is not enabled
    if (!highlightConfig) return;

    const config: HighlightConfig = typeof highlightConfig === 'boolean'
      ? { enabled: highlightConfig }
      : highlightConfig;

    if (!config.enabled) return;

    const duration = config.duration || 500;
    const color = config.color || '#ff0000';
    const style = config.style || 'border';

    try {
      const locator = page.locator(selector).first();
      const count = await locator.count();

      if (count === 0) return;

      // Apply highlight styles
      await locator.evaluate((el, opts) => {
        const { color, style, duration } = opts;
        const originalStyle = el.getAttribute('style') || '';

        let highlightStyle = '';
        if (style === 'border' || style === 'both') {
          highlightStyle += `outline: 3px solid ${color} !important; outline-offset: 2px !important;`;
        }
        if (style === 'background' || style === 'both') {
          highlightStyle += `background-color: ${color}33 !important;`;
        }

        el.setAttribute('style', originalStyle + highlightStyle);

        // Restore original style after duration
        setTimeout(() => {
          el.setAttribute('style', originalStyle);
        }, duration);
      }, { color, style, duration });

      // Wait for highlight to be visible
      await page.waitForTimeout(duration);

    } catch (error) {
      // Don't fail the test if highlighting fails
      logger.debug(`Failed to highlight element ${selector}:`, error);
    }
  }
}
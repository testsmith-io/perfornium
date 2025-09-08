import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, WebAction, BrowserConfig } from '../../config/types';
import { logger } from '../../utils/logger';

export class WebHandler implements ProtocolHandler {
  private browsers: Map<number, Browser> = new Map();
  private contexts: Map<number, BrowserContext> = new Map();
  private pages: Map<number, Page> = new Map();
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = {
      ...config,
      type: config.type || 'chromium',
      headless: config.headless !== undefined ? config.headless : true
    };
  }

  async initialize(): Promise<void> {
    // No shared browser initialization - each VU creates its own
    logger.debug(`WebHandler initialized - browsers will be created per VU (type: ${this.config.type}, headless: ${this.config.headless})`);
  }

  async execute(action: WebAction, context: VUContext): Promise<ProtocolResult> {
    try {
      const page = await this.getPage(context.vu_id);
      let result: any;

      switch (action.command) {
        case 'goto':
          const fullUrl = action.url?.startsWith('http')
              ? action.url
              : `${this.config.base_url}${action.url || ''}`;

          await page.goto(fullUrl, {
            timeout: action.timeout || 30000,
            waitUntil: 'domcontentloaded'
          });
          result = { url: page.url() };
          break;

        case 'click':
          await page.click(action.selector!, {
            timeout: action.timeout || 30000
          });
          result = { clicked: action.selector };
          break;

        case 'fill':
          await page.fill(action.selector!, action.value as string, {
            timeout: action.timeout || 30000
          });
          result = { filled: action.selector, value: action.value };
          break;

        case 'select':
          await page.selectOption(action.selector!, action.value as string, {
            timeout: action.timeout || 30000
          });
          result = { selected: action.selector, value: action.value };
          break;

        case 'wait_for_selector':
          await page.waitForSelector(action.selector!, {
            timeout: action.timeout || 30000
          });
          result = { waited_for: action.selector };
          break;

        case 'verify_exists':
          const startTime = Date.now();

          await page.waitForSelector(action.selector!, {
            state: 'attached',
            timeout: action.timeout || 30000
          });

          const elementCount = await page.locator(action.selector!).count();
          const actualDuration = Date.now() - startTime;

          logger.info(`VU ${context.vu_id}: verify_exists took ${actualDuration}ms for "${action.selector}"`);

          result = {
            verified: 'exists',
            selector: action.selector,
            name: action.name,
            found_elements: elementCount,
            internal_duration: actualDuration // Add this for comparison
          };
          break;

        case 'verify_visible':
          const visibleStartTime = Date.now();

          await page.waitForSelector(action.selector!, {
            state: 'visible',
            timeout: action.timeout || 30000
          });

          const visibleDuration = Date.now() - visibleStartTime;
          logger.info(`VU ${context.vu_id}: verify_visible took ${visibleDuration}ms for "${action.selector}"`);

          result = {
            verified: 'visible',
            selector: action.selector,
            name: action.name,
            is_visible: true,
            internal_duration: visibleDuration
          };
          break;

        case 'verify_text':
          const textStartTime = Date.now();

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

          const textDuration = Date.now() - textStartTime;
          logger.info(`VU ${context.vu_id}: verify_text took ${textDuration}ms for "${action.selector}"`);

          result = {
            verified: 'text',
            selector: action.selector,
            name: action.name,
            expected_text: expectedText,
            actual_text: actualText,
            text_match: true,
            internal_duration: textDuration
          };
          break;

        case 'verify_not_exists':
          const notExistsStartTime = Date.now();

          // For verify_not_exists, we want to wait for the element to NOT be present
          // Use a shorter timeout and catch the timeout as success
          try {
            await page.waitForSelector(action.selector!, {
              state: 'detached',
              timeout: action.timeout || 5000 // Shorter timeout for "not exists"
            });
          } catch (error) {
            // If element still exists after timeout, that's a verification failure
            const count = await page.locator(action.selector!).count();
            if (count > 0) {
              throw new Error(`Verification failed: Element "${action.selector}" exists but should not exist${action.name ? ` (${action.name})` : ''}`);
            }
          }

          const notExistsDuration = Date.now() - notExistsStartTime;
          logger.info(`VU ${context.vu_id}: verify_not_exists took ${notExistsDuration}ms for "${action.selector}"`);

          result = {
            verified: 'not_exists',
            selector: action.selector,
            name: action.name,
            found_elements: 0,
            internal_duration: notExistsDuration
          };
          break;

        case 'screenshot':
          const screenshot = await page.screenshot({
            type: 'png',
            fullPage: action.options?.fullPage || false
          });
          result = { screenshot: screenshot.length };
          break;

        // case 'wait':
        //   const waitTime = typeof action.time === 'string'
        //       ? this.parseTimeString(action.time)
        //       : action.time || 1000;
        //
        //   await page.waitForTimeout(waitTime);
        //   result = { waited: waitTime };
        //   break;

        default:
          throw new Error(`Unsupported web action: ${action.command}`);
      }

      return {
        success: true,
        data: result,
        custom_metrics: {
          page_url: page.url(),
          page_title: await page.title(),
          vu_id: context.vu_id
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        custom_metrics: {
          vu_id: context.vu_id
        }
      };
    }
  }

  private async getPage(vuId: number): Promise<Page> {
    let page = this.pages.get(vuId);

    if (!page) {
      // Create a dedicated browser for this VU
      const browser = await this.createBrowserForVU(vuId);
      this.browsers.set(vuId, browser);

      // Create context with proper isolation
      const context = await browser.newContext({
        viewport: this.config.viewport || { width: 1280, height: 720 },
        // userAgent: this.config.userAgent,
        ignoreHTTPSErrors: true,
        // Each VU gets a fresh context with no shared state
        storageState: undefined
      });

      page = await context.newPage();

      // Set default timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      this.contexts.set(vuId, context);
      this.pages.set(vuId, page);

      logger.debug(`VU ${vuId}: Created isolated browser, context, and page`);
    }

    return page;
  }

  private async createBrowserForVU(vuId: number): Promise<Browser> {
    const browserType = this.config.type || 'chromium';

    const launchOptions: any = {
      headless: this.config.headless !== false,
      slowMo: this.config.slow_mo || 0,
      // Ensure each browser is completely isolated
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

      logger.debug(`VU ${vuId}: Launched ${browserType} browser`);
      return browser;

    } catch (error) {
      logger.error(`VU ${vuId}: Failed to launch ${browserType} browser:`, error);
      throw error;
    }
  }

  private parseTimeString(timeStr: string): number {
    const match = timeStr.match(/^(\d+(?:\.\d+)?)(ms|s|m)$/);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}. Use format like "1s", "500ms", "2m"`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      default:
        throw new Error(`Unsupported time unit: ${unit}`);
    }
  }

  async cleanup(): Promise<void> {
    const browserCount = this.browsers.size;
    logger.debug(`Cleaning up ${browserCount} isolated browsers...`);

    // Close all pages first
    for (const [vuId, page] of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing page:`, error);
      }
    }

    // Close all contexts
    for (const [vuId, context] of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing context:`, error);
      }
    }

    // Close all browsers
    for (const [vuId, browser] of this.browsers) {
      try {
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing browser:`, error);
      }
    }

    // Clear all maps
    this.pages.clear();
    this.contexts.clear();
    this.browsers.clear();

    logger.debug(`Cleanup completed - ${browserCount} browsers closed`);
  }

  // Utility method to get VU-specific browser info
  getBrowserInfo(vuId: number): { connected: boolean } | null {
    const browser = this.browsers.get(vuId);
    if (!browser) return null;

    return {
      connected: browser.isConnected()
    };
  }

  // Get active VU count
  getActiveVUCount(): number {
    return this.browsers.size;
  }

  /**
   * Clean up browser resources for a specific VU
   */
  async cleanupVU(vuId: number): Promise<void> {
    logger.debug(`Cleaning up browser resources for VU ${vuId}...`);

    // Close page
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

    // Close context
    const context = this.contexts.get(vuId);
    if (context) {
      try {
        await context.close();
      } catch (error) {
        logger.warn(`VU ${vuId}: Error closing context:`, error);
      }
      this.contexts.delete(vuId);
    }

    // Close browser
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

    logger.debug(`VU ${vuId}: Browser cleanup completed`);
  }
}
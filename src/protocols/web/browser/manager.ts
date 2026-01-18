import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { BrowserConfig } from '../../../config';
import { logger } from '../../../utils/logger';

export class BrowserManager {
  private browsers: Map<number, Browser> = new Map();
  private contexts: Map<number, BrowserContext> = new Map();
  private pages: Map<number, Page> = new Map();

  constructor(private config: BrowserConfig) {}

  async getPage(vuId: number, onPageCreated?: (page: Page, context: BrowserContext) => Promise<void>): Promise<Page> {
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

      if (onPageCreated) {
        await onPageCreated(page, context);
      }

      this.contexts.set(vuId, context);
      this.pages.set(vuId, page);

      logger.debug(`VU ${vuId}: Created enhanced browser with Web Vitals support`);
    }

    return page;
  }

  getExistingPage(vuId: number): Page | undefined {
    return this.pages.get(vuId);
  }

  getContext(vuId: number): BrowserContext | undefined {
    return this.contexts.get(vuId);
  }

  getBrowser(vuId: number): Browser | undefined {
    return this.browsers.get(vuId);
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
        case 'chrome':
          browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
          break;
        case 'msedge':
          browser = await chromium.launch({ ...launchOptions, channel: 'msedge' });
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          throw new Error(`Unsupported browser type: ${browserType}. Supported: chromium, chrome, msedge, firefox, webkit`);
      }

      logger.debug(`VU ${vuId}: Launched enhanced ${browserType} browser with Web Vitals support`);
      return browser;

    } catch (error) {
      logger.error(`VU ${vuId}: Failed to launch ${browserType} browser:`, error);
      throw error;
    }
  }

  getBrowserInfo(vuId: number): { connected: boolean } | null {
    const browser = this.browsers.get(vuId);
    if (!browser) return null;
    return { connected: browser.isConnected() };
  }

  getActiveVUCount(): number {
    return this.browsers.size;
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

    logger.debug(`VU ${vuId}: Enhanced browser cleanup completed`);
  }

  async cleanupAll(): Promise<void> {
    const browserCount = this.browsers.size;
    logger.debug(`Cleaning up ${browserCount} enhanced browsers...`);

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

    logger.debug(`Enhanced cleanup completed - ${browserCount} browsers closed`);
  }
}

import { Page } from 'playwright';
import { WebAction, BrowserConfig } from '../../../config';
import { CommandResult } from './types';

export class NavigationCommands {
  constructor(private config: BrowserConfig) {}

  async handleGoto(page: Page, action: WebAction): Promise<CommandResult> {
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

  async handleWaitForLoadState(page: Page, action: WebAction): Promise<CommandResult> {
    const waitUntil = action.waitUntil === 'commit' ? 'load' : (action.waitUntil || 'load');
    await page.waitForLoadState(waitUntil as 'load' | 'domcontentloaded' | 'networkidle', {
      timeout: action.timeout || 30000
    });
    return { load_state: waitUntil };
  }

  async handleNetworkIdle(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForLoadState('networkidle', {
      timeout: action.networkIdleTimeout || 30000
    });
    return { network_idle: true };
  }

  async handleDomReady(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForLoadState('domcontentloaded', {
      timeout: action.timeout || 30000
    });
    return { dom_ready: true };
  }
}

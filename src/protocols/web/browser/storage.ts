import { Page, BrowserContext } from 'playwright';
import { ClearStorageConfig } from '../../../config';
import { logger } from '../../../utils/logger';

export class StorageManager {
  async clearStorageIfConfigured(
    page: Page,
    context: BrowserContext,
    clearConfig: boolean | ClearStorageConfig | undefined
  ): Promise<void> {
    if (!clearConfig) return;

    const config: ClearStorageConfig = typeof clearConfig === 'boolean'
      ? { local_storage: true, session_storage: true, cookies: true, cache: false }
      : clearConfig;

    try {
      await page.goto('about:blank');

      if (config.cookies !== false) {
        await context.clearCookies();
        logger.debug('Cleared cookies');
      }

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
}

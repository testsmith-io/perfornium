import { Page } from 'playwright';
import { HighlightConfig } from '../../../config';
import { logger } from '../../../utils/logger';

export class ElementHighlighter {
  constructor(private highlightConfig: boolean | HighlightConfig | undefined) {}

  async highlightElement(page: Page, selector: string): Promise<void> {
    if (!this.highlightConfig) return;

    const config: HighlightConfig = typeof this.highlightConfig === 'boolean'
      ? { enabled: this.highlightConfig }
      : this.highlightConfig;

    if (!config.enabled) return;

    const duration = config.duration || 500;
    const color = config.color || '#ff0000';
    const style = config.style || 'border';

    try {
      const locator = page.locator(selector).first();
      const count = await locator.count();

      if (count === 0) return;

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

        setTimeout(() => {
          el.setAttribute('style', originalStyle);
        }, duration);
      }, { color, style, duration });

      await page.waitForTimeout(duration);

    } catch (error) {
      logger.debug(`Failed to highlight element ${selector}:`, error);
    }
  }
}

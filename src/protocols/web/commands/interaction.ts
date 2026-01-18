import { Page } from 'playwright';
import { WebAction } from '../../../config';
import { CommandResult, HighlightFunction } from './types';

export class InteractionCommands {
  constructor(private highlightElement: HighlightFunction) {}

  async handleClick(page: Page, action: WebAction): Promise<CommandResult> {
    const timeout = action.timeout || 30000;
    const selector = action.selector!;

    await page.waitForSelector(selector, {
      state: 'visible',
      timeout
    });

    await this.highlightElement(page, selector);
    await page.locator(selector).click({ timeout });

    return { clicked: selector };
  }

  async handleFill(page: Page, action: WebAction): Promise<CommandResult> {
    const timeout = action.timeout || 30000;

    await page.waitForSelector(action.selector!, {
      state: 'visible',
      timeout
    });

    await this.highlightElement(page, action.selector!);
    await page.locator(action.selector!).fill(action.value as string, { timeout });

    return { filled: action.selector, value: action.value };
  }

  async handleSelect(page: Page, action: WebAction): Promise<CommandResult> {
    const timeout = action.timeout || 30000;

    await page.waitForSelector(action.selector!, {
      state: 'visible',
      timeout
    });

    await this.highlightElement(page, action.selector!);
    await page.locator(action.selector!).selectOption(action.value as string, { timeout });

    return { selected: action.selector, value: action.value };
  }

  async handlePress(page: Page, action: WebAction): Promise<CommandResult> {
    const timeout = action.timeout || 30000;
    const key = action.key as string;

    if (action.selector) {
      await page.waitForSelector(action.selector, {
        state: 'visible',
        timeout
      });

      await this.highlightElement(page, action.selector);
      await page.locator(action.selector).press(key, { timeout });

      return { pressed: key, selector: action.selector };
    } else {
      await page.keyboard.press(key);
      return { pressed: key };
    }
  }

  async handleHover(page: Page, action: WebAction): Promise<CommandResult> {
    await page.hover(action.selector!);
    return { hovered: action.selector };
  }

  async handleEvaluate(page: Page, action: WebAction): Promise<CommandResult> {
    if (action.script) {
      const result = await page.evaluate(action.script);
      return { evaluation_result: result };
    }
    throw new Error('No script provided for evaluate command');
  }
}

import { Page } from 'playwright';
import { WebAction } from '../../../config';
import { CommandResult } from './types';

export class VerificationCommands {
  async handleWaitForSelector(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForSelector(action.selector!, {
      timeout: action.timeout || 30000
    });
    return { waited_for: action.selector };
  }

  async handleVerifyExists(page: Page, action: WebAction): Promise<CommandResult> {
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

  async handleVerifyVisible(page: Page, action: WebAction): Promise<CommandResult> {
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

  async handleVerifyText(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForSelector(action.selector!, {
      state: 'attached',
      timeout: action.timeout || 30000
    });

    const textLocator = page.locator(action.selector!);
    const actualText = await textLocator.textContent();
    const expectedText = action.expected_text as string;

    if (!actualText || !actualText.includes(expectedText)) {
      throw new Error(
        `Verification failed: Element "${action.selector}" text "${actualText}" does not contain expected text "${expectedText}"${action.name ? ` (${action.name})` : ''}`
      );
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

  async handleVerifyContains(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForSelector(action.selector!, {
      state: 'attached',
      timeout: action.timeout || 30000
    });

    const textLocator = page.locator(action.selector!);
    const actualText = await textLocator.textContent();
    const expectedText = action.value as string;

    if (!actualText || !actualText.includes(expectedText)) {
      throw new Error(
        `Verification failed: Element "${action.selector}" text "${actualText}" does not contain "${expectedText}"${action.name ? ` (${action.name})` : ''}`
      );
    }

    return {
      verified: 'contains',
      selector: action.selector,
      name: action.name,
      expected_text: expectedText,
      actual_text: actualText,
      text_match: true
    };
  }

  async handleVerifyNotExists(page: Page, action: WebAction): Promise<CommandResult> {
    try {
      await page.waitForSelector(action.selector!, {
        state: 'detached',
        timeout: action.timeout || 5000
      });
    } catch (error) {
      const count = await page.locator(action.selector!).count();
      if (count > 0) {
        throw new Error(
          `Verification failed: Element "${action.selector}" exists but should not exist${action.name ? ` (${action.name})` : ''}`
        );
      }
    }

    return {
      verified: 'not_exists',
      selector: action.selector,
      name: action.name,
      found_elements: 0
    };
  }

  async handleVerifyValue(page: Page, action: WebAction): Promise<CommandResult> {
    await page.waitForSelector(action.selector!, {
      state: 'attached',
      timeout: action.timeout || 30000
    });

    const locator = page.locator(action.selector!);
    const actualValue = await locator.inputValue();
    const expectedValue = action.value as string;

    if (actualValue !== expectedValue) {
      throw new Error(
        `Verification failed: Element "${action.selector}" value "${actualValue}" does not match expected value "${expectedValue}"${action.name ? ` (${action.name})` : ''}`
      );
    }

    return {
      verified: 'value',
      selector: action.selector,
      name: action.name,
      expected_value: expectedValue,
      actual_value: actualValue,
      value_match: true
    };
  }
}

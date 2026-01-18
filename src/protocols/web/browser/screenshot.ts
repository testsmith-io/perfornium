import { Page } from 'playwright';
import { ScreenshotConfig } from '../../../config';
import { logger } from '../../../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

export class ScreenshotCapture {
  constructor(private screenshotConfig: boolean | ScreenshotConfig | undefined) {}

  async captureFailureScreenshot(page: Page, vuId: number, command: string): Promise<string> {
    let outputDir = 'screenshots';
    let fullPage = true;

    if (typeof this.screenshotConfig === 'object') {
      outputDir = this.screenshotConfig.output_dir || 'screenshots';
      fullPage = this.screenshotConfig.full_page !== false;
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedCommand = command.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `failure_vu${vuId}_${sanitizedCommand}_${timestamp}.png`;
    const screenshotPath = path.join(outputDir, filename);

    await page.screenshot({
      path: screenshotPath,
      fullPage
    });

    logger.info(`📸 Screenshot captured: ${screenshotPath}`);
    return screenshotPath;
  }

  isEnabled(): boolean {
    return !!this.screenshotConfig;
  }
}

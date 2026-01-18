import { Page } from 'playwright';
import { WebAction } from '../../../config';
import { CommandResult } from './types';
import {
  CoreWebVitalsCollector,
  WebPerformanceCollector,
  CoreWebVitals,
  VerificationStepMetrics
} from '../core-web-vitals';

export class MeasurementCommands {
  async handleMeasureWebVitals(page: Page, action: WebAction): Promise<CommandResult & { web_vitals: CoreWebVitals }> {
    const webVitals = await CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 3000);
    return { web_vitals: webVitals };
  }

  async handlePerformanceAudit(
    page: Page,
    action: WebAction,
    verificationMetrics?: VerificationStepMetrics
  ): Promise<CommandResult> {
    const performanceMetrics = await WebPerformanceCollector.collectAllMetrics(page, verificationMetrics);
    return { performance_audit: performanceMetrics };
  }

  async handleScreenshot(page: Page, action: WebAction): Promise<CommandResult> {
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: action.options?.fullPage || false
    });

    return {
      screenshot: screenshot.length,
      screenshot_data: action.options?.includeData ? screenshot.toString('base64') : undefined
    };
  }

  async collectWebVitalsIfNeeded(
    page: Page,
    action: WebAction,
    shouldCollect: boolean
  ): Promise<CoreWebVitals | undefined> {
    if (!shouldCollect) return undefined;
    return CoreWebVitalsCollector.collectVitals(page, action.webVitalsWaitTime || 1000);
  }

  evaluateVitals(
    webVitals: CoreWebVitals,
    thresholds?: any
  ): { score: 'good' | 'needs-improvement' | 'poor'; details: any } {
    return CoreWebVitalsCollector.evaluateVitals(webVitals, thresholds);
  }
}

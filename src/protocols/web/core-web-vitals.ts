import { Page } from 'playwright';
import { logger } from '../../utils/logger';

export interface CoreWebVitals {
  // Largest Contentful Paint - measures loading performance
  lcp?: number;
  // Cumulative Layout Shift - measures visual stability
  cls?: number;
  // Interaction to Next Paint - measures responsiveness (replaces FID)
  inp?: number;
  // Time to First Byte - measures server response time
  ttfb?: number;
  // First Contentful Paint - measures loading
  fcp?: number;
  // First Input Delay - measures interactivity (deprecated, use INP)
  fid?: number;
  // Time to Interactive - measures when page becomes interactive
  tti?: number;
  // Total Blocking Time - measures interactivity
  tbt?: number;
  // Speed Index - measures how quickly content is visually displayed
  speedIndex?: number;
}

export interface WebVitalsThresholds {
  lcp: { good: number; poor: number };     // Good: <2.5s, Poor: >4s
  cls: { good: number; poor: number };     // Good: <0.1, Poor: >0.25
  inp: { good: number; poor: number };     // Good: <200ms, Poor: >500ms
  ttfb: { good: number; poor: number };    // Good: <800ms, Poor: >1800ms
  fcp: { good: number; poor: number };     // Good: <1.8s, Poor: >3s
  fid?: { good: number; poor: number };    // Good: <100ms, Poor: >300ms (deprecated)
  tti?: { good: number; poor: number };    // Good: <3.8s, Poor: >7.3s
  tbt?: { good: number; poor: number };    // Good: <200ms, Poor: >600ms
  speedIndex?: { good: number; poor: number }; // Good: <3.4s, Poor: >5.8s
}

export const DEFAULT_WEB_VITALS_THRESHOLDS: WebVitalsThresholds = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
  fid: { good: 100, poor: 300 },
  tti: { good: 3800, poor: 7300 },
  tbt: { good: 200, poor: 600 },
  speedIndex: { good: 3400, poor: 5800 }
};

export class CoreWebVitalsCollector {
  private static webVitalsScript = `
    // Improved Web Vitals measurement script based on best practices
    (() => {
      const vitals = {};
      const interactions = [];
      
      // LCP Observer with buffered entries
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lcp = entries.at(-1);
        if (lcp) {
          vitals.lcp = Number(lcp.startTime);
          console.log('LCP collected:', vitals.lcp);
        }
      });
      
      // TTFB Observer
      const ttfbObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const navigationEntry = entries[0];
          vitals.ttfb = navigationEntry.responseStart - navigationEntry.fetchStart;
          console.log('TTFB collected:', vitals.ttfb);
        }
      });
      
      // CLS Observer
      const clsObserver = new PerformanceObserver((list) => {
        let total = vitals.cls || 0;
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            total += entry.value;
          }
        }
        vitals.cls = Number(total.toPrecision(4));
        console.log('CLS updated:', vitals.cls);
      });
      
      // FID Observer
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          vitals.fid = entry.processingStart - entry.startTime;
          console.log('FID collected:', vitals.fid);
        }
      });

      // Start observing with error handling
      try {
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        console.log('LCP observer started');
      } catch (e) { console.warn('LCP observer failed:', e); }
      
      try {
        ttfbObserver.observe({ type: 'navigation', buffered: true });
        console.log('TTFB observer started');  
      } catch (e) { console.warn('TTFB observer failed:', e); }
      
      try {
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        console.log('CLS observer started');
      } catch (e) { console.warn('CLS observer failed:', e); }
      
      try {
        fidObserver.observe({ type: 'first-input', buffered: true });
        console.log('FID observer started');
      } catch (e) { console.warn('FID observer failed:', e); }

      // Get FCP from paint timings
      const paintTimings = performance.getEntriesByType('paint');
      for (const entry of paintTimings) {
        if (entry.name === 'first-contentful-paint') {
          vitals.fcp = Number(entry.startTime);
          console.log('FCP collected:', vitals.fcp);
        }
      }

      // Initialize CLS to 0 if not set
      if (vitals.cls === undefined) {
        vitals.cls = 0;
      }

      // Store vitals on window for retrieval
      window.__webVitals = vitals;
      window.__interactions = interactions;
      
      console.log('Improved Web Vitals collector initialized');
      
      return vitals;
    })();
  `;

  static async injectVitalsCollector(page: Page): Promise<void> {
    try {
      await page.addInitScript(this.webVitalsScript);
      logger.debug('Core Web Vitals collector injected');
    } catch (error) {
      logger.warn('Failed to inject Web Vitals collector:', error);
    }
  }

  static async collectVitals(page: Page, waitTime: number = 3000): Promise<CoreWebVitals> {
    try {
      // First ensure the script is injected on the current page
      await page.evaluate(this.webVitalsScript);
      
      // Wait for vitals to be collected
      await page.waitForTimeout(waitTime);

      // Get the collected vitals
      const vitals = await page.evaluate(() => {
        const collected = (window as any).__webVitals || {};
        const interactions = (window as any).__interactions || [];
        
        // Ensure INP is calculated if we have interactions
        if (!collected.inp && interactions.length > 0) {
          if (interactions.length >= 10) {
            const sorted = [...interactions].sort((a: any, b: any) => b.latency - a.latency);
            const index = Math.min(Math.floor(interactions.length * 0.98), sorted.length - 1);
            collected.inp = sorted[index].latency;
          } else {
            collected.inp = Math.max(...interactions.map((i: any) => i.latency));
          }
        }
        
        // Calculate additional metrics
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          // Time to Interactive approximation
          collected.tti = navigation.domInteractive - navigation.fetchStart;
          
          // Total Blocking Time approximation (simplified)
          const longTasks = performance.getEntriesByType('longtask');
          collected.tbt = longTasks.reduce((total: number, task: any) => {
            const blockingTime = Math.max(0, task.duration - 50);
            return total + blockingTime;
          }, 0);

          // Speed Index approximation (simplified)
          collected.speedIndex = navigation.domContentLoadedEventStart - navigation.fetchStart;
          
          // Ensure TTFB is captured
          if (!collected.ttfb) {
            collected.ttfb = navigation.responseStart - navigation.fetchStart;
          }
          
          // Ensure FCP is captured from paint timing if not already
          if (!collected.fcp) {
            const paintEntries = performance.getEntriesByType('paint');
            const fcpEntry = paintEntries.find((entry: any) => entry.name === 'first-contentful-paint');
            if (fcpEntry) {
              collected.fcp = fcpEntry.startTime;
            }
          }
        }

        // Get LCP from performance entries if not already captured
        if (!collected.lcp) {
          const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
          console.log('LCP fallback - checking entries. Found:', lcpEntries.length);
          if (lcpEntries.length > 0) {
            // Use the latest LCP entry (most recent candidate)
            const latestEntry = lcpEntries[lcpEntries.length - 1] as any;
            collected.lcp = latestEntry.startTime;
            console.log('LCP fallback collected:', collected.lcp, 'from entry:', latestEntry);
          } else {
            // Try alternative approach - estimate LCP from paint timing
            const paintEntries = performance.getEntriesByType('paint');
            console.log('No LCP entries found. Paint entries:', paintEntries.length);
            if (paintEntries.length > 0) {
              const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
              if (fcpEntry) {
                // Use FCP as a rough approximation for LCP if no LCP is available
                collected.lcp = fcpEntry.startTime;
                console.log('LCP approximated from FCP:', collected.lcp);
              }
            }
          }
        }

        // Get CLS from layout-shift entries if not captured
        if (collected.cls === undefined) {
          const layoutShiftEntries = performance.getEntriesByType('layout-shift');
          collected.cls = layoutShiftEntries.reduce((total: number, entry: any) => {
            if (!entry.hadRecentInput) {
              return total + entry.value;
            }
            return total;
          }, 0);
          console.log('CLS fallback collected:', collected.cls, 'from', layoutShiftEntries.length, 'shifts');
        }

        console.log('Final collected vitals before return:', collected);
        return collected;
      });

      logger.debug('Core Web Vitals collection complete:', vitals);
      return vitals;
    } catch (error) {
      logger.warn('Failed to collect Core Web Vitals:', error);
      return {};
    }
  }

  static evaluateVitals(vitals: CoreWebVitals, thresholds: WebVitalsThresholds = DEFAULT_WEB_VITALS_THRESHOLDS): {
    score: 'good' | 'needs-improvement' | 'poor';
    details: { [metric: string]: { value: number; score: 'good' | 'needs-improvement' | 'poor' } };
  } {
    const details: { [metric: string]: { value: number; score: 'good' | 'needs-improvement' | 'poor' } } = {};
    let goodCount = 0;
    let poorCount = 0;
    let totalCount = 0;

    const metrics = ['lcp', 'cls', 'inp', 'ttfb', 'fcp', 'fid', 'tti', 'tbt', 'speedIndex'] as const;

    for (const metric of metrics) {
      const value = vitals[metric];
      if (value !== undefined && value !== null) {
        totalCount++;
        const threshold = thresholds[metric];
        
        let score: 'good' | 'needs-improvement' | 'poor';
        if (value <= threshold.good) {
          score = 'good';
          goodCount++;
        } else if (value <= threshold.poor) {
          score = 'needs-improvement';
        } else {
          score = 'poor';
          poorCount++;
        }

        details[metric] = { value, score };
      }
    }

    // Overall score calculation
    let overallScore: 'good' | 'needs-improvement' | 'poor';
    if (totalCount === 0) {
      overallScore = 'needs-improvement';
    } else if (goodCount >= totalCount * 0.75) {
      overallScore = 'good';
    } else if (poorCount > totalCount * 0.25) {
      overallScore = 'poor';
    } else {
      overallScore = 'needs-improvement';
    }

    return { score: overallScore, details };
  }

  static generateVitalsThresholds(vitals: CoreWebVitals): Array<{
    metric: string;
    value: number;
    operator: string;
    severity: string;
    description: string;
  }> {
    const thresholds = [];
    const baseThresholds = DEFAULT_WEB_VITALS_THRESHOLDS;

    for (const [metric, value] of Object.entries(vitals)) {
      if (value !== undefined && value !== null && metric in baseThresholds) {
        const threshold = (baseThresholds as any)[metric];
        thresholds.push({
          metric: `web_vitals_${metric}`,
          value: threshold.good,
          operator: 'lte',
          severity: 'warning',
          description: `${metric.toUpperCase()} should be good (≤${threshold.good}${metric === 'cls' ? '' : 'ms'})`
        });

        thresholds.push({
          metric: `web_vitals_${metric}`,
          value: threshold.poor,
          operator: 'lte',
          severity: 'error',
          description: `${metric.toUpperCase()} should not be poor (≤${threshold.poor}${metric === 'cls' ? '' : 'ms'})`
        });
      }
    }

    return thresholds;
  }
}

export interface VerificationStepMetrics {
  step_name: string;
  step_type: string;
  selector?: string;
  duration: number;
  success: boolean;
  error_message?: string;
  element_count?: number;
  expected_text?: string;
  actual_text?: string;
  screenshot_size?: number;
  dom_ready_time?: number;
  network_idle_time?: number;
}

export class VerificationMetricsCollector {
  static async measureVerificationStep<T>(
    stepName: string,
    stepType: string,
    operation: () => Promise<T>,
    additionalMetrics?: Partial<VerificationStepMetrics>
  ): Promise<{ result: T; metrics: VerificationStepMetrics }> {
    const startTime = performance.now();
    let success = false;
    let error_message: string | undefined;
    let result: T;

    try {
      result = await operation();
      success = true;
    } catch (error: any) {
      error_message = error.message;
      // Calculate duration and metrics before re-throwing
      const duration = Math.round((performance.now() - startTime) * 10) / 10;
      const metrics: VerificationStepMetrics = {
        step_name: stepName,
        step_type: stepType,
        duration,
        success: false,
        error_message,
        ...additionalMetrics
      };
      // Attach metrics to error so caller can access them
      (error as any).verificationMetrics = metrics;
      throw error;
    }

    // Round to 1 decimal place for cleaner output
    const duration = Math.round((performance.now() - startTime) * 10) / 10;

    const metrics: VerificationStepMetrics = {
      step_name: stepName,
      step_type: stepType,
      duration,
      success,
      error_message,
      ...additionalMetrics
    };

    return { result: result!, metrics };
  }

  static generateVerificationThresholds(metrics: VerificationStepMetrics[]): Array<{
    metric: string;
    value: number;
    operator: string;
    severity: string;
    description: string;
  }> {
    const thresholds = [];

    // Analyze verification step performance
    const durations = metrics.map(m => m.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const p95Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

    // Generate thresholds based on observed performance
    thresholds.push({
      metric: 'verification_step_duration',
      value: Math.max(avgDuration * 2, 1000), // 2x average or 1 second minimum
      operator: 'lte',
      severity: 'warning',
      description: 'Verification steps should complete within reasonable time'
    });

    thresholds.push({
      metric: 'verification_step_duration',
      value: Math.max(p95Duration * 1.5, 3000), // 1.5x p95 or 3 seconds minimum
      operator: 'lte',
      severity: 'error',
      description: 'Verification steps should not take too long'
    });

    // Success rate threshold
    const successRate = metrics.filter(m => m.success).length / metrics.length;
    thresholds.push({
      metric: 'verification_success_rate',
      value: Math.max(successRate * 0.9, 0.95), // 90% of observed or 95% minimum
      operator: 'gte',
      severity: 'critical',
      description: 'Verification steps should have high success rate'
    });

    return thresholds;
  }
}

export interface WebPerformanceMetrics {
  core_web_vitals: CoreWebVitals;
  vitals_score: 'good' | 'needs-improvement' | 'poor';
  vitals_details: { [metric: string]: { value: number; score: 'good' | 'needs-improvement' | 'poor' } };
  verification_metrics?: VerificationStepMetrics;
  page_load_time: number;
  dom_content_loaded: number;
  network_requests: number;
  failed_requests: number;
  total_transfer_size: number;
  page_size: number;
  javascript_execution_time: number;
  style_recalculation_time: number;
}

export class WebPerformanceCollector {
  static async collectAllMetrics(page: Page, verificationMetrics?: VerificationStepMetrics): Promise<WebPerformanceMetrics> {
    // Collect Core Web Vitals
    const coreWebVitals = await CoreWebVitalsCollector.collectVitals(page);
    const vitalsEvaluation = CoreWebVitalsCollector.evaluateVitals(coreWebVitals);

    // Collect performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const resources = performance.getEntriesByType('resource');
      
      return {
        page_load_time: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
        dom_content_loaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0,
        network_requests: resources.length,
        failed_requests: resources.filter(r => 'responseStatus' in r && (r as any).responseStatus >= 400).length,
        total_transfer_size: resources.reduce((total, r) => total + ((r as any).transferSize || 0), 0),
        page_size: resources.reduce((total, r) => total + ((r as any).decodedBodySize || 0), 0),
        javascript_execution_time: performance.getEntriesByType('measure')
          .filter(m => m.name.includes('js'))
          .reduce((total, m) => total + m.duration, 0),
        style_recalculation_time: performance.getEntriesByType('measure')
          .filter(m => m.name.includes('style'))
          .reduce((total, m) => total + m.duration, 0)
      };
    });

    return {
      core_web_vitals: coreWebVitals,
      vitals_score: vitalsEvaluation.score,
      vitals_details: vitalsEvaluation.details,
      verification_metrics: verificationMetrics,
      ...performanceMetrics
    };
  }
}
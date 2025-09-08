import axios from 'axios';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';
import { TemplateProcessor } from '../utils/template';
import { logger } from '../utils/logger';

export class WebhookOutput implements OutputHandler {
  private url: string;
  private headers: Record<string, string>;
  private format: string;
  private template?: string;
  private templateProcessor = new TemplateProcessor();
  private results: TestResult[] = [];

  constructor(
    url: string, 
    headers: Record<string, string> = {},
    format: string = 'json',
    template?: string
  ) {
    this.url = url;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Perfornium/1.0.0',
      ...headers
    };
    this.format = format;
    this.template = template;
  }

  async initialize(): Promise<void> {
    // Test webhook connectivity
    try {
      await axios.head(this.url, { 
        headers: this.headers,
        timeout: 5000 
      });
      logger.debug('🔗 Webhook endpoint is reachable');
    } catch (error) {
      logger.warn('⚠️  Webhook endpoint may not be reachable:', error);
    }
  }

  async writeResult(result: TestResult): Promise<void> {
    this.results.push(result);
    
    // Optionally send real-time results for critical failures
    if (!result.success && result.error && result.error.includes('timeout')) {
      await this.sendNotification({
        type: 'alert',
        message: `Critical error in VU ${result.vu_id}: ${result.error}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    try {
      let payload: any;
      
      if (this.template) {
        // Use template to format payload
        const context = {
          summary,
          test_name: 'Performance Test',
          success_rate: summary.success_rate.toFixed(2),
          avg_response_time: summary.avg_response_time.toFixed(2),
          total_requests: summary.total_requests,
          total_duration: summary.total_duration
        };
        
        const processedTemplate = this.templateProcessor.process(this.template, context);
        payload = JSON.parse(processedTemplate);
      } else {
        // Default payload format
        payload = {
          type: 'test_completed',
          timestamp: new Date().toISOString(),
          summary: {
            total_requests: summary.total_requests,
            success_rate: `${summary.success_rate.toFixed(2)}%`,
            avg_response_time: `${summary.avg_response_time.toFixed(2)}ms`,
            requests_per_second: summary.requests_per_second.toFixed(2),
            duration: `${(summary.total_duration / 1000).toFixed(1)}s`,
            status: summary.success_rate >= 95 ? 'success' : summary.success_rate >= 90 ? 'warning' : 'error'
          },
          errors: Object.keys(summary.error_distribution).length > 0 ? summary.error_distribution : null
        };
      }

      await this.sendNotification(payload);
      logger.debug('🔗 Webhook notification sent successfully');

    } catch (error) {
      logger.warn('⚠️  Failed to send webhook notification:', error);
    }
  }

  private async sendNotification(payload: any): Promise<void> {
    await axios.post(this.url, payload, {
      headers: this.headers,
      timeout: 10000
    });
  }

  async finalize(): Promise<void> {
    // Nothing to finalize for webhook
  }
}
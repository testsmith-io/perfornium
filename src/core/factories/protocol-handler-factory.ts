import { TestConfiguration } from '../../config';
import { ProtocolHandler } from '../../protocols/base';
import { RESTHandler } from '../../protocols/rest/handler';
import { SOAPHandler } from '../../protocols/soap/handler';
import { WebHandler } from '../../protocols/web/handler';
import { MetricsCollector } from '../../metrics/collector';
import { logger } from '../../utils/logger';

export class ProtocolHandlerFactory {
  private config: TestConfiguration;
  private metricsCollector?: MetricsCollector;

  constructor(config: TestConfiguration, metricsCollector?: MetricsCollector) {
    this.config = config;
    this.metricsCollector = metricsCollector;
  }

  async createHandlers(): Promise<Map<string, ProtocolHandler>> {
    const handlers = new Map<string, ProtocolHandler>();
    const protocolsNeeded = this.getRequiredProtocols();
    const debugConfig = this.config.debug || this.config.global?.debug;

    // Initialize REST handler if needed
    if (protocolsNeeded.has('rest')) {
      const handler = new RESTHandler(
        this.config.global?.base_url,
        this.config.global?.headers || {},
        this.config.global?.timeout,
        debugConfig
      );
      handlers.set('rest', handler);
      logger.debug('REST handler initialized');
    }

    // Initialize SOAP handler if needed
    if (protocolsNeeded.has('soap')) {
      const wsdlUrl = this.findWSDLUrl();
      if (wsdlUrl) {
        const handler = new SOAPHandler(wsdlUrl);
        await handler.initialize();
        handlers.set('soap', handler);
        logger.debug('SOAP handler initialized');
      }
    }

    // Initialize Web handler if needed
    if (protocolsNeeded.has('web')) {
      const browserConfig = (this.config.global as any)?.web || this.config.global?.browser || {};
      const webConfig = {
        type: browserConfig.type || 'chromium',
        headless: browserConfig.headless ?? true,
        base_url: browserConfig.base_url || this.config.global?.base_url,
        viewport: browserConfig.viewport,
        slow_mo: browserConfig.slow_mo,
        highlight: browserConfig.highlight,
        clear_storage: browserConfig.clear_storage,
        screenshot_on_failure: browserConfig.screenshot_on_failure,
        network_capture: browserConfig.network_capture
      };
      // Pass network call callback to record calls in InfluxDB
      const networkCallCallback = this.metricsCollector
        ? (call: any) => this.metricsCollector!.recordNetworkCall(call)
        : undefined;
      const handler = new WebHandler(webConfig as any, networkCallCallback);
      await handler.initialize();
      handlers.set('web', handler);
      logger.debug('Web handler initialized');
    }

    return handlers;
  }

  private getRequiredProtocols(): Set<string> {
    const protocols = new Set<string>();

    for (const scenario of this.config.scenarios) {
      for (const step of scenario.steps) {
        protocols.add(step.type || 'rest');
      }
    }

    return protocols;
  }

  private findWSDLUrl(): string | null {
    // First check global config
    if (this.config.global?.wsdl_url) {
      return this.config.global.wsdl_url;
    }

    // Fallback: check individual steps (for backward compatibility)
    for (const scenario of this.config.scenarios) {
      for (const step of scenario.steps) {
        if (step.type === 'soap' && 'wsdl' in step && step.wsdl) {
          return step.wsdl;
        }
      }
    }
    return null;
  }

  static async cleanupHandlers(handlers: Map<string, ProtocolHandler>): Promise<void> {
    logger.debug('Cleaning up handlers...');

    for (const [name, handler] of handlers) {
      try {
        if (handler.cleanup) {
          await handler.cleanup();
        }
      } catch (error) {
        logger.warn(`Error cleaning up ${name} handler:`, error);
      }
    }
  }
}

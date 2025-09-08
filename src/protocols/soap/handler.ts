import * as soap from 'soap';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, SOAPStep } from '../../config/types';
import { logger } from '../../utils/logger';

export class SOAPHandler implements ProtocolHandler {
  private client: any;
  private wsdlUrl: string;

  constructor(wsdlUrl: string) {
    this.wsdlUrl = wsdlUrl;
  }

  async initialize(): Promise<void> {
    try {
      this.client = await soap.createClientAsync(this.wsdlUrl);
      logger.debug(`🧼 SOAP client initialized for ${this.wsdlUrl}`);
    } catch (error: any) {
      logger.error(`❌ Failed to initialize SOAP client:`, error);
      throw error;
    }
  }

  async execute(operation: SOAPStep, context: VUContext): Promise<ProtocolResult> {
    const startTime = performance.now();

    try {
      if (!this.client) {
        await this.initialize();
      }

      // If body is provided, use raw XML SOAP request
      if (operation.body) {
        const result = await this.executeRawSOAP(operation.body);
        const duration = performance.now() - startTime;

        return {
          success: true,
          data: result,
          response_size: JSON.stringify(result).length,
          duration,
          request_url: this.wsdlUrl,
          request_method: 'SOAP',
          response_body: JSON.stringify(result),
          custom_metrics: {
            operation: operation.operation,
            wsdl_url: this.wsdlUrl,
            used_raw_xml: true
          }
        };
      }

      // Use traditional SOAP client with args
      const result = await new Promise((resolve, reject) => {
        this.client[operation.operation](operation.args, (err: any, result: any) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      const duration = performance.now() - startTime;
      const responseData = JSON.stringify(result);

      return {
        success: true,
        data: result,
        response_size: responseData.length,
        duration,
        request_url: this.wsdlUrl,
        request_method: 'SOAP',
        response_body: responseData,
        custom_metrics: {
          operation: operation.operation,
          wsdl_url: this.wsdlUrl
        }
      };

    } catch (error: any) {
      const duration = performance.now() - startTime;

      return {
        success: false,
        error: error.message,
        error_code: 'SOAP_ERROR',
        response_size: 0,
        duration,
        request_url: this.wsdlUrl,
        request_method: 'SOAP',
        custom_metrics: {
          operation: operation.operation,
          wsdl_url: this.wsdlUrl
        }
      };
    }
  }

  private async executeRawSOAP(xmlBody: string): Promise<any> {
    try {
      // Extract endpoint URL from WSDL URL
      const endpointUrl = this.wsdlUrl.replace('?wsdl', '');

      // Make direct HTTP request with the XML body
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': this.extractSOAPActionFromXML(xmlBody)
        },
        body: xmlBody
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      return this.parseSOAPResponse(responseText);

    } catch (error) {
      logger.error('Raw SOAP execution failed:', error);
      throw error;
    }
  }

  private extractSOAPActionFromXML(xmlBody: string): string {
    const operationMatch = xmlBody.match(/<(\w+)\s+xmlns=/);
    const operationName = operationMatch ? operationMatch[1] : 'UnknownOperation';
    return `"http://tempuri.org/${operationName}"`;
  }

  private parseSOAPResponse(responseXml: string): any {
    try {
      const resultMatch = responseXml.match(/<(\w+Result)[^>]*>([^<]*)<\/\1>/);
      if (resultMatch) {
        return {
          [resultMatch[1]]: resultMatch[2]
        };
      }
      return { rawResponse: responseXml };
    } catch (error) {
      logger.error('Failed to parse SOAP response:', error);
      return { rawResponse: responseXml };
    }
  }
}
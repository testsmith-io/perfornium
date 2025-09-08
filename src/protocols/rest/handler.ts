import axios, { AxiosResponse, AxiosError, AxiosRequestConfig, AxiosInstance } from 'axios';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, RESTStep, DebugConfig } from '../../config/types';
import { logger } from '../../utils/logger';

export class RESTHandler implements ProtocolHandler {
  private axiosInstance: AxiosInstance;
  private debugConfig?: DebugConfig;

  constructor(
    baseURL?: string,
    defaultHeaders?: Record<string, string>,
    timeout?: number,
    debugConfig?: DebugConfig
  ) {
    this.debugConfig = debugConfig;

    // Create optimized axios instance with connection pooling
    this.axiosInstance = axios.create({
      baseURL: baseURL?.replace(/\/$/, ''),
      timeout: timeout || 30000,
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30',
        ...defaultHeaders
      },
      // Performance optimizations
      maxRedirects: 3,
      validateStatus: () => true,
      decompress: true,
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      maxBodyLength: 10 * 1024 * 1024,    // 10MB max body
    });
  }

  async execute(request: RESTStep, context: VUContext): Promise<ProtocolResult> {
    const startTime = Date.now();
    const method = request.method.toUpperCase();
    const url = this.buildURL(request.path);

    // Prepare efficient request config
    const axiosConfig = this.prepareRequestConfig(request, url);

    try {
      if (this.debugConfig?.log_level === 'debug') {
        logger.debug(`🌐 ${method} ${url}`);

        // Log request details if debug enabled
        this.logRequestDetails(request, url, method);
      }

      const response: AxiosResponse = await this.axiosInstance.request(axiosConfig);
      const duration = Date.now() - startTime;

      return this.createSuccessResult(response, request, url, method, duration);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return this.handleError(error, request, url, method, duration);
    }
  }

  private prepareRequestConfig(request: RESTStep, url: string): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      method: request.method.toUpperCase() as any,
      url,
      timeout: request.timeout,
    };

    // Start with any manually specified headers - ensure proper type
    const headers: Record<string, string> = {};
    if (request.headers) {
      Object.assign(headers, request.headers);
    }

    // Handle different payload types with automatic Content-Type detection
    if (request.json) {
      // JSON payload - automatically set Content-Type
      config.data = JSON.stringify(request.json);
      if (!this.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (request.body) {
      // Body payload - detect type and set appropriate Content-Type
      const { data, contentType } = this.processBodyPayload(request.body);
      config.data = data;

      // Only set Content-Type if not already specified and we detected a type
      if (contentType && !this.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = contentType;
      }
    }

    // Assign the properly typed headers to config
    config.headers = headers;

    return config;
  }

  /**
   * Check if Content-Type header is already set (case-insensitive)
   */
  private hasContentTypeHeader(headers: Record<string, string>): boolean {
    if (!headers) return false;

    const headerKeys = Object.keys(headers).map(key => key.toLowerCase());
    return headerKeys.includes('content-type');
  }

  /**
   * Process body payload and detect content type
   */
  private processBodyPayload(body: any): { data: any; contentType?: string } {
    if (typeof body === 'string') {
      // Detect content type from string content
      const trimmedBody = body.trim();

      // Check if it's JSON
      if (this.isJsonString(trimmedBody)) {
        return {
          data: body,
          contentType: 'application/json'
        };
      }

      // Check if it's XML
      if (this.isXmlString(trimmedBody)) {
        return {
          data: body,
          contentType: 'application/xml'
        };
      }

      // Check if it looks like a template that will resolve to JSON/XML
      if (this.isTemplateString(body)) {
        const detectedType = this.detectTemplateContentType(body);
        return {
          data: body,
          contentType: detectedType
        };
      }

      // Default to plain text for other string content
      return {
        data: body,
        contentType: 'text/plain'
      };
    } else {
      // Non-string body (object, array, etc.) - serialize as JSON
      return {
        data: JSON.stringify(body),
        contentType: 'application/json'
      };
    }
  }

  /**
   * Detect if string is valid JSON
   */
  private isJsonString(str: string): boolean {
    if (!str.startsWith('{') && !str.startsWith('[')) {
      return false;
    }

    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if string is XML
   */
  private isXmlString(str: string): boolean {
    return str.startsWith('<?xml') ||
      (str.startsWith('<') && str.includes('>') && str.endsWith('>'));
  }

  /**
   * Check if body contains template expressions
   */
  private isTemplateString(body: string): boolean {
    return body.includes('{{template:') ||
      (body.includes('{{') && body.includes('}}'));
  }

  /**
   * Detect content type from template file extension or content
   */
  private detectTemplateContentType(templateBody: string): string | undefined {
    // Extract template file references
    const templateMatch = templateBody.match(/\{\{template:([^}]+)\}\}/);
    if (templateMatch) {
      const templatePath = templateMatch[1];

      // Detect from file extension
      if (templatePath.endsWith('.json')) {
        return 'application/json';
      }
      if (templatePath.endsWith('.xml')) {
        return 'application/xml';
      }
    }

    // If we can't determine from template, don't assume
    return undefined;
  }

  private createSuccessResult(
    response: AxiosResponse,
    request: RESTStep,
    url: string,
    method: string,
    duration: number
  ): ProtocolResult {
    const isSuccess = response.status >= 200 && response.status < 300;

    const result: ProtocolResult = {
      success: isSuccess,
      status: response.status,
      status_text: response.statusText,
      data: response.data,
      duration,
      request_url: url,
      request_method: method,
    };

    // Add detailed info based on debug configuration
    this.addDetailedInfo(result, response, request, isSuccess);

    // Log response details if debug enabled
    if (this.debugConfig?.log_level === 'debug') {
      this.logResponseDetails(response, isSuccess, duration, method, url);
    }

    // Log failures efficiently
    if (!isSuccess) {
      logger.warn(`❌ Request failed: ${method} ${url} - Status: ${response.status} ${response.statusText}`);
    }

    // Run checks efficiently
    if (request.checks) {
      this.runChecksOptimized(request.checks, response, duration, result);
    }

    return result;
  }

  private handleError(
    error: any,
    request: RESTStep,
    url: string,
    method: string,
    duration: number
  ): ProtocolResult {
    const result: ProtocolResult = {
      success: false,
      duration,
      request_url: url,
      request_method: method,
      response_size: 0,
    };

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Server error with response
        result.status = axiosError.response.status;
        result.status_text = axiosError.response.statusText;
        result.error = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
        result.data = axiosError.response.data;

        // Add error details based on debug configuration
        this.addDetailedInfo(result, axiosError.response, request, false);

        // Log error response details if debug enabled
        if (this.debugConfig?.log_level === 'debug') {
          this.logResponseDetails(axiosError.response, false, duration, method, url);
        }
      } else if (axiosError.request) {
        // Network error
        result.error = `Network error: ${axiosError.message}`;
        result.error_code = axiosError.code || 'NETWORK_ERROR';
      } else {
        // Request setup error
        result.error = `Request error: ${axiosError.message}`;
        result.error_code = 'REQUEST_ERROR';
      }
    } else {
      // Unknown error
      result.error = error.message || 'Unknown error';
      result.error_code = 'UNKNOWN_ERROR';
    }

    // Log error efficiently
    logger.warn(`❌ ${result.error_code || 'ERROR'}: ${method} ${url} - ${result.error}`);

    return result;
  }

  private addDetailedInfo(
    result: ProtocolResult,
    response: AxiosResponse,
    request: RESTStep,
    isSuccess: boolean
  ): void {
    // Check if we should capture based on failure-only setting
    const shouldCapture = this.shouldCaptureDetails(isSuccess);

    if (!shouldCapture) return;

    // Capture response body if enabled
    if (this.debugConfig?.capture_response_body) {
      const responseText = this.getResponseText(response.data);
      result.response_size = Buffer.byteLength(responseText, 'utf8');
      result.response_body = this.truncateIfNeeded(responseText);
    } else {
      // Always calculate response size for metrics
      const responseText = this.getResponseText(response.data);
      result.response_size = Buffer.byteLength(responseText, 'utf8');
    }

    // Capture response headers if enabled
    if (this.debugConfig?.capture_response_headers) {
      result.response_headers = this.flattenHeaders(response.headers);
    }

    // Capture request headers if enabled
    if (this.debugConfig?.capture_request_headers && request.headers) {
      result.request_headers = request.headers;
    }

    // Capture request body if enabled
    if (this.debugConfig?.capture_request_body && request.body) {
      result.request_body = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
    }
  }

  private logRequestDetails(request: RESTStep, url: string, method: string): void {
    if (!this.debugConfig || this.debugConfig.log_level !== 'debug') return;

    logger.debug(`📤 Request Details:`);
    logger.debug(`   Method: ${method}`);
    logger.debug(`   URL: ${url}`);

    if (this.debugConfig.capture_request_headers && request.headers) {
      logger.debug(`   Headers:`, JSON.stringify(request.headers, null, 2));
    }

    if (this.debugConfig.capture_request_body && request.body) {
      const bodyStr = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body, null, 2);
      logger.debug(`   Body:`, this.truncateIfNeeded(bodyStr));
    }
  }

  private logResponseDetails(
    response: AxiosResponse,
    isSuccess: boolean,
    duration: number,
    method: string,
    url: string
  ): void {
    if (!this.debugConfig || this.debugConfig.log_level !== 'debug') return;

    // Check if we should log based on failure-only setting
    if (!this.shouldCaptureDetails(isSuccess)) return;

    const statusIcon = isSuccess ? '✅' : '❌';
    logger.debug(`📥 Response Details ${statusIcon}:`);
    logger.debug(`   Status: ${response.status} ${response.statusText}`);
    logger.debug(`   Duration: ${duration}ms`);

    if (this.debugConfig.capture_response_headers) {
      logger.debug(`   Headers:`, JSON.stringify(this.flattenHeaders(response.headers), null, 2));
    }

    if (this.debugConfig.capture_response_body) {
      const responseText = this.getResponseText(response.data);
      const truncated = this.truncateIfNeeded(responseText);
      logger.debug(`   Body (${responseText.length} chars):`, truncated);
    }
  }

  private runChecksOptimized(
    checks: any[],
    response: AxiosResponse,
    duration: number,
    result: ProtocolResult
  ): void {
    let hasFailure = false;
    const errors: string[] = [];

    for (const check of checks) {
      try {
        let passed = true;

        switch (check.type) {
          case 'status':
            passed = response.status === check.value;
            if (!passed) errors.push(`Expected status ${check.value}, got ${response.status}`);
            break;

          case 'response_time':
            const expectedTime = typeof check.value === 'string'
              ? parseInt(check.value.replace(/[<>]/g, ''))
              : check.value;
            if (check.operator === 'lt' || check.value.toString().startsWith('<')) {
              passed = duration < expectedTime;
              if (!passed) errors.push(`Response time ${duration}ms exceeded ${expectedTime}ms`);
            }
            break;

          case 'json_path':
            const value = this.getJsonPathOptimized(response.data, check.value);
            passed = value !== undefined && value !== null;
            if (!passed) errors.push(`JSON path ${check.value} not found`);
            break;

          case 'text_contains':
            // Only stringify when needed
            const text = typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data);
            passed = text.includes(check.value);
            if (!passed) errors.push(`Response does not contain "${check.value}"`);
            break;
        }

        if (!passed) hasFailure = true;
      } catch (error) {
        errors.push(`Check error: ${error}`);
        hasFailure = true;
      }
    }

    if (hasFailure) {
      result.success = false;
      result.error = `Checks failed: ${errors.join(', ')}`;
    }
  }

  // Utility methods optimized for performance
  private buildURL(path: string): string {
    // Fast path for absolute URLs
    if (path.startsWith('http')) return path;
    // Remove leading slash if baseURL is set (axios will handle it)
    return path.startsWith('/') ? path.slice(1) : path;
  }

  private getResponseText(data: any): string {
    if (typeof data === 'string') return data;
    if (!data) return '';
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private getJsonPathOptimized(obj: any, path: string): any {
    if (!obj) return undefined;
    const keys = path.replace(/^\$\./, '').split('.');
    let current = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private flattenHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return result;
  }

  private truncateIfNeeded(text: string): string {
    const maxSize = this.debugConfig?.max_response_body_size || 10000;
    return text.length > maxSize
      ? text.substring(0, maxSize) + `...(+${text.length - maxSize} chars)`
      : text;
  }

  private shouldCaptureDetails(isSuccess: boolean): boolean {
    // If capture_only_failures is true, only capture on failures
    // If capture_only_failures is false, capture everything
    return !this.debugConfig?.capture_only_failures || !isSuccess;
  }
}
import axios, { AxiosResponse, AxiosError, AxiosRequestConfig, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, RESTStep, DebugConfig } from '../../config/types';
import { logger } from '../../utils/logger';

// Timing data stored in request config
interface TimingData {
  startTime: number;
  dnsLookupTime?: number;
  tcpConnectionTime?: number;
  tlsHandshakeTime?: number;
  firstByteTime?: number;
  requestHeadersSize?: number;
  requestBodySize?: number;
  socketAssigned?: number;
  connectionStarted?: number;
  connected?: number;
}

export class RESTHandler implements ProtocolHandler {
  private axiosInstance: AxiosInstance;
  private debugConfig?: DebugConfig;
  private connectionTimings: Map<any, number> = new Map();

  constructor(
    baseURL?: string,
    defaultHeaders?: Record<string, string>,
    timeout?: number,
    debugConfig?: DebugConfig
  ) {
    this.debugConfig = debugConfig;

    // Create custom HTTP agent with socket timing hooks
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 10
    });

    // Override createConnection to capture timing
    const originalHttpCreateConnection = (httpAgent as any).createConnection;
    (httpAgent as any).createConnection = (options: any, callback: any) => {
      const connectionStart = Date.now();
      const socket = originalHttpCreateConnection.call(httpAgent, options, callback);

      socket.once('connect', () => {
        const connectTime = Date.now() - connectionStart;
        this.connectionTimings.set(socket, connectTime);
      });

      return socket;
    };

    // Create custom HTTPS agent with socket timing hooks
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 10
    });

    // Override createConnection to capture timing
    const originalHttpsCreateConnection = (httpsAgent as any).createConnection;
    (httpsAgent as any).createConnection = (options: any, callback: any) => {
      const connectionStart = Date.now();
      const socket = originalHttpsCreateConnection.call(httpsAgent, options, callback);

      socket.once('connect', () => {
        const connectTime = Date.now() - connectionStart;
        this.connectionTimings.set(socket, connectTime);
      });

      return socket;
    };

    // Create optimized axios instance with connection pooling and timing
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
      httpAgent,
      httpsAgent
    });

    // Add request interceptor to capture timing and size data
    this.axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const timingData: TimingData = {
        startTime: Date.now()
      };

      // Calculate request sizes
      const { requestHeadersSize, requestBodySize } = this.calculateRequestSizes(config);
      timingData.requestHeadersSize = requestHeadersSize;
      timingData.requestBodySize = requestBodySize;

      // Store timing data in config
      (config as any).timingData = timingData;

      // Add socket event listeners to capture connection timing
      const originalBeforeRedirect = config.beforeRedirect;
      config.beforeRedirect = (options: any, responseDetails: any) => {
        if (originalBeforeRedirect) {
          originalBeforeRedirect(options, responseDetails);
        }
      };

      // Hook into the socket to measure connection time
      const socketCallback = (socket: any) => {
        if (!timingData.socketAssigned) {
          timingData.socketAssigned = Date.now();
        }

        if (!socket.connecting) {
          // Socket is already connected (reused from pool)
          timingData.connected = Date.now();
          timingData.tcpConnectionTime = 0; // Reused connection
        } else {
          // New connection being established
          timingData.connectionStarted = Date.now();

          socket.once('connect', () => {
            timingData.connected = Date.now();
            if (timingData.connectionStarted) {
              timingData.tcpConnectionTime = timingData.connected - timingData.connectionStarted;
            }
          });

          socket.once('secureConnect', () => {
            const secureConnected = Date.now();
            if (timingData.connected) {
              timingData.tlsHandshakeTime = secureConnected - timingData.connected;
            }
          });
        }
      };

      // Add socket callback to config
      (config as any).socketCallback = socketCallback;

      return config;
    });

    // Add response interceptor to capture first byte time
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const timingData: TimingData = (response.config as any).timingData;
        if (timingData && !timingData.firstByteTime) {
          timingData.firstByteTime = Date.now();
        }
        return response;
      },
      (error) => {
        // Capture timing even on errors
        if (error.config) {
          const timingData: TimingData = (error.config as any).timingData;
          if (timingData && !timingData.firstByteTime) {
            timingData.firstByteTime = Date.now();
          }
        }
        return Promise.reject(error);
      }
    );
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
      // Add callback to capture socket timing
      onUploadProgress: (progressEvent: any) => {
        // Socket timing will be captured via request/response interceptors
      }
    };

    // Start with any manually specified headers - ensure proper type
    const headers: Record<string, string> = {};
    if (request.headers) {
      Object.assign(headers, request.headers);
    }

    // Handle query parameters
    if ('query' in request && request.query) {
      config.params = request.query;
    }

    // Handle authentication
    if ('auth' in request && request.auth) {
      this.handleAuthentication(config, headers, request.auth);
    }

    // Handle different payload types with automatic Content-Type detection
    if (request.json) {
      // JSON payload - automatically set Content-Type
      config.data = JSON.stringify(request.json);
      if (!this.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/json';
      }
    } else if ('form' in request && request.form) {
      // URL-encoded form data
      config.data = new URLSearchParams(request.form as any).toString();
      if (!this.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if ('multipart' in request && request.multipart) {
      // Multipart form data
      const FormData = require('form-data');
      const formData = new FormData();
      Object.entries(request.multipart).forEach(([key, value]) => {
        formData.append(key, value);
      });
      config.data = formData;
      // FormData sets its own Content-Type with boundary
      Object.assign(headers, formData.getHeaders());
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
   * Handle authentication configuration
   */
  private handleAuthentication(
    config: AxiosRequestConfig,
    headers: Record<string, string>,
    auth: any
  ): void {
    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          config.auth = {
            username: auth.username,
            password: auth.password
          };
        }
        break;
      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;
      case 'digest':
        // Axios handles digest auth with config.auth
        if (auth.username && auth.password) {
          config.auth = {
            username: auth.username,
            password: auth.password
          };
        }
        break;
      case 'oauth':
        if (auth.token) {
          headers['Authorization'] = `OAuth ${auth.token}`;
        }
        break;
    }
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

    // Extract timing data from request config
    const timingData: TimingData = (response.config as any).timingData || {};
    const startTime = timingData.startTime || Date.now() - duration;
    const firstByteTime = timingData.firstByteTime || Date.now();

    // Calculate timing breakdown
    const latency = firstByteTime - startTime; // Time to first byte (TTFB)

    // Get actual TCP connection time if measured, otherwise estimate
    // For new connections: connectTime = actual measured time
    // For keep-alive reused connections: connectTime = 0
    // If not measured: estimate as latency/3 (rough approximation: DNS + connect + server processing)
    let connectTime = timingData.tcpConnectionTime;
    if (connectTime === undefined) {
      // Estimate: assume latency includes connect time + server processing
      // Typical breakdown: ~30% connect, ~70% server processing
      connectTime = Math.round(latency * 0.3);
    }

    // Calculate response sizes
    const { headersSize, bodySize } = this.calculateResponseSizes(response);

    // Detect data type
    const dataType = this.detectDataType(response);

    const result: ProtocolResult = {
      success: isSuccess,
      status: response.status,
      status_text: response.statusText,
      data: response.data,
      duration,
      request_url: url,
      request_method: method,

      // JMeter-style timing breakdown
      sample_start: startTime,
      latency, // Time to first byte
      connect_time: connectTime,

      // JMeter-style size breakdown
      sent_bytes: (timingData.requestHeadersSize || 0) + (timingData.requestBodySize || 0),
      headers_size_sent: timingData.requestHeadersSize || 0,
      body_size_sent: timingData.requestBodySize || 0,
      headers_size_received: headersSize,
      body_size_received: bodySize,
      response_size: headersSize + bodySize,
      data_type: dataType,
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
    // Extract timing data from error config if available
    let startTime = Date.now() - duration;
    let requestHeadersSize = 0;
    let requestBodySize = 0;
    let timingData: TimingData | undefined;

    if (axios.isAxiosError(error) && error.config) {
      timingData = (error.config as any).timingData;
      if (timingData) {
        startTime = timingData.startTime || startTime;
        requestHeadersSize = timingData.requestHeadersSize || 0;
        requestBodySize = timingData.requestBodySize || 0;
      }
    }

    const result: ProtocolResult = {
      success: false,
      duration,
      request_url: url,
      request_method: method,
      response_size: 0,

      // JMeter-style timing
      sample_start: startTime,
      latency: 0,
      connect_time: 0,

      // JMeter-style size breakdown (request sent, but no response)
      sent_bytes: requestHeadersSize + requestBodySize,
      headers_size_sent: requestHeadersSize,
      body_size_sent: requestBodySize,
      headers_size_received: 0,
      body_size_received: 0,
      data_type: '',
    };

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Server error with response
        result.status = axiosError.response.status;
        result.status_text = axiosError.response.statusText;
        result.error = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
        result.data = axiosError.response.data;

        // Calculate response sizes for error responses
        const { headersSize, bodySize } = this.calculateResponseSizes(axiosError.response);
        result.headers_size_received = headersSize;
        result.body_size_received = bodySize;
        result.response_size = headersSize + bodySize;

        // Detect data type
        result.data_type = this.detectDataType(axiosError.response);

        // Calculate latency if we got a response
        if (timingData) {
          const firstByteTime = timingData.firstByteTime || Date.now();
          result.latency = firstByteTime - startTime;
        }

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

  /**
   * Calculate request header and body sizes
   */
  private calculateRequestSizes(config: AxiosRequestConfig): { requestHeadersSize: number; requestBodySize: number } {
    let requestHeadersSize = 0;
    let requestBodySize = 0;

    // Calculate headers size
    if (config.headers) {
      const headersString = Object.entries(config.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      requestHeadersSize = Buffer.byteLength(headersString + '\r\n\r\n', 'utf8');
    }

    // Calculate body size
    if (config.data) {
      if (typeof config.data === 'string') {
        requestBodySize = Buffer.byteLength(config.data, 'utf8');
      } else if (Buffer.isBuffer(config.data)) {
        requestBodySize = config.data.length;
      } else if (typeof config.data === 'object') {
        // For FormData or URLSearchParams, approximate the size
        try {
          const dataString = JSON.stringify(config.data);
          requestBodySize = Buffer.byteLength(dataString, 'utf8');
        } catch {
          requestBodySize = 0;
        }
      }
    }

    return { requestHeadersSize, requestBodySize };
  }

  /**
   * Calculate response header and body sizes
   */
  private calculateResponseSizes(response: AxiosResponse): { headersSize: number; bodySize: number } {
    let headersSize = 0;
    let bodySize = 0;

    // Calculate headers size
    if (response.headers) {
      const headersString = Object.entries(response.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      headersSize = Buffer.byteLength(headersString + '\r\n\r\n', 'utf8');
    }

    // Calculate body size
    if (response.data) {
      const responseText = this.getResponseText(response.data);
      bodySize = Buffer.byteLength(responseText, 'utf8');
    }

    return { headersSize, bodySize };
  }

  /**
   * Detect data type from response
   */
  private detectDataType(response: AxiosResponse): 'text' | 'bin' | '' {
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml') ||
        contentType.includes('application/javascript')) {
      return 'text';
    } else if (contentType.includes('image/') ||
               contentType.includes('application/octet-stream') ||
               contentType.includes('application/pdf')) {
      return 'bin';
    }

    return '';
  }

  /**
   * Generate JMeter-style thread name
   * Format: "iteration. step_name vu_id-iteration"
   */
  private generateThreadName(context: VUContext, stepName: string): string {
    const iteration = context.iteration || 1;
    const vuId = context.vu_id;
    return `${iteration}. ${stepName} ${vuId}-${iteration}`;
  }
}
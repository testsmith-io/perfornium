import axios, { AxiosResponse, AxiosError, AxiosRequestConfig, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, RESTStep, DebugConfig } from '../../config/types';
import { logger } from '../../utils/logger';
import { BodyProcessor, AuthHandler } from './request';
import { SizeCalculator, ResponseChecks } from './response';

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
    this.debugConfig = this.normalizeDebugConfig(debugConfig);
    this.axiosInstance = this.createAxiosInstance(baseURL, defaultHeaders, timeout);
  }

  private createAxiosInstance(baseURL?: string, defaultHeaders?: Record<string, string>, timeout?: number): AxiosInstance {
    const httpAgent = this.createHttpAgent();
    const httpsAgent = this.createHttpsAgent();

    const instance = axios.create({
      baseURL: baseURL?.replace(/\/$/, ''),
      timeout: timeout || 30000,
      headers: { 'Connection': 'keep-alive', 'Keep-Alive': 'timeout=30', ...defaultHeaders },
      maxRedirects: 3,
      validateStatus: () => true,
      decompress: true,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
      httpAgent,
      httpsAgent
    });

    this.setupInterceptors(instance);
    return instance;
  }

  private createHttpAgent(): http.Agent {
    const agent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 10
    });

    const originalCreateConnection = (agent as any).createConnection;
    (agent as any).createConnection = (options: any, callback: any) => {
      const connectionStart = Date.now();
      const socket = originalCreateConnection.call(agent, options, callback);
      socket.once('connect', () => {
        this.connectionTimings.set(socket, Date.now() - connectionStart);
      });
      return socket;
    };

    return agent;
  }

  private createHttpsAgent(): https.Agent {
    const agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 10
    });

    const originalCreateConnection = (agent as any).createConnection;
    (agent as any).createConnection = (options: any, callback: any) => {
      const connectionStart = Date.now();
      const socket = originalCreateConnection.call(agent, options, callback);
      socket.once('connect', () => {
        this.connectionTimings.set(socket, Date.now() - connectionStart);
      });
      return socket;
    };

    return agent;
  }

  private setupInterceptors(instance: AxiosInstance): void {
    instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const timingData: TimingData = { startTime: Date.now() };

      const { requestHeadersSize, requestBodySize } = SizeCalculator.calculateRequestSizes(config);
      timingData.requestHeadersSize = requestHeadersSize;
      timingData.requestBodySize = requestBodySize;
      (config as any).timingData = timingData;

      const socketCallback = (socket: any) => {
        if (!timingData.socketAssigned) timingData.socketAssigned = Date.now();

        if (!socket.connecting) {
          timingData.connected = Date.now();
          timingData.tcpConnectionTime = 0;
        } else {
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

      (config as any).socketCallback = socketCallback;
      return config;
    });

    instance.interceptors.response.use(
      (response) => {
        const timingData: TimingData = (response.config as any).timingData;
        if (timingData && !timingData.firstByteTime) timingData.firstByteTime = Date.now();
        return response;
      },
      (error) => {
        if (error.config) {
          const timingData: TimingData = (error.config as any).timingData;
          if (timingData && !timingData.firstByteTime) timingData.firstByteTime = Date.now();
        }
        return Promise.reject(error);
      }
    );
  }

  async execute(request: RESTStep, context: VUContext): Promise<ProtocolResult> {
    const startTime = Date.now();
    const method = request.method.toUpperCase();
    const url = this.buildURL(request.path);
    const axiosConfig = this.prepareRequestConfig(request, url);

    try {
      if (this.debugConfig?.log_level === 'debug') {
        logger.debug(`🌐 ${method} ${url}`);
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
      timeout: request.timeout
    };

    const headers: Record<string, string> = {};
    if (request.headers) Object.assign(headers, request.headers);

    if ('query' in request && request.query) config.params = request.query;

    if ('auth' in request && request.auth) {
      AuthHandler.handleAuthentication(config, headers, request.auth);
    }

    if (request.json) {
      config.data = JSON.stringify(request.json);
      if (!BodyProcessor.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/json';
      }
    } else if ('form' in request && request.form) {
      config.data = new URLSearchParams(request.form as any).toString();
      if (!BodyProcessor.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if ('multipart' in request && request.multipart) {
      const FormData = require('form-data');
      const formData = new FormData();
      Object.entries(request.multipart).forEach(([key, value]) => formData.append(key, value));
      config.data = formData;
      Object.assign(headers, formData.getHeaders());
    } else if (request.body) {
      const { data, contentType } = BodyProcessor.processBodyPayload(request.body);
      config.data = data;
      if (contentType && !BodyProcessor.hasContentTypeHeader(headers)) {
        headers['Content-Type'] = contentType;
      }
    }

    config.headers = headers;
    return config;
  }

  private createSuccessResult(
    response: AxiosResponse,
    request: RESTStep,
    url: string,
    method: string,
    duration: number
  ): ProtocolResult {
    const isSuccess = response.status >= 200 && response.status < 300;
    const timingData: TimingData = (response.config as any).timingData || {};
    const startTime = timingData.startTime || Date.now() - duration;
    const firstByteTime = timingData.firstByteTime || Date.now();
    const latency = firstByteTime - startTime;

    let connectTime = timingData.tcpConnectionTime;
    if (connectTime === undefined) connectTime = Math.round(latency * 0.3);

    const { headersSize, bodySize } = SizeCalculator.calculateResponseSizes(
      response,
      (data) => this.getResponseText(data)
    );

    const result: ProtocolResult = {
      success: isSuccess,
      status: response.status,
      status_text: response.statusText,
      data: response.data,
      duration,
      request_url: url,
      request_method: method,
      sample_start: startTime,
      latency,
      connect_time: connectTime,
      sent_bytes: (timingData.requestHeadersSize || 0) + (timingData.requestBodySize || 0),
      headers_size_sent: timingData.requestHeadersSize || 0,
      body_size_sent: timingData.requestBodySize || 0,
      headers_size_received: headersSize,
      body_size_received: bodySize,
      response_size: headersSize + bodySize,
      data_type: SizeCalculator.detectDataType(response),
    };

    this.addDetailedInfo(result, response, request, isSuccess);

    if (this.debugConfig?.log_level === 'debug') {
      this.logResponseDetails(response, isSuccess, duration, method, url);
    }

    if (!isSuccess) {
      logger.warn(`❌ Request failed: ${method} ${url} - Status: ${response.status} ${response.statusText}`);
    }

    if (request.checks) {
      ResponseChecks.runChecks(request.checks, response, duration, result);
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
      sample_start: startTime,
      latency: 0,
      connect_time: 0,
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
        result.status = axiosError.response.status;
        result.status_text = axiosError.response.statusText;
        result.error = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
        result.data = axiosError.response.data;

        const { headersSize, bodySize } = SizeCalculator.calculateResponseSizes(
          axiosError.response,
          (data) => this.getResponseText(data)
        );
        result.headers_size_received = headersSize;
        result.body_size_received = bodySize;
        result.response_size = headersSize + bodySize;
        result.data_type = SizeCalculator.detectDataType(axiosError.response);

        if (timingData) {
          result.latency = (timingData.firstByteTime || Date.now()) - startTime;
        }

        this.addDetailedInfo(result, axiosError.response, request, false);

        if (this.debugConfig?.log_level === 'debug') {
          this.logResponseDetails(axiosError.response, false, duration, method, url);
        }
      } else if (axiosError.request) {
        result.error = `Network error: ${axiosError.message}`;
        result.error_code = axiosError.code || 'NETWORK_ERROR';
      } else {
        result.error = `Request error: ${axiosError.message}`;
        result.error_code = 'REQUEST_ERROR';
      }
    } else {
      result.error = error.message || 'Unknown error';
      result.error_code = 'UNKNOWN_ERROR';
    }

    logger.warn(`❌ ${result.error_code || 'ERROR'}: ${method} ${url} - ${result.error}`);
    return result;
  }

  private addDetailedInfo(
    result: ProtocolResult,
    response: AxiosResponse,
    request: RESTStep,
    isSuccess: boolean
  ): void {
    const shouldCapture = !this.debugConfig?.capture_only_failures || !isSuccess;
    if (!shouldCapture) return;

    if (this.debugConfig?.capture_response_body) {
      const responseText = this.getResponseText(response.data);
      result.response_size = Buffer.byteLength(responseText, 'utf8');
      result.response_body = this.truncateIfNeeded(responseText);
    } else {
      result.response_size = Buffer.byteLength(this.getResponseText(response.data), 'utf8');
    }

    if (this.debugConfig?.capture_response_headers) {
      result.response_headers = this.flattenHeaders(response.headers);
    }

    if (this.debugConfig?.capture_request_headers && request.headers) {
      result.request_headers = request.headers;
    }

    if (this.debugConfig?.capture_request_body && request.body) {
      result.request_body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
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
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2);
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
    const shouldCapture = !this.debugConfig.capture_only_failures || !isSuccess;
    if (!shouldCapture) return;

    const statusIcon = isSuccess ? '✅' : '❌';
    logger.debug(`📥 Response Details ${statusIcon}:`);
    logger.debug(`   Status: ${response.status} ${response.statusText}`);
    logger.debug(`   Duration: ${duration}ms`);

    if (this.debugConfig.capture_response_headers) {
      logger.debug(`   Headers:`, JSON.stringify(this.flattenHeaders(response.headers), null, 2));
    }

    if (this.debugConfig.capture_response_body) {
      const responseText = this.getResponseText(response.data);
      logger.debug(`   Body (${responseText.length} chars):`, this.truncateIfNeeded(responseText));
    }
  }

  private buildURL(path: string): string {
    if (path.startsWith('http')) return path;
    return path.startsWith('/') ? path.slice(1) : path;
  }

  private getResponseText(data: any): string {
    if (typeof data === 'string') return data;
    if (!data) return '';
    try { return JSON.stringify(data); } catch { return String(data); }
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
    return text.length > maxSize ? text.substring(0, maxSize) + `...(+${text.length - maxSize} chars)` : text;
  }

  private normalizeDebugConfig(config?: DebugConfig): DebugConfig | undefined {
    if (!config) return undefined;

    const normalized: DebugConfig = { ...config };
    const hasUserFriendlyOptions = config.log_requests || config.log_responses ||
                                   config.log_headers || config.log_body || config.log_timings;

    if (hasUserFriendlyOptions) {
      normalized.log_level = normalized.log_level || 'debug';
      if (config.log_headers) {
        normalized.capture_request_headers = true;
        normalized.capture_response_headers = true;
      }
      if (config.log_body) {
        normalized.capture_request_body = true;
        normalized.capture_response_body = true;
      }
    }

    return normalized;
  }
}

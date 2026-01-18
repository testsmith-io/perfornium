import { Page, Request, Response } from 'playwright';
import { NetworkCaptureConfig } from '../../../config';
import { CapturedNetworkCall } from '../../../metrics/types';
import { logger } from '../../../utils/logger';
import { NetworkFilters } from './filters';
import { NetworkUtils } from './utils';
import { PendingRequest, CurrentContext, CapturedBody } from './types';

export type NetworkCallCallback = (call: CapturedNetworkCall) => void;

export class NetworkCaptureManager {
  private networkCalls: Map<number, CapturedNetworkCall[]> = new Map();
  private pendingRequests: Map<Request, PendingRequest> = new Map();
  private currentContext: Map<number, CurrentContext> = new Map();
  private onNetworkCall?: NetworkCallCallback;

  constructor(onNetworkCall?: NetworkCallCallback) {
    this.onNetworkCall = onNetworkCall;
  }

  setNetworkCallCallback(callback: NetworkCallCallback): void {
    this.onNetworkCall = callback;
  }

  updateContext(vuId: number, context: CurrentContext): void {
    this.currentContext.set(vuId, context);
  }

  setupNetworkCapture(page: Page, vuId: number, config: NetworkCaptureConfig): void {
    if (!this.networkCalls.has(vuId)) {
      this.networkCalls.set(vuId, []);
    }

    const capturedBodies = new Map<string, CapturedBody>();

    logger.info(`VU ${vuId}: Setting up network capture with config: ${JSON.stringify(config)}`);

    // Use route interception to capture response bodies
    page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const shouldCapture = NetworkFilters.shouldCaptureUrl(url, config) && config.capture_response_body;

      if (!shouldCapture) {
        await route.continue();
        return;
      }

      try {
        const response = await route.fetch();
        const contentType = response.headers()['content-type'] || '';

        let bodyText: string | undefined;
        if (NetworkFilters.shouldCaptureBodyByContentType(contentType, config)) {
          try {
            bodyText = await response.text();
          } catch {
            // Body not available as text
          }
        }

        if (bodyText !== undefined) {
          capturedBodies.set(url, { body: bodyText, headers: response.headers() });
        }

        await route.fulfill({ response });
      } catch (error) {
        await route.continue();
      }
    });

    // Capture request start
    page.on('request', (request: Request) => {
      const url = request.url();
      if (!NetworkFilters.shouldCaptureUrl(url, config)) return;

      const requestId = NetworkUtils.generateRequestId();
      const startTime = Date.now();
      const currentCtx = this.currentContext.get(vuId);

      const call: Partial<CapturedNetworkCall> = {
        id: requestId,
        vu_id: vuId,
        timestamp: startTime,
        request_url: url,
        request_method: request.method(),
        request_headers: NetworkUtils.captureHeaders(request.headers(), config),
        request_body: NetworkUtils.captureRequestBody(request.postData(), config),
        request_body_truncated: NetworkUtils.isBodyTruncated(request.postData(), config),
        start_time: startTime,
        resource_type: request.resourceType(),
        scenario: currentCtx?.scenario,
        step_name: currentCtx?.step_name,
        success: false
      };

      this.pendingRequests.set(request, { call, vuId });
    });

    // Capture response
    page.on('response', async (response: Response) => {
      const request = response.request();
      const url = request.url();
      if (!NetworkFilters.shouldCaptureUrl(url, config)) return;

      const pending = this.pendingRequests.get(request);

      if (!pending) {
        logger.debug(`VU ${vuId}: Response without matching request for ${url}`);
        return;
      }

      this.pendingRequests.delete(request);
      const endTime = Date.now();

      try {
        const status = response.status();
        const headers = response.headers();

        let body: string | undefined;
        let bodyTruncated = false;

        const captured = capturedBodies.get(url);
        if (captured && config.capture_response_body) {
          body = NetworkUtils.truncateBody(captured.body, config);
          bodyTruncated = NetworkUtils.isBodyTruncated(captured.body, config);
          capturedBodies.delete(url);
        } else if (config.capture_response_body && NetworkFilters.shouldCaptureBodyByContentType(headers['content-type'], config)) {
          try {
            const bodyText = await response.text();
            body = NetworkUtils.truncateBody(bodyText, config);
            bodyTruncated = NetworkUtils.isBodyTruncated(bodyText, config);
          } catch (bodyError: any) {
            logger.debug(`Failed to capture response body for ${url}: ${bodyError.message}`);
          }
        }

        const completedCall: CapturedNetworkCall = {
          ...pending.call as CapturedNetworkCall,
          response_status: status,
          response_status_text: response.statusText(),
          response_headers: NetworkUtils.captureHeaders(headers, config),
          response_body: body,
          response_body_truncated: bodyTruncated,
          response_size: body?.length,
          end_time: endTime,
          duration: endTime - pending.call.start_time!,
          success: status >= 200 && status < 400
        };

        const vuCalls = this.networkCalls.get(vuId)!;
        vuCalls.push(completedCall);

        // Invoke callback for real-time processing (e.g., InfluxDB storage)
        if (this.onNetworkCall) {
          this.onNetworkCall(completedCall);
        }

        if (config.store_separate !== false) {
          console.log(`[NETWORK] ${JSON.stringify({
            id: completedCall.id,
            vu: vuId,
            url: url,
            method: request.method(),
            status: status,
            statusText: completedCall.response_status_text,
            duration: completedCall.duration,
            size: completedCall.response_size || 0,
            type: request.resourceType(),
            success: completedCall.success,
            requestHeaders: completedCall.request_headers,
            requestBody: completedCall.request_body,
            responseHeaders: completedCall.response_headers,
            responseBody: completedCall.response_body
          })}`);
        }

      } catch (error: any) {
        logger.debug(`VU ${vuId}: Failed to capture response for ${url}: ${error.message}`);
      }
    });

    // Capture request failures
    page.on('requestfailed', (request: Request) => {
      const url = request.url();
      if (!NetworkFilters.shouldCaptureUrl(url, config)) return;

      const pending = this.pendingRequests.get(request);
      this.pendingRequests.delete(request);

      const endTime = Date.now();
      const currentCtx = this.currentContext.get(vuId);

      const failedCall: CapturedNetworkCall = {
        id: pending?.call.id || NetworkUtils.generateRequestId(),
        vu_id: vuId,
        timestamp: pending?.call.start_time || endTime,
        request_url: url,
        request_method: request.method(),
        request_headers: pending?.call.request_headers,
        request_body: pending?.call.request_body,
        start_time: pending?.call.start_time || endTime,
        end_time: endTime,
        duration: endTime - (pending?.call.start_time || endTime),
        resource_type: request.resourceType(),
        scenario: pending?.call.scenario || currentCtx?.scenario,
        step_name: pending?.call.step_name || currentCtx?.step_name,
        success: false,
        error: request.failure()?.errorText || 'Request failed'
      };

      const vuCalls = this.networkCalls.get(vuId)!;
      vuCalls.push(failedCall);

      // Invoke callback for real-time processing (e.g., InfluxDB storage)
      if (this.onNetworkCall) {
        this.onNetworkCall(failedCall);
      }

      if (config.store_separate !== false) {
        console.log(`[NETWORK] ${JSON.stringify({
          id: failedCall.id,
          vu: vuId,
          url: url,
          method: request.method(),
          status: 0,
          statusText: 'Failed',
          duration: failedCall.duration,
          size: 0,
          type: request.resourceType(),
          success: false,
          error: failedCall.error,
          requestHeaders: failedCall.request_headers,
          requestBody: failedCall.request_body
        })}`);
      }
    });
  }

  getAndClearNetworkCalls(vuId: number): CapturedNetworkCall[] {
    const calls = this.networkCalls.get(vuId) || [];
    this.networkCalls.set(vuId, []);
    return calls;
  }

  getNetworkCalls(vuId: number): CapturedNetworkCall[] {
    return this.networkCalls.get(vuId) || [];
  }

  clearVU(vuId: number): void {
    this.networkCalls.delete(vuId);
    this.currentContext.delete(vuId);
  }

  clearAll(): void {
    this.networkCalls.clear();
    this.pendingRequests.clear();
    this.currentContext.clear();
  }
}

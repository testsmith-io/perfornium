import { NetworkCaptureConfig } from '../../../config';

export class NetworkUtils {
  static captureHeaders(headers: Record<string, string>, config: NetworkCaptureConfig): Record<string, string> | undefined {
    return headers;
  }

  static captureRequestBody(body: string | null | undefined, config: NetworkCaptureConfig): string | undefined {
    if (!config.capture_request_body || !body) return undefined;
    return NetworkUtils.truncateBody(body, config);
  }

  static truncateBody(body: string | null | undefined, config: NetworkCaptureConfig): string | undefined {
    if (!body) return undefined;
    const maxSize = config.max_body_size || 10240;
    return body.length > maxSize ? body.substring(0, maxSize) : body;
  }

  static isBodyTruncated(body: string | null | undefined, config: NetworkCaptureConfig): boolean {
    if (!body) return false;
    const maxSize = config.max_body_size || 10240;
    return body.length > maxSize;
  }

  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

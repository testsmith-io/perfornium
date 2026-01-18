import { AxiosRequestConfig, AxiosResponse } from 'axios';

export class SizeCalculator {
  static calculateRequestSizes(config: AxiosRequestConfig): { requestHeadersSize: number; requestBodySize: number } {
    let requestHeadersSize = 0;
    let requestBodySize = 0;

    if (config.headers) {
      const headersString = Object.entries(config.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      requestHeadersSize = Buffer.byteLength(headersString + '\r\n\r\n', 'utf8');
    }

    if (config.data) {
      if (typeof config.data === 'string') {
        requestBodySize = Buffer.byteLength(config.data, 'utf8');
      } else if (Buffer.isBuffer(config.data)) {
        requestBodySize = config.data.length;
      } else if (typeof config.data === 'object') {
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

  static calculateResponseSizes(response: AxiosResponse, getResponseText: (data: any) => string): { headersSize: number; bodySize: number } {
    let headersSize = 0;
    let bodySize = 0;

    if (response.headers) {
      const headersString = Object.entries(response.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      headersSize = Buffer.byteLength(headersString + '\r\n\r\n', 'utf8');
    }

    if (response.data) {
      const responseText = getResponseText(response.data);
      bodySize = Buffer.byteLength(responseText, 'utf8');
    }

    return { headersSize, bodySize };
  }

  static detectDataType(response: AxiosResponse): 'text' | 'bin' | '' {
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
}

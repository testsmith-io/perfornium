import { NetworkCaptureConfig } from '../../../config';
import { minimatch } from 'minimatch';
import { logger } from '../../../utils/logger';

export class NetworkFilters {
  static shouldCaptureUrl(url: string, config: NetworkCaptureConfig): boolean {
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      // Keep full URL if parsing fails
    }

    // Check exclude patterns first
    if (config.exclude_patterns?.length) {
      for (const pattern of config.exclude_patterns) {
        const corePattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^\/+|\/+$/g, '');
        const simpleMatch = corePattern && (url.includes(corePattern) || pathname.includes(corePattern));
        if (minimatch(url, pattern) || minimatch(pathname, pattern) || simpleMatch) {
          return false;
        }
      }
    }

    // Check include patterns (if specified, URL must match at least one)
    if (config.include_patterns?.length) {
      for (const pattern of config.include_patterns) {
        const corePattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^\/+|\/+$/g, '');
        const simpleMatch = corePattern && (url.includes(corePattern) || pathname.includes(corePattern));
        const globMatch = minimatch(url, pattern) || minimatch(pathname, pattern);

        if (globMatch || simpleMatch) {
          logger.debug(`URL captured: ${url} matches pattern ${pattern}`);
          return true;
        }
      }
      return false;
    }

    return true;
  }

  static shouldCaptureBodyByContentType(contentType: string | undefined, config: NetworkCaptureConfig): boolean {
    if (!contentType) return false;
    if (!config.content_type_filters?.length) return true;

    const lowerContentType = contentType.toLowerCase();
    return config.content_type_filters.some(filter =>
      lowerContentType.includes(filter.toLowerCase())
    );
  }
}

import { AxiosResponse } from 'axios';
import { ProtocolResult } from '../../base';

export class ResponseChecks {
  static runChecks(
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
            const value = ResponseChecks.getJsonPath(response.data, check.value);
            passed = value !== undefined && value !== null;
            if (!passed) errors.push(`JSON path ${check.value} not found`);
            break;

          case 'text_contains':
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

  static getJsonPath(obj: any, path: string): any {
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
}

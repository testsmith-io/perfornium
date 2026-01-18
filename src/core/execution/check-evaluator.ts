import { CheckConfig, VUContext } from '../../config';
import { parseTime } from '../../utils/time';

export interface CheckResult {
  passed: boolean;
  errors: string[];
}

export class CheckEvaluator {
  async runChecks(
    checks: CheckConfig[],
    result: any,
    context: VUContext
  ): Promise<CheckResult> {
    const errors: string[] = [];

    for (const check of checks) {
      try {
        let passed = false;
        let errorDetail = '';

        switch (check.type) {
          case 'status':
            passed = result.status === check.value;
            if (!passed) {
              errorDetail = `Expected status ${check.value}, got ${result.status ?? 'no response'}`;
            }
            break;
          case 'response_time':
            const threshold = typeof check.value === 'string'
              ? parseTime(check.value.replace(/[<>]/g, ''))
              : check.value;
            passed = (result.duration || 0) < threshold;
            if (!passed) {
              errorDetail = `Response time ${result.duration || 0}ms exceeded ${threshold}ms`;
            }
            break;
          case 'json_path':
            const value = this.getJsonPath(result.data, check.value);
            passed = value !== undefined && value !== null;
            if (!passed) {
              errorDetail = `JSON path '${check.value}' not found in response`;
            }
            break;
          case 'text_contains':
            const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
            passed = text.includes(check.value);
            if (!passed) {
              errorDetail = `Response does not contain '${check.value}'`;
            }
            break;
          case 'custom':
            passed = await this.checkCustom(check.script!, result, context);
            if (!passed) {
              errorDetail = 'Custom check failed';
            }
            break;
        }

        if (!passed) {
          errors.push(check.description || errorDetail || `Check failed: ${check.type}`);
        }
      } catch (error) {
        errors.push(`Check error: ${error}`);
      }
    }

    return { passed: errors.length === 0, errors };
  }

  private async checkCustom(script: string, result: any, context: VUContext): Promise<boolean> {
    try {
      const fn = new Function('result', 'context', `return ${script}`);
      return !!fn(result, context);
    } catch (error) {
      return false;
    }
  }

  private getJsonPath(obj: any, path: string): any {
    const keys = path.replace(/^\$\./, '').split('.');
    return keys.reduce((current, key) => {
      if (key.includes('[') && key.includes(']')) {
        const [prop, index] = key.split(/[\[\]]/);
        return current && current[prop] && current[prop][parseInt(index)];
      }
      return current && current[key];
    }, typeof obj === 'string' ? JSON.parse(obj) : obj);
  }
}

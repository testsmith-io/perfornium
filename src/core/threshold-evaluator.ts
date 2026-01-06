import { ThresholdConfig } from '../config';
import { TestResult } from '../metrics/types';
import { logger } from '../utils/logger';

export interface ThresholdEvaluationResult {
  passed: boolean;
  failures: ThresholdFailure[];
}

export interface ThresholdFailure {
  threshold: ThresholdConfig;
  actualValue: number | string;
  expectedValue: number | string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
}

export class ThresholdEvaluator {
  
  /**
   * Evaluate all thresholds against a test result
   */
  static evaluate(
    thresholds: ThresholdConfig[],
    result: TestResult,
    stepName?: string
  ): ThresholdEvaluationResult {
    const failures: ThresholdFailure[] = [];
    
    for (const threshold of thresholds) {
      try {
        const failure = this.evaluateThreshold(threshold, result, stepName);
        if (failure) {
          failures.push(failure);
        }
      } catch (error) {
        logger.warn(`Error evaluating threshold for metric ${threshold.metric}: ${error}`);
        failures.push({
          threshold,
          actualValue: 'ERROR',
          expectedValue: threshold.value,
          message: `Threshold evaluation failed: ${error}`,
          severity: 'error'
        });
      }
    }
    
    return {
      passed: failures.length === 0,
      failures
    };
  }
  
  /**
   * Evaluate a single threshold
   */
  private static evaluateThreshold(
    threshold: ThresholdConfig,
    result: TestResult,
    stepName?: string
  ): ThresholdFailure | null {
    const actualValue = this.extractMetricValue(threshold.metric, result);
    const expectedValue = this.parseExpectedValue(threshold.value);
    const operator = threshold.operator || 'lte'; // Default to less than or equal
    
    const passed = this.compareValues(actualValue, expectedValue, operator);
    
    if (!passed) {
      const stepInfo = stepName ? ` in step "${stepName}"` : '';
      const description = threshold.description || 
        `${threshold.metric} threshold exceeded${stepInfo}`;
      
      return {
        threshold,
        actualValue,
        expectedValue,
        message: `${description}: ${actualValue} ${this.getOperatorSymbol(operator)} ${expectedValue}`,
        severity: threshold.severity || 'error'
      };
    }
    
    return null;
  }
  
  /**
   * Extract the actual metric value from test result
   */
  private static extractMetricValue(
    metric: string,
    result: TestResult
  ): number | string {
    switch (metric) {
      case 'response_time':
        return result.duration;
        
      case 'status_code':
        return result.status || 0;
        
      case 'error_rate':
        // This would need to be calculated at a higher level
        // For now, return 0 for success, 100 for failure
        return result.success ? 0 : 100;
        
      case 'throughput':
        // Calculate requests per second (would need time window context)
        return result.duration > 0 ? 1000 / result.duration : 0;
        
      case 'custom':
        // Custom metrics would be stored in result.custom_metrics
        return (result as any).custom_metrics || 0;
        
      default:
        throw new Error(`Unknown metric type: ${metric}`);
    }
  }
  
  /**
   * Parse expected value, handling units like "1s", "500ms", etc.
   */
  private static parseExpectedValue(value: number | string): number {
    if (typeof value === 'number') {
      return value;
    }
    
    const str = value.toString().toLowerCase();
    
    // Handle time units
    if (str.endsWith('ms')) {
      return parseFloat(str.slice(0, -2));
    }
    if (str.endsWith('s')) {
      return parseFloat(str.slice(0, -1)) * 1000; // Convert to ms
    }
    if (str.endsWith('m')) {
      return parseFloat(str.slice(0, -1)) * 60000; // Convert to ms
    }
    
    // Handle percentage
    if (str.endsWith('%')) {
      return parseFloat(str.slice(0, -1));
    }
    
    // Default: try to parse as number
    const parsed = parseFloat(str);
    if (isNaN(parsed)) {
      throw new Error(`Cannot parse threshold value: ${value}`);
    }
    
    return parsed;
  }
  
  /**
   * Compare actual vs expected values using the specified operator
   */
  private static compareValues(
    actual: number | string,
    expected: number,
    operator: string
  ): boolean {
    const actualNum = typeof actual === 'string' ? parseFloat(actual.toString()) : actual;
    
    if (isNaN(actualNum)) {
      return operator === 'ne'; // Only "not equals" passes for non-numeric values
    }
    
    switch (operator) {
      case 'lt': return actualNum < expected;
      case 'lte': return actualNum <= expected;
      case 'gt': return actualNum > expected;
      case 'gte': return actualNum >= expected;
      case 'eq': return actualNum === expected;
      case 'ne': return actualNum !== expected;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }
  
  /**
   * Get human-readable operator symbol
   */
  private static getOperatorSymbol(operator: string): string {
    const symbols: Record<string, string> = {
      'lt': '<',
      'lte': '≤',
      'gt': '>',
      'gte': '≥',
      'eq': '=',
      'ne': '≠'
    };
    return symbols[operator] || operator;
  }
  
  /**
   * Execute threshold action based on severity and configuration
   */
  static async executeThresholdActions(
    evaluationResult: ThresholdEvaluationResult,
    stepName?: string
  ): Promise<void> {
    for (const failure of evaluationResult.failures) {
      const action = failure.threshold.action || 'log';
      const stepInfo = stepName ? ` [Step: ${stepName}]` : '';
      
      switch (action) {
        case 'log':
          logger.warn(`Threshold violation${stepInfo}: ${failure.message}`);
          break;
          
        case 'fail_step':
          logger.error(`Step threshold violation${stepInfo}: ${failure.message}`);
          throw new Error(`Step failed due to threshold violation: ${failure.message}`);
          
        case 'fail_scenario':
          logger.error(`Scenario threshold violation${stepInfo}: ${failure.message}`);
          throw new Error(`Scenario failed due to threshold violation: ${failure.message}`);
          
        case 'fail_test':
          logger.error(`Test threshold violation${stepInfo}: ${failure.message}`);
          throw new Error(`Test failed due to threshold violation: ${failure.message}`);
          
        case 'abort':
          logger.error(`Critical threshold violation${stepInfo}: ${failure.message}`);
          process.exit(1);
          
        default:
          logger.warn(`Unknown threshold action: ${action}`);
      }
    }
  }
}
import { Step, VUContext, CheckConfig, ExtractConfig } from '../config/types';
import { ProtocolHandler } from '../protocols/base';
import { TestResult } from '../metrics/types';
import { StepHooksManager } from './hooks-manager';
import { ScriptExecutor } from './script-executor';
import { sleep, parseTime } from '../utils/time';
import { TemplateProcessor } from '../utils/template';
import { logger } from '../utils/logger';

export class StepExecutor {
  private handlers: Map<string, ProtocolHandler>;
  private templateProcessor = new TemplateProcessor();
  private testName: string;

  constructor(handlers: Map<string, ProtocolHandler>, testName: string = 'Load Test') {
    this.handlers = handlers;
    this.testName = testName;
    
    // Register this instance with ScriptExecutor for step execution in hooks
    ScriptExecutor.setStepExecutor(this);
  }

  async executeStep(
    step: Step, 
    context: VUContext, 
    scenarioName: string
  ): Promise<TestResult> {
    const startTime = Date.now();
    const stepName = step.name || step.type;
    
    // Create step hooks manager if step has hooks
    let stepHooksManager: StepHooksManager | undefined;
    if ((step as any).hooks) {
      stepHooksManager = new StepHooksManager(
        this.testName,
        context.vu_id,
        scenarioName,
        stepName || 'rest',
        step.type || 'rest',
        (step as any).hooks
      );
    }

    // Execute beforeStep hook
    if (stepHooksManager) {
      try {
        const beforeStepResult = await stepHooksManager.executeBeforeStep(
          context.variables,
          context.extracted_data,
          (context as any).csv_data
        );

        // Merge any variables returned by beforeStep hook
        if (beforeStepResult?.variables) {
          Object.assign(context.variables, beforeStepResult.variables);
          console.log(`Hook VU${context.vu_id}: beforeStep hook set variables:`, Object.keys(beforeStepResult.variables));
        }
      } catch (error) {
        logger.error(`VU ${context.vu_id} beforeStep hook failed:`, error);
      }
    }

    let testResult: TestResult | undefined;
    
    try {
      // Execute the actual step
      testResult = await this.executeStepInternal(step, context, scenarioName, startTime);
      
    } catch (error) {
      // Execute onStepError hook
      if (stepHooksManager) {
        try {
          await stepHooksManager.executeOnStepError(
            error as Error,
            context.variables,
            context.extracted_data,
            (context as any).csv_data
          );
        } catch (hookError) {
          logger.error(`VU ${context.vu_id} onStepError hook failed:`, hookError);
        }
      }
      
      // Create error result
      testResult = {
        id: `${context.vu_id}-${Date.now()}`,
        vu_id: context.vu_id,
        iteration: context.iteration,
        scenario: scenarioName,
        action: step.name || step.type || 'rest' ,
        step_name: step.name || `${step.type}_${context.iteration}`,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
        shouldRecord: true 
      };
      
    } finally {
      // Execute teardownStep hook (only if testResult was created)
      if (stepHooksManager && testResult) {
        try {
          const teardownResult = await stepHooksManager.executeTeardownStep(
            context.variables,
            context.extracted_data,
            (context as any).csv_data,
            testResult
          );

          // Merge any variables returned by teardownStep hook
          if (teardownResult?.variables) {
            Object.assign(context.variables, teardownResult.variables);
          }
        } catch (error) {
          logger.error(`VU ${context.vu_id} teardownStep hook failed:`, error);
        }
      }
    }

    // This should never happen, but TypeScript needs the guarantee
    if (!testResult) {
      testResult = {
        id: `${context.vu_id}-${Date.now()}`,
        vu_id: context.vu_id,
        iteration: context.iteration,
        scenario: scenarioName,
        action: step.name || step.type || 'rest',
        step_name: step.name || `${step.type}_${context.iteration}`,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: 'Unknown error occurred',
        shouldRecord: true 
      };
    }

    return testResult;
  }

  // Make this public so hooks can execute steps
  public async executeStepInternal(
    step: Step, 
    context: VUContext, 
    scenarioName: string,
    startTime: number
  ): Promise<TestResult> {
    const processedStep = this.processTemplate(step, context);

    // Check condition if specified
    if (step.condition && !this.evaluateCondition(step.condition, context)) {
      return {
        id: `${context.vu_id}-${Date.now()}`,
        vu_id: context.vu_id,
        iteration: context.iteration,
        scenario: scenarioName,
        action: step.name || step.type || 'rest',
        step_name: step.name || `${step.type}_${context.iteration}`,
        timestamp: startTime,
        duration: 0,
        success: true,
        custom_metrics: { skipped: true }
      };
    }

    let result: any;

    const stepType = step.type || 'rest';

    switch (stepType) {
      case 'rest':
        result = await this.executeRESTStep(processedStep, context);
        break;
      case 'soap':
        result = await this.executeSOAPStep(processedStep, context);
        break;
      case 'web':
        result = await this.executeWebStep(processedStep, context);
        break;
      case 'custom':
        result = await this.executeCustomStep(processedStep, context);
        break;
      case 'wait':
        result = await this.executeWaitStep(processedStep, context);
        break;
      default:
        throw new Error(`Unsupported step type: ${(step as any).type}`);
    }

    const duration = Date.now() - startTime;
    
    const testResult: TestResult = {
      id: `${context.vu_id}-${Date.now()}`,
      vu_id: context.vu_id,
      iteration: context.iteration,
      scenario: scenarioName,
      action: step.name || `${step.type}_action`,
      step_name: step.name || `${step.type}_${context.iteration}`,
      timestamp: startTime,
      duration,
      success: result.success,
      status: result.status,
      status_text: result.status_text,
      error: result.error,
      error_code: result.error_code,
      response_size: result.response_size,
      request_url: result.request_url,
      request_method: result.request_method,
      request_headers: result.request_headers,
      request_body: result.request_body,
      response_headers: result.response_headers,
      response_body: result.response_body,
      custom_metrics: result.custom_metrics,
      shouldRecord: this.shouldRecordStep(step, true)
    };

    // Run checks if configured
    if ('checks' in step && step.checks) {
      const checkResults = await this.runChecks(step.checks, result, context);
      if (!checkResults.passed) {
        testResult.success = false;
        testResult.error = `Check failed: ${checkResults.errors.join(', ')}`;
      }
    }

    // Extract data if configured
    if ('extract' in step && step.extract) {
      await this.extractData(step.extract, result, context);
    }

    return testResult;
  }

  private shouldRecordStep(step: Step, success: boolean): boolean {
    // Always record errors
    if (!success) return true;
    
    // For web steps, only record verification commands
    if (step.type === 'web' && step.action) {
      const verificationCommands = [
        'verify_visible',
        'verify_text',
        'verify_value',
        'verify_attribute',
        'verify_exists',
        'verify_not_exists',
        'assert_text',
        'assert_visible',
        'wait_for_element'
      ];
      
      return verificationCommands.includes(step.action.command);
    }
    
    return true;
  }

  private async executeRESTStep(step: any, context: VUContext): Promise<any> {
    const handler = this.handlers.get('rest');
    if (!handler) {
      throw new Error('REST handler not available');
    }
    return handler.execute(step, context);
  }

  private async executeSOAPStep(step: any, context: VUContext): Promise<any> {
    const handler = this.handlers.get('soap');
    if (!handler) {
      throw new Error('SOAP handler not available');
    }
    return handler.execute(step, context);
  }

  private async executeWebStep(step: any, context: VUContext): Promise<any> {
    const handler = this.handlers.get('web');
    if (!handler) {
      throw new Error('Web handler not available');
    }
    return handler.execute(step.action, context);
  }

  private async executeCustomStep(step: any, context: VUContext): Promise<any> {
    const script = step.script;
    const timeout = step.timeout || 30000;
    
    try {
      const result = await this.executeScript(script, context, timeout);
      return {
        success: true,
        data: result,
        custom_metrics: { script_executed: true }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async executeWaitStep(step: any, context: VUContext): Promise<any> {
    const duration = parseTime(step.duration);
    await sleep(duration);
    
    return {
      success: true,
      data: { waited: duration },
      custom_metrics: { wait_duration: duration }
    };
  }

  private async executeScript(script: string, context: VUContext, timeout: number): Promise<any> {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('context', 'require', script);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Script execution timeout')), timeout);
    });
    
    return Promise.race([
      fn(context, require),
      timeoutPromise
    ]);
  }

  private evaluateCondition(condition: string, context: VUContext): boolean {
    try {
      const fn = new Function('context', `return ${condition}`);
      return !!fn(context);
    } catch (error) {
      logger.warn(`Condition evaluation failed: ${condition}`, error);
      return false;
    }
  }

  private processTemplate(step: Step, context: VUContext): Step {
    const contextData = {
      __VU: context.vu_id,
      __ITER: context.iteration,
      vu_id: context.vu_id,
      iteration: context.iteration,
      variables: context.variables || {},
      extracted_data: context.extracted_data || {},
      ...context.variables,
      ...context.extracted_data
    };
    
    console.log(`StepExecutor processing template for VU${context.vu_id} Iter${context.iteration}`);
    console.log(`Context data:`, contextData);
    
    const stepStr = JSON.stringify(step);
    console.log(`Original step JSON:`, stepStr);
    
    const processed = this.templateProcessor.process(stepStr, contextData);
    console.log(`Raw processed result:`, processed);
    console.log(`Processed result type:`, typeof processed);
    
    let processedStep: Step;
    
    try {
      if (typeof processed === 'string') {
        processedStep = JSON.parse(processed);
      } else {
        processedStep = processed as Step;
      }
    } catch (error) {
      console.error(`JSON parsing failed in StepExecutor:`);
      console.error(`Processed content (first 500 chars):`, processed.substring(0, 500));
      console.error(`Error:`, error);
      
      throw new Error(`Failed to parse processed step JSON: ${error}`);
    }
    
    console.log(`Successfully parsed step:`, JSON.stringify(processedStep));
    return processedStep;
  }

  private async runChecks(
    checks: CheckConfig[], 
    result: any, 
    context: VUContext
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const check of checks) {
      try {
        let passed = false;

        switch (check.type) {
          case 'status':
            passed = result.status === check.value;
            break;
          case 'response_time':
            const threshold = typeof check.value === 'string' 
              ? parseTime(check.value.replace(/[<>]/g, ''))
              : check.value;
            passed = (result.duration || 0) < threshold;
            break;
          case 'json_path':
            const value = this.getJsonPath(result.data, check.value);
            passed = value !== undefined && value !== null;
            break;
          case 'text_contains':
            const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
            passed = text.includes(check.value);
            break;
          case 'custom':
            passed = await this.checkCustom(check.script!, result, context);
            break;
        }

        if (!passed) {
          errors.push(check.description || `Check failed: ${check.type}`);
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

  private async extractData(
    extractors: ExtractConfig[], 
    result: any, 
    context: VUContext
  ): Promise<void> {
    for (const extractor of extractors) {
      try {
        let value: any;

        switch (extractor.type) {
          case 'json_path':
            value = this.getJsonPath(result.data, extractor.expression);
            break;
          case 'regex':
            const match = String(result.data).match(new RegExp(extractor.expression));
            value = match ? (match[1] || match[0]) : null;
            break;
          case 'custom':
            value = await this.extractCustom(extractor.script!, result, context);
            break;
        }

        if (value !== null && value !== undefined) {
          context.extracted_data[extractor.name] = value;
        } else if (extractor.default !== undefined) {
          context.extracted_data[extractor.name] = extractor.default;
        }
      } catch (error) {
        if (extractor.default !== undefined) {
          context.extracted_data[extractor.name] = extractor.default;
        }
      }
    }
  }

  private async extractCustom(script: string, result: any, context: VUContext): Promise<any> {
    try {
      const fn = new Function('result', 'context', `return ${script}`);
      return fn(result, context);
    } catch (error) {
      return null;
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
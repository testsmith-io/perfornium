import { Step, VUContext, RESTStep } from '../config';
import { ProtocolHandler } from '../protocols/base';
import { TestResult } from '../metrics/types';
import { StepHooksManager } from './hooks-manager';
import { ScriptExecutor } from './script-executor';
import { ThresholdEvaluator } from './threshold-evaluator';
import { RendezvousManager } from './rendezvous';
import { sleep, parseTime } from '../utils/time';
import { TemplateProcessor } from '../utils/template';
import { logger } from '../utils/logger';
import { CheckEvaluator } from './execution/check-evaluator';
import { DataExtractor } from './execution/data-extractor';
import { JSONPayloadProcessor } from './execution/json-payload-processor';

export class StepExecutor {
  private handlers: Map<string, ProtocolHandler>;
  private templateProcessor = new TemplateProcessor();
  private testName: string;

  // Extracted modules
  private checkEvaluator = new CheckEvaluator();
  private dataExtractor = new DataExtractor();
  private jsonPayloadProcessor = new JSONPayloadProcessor();

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

        if (beforeStepResult?.variables) {
          Object.assign(context.variables, beforeStepResult.variables);
          logger.debug(`Hook VU${context.vu_id}: beforeStep hook set variables: ${Object.keys(beforeStepResult.variables).join(', ')}`);
        }
      } catch (error) {
        logger.error(`VU ${context.vu_id} beforeStep hook failed:`, error);
      }
    }

    let testResult: TestResult | undefined;

    try {
      testResult = await this.executeStepInternal(step, context, scenarioName, startTime);
    } catch (error) {
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

      testResult = this.createErrorResult(step, context, scenarioName, startTime, error as Error);
    } finally {
      if (stepHooksManager && testResult) {
        try {
          const teardownResult = await stepHooksManager.executeTeardownStep(
            context.variables,
            context.extracted_data,
            (context as any).csv_data,
            testResult
          );

          if (teardownResult?.variables) {
            Object.assign(context.variables, teardownResult.variables);
          }
        } catch (error) {
          logger.error(`VU ${context.vu_id} teardownStep hook failed:`, error);
        }
      }
    }

    if (!testResult) {
      testResult = this.createErrorResult(step, context, scenarioName, startTime, new Error('Unknown error occurred'));
    }

    // Evaluate thresholds
    if (step.thresholds && step.thresholds.length > 0) {
      try {
        const evaluationResult = ThresholdEvaluator.evaluate(step.thresholds, testResult, stepName);

        if (!evaluationResult.passed) {
          (testResult as any).threshold_failures = evaluationResult.failures;
          await ThresholdEvaluator.executeThresholdActions(evaluationResult, stepName);
        }
      } catch (error) {
        logger.error(`Threshold evaluation failed for step ${stepName}:`, error);
        if (error instanceof Error && error.message.includes('threshold violation')) {
          throw error;
        }
      }
    }

    return testResult;
  }

  private createErrorResult(step: Step, context: VUContext, scenarioName: string, startTime: number, error: Error): TestResult {
    const stepName = step.name || `${step.type}_${context.iteration}`;
    const iteration = context.iteration || 1;
    const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

    return {
      id: `${context.vu_id}-${Date.now()}`,
      vu_id: context.vu_id,
      iteration: context.iteration,
      scenario: scenarioName,
      action: step.name || step.type || 'rest',
      step_name: stepName,
      thread_name: threadName,
      timestamp: startTime,
      duration: Date.now() - startTime,
      success: false,
      error: error.message,
      shouldRecord: true
    };
  }

  public async executeStepInternal(
    step: Step,
    context: VUContext,
    scenarioName: string,
    startTime: number
  ): Promise<TestResult> {
    const processedStep = this.processTemplate(step, context);

    // Check condition if specified
    if (step.condition && !this.evaluateCondition(step.condition, context)) {
      return this.createSkippedResult(step, context, scenarioName, startTime);
    }

    let result: any;
    const stepType = step.type || 'rest';
    logger.debug(`Step type detected: "${stepType}" for step: ${step.name}`);

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
        result = await this.executeWaitStep(processedStep);
        break;
      case 'script':
        result = await this.executeScriptStep(processedStep, context);
        break;
      case 'rendezvous':
        result = await this.executeRendezvousStep(processedStep, context);
        break;
      default:
        throw new Error(`Unsupported step type: ${(step as any).type}`);
    }

    const testResult = this.buildTestResult(step, context, scenarioName, startTime, result);

    // Run checks if configured
    if ('checks' in step && step.checks) {
      const checkResults = await this.checkEvaluator.runChecks(step.checks, result, context);
      if (!checkResults.passed) {
        testResult.success = false;
        testResult.error = checkResults.errors.join('; ');
      }
    }

    // Extract data if configured
    if ('extract' in step && step.extract) {
      await this.dataExtractor.extractData(step.extract, result, context);
    }

    return testResult;
  }

  private createSkippedResult(step: Step, context: VUContext, scenarioName: string, startTime: number): TestResult {
    const stepName = step.name || `${step.type}_${context.iteration}`;
    const iteration = context.iteration || 1;
    const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

    return {
      id: `${context.vu_id}-${Date.now()}`,
      vu_id: context.vu_id,
      iteration: context.iteration,
      scenario: scenarioName,
      action: step.name || step.type || 'rest',
      step_name: stepName,
      thread_name: threadName,
      timestamp: startTime,
      duration: 0,
      success: true,
      custom_metrics: { skipped: true }
    };
  }

  private buildTestResult(step: Step, context: VUContext, scenarioName: string, startTime: number, result: any): TestResult {
    const totalElapsed = Date.now() - startTime;
    const duration = result.response_time !== undefined ? result.response_time : totalElapsed;
    const stepName = step.name || `${step.type}_${context.iteration}`;
    const iteration = context.iteration || 1;
    const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

    return {
      id: `${context.vu_id}-${Date.now()}`,
      vu_id: context.vu_id,
      iteration: context.iteration,
      scenario: scenarioName,
      action: step.name || `${step.type}_action`,
      step_name: stepName,
      thread_name: threadName,
      timestamp: startTime,
      duration,
      response_time: duration,
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
      shouldRecord: result.shouldRecord !== undefined ? result.shouldRecord : this.shouldRecordStep(step, true),
      sample_start: result.sample_start,
      connect_time: result.connect_time,
      latency: result.latency,
      sent_bytes: result.sent_bytes,
      headers_size_sent: result.headers_size_sent,
      body_size_sent: result.body_size_sent,
      headers_size_received: result.headers_size_received,
      body_size_received: result.body_size_received,
      data_type: result.data_type,
    };
  }

  private shouldRecordStep(step: Step, success: boolean): boolean {
    if (!success) return true;

    if (step.type === 'web' && step.action) {
      const measurableCommands = [
        'verify_exists', 'verify_visible', 'verify_text', 'verify_contains', 'verify_not_exists',
        'wait_for_selector', 'wait_for_text',
        'measure_web_vitals', 'performance_audit'
      ];
      return measurableCommands.includes(step.action.command);
    }

    return true;
  }

  private async executeRESTStep(step: any, context: VUContext): Promise<any> {
    const handler = this.handlers.get('rest');
    if (!handler) {
      throw new Error('REST handler not available');
    }

    const processedStep = this.jsonPayloadProcessor.processJsonFile(step, context);
    return handler.execute(processedStep, context);
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

  private async executeWaitStep(step: any): Promise<any> {
    const duration = parseTime(step.duration);
    await sleep(duration);

    return {
      success: true,
      data: { waited: duration },
      custom_metrics: { wait_duration: duration }
    };
  }

  private async executeRendezvousStep(step: any, context: VUContext): Promise<any> {
    const rendezvousManager = RendezvousManager.getInstance();

    let timeoutMs = 30000;
    if (step.timeout !== undefined) {
      if (typeof step.timeout === 'number') {
        timeoutMs = step.timeout;
      } else if (typeof step.timeout === 'string') {
        timeoutMs = parseTime(step.timeout);
      }
    }

    try {
      const result = await rendezvousManager.wait(
        {
          name: step.rendezvous,
          count: step.count,
          timeout: timeoutMs,
          releasePolicy: step.policy || 'all'
        },
        context.vu_id
      );

      return {
        success: true,
        data: {
          rendezvous: step.rendezvous,
          released: result.released,
          reason: result.reason,
          vuCount: result.vuCount
        },
        response_time: result.waitTime,
        custom_metrics: {
          rendezvous_name: step.rendezvous,
          rendezvous_wait_time: result.waitTime,
          rendezvous_reason: result.reason,
          rendezvous_vu_count: result.vuCount
        },
        shouldRecord: true
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        custom_metrics: {
          rendezvous_name: step.rendezvous,
          rendezvous_error: true
        }
      };
    }
  }

  private async executeScriptStep(step: any, context: VUContext): Promise<any> {
    logger.info(`Executing script step: file=${step.file}, function=${step.function}`);
    const { file, function: funcName, params, returns, timeout = 30000 } = step;
    const path = require('path');
    const fs = require('fs');

    try {
      const filePath = path.resolve(process.cwd(), file);

      let module: any;
      try {
        if (filePath.endsWith('.ts')) {
          const esbuild = require('esbuild');
          const source = fs.readFileSync(filePath, 'utf-8');

          const result = esbuild.transformSync(source, {
            loader: 'ts',
            format: 'cjs',
            target: 'node18'
          });

          const Module = require('module');
          const tempModule = new Module(filePath);
          tempModule.filename = filePath;
          const scriptPaths = Module._nodeModulePaths(path.dirname(filePath));
          const cwdPaths = Module._nodeModulePaths(process.cwd());
          tempModule.paths = [...new Set([...scriptPaths, ...cwdPaths])];
          tempModule._compile(result.code, filePath);
          module = tempModule.exports;
        } else {
          delete require.cache[require.resolve(filePath)];
          module = require(filePath);
        }
      } catch (loadError: any) {
        throw new Error(`Failed to load script file '${file}': ${loadError.message}`);
      }

      const fn = module[funcName] || module.default?.[funcName];
      if (typeof fn !== 'function') {
        throw new Error(`Function '${funcName}' not found in '${file}'`);
      }

      const execParams = {
        ...params,
        __context: context,
        __variables: context.variables,
        __extracted_data: context.extracted_data,
        __vu_id: context.vu_id,
        __iteration: context.iteration
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Script execution timeout (${timeout}ms)`)), timeout);
      });

      const resultPromise = Promise.resolve(fn(execParams));
      const result = await Promise.race([resultPromise, timeoutPromise]);

      logger.debug(`Script ${funcName} returned: ${JSON.stringify(result)}`);

      if (returns && result !== undefined) {
        context.extracted_data[returns] = result;
      }

      return {
        success: true,
        data: result,
        custom_metrics: {
          script_file: file,
          script_function: funcName,
          has_return_value: result !== undefined
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        custom_metrics: {
          script_file: file,
          script_function: funcName
        }
      };
    }
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

    logger.debug(`StepExecutor processing template for VU${context.vu_id} Iter${context.iteration}`);
    logger.debug(`Extracted data keys: ${Object.keys(context.extracted_data || {}).join(', ') || '(none)'}`);

    const stepStr = JSON.stringify(step);
    const processed = this.templateProcessor.process(stepStr, contextData);

    try {
      if (typeof processed === 'string') {
        return JSON.parse(processed);
      } else {
        return processed as Step;
      }
    } catch (error) {
      logger.error(`JSON parsing failed in StepExecutor`);
      throw new Error(`Failed to parse processed step JSON: ${error}`);
    }
  }
}

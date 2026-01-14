import { Step, VUContext, CheckConfig, ExtractConfig, RESTStep } from '../config';
import { ProtocolHandler } from '../protocols/base';
import { TestResult } from '../metrics/types';
import { StepHooksManager } from './hooks-manager';
import { ScriptExecutor } from './script-executor';
import { ThresholdEvaluator } from './threshold-evaluator';
import { RendezvousManager } from './rendezvous';
import { sleep, parseTime } from '../utils/time';
import { TemplateProcessor } from '../utils/template';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

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
          logger.debug(`Hook VU${context.vu_id}: beforeStep hook set variables: ${Object.keys(beforeStepResult.variables).join(', ')}`);
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
      const stepName = step.name || `${step.type}_${context.iteration}`;
      const iteration = context.iteration || 1;
      const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

      testResult = {
        id: `${context.vu_id}-${Date.now()}`,
        vu_id: context.vu_id,
        iteration: context.iteration,
        scenario: scenarioName,
        action: step.name || step.type || 'rest' ,
        step_name: stepName,
        thread_name: threadName,
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
      const stepName = step.name || `${step.type}_${context.iteration}`;
      const iteration = context.iteration || 1;
      const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

      testResult = {
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
        error: 'Unknown error occurred',
        shouldRecord: true
      };
    }

    // Evaluate thresholds if they are defined for this step
    if (step.thresholds && step.thresholds.length > 0) {
      try {
        const evaluationResult = ThresholdEvaluator.evaluate(
          step.thresholds,
          testResult,
          stepName
        );
        
        if (!evaluationResult.passed) {
          // Add threshold failures to test result
          (testResult as any).threshold_failures = evaluationResult.failures;
          
          // Execute threshold actions (may throw errors for fail actions)
          await ThresholdEvaluator.executeThresholdActions(evaluationResult, stepName);
        }
      } catch (error) {
        logger.error(`Threshold evaluation failed for step ${stepName}:`, error);
        
        // If threshold action is to fail, we re-throw the error
        if (error instanceof Error && error.message.includes('threshold violation')) {
          throw error;
        }
      }
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

    // Use response_time from handler if available (e.g., web actions with action_time)
    // Otherwise fall back to total elapsed time
    const totalElapsed = Date.now() - startTime;
    const duration = result.response_time !== undefined ? result.response_time : totalElapsed;
    const stepName = step.name || `${step.type}_${context.iteration}`;

    // Generate JMeter-style thread name: "iteration. step_name vu_id-iteration"
    const iteration = context.iteration || 1;
    const threadName = `${iteration}. ${stepName} ${context.vu_id}-${iteration}`;

    const testResult: TestResult = {
      id: `${context.vu_id}-${Date.now()}`,
      vu_id: context.vu_id,
      iteration: context.iteration,
      scenario: scenarioName,
      action: step.name || `${step.type}_action`,
      step_name: stepName,
      thread_name: threadName,
      timestamp: startTime,
      duration,
      response_time: duration,  // Add explicit response_time for reporting
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

      // JMeter-style timing breakdown
      sample_start: result.sample_start,
      connect_time: result.connect_time,
      latency: result.latency,

      // JMeter-style size breakdown
      sent_bytes: result.sent_bytes,
      headers_size_sent: result.headers_size_sent,
      body_size_sent: result.body_size_sent,
      headers_size_received: result.headers_size_received,
      body_size_received: result.body_size_received,
      data_type: result.data_type,
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

    // For web steps, only record meaningful performance measurements:
    // - Verifications (verify_*) - time for elements/text to appear (measures app responsiveness)
    // - Waits (wait_for_*) - time for conditions to be met
    // - Performance measurements (measure_*, performance_audit)
    // NOT recorded: goto, click, fill, press, select, hover, screenshot (navigation/interactions)
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

    // Handle jsonFile loading with optional overrides
    const processedStep = this.processJsonFile(step, context);

    return handler.execute(processedStep, context);
  }

  /**
   * Load JSON payload from file and apply overrides
   * Supports dot notation for nested paths in overrides
   */
  private processJsonFile(step: RESTStep, context: VUContext): RESTStep {
    if (!step.jsonFile) {
      return step;
    }

    // Resolve file path relative to CWD
    const filePath = path.resolve(process.cwd(), step.jsonFile);

    if (!fs.existsSync(filePath)) {
      throw new Error(`JSON payload file not found: ${step.jsonFile}`);
    }

    // Load and parse JSON file
    let payload: any;
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      payload = JSON.parse(fileContent);
    } catch (error: any) {
      throw new Error(`Failed to parse JSON file ${step.jsonFile}: ${error.message}`);
    }

    // Apply overrides if specified
    if (step.overrides) {
      payload = this.applyOverrides(payload, step.overrides, context);
    }

    // Return new step with json property set (removing jsonFile and overrides)
    const { jsonFile, overrides, ...restOfStep } = step;
    return {
      ...restOfStep,
      json: payload
    };
  }

  /**
   * Apply overrides to a JSON object using dot notation for nested paths
   * Override values are processed through the template processor
   */
  private applyOverrides(obj: any, overrides: Record<string, any>, context: VUContext): any {
    // Deep clone the object to avoid mutating the original
    const result = JSON.parse(JSON.stringify(obj));

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

    for (const [path, value] of Object.entries(overrides)) {
      // Process template expressions in override values
      let processedValue = value;
      if (typeof value === 'string') {
        processedValue = this.templateProcessor.process(value, contextData);
        // Try to parse as JSON if it looks like a number, boolean, or object
        if (processedValue === 'true') processedValue = true;
        else if (processedValue === 'false') processedValue = false;
        else if (!isNaN(Number(processedValue)) && processedValue !== '') {
          processedValue = Number(processedValue);
        }
      }

      this.setNestedValue(result, path, processedValue);
    }

    return result;
  }

  /**
   * Set a value at a nested path using dot notation
   * Example: setNestedValue(obj, 'user.profile.name', 'John')
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // Handle array indices like 'items[0]'
      const arrayMatch = key.match(/^(.+)\[(\d+)]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        if (!current[prop]) current[prop] = [];
        if (!current[prop][parseInt(index)]) current[prop][parseInt(index)] = {};
        current = current[prop][parseInt(index)];
      } else {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
    }

    const lastKey = keys[keys.length - 1];

    // Handle array index in last key
    const arrayMatch = lastKey.match(/^(.+)\[(\d+)]$/);
    if (arrayMatch) {
      const [, prop, index] = arrayMatch;
      if (!current[prop]) current[prop] = [];
      current[prop][parseInt(index)] = value;
    } else {
      current[lastKey] = value;
    }
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

    // Parse timeout - can be number (ms) or string ("30s", "1m")
    let timeoutMs = 30000; // Default 30 seconds
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
        shouldRecord: true // Always record rendezvous timing
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
    logger.info(`📜 Executing script step: file=${step.file}, function=${step.function}`);
    const { file, function: funcName, params, returns, timeout = 30000 } = step;
    const path = require('path');
    const fs = require('fs');

    try {
      // Resolve file path relative to current working directory
      const filePath = path.resolve(process.cwd(), file);

      // Load the module (supports both .ts and .js)
      let module: any;
      try {
        if (filePath.endsWith('.ts')) {
          // Transpile TypeScript on the fly using esbuild
          const esbuild = require('esbuild');
          const source = fs.readFileSync(filePath, 'utf-8');

          const result = esbuild.transformSync(source, {
            loader: 'ts',
            format: 'cjs',
            target: 'node18'
          });

          // Create a temporary module from the transpiled code
          const Module = require('module');
          const tempModule = new Module(filePath);
          tempModule.filename = filePath;
          // Include both script dir and cwd node_modules for dependency resolution
          const scriptPaths = Module._nodeModulePaths(path.dirname(filePath));
          const cwdPaths = Module._nodeModulePaths(process.cwd());
          tempModule.paths = [...new Set([...scriptPaths, ...cwdPaths])];
          tempModule._compile(result.code, filePath);
          module = tempModule.exports;
        } else {
          // For JS files, clear require cache and load directly
          delete require.cache[require.resolve(filePath)];
          module = require(filePath);
        }
      } catch (loadError: any) {
        throw new Error(`Failed to load script file '${file}': ${loadError.message}`);
      }

      // Get the function from the module
      const fn = module[funcName] || module.default?.[funcName];
      if (typeof fn !== 'function') {
        throw new Error(`Function '${funcName}' not found in '${file}'`);
      }

      // Build parameters with context available
      const execParams = {
        ...params,
        __context: context,
        __variables: context.variables,
        __extracted_data: context.extracted_data,
        __vu_id: context.vu_id,
        __iteration: context.iteration
      };

      // Execute the function with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Script execution timeout (${timeout}ms)`)), timeout);
      });

      const resultPromise = Promise.resolve(fn(execParams));
      const result = await Promise.race([resultPromise, timeoutPromise]);

      logger.debug(`Script ${funcName} returned: ${JSON.stringify(result)}`);

      // Store return value if specified
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
    logger.debug(`Context data keys at top level: ${Object.keys(contextData).join(', ')}`);

    const stepStr = JSON.stringify(step);
    logger.debug(`Original step JSON: ${stepStr}`);

    const processed = this.templateProcessor.process(stepStr, contextData);
    logger.debug(`Raw processed result: ${processed}`);
    logger.debug(`Processed result type: ${typeof processed}`);
    
    let processedStep: Step;
    
    try {
      if (typeof processed === 'string') {
        processedStep = JSON.parse(processed);
      } else {
        processedStep = processed as Step;
      }
    } catch (error) {
      logger.error(`JSON parsing failed in StepExecutor`);
      logger.error(`Processed content (first 500 chars): ${processed.substring(0, 500)}`);
      logger.error(`Error: ${error}`);

      throw new Error(`Failed to parse processed step JSON: ${error}`);
    }

    logger.debug(`Successfully parsed step: ${JSON.stringify(processedStep)}`);
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

        // Normalize type: accept both "jsonpath" and "json_path"
        const extractType = (extractor.type || 'jsonpath').toLowerCase().replace('_', '');
        // Normalize expression: accept both "path" and "expression"
        const expression = (extractor as any).expression || (extractor as any).path;

        switch (extractType) {
          case 'jsonpath':
            value = this.getJsonPath(result.data, expression);
            break;
          case 'regex':
            const match = String(result.data).match(new RegExp(expression));
            value = match ? (match[1] || match[0]) : null;
            break;
          case 'header':
            value = result.headers?.[expression.toLowerCase()];
            break;
          case 'custom':
            value = await this.extractCustom(extractor.script!, result, context);
            break;
          default:
            // Default to jsonpath if type not recognized but path/expression provided
            if (expression) {
              value = this.getJsonPath(result.data, expression);
            }
        }

        if (value !== null && value !== undefined) {
          context.extracted_data[extractor.name] = value;
          logger.debug(`Extracted ${extractor.name} = ${JSON.stringify(value)}`);
        } else if (extractor.default !== undefined) {
          context.extracted_data[extractor.name] = extractor.default;
        }
      } catch (error) {
        logger.debug(`Extraction failed for ${extractor.name}: ${error}`);
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
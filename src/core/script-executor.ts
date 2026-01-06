import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {logger} from '../utils/logger';
import {HookScript, ScriptContext, ScriptResult} from '../config/types/hooks';
import {VUContext} from '../config';

export class ScriptExecutor {
  private static baseDir: string = process.cwd();
  private static scriptCache: Map<string, Function> = new Map();
  private static stepExecutor?: any;

  static setStepExecutor(stepExecutor: any): void {
    ScriptExecutor.stepExecutor = stepExecutor;
  }

  // Add the createContext static method
  static createContext(
    testName: string,
    vuId: number,
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>,
    additionalContext?: Partial<ScriptContext>
  ): ScriptContext {
    return {
      test_name: testName,
      vu_id: vuId,
      variables: { ...variables },
      extracted_data: { ...extractedData },
      csv_data: csvData ? { ...csvData } : undefined,
      ...additionalContext
    };
  }

  static async executeHookScript(
    script: HookScript,
    context: ScriptContext,
    hookName: string
  ): Promise<ScriptResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Executing ${hookName} hook for VU${context.vu_id}`);
      
      let result: any;
      
      switch (script.type) {
        case 'inline':
          if (!script.content) {
            throw new Error('Inline script content is required');
          }
          result = await ScriptExecutor.executeInlineScript(script.content, context);
          break;
        case 'file':
          if (!script.file) {
            throw new Error('File script path is required');
          }
          result = await ScriptExecutor.executeFileScript(script.file, context, hookName);
          break;
        case 'steps':
          if (!script.steps || script.steps.length === 0) {
            throw new Error('Steps script requires at least one step');
          }
          result = await ScriptExecutor.executeStepsScript(script.steps, context, hookName);
          break;
        default:
          throw new Error(`Invalid script type: ${script.type}`);
      }
      
      const duration = Date.now() - startTime;
      
      logger.debug(`${hookName} hook completed in ${duration}ms for VU${context.vu_id}`);
      
      return {
        success: true,
        result: result.value || result,
        duration,
        variables: result.variables || {}
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`${hookName} hook failed for VU${context.vu_id}:`, error);
      
      const shouldContinue = script.continueOnError !== false;
      
      if (!shouldContinue) {
        throw error;
      }
      
      return {
        success: false,
        error: error as Error,
        duration
      };
    }
  }

  private static async executeInlineScript(content: string, context: ScriptContext): Promise<any> {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    
    const wrappedContent = `
      let returnValue = undefined;
      let variables = {};
      
      function setVariable(key, value) {
        variables[key] = value;
        context.variables[key] = value;
      }
      
      function getVariable(key) {
        return context.variables[key] || context.extracted_data[key] || context.csv_data?.[key];
      }
      
      const utils = {
        randomInt: (min = 1, max = 100) => Math.floor(Math.random() * (max - min + 1)) + min,
        randomChoice: (...choices) => choices[Math.floor(Math.random() * choices.length)],
        uuid: () => require('crypto').randomUUID(),
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        timestamp: () => Date.now(),
        isoDate: (days = 0) => {
          const date = new Date();
          date.setDate(date.getDate() + days);
          return date.toISOString();
        }
      };
      
      try {
        ${content}
      } catch (error) {
        throw new Error(\`Script execution failed: \${error.message}\`);
      }
      
      return { value: returnValue, variables };
    `;
    
    const compiledFunction = new AsyncFunction(
      'context', 'require', 'console', 'logger',
      wrappedContent
    );

    const timeout = 30000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Hook script timeout after ${timeout}ms`)), timeout);
    });
    
    return Promise.race([
      compiledFunction(context, require, console, logger),
      timeoutPromise
    ]);
  }

  private static async executeFileScript(filePath: string, context: ScriptContext, hookName: string): Promise<any> {
    const fullPath = path.resolve(ScriptExecutor.baseDir, filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Script file not found: ${fullPath}`);
    }
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Handle TypeScript files (basic transpilation)
    if (filePath.endsWith('.ts')) {
      content = ScriptExecutor.transpileTypeScript(content, filePath);
    }
    
    // Determine if it's a module export or direct script
    const isModule = content.includes('module.exports') || content.includes('export');
    
    if (isModule) {
      // Handle as module
      const tempFilePath = path.join(os.tmpdir(), `hook-${Date.now()}-${Math.random().toString(36).substring(7)}.js`);
      fs.writeFileSync(tempFilePath, content);
      
      try {
        delete require.cache[tempFilePath];
        const moduleExports = require(tempFilePath);
        
        let hookFunction: (arg0: ScriptContext, arg1: { setVariable: (key: string, value: any) => void; getVariable: (key: string) => any; utils: { randomInt: (min?: number, max?: number) => number; randomChoice: (...choices: any[]) => any; uuid: () => any; sleep: (ms: number) => Promise<unknown>; timestamp: () => number; isoDate: (days?: number) => string; }; }) => any;
        if (typeof moduleExports === 'function') {
          hookFunction = moduleExports;
        } else if (moduleExports.default && typeof moduleExports.default === 'function') {
          hookFunction = moduleExports.default;
        } else {
          throw new Error('Module must export a function');
        }
        
        // Execute the hook function with helper utilities
        const helpers = {
          setVariable: (key: string, value: any) => { 
            context.variables[key] = value; 
          },
          getVariable: (key: string) => context.variables[key] || context.extracted_data[key] || context.csv_data?.[key],
          utils: {
            randomInt: (min = 1, max = 100) => Math.floor(Math.random() * (max - min + 1)) + min,
            randomChoice: (...choices: any[]) => choices[Math.floor(Math.random() * choices.length)],
            uuid: () => require('crypto').randomUUID(),
            sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
            timestamp: () => Date.now(),
            isoDate: (days = 0) => {
              const date = new Date();
              date.setDate(date.getDate() + days);
              return date.toISOString();
            }
          }
        };
        
        const result = await hookFunction(context, helpers);
        
        return {
          value: result,
          variables: {} // Variables are set directly on context through helpers
        };
        
      } finally {
        // Cleanup temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } else {
      // Handle as direct script (same as inline)
      return ScriptExecutor.executeInlineScript(content, context);
    }
  }

 private static async executeStepsScript(steps: any[], context: ScriptContext, hookName: string): Promise<any> {
  if (!ScriptExecutor.stepExecutor) {
    throw new Error('StepExecutor not configured for hook step execution');
  }
  
  const results = [];
  
  // Create a temporary VU context from script context
  const vuContext: VUContext = {
    vu_id: context.vu_id,
    iteration: context.loop_iteration || 0,
    variables: { ...context.variables },
    extracted_data: { ...context.extracted_data }
  };
  
  for (const step of steps) {
    try {
      logger.debug(`Executing hook step: ${step.name || step.type}`);
      const result = await ScriptExecutor.stepExecutor.executeStepInternal(
        step, 
        vuContext, 
        context.scenario_name || 'hook',
        Date.now()
      );
      
      results.push({
        stepName: step.name || step.type,
        success: result.success,
        duration: result.duration,
        error: result.error
      });
      
      // CRITICAL FIX: Update both context objects with extracted data
      Object.assign(context.variables, vuContext.variables);
      Object.assign(context.extracted_data, vuContext.extracted_data);
      
      // Log what was extracted for debugging
      if (Object.keys(vuContext.extracted_data).length > 0) {
        logger.debug(`VU${context.vu_id}: Hook step extracted data: ${Object.keys(vuContext.extracted_data).join(', ')}`);
        logger.debug(`VU${context.vu_id}: Extracted values: ${JSON.stringify(vuContext.extracted_data)}`);
      }
      
    } catch (error) {
      results.push({
        stepName: step.name || step.type,
        success: false,
        error: (error as Error).message
      });
      
      // Continue with next step unless continueOnError is false
      if (step.continueOnError === false) {
        throw error;
      }
    }
  }
  
  return {
    value: results,
    variables: { 
      ...vuContext.variables, 
      ...vuContext.extracted_data  // CRITICAL: Include extracted data in returned variables
    }
  };
}

  private static transpileTypeScript(content: string, filePath: string): string {
    // Basic TypeScript to JavaScript transpilation
    return content
      .replace(/:\s*\w+(\[\])?(\s*\|\s*\w+(\[\])?)*\s*[=;,)]/g, (match) => {
        return match.slice(-1);
      })
      .replace(/interface\s+\w+\s*{[^}]*}/g, '')
      .replace(/type\s+\w+\s*=\s*[^;]+;/g, '')
      .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '')
      .replace(/export\s+/g, '');
  }

  static clearCache(): void {
    ScriptExecutor.scriptCache.clear();
    logger.info('Script cache cleared');
  }
}
import {
  TestHooks, VUHooks, ScenarioHooks, LoopHooks, StepHooks, ScriptResult
} from '../config/types/hooks';
import { ScriptExecutor } from './script-executor';
import { logger } from '../utils/logger';

export class VUHooksManager {
  private vuHooks?: VUHooks;
  private vuId: number;
  private testName: string;

  constructor(testName: string, vuId: number, vuHooks?: VUHooks) {
    this.testName = testName;
    this.vuId = vuId;
    this.vuHooks = vuHooks;
  }

  async executeBeforeVU(
    variables: Record<string, any>,
    extractedData: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.vuHooks?.beforeVU) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData
    );

    return await ScriptExecutor.executeHookScript(
      this.vuHooks.beforeVU,
      context,
      'beforeVU'
    );
  }

  async executeTeardownVU(
    variables: Record<string, any>,
    extractedData: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.vuHooks?.teardownVU) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData
    );

    return await ScriptExecutor.executeHookScript(
      this.vuHooks.teardownVU,
      context,
      'teardownVU'
    );
  }
}

export class ScenarioHooksManager {
  private scenarioHooks?: ScenarioHooks & LoopHooks;
  private vuId: number;
  private testName: string;
  private scenarioName: string;
  private scenarioStartTime: number = 0;

  constructor(
    testName: string, 
    vuId: number, 
    scenarioName: string, 
    hooks?: ScenarioHooks & LoopHooks
  ) {
    this.testName = testName;
    this.vuId = vuId;
    this.scenarioName = scenarioName;
    this.scenarioHooks = hooks;
  }

  async executeBeforeScenario(
  variables: Record<string, any>,
  extractedData: Record<string, any>,
  csvData?: Record<string, any>
): Promise<ScriptResult | null> {
  if (!this.scenarioHooks?.beforeScenario) return null;
  
  this.scenarioStartTime = Date.now();
  
  const context = ScriptExecutor.createContext(
    this.testName,
    this.vuId,
    variables,
    extractedData,
    csvData,
    {
      scenario_name: this.scenarioName,
      scenario_start_time: this.scenarioStartTime
    }
  );

  const result = await ScriptExecutor.executeHookScript(
    this.scenarioHooks.beforeScenario,
    context,
    'beforeScenario'
  );

  // CRITICAL FIX: Merge both returned variables AND the context's extracted_data
  if (result?.success) {
    // Merge variables returned from the hook
    if (result.variables) {
      Object.assign(variables, result.variables);
    }
    
    // IMPORTANT: Also merge the context's extracted_data back into the main extracted_data
    Object.assign(extractedData, context.extracted_data);

    logger.debug(`VU${this.vuId}: beforeScenario extracted data: ${Object.keys(context.extracted_data).join(', ')}`);
    logger.debug(`VU${this.vuId}: beforeScenario extracted values: ${JSON.stringify(context.extracted_data)}`);
  }

  return result;
}

  async executeTeardownScenario(
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.scenarioHooks?.teardownScenario) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        scenario_start_time: this.scenarioStartTime
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.scenarioHooks.teardownScenario,
      context,
      'teardownScenario'
    );
  }

  async executeBeforeLoop(
    loopIteration: number,
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.scenarioHooks?.beforeLoop) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        loop_iteration: loopIteration,
        loop_start_time: Date.now()
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.scenarioHooks.beforeLoop,
      context,
      'beforeLoop'
    );
  }

  async executeAfterLoop(
    loopIteration: number,
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.scenarioHooks?.afterLoop) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        loop_iteration: loopIteration
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.scenarioHooks.afterLoop,
      context,
      'afterLoop'
    );
  }
}

export class StepHooksManager {
  private stepHooks?: StepHooks;
  private vuId: number;
  private testName: string;
  private scenarioName: string;
  private stepName: string;
  private stepType: string;

  constructor(
    testName: string,
    vuId: number,
    scenarioName: string,
    stepName: string,
    stepType: string,
    hooks?: StepHooks
  ) {
    this.testName = testName;
    this.vuId = vuId;
    this.scenarioName = scenarioName;
    this.stepName = stepName;
    this.stepType = stepType;
    this.stepHooks = hooks;
  }

  async executeBeforeStep(
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.stepHooks?.beforeStep) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        step_name: this.stepName,
        step_type: this.stepType,
        step_start_time: Date.now()
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.stepHooks.beforeStep,
      context,
      'beforeStep'
    );
  }

  async executeOnStepError(
    error: Error,
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>
  ): Promise<ScriptResult | null> {
    if (!this.stepHooks?.onStepError) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        step_name: this.stepName,
        step_type: this.stepType,
        error
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.stepHooks.onStepError,
      context,
      'onStepError'
    );
  }

  async executeTeardownStep(
    variables: Record<string, any>,
    extractedData: Record<string, any>,
    csvData?: Record<string, any>,
    stepResult?: any
  ): Promise<ScriptResult | null> {
    if (!this.stepHooks?.teardownStep) return null;
    
    const context = ScriptExecutor.createContext(
      this.testName,
      this.vuId,
      variables,
      extractedData,
      csvData,
      {
        scenario_name: this.scenarioName,
        step_name: this.stepName,
        step_type: this.stepType,
        last_step_result: stepResult
      }
    );

    return await ScriptExecutor.executeHookScript(
      this.stepHooks.teardownStep,
      context,
      'teardownStep'
    );
  }
}
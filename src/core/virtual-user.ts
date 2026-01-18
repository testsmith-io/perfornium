import { Scenario, VUHooks } from '../config/types/hooks';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { StepExecutor } from './step-executor';
import { VUHooksManager, ScenarioHooksManager } from './hooks-manager';
import { logger } from '../utils/logger';
import { VUContext } from '../config';
import { DataManager, DataOptions, DataContext, DataRow } from './data';
import { ThinkTimeStrategy, ScenarioSelector } from './strategies';

// Extended context interface that includes optional CSV data
interface EnhancedVUContext extends VUContext, DataContext {}

// Re-export for backward compatibility
export { DataOptions as GlobalCSVOptions } from './data';
export type { DataRow as CSVDataRow } from './data';

export class VirtualUser {
  private id: number;
  private context: EnhancedVUContext;
  private metrics: MetricsCollector;
  private stepExecutor: StepExecutor;
  private isActive: boolean = true;
  private scenarios: Scenario[] = [];

  // Managers and strategies
  private vuHooksManager: VUHooksManager;
  private dataManager: DataManager;
  private thinkTimeStrategy: ThinkTimeStrategy;
  private scenarioSelector: ScenarioSelector;

  private testName: string;
  private handlers: Map<string, ProtocolHandler>;

  constructor(
    id: number,
    metrics: MetricsCollector,
    handlers: Map<string, ProtocolHandler>,
    testName: string = 'Load Test',
    vuHooks?: VUHooks,
    globalThinkTime?: string | number,
    globalCSV?: DataOptions
  ) {
    logger.debug(`VirtualUser ${id} created`);
    this.id = id;
    this.metrics = metrics;
    this.handlers = handlers;
    this.testName = testName;
    this.stepExecutor = new StepExecutor(handlers, testName);
    this.vuHooksManager = new VUHooksManager(testName, id, vuHooks);

    // Initialize managers and strategies
    this.dataManager = new DataManager(id, globalCSV);
    this.thinkTimeStrategy = new ThinkTimeStrategy(globalThinkTime);
    this.scenarioSelector = new ScenarioSelector();

    this.context = {
      vu_id: id,
      iteration: 0,
      variables: {},
      extracted_data: {}
    };
  }

  async setScenarios(scenarios: Scenario[]): Promise<void> {
    logger.debug(`VU${this.id}: setScenarios called with ${scenarios.length} scenarios`);
    this.scenarios = scenarios;

    for (const scenario of scenarios) {
      logger.debug(`VU${this.id}: Scenario "${scenario.name}" config: ${JSON.stringify(scenario, null, 2)}`);
    }

    await this.dataManager.initializeForScenarios(scenarios);
    logger.debug(`VU${this.id}: setScenarios completed`);
  }

  async executeScenarios(): Promise<void> {
    if (!this.isActive || this.scenarios.length === 0) {
      return;
    }

    // Load global CSV data first (available to all scenarios)
    const globalCsvLoaded = await this.dataManager.loadGlobalData(this.context);
    if (!globalCsvLoaded) {
      logger.warn(`📊 VU ${this.id}: Stopping due to global CSV exhaustion`);
      await this.stop();
      return;
    }

    // Execute beforeVU hook
    try {
      const beforeVUResult = await this.vuHooksManager.executeBeforeVU(
        this.context.variables,
        this.context.extracted_data
      );

      if (beforeVUResult?.variables) {
        Object.assign(this.context.variables, beforeVUResult.variables);
        logger.debug(`VU${this.id}: beforeVU hook set variables: ${Object.keys(beforeVUResult.variables).join(', ')}`);
      }
    } catch (error) {
      logger.error(`❌ VU ${this.id} beforeVU hook failed:`, error);
    }

    try {
      const selectedScenarios = this.scenarioSelector.selectScenarios(this.scenarios);

      for (const scenario of selectedScenarios) {
        if (!this.isActive) break;

        try {
          await this.executeScenario(scenario);
        } catch (error) {
          logger.error(`❌ VU ${this.id} failed executing scenario ${scenario.name}:`, error);
          this.metrics.recordError(this.id, scenario.name, 'scenario', error as Error);
        }
      }
    } finally {
      try {
        await this.vuHooksManager.executeTeardownVU(
          this.context.variables,
          this.context.extracted_data
        );
      } catch (error) {
        logger.error(`❌ VU ${this.id} teardownVU hook failed:`, error);
      }
    }
  }

 async executeScenario(scenario: Scenario): Promise<void> {
  // Handle both number and LoopConfig for backwards compatibility
  const loops = typeof scenario.loop === 'number' ? scenario.loop : (scenario.loop?.count || 1);

  logger.debug(`VU ${this.id} executing scenario: ${scenario.name} (${loops} loops)`);
  logger.debug(`Scenario variables: ${JSON.stringify(scenario.variables)}`);

  // Process scenario variables and store in context
  if (scenario.variables) {
    logger.debug(`Processing ${Object.keys(scenario.variables).length} scenario variables`);
    for (const [key, value] of Object.entries(scenario.variables)) {
      this.context.variables[key] = value;
      logger.debug(`Set variable: ${key} = ${value}`);
    }
  }

  // Load CSV data if this scenario uses it (completely optional)
  logger.debug(`About to load CSV data if needed...`);
  const csvLoaded = await this.dataManager.loadScenarioData(scenario, this.context);
  if (!csvLoaded) {
    logger.debug(`VU${this.id}: CSV data exhausted for scenario "${scenario.name}" - stopping`);
    await this.stop();
    throw new Error(`VU${this.id} terminated due to CSV data exhaustion in scenario "${scenario.name}"`);
  }
  logger.debug(`CSV data loading completed`);

  logger.debug(`Context variables after CSV setup: ${JSON.stringify(this.context.variables)}`);

  // Create scenario hooks manager
  const scenarioHooksManager = new ScenarioHooksManager(
    this.testName,
    this.id,
    scenario.name,
    (scenario as any).hooks
  );

  // Execute beforeScenario hook
  try {
    const beforeScenarioResult = await scenarioHooksManager.executeBeforeScenario(
      this.context.variables,
      this.context.extracted_data,
      this.context.csv_data
    );

    // CRITICAL FIX: The hook manager should have updated the objects by reference
    // But let's also merge any returned variables to be safe
    if (beforeScenarioResult?.variables) {
      Object.assign(this.context.variables, beforeScenarioResult.variables);
      logger.debug(`VU${this.id}: beforeScenario hook merged additional variables: ${Object.keys(beforeScenarioResult.variables).join(', ')}`);
    }

    // Debug: Show what's in context after beforeScenario
    logger.debug(`VU${this.id}: Variables after beforeScenario: ${Object.keys(this.context.variables).join(', ')}`);
    logger.debug(`VU${this.id}: Extracted data after beforeScenario: ${Object.keys(this.context.extracted_data).join(', ')}`);
    logger.debug(`VU${this.id}: Extracted data values: ${JSON.stringify(this.context.extracted_data)}`);
    
  } catch (error) {
    logger.error(`❌ VU ${this.id} beforeScenario hook failed:`, error);
    // You might want to return here if authentication is critical
    if ((scenario as any).hooks?.beforeScenario?.continueOnError === false) {
      throw error;
    }
  }
   
  // Legacy support: Run setup if configured (deprecated - use hooks.beforeScenario)
  if (scenario.setup && !(scenario as any).hooks?.beforeScenario) {
    await this.executeSetup(scenario.setup);
  }

  try {
    for (let iteration = 0; iteration < loops; iteration++) {
      if (!this.isActive) break;
      
      this.context.iteration = iteration;
      
      logger.debug(`🔁 VU ${this.id} scenario ${scenario.name} iteration ${iteration + 1}/${loops}`);

      // Execute beforeLoop hook
      try {
        const beforeLoopResult = await scenarioHooksManager.executeBeforeLoop(
          iteration,
          this.context.variables,
          this.context.extracted_data,
          this.context.csv_data
        );

        if (beforeLoopResult?.variables) {
          Object.assign(this.context.variables, beforeLoopResult.variables);
        }
      } catch (error) {
        logger.error(`❌ VU ${this.id} beforeLoop hook failed:`, error);
      }
      
      // Start iteration tracking for data manager (handles change_policy)
      this.dataManager.startIteration(iteration);
      
      try {
        // Execute all steps in sequence
        for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
          if (!this.isActive) break;

          const step = scenario.steps[stepIndex];

          // Debug: Show context before each step
          logger.debug(`VU${this.id}: About to execute step "${step.name || step.type}"`);
          logger.debug(`VU${this.id}: Available variables: ${Object.keys(this.context.variables).join(', ')}`);
          logger.debug(`VU${this.id}: Available extracted_data: ${Object.keys(this.context.extracted_data).join(', ')}`);

          try {
            const result = await this.stepExecutor.executeStep(step, this.context, scenario.name);

            if (result.shouldRecord) {
              this.metrics.recordResult(result);
            }

            // Apply hierarchical think time: step > scenario > global
            // Skip think time if the NEXT step is a verification/wait step
            const nextStep = scenario.steps[stepIndex + 1] as any;

            if (!this.thinkTimeStrategy.shouldSkipThinkTime(nextStep)) {
              const effectiveThinkTime = this.thinkTimeStrategy.getEffectiveThinkTime(step, scenario);
              if (effectiveThinkTime !== undefined) {
                await this.thinkTimeStrategy.applyThinkTime(effectiveThinkTime);
              }
            }

          } catch (error) {
            logger.error(`❌ VU ${this.id} step failed:`, error);
            this.metrics.recordError(this.id, scenario.name, step.name || step.type || 'rest', error as Error);
          }
        }

        // Execute afterLoop hook
        try {
          await scenarioHooksManager.executeAfterLoop(
            iteration,
            this.context.variables,
            this.context.extracted_data,
            this.context.csv_data
          );
        } catch (error) {
          logger.error(`❌ VU ${this.id} afterLoop hook failed:`, error);
        }
      } catch (error) {
        // Execute afterLoop hook even on error
        try {
          await scenarioHooksManager.executeAfterLoop(
            iteration,
            this.context.variables,
            this.context.extracted_data,
            this.context.csv_data
          );
        } catch (hookError) {
          logger.error(`❌ VU ${this.id} afterLoop hook failed during error handling:`, hookError);
        }
        throw error;
      }
      
      // End iteration tracking (releases checked-out data for unique scope)
      this.dataManager.endIteration(iteration);

      // Think time between iterations (except after last iteration)
      if (iteration < loops - 1) {
        await this.thinkTimeStrategy.applyThinkTime(scenario.think_time);
      }
    }
  } finally {
    // Execute teardownScenario hook
    try {
      await scenarioHooksManager.executeTeardownScenario(
        this.context.variables,
        this.context.extracted_data,
        this.context.csv_data
      );
    } catch (error) {
      logger.error(`❌ VU ${this.id} teardownScenario hook failed:`, error);
    }

    // Legacy support: Run teardown if configured (deprecated - use hooks.teardownScenario)
    if (scenario.teardown && !(scenario as any).hooks?.teardownScenario) {
      await this.executeTeardown(scenario.teardown);
    }
  }
  }

  private async executeSetup(setupScript: string): Promise<void> {
    try {
      await this.executeScript(setupScript, 'setup');
    } catch (error) {
      logger.warn(`⚠️ VU ${this.id} setup script failed:`, error);
    }
  }

  private async executeTeardown(teardownScript: string): Promise<void> {
    try {
      await this.executeScript(teardownScript, 'teardown');
    } catch (error) {
      logger.warn(`⚠️ VU ${this.id} teardown script failed:`, error);
    }
  }

  private async executeScript(script: string, type: string): Promise<any> {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('context', 'require', 'console', script);
    
    const timeout = 30000; // 30 seconds timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${type} script timeout`)), timeout);
    });
    
    return Promise.race([
      fn(this.context, require, console),
      timeoutPromise
    ]);
  }

  async stop(): Promise<void> {
    this.isActive = false;
    logger.debug(`⏹️ VU ${this.id} stopping...`);

    // Clean up browser resources if WebHandler exists
    const webHandler = this.handlers.get('web');
    if (webHandler && typeof (webHandler as any).cleanupVU === 'function') {
      try {
        await (webHandler as any).cleanupVU(this.id);
        logger.debug(`🧹 VU ${this.id}: Browser cleanup completed`);
      } catch (error) {
        logger.warn(`⚠️ VU ${this.id}: Error during browser cleanup:`, error);
      }
    }

    logger.debug(`⏹️ VU ${this.id} stopped`);
  }

  getId(): number {
    return this.id;
  }

  isRunning(): boolean {
    return this.isActive;
  }
}
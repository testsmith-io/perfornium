import { Scenario, VUHooks } from '../config/types/hooks';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { StepExecutor } from './step-executor';
import { CSVDataProvider, CSVDataRow, CSVDataConfig } from './csv-data-provider';
import { VUHooksManager, ScenarioHooksManager } from './hooks-manager';
import { sleep, randomBetween, parseTime } from '../utils/time';
import { logger } from '../utils/logger';
import { VUContext } from '../config';
import { GlobalCSVConfig } from '../config';

// Extended context interface that includes optional CSV data
interface EnhancedVUContext extends VUContext {
  csv_data?: CSVDataRow;
  global_csv_data?: CSVDataRow;  // Separate storage for global CSV
}

// Global CSV configuration passed to VirtualUser
export interface GlobalCSVOptions {
  config: GlobalCSVConfig;
  mode?: 'next' | 'unique' | 'random';
}

export class VirtualUser {
  private id: number;
  private context: EnhancedVUContext;
  private metrics: MetricsCollector;
  private stepExecutor: StepExecutor;
  private isActive: boolean = true;
  private scenarios: Scenario[] = [];
  private csvProviders: Map<string, CSVDataProvider> = new Map();

  // Add hooks support
  private vuHooksManager: VUHooksManager;
  private testName: string;
  private handlers: Map<string, ProtocolHandler>;
  private globalThinkTime?: string | number; // Store global think time

  // Global CSV support
  private globalCSVProvider?: CSVDataProvider;
  private globalCSVMode?: 'next' | 'unique' | 'random';

  constructor(
    id: number,
    metrics: MetricsCollector,
    handlers: Map<string, ProtocolHandler>,
    testName: string = 'Load Test',
    vuHooks?: VUHooks,
    globalThinkTime?: string | number,
    globalCSV?: GlobalCSVOptions
  ) {
    logger.debug(`VirtualUser ${id} created`);
    this.id = id;
    this.metrics = metrics;
    this.handlers = handlers;
    this.testName = testName;
    this.globalThinkTime = globalThinkTime; // Store global think time
    this.stepExecutor = new StepExecutor(handlers, testName); // Pass testName to StepExecutor
    this.vuHooksManager = new VUHooksManager(testName, id, vuHooks);

    // Initialize global CSV if configured
    if (globalCSV?.config) {
      this.globalCSVMode = globalCSV.mode || 'next';
      this.globalCSVProvider = CSVDataProvider.getInstance(globalCSV.config as CSVDataConfig);
      logger.debug(`VU${id}: Global CSV configured (mode: ${this.globalCSVMode})`);
    }

    this.context = {
      vu_id: id,
      iteration: 0,
      variables: {},
      extracted_data: {}
      // csv_data and global_csv_data will be added only when needed
    };
  }

  // FIXED: Now async to support CSV initialization
  async setScenarios(scenarios: Scenario[]): Promise<void> {
    logger.debug(`VU${this.id}: setScenarios called with ${scenarios.length} scenarios`);
    this.scenarios = scenarios;

    // Debug: Let's see what the scenarios look like
    for (const scenario of scenarios) {
      logger.debug(`VU${this.id}: Scenario "${scenario.name}" config: ${JSON.stringify(scenario, null, 2)}`);
    }

    // Initialize CSV providers only if needed
    await this.initializeCSVProvidersIfNeeded();
    logger.debug(`VU${this.id}: setScenarios completed`);
  }

  /**
   * Initialize CSV providers only for scenarios that need them
   */
  private async initializeCSVProvidersIfNeeded(): Promise<void> {
    const csvScenarios = this.scenarios.filter(s => (s as any).csv_data);

    if (csvScenarios.length === 0) {
      // No CSV scenarios - skip initialization entirely
      logger.debug(`VU${this.id}: No CSV scenarios found, skipping CSV initialization`);
      return;
    }

    logger.debug(`VU${this.id}: Found ${csvScenarios.length} scenarios with CSV data`);

    for (const scenario of csvScenarios) {
      const csvScenario = scenario as any; // Cast to access CSV properties
      logger.debug(`VU${this.id}: Processing CSV for scenario "${scenario.name}": ${JSON.stringify(csvScenario.csv_data)}`);

      if (csvScenario.csv_data) {
        try {
          const provider = CSVDataProvider.getInstance(csvScenario.csv_data);
          await provider.loadData();
          this.csvProviders.set(scenario.name, provider);
          logger.debug(`VU${this.id}: Initialized CSV provider for scenario "${scenario.name}"`);
        } catch (error) {
          logger.warn(`VU${this.id}: Failed to initialize CSV for scenario "${scenario.name}":`, error);
          // Don't fail the entire VU - just log the warning and continue
        }
      }
    }

    logger.debug(`VU${this.id}: CSV initialization completed. Providers: ${this.csvProviders.size}`);
  }

  /**
   * Load global CSV data and merge into context variables
   * Called once at the start of each VU execution cycle
   */
  private async loadGlobalCSVData(): Promise<void> {
    if (!this.globalCSVProvider) {
      return;
    }

    try {
      await this.globalCSVProvider.loadData();

      let csvData: CSVDataRow | null = null;

      switch (this.globalCSVMode) {
        case 'unique':
          csvData = await this.globalCSVProvider.getUniqueRow(this.id);
          break;
        case 'random':
          csvData = await this.globalCSVProvider.getRandomRow(this.id);
          break;
        case 'next':
        default:
          csvData = await this.globalCSVProvider.getNextRow(this.id);
          break;
      }

      if (csvData) {
        this.context.global_csv_data = csvData;

        // Merge global CSV data into variables (can be overridden by scenario CSV)
        logger.debug(`VU${this.id}: Adding global CSV columns to variables: ${Object.keys(csvData).join(', ')}`);
        for (const [key, value] of Object.entries(csvData)) {
          this.context.variables[key] = value;
          logger.debug(`VU${this.id}: Set global CSV variable: ${key} = ${value}`);
        }

        logger.debug(`VU ${this.id}: Loaded global CSV data: ${Object.keys(csvData).join(', ')}`);
      } else {
        logger.debug(`VU${this.id}: Global CSV data exhausted - stopping VU`);
        delete this.context.global_csv_data;
        await this.stop();
        throw new Error(`VU${this.id} terminated due to global CSV data exhaustion`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('terminated due to global CSV')) {
        throw error;
      }
      logger.warn(`📊 VU ${this.id}: Failed to load global CSV data:`, error);
      delete this.context.global_csv_data;
    }
  }

  // This method executes scenarios once (called repeatedly by load patterns)
  async executeScenarios(): Promise<void> {
    if (!this.isActive || this.scenarios.length === 0) {
      return;
    }

    // Load global CSV data first (available to all scenarios)
    try {
      await this.loadGlobalCSVData();
    } catch (error) {
      if (error instanceof Error && error.message.includes('terminated due to global CSV')) {
        logger.warn(`📊 VU ${this.id}: Stopping due to global CSV exhaustion`);
        return;
      }
      // Log but continue if global CSV fails for other reasons
      logger.warn(`📊 VU ${this.id}: Global CSV loading failed, continuing without:`, error);
    }

    // Execute beforeVU hook
    try {
      const beforeVUResult = await this.vuHooksManager.executeBeforeVU(
        this.context.variables,
        this.context.extracted_data
      );
      
      // Merge any variables returned by beforeVU hook
      if (beforeVUResult?.variables) {
        Object.assign(this.context.variables, beforeVUResult.variables);
        logger.debug(`VU${this.id}: beforeVU hook set variables: ${Object.keys(beforeVUResult.variables).join(', ')}`);
      }
    } catch (error) {
      logger.error(`❌ VU ${this.id} beforeVU hook failed:`, error);
      // Continue execution even if beforeVU fails
    }

    try {
      const selectedScenarios = this.selectScenarios(this.scenarios);
      
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
      // Execute teardownVU hook
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
  await this.loadCSVDataIfNeeded(scenario);
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
      
      // For unique CSV mode, get new CSV data each iteration
      const csvScenario = scenario as any;
      if (csvScenario.csv_mode === 'unique' && iteration > 0 && this.csvProviders.has(scenario.name)) {
        await this.loadCSVDataIfNeeded(scenario);
      }
      
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
            const effectiveThinkTime = this.getEffectiveThinkTime(step, scenario);
            if (effectiveThinkTime !== undefined) {
              await this.applyThinkTime(effectiveThinkTime);
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
      
      // Think time between iterations (except after last iteration)
      if (iteration < loops - 1) {
        await this.applyThinkTime(scenario.think_time);
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

  // ... rest of your existing methods remain exactly the same
  private async loadCSVDataIfNeeded(scenario: Scenario): Promise<void> {
    const csvScenario = scenario as any;

    logger.debug(`VU${this.id}: Checking CSV need for scenario "${scenario.name}"`);
    logger.debug(`VU${this.id}: Has csv_data config: ${!!csvScenario.csv_data}`);
    logger.debug(`VU${this.id}: Has CSV provider: ${this.csvProviders.has(scenario.name)}`);

    if (!csvScenario.csv_data || !this.csvProviders.has(scenario.name)) {
      logger.debug(`VU${this.id}: No CSV data needed for scenario "${scenario.name}"`);
      delete this.context.csv_data;
      return;
    }

    try {
      logger.debug(`VU${this.id}: Loading CSV data for scenario "${scenario.name}"...`);
      const csvData = await this.loadCSVDataForScenario(csvScenario);

      if (csvData) {
        this.context.csv_data = csvData;

        logger.debug(`VU${this.id}: Adding CSV columns to variables: ${Object.keys(csvData).join(', ')}`);
        for (const [key, value] of Object.entries(csvData)) {
          if (!(key in this.context.variables)) {
            this.context.variables[key] = value;
            logger.debug(`VU${this.id}: Added CSV variable: ${key} = ${value}`);
          } else {
            logger.debug(`VU${this.id}: Skipped CSV variable ${key} (already in variables)`);
          }
        }

        logger.debug(`VU ${this.id}: Loaded CSV data for scenario "${scenario.name}": ${Object.keys(csvData).join(', ')}`);
      } else {
        logger.debug(`VU${this.id}: No CSV data available - terminating this VU`);
        delete this.context.csv_data;
        this.stop();
        throw new Error(`VU${this.id} terminated due to CSV data exhaustion in scenario "${scenario.name}"`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('terminated due to CSV data exhaustion')) {
        throw error;
      }

      logger.warn(`VU ${this.id}: Failed to load CSV data for scenario "${scenario.name}":`, error);
      delete this.context.csv_data;
      logger.debug(`VU${this.id}: Continuing with fallback variables after CSV error`);
    }
  }

  private async loadCSVDataForScenario(scenario: any): Promise<CSVDataRow | null> {
    const provider = this.csvProviders.get(scenario.name);
    if (!provider) {
      return null;
    }

    const mode = scenario.csv_mode || 'next';

    switch (mode) {
      case 'unique':
        return await provider.getUniqueRow(this.id);
      case 'random':
        return await provider.getRandomRow();
      case 'next':
      default:
        return await provider.getNextRow(this.id);
    }
  }

  private selectScenarios(scenarios: Scenario[]): Scenario[] {
    const selected: Scenario[] = [];
    
    for (const scenario of scenarios) {
      const weight = scenario.weight || 100;
      const random = Math.random() * 100;
      
      if (random < weight) {
        selected.push(scenario);
      }
    }
    
    // Ensure at least one scenario is selected
    if (selected.length === 0 && scenarios.length > 0) {
      selected.push(scenarios[0]);
    }
    
    return selected;
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

  /**
   * Get effective think time using hierarchical override:
   * Step think_time > Scenario think_time > Global think_time
   */
  private getEffectiveThinkTime(step: any, scenario: Scenario): string | number | undefined {
    // Step level has highest priority
    if (step.think_time !== undefined) {
      return step.think_time;
    }

    // Scenario level is next
    if (scenario.think_time !== undefined) {
      return scenario.think_time;
    }

    // Global level is fallback
    return this.globalThinkTime;
  }

  private async applyThinkTime(thinkTime?: string | number): Promise<void> {
    if (!thinkTime) {
      // No think time specified at any level - skip
      return;
    }

    if (typeof thinkTime === 'number') {
      logger.debug(`Applying thinktime: ${thinkTime} seconds`);
      await sleep(thinkTime * 1000);
      return;
    }

    const rangeMatch = thinkTime.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([sm])?$/);
    if (rangeMatch) {
      const [, minStr, maxStr, unit] = rangeMatch;
      let min = parseFloat(minStr);
      let max = parseFloat(maxStr);
      
      if (unit === 's' || !unit) {
        min *= 1000;
        max *= 1000;
      }
      
      const thinkTimeMs = randomBetween(min, max);
      await sleep(thinkTimeMs);
    } else {
      try {
        const thinkTimeMs = parseTime(thinkTime);
        await sleep(thinkTimeMs);
      } catch (error) {
        logger.warn(`⚠️ Invalid think time format: ${thinkTime}`);
        await sleep(randomBetween(1000, 3000));
      }
    }
  }

  // stop(): void {
  //   this.isActive = false;
  //   logger.debug(`⏹️ VU ${this.id} stopped`);
  // }

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
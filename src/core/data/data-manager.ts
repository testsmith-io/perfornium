import { Scenario } from '../../config/types/hooks';
import { GlobalCSVConfig } from '../../config/types/global-config';
import { DataProvider, DataRow, DataResult } from './data-provider';
import { logger } from '../../utils/logger';

export interface DataOptions {
  config: GlobalCSVConfig;
  /** Legacy mode option - maps to distribution.order */
  mode?: 'next' | 'unique' | 'random';
}

export interface DataContext {
  csv_data?: DataRow;
  global_csv_data?: DataRow;
  variables: Record<string, any>;
}

/**
 * Data Manager for VU data lifecycle:
 * - Manages global and scenario-specific data providers
 * - Handles iteration start/end for checkout/checkin
 * - Supports change policies (each_use, each_iteration, each_vu)
 * - Supports distribution scopes (local, global, unique)
 * - Supports exhaustion policies (cycle, stop_vu, stop_test, no_value)
 */
export class DataManager {
  private vuId: number;
  private currentIteration: number = 0;
  private globalProvider?: DataProvider;
  private scenarioProviders: Map<string, DataProvider> = new Map();
  private shouldStopVU: boolean = false;
  private shouldStopTest: boolean = false;

  constructor(vuId: number, globalData?: DataOptions) {
    this.vuId = vuId;

    if (globalData?.config) {
      // Apply legacy mode mapping if no distribution is set
      const config = { ...globalData.config };
      if (globalData.mode && !config.distribution) {
        config.distribution = this.mapLegacyMode(globalData.mode);
        logger.debug(`VU${vuId}: Mapped legacy mode '${globalData.mode}' to distribution`);
      }
      this.globalProvider = DataProvider.getInstance(config);
      logger.debug(`VU${vuId}: Global data provider configured`);
    }
  }

  /**
   * Map legacy mode to new distribution config
   */
  private mapLegacyMode(mode: 'next' | 'unique' | 'random'): GlobalCSVConfig['distribution'] {
    switch (mode) {
      case 'unique':
        return { scope: 'unique', order: 'sequential', on_exhausted: 'stop_vu' };
      case 'random':
        return { scope: 'global', order: 'random', on_exhausted: 'cycle' };
      case 'next':
      default:
        return { scope: 'global', order: 'sequential', on_exhausted: 'cycle' };
    }
  }

  /**
   * Initialize providers for scenarios
   */
  async initializeForScenarios(scenarios: Scenario[]): Promise<void> {
    const csvScenarios = scenarios.filter(s => (s as any).csv_data);

    for (const scenario of csvScenarios) {
      const csvConfig = (scenario as any).csv_data as GlobalCSVConfig;
      if (csvConfig) {
        try {
          const provider = DataProvider.getInstance(csvConfig);
          await provider.loadData();
          this.scenarioProviders.set(scenario.name, provider);
          logger.debug(`VU${this.vuId}: Initialized data provider for scenario "${scenario.name}"`);
        } catch (error) {
          logger.warn(`VU${this.vuId}: Failed to initialize data for scenario "${scenario.name}":`, error);
        }
      }
    }
  }

  /**
   * Called at the start of each iteration
   */
  startIteration(iteration: number): void {
    this.currentIteration = iteration;
  }

  /**
   * Called at the end of each iteration - releases any checked-out rows
   */
  endIteration(iteration: number): void {
    if (this.globalProvider) {
      this.globalProvider.releaseRow(this.vuId, iteration);
    }

    for (const provider of this.scenarioProviders.values()) {
      provider.releaseRow(this.vuId, iteration);
    }
  }

  /**
   * Load global CSV data into context
   */
  async loadGlobalData(context: DataContext): Promise<boolean> {
    if (!this.globalProvider) {
      return true;
    }

    if (this.shouldStopVU || this.shouldStopTest) {
      return false;
    }

    try {
      const result = await this.globalProvider.getRow(this.vuId, this.currentIteration);

      if (result.row) {
        context.global_csv_data = result.row;

        for (const [key, value] of Object.entries(result.row)) {
          context.variables[key] = value;
          logger.debug(`VU${this.vuId}: Set global data variable: ${key} = ${value}`);
        }

        return true;
      }

      return this.handleExhaustionResult(result);
    } catch (error) {
      logger.warn(`VU${this.vuId}: Failed to load global data:`, error);
      return true;
    }
  }

  /**
   * Load scenario-specific CSV data into context
   */
  async loadScenarioData(scenario: Scenario, context: DataContext): Promise<boolean> {
    const provider = this.scenarioProviders.get(scenario.name);
    if (!provider) {
      return true;
    }

    if (this.shouldStopVU || this.shouldStopTest) {
      return false;
    }

    try {
      const result = await provider.getRow(this.vuId, this.currentIteration);

      if (result.row) {
        context.csv_data = result.row;

        for (const [key, value] of Object.entries(result.row)) {
          if (!(key in context.variables)) {
            context.variables[key] = value;
            logger.debug(`VU${this.vuId}: Set scenario data variable: ${key} = ${value}`);
          }
        }

        return true;
      }

      return this.handleExhaustionResult(result);
    } catch (error) {
      logger.warn(`VU${this.vuId}: Failed to load scenario data:`, error);
      return true;
    }
  }

  /**
   * Handle exhaustion result and set stop flags
   */
  private handleExhaustionResult(result: DataResult): boolean {
    if (result.action === 'stop_test') {
      this.shouldStopTest = true;
      throw new Error('CSV_DATA_EXHAUSTED_STOP_TEST');
    }

    if (result.action === 'stop_vu') {
      this.shouldStopVU = true;
      return false;
    }

    // no_value: continue but with null data
    return true;
  }

  /**
   * Check if VU should stop due to data exhaustion
   */
  shouldStop(): boolean {
    return this.shouldStopVU || this.shouldStopTest;
  }

  /**
   * Check if test should stop
   */
  shouldStopEntireTest(): boolean {
    return this.shouldStopTest;
  }

  /**
   * Get status for debugging
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {
      vuId: this.vuId,
      iteration: this.currentIteration,
      shouldStopVU: this.shouldStopVU,
      shouldStopTest: this.shouldStopTest
    };

    if (this.globalProvider) {
      status.globalProvider = this.globalProvider.getStatus();
    }

    for (const [name, provider] of this.scenarioProviders) {
      status[`scenario_${name}`] = provider.getStatus();
    }

    return status;
  }
}

import { Scenario, VUContext } from '../config/types';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { CSVDataRow } from './csv-data-provider';
interface EnhancedVUContext extends VUContext {
    csv_data?: CSVDataRow;
}
export declare class VirtualUser {
    private id;
    private context;
    private metrics;
    private stepExecutor;
    private isActive;
    private scenarios;
    private csvProviders;
    constructor(id: number, metrics: MetricsCollector, handlers: Map<string, ProtocolHandler>);
    setScenarios(scenarios: Scenario[]): Promise<void>;
    /**
     * Initialize CSV providers only for scenarios that need them
     */
    private initializeCSVProvidersIfNeeded;
    executeScenarios(): Promise<void>;
    executeScenario(scenario: Scenario): Promise<void>;
    /**
     * Load CSV data only if the scenario requires it
     * This method is completely optional and won't affect scenarios without CSV
     */
    private loadCSVDataIfNeeded;
    /**
     * Load CSV data for a scenario based on its configuration
     */
    private loadCSVDataForScenario;
    private selectScenarios;
    private executeSetup;
    private executeTeardown;
    private executeScript;
    private applyThinkTime;
    stop(): void;
    getId(): number;
    getContext(): VUContext;
    /**
     * Get the full context including CSV data (for advanced use cases)
     */
    getFullContext(): EnhancedVUContext;
    isRunning(): boolean;
}
export {};

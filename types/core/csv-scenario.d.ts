import { Scenario, VUContext } from '../config/types';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { CSVDataConfig, CSVDataRow } from './csv-data-provider';
export interface CSVScenario extends Scenario {
    csv_data?: CSVDataConfig;
    csv_mode?: 'next' | 'unique' | 'random';
}
interface CSVEnabledVUContext extends VUContext {
    csv_data?: CSVDataRow;
}
export declare class CSVEnabledVirtualUser {
    private id;
    private context;
    private metrics;
    private stepExecutor;
    private isActive;
    private scenarios;
    private csvProviders;
    constructor(id: number, metrics: MetricsCollector, handlers: Map<string, ProtocolHandler>);
    setScenarios(scenarios: CSVScenario[]): void;
    /**
     * Initialize CSV providers for scenarios that need them
     */
    private initializeCSVProviders;
    /**
     * Execute scenarios with CSV data support
     */
    executeScenarios(): Promise<void>;
    executeScenario(scenario: CSVScenario): Promise<void>;
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
    getFullContext(): CSVEnabledVUContext;
    isRunning(): boolean;
}
export {};

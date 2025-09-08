import { Scenario, VUHooks } from '../config/types/hooks';
import { MetricsCollector } from '../metrics/collector';
import { ProtocolHandler } from '../protocols/base';
import { CSVDataRow } from './csv-data-provider';
import { VUContext } from '../config/types';
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
    private vuHooksManager;
    private testName;
    private handlers;
    constructor(id: number, metrics: MetricsCollector, handlers: Map<string, ProtocolHandler>, testName?: string, vuHooks?: VUHooks);
    setScenarios(scenarios: Scenario[]): Promise<void>;
    /**
     * Initialize CSV providers only for scenarios that need them
     */
    private initializeCSVProvidersIfNeeded;
    executeScenarios(): Promise<void>;
    executeScenario(scenario: Scenario): Promise<void>;
    private loadCSVDataIfNeeded;
    private loadCSVDataForScenario;
    private selectScenarios;
    private executeSetup;
    private executeTeardown;
    private executeScript;
    private applyThinkTime;
    stop(): Promise<void>;
    stopSync(): void;
    getId(): number;
    getContext(): VUContext;
    getFullContext(): EnhancedVUContext;
    isRunning(): boolean;
}
export {};

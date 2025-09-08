import { TestHooks, VUHooks, ScenarioHooks, LoopHooks, StepHooks, ScriptResult } from '../config/types/hooks';
export declare class HooksManager {
    private testHooks?;
    private testName;
    private testStartTime;
    constructor(testName: string, testHooks?: TestHooks);
    executeBeforeTest(): Promise<ScriptResult | null>;
    executeOnTestError(error: Error): Promise<ScriptResult | null>;
    executeTeardownTest(): Promise<ScriptResult | null>;
}
export declare class VUHooksManager {
    private vuHooks?;
    private vuId;
    private testName;
    constructor(testName: string, vuId: number, vuHooks?: VUHooks);
    executeBeforeVU(variables: Record<string, any>, extractedData: Record<string, any>): Promise<ScriptResult | null>;
    executeTeardownVU(variables: Record<string, any>, extractedData: Record<string, any>): Promise<ScriptResult | null>;
}
export declare class ScenarioHooksManager {
    private scenarioHooks?;
    private vuId;
    private testName;
    private scenarioName;
    private scenarioStartTime;
    constructor(testName: string, vuId: number, scenarioName: string, hooks?: ScenarioHooks & LoopHooks);
    executeBeforeScenario(variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
    executeTeardownScenario(variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
    executeBeforeLoop(loopIteration: number, variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
    executeAfterLoop(loopIteration: number, variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
}
export declare class StepHooksManager {
    private stepHooks?;
    private vuId;
    private testName;
    private scenarioName;
    private stepName;
    private stepType;
    constructor(testName: string, vuId: number, scenarioName: string, stepName: string, stepType: string, hooks?: StepHooks);
    executeBeforeStep(variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
    executeOnStepError(error: Error, variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>): Promise<ScriptResult | null>;
    executeTeardownStep(variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>, stepResult?: any): Promise<ScriptResult | null>;
}

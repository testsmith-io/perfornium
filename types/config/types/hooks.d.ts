import { CSVDataConfig } from "../../core/csv-data-provider";
import { GlobalConfig } from "./global-config";
import { LoadConfig } from "./load-config";
import { Step } from "./step-types";
export interface HookScript {
    type: 'inline' | 'file' | 'steps';
    content?: string;
    file?: string;
    steps?: Step[];
    timeout?: number;
    continueOnError?: boolean;
}
export interface TestHooks {
    beforeTest?: HookScript;
    onTestError?: HookScript;
    teardownTest?: HookScript;
}
export interface VUHooks {
    beforeVU?: HookScript;
    teardownVU?: HookScript;
}
export interface ScenarioHooks {
    beforeScenario?: HookScript;
    teardownScenario?: HookScript;
}
export interface LoopHooks {
    beforeLoop?: HookScript;
    afterLoop?: HookScript;
}
export interface StepHooks {
    beforeStep?: HookScript;
    onStepError?: HookScript;
    teardownStep?: HookScript;
}
export interface TestConfiguration {
    name: string;
    load: LoadConfig;
    scenarios: Scenario[];
    global?: GlobalConfig;
    hooks?: TestHooks;
}
export interface Scenario {
    name: string;
    weight?: number;
    loop?: number;
    think_time?: string | number;
    variables?: Record<string, any>;
    steps: Step[];
    csv_data?: CSVDataConfig;
    csv_mode?: 'next' | 'unique' | 'random';
    hooks?: ScenarioHooks & LoopHooks;
    setup?: string;
    teardown?: string;
}
export interface ScriptResult {
    success: boolean;
    result?: any;
    error?: Error;
    duration: number;
    variables?: Record<string, any>;
}
export interface ScriptContext {
    test_name: string;
    vu_id: number;
    scenario_name?: string;
    loop_iteration?: number;
    step_name?: string;
    step_type?: string;
    variables: Record<string, any>;
    extracted_data: Record<string, any>;
    csv_data?: Record<string, any>;
    metrics?: any;
    logger?: any;
    error?: Error;
    last_step_result?: any;
    test_start_time?: number;
    scenario_start_time?: number;
    loop_start_time?: number;
    step_start_time?: number;
}

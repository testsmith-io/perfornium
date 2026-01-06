// Hooks interfaces for test lifecycle management

import { Step } from "./step-types";

export interface HookScript {
  type: 'inline' | 'file' | 'steps';
  content?: string;           // For inline scripts
  file?: string;              // For file-based scripts (.js or .ts)
  steps?: Step[];             // For executing actual test steps
  timeout?: number;           // Script timeout in ms (default: 30000)
  continueOnError?: boolean;  // Whether to continue if script fails (default: true)
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

// Re-export Scenario from scenario-config to avoid duplication
export { Scenario } from './scenario-config';

// Script execution result
export interface ScriptResult {
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
  variables?: Record<string, any>;  // Variables returned by script
}

// Script execution context
export interface ScriptContext {
  // Test context
  test_name: string;
  
  // VU context
  vu_id: number;
  
  // Scenario context
  scenario_name?: string;
  
  // Loop context
  loop_iteration?: number;
  
  // Step context
  step_name?: string;
  step_type?: string;
  
  // Current variables and extracted data
  variables: Record<string, any>;
  extracted_data: Record<string, any>;
  csv_data?: Record<string, any>;
  
  // Metrics and utilities
  metrics?: any;
  logger?: any;
  
  // Error context (for error hooks)
  error?: Error;
  
  // Results from previous operations
  last_step_result?: any;
  
  // Timing information
  test_start_time?: number;
  scenario_start_time?: number;
  loop_start_time?: number;
  step_start_time?: number;
}
import { Step } from './step-types';
import { ScenarioHooks, LoopHooks } from './hooks';
import { GlobalCSVConfig } from './global-config';

export interface Scenario {
  name: string;
  description?: string;
  weight?: number;

  // Loop configuration - enhanced for better control
  loop?: number | LoopConfig;

  think_time?: string | number;
  setup?: string;     // Deprecated: use hooks.beforeScenario
  teardown?: string;  // Deprecated: use hooks.teardownScenario
  variables?: Record<string, any>;
  steps: Step[];

  // Optional CSV support - these properties are completely optional
  csv_data?: GlobalCSVConfig;
  csv_mode?: 'next' | 'unique' | 'random';

  // Conditional execution
  condition?: string; // JavaScript expression
  enabled?: boolean; // Enable/disable scenario

  // Hooks support
  hooks?: ScenarioHooks & LoopHooks;
}

/**
 * Enhanced loop configuration for scenarios
 */
export interface LoopConfig {
  count?: number; // Number of iterations (default: infinite if duration is set)
  duration?: string; // Duration to loop (e.g., "30s", "5m")
  mode?: 'count' | 'duration' | 'while' | 'until';
  condition?: string; // JavaScript expression for while/until modes
  break_on_error?: boolean; // Stop looping on first error
  max_errors?: number; // Maximum errors before breaking loop
}
/**
 * Load configuration supports either:
 * 1. Single load pattern (simple)
 * 2. Array of load phases (executed sequentially)
 */
export type LoadConfig = LoadPhase | LoadPhase[];

/**
 * A single load phase configuration
 * Multiple phases are executed sequentially
 */
export interface LoadPhase {
  name?: string; // Optional name for the phase
  pattern: 'basic' | 'stepping' | 'arrivals';
  vus?: number;
  virtual_users?: number;
  ramp_up?: string;
  duration: string; // Required for each phase
  steps?: LoadStep[];
  rate?: number; // For arrivals pattern
}

/**
 * Load step for stepping pattern
 */
export interface LoadStep {
  users: number;
  duration: string;
  ramp_up?: string;
}

/**
 * Helper to get first/primary load phase
 */
export function getPrimaryLoadPhase(load: LoadConfig): LoadPhase {
  return Array.isArray(load) ? load[0] : load;
}

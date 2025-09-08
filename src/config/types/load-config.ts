export interface LoadConfig {
  pattern: 'basic' | 'stepping' | 'arrivals' | 'mixed';
  virtual_users?: number;
  ramp_up?: string;
  duration?: string;
  steps?: StepConfig[];
  rate?: number;
}

export interface StepConfig {
  users: number;
  duration: string;
  ramp_up?: string;
}

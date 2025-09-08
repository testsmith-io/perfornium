import { CSVDataConfig } from '../../core/csv-data-provider';
import { Step } from './step-types';

export interface Scenario {
  name: string;
  weight?: number;
  loop?: number;
  think_time?: string | number;
  setup?: string;
  teardown?: string;
  variables?: Record<string, any>;
  steps: Step[];
  
  // Optional CSV support - these properties are completely optional
  csv_data?: CSVDataConfig;
  csv_mode?: 'next' | 'unique' | 'random';
}
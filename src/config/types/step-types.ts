import { StepHooks } from "./hooks";

export type Step = RESTStep | SOAPStep | WebStep | CustomStep | WaitStep | ScriptStep;

export interface BaseStep {
  name?: string;
  type?: 'rest' | 'soap' | 'web' | 'custom' | 'wait' | 'script';
  condition?: string;
  continueOnError?: boolean;
  hooks?: StepHooks;
  retry?: RetryConfig;
  thresholds?: ThresholdConfig[];
  think_time?: string | number; // Think time override at step level
}

export interface ThresholdConfig {
  metric: 'response_time' | 'status_code' | 'error_rate' | 'throughput' | 'custom';
  value: number | string;
  operator?: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
  severity?: 'warning' | 'error' | 'critical';
  description?: string;
  action?: 'log' | 'fail_step' | 'fail_scenario' | 'fail_test' | 'abort';
  custom_script?: string;
}

export interface RetryConfig {
  max_attempts: number;
  delay?: string | number;
  backoff?: 'linear' | 'exponential';
}

export interface RESTStep extends BaseStep {
  type?: 'rest';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | string;
  path: string;
  headers?: Record<string, string>;
  body?: string | object;
  json?: string | object;
  jsonFile?: string; // Path to JSON file to load as payload
  overrides?: Record<string, any>; // Override values in loaded JSON (supports dot notation for nested paths)
  xml?: string;
  form?: Record<string, string>; // Form data (application/x-www-form-urlencoded)
  multipart?: Record<string, string | File | Blob>; // Multipart form data
  timeout?: number;
  checks?: CheckConfig[];
  extract?: ExtractConfig[];
  query?: Record<string, string | number | boolean>; // Query parameters
  auth?: {
    type: 'basic' | 'bearer' | 'digest' | 'oauth';
    username?: string;
    password?: string;
    token?: string;
  };
}

export interface SOAPStep extends BaseStep {
  type: 'soap';
  wsdl?: string;
  operation: string;
  args: any;
  body?: string; // Add this for raw XML SOAP envelope
  checks?: CheckConfig[];
  extract?: ExtractConfig[];
}

export interface WebStep extends BaseStep {
  type: 'web';
  action: WebAction;
  checks?: CheckConfig[];
  extract?: ExtractConfig[];
}

export interface CustomStep extends BaseStep {
  type: 'custom';
  script: string;
  timeout?: number;
}

export interface WaitStep extends BaseStep {
  type: 'wait';
  duration: string | number;
}

export interface ScriptStep extends BaseStep {
  type: 'script';
  file: string;                          // Path to TypeScript/JavaScript file
  function: string;                      // Function name to call
  params?: Record<string, any>;          // Parameters to pass to the function
  returns?: string;                      // Variable name to store return value
  timeout?: number;                      // Execution timeout in ms (default: 30000)
}

export interface WebAction {
  name?: string;
  expected_text?: string;
  command: 'goto' | 'click' | 'fill' | 'select' | 'hover' | 'screenshot' | 'wait_for_selector' | 'wait_for_text' | 
           'verify_text' | 'verify_not_exists' | 'verify_exists' | 'verify_visible' | 'evaluate' |
           'measure_web_vitals' | 'measure_verification' | 'performance_audit' | 'accessibility_audit' |
           'wait_for_load_state' | 'network_idle' | 'dom_ready';
  selector?: string;
  url?: string;
  value?: string | string[];
  text?: string;
  script?: string;
  timeout?: number;
  options?: Record<string, any>;
  
  // Core Web Vitals and measurement options
  measureWebVitals?: boolean;
  collectWebVitals?: boolean;  // Collect web vitals after this action (defaults to false for click/fill)
  webVitalsWaitTime?: number;
  webVitalsThresholds?: {
    lcp?: { good: number; poor: number };
    fid?: { good: number; poor: number };
    cls?: { good: number; poor: number };
    fcp?: { good: number; poor: number };
    ttfb?: { good: number; poor: number };
  };
  
  // Verification measurement options
  measureVerification?: boolean;
  verificationName?: string;
  
  // Performance audit options
  auditCategories?: ('performance' | 'accessibility' | 'best-practices' | 'seo')[];
  lighthouse?: boolean;
  
  // Network and loading states
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  networkIdleTimeout?: number;
}

export interface CheckConfig {
  type: 'status' | 'response_time' | 'json_path' | 'text_contains' | 'selector' | 'url_contains' | 'custom';
  value?: any;
  operator?: 'equals' | 'contains' | 'exists' | 'lt' | 'gt' | 'lte' | 'gte';
  description?: string;
  script?: string;
}

export interface ExtractConfig {
  name: string;
  type: 'json_path' | 'regex' | 'header' | 'selector' | 'custom';
  expression: string;
  script?: string;
  default?: any;
}

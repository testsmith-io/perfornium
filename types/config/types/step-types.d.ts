import { StepHooks } from "./hooks";
export type Step = RESTStep | SOAPStep | WebStep | CustomStep | WaitStep;
export interface BaseStep {
    name?: string;
    type?: 'rest' | 'soap' | 'web' | 'custom' | 'wait';
    condition?: string;
    continueOnError?: boolean;
    hooks?: StepHooks;
    retry?: RetryConfig;
}
export interface RetryConfig {
    max_attempts: number;
    delay?: string | number;
    backoff?: 'linear' | 'exponential';
}
export interface RESTStep extends BaseStep {
    type?: 'rest';
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string | object;
    json?: string | object;
    xml?: string;
    timeout?: number;
    checks?: CheckConfig[];
    extract?: ExtractConfig[];
}
export interface SOAPStep extends BaseStep {
    type: 'soap';
    wsdl?: string;
    operation: string;
    args: any;
    body?: string;
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
export interface WebAction {
    name?: any;
    expected_text?: string;
    command: 'goto' | 'click' | 'fill' | 'select' | 'hover' | 'screenshot' | 'wait_for_selector' | 'wait_for_text' | 'verify_text' | 'verify_not_exists' | 'verify_exists' | 'verify_visible' | 'evaluate';
    selector?: string;
    url?: string;
    value?: string | string[];
    text?: string;
    script?: string;
    timeout?: number;
    options?: Record<string, any>;
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

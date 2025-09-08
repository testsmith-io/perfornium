export interface TestConfiguration {
    name: string;
    description?: string;
    global?: GlobalConfig;
    load: LoadConfig;
    scenarios: Scenario[];
    outputs?: OutputConfig[];
    report?: ReportConfig;
    workers?: WorkerConfig;
}
export interface FakerConfig {
    locale?: string;
    seed?: number;
}
export interface GlobalConfig {
    base_url?: string;
    timeout?: number;
    think_time?: string | number;
    variables?: Record<string, any>;
    browser?: BrowserConfig;
    faker?: FakerConfig;
}
export interface BrowserConfig {
    type: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
    slow_mo?: number;
}
export interface Scenario {
    name: string;
    weight?: number;
    loop?: number;
    steps: Step[];
    variables?: Record<string, any>;
    setup?: string;
    teardown?: string;
    think_time?: string | number;
}
export type Step = RESTStep | SOAPStep | WebStep | CustomStep | WaitStep;
export interface BaseStep {
    name?: string;
    type: 'rest' | 'soap' | 'web' | 'custom' | 'wait';
    condition?: string;
    retry?: RetryConfig;
}
export interface RetryConfig {
    max_attempts: number;
    delay?: string | number;
    backoff?: 'linear' | 'exponential';
}
export interface RemoteWorkerConfig {
    host: string;
    port: number;
    capacity: number;
    region: string;
}
export interface DistributedWorkerConfig {
    enabled: boolean;
    workers: string[];
    coordinator_port?: number;
    load_balancing?: 'round_robin' | 'least_loaded' | 'random';
}
export interface WorkerConfig extends DistributedWorkerConfig {
}
export interface WorkerConfig {
    host: any;
    port: number;
    capacity: number;
    region: string;
    enabled: boolean;
    workers: string[];
    coordinator_port?: number;
    load_balancing?: 'round_robin' | 'least_loaded' | 'random';
}
export interface RESTStep extends BaseStep {
    type: 'rest';
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string | object;
    timeout?: number;
    checks?: CheckConfig[];
    extract?: ExtractConfig[];
}
export interface SOAPStep extends BaseStep {
    type: 'soap';
    wsdl?: string;
    operation: string;
    args: any;
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
export interface ReportConfig {
    generate?: boolean;
    output: string;
    percentiles?: number[];
    template?: string;
    title?: string;
    include_charts?: boolean;
    include_raw_data?: boolean;
    custom_metrics?: string[];
}
export interface OutputConfig {
    type: 'csv' | 'json' | 'influxdb' | 'graphite' | 'webhook';
    enabled?: boolean;
    file?: string;
    url?: string;
    database?: string;
    tags?: Record<string, string>;
    headers?: Record<string, string>;
    template?: string;
}
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
export interface VUContext {
    vu_id: number;
    iteration: number;
    variables: Record<string, any>;
    extracted_data: Record<string, any>;
}
export interface ErrorDetail {
    timestamp: number;
    vu_id: number;
    scenario: string;
    action: string;
    status?: number;
    error: string;
    request_url?: string;
    response_body?: string;
    count: number;
}
export interface TestConfiguration {
    name: string;
    description?: string;
    global?: GlobalConfig;
    load: LoadConfig;
    scenarios: Scenario[];
    outputs?: OutputConfig[];
    report?: ReportConfig;
    workers?: WorkerConfig;
    debug?: DebugConfig;
}
export interface DebugConfig {
    capture_request_headers?: boolean;
    capture_request_body?: boolean;
    capture_response_headers?: boolean;
    capture_response_body?: boolean;
    max_response_body_size?: number;
    capture_only_failures?: boolean;
    log_level?: 'debug' | 'info' | 'warn' | 'error';
}
export interface GlobalConfig {
    base_url?: string;
    timeout?: number;
    think_time?: string | number;
    variables?: Record<string, any>;
    browser?: BrowserConfig;
    debug?: DebugConfig;
}

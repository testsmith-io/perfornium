export interface GlobalConfig {
    base_url?: string;
    wsdl_url?: string;
    timeout?: number;
    think_time?: string | number;
    variables?: Record<string, any>;
    browser?: BrowserConfig;
    faker?: FakerConfig;
    debug?: DebugConfig;
}
export interface FakerConfig {
    locale?: string;
    seed?: number;
}
export interface BrowserConfig {
    type: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
    slow_mo?: number;
    base_url?: string;
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

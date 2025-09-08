export interface TestResult {
    shouldRecord?: any;
    id: string;
    vu_id: number;
    iteration: number;
    scenario: string;
    action: string;
    step_name?: string;
    timestamp: number;
    duration: number;
    success: boolean;
    status?: number;
    status_text?: string;
    error?: string;
    error_code?: string;
    response_size?: number;
    response_headers?: Record<string, string>;
    response_body?: string;
    request_url?: string;
    request_method?: string;
    request_headers?: Record<string, string>;
    request_body?: string;
    custom_metrics?: Record<string, any>;
}
export interface VUStartEvent {
    vu_id: number;
    start_time: number;
    load_pattern: string;
}
export interface StepStatistics {
    step_name: string;
    scenario: string;
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    success_rate: number;
    avg_response_time: number;
    min_response_time: number;
    max_response_time: number;
    percentiles: Record<number, number>;
    response_times: number[];
    error_distribution: Record<string, number>;
    status_distribution: Record<number, number>;
}
export interface MetricsSummary {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    success_rate: number;
    avg_response_time: number;
    min_response_time: number;
    max_response_time: number;
    percentiles: Record<number, number>;
    requests_per_second: number;
    bytes_per_second: number;
    total_duration: number;
    error_distribution: Record<string, number>;
    status_distribution: Record<number, number>;
    error_details: ErrorDetail[];
    step_statistics: StepStatistics[];
    vu_ramp_up: VUStartEvent[];
    timeline_data: TimelineData[];
}
export interface TimelineData {
    timestamp: number;
    time_label: string;
    active_vus: number;
    requests_count: number;
    avg_response_time: number;
    success_rate: number;
    throughput: number;
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

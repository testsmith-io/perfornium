import { Scenario } from "./scenario-config";
import { TestConfiguration } from "./test-configuration";
export interface VUContext {
    vu_id: number;
    iteration: number;
    variables: Record<string, any>;
    extracted_data: Record<string, any>;
}
export interface EnhancedVUContext extends VUContext {
    csv_data?: Record<string, string | number | boolean>;
}
export interface ValidatedConfig extends TestConfiguration {
    scenarios: Scenario[];
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
export interface TestResult {
    timestamp: number;
    vu_id: number;
    scenario: string;
    step_name?: string;
    success: boolean;
    duration: number;
    status_code?: number;
    response_size?: number;
    error_message?: string;
    tags?: Record<string, string>;
}

import { VUContext } from '../config/types';
export interface ProtocolResult {
    success: boolean;
    status?: number;
    status_text?: string;
    error?: string;
    error_code?: string;
    data?: any;
    response_size?: number;
    duration?: number;
    request_url?: string;
    request_method?: string;
    request_headers?: Record<string, string>;
    request_body?: string;
    response_headers?: Record<string, string>;
    response_body?: string;
    custom_metrics?: Record<string, any>;
}
export interface ProtocolHandler {
    execute(action: any, context: VUContext): Promise<ProtocolResult>;
    cleanup?(): Promise<void>;
}

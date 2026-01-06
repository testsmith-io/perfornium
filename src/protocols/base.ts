import { VUContext } from '../config/types';

export interface ProtocolResult {
  success: boolean;
  status?: number;
  status_text?: string;
  error?: string;
  error_code?: string;
  data?: any;
  response_size?: number;
  response_time?: number;  // Actual action response time (for accurate timing in graphs)
  duration?: number;
  shouldRecord?: boolean;

  // Enhanced debugging fields
  request_url?: string;
  request_method?: string;
  request_headers?: Record<string, string>;
  request_body?: string;
  response_headers?: Record<string, string>;
  response_body?: string;

  // JMeter-style timing breakdown
  sample_start?: number; // Request start timestamp
  connect_time?: number; // Time to establish TCP connection (ms)
  latency?: number; // Time to first byte / TTFB (ms)

  // JMeter-style size breakdown
  sent_bytes?: number; // Total bytes sent (headers + body)
  headers_size_sent?: number; // Request headers size in bytes
  body_size_sent?: number; // Request body size in bytes
  headers_size_received?: number; // Response headers size in bytes
  body_size_received?: number; // Response body size in bytes
  data_type?: 'text' | 'bin' | ''; // Response data type

  custom_metrics?: Record<string, any>;
}

export interface ProtocolHandler {
  execute(action: any, context: VUContext): Promise<ProtocolResult>;
  cleanup?(): Promise<void>;
}

/**
 * Reporting and metrics constants
 * Centralized configuration for all magic numbers
 */

// Time bucket sizes (milliseconds)
export const TIME_BUCKETS = {
  FINE: 1000,      // 1 second - for detailed analysis
  MEDIUM: 5000,    // 5 seconds - for timeline charts
  COARSE: 10000,   // 10 seconds - for trend analysis
} as const;

// Standard percentiles to calculate
export const PERCENTILES = {
  STANDARD: [50, 90, 95, 99] as number[],
  EXTENDED: [50, 90, 95, 99, 99.9, 99.99] as number[],
};

// Apdex score thresholds (in milliseconds)
export const APDEX_DEFAULTS = {
  SATISFIED_THRESHOLD: 500,    // Requests under this are "satisfied"
  TOLERATING_MULTIPLIER: 4,    // Requests under threshold * 4 are "tolerating"
} as const;

// SLA default thresholds
export const SLA_DEFAULTS: {
  SUCCESS_RATE: number;
  AVG_RESPONSE_TIME: number;
  P95_RESPONSE_TIME: number;
  P99_RESPONSE_TIME: number;
  MIN_REQUESTS_PER_SECOND: number;
} = {
  SUCCESS_RATE: 95.0,           // Minimum success rate percentage
  AVG_RESPONSE_TIME: 2000,      // Maximum average response time (ms)
  P95_RESPONSE_TIME: 5000,      // Maximum P95 response time (ms)
  P99_RESPONSE_TIME: 10000,     // Maximum P99 response time (ms)
  MIN_REQUESTS_PER_SECOND: 0.1, // Minimum throughput (very low default - user should configure)
};

// Web Vitals thresholds (from Google)
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },      // Largest Contentful Paint (ms)
  FID: { good: 100, poor: 300 },        // First Input Delay (ms)
  CLS: { good: 0.1, poor: 0.25 },       // Cumulative Layout Shift (score)
  FCP: { good: 1800, poor: 3000 },      // First Contentful Paint (ms)
  TTFB: { good: 800, poor: 1800 },      // Time to First Byte (ms)
  TTI: { good: 3800, poor: 7300 },      // Time to Interactive (ms)
  TBT: { good: 200, poor: 600 },        // Total Blocking Time (ms)
  SPEED_INDEX: { good: 3400, poor: 5800 }, // Speed Index (ms)
  INP: { good: 200, poor: 500 },        // Interaction to Next Paint (ms)
} as const;

// Outlier detection thresholds
export const OUTLIER_DETECTION = {
  IQR_MULTIPLIER: 1.5,          // Standard IQR multiplier for mild outliers
  IQR_EXTREME_MULTIPLIER: 3.0,  // IQR multiplier for extreme outliers
  Z_SCORE_THRESHOLD: 3.0,       // Z-score threshold for outliers
} as const;

// Confidence interval settings
export const CONFIDENCE_INTERVALS = {
  LEVELS: [0.90, 0.95, 0.99],   // 90%, 95%, 99% confidence levels
  DEFAULT_LEVEL: 0.95,          // Default confidence level
} as const;

// Heatmap settings
export const HEATMAP = {
  TIME_BUCKETS: 50,             // Number of time buckets
  RESPONSE_TIME_BUCKETS: 20,    // Number of response time buckets
} as const;

// Report generation settings
export const REPORT_SETTINGS = {
  MAX_RAW_DATA_ROWS: 1000,      // Maximum raw data rows to include
  CHART_DATA_POINTS_LIMIT: 500, // Maximum data points per chart
  BATCH_SIZE: 10,               // Default batch size for metrics collection
  FLUSH_INTERVAL: 5000,         // Default flush interval (ms)
} as const;

// Status thresholds for visual indicators
export const STATUS_THRESHOLDS = {
  SUCCESS_RATE_GOOD: 99,        // Green status
  SUCCESS_RATE_WARNING: 95,     // Yellow status
  // Below WARNING is red/error status
} as const;

// Response time field to use (standardized)
export const RESPONSE_TIME_FIELD = 'response_time' as const;
export const DURATION_FIELD = 'duration' as const;

/**
 * Get response time from a result, preferring response_time over duration
 */
export function getResponseTime(result: { response_time?: number; duration?: number }): number {
  return result.response_time ?? result.duration ?? 0;
}

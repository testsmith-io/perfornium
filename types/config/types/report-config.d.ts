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

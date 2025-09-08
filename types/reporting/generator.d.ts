import { TestResult, MetricsSummary } from '../metrics/types';
import { ReportConfig } from '../config/types';
export interface ReportData {
    testName: string;
    summary: MetricsSummary;
    results: TestResult[];
}
export declare class HTMLReportGenerator {
    constructor();
    private registerHelpers;
    generate(data: ReportData, config: ReportConfig, outputPath: string): Promise<void>;
    /**
     * Enhanced step statistics with min, max, and additional percentiles
     */
    private calculateStepStatistics;
    /**
     * Calculate requests per second over time
     */
    private calculateRequestsPerSecondData;
    /**
     * Calculate responses per second over time (successful responses)
     */
    private calculateResponsesPerSecondData;
    /**
     * Generate proper filename with timestamp and test name from config
     */
    generateFilename(testName: string, type: 'html' | 'csv' | 'json' | 'summary', configPath?: string): string;
    /**
     * Extract test name from YAML config file
     */
    private extractTestNameFromConfig;
    private calculateVURampupData;
    private calculateTimelineData;
    private estimateActiveVUs;
    private prepareChartData;
    private groupByScenario;
    private calculateStepResponseTimes;
    private calculateScenarioStatistics;
    private getDefaultTemplatePath;
    private getBuiltInTemplate;
    private getEnhancedTemplate;
}

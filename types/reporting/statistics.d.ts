import { TestResult } from '../metrics/types';
export declare class StatisticsCalculator {
    /**
     * Calculate percentiles with enhanced precision for 99.9% and 99.99%
     */
    static calculatePercentiles(values: number[], percentiles: number[]): Record<number, number>;
    /**
     * Calculate enhanced statistics including min, max, and extended percentiles
     */
    static calculateEnhancedStatistics(values: number[]): {
        count: number;
        min: number;
        max: number;
        mean: number;
        median: number;
        stdDev: number;
        percentiles: Record<number, number>;
    };
    static calculateThroughput(results: TestResult[], totalDurationMs: number): number;
    static calculateErrorRate(results: TestResult[]): number;
    /**
     * Enhanced time-based grouping with configurable intervals
     */
    static groupResultsByTime(results: TestResult[], intervalMs?: number): any[];
    /**
     * Enhanced response time distribution with percentage calculation
     */
    static calculateResponseTimeDistribution(results: TestResult[], buckets?: number): any[];
    /**
     * Calculate throughput over time with different granularities
     */
    static calculateThroughputOverTime(results: TestResult[], intervalMs?: number): any[];
    /**
     * Calculate detailed step statistics with min, max, and extended percentiles
     */
    static calculateDetailedStepStatistics(results: TestResult[]): any[];
    /**
     * Calculate response rate (successful responses) over time
     */
    static calculateResponseRateOverTime(results: TestResult[], intervalMs?: number): any[];
    /**
     * Calculate error distribution and patterns
     */
    static calculateErrorDistribution(results: TestResult[]): any;
    /**
     * Calculate performance trends and patterns
     */
    static calculatePerformanceTrends(results: TestResult[]): any;
}

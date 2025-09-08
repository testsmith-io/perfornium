import { TestResult } from '../metrics/types';
import { logger } from '../utils/logger';

export interface AggregatedResults {
  summary: {
    total_requests: number;
    success_rate: number;
    avg_response_time: number;
    requests_per_second: number;
    total_errors: number;
    start_time: number;
    end_time: number;
    duration: number;
  };
  results: TestResult[];
  workers: {
    [workerAddress: string]: {
      requests: number;
      errors: number;
      avg_response_time: number;
      requests_per_second: number;
    };
  };
}

export class ResultAggregator {
  private results: TestResult[] = [];
  private workerResults: Map<string, TestResult[]> = new Map();
  private isAggregating: boolean = false;
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.isAggregating = true;
    this.startTime = Date.now();
    this.results = [];
    this.workerResults.clear();
    logger.debug('📊 Result aggregation started');
  }

  stop(): void {
    this.isAggregating = false;
    this.endTime = Date.now();
    logger.debug('📊 Result aggregation stopped');
  }

  addResult(result: TestResult, workerAddress?: string): void {
    if (!this.isAggregating) {
      return;
    }

    this.results.push(result);

    if (workerAddress) {
      if (!this.workerResults.has(workerAddress)) {
        this.workerResults.set(workerAddress, []);
      }
      this.workerResults.get(workerAddress)!.push(result);
    }
  }

  getAggregatedResults(): AggregatedResults {
    const totalRequests = this.results.length;
    const successfulRequests = this.results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    
    const responseTimes = this.results.map(r => r.duration || r.response_size || 0);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    const duration = this.endTime - this.startTime;
    const requestsPerSecond = duration > 0 ? (totalRequests / duration) * 1000 : 0;

    // Aggregate worker-specific results
    const workerStats: { [key: string]: any } = {};
    for (const [workerAddress, workerResults] of this.workerResults) {
      const workerRequests = workerResults.length;
      const workerSuccessful = workerResults.filter(r => r.success).length;
      const workerErrors = workerRequests - workerSuccessful;
      
      const workerResponseTimes = workerResults.map(r => r.duration || r.response_size || 0);
      const workerAvgResponseTime = workerResponseTimes.length > 0
        ? workerResponseTimes.reduce((sum, time) => sum + time, 0) / workerResponseTimes.length
        : 0;
      
      const workerRequestsPerSecond = duration > 0 ? (workerRequests / duration) * 1000 : 0;

      workerStats[workerAddress] = {
        requests: workerRequests,
        errors: workerErrors,
        avg_response_time: workerAvgResponseTime,
        requests_per_second: workerRequestsPerSecond
      };
    }

    return {
      summary: {
        total_requests: totalRequests,
        success_rate: successRate,
        avg_response_time: avgResponseTime,
        requests_per_second: requestsPerSecond,
        total_errors: failedRequests,
        start_time: this.startTime,
        end_time: this.endTime,
        duration
      },
      results: this.results,
      workers: workerStats
    };
  }

  getWorkerResults(workerAddress: string): TestResult[] {
    return this.workerResults.get(workerAddress) || [];
  }

  getAllWorkerAddresses(): string[] {
    return Array.from(this.workerResults.keys());
  }

  getTotalResultCount(): number {
    return this.results.length;
  }

  clear(): void {
    this.results = [];
    this.workerResults.clear();
    this.startTime = 0;
    this.endTime = 0;
  }
}
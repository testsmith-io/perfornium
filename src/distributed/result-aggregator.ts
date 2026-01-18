import { TestResult, VUStartEvent } from '../metrics/types';
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
    total_duration: number;  // Duration in milliseconds
    total_virtual_users: number;
    peak_virtual_users: number;
    successful_requests: number;
    failed_requests: number;
    vu_ramp_up: VUStartEvent[];  // VU start events from all workers
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
  private vuRampUpEvents: VUStartEvent[] = [];
  private workerVUEvents: Map<string, VUStartEvent[]> = new Map();
  private isAggregating: boolean = false;
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.isAggregating = true;
    this.startTime = Date.now();
    this.results = [];
    this.workerResults.clear();
    this.vuRampUpEvents = [];
    this.workerVUEvents.clear();
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

  addVURampUpEvents(events: VUStartEvent[], workerAddress: string): void {
    if (!this.isAggregating || !events || events.length === 0) {
      return;
    }

    // Store per-worker VU events (with worker-unique VU IDs)
    if (!this.workerVUEvents.has(workerAddress)) {
      this.workerVUEvents.set(workerAddress, []);
    }

    // Create globally unique VU IDs by prefixing with worker index
    const workerIndex = Array.from(this.workerVUEvents.keys()).indexOf(workerAddress);
    const workerPrefix = workerIndex >= 0 ? workerIndex : this.workerVUEvents.size;
    const maxVUsPerWorker = 10000; // Allows up to 10000 VUs per worker

    events.forEach(event => {
      // Create a globally unique VU ID: workerPrefix * maxVUsPerWorker + original vu_id
      const globalVUId = (workerPrefix * maxVUsPerWorker) + event.vu_id;
      const globalEvent: VUStartEvent = {
        ...event,
        vu_id: globalVUId
      };

      this.vuRampUpEvents.push(globalEvent);
      this.workerVUEvents.get(workerAddress)!.push(event); // Keep original for per-worker tracking
    });

    logger.debug(`📊 Added ${events.length} VU ramp-up events from ${workerAddress}`);
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

    // Calculate total virtual users across all workers
    // Prefer VU ramp-up events if available (most accurate)
    let totalVUs = 0;
    if (this.vuRampUpEvents.length > 0) {
      // Count from actual VU start events (already made globally unique)
      totalVUs = this.vuRampUpEvents.length;
    } else {
      // Fallback: Each worker has its own VU IDs (1, 2, 3...), so count per worker and sum
      for (const [, workerResults] of this.workerResults) {
        const uniqueVUsPerWorker = new Set(workerResults.map(r => r.vu_id)).size;
        totalVUs += uniqueVUsPerWorker;
      }
      // Fallback if no worker info available
      if (totalVUs === 0) {
        totalVUs = new Set(this.results.map(r => r.vu_id)).size;
      }
    }

    // Sort VU ramp-up events by start time for proper chart rendering
    const sortedVURampUp = [...this.vuRampUpEvents].sort((a, b) => a.start_time - b.start_time);

    return {
      summary: {
        total_requests: totalRequests,
        success_rate: successRate,
        avg_response_time: avgResponseTime,
        requests_per_second: requestsPerSecond,
        total_errors: failedRequests,
        start_time: this.startTime,
        end_time: this.endTime,
        duration,
        total_duration: duration,  // Store in milliseconds for consistency
        total_virtual_users: totalVUs,
        peak_virtual_users: totalVUs,
        successful_requests: successfulRequests,
        failed_requests: failedRequests,
        vu_ramp_up: sortedVURampUp
      },
      results: this.results,
      workers: workerStats
    };
  }

  clear(): void {
    this.results = [];
    this.workerResults.clear();
    this.vuRampUpEvents = [];
    this.workerVUEvents.clear();
    this.startTime = 0;
    this.endTime = 0;
  }
}
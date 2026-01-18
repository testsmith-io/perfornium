export interface RunningStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  durations: number[];
}

export class StatisticsEngine {
  private readonly maxDurationsForPercentiles: number;
  private stats: RunningStats;

  constructor(maxDurationsForPercentiles: number = 10000) {
    this.maxDurationsForPercentiles = maxDurationsForPercentiles;
    this.stats = this.createEmptyStats();
  }

  private createEmptyStats(): RunningStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      durations: []
    };
  }

  reset(): void {
    this.stats = this.createEmptyStats();
  }

  recordResult(duration: number, success: boolean): void {
    this.stats.totalRequests++;

    if (success) {
      this.stats.successfulRequests++;
      this.stats.totalDuration += duration;
      this.stats.minDuration = Math.min(this.stats.minDuration, duration);
      this.stats.maxDuration = Math.max(this.stats.maxDuration, duration);

      // Keep limited durations for percentile calculation (reservoir sampling)
      if (this.stats.durations.length < this.maxDurationsForPercentiles) {
        this.stats.durations.push(duration);
      } else {
        // Randomly replace an existing duration (reservoir sampling)
        const replaceIndex = Math.floor(Math.random() * this.stats.totalRequests);
        if (replaceIndex < this.maxDurationsForPercentiles) {
          this.stats.durations[replaceIndex] = duration;
        }
      }
    } else {
      this.stats.failedRequests++;
    }
  }

  getStats(): RunningStats {
    return { ...this.stats };
  }

  getAverageResponseTime(): number {
    return this.stats.successfulRequests > 0
      ? this.stats.totalDuration / this.stats.successfulRequests
      : 0;
  }

  getMinDuration(): number {
    return this.stats.minDuration === Infinity ? 0 : this.stats.minDuration;
  }

  getMaxDuration(): number {
    return this.stats.maxDuration;
  }

  getDurations(): number[] {
    return [...this.stats.durations];
  }

  calculatePercentiles(values?: number[]): Record<number, number> {
    const durations = values || this.stats.durations;
    if (durations.length === 0) return {};

    const sorted = [...durations].sort((a, b) => a - b);
    const percentileValues = [50, 90, 95, 99, 99.9, 99.99];
    const result: Record<number, number> = {};

    percentileValues.forEach(p => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      result[p] = sorted[Math.max(0, index)];
    });

    return result;
  }

  getSuccessRate(): number {
    return this.stats.totalRequests > 0
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100
      : 0;
  }

  getTotalRequests(): number {
    return this.stats.totalRequests;
  }

  getSuccessfulRequests(): number {
    return this.stats.successfulRequests;
  }

  getFailedRequests(): number {
    return this.stats.failedRequests;
  }
}

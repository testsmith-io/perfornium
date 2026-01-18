import { TestResult, VUStartEvent } from '../types';

export class ResultStorage {
  private results: TestResult[] = [];
  private vuStartEvents: VUStartEvent[] = [];
  private loadPatternType: string = 'basic';
  private readonly maxStoredResults: number;

  constructor(maxStoredResults: number = 50000) {
    this.maxStoredResults = maxStoredResults;
  }

  clear(): void {
    this.results = [];
    this.vuStartEvents = [];
  }

  setLoadPatternType(pattern: string): void {
    this.loadPatternType = pattern;
  }

  recordVUStart(vuId: number): void {
    this.vuStartEvents.push({
      vu_id: vuId,
      start_time: Date.now(),
      load_pattern: this.loadPatternType
    });
  }

  addResult(result: TestResult): boolean {
    if (this.results.length < this.maxStoredResults) {
      this.results.push(result);
      return true;
    }
    return false;
  }

  getResults(): TestResult[] {
    return [...this.results];
  }

  getVUStartEvents(): VUStartEvent[] {
    return [...this.vuStartEvents];
  }

  getResultCount(): number {
    return this.results.length;
  }

  isAtCapacity(): boolean {
    return this.results.length >= this.maxStoredResults;
  }

  getResponseSizes(): number[] {
    return this.results
      .filter(r => r.response_size)
      .map(r => r.response_size!);
  }

  getActiveVUsAtTime(time: number): number {
    return this.vuStartEvents.filter(vu => vu.start_time <= time).length;
  }

  getResultsInInterval(startTime: number, endTime: number): TestResult[] {
    return this.results.filter(r =>
      r.timestamp >= startTime && r.timestamp < endTime
    );
  }
}

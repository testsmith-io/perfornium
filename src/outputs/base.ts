import { TestResult, MetricsSummary } from '../metrics/types';

export interface OutputHandler {
  initialize(): Promise<void>;
  writeResult(result: TestResult): Promise<void>;
  writeSummary(summary: MetricsSummary): Promise<void>;
  finalize(): Promise<void>;
}
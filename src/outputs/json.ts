import * as fs from 'fs';
import * as path from 'path';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';

export class JSONOutput implements OutputHandler {
  private filePath: string;
  private results: TestResult[] = [];
  private summary?: MetricsSummary;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async writeResult(result: TestResult): Promise<void> {
    this.results.push(result);
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    this.summary = summary;
  }

  async finalize(): Promise<void> {
    const output = {
      metadata: {
        version: '1.0.0',
        generated_at: new Date().toISOString(),
        total_results: this.results.length
      },
      summary: this.summary,
      results: this.results
    };

    fs.writeFileSync(this.filePath, JSON.stringify(output, null, 2));
  }
}
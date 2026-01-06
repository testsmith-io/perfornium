import * as fs from 'fs';
import * as path from 'path';
import { OutputHandler } from './base';
import { TestResult, MetricsSummary } from '../metrics/types';

export class JSONOutput implements OutputHandler {
  private filePath: string;
  private results: TestResult[] = [];
  private summary?: MetricsSummary;
  private fileStream?: fs.WriteStream;
  private firstWrite: boolean = true;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file and write opening structure
    this.fileStream = fs.createWriteStream(this.filePath, { flags: 'w' });
    this.fileStream.write('{\n');
    this.fileStream.write('  "metadata": {\n');
    this.fileStream.write('    "version": "1.0.0",\n');
    this.fileStream.write(`    "generated_at": "${new Date().toISOString()}",\n`);
    this.fileStream.write('    "test_status": "running"\n');
    this.fileStream.write('  },\n');
    this.fileStream.write('  "results": [\n');
    this.firstWrite = true;
  }

  async writeResult(result: TestResult): Promise<void> {
    // Write incrementally to file during test
    this.results.push(result); // Keep for summary calculation

    if (!this.fileStream) {
      throw new Error('JSON output not initialized');
    }

    // Add comma before all results except the first
    if (!this.firstWrite) {
      this.fileStream.write(',\n');
    }
    this.firstWrite = false;

    // Write result as indented JSON
    const resultJson = JSON.stringify(result, null, 2);
    const indentedResult = resultJson.split('\n').map((line, idx) => {
      if (idx === 0) return `    ${line}`;
      return `    ${line}`;
    }).join('\n');

    this.fileStream.write(indentedResult);
  }

  async writeSummary(summary: MetricsSummary): Promise<void> {
    this.summary = summary;
  }

  async finalize(): Promise<void> {
    if (!this.fileStream) return;

    // Close results array
    this.fileStream.write('\n  ]');

    // Write summary if available
    if (this.summary) {
      this.fileStream.write(',\n  "summary": ');
      const summaryJson = JSON.stringify(this.summary, null, 2);
      const indentedSummary = summaryJson.split('\n').map((line, idx) => {
        if (idx === 0) return line;
        return `  ${line}`;
      }).join('\n');
      this.fileStream.write(indentedSummary);
    }

    // Close root object
    this.fileStream.write('\n}\n');

    // Close file stream
    this.fileStream.end();
  }
}

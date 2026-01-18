import * as fs from 'fs/promises';
import * as path from 'path';

export interface WorkersInfo {
  available: boolean;
  workers: any[];
  file?: string;
  error?: string;
}

export class WorkersManager {
  private testsDir: string;
  private resultsDir: string;
  private workersFile?: string;

  constructor(testsDir: string, resultsDir: string, workersFile?: string) {
    this.testsDir = testsDir;
    this.resultsDir = resultsDir;
    this.workersFile = workersFile;
  }

  async getWorkers(): Promise<WorkersInfo> {
    try {
      // Try explicit workers file first, then check common locations
      let workersFile = this.workersFile;

      if (!workersFile) {
        // Auto-detect workers.json in common locations
        const searchPaths = [
          path.join(this.testsDir || '.', 'config', 'workers.json'),
          path.join(this.testsDir || '.', 'workers.json'),
          path.join(this.resultsDir, '..', 'config', 'workers.json'),
          path.join(process.cwd(), 'config', 'workers.json'),
          path.join(process.cwd(), 'workers.json')
        ];

        for (const searchPath of searchPaths) {
          try {
            await fs.access(searchPath);
            workersFile = searchPath;
            break;
          } catch {
            // File doesn't exist, try next
          }
        }
      }

      if (!workersFile) {
        return { available: false, workers: [] };
      }

      const content = await fs.readFile(workersFile, 'utf-8');
      const workers = JSON.parse(content);
      return { available: true, workers, file: workersFile };
    } catch (e: any) {
      return { available: false, workers: [], error: e.message };
    }
  }
}

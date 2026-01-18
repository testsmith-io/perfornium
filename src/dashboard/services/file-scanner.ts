import * as fs from 'fs/promises';
import * as path from 'path';
import { TestFile } from '../types';

export class FileScanner {
  private testsDir: string;

  constructor(testsDir: string) {
    this.testsDir = testsDir;
  }

  async scanTestFiles(): Promise<TestFile[]> {
    const tests: TestFile[] = [];
    // Only scan dedicated test directories
    const searchDirs = [
      path.join(this.testsDir, 'tests'),
      path.join(this.testsDir, 'tmp/tests')
    ];

    for (const dir of searchDirs) {
      try {
        await this.scanDirForTests(dir, tests, this.testsDir);
      } catch (e) {
        // Directory might not exist
      }
    }

    return tests.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async scanDirForTests(dir: string, tests: TestFile[], baseDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' &&
            entry.name !== 'data' && entry.name !== 'config' && entry.name !== 'environments') {
          await this.scanDirForTests(fullPath, tests, baseDir);
        } else if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') || entry.name.endsWith('.json'))) {
          // Skip obvious non-test files
          if (entry.name.includes('package') || entry.name.includes('tsconfig') ||
              entry.name.includes('env') || entry.name === 'CNAME' ||
              entry.name.includes('credentials') || entry.name.includes('config')) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');

            // Only include files that look like actual test configs (have scenarios or steps)
            if (!content.includes('scenarios:') && !content.includes('steps:') &&
                !content.includes('"scenarios"') && !content.includes('"steps"')) {
              continue;
            }

            const stat = await fs.stat(fullPath);
            const relativePath = path.relative(baseDir, fullPath);

            // Detect test type from content or path (use forward slashes for cross-platform matching)
            const normalizedPath = fullPath.replace(/\\/g, '/');
            let testType: 'api' | 'web' | 'mixed' = 'api';
            if (content.includes('protocol: web') || content.includes('playwright') || normalizedPath.includes('/web/')) {
              testType = 'web';
            } else if (content.includes('protocol: http') || content.includes('protocol: https') || normalizedPath.includes('/api/')) {
              testType = 'api';
            }

            // Normalize paths to forward slashes for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, '/');

            tests.push({
              name: entry.name.replace(/\.(yml|yaml|json)$/, ''),
              path: fullPath,  // Keep native path for filesystem operations
              relativePath: normalizedRelativePath,  // Use forward slashes for display/URLs
              type: testType,
              lastModified: stat.mtime.toISOString()
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
}

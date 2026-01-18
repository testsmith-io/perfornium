/**
 * Common data utilities for CSV data handling
 */

/**
 * Fisher-Yates shuffle algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Apply variable mapping to transform column names
 */
export function applyVariableMapping(
  row: Record<string, any>,
  mapping?: Record<string, string>
): Record<string, any> {
  if (!mapping) return row;

  const mappedRow: Record<string, any> = { ...row };
  for (const [originalName, newName] of Object.entries(mapping)) {
    if (originalName in row) {
      mappedRow[newName] = row[originalName];
      if (newName !== originalName) {
        delete mappedRow[originalName];
      }
    }
  }
  return mappedRow;
}

/**
 * Filter data rows based on filter configuration
 */
export function filterData(
  data: Record<string, any>[],
  filters: Record<string, any>
): Record<string, any>[] {
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }

  return data.filter(row => {
    for (const [column, condition] of Object.entries(filters)) {
      const value = row[column];

      if (typeof condition === 'object' && condition !== null) {
        // Complex filter conditions
        for (const [operator, expected] of Object.entries(condition)) {
          switch (operator) {
            case 'eq':
            case 'equals':
              if (value !== expected) return false;
              break;
            case 'ne':
            case 'not_equals':
              if (value === expected) return false;
              break;
            case 'gt':
            case 'greater_than':
              if (!(Number(value) > Number(expected))) return false;
              break;
            case 'gte':
            case 'greater_than_or_equal':
              if (!(Number(value) >= Number(expected))) return false;
              break;
            case 'lt':
            case 'less_than':
              if (!(Number(value) < Number(expected))) return false;
              break;
            case 'lte':
            case 'less_than_or_equal':
              if (!(Number(value) <= Number(expected))) return false;
              break;
            case 'contains':
              if (!String(value).includes(String(expected))) return false;
              break;
            case 'starts_with':
              if (!String(value).startsWith(String(expected))) return false;
              break;
            case 'ends_with':
              if (!String(value).endsWith(String(expected))) return false;
              break;
            case 'regex':
            case 'matches':
              if (!new RegExp(String(expected)).test(String(value))) return false;
              break;
            case 'in':
              if (!Array.isArray(expected) || !expected.includes(value)) return false;
              break;
            case 'not_in':
              if (Array.isArray(expected) && expected.includes(value)) return false;
              break;
          }
        }
      } else {
        // Simple equality check
        if (value !== condition) return false;
      }
    }
    return true;
  });
}

/**
 * Base directory for resolving relative file paths
 */
let baseDir: string = process.cwd();

export function setBaseDir(dir: string): void {
  baseDir = dir;
}

export function getBaseDir(): string {
  return baseDir;
}

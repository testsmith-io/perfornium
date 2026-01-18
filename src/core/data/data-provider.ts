import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { logger } from '../../utils/logger';
import { GlobalCSVConfig, DataDistributionPolicy } from '../../config/types/global-config';
import { shuffleArray, applyVariableMapping, getBaseDir, setBaseDir as setBaseDirUtil } from '../../utils/data-utils';

export interface DataRow {
  [key: string]: string | number | boolean;
}

export interface CheckedOutRow {
  row: DataRow;
  vuId: number;
  iteration: number;
  checkoutTime: number;
}

/**
 * Result from getting a data row
 */
export interface DataResult {
  row: DataRow | null;
  exhausted: boolean;
  action?: 'stop_vu' | 'stop_test' | 'no_value';
}

/**
 * Data Provider with full support for:
 * - Simple API: getNextRow, getUniqueRow, getRandomRow (for templates)
 * - Advanced API: getRow with distribution/change policies (for VUs)
 * - Value Change Policy (each_use, each_iteration, each_vu)
 * - Value Distribution (scope: local/global/unique, order: sequential/random/any)
 * - Exhaustion Policy (cycle, stop_vu, stop_test, no_value)
 */
export class DataProvider {
  private static instances: Map<string, DataProvider> = new Map();

  private config: GlobalCSVConfig;
  private filePath: string;
  private data: DataRow[] = [];
  private originalData: DataRow[] = [];
  private isLoaded: boolean = false;

  // Distribution state
  private globalIndex: number = 0;
  private checkedOutRows: Map<string, CheckedOutRow> = new Map();
  private availableIndices: number[] = [];

  // VU-specific caches (for each_vu and each_iteration policies)
  private vuCache: Map<number, DataRow> = new Map();
  private iterationCache: Map<string, DataRow> = new Map();

  // Exhaustion tracking
  private isExhausted: boolean = false;
  private exhaustedVUs: Set<number> = new Set();

  // For simple API compatibility
  private accessCount: number = 0;

  private constructor(config: GlobalCSVConfig) {
    this.config = config;
    this.filePath = path.resolve(getBaseDir(), config.file);
  }

  static getInstance(config: GlobalCSVConfig): DataProvider {
    const key = `${config.file}-${JSON.stringify(config)}`;
    if (!DataProvider.instances.has(key)) {
      DataProvider.instances.set(key, new DataProvider(config));
    }
    return DataProvider.instances.get(key)!;
  }

  static setBaseDir(dir: string): void {
    setBaseDirUtil(dir);
  }

  static clearInstances(): void {
    DataProvider.instances.clear();
  }

  // ===========================================
  // Simple API (for templates and basic usage)
  // ===========================================

  /**
   * Get next row in sequence (cycles by default)
   */
  async getNextRow(vuId: number): Promise<DataRow | null> {
    await this.loadData();

    if (this.originalData.length === 0) {
      logger.warn(`No data available in CSV: ${this.config.file}`);
      return null;
    }

    if (this.config.cycleOnExhaustion === false) {
      if (this.globalIndex >= this.originalData.length) {
        logger.warn(`VU${vuId}: CSV data exhausted in file: ${this.config.file}`);
        return null;
      }
      const row = this.originalData[this.globalIndex];
      this.globalIndex++;
      return applyVariableMapping({ ...row }, this.config.variables);
    }

    // Normal round-robin behavior
    const index = (vuId - 1) % this.originalData.length;
    const row = this.originalData[index];
    logger.debug(`VU${vuId} using CSV row ${index + 1}/${this.originalData.length}`);
    return applyVariableMapping({ ...row }, this.config.variables);
  }

  /**
   * Get unique row (each row used once, then cycles or exhausts)
   */
  async getUniqueRow(vuId: number): Promise<DataRow | null> {
    await this.loadData();

    if (this.data.length === 0) {
      if (this.isExhausted && this.config.cycleOnExhaustion === false) {
        logger.warn(`VU${vuId}: CSV data exhausted and cycling disabled: ${this.config.file}`);
        return null;
      }
      logger.warn(`VU${vuId}: No more data available in CSV: ${this.config.file}`);
      return null;
    }

    const row = this.data.shift()!;
    logger.debug(`VU${vuId} using unique CSV row (${this.data.length} remaining)`);

    if (this.data.length === 0) {
      this.isExhausted = true;
      if (this.config.cycleOnExhaustion !== false) {
        logger.info(`CSV data exhausted, reloading: ${this.config.file}`);
        this.data = [...this.originalData];
        if (this.config.randomize) {
          this.data = shuffleArray(this.data);
        }
        this.isExhausted = false;
      }
    }

    return applyVariableMapping({ ...row }, this.config.variables);
  }

  /**
   * Get random row
   */
  async getRandomRow(vuId: number = 0): Promise<DataRow | null> {
    await this.loadData();

    if (this.originalData.length === 0) {
      logger.warn(`No data available for random selection in CSV: ${this.config.file}`);
      return null;
    }

    if (this.config.cycleOnExhaustion === false) {
      this.accessCount++;
      if (this.accessCount > this.originalData.length) {
        logger.warn(`VU${vuId}: CSV data exhausted in file: ${this.config.file} (random mode)`);
        return null;
      }
    }

    const randomIndex = Math.floor(Math.random() * this.originalData.length);
    const row = this.originalData[randomIndex];
    logger.debug(`VU${vuId} using random CSV row ${randomIndex + 1}/${this.originalData.length}`);
    return applyVariableMapping({ ...row }, this.config.variables);
  }

  // ===========================================
  // Advanced API (for VU data management)
  // ===========================================

  /**
   * Get a data row for a VU with full policy support
   */
  async getRow(vuId: number, iteration: number = 0): Promise<DataResult> {
    await this.loadData();

    if (this.originalData.length === 0) {
      return { row: null, exhausted: true, action: 'no_value' };
    }

    if (this.exhaustedVUs.has(vuId)) {
      return { row: null, exhausted: true, action: 'stop_vu' };
    }

    const changePolicy = this.getChangePolicy();
    const dist = this.getDistribution();

    // Handle caching based on change policy
    if (changePolicy === 'each_vu') {
      if (this.vuCache.has(vuId)) {
        return { row: this.vuCache.get(vuId)!, exhausted: false };
      }
    } else if (changePolicy === 'each_iteration') {
      const cacheKey = `${vuId}-${iteration}`;
      if (this.iterationCache.has(cacheKey)) {
        return { row: this.iterationCache.get(cacheKey)!, exhausted: false };
      }
    }

    const result = await this.getNewRow(vuId, iteration, dist);

    if (result.row) {
      if (changePolicy === 'each_vu') {
        this.vuCache.set(vuId, result.row);
      } else if (changePolicy === 'each_iteration') {
        const cacheKey = `${vuId}-${iteration}`;
        this.iterationCache.set(cacheKey, result.row);
      }
    }

    return result;
  }

  /**
   * Release a checked-out row back to the pool (for unique scope)
   */
  releaseRow(vuId: number, iteration: number): void {
    const dist = this.getDistribution();
    if (dist.scope !== 'unique') return;

    const changePolicy = this.getChangePolicy();

    for (const [indexStr, checkout] of this.checkedOutRows.entries()) {
      if (checkout.vuId === vuId) {
        if (changePolicy === 'each_iteration' && checkout.iteration !== iteration) {
          continue;
        }

        const index = parseInt(indexStr);
        this.checkedOutRows.delete(indexStr);

        const order = dist.order;
        if (order === 'sequential') {
          const insertPos = this.availableIndices.findIndex(i => i > index);
          if (insertPos === -1) {
            this.availableIndices.push(index);
          } else {
            this.availableIndices.splice(insertPos, 0, index);
          }
        } else {
          this.availableIndices.push(index);
        }

        logger.debug(`VU${vuId}: Released row ${index} back to pool (${this.availableIndices.length} available)`);

        if (this.isExhausted && this.availableIndices.length > 0) {
          this.isExhausted = false;
        }
        break;
      }
    }

    if (changePolicy === 'each_iteration') {
      const cacheKey = `${vuId}-${iteration}`;
      this.iterationCache.delete(cacheKey);
    }
  }

  // ===========================================
  // Internal methods
  // ===========================================

  private getDistribution(): Required<DataDistributionPolicy> {
    const dist = this.config.distribution || {};

    let scope = dist.scope || 'global';
    let order = dist.order || 'sequential';
    let onExhausted = dist.on_exhausted || 'cycle';

    if (this.config.randomize && !dist.order) {
      order = 'random';
    }

    if (this.config.cycleOnExhaustion === false && !dist.on_exhausted) {
      onExhausted = 'stop_vu';
    }

    return { scope, order, on_exhausted: onExhausted };
  }

  private getChangePolicy(): 'each_use' | 'each_iteration' | 'each_vu' {
    if (this.config.change_policy) {
      return this.config.change_policy;
    }
    const scope = this.getDistribution().scope;
    if (scope === 'unique') {
      return 'each_iteration';
    }
    return 'each_iteration';
  }

  async loadData(): Promise<void> {
    if (this.isLoaded) return;

    if (!fs.existsSync(this.filePath)) {
      throw new Error(`CSV file not found: ${this.filePath}`);
    }

    logger.info(`Loading CSV data from: ${this.config.file}`);

    const encoding: BufferEncoding = this.config.encoding || 'utf8';
    const csvContent = fs.readFileSync(this.filePath, encoding);

    const parseResult = Papa.parse(csvContent, {
      header: true,
      delimiter: this.config.delimiter || ',',
      skipEmptyLines: this.config.skipEmptyLines !== false,
      dynamicTyping: true,
      delimitersToGuess: [',', '\t', '|', ';']
    });

    if (parseResult.errors.length > 0) {
      logger.warn('CSV parsing warnings:', parseResult.errors);
    }

    this.originalData = parseResult.data as DataRow[];

    if (this.config.skipFirstLine) {
      this.originalData = this.originalData.slice(1);
    }

    if (this.config.columns && this.config.columns.length > 0) {
      this.originalData = this.originalData.map(row => {
        const filtered: DataRow = {};
        for (const col of this.config.columns!) {
          if (row.hasOwnProperty(col)) {
            filtered[col] = row[col];
          }
        }
        return filtered;
      });
    }

    if (this.config.filter) {
      this.originalData = this.filterData(this.originalData, this.config.filter);
    }

    if (this.config.variables) {
      this.originalData = this.originalData.map(row => applyVariableMapping(row, this.config.variables));
    }

    this.data = [...this.originalData];
    this.availableIndices = this.originalData.map((_, i) => i);

    const dist = this.getDistribution();
    if (dist.order === 'random') {
      this.availableIndices = shuffleArray(this.availableIndices);
    }

    this.isLoaded = true;
    logger.info(`Loaded ${this.data.length} rows from CSV: ${this.config.file}`);
  }

  private async getNewRow(
    vuId: number,
    iteration: number,
    dist: Required<DataDistributionPolicy>
  ): Promise<DataResult> {
    switch (dist.scope) {
      case 'local':
        return this.getLocalRow(vuId, dist);
      case 'unique':
        return this.getUniqueRowAdvanced(vuId, iteration, dist);
      case 'global':
      default:
        return this.getGlobalRow(vuId, dist);
    }
  }

  private getLocalRow(vuId: number, dist: Required<DataDistributionPolicy>): DataResult {
    let index: number;
    if (dist.order === 'random') {
      index = Math.floor(Math.random() * this.originalData.length);
    } else {
      index = (vuId - 1) % this.originalData.length;
    }
    const row = { ...this.originalData[index] };
    return { row, exhausted: false };
  }

  private getGlobalRow(vuId: number, dist: Required<DataDistributionPolicy>): DataResult {
    let index: number;

    if (dist.order === 'random') {
      index = Math.floor(Math.random() * this.originalData.length);
    } else {
      index = this.globalIndex % this.originalData.length;
      this.globalIndex++;

      if (this.globalIndex >= this.originalData.length) {
        if (dist.on_exhausted !== 'cycle') {
          return this.handleExhaustion(vuId, dist);
        }
      }
    }

    const row = { ...this.originalData[index] };
    return { row, exhausted: false };
  }

  private getUniqueRowAdvanced(
    vuId: number,
    iteration: number,
    dist: Required<DataDistributionPolicy>
  ): DataResult {
    if (this.availableIndices.length === 0) {
      if (dist.on_exhausted === 'cycle') {
        if (this.checkedOutRows.size > 0) {
          logger.warn(`VU${vuId}: All rows checked out, waiting...`);
          return { row: null, exhausted: false };
        }
        this.availableIndices = this.originalData.map((_, i) => i);
        if (dist.order === 'random') {
          this.availableIndices = shuffleArray(this.availableIndices);
        }
        this.isExhausted = false;
      } else {
        return this.handleExhaustion(vuId, dist);
      }
    }

    let index: number;
    if (dist.order === 'random') {
      const randomPos = Math.floor(Math.random() * this.availableIndices.length);
      index = this.availableIndices.splice(randomPos, 1)[0];
    } else {
      index = this.availableIndices.shift()!;
    }

    this.checkedOutRows.set(index.toString(), {
      row: this.originalData[index],
      vuId,
      iteration,
      checkoutTime: Date.now()
    });

    logger.debug(`VU${vuId}: Checked out row ${index} (${this.availableIndices.length} remaining)`);

    const row = { ...this.originalData[index] };
    return { row, exhausted: false };
  }

  private handleExhaustion(vuId: number, dist: Required<DataDistributionPolicy>): DataResult {
    this.isExhausted = true;

    switch (dist.on_exhausted) {
      case 'stop_test':
        logger.error(`CSV data exhausted - stopping test as configured`);
        return { row: null, exhausted: true, action: 'stop_test' };

      case 'stop_vu':
        logger.warn(`VU${vuId}: CSV data exhausted - stopping this VU`);
        this.exhaustedVUs.add(vuId);
        return { row: null, exhausted: true, action: 'stop_vu' };

      case 'no_value':
        logger.warn(`VU${vuId}: CSV data exhausted - returning no value`);
        return { row: null, exhausted: true, action: 'no_value' };

      case 'cycle':
      default:
        this.globalIndex = 0;
        this.availableIndices = this.originalData.map((_, i) => i);
        if (dist.order === 'random') {
          this.availableIndices = shuffleArray(this.availableIndices);
        }
        this.isExhausted = false;
        logger.info(`CSV data cycled - starting over`);
        const row = { ...this.originalData[0] };
        this.globalIndex = 1;
        return { row, exhausted: false };
    }
  }

  private filterData(data: DataRow[], filterExpression: string): DataRow[] {
    try {
      const operators = ['!=', '>=', '<=', '=', '>', '<'];
      let operator = '';
      let parts: string[] = [];

      for (const op of operators) {
        if (filterExpression.includes(op)) {
          operator = op;
          parts = filterExpression.split(op).map(p => p.trim());
          break;
        }
      }

      if (parts.length !== 2) {
        logger.warn(`Invalid filter expression: ${filterExpression}`);
        return data;
      }

      const [column, value] = parts;
      const filterValue = isNaN(Number(value)) ? value.replace(/['"]/g, '') : Number(value);

      return data.filter(row => {
        const rowValue = row[column];
        switch (operator) {
          case '=': return rowValue == filterValue;
          case '!=': return rowValue != filterValue;
          case '>': return Number(rowValue) > Number(filterValue);
          case '<': return Number(rowValue) < Number(filterValue);
          case '>=': return Number(rowValue) >= Number(filterValue);
          case '<=': return Number(rowValue) <= Number(filterValue);
          default: return true;
        }
      });
    } catch (error) {
      logger.warn(`Error applying filter "${filterExpression}":`, error);
      return data;
    }
  }

  /**
   * Get current status for debugging
   */
  getStatus(): {
    totalRows: number;
    availableRows: number;
    checkedOutRows: number;
    exhausted: boolean;
    exhaustedVUs: number[];
  } {
    return {
      totalRows: this.originalData.length,
      availableRows: this.availableIndices.length,
      checkedOutRows: this.checkedOutRows.size,
      exhausted: this.isExhausted,
      exhaustedVUs: Array.from(this.exhaustedVUs)
    };
  }
}

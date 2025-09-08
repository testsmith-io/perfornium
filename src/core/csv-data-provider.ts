import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { logger } from '../utils/logger';

export interface CSVDataConfig {
  file: string;
  delimiter?: string;
  encoding?: BufferEncoding;
  skipEmptyLines?: boolean;
  skipFirstLine?: boolean;
  columns?: string[];
  filter?: string;
  randomize?: boolean;
  cycleOnExhaustion?: boolean;
}

export interface CSVDataRow {
  [key: string]: string | number | boolean;
}

export class CSVDataProvider {
  private static instances: Map<string, CSVDataProvider> = new Map();
  private static baseDir: string = process.cwd();
  
  private filePath: string;
  private data: CSVDataRow[] = [];
  private originalData: CSVDataRow[] = [];
  private currentIndex: number = 0;
  private config: CSVDataConfig;
  private isLoaded: boolean = false;
  private isExhausted: boolean = false;
  private globalIndex: number = 0; // For sequential tracking across all modes
  private accessCount: number = 0; // For random mode tracking

  // Remove test termination callback - we don't need it anymore
  
  private constructor(filePath: string, config: CSVDataConfig) {
    this.filePath = filePath;
    this.config = config;
  }

  static getInstance(config: CSVDataConfig): CSVDataProvider {
    const fullPath = path.resolve(CSVDataProvider.baseDir, config.file);
    const key = `${fullPath}-${JSON.stringify(config)}`;

    if (!CSVDataProvider.instances.has(key)) {
      CSVDataProvider.instances.set(key, new CSVDataProvider(fullPath, config));
    }

    return CSVDataProvider.instances.get(key)!;
  }

  static setBaseDir(dir: string): void {
    CSVDataProvider.baseDir = dir;
  }

  // ... existing loadData method stays the same ...
  async loadData(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    const fullPath = path.resolve(CSVDataProvider.baseDir, this.config.file);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`CSV file not found: ${fullPath}`);
    }

    logger.info(`📊 Loading CSV data from: ${this.config.file}`);

    const encoding: BufferEncoding = this.config.encoding || 'utf8';
    const csvContent = fs.readFileSync(fullPath, encoding);
    
    const parseConfig = {
      header: true,
      delimiter: this.config.delimiter || ',',
      skipEmptyLines: this.config.skipEmptyLines !== false,
      dynamicTyping: true,
      transformHeader: (header: string) => header.trim(),
      delimitersToGuess: [',', '\t', '|', ';']
    };

    const parseResult = Papa.parse(csvContent, parseConfig);
    
    if (parseResult.errors.length > 0) {
      logger.warn('CSV parsing warnings:', parseResult.errors);
    }

    this.originalData = parseResult.data as CSVDataRow[];
    
    if (this.config.skipFirstLine) {
      this.originalData = this.originalData.slice(1);
    }

    if (this.config.columns && this.config.columns.length > 0) {
      this.originalData = this.originalData.map(row => {
        const filteredRow: CSVDataRow = {};
        for (const col of this.config.columns!) {
          if (row.hasOwnProperty(col)) {
            filteredRow[col] = row[col];
          }
        }
        return filteredRow;
      });
    }

    if (this.config.filter) {
      this.originalData = this.filterData(this.originalData, this.config.filter);
    }

    if (this.config.randomize) {
      this.originalData = this.shuffleArray([...this.originalData]);
    }

    this.data = [...this.originalData];
    this.isLoaded = true;

    logger.info(`📊 Loaded ${this.data.length} rows from CSV: ${this.config.file}`);
  }

  /**
   * Enhanced getNextRow - returns null when exhausted if cycleOnExhaustion is false
   */
  async getNextRow(vuId: number): Promise<CSVDataRow | null> {
    await this.loadData();
    
    if (this.originalData.length === 0) {
      logger.warn(`📊 No data available in CSV: ${this.config.file}`);
      return null;
    }

    // If cycling is disabled, use sequential exhaustible access
    if (this.config.cycleOnExhaustion === false) {
      if (this.globalIndex >= this.originalData.length) {
        logger.warn(`📊 VU${vuId}: CSV data exhausted in file: ${this.config.file} (next mode, cycling disabled)`);
        return null; // Just return null, don't terminate test
      }
      
      const row = this.originalData[this.globalIndex];
      this.globalIndex++;
      
      logger.info(`📊 VU${vuId} using sequential CSV row ${this.globalIndex}/${this.originalData.length}:`, Object.keys(row));
      
      return { ...row };
    } else {
      // Normal round-robin behavior
      const index = (vuId - 1) % this.originalData.length;
      const row = this.originalData[index];
      
      logger.debug(`📊 VU${vuId} using CSV row ${index + 1}/${this.originalData.length}:`, Object.keys(row));
      
      return { ...row };
    }
  }

  /**
   * Enhanced getUniqueRow - returns null when exhausted if cycleOnExhaustion is false
   */
  async getUniqueRow(vuId: number): Promise<CSVDataRow | null> {
    await this.loadData();
    
    if (this.data.length === 0) {
      if (this.isExhausted && this.config.cycleOnExhaustion === false) {
        logger.warn(`📊 VU${vuId}: CSV data exhausted and cycling disabled: ${this.config.file}`);
        return null; // Just return null, don't terminate test
      }
      
      logger.warn(`📊 VU${vuId}: No more data available in CSV: ${this.config.file}`);
      return null;
    }

    const row = this.data.shift()!;
    
    logger.info(`📊 VU${vuId} using unique CSV row (${this.data.length} remaining):`, Object.keys(row));
    
    if (this.data.length === 0) {
      this.isExhausted = true;
      
      if (this.config.cycleOnExhaustion !== false) {
        logger.info(`📊 CSV data exhausted, reloading: ${this.config.file}`);
        this.data = [...this.originalData];
        if (this.config.randomize) {
          this.data = this.shuffleArray(this.data);
        }
        this.isExhausted = false;
        logger.info(`📊 CSV data reloaded: ${this.data.length} rows available`);
      } else {
        logger.warn(`📊 CSV data exhausted, cycling disabled: ${this.config.file} - future requests will return null`);
      }
    }

    return { ...row };
  }

  /**
   * Enhanced getRandomRow - returns null when exhausted if cycleOnExhaustion is false
   */
  async getRandomRow(vuId: number = 0): Promise<CSVDataRow | null> {
    await this.loadData();
    
    if (this.originalData.length === 0) {
      logger.warn(`📊 No data available for random selection in CSV: ${this.config.file}`);
      return null;
    }

    // If cycling is disabled, track accesses and stop after using all data once
    if (this.config.cycleOnExhaustion === false) {
      this.accessCount++;
      
      if (this.accessCount > this.originalData.length) {
        logger.warn(`📊 VU${vuId}: CSV data exhausted in file: ${this.config.file} (random mode, cycling disabled, ${this.accessCount} accesses)`);
        return null; // Just return null, don't terminate test
      }
    }

    const randomIndex = Math.floor(Math.random() * this.originalData.length);
    const row = this.originalData[randomIndex];
    
    logger.debug(`📊 VU${vuId} using random CSV row ${randomIndex + 1}/${this.originalData.length} (access ${this.accessCount}):`, Object.keys(row));
    return { ...row };
  }

  // ... rest of existing methods stay the same ...
  async getAllRows(): Promise<CSVDataRow[]> {
    await this.loadData();
    return [...this.data];
  }

  async getRowCount(): Promise<number> {
    await this.loadData();
    return this.data.length;
  }

  isDataExhausted(): boolean {
    return this.isExhausted && this.config.cycleOnExhaustion === false;
  }

  reset(): void {
    this.data = [...this.originalData];
    this.currentIndex = 0;
    this.isExhausted = false;
    this.globalIndex = 0;
    this.accessCount = 0;
  }

  private filterData(data: CSVDataRow[], filterExpression: string): CSVDataRow[] {
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
          case '=':
            return rowValue == filterValue;
          case '!=':
            return rowValue != filterValue;
          case '>':
            return Number(rowValue) > Number(filterValue);
          case '<':
            return Number(rowValue) < Number(filterValue);
          case '>=':
            return Number(rowValue) >= Number(filterValue);
          case '<=':
            return Number(rowValue) <= Number(filterValue);
          default:
            return true;
        }
      });
    } catch (error) {
      logger.warn(`Error applying filter "${filterExpression}":`, error);
      return data;
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  static clearInstances(): void {
    CSVDataProvider.instances.clear();
  }
}


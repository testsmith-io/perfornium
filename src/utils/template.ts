import { FakerConfig } from '../config/types';
import { DataProvider } from '../core/data';
import { GlobalCSVConfig } from '../config/types/global-config';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { logger } from './logger';
import { TimestampHelper } from './timestamp-helper';
import { fakerManager } from './faker-manager';

export interface TemplateConfig {
  file: string;
  data?: Record<string, any>;
}

export class TemplateProcessor {
  // Static/global configuration shared across all instances
  private static templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private static handlebarHelpersRegistered: boolean = false;
  private static baseDir: string = process.cwd();

  // Instance gets faker from the lazy-loading manager
  private get fakerInstance() {
    return fakerManager.getFaker();
  }

  constructor() {
    this.ensureHandlebarsHelpers();
  }

  /**
   * Configure faker settings globally (affects all instances)
   */
  configureFaker(config: FakerConfig): void {
    logger.debug(`configureFaker called with: ${JSON.stringify(config)}`);
    logger.debug(`Current global locale: ${fakerManager.currentLocale}`);

    const availableLocales = fakerManager.getAvailableLocales();
    if (config.locale && availableLocales.includes(config.locale)) {
      fakerManager.setLocale(config.locale);
      logger.debug(`Global faker locale set to: ${config.locale}`);
    } else if (config.locale) {
      logger.warn(`Locale "${config.locale}" not available. Available: ${availableLocales.join(', ')}`);
    }

    if (config.seed !== undefined) {
      fakerManager.setSeed(config.seed);
      logger.debug(`Global seed set to: ${config.seed}`);
    }
  }

  /**
   * Set base directory for template files
   */
  static setBaseDir(dir: string): void {
    TemplateProcessor.baseDir = dir;
  }

  /**
   * Ensure Handlebars helpers are registered (only once)
   */
  private ensureHandlebarsHelpers(): void {
    if (TemplateProcessor.handlebarHelpersRegistered) {
      return;
    }

    // Faker helpers
    Handlebars.registerHelper('faker', (path: string) => {
      return this.getNestedProperty(this.fakerInstance, path)();
    });

    // Random helpers
    Handlebars.registerHelper('randomInt', (min: number, max: number) => {
      return this.fakerInstance.number.int({ min, max });
    });

    Handlebars.registerHelper('randomChoice', (...args: any[]) => {
      // Remove the last argument (Handlebars options)
      const choices = args.slice(0, -1);
      return this.fakerInstance.helpers.arrayElement(choices);
    });

    Handlebars.registerHelper('uuid', () => {
      return this.fakerInstance.string.uuid();
    });

    Handlebars.registerHelper('timestamp', (format?: string) => {
      const fmt = (format || 'unix') as 'unix' | 'iso' | 'readable' | 'file';
      return TimestampHelper.getTimestamp(fmt);
    });

    Handlebars.registerHelper('isoDate', (days: number = 0) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString();
    });

    // Conditional helpers
    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);

    // Array helpers
    Handlebars.registerHelper('length', (array: any) => array ? array.length : 0);
    Handlebars.registerHelper('first', (array: any) => array && array.length > 0 ? array[0] : null);
    Handlebars.registerHelper('last', (array: any) => array && array.length > 0 ? array[array.length - 1] : null);

    TemplateProcessor.handlebarHelpersRegistered = true;
    logger.debug('Handlebars helpers registered');
  }

  /**
   * Set seed for reproducible data
   */
  setSeed(seed: number): void {
    this.fakerInstance.seed(seed);
  }

  /**
   * Get available locales
   */
  getAvailableLocales(): string[] {
    return fakerManager.getAvailableLocales();
  }

  /**
   * Process template string with faker support (maintains backward compatibility)
   */
  process(template: string, context: Record<string, any>): string {
    // ALWAYS set a unique seed before processing ANY templates
    const vuId = context.vu_id || context.__VU || 1;
    const iteration = context.iteration || context.__ITER || 0;

    // Create a truly unique seed for each call
    const timestamp = Date.now();
    const randomComponent = Math.floor(Math.random() * 10000);
    const uniqueSeed = timestamp + (vuId * 100000) + (iteration * 1000) + randomComponent;

    this.fakerInstance.seed(uniqueSeed);

    // Test the seed immediately
    const testName = this.fakerInstance.person.firstName();
    logger.debug(`VU${vuId} Iter${iteration}: Seed ${uniqueSeed} (locale: ${fakerManager.currentLocale}) -> Test: "${testName}"`);

    // Reset the seed again (in case the test call changed the state)
    this.fakerInstance.seed(uniqueSeed);

    let result = template;

    // Helper functions available in templates
    const helpers = {
      randomInt: (min: number = 1, max: number = 100) => 
        this.fakerInstance.number.int({ min, max }),
      randomFloat: (min: number = 0, max: number = 1, fractionDigits: number = 2) => 
        this.fakerInstance.number.float({ min, max, fractionDigits }),
      randomChoice: (...choices: any[]) => 
        this.fakerInstance.helpers.arrayElement(choices),
      uuid: () => this.fakerInstance.string.uuid(),
      isoDate: (days: number = 0) => {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
      }
    };

    // FIRST: Process all faker expressions and context variables to resolve them
    const processedVariables = { ...context.variables };
    const processedExtractedData = { ...context.extracted_data };

    // Process faker expressions in variables
    for (const [key, value] of Object.entries(processedVariables)) {
      if (typeof value === 'string') {
        processedVariables[key] = this.processFakerAndVariables(value, context, helpers);
      }
    }

    // Process faker expressions in extracted data
    for (const [key, value] of Object.entries(processedExtractedData)) {
      if (typeof value === 'string') {
        processedExtractedData[key] = this.processFakerAndVariables(value, context, helpers);
      }
    }

    // Enhanced context with processed variables
    const enhancedContext = {
      ...context,
      faker: this.fakerInstance,
      variables: processedVariables,
      extracted_data: processedExtractedData,
      ...helpers
    };

    // Process CSV data {{csv:file.csv}} or {{csv:file.csv|mode=unique}}
    result = result.replace(/\{\{csv:([^}]+)\}\}/g, (match, csvSpec) => {
      try {
        const value = this.processCSVData(csvSpec, enhancedContext);
        logger.debug(`VU${vuId} Iter${iteration}: CSV data ${csvSpec} processed`);
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch (error) {
        logger.warn(`Failed to process CSV data "${csvSpec}":`, error);
        return match;
      }
    });

    // Process Handlebars templates {{template:file.json}} with optional data
    result = result.replace(/\{\{template:([^}]+)\}\}/g, (match, templateSpec) => {
      try {
        const value = this.processHandlebarsTemplate(templateSpec, enhancedContext);
        logger.debug(`VU${vuId} Iter${iteration}: Handlebars template ${templateSpec} processed`);
        // The value is already a minified JSON string, return it directly
        // No need to JSON.stringify again as that would double-escape
        return value;
      } catch (error) {
        logger.warn(`Failed to process Handlebars template "${templateSpec}":`, error);
        return match;
      }
    });

    // Process remaining templates with the processed context
    result = this.processFakerAndVariables(result, enhancedContext, helpers);

    return result;
  }

  /**
   * Process faker expressions and variables in a string
   */
  private processFakerAndVariables(template: string, context: Record<string, any>, helpers: Record<string, Function>): string {
    const vuId = context.vu_id || context.__VU || 1;
    const iteration = context.iteration || context.__ITER || 0;
    let result = template;

    // Process environment variables {{env.VAR_NAME}}
    result = result.replace(/\{\{env\.([^}]+)\}\}/g, (match, varName) => {
      return process.env[varName] || '';
    });

    // Process faker expressions {{faker.person.firstName}} or {{faker.person.firstName()}}
    result = result.replace(/\{\{(faker\.[^}]+)\}\}/g, (match, expression) => {
      try {
        const value = this.evaluateFakerExpression(expression);
        logger.debug(`VU${vuId} Iter${iteration}: ${expression} -> "${value}"`);
        return value;
      } catch (error) {
        logger.warn(`Failed to evaluate faker expression "${expression}":`, error);
        return match;
      }
    });

    // Process helper functions {{randomInt(1, 100)}}
    result = result.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*\([^}]*\))\}/g, (match, expression) => {
      try {
        const value = this.evaluateHelperFunction(expression, helpers);
        logger.debug(`VU${vuId} Iter${iteration}: ${expression} -> "${value}"`);
        return value;
      } catch (error) {
        logger.warn(`Failed to evaluate helper function "${expression}":`, error);
        return match;
      }
    });

    // Process context variables {{variable_name}}
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      // Skip if it looks like it was already processed
      if (varName.includes('(') || varName.startsWith('faker.') || varName.startsWith('template:')) {
        return match;
      }

      const keys = varName.split('.');
      let value: any = context;
      
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = (value as any)[key];
        } else {
          return match;
        }
      }
      
      return String(value);
    });

    // Process special variables
    result = result.replace(/\{\{__VU\}\}/g, () => String(context.__VU || 0));
    result = result.replace(/\{\{__ITER\}\}/g, () => String(context.__ITER || 0));
    
    // Enhanced timestamp replacement with file-safe format by default
    result = result.replace(/\{\{timestamp(?::([^}]+))?\}\}/g, (_match, format) => {
      const fmt = (format || 'file') as 'unix' | 'iso' | 'readable' | 'file';
      return TimestampHelper.getTimestamp(fmt);
    });

    return result;
  }

  /**
   * Evaluate faker expressions like faker.person.firstName or faker.person.firstName()
   */
  private evaluateFakerExpression(expression: string): string {
    // Remove 'faker.' prefix
    const path = expression.replace(/^faker\./, '');
    
    logger.debug(`Evaluating faker expression: "${path}" (locale: ${fakerManager.currentLocale})`);
    
    // Check if it's a function call
    const funcMatch = path.match(/^(.+)\(\)$/);
    if (funcMatch) {
      // It's a function call like person.firstName()
      const funcPath = funcMatch[1];
      const func = this.getNestedProperty(this.fakerInstance, funcPath);
      if (typeof func === 'function') {
        const result = String(func());
        logger.debug(`Function call ${funcPath}() -> "${result}"`);
        return result;
      }
    } else {
      // It's a property access like person.firstName (also call it as function)
      const func = this.getNestedProperty(this.fakerInstance, path);
      if (typeof func === 'function') {
        const result = String(func());
        logger.debug(`Property access ${path} -> "${result}"`);
        return result;
      }
    }
    
    throw new Error(`Faker method not found: ${expression}`);
  }

  /**
   * Load and compile a Handlebars template file
   */
  private loadTemplate(templatePath: string): HandlebarsTemplateDelegate {
    const fullPath = path.resolve(TemplateProcessor.baseDir, templatePath);
    
    if (TemplateProcessor.templateCache.has(fullPath)) {
      return TemplateProcessor.templateCache.get(fullPath)!;
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template file not found: ${fullPath}`);
    }

    const templateContent = fs.readFileSync(fullPath, 'utf8');
    const compiledTemplate = Handlebars.compile(templateContent);
    
    TemplateProcessor.templateCache.set(fullPath, compiledTemplate);
    logger.debug(`Template compiled and cached: ${templatePath}`);
    return compiledTemplate;
  }

  /**
   * Process Handlebars template specification
   */
  private processHandlebarsTemplate(templateSpec: string, context: any): any {
    // Parse template specification: "file.json" or "file.json|data=value,key=value"
    const [templateFile, dataSpec] = templateSpec.split('|');
    
    const templateConfig: TemplateConfig = {
      file: templateFile.trim(),
      data: {}
    };

    // Parse data specification if provided
    if (dataSpec) {
      const dataPairs = dataSpec.split(',');
      for (const pair of dataPairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
          // Try to parse value as JSON, fallback to string
          try {
            templateConfig.data![key] = JSON.parse(value);
          } catch {
            templateConfig.data![key] = value;
          }
        }
      }
    }

    return this.processTemplate(templateConfig, context);
  }

  /**
   * Process CSV data specification
   */
  private processCSVData(csvSpec: string, context: any): any {
    // Parse CSV specification: "file.csv" or "file.csv|mode=unique,column=email"
    const [csvFile, optionsSpec] = csvSpec.split('|');
    
    const csvConfig: GlobalCSVConfig = {
      file: csvFile.trim(),
      cycleOnExhaustion: true // Default to cycle
    };

    let mode = 'next'; // default mode
    let column: string | undefined;

    // Parse options if provided
    if (optionsSpec) {
      const options = optionsSpec.split(',');
      for (const option of options) {
        const [key, value] = option.split('=').map(s => s.trim());
        if (key === 'mode') {
          mode = value;
        } else if (key === 'column') {
          column = value;
        } else if (key === 'delimiter') {
          csvConfig.delimiter = value;
        } else if (key === 'filter') {
          csvConfig.filter = value;
        } else if (key === 'randomize') {
          csvConfig.randomize = value === 'true';
        }
      }
    }

    const csvProvider = DataProvider.getInstance(csvConfig);
    const vuId = context.vu_id || context.__VU || 1;

    // This returns a Promise, but we need sync processing for string replacement
    // We'll need to handle this differently - see the async version below
    return this.processCSVDataSync(csvProvider, mode, column, vuId);
  }

  /**
   * Synchronous CSV data processing (cached approach)
   */
  private processCSVDataSync(csvProvider: DataProvider, mode: string, column: string | undefined, vuId: number): any {
    // For now, return a placeholder that will be resolved later
    // In a real implementation, you'd want to pre-load CSV data
    return `CSV_DATA_${vuId}_${mode}_${column || 'all'}`;
  }

  /**
   * Process a template with data
   */
  private processTemplate(templateConfig: TemplateConfig, context: Record<string, any>): string {
    const template = this.loadTemplate(templateConfig.file);
    
    // Merge data sources: processed variables + extracted data + template data
    const templateData = {
      ...context.variables,      // These are now processed (faker expressions resolved)
      ...context.extracted_data, // These are now processed
      ...templateConfig.data,    // Inline overrides
      // Add context info
      vu_id: context.vu_id,
      iteration: context.iteration,
      timestamp: Date.now(),
    };

    logger.debug(`Processing Handlebars template: ${templateConfig.file}`);

    const result = template(templateData);
    logger.debug(`Raw template result: ${result}`);
    
    // If the result looks like JSON, minify it to remove line breaks
    const trimmed = result.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        // Parse and re-stringify to minify (remove whitespace/line breaks)
        const parsed = JSON.parse(trimmed);
        const minified = JSON.stringify(parsed);
        logger.debug(`Minified JSON result: ${minified}`);
        
        // IMPORTANT: When returning JSON as a string to be embedded in another JSON,
        // we need to escape it properly. JSON.stringify will handle the escaping.
        const escaped = JSON.stringify(minified);
        // Remove the outer quotes that JSON.stringify adds
        const escapedContent = escaped.slice(1, -1);
        logger.debug(`Escaped for embedding: ${escapedContent}`);
        return escapedContent;
      } catch (error) {
        logger.warn(`Failed to minify JSON, returning original:`, error);
        return result;
      }
    }
    
    // For non-JSON content, return as-is
    return result;
  }

  /**
   * Clear template cache (useful for development)
   */
  static clearCache(): void {
    TemplateProcessor.templateCache.clear();
    logger.debug('Template cache cleared');
  }

  /**
   * Evaluate helper functions like randomInt(1, 100)
   */
  private evaluateHelperFunction(expression: string, helpers: Record<string, Function>): string {
    const funcMatch = expression.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
    if (!funcMatch) {
      throw new Error(`Invalid function call: ${expression}`);
    }

    const [, funcName, argsStr] = funcMatch;
    const func = helpers[funcName];
    
    if (typeof func !== 'function') {
      throw new Error(`Function not found: ${funcName}`);
    }

    // Parse arguments (simple implementation)
    const args = this.parseArguments(argsStr);
    return String(func(...args));
  }

  /**
   * Parse function arguments
   */
  private parseArguments(argsStr: string): any[] {
    if (!argsStr.trim()) {
      return [];
    }

    return argsStr.split(',').map(arg => {
      const trimmed = arg.trim();
      
      // String literal
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }
      // Number
      else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
      }
      // Boolean
      else if (trimmed === 'true' || trimmed === 'false') {
        return trimmed === 'true';
      }
      // Default to string
      else {
        return trimmed;
      }
    });
  }

  /**
   * Get nested property from object
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current: any, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as any)[key];
      }
      throw new Error(`Property "${key}" not found in path "${path}"`);
    }, obj);
  }
}
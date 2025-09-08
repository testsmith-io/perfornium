import { faker, fakerDE, fakerFR, fakerES, fakerNL } from '@faker-js/faker';
import { FakerConfig } from '../config/types';
import { CSVDataProvider, CSVDataConfig } from '../core/csv-data-provider';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

export interface TemplateConfig {
  file: string;
  data?: Record<string, any>;
}

export class TemplateProcessor {
  // Static/global configuration shared across all instances
  private static globalLocale: string = 'en';
  private static globalSeed: number | undefined;
  private static availableLocales: Record<string, any> = {
    'en': faker,
    'de': fakerDE,
    'fr': fakerFR,
    'es': fakerES,
    'nl': fakerNL
  };
  private static templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private static handlebarHelpersRegistered: boolean = false;
  private static baseDir: string = process.cwd();

  // Instance gets the correct faker based on global locale
  private get fakerInstance() {
    return TemplateProcessor.availableLocales[TemplateProcessor.globalLocale] || faker;
  }

  constructor() {
    this.ensureHandlebarsHelpers();
  }

  /**
   * Configure faker settings globally (affects all instances)
   */
  configureFaker(config: FakerConfig): void {
    console.log(`🔧 configureFaker called with:`, config);
    console.log(`🔧 Current global locale: ${TemplateProcessor.globalLocale}`);
    
    if (config.locale && TemplateProcessor.availableLocales[config.locale]) {
      TemplateProcessor.globalLocale = config.locale;
      console.log(`🌍 Global faker locale set to: ${config.locale}`);
      console.log(`🌍 All TemplateProcessor instances will now use: ${this.fakerInstance.constructor.name}`);
    } else if (config.locale) {
      console.warn(`🌍 Locale "${config.locale}" not available. Available: ${Object.keys(TemplateProcessor.availableLocales).join(', ')}`);
    }
    
    if (config.seed !== undefined) {
      TemplateProcessor.globalSeed = config.seed;
      console.log(`🎲 Global seed set to: ${config.seed}`);
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

    Handlebars.registerHelper('timestamp', () => {
      return Date.now();
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
    console.log('📝 Handlebars helpers registered');
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
    return Object.keys(TemplateProcessor.availableLocales);
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
    const baseSeed = TemplateProcessor.globalSeed || 0;
    const uniqueSeed = timestamp + (vuId * 100000) + (iteration * 1000) + randomComponent + baseSeed;
    
    this.fakerInstance.seed(uniqueSeed);
    
    // Test the seed immediately
    const testName = this.fakerInstance.person.firstName();
    console.log(`🎲 VU${vuId} Iter${iteration}: Seed ${uniqueSeed} (locale: ${TemplateProcessor.globalLocale}) -> Test: "${testName}"`);
    
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
    let processedVariables = { ...context.variables };
    let processedExtractedData = { ...context.extracted_data };

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
        console.log(`📊 VU${vuId} Iter${iteration}: CSV data ${csvSpec} processed`);
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch (error) {
        console.warn(`Failed to process CSV data "${csvSpec}":`, error);
        return match;
      }
    });

    // Process Handlebars templates {{template:file.json}} with optional data
    result = result.replace(/\{\{template:([^}]+)\}\}/g, (match, templateSpec) => {
      try {
        const value = this.processHandlebarsTemplate(templateSpec, enhancedContext);
        console.log(`🎨 VU${vuId} Iter${iteration}: Handlebars template ${templateSpec} processed`);
        // The value is already a minified JSON string, return it directly
        // No need to JSON.stringify again as that would double-escape
        return value;
      } catch (error) {
        console.warn(`Failed to process Handlebars template "${templateSpec}":`, error);
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
        console.log(`🎭 VU${vuId} Iter${iteration}: ${expression} -> "${value}"`);
        return value;
      } catch (error) {
        console.warn(`Failed to evaluate faker expression "${expression}":`, error);
        return match;
      }
    });

    // Process helper functions {{randomInt(1, 100)}}
    result = result.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*\([^}]*\))\}/g, (match, expression) => {
      try {
        const value = this.evaluateHelperFunction(expression, helpers);
        console.log(`🔧 VU${vuId} Iter${iteration}: ${expression} -> "${value}"`);
        return value;
      } catch (error) {
        console.warn(`Failed to evaluate helper function "${expression}":`, error);
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
    result = result.replace(/\{\{timestamp\}\}/g, () => Date.now().toString());

    return result;
  }

  /**
   * Evaluate faker expressions like faker.person.firstName or faker.person.firstName()
   */
  private evaluateFakerExpression(expression: string): string {
    // Remove 'faker.' prefix
    const path = expression.replace(/^faker\./, '');
    
    console.log(`🔍 About to evaluate: "${path}"`);
    console.log(`🔍 Global locale: ${TemplateProcessor.globalLocale}`);
    console.log(`🔍 Faker instance type: ${this.fakerInstance.constructor.name}`);
    console.log(`🔍 Is English faker? ${this.fakerInstance === faker}`);
    console.log(`🔍 Is German faker? ${this.fakerInstance === TemplateProcessor.availableLocales['de']}`);
    console.log(`🔍 Current locale instance:`, Object.keys(TemplateProcessor.availableLocales).find(key => TemplateProcessor.availableLocales[key] === this.fakerInstance) || 'unknown');
    
    // Check if it's a function call
    const funcMatch = path.match(/^(.+)\(\)$/);
    if (funcMatch) {
      // It's a function call like person.firstName()
      const funcPath = funcMatch[1];
      const func = this.getNestedProperty(this.fakerInstance, funcPath);
      if (typeof func === 'function') {
        const result = String(func());
        console.log(`🔍 Function call ${funcPath}() -> "${result}"`);
        return result;
      }
    } else {
      // It's a property access like person.firstName (also call it as function)
      const func = this.getNestedProperty(this.fakerInstance, path);
      if (typeof func === 'function') {
        const result = String(func());
        console.log(`🔍 Property access ${path} -> "${result}"`);
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
    console.log(`📝 Template compiled and cached: ${templatePath}`);
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
    
    const csvConfig: CSVDataConfig = {
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

    const csvProvider = CSVDataProvider.getInstance(csvConfig);
    const vuId = context.vu_id || context.__VU || 1;

    // This returns a Promise, but we need sync processing for string replacement
    // We'll need to handle this differently - see the async version below
    return this.processCSVDataSync(csvProvider, mode, column, vuId);
  }

  /**
   * Synchronous CSV data processing (cached approach)
   */
  private processCSVDataSync(csvProvider: CSVDataProvider, mode: string, column: string | undefined, vuId: number): any {
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

    console.log(`🎨 Processing Handlebars template: ${templateConfig.file}`);
    console.log(`🎨 Template data:`, JSON.stringify(templateData, null, 2));

    const result = template(templateData);
    console.log(`🎨 Raw template result:`, result);
    
    // If the result looks like JSON, minify it to remove line breaks
    const trimmed = result.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        // Parse and re-stringify to minify (remove whitespace/line breaks)
        const parsed = JSON.parse(trimmed);
        const minified = JSON.stringify(parsed);
        console.log(`🎨 Minified JSON result:`, minified);
        
        // IMPORTANT: When returning JSON as a string to be embedded in another JSON,
        // we need to escape it properly. JSON.stringify will handle the escaping.
        const escaped = JSON.stringify(minified);
        // Remove the outer quotes that JSON.stringify adds
        const escapedContent = escaped.slice(1, -1);
        console.log(`🎨 Escaped for embedding:`, escapedContent);
        return escapedContent;
      } catch (error) {
        console.warn(`🎨 Failed to minify JSON, returning original:`, error);
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
    console.log('📝 Template cache cleared');
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
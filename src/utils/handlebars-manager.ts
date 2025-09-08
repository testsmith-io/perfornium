import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { faker } from '@faker-js/faker';

export interface TemplateConfig {
  file: string;
  data?: Record<string, any>;
  helpers?: Record<string, any>;
}

export class HandlebarsTemplateManager {
  private static instance: HandlebarsTemplateManager;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private baseDir: string = process.cwd();

  private constructor() {
    this.registerDefaultHelpers();
  }

  static getInstance(): HandlebarsTemplateManager {
    if (!HandlebarsTemplateManager.instance) {
      HandlebarsTemplateManager.instance = new HandlebarsTemplateManager();
    }
    return HandlebarsTemplateManager.instance;
  }

  /**
   * Set the base directory for template files
   */
  setBaseDir(dir: string): void {
    this.baseDir = dir;
  }

  /**
   * Register default Handlebars helpers for faker and utilities
   */
  private registerDefaultHelpers(): void {
    // Faker helpers
    Handlebars.registerHelper('faker', (path: string) => {
      return this.getNestedProperty(faker, path)();
    });

    // Random helpers
    Handlebars.registerHelper('randomInt', (min: number, max: number) => {
      return faker.number.int({ min, max });
    });

    Handlebars.registerHelper('randomChoice', (...args) => {
      // Remove the last argument (Handlebars options)
      const choices = args.slice(0, -1);
      return faker.helpers.arrayElement(choices);
    });

    Handlebars.registerHelper('uuid', () => {
      return faker.string.uuid();
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
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('lt', (a, b) => a < b);

    // Array helpers
    Handlebars.registerHelper('length', (array) => array ? array.length : 0);
    Handlebars.registerHelper('first', (array) => array && array.length > 0 ? array[0] : null);
    Handlebars.registerHelper('last', (array) => array && array.length > 0 ? array[array.length - 1] : null);
  }

  /**
   * Register custom helpers
   */
  registerHelper(name: string, helper: Handlebars.HelperDelegate): void {
    Handlebars.registerHelper(name, helper);
  }

  /**
   * Load and compile a template file
   */
  private loadTemplate(templatePath: string): HandlebarsTemplateDelegate {
    const fullPath = path.resolve(this.baseDir, templatePath);
    
    if (this.templateCache.has(fullPath)) {
      return this.templateCache.get(fullPath)!;
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template file not found: ${fullPath}`);
    }

    const templateContent = fs.readFileSync(fullPath, 'utf8');
    const compiledTemplate = Handlebars.compile(templateContent);
    
    this.templateCache.set(fullPath, compiledTemplate);
    return compiledTemplate;
  }

  /**
   * Process a template with data
   */
  processTemplate(templateConfig: TemplateConfig, context: Record<string, any>): any {
    const template = this.loadTemplate(templateConfig.file);
    
    // Merge data sources: template data + context + extracted data
    const templateData = {
      ...context.variables,
      ...context.extracted_data,
      ...templateConfig.data,
      // Add context info
      vu_id: context.vu_id,
      iteration: context.iteration,
      timestamp: Date.now(),
    };

    console.log(`🎨 Processing Handlebars template: ${templateConfig.file}`);
    console.log(`🎨 Template data:`, JSON.stringify(templateData, null, 2));

    const result = template(templateData);
    
    try {
      // Try to parse as JSON if it looks like JSON
      const trimmed = result.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(result);
      }
      return result;
    } catch (error) {
      // If JSON parsing fails, return as string
      return result;
    }
  }

  /**
   * Clear template cache (useful for development)
   */
  clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get nested property from object
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return current[key];
      }
      throw new Error(`Property "${key}" not found in path "${path}"`);
    }, obj);
  }
}

// Export singleton instance
export const handlebarsManager = HandlebarsTemplateManager.getInstance();
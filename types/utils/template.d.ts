import { FakerConfig } from '../config/types';
export interface TemplateConfig {
    file: string;
    data?: Record<string, any>;
}
export declare class TemplateProcessor {
    private static globalLocale;
    private static globalSeed;
    private static availableLocales;
    private static templateCache;
    private static handlebarHelpersRegistered;
    private static baseDir;
    private get fakerInstance();
    constructor();
    /**
     * Configure faker settings globally (affects all instances)
     */
    configureFaker(config: FakerConfig): void;
    /**
     * Set base directory for template files
     */
    static setBaseDir(dir: string): void;
    /**
     * Ensure Handlebars helpers are registered (only once)
     */
    private ensureHandlebarsHelpers;
    /**
     * Set seed for reproducible data
     */
    setSeed(seed: number): void;
    /**
     * Get available locales
     */
    getAvailableLocales(): string[];
    /**
     * Process template string with faker support (maintains backward compatibility)
     */
    process(template: string, context: Record<string, any>): string;
    /**
     * Process faker expressions and variables in a string
     */
    private processFakerAndVariables;
    /**
     * Evaluate faker expressions like faker.person.firstName or faker.person.firstName()
     */
    private evaluateFakerExpression;
    /**
     * Load and compile a Handlebars template file
     */
    private loadTemplate;
    /**
     * Process Handlebars template specification
     */
    private processHandlebarsTemplate;
    /**
     * Process CSV data specification
     */
    private processCSVData;
    /**
     * Synchronous CSV data processing (cached approach)
     */
    private processCSVDataSync;
    /**
     * Process a template with data
     */
    private processTemplate;
    /**
     * Clear template cache (useful for development)
     */
    static clearCache(): void;
    /**
     * Evaluate helper functions like randomInt(1, 100)
     */
    private evaluateHelperFunction;
    /**
     * Parse function arguments
     */
    private parseArguments;
    /**
     * Get nested property from object
     */
    private getNestedProperty;
}

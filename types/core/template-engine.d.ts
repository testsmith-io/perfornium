import { faker, Faker } from '@faker-js/faker';
export interface TemplateContext {
    vu_id: number;
    iteration: number;
    variables: Record<string, any>;
    extracted_data: Record<string, any>;
    faker: typeof faker;
}
export declare class TemplateEngine {
    private static instance;
    private customFunctions;
    private fakerInstance;
    private availableLocales;
    private constructor();
    private setupLocales;
    static getInstance(): TemplateEngine;
    private setupCustomFunctions;
    /**
     * Process a value that might contain templates
     */
    processValue(value: any, context: TemplateContext): any;
    /**
     * Process a string with template placeholders
     */
    private processString;
    /**
     * Evaluate a template expression
     */
    private evaluateExpression;
    /**
     * Get nested property from object using dot notation
     */
    private getNestedProperty;
    /**
     * Evaluate function calls in expressions
     */
    private evaluateFunction;
    /**
     * Parse function arguments from string
     */
    private parseArguments;
    /**
     * Set seed for reproducible fake data
     */
    setSeed(seed: number): void;
    /**
     * Set locale for faker - this switches to a different faker instance
     */
    setLocale(locale: string): void;
    /**
     * Get available locales
     */
    getAvailableLocales(): string[];
    /**
     * Get current faker instance
     */
    getFaker(): Faker;
    /**
     * Register a custom function
     */
    registerFunction(name: string, func: Function): void;
}
export declare const templateEngine: TemplateEngine;

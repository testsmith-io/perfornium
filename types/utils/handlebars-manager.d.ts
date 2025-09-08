import * as Handlebars from 'handlebars';
export interface TemplateConfig {
    file: string;
    data?: Record<string, any>;
    helpers?: Record<string, any>;
}
export declare class HandlebarsTemplateManager {
    private static instance;
    private templateCache;
    private baseDir;
    private constructor();
    static getInstance(): HandlebarsTemplateManager;
    /**
     * Set the base directory for template files
     */
    setBaseDir(dir: string): void;
    /**
     * Register default Handlebars helpers for faker and utilities
     */
    private registerDefaultHelpers;
    /**
     * Register custom helpers
     */
    registerHelper(name: string, helper: Handlebars.HelperDelegate): void;
    /**
     * Load and compile a template file
     */
    private loadTemplate;
    /**
     * Process a template with data
     */
    processTemplate(templateConfig: TemplateConfig, context: Record<string, any>): any;
    /**
     * Clear template cache (useful for development)
     */
    clearCache(): void;
    /**
     * Get nested property from object
     */
    private getNestedProperty;
}
export declare const handlebarsManager: HandlebarsTemplateManager;

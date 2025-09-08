import { TestConfiguration } from './types';
import { TemplateProcessor } from '../utils/template';
export declare class ConfigParser {
    private templateProcessor;
    parse(configPath: string, environment?: string): Promise<TestConfiguration>;
    private setupBaseDirectories;
    private setupFaker;
    private parseContent;
    private validateRequiredFields;
    private validateCSVConfig;
    private loadEnvironmentConfig;
    private mergeConfigs;
    processTemplates(config: TestConfiguration, context: Record<string, any>): TestConfiguration;
    getTemplateProcessor(): TemplateProcessor;
}

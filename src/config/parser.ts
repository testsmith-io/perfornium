import * as YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import {ReportConfig, TestConfiguration} from './types';
import {TemplateProcessor} from '../utils/template';
import {CSVDataProvider} from '../core/csv-data-provider';

export class ConfigParser {
  private templateProcessor = new TemplateProcessor();

  async parse(configPath: string, environment?: string): Promise<TestConfiguration> {
    console.log('🔍 ConfigParser.parse called with:', configPath, environment);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = this.parseContent(configContent);

    console.log('🔍 Parsed config.global:', JSON.stringify(config.global, null, 2));

    // Setup faker configuration if specified
    console.log('🔍 About to setup faker...');
    this.setupFaker(config);
    console.log('🔍 Faker setup completed');

    // Setup base directories for CSV and templates if needed
    this.setupBaseDirectories(config, configPath);

    // Validate required fields (now includes CSV validation)
    this.validateRequiredFields(config);

    if (environment) {
      const envConfig = await this.loadEnvironmentConfig(environment, path.dirname(configPath));
      return this.mergeConfigs(config, envConfig);
    }

    return config;
  }

  private setupBaseDirectories(config: TestConfiguration, configPath: string): void {
    let baseDir = path.dirname(configPath);

    // Walk up directories to find templates folder
    let currentDir = baseDir;
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, 'templates'))) {
        baseDir = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    // Rest of your existing logic...
    const hasCSVScenarios = config.scenarios?.some((s: any) => s.csv_data);
    const configStr = JSON.stringify(config);
    const hasTemplates = configStr.includes('{{template:') || configStr.includes('{{csv:');

    if (hasCSVScenarios || hasTemplates) {
      CSVDataProvider.setBaseDir(baseDir);
      TemplateProcessor.setBaseDir(baseDir);
      console.log(`Set base directory for CSV/templates: ${baseDir}`);
    }
  }

  private setupFaker(config: TestConfiguration): void {
    console.log('🔍 ConfigParser.setupFaker called');
    console.log('🔍 config.global:', JSON.stringify(config.global, null, 2));

    if (config.global?.faker) {
      console.log('🔍 Found faker config:', config.global.faker);
      console.log('🔍 About to call configureFaker...');
      this.templateProcessor.configureFaker(config.global.faker);
      console.log('🔍 configureFaker call completed');
    } else {
      console.log('🔍 No faker config found in global');
    }
  }

  private parseContent(content: string): TestConfiguration {
    const trimmed = content.trim();

    if (trimmed.startsWith('{')) {
      return JSON.parse(content);
    } else {
      return YAML.parse(content);
    }
  }

  private validateRequiredFields(config: any): void {
    const requiredFields = ['name', 'load', 'scenarios'];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }

    if (!config.scenarios || config.scenarios.length === 0) {
      throw new Error('At least one scenario must be defined');
    }

    // Validate CSV configurations in scenarios
    for (const scenario of config.scenarios) {
      if (scenario.csv_data) {
        this.validateCSVConfig(scenario.csv_data, scenario.name);
      }
    }

    if (config.global?.faker?.locale) {
      const supportedLocales = this.templateProcessor.getAvailableLocales();
      if (!supportedLocales.includes(config.global.faker.locale)) {
        throw new Error(`Unsupported faker locale: ${config.global.faker.locale}. Supported locales: ${supportedLocales.join(', ')}`);
      }
    }
  }

  private validateCSVConfig(csvConfig: any, scenarioName: string): void {
    if (!csvConfig.file) {
      throw new Error(`CSV configuration missing 'file' property in scenario: ${scenarioName}`);
    }

    // Validate csv_mode if specified
    const validModes = ['next', 'unique', 'random'];
    if (csvConfig.mode && !validModes.includes(csvConfig.mode)) {
      throw new Error(`Invalid csv_mode '${csvConfig.mode}' in scenario ${scenarioName}. Valid modes: ${validModes.join(', ')}`);
    }

    // Validate encoding if specified
    const validEncodings = ['utf8', 'utf-8', 'ascii', 'latin1', 'base64', 'hex'];
    if (csvConfig.encoding && !validEncodings.includes(csvConfig.encoding)) {
      console.warn(`Warning: Encoding '${csvConfig.encoding}' may not be supported in scenario ${scenarioName}`);
    }
  }

  private async loadEnvironmentConfig(environment: string, baseDir: string): Promise<Partial<TestConfiguration>> {
    const envPaths = [
      path.join(baseDir, 'config', 'environments', `${environment}.yml`),
      path.join(baseDir, 'config', 'environments', `${environment}.yaml`),
      path.join(baseDir, 'config', 'environments', `${environment}.json`),
      path.join(baseDir, `${environment}.yml`),
      path.join(baseDir, `${environment}.yaml`),
      path.join(baseDir, `${environment}.json`)
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        return this.parseContent(envContent);
      }
    }

    throw new Error(`Environment configuration not found for: ${environment}. Searched paths: ${envPaths.join(', ')}`);
  }

  private mergeConfigs(base: TestConfiguration, env: Partial<TestConfiguration>): TestConfiguration {
    const mergeReportConfig = (baseReport?: ReportConfig, envReport?: Partial<ReportConfig>): ReportConfig | undefined => {
      if (!baseReport && !envReport) return undefined;

      return {
        generate: false,
        output: 'report.html',
        ...baseReport,
        ...envReport
      };
    };

    return {
      ...base,
      global: { ...base.global, ...env.global },
      load: { ...base.load, ...env.load },
      scenarios: env.scenarios || base.scenarios,
      outputs: env.outputs || base.outputs,
      report: mergeReportConfig(base.report, env.report),
      // Simple merge for workers - let TypeScript infer the type
      workers: env.workers || base.workers
    };
  }

  processTemplates(config: TestConfiguration, context: Record<string, any>): TestConfiguration {
    const configStr = JSON.stringify(config);
    return JSON.parse(configStr);
  }

  getTemplateProcessor(): TemplateProcessor {
    return this.templateProcessor;
  }
}
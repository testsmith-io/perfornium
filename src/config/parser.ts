// Updated ConfigParser to support both YAML and TypeScript

import * as YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { ReportConfig, TestConfiguration } from './types';
import { TemplateProcessor } from '../utils/template';
import { CSVDataProvider } from '../core';
import { logger } from '../utils/logger';

export class ConfigParser {
  private templateProcessor = new TemplateProcessor();

  async parse(configPath: string, environment?: string): Promise<TestConfiguration> {
    logger.debug(`ConfigParser.parse called with: ${configPath}, ${environment}`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    let config: TestConfiguration;

    // Determine file type and parse accordingly
    const ext = path.extname(configPath).toLowerCase();

    if (ext === '.ts' || ext === '.js') {
      // Handle TypeScript/JavaScript files
      config = await this.parseTypeScript(configPath);
    } else {
      // Handle YAML/JSON files
      const configContent = fs.readFileSync(configPath, 'utf8');
      config = this.parseContent(configContent);
    }

    logger.debug(`Parsed config.global: ${JSON.stringify(config.global, null, 2)}`);

    // Setup faker configuration if specified
    logger.debug('About to setup faker...');
    this.setupFaker(config);
    logger.debug('Faker setup completed');

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

  private async parseTypeScript(configPath: string): Promise<TestConfiguration> {
    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(configPath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`);
      }

      let module: any;

      if (absolutePath.endsWith('.ts')) {
        // For TypeScript files, we need proper transpilation support
        try {
          // Try to use ts-node/register for TypeScript support
          require('ts-node/register');
        } catch {
          // If ts-node is not globally available, try to use it from local node_modules
          try {
            const tsNodePath = require.resolve('ts-node/register', { paths: [process.cwd()] });
            require(tsNodePath);
          } catch {
            // If ts-node still not found, provide helpful error
            logger.warn('ts-node not found. Installing it will enable TypeScript imports.');
            logger.warn('Install with: npm install --save-dev ts-node typescript');
            logger.warn('Attempting to run as plain JavaScript...');
          }
        }

        // Clear require cache
        if (require.cache[absolutePath]) {
          delete require.cache[absolutePath];
        }

        try {
          // Try to require the file
          module = require(absolutePath);
        } catch (error: any) {
          // If it fails with import/export errors, try alternative approaches
          if (error.message.includes('Cannot use import statement') ||
              error.message.includes('Unexpected token')) {

            // Check if this is a plain config file (no imports) or a DSL file (with imports)
            const fileContent = fs.readFileSync(absolutePath, 'utf8');
            const hasImports = fileContent.includes('import ') || fileContent.includes('export ');

            if (hasImports) {
              // This is a DSL file with imports - it needs ts-node
              throw new Error(
                  'TypeScript file contains imports and requires ts-node for execution.\n' +
                  'Please install it:\n' +
                  '  npm install --save-dev ts-node typescript\n' +
                  'Or globally:\n' +
                  '  npm install -g ts-node typescript\n\n' +
                  'Then run your test again.'
              );
            } else {
              // This is a plain config file - we can evaluate it
              module = this.evaluatePlainTypeScript(fileContent, absolutePath);
            }
          } else {
            throw error;
          }
        }
      } else {
        // Regular JavaScript file
        module = require(absolutePath);
      }

      // Handle different export styles
      let config: TestConfiguration;

      if (module && module.default) {
        config = module.default;
      } else if (module && module.config) {
        config = module.config;
      } else if (typeof module === 'object' && module.name) {
        config = module as TestConfiguration;
      } else {
        throw new Error('File must export a TestConfiguration object as default or named "config"');
      }

      // If it's a builder or has a build method, build it
      if (typeof config === 'object' && 'build' in config && typeof config.build === 'function') {
        config = config.build();
      }

      return config;
    } catch (error: any) {
      // Improve error messages
      if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('perfornium')) {
        throw new Error(
            'Cannot find perfornium modules. Make sure you are importing from the correct path:\n' +
            '  import { test } from "perfornium/dsl";\n' +
            'Or if running from source:\n' +
            '  import { test } from "./src/dsl";\n\n' +
            'Original error: ' + error.message
        );
      }
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  private evaluatePlainTypeScript(fileContent: string, absolutePath: string): any {
    // Create a module context for plain TypeScript files without imports
    const moduleContext = {
      exports: {},
      require: require,
      module: { exports: {} },
      __filename: absolutePath,
      __dirname: path.dirname(absolutePath),
      process: process,
      console: console
    };

    try {
      // Wrap in a function and execute
      const fn = new Function(
          'exports', 'require', 'module', '__filename', '__dirname', 'process', 'console',
          fileContent
      );
      fn(
          moduleContext.exports,
          moduleContext.require,
          moduleContext.module,
          moduleContext.__filename,
          moduleContext.__dirname,
          moduleContext.process,
          moduleContext.console
      );

      return moduleContext.module.exports || moduleContext.exports;
    } catch (error: any) {
      throw new Error(`Failed to evaluate TypeScript file: ${error.message}`);
    }
  }

  // Rest of your existing methods remain the same...
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

    const hasCSVScenarios = config.scenarios?.some((s: any) => s.csv_data);
    const configStr = JSON.stringify(config);
    const hasTemplates = configStr.includes('{{template:') || configStr.includes('{{csv:');

    if (hasCSVScenarios || hasTemplates) {
      CSVDataProvider.setBaseDir(baseDir);
      TemplateProcessor.setBaseDir(baseDir);
      logger.debug(`Set base directory for CSV/templates: ${baseDir}`);
    }
  }

  private setupFaker(config: TestConfiguration): void {
    logger.debug('ConfigParser.setupFaker called');
    logger.debug(`config.global: ${JSON.stringify(config.global, null, 2)}`);

    if (config.global?.faker) {
      logger.debug(`Found faker config: ${JSON.stringify(config.global.faker)}`);
      logger.debug('About to call configureFaker...');
      this.templateProcessor.configureFaker(config.global.faker);
      logger.debug('configureFaker call completed');
    } else {
      logger.debug('No faker config found in global');
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
      logger.warn(`Encoding '${csvConfig.encoding}' may not be supported in scenario ${scenarioName}`);
    }
  }

  private async loadEnvironmentConfig(environment: string, baseDir: string): Promise<Partial<TestConfiguration>> {
    const envPaths = [
      path.join(baseDir, 'config', 'environments', `${environment}.yml`),
      path.join(baseDir, 'config', 'environments', `${environment}.yaml`),
      path.join(baseDir, 'config', 'environments', `${environment}.json`),
      path.join(baseDir, 'config', 'environments', `${environment}.ts`),
      path.join(baseDir, `${environment}.yml`),
      path.join(baseDir, `${environment}.yaml`),
      path.join(baseDir, `${environment}.json`),
      path.join(baseDir, `${environment}.ts`)
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        if (envPath.endsWith('.ts')) {
          return await this.parseTypeScript(envPath);
        } else {
          const envContent = fs.readFileSync(envPath, 'utf8');
          return this.parseContent(envContent);
        }
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
      workers: env.workers || base.workers
    };
  }

  processTemplates(config: TestConfiguration, _context: { env: NodeJS.ProcessEnv; timestamp: number; datetime: string; }): TestConfiguration {
    const configStr = JSON.stringify(config);
    return JSON.parse(configStr);
  }
}
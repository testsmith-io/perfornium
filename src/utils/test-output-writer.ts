// src/utils/test-output-writer.ts

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { logger } from './logger';

export type OutputFormat = 'yaml' | 'json' | 'typescript';

export interface TestOutputConfig {
    name: string;
    description?: string;
    baseUrl?: string;
    scenarios: any[];
    format: OutputFormat;
    outputPath: string;
    sourceType?: 'recorder' | 'openapi' | 'wsdl' | 'har' | 'postman';
    metadata?: {
        recordedAt?: string;
        importedFrom?: string;
        sourceUrl?: string;
        [key: string]: any;
    };
}

export interface DSLGenerationOptions {
    includeDataGeneration?: boolean;
    includeCSVSupport?: boolean;
    includeHooks?: boolean;
    includeCustomLogic?: boolean;
    includeMultipleLoadPatterns?: boolean;
}

export class TestOutputWriter {
    private config: TestOutputConfig;
    private dslOptions: DSLGenerationOptions;

    constructor(config: TestOutputConfig, dslOptions?: DSLGenerationOptions) {
        this.config = config;
        this.dslOptions = {
            includeDataGeneration: true,
            includeCSVSupport: true,
            includeHooks: true,
            includeCustomLogic: true,
            includeMultipleLoadPatterns: true,
            ...dslOptions
        };
    }

    async write(): Promise<string> {
        const outputPath = path.resolve(this.config.outputPath);

        // Ensure directory exists
        const dir = path.dirname(outputPath);
        await fs.promises.mkdir(dir, { recursive: true });

        let content: string;

        switch (this.config.format) {
            case 'typescript':
                content = this.generateTypeScriptDSL();
                break;
            case 'json':
                content = this.generateJSON();
                break;
            case 'yaml':
            default:
                content = this.generateYAML();
                break;
        }

        await fs.promises.writeFile(outputPath, content, 'utf8');

        const stats = await fs.promises.stat(outputPath);
        logger.info(`✅ Test file saved: ${outputPath} (${stats.size} bytes)`);

        return outputPath;
    }

    private generateYAML(): string {
        const testConfig = this.buildTestConfiguration();
        return yaml.stringify(testConfig, { indent: 2, lineWidth: 120 });
    }

    private generateJSON(): string {
        const testConfig = this.buildTestConfiguration();
        return JSON.stringify(testConfig, null, 2);
    }

    // Fixed methods for TestOutputWriter class

    private generateTypeScriptDSL(): string {
        const sourceInfo = this.getSourceInfo();

        return `import { test, faker, testData } from '@perfornium/dsl';
${this.dslOptions.includeCSVSupport ? "import { CSV } from '@perfornium/data';" : ''}

/**
 * ${this.config.name}
 * ${this.config.description || 'Auto-generated test scenario'}
 * 
 * ${sourceInfo}
 * Generated on: ${new Date().toISOString()}
 */

${this.generateDataSection()}

${this.generateTestConfiguration()}

${this.generateExportSection()}
`;
    }

    private generateTestConfiguration(): string {
        const hasWebScenarios = this.hasWebScenarios();

        let config = `// ============================================
// Test Configuration
// ============================================

const testConfig = test('${this.config.name}')
  .baseUrl('${this.config.baseUrl || 'http://localhost:3000'}')`;

        // Add browser config if web scenarios exist
        if (hasWebScenarios) {
            config += `
  .withBrowser('chromium', {
    headless: process.env.HEADLESS === 'true',
    viewport: { width: 1920, height: 1080 }
  })`;
        }

        config += `
  .timeout(30000)`;

        // Add global variables if any
        if (this.config.metadata?.variables) {
            config += `
  .variables(${this.formatJSONForDSL(this.config.metadata.variables)})`;
        }

        // Generate scenarios
        for (const scenario of this.config.scenarios) {
            config += this.generateScenarioDSL(scenario);
        }

        // Add load configuration
        config += `
  .withLoad({
    pattern: 'basic',
    virtual_users: ${this.getVirtualUsers()},
    ramp_up: '${this.getRampUp()}',
    duration: '${this.getDuration()}'
  })`;

        // Add output configurations
        config += `
  .withJSONOutput('results/test-results.json')`;

        // Add report configuration
        config += `
  .withReport('reports/test-report.html')`;

        // Build the configuration
        config += `
  .build();`;

        return config;
    }

    private generateScenarioDSL(scenario: any): string {
        const scenarioName = scenario.name || 'test_scenario';
        const weight = scenario.weight || 100;

        let scenarioDSL = `
  .scenario('${scenarioName}', ${weight})`;

        // Add CSV data if present
        if (scenario.csv_data && this.dslOptions.includeCSVSupport) {
            scenarioDSL += `
    .withCSV('${scenario.csv_data.file}', {
      mode: '${scenario.csv_data.mode || 'unique'}',
      cycleOnExhaustion: ${scenario.csv_data.cycleOnExhaustion !== false}
    })`;
        }

        // Add think time if present
        if (scenario.think_time) {
            scenarioDSL += `
    .thinkTime('${scenario.think_time}')`;
        }

        // Add variables if present
        if (scenario.variables) {
            scenarioDSL += `
    .variables(${this.formatJSONForDSL(scenario.variables)})`;
        }

        // Add loop if present
        if (scenario.loop) {
            scenarioDSL += `
    .loop(${scenario.loop})`;
        }

        // Add before hook if enabled - WITH CONTEXT PARAMETER
        if (this.dslOptions.includeHooks) {
            scenarioDSL += `
    .beforeScenario(async (context) => {
      // Setup: Authentication, test data preparation, etc.
      console.log(\`Starting test for VU: \${context.vu_id}\`);
      
      // Example: Get authentication token
      // const token = await authenticate(testData.username, testData.password);
      // context.variables.authToken = token;
      
      // Example: Create test data via API
      // const user = await createTestUser(testData);
      // context.variables.userId = user.id;
    })`;
        }

        // Generate steps
        if (scenario.steps && scenario.steps.length > 0) {
            scenarioDSL += this.generateStepsDSL(scenario.steps);
        }

        // Add after hook if enabled - WITH CONTEXT PARAMETER
        if (this.dslOptions.includeHooks) {
            scenarioDSL += `
    .afterScenario(async (context) => {
      // Cleanup: Logout, delete test data, etc.
      console.log(\`Test completed for VU: \${context.vu_id}\`);
      
      // Example: Cleanup test data
      // if (context.variables.userId) {
      //   await deleteTestUser(context.variables.userId);
      // }
    })`;
        }

        // End the scenario - IMPORTANT: Must call done() to return to test builder
        scenarioDSL += `
    .done()`;

        return scenarioDSL;
    }

// Update generateWebStep to use context in custom steps
    private generateWebStep(step: any): string {
        const action = step.action || {};

        switch (action.command) {
            case 'goto':
                return `    .goto('${action.url || '/'}')`;

            case 'click':
                return `    .click('${this.escape(action.selector || '')}')`;

            case 'fill':
                return this.generateFillStep(action);

            case 'select':
                return `    .select('${this.escape(action.selector || '')}', '${this.escape(action.value || '')}')`;

            case 'verify_visible':
            case 'verify_exists':
                return action.name
                    ? `    .expectVisible('${this.escape(action.selector || '')}', '${this.escape(action.name)}')`
                    : `    .expectVisible('${this.escape(action.selector || '')}')`;

            case 'verify_text':
                return action.name
                    ? `    .expectText('${this.escape(action.selector || '')}', '${this.escape(action.expected_text || '')}', '${this.escape(action.name)}')`
                    : `    .expectText('${this.escape(action.selector || '')}', '${this.escape(action.expected_text || '')}')`;

            case 'verify_not_exists':
                return action.name
                    ? `    .expectNotVisible('${this.escape(action.selector || '')}', '${this.escape(action.name)}')`
                    : `    .expectNotVisible('${this.escape(action.selector || '')}')`;

            default:
                // Custom step WITH CONTEXT PARAMETER
                return `    .step('${step.name || 'custom_step'}', async (context) => {
      // Custom step: ${action.command}
      // Access page: context.page
      // Access variables: context.variables
      // Access VU ID: context.vu_id
    })`;
        }
    }

// Update custom logic example to use context
    private generateCustomLogicExample(): string {
        return `
  .step('Custom Logic', async (context) => {
    // Add your custom logic here
    
    // Example: Conditional navigation
    // const isLoggedIn = await context.page.locator('.user-menu').isVisible();
    // if (!isLoggedIn) {
    //   await context.page.click('.login-button');
    // }
    
    // Example: API call
    // const response = await fetch(\`\${context.variables.base_url}/api/status\`);
    // const data = await response.json();
    // context.variables.apiStatus = data.status;
    
    // Example: Dynamic wait
    // await context.page.waitForSelector('.dynamic-content', { timeout: 10000 });
    
    // Example: Complex interaction
    // const items = await context.page.locator('.item').count();
    // for (let i = 0; i < Math.min(items, 5); i++) {
    //   await context.page.locator('.item').nth(i).click();
    //   await context.page.waitForTimeout(500);
    // }
  })`;
    }

    private generateStepsDSL(steps: any[]): string {
        const dslSteps: string[] = [];

        for (const step of steps) {
            // Add think time if present at step level
            if (step.think_time) {
                dslSteps.push(`    .wait('${step.think_time}')`);
            }

            // Generate step based on type
            if (step.type === 'web' || step.action) {
                dslSteps.push(this.generateWebStep(step));
            } else if (step.type === 'soap') {
                dslSteps.push(this.generateSOAPStep(step));
            } else if (step.type === 'rest') {
                dslSteps.push(this.generateRESTStep(step));
            } else if (step.type === 'wait') {
                dslSteps.push(`    .wait('${step.duration}')`);
            } else if (step.type === 'custom') {
                dslSteps.push(`    .step('${step.name}', ${step.script})`);
            }
        }

        return dslSteps.length > 0 ? '\n' + dslSteps.join('\n') : '';
    }

    private generateFillStep(action: any): string {
        const selector = action.selector || '';
        const value = action.value || '';

        // Detect field type and suggest dynamic data
        if (this.dslOptions.includeDataGeneration) {
            if (selector.match(/email|username|user/i)) {
                return `    .fill('${this.escape(selector)}', testData.username)`;
            } else if (selector.match(/password|pwd/i)) {
                return `    .fill('${this.escape(selector)}', testData.password)`;
            } else if (selector.match(/first.*name/i)) {
                return `    .fill('${this.escape(selector)}', testData.firstName)`;
            } else if (selector.match(/last.*name/i)) {
                return `    .fill('${this.escape(selector)}', testData.lastName)`;
            } else if (selector.match(/phone|mobile|tel/i)) {
                return `    .fill('${this.escape(selector)}', testData.phoneNumber)`;
            }
        }

        return `    .fill('${this.escape(selector)}', '${this.escape(value)}')`;
    }

    private generateRESTStep(step: any): string {
        const method = (step.method || 'GET').toLowerCase();
        const path = step.path || step.url || '/';

        let stepDSL = `    .${method}('${path}'`;

        // Add body/json if present
        if (step.json || step.body) {
            const bodyParam = step.json || step.body;
            stepDSL += `, ${this.formatJSONForDSL(bodyParam)}`;
        }

        // Add options if present
        const options: any = {};
        if (step.headers) options.headers = step.headers;
        if (step.extract) options.extract = step.extract;
        if (step.checks) options.checks = step.checks;

        if (Object.keys(options).length > 0) {
            if (!step.json && !step.body && method !== 'get' && method !== 'delete') {
                stepDSL += `, undefined`; // Add undefined for body parameter
            }
            stepDSL += `, ${this.formatJSONForDSL(options)}`;
        }

        stepDSL += ')';

        // Chain extract methods if they exist
        if (step.extract && Array.isArray(step.extract)) {
            for (const extraction of step.extract) {
                stepDSL += `\n    .extract('${extraction.name}', '${extraction.expression || extraction.jsonPath || '$.' + extraction.name}')`;
            }
        }

        // Chain check methods if they exist
        if (step.checks && Array.isArray(step.checks)) {
            for (const check of step.checks) {
                stepDSL += `\n    .check('${check.type}', ${this.formatJSONForDSL(check.value)}${check.description ? `, '${this.escape(check.description)}'` : ''})`;
            }
        }

        return stepDSL;
    }

    private generateSOAPStep(step: any): string {
        return `    .soap('${step.operation || 'operation'}', ${this.formatJSONForDSL(step.args || {})}${step.wsdl ? `, '${step.wsdl}'` : ''})`;
    }

    private generateExportSection(): string {
        return `
// ============================================
// Export Configuration
// ============================================

export default testConfig;

// Alternative: Run the test directly without building
// await test('${this.config.name}')
//   .baseUrl('${this.config.baseUrl || 'http://localhost:3000'}')
//   .scenario('Quick Test')
//     .goto('/')
//     .done()
//   .run();

${this.dslOptions.includeMultipleLoadPatterns ? this.generateAlternativeLoadPatterns() : ''}`;
    }

    private generateAlternativeLoadPatterns(): string {
        return `// ============================================
// Alternative Load Patterns
// ============================================

// Example: Stepping Load Pattern
// const steppingTest = test('${this.config.name} - Stepping')
//   .baseUrl('${this.config.baseUrl || 'http://localhost:3000'}')
//   .scenario('User Journey', 100)
//     // ... add your steps here ...
//     .done()
//   .withLoad({
//     pattern: 'stepping',
//     steps: [
//       { users: 10, duration: '2m', ramp_up: '30s' },
//       { users: 50, duration: '5m', ramp_up: '1m' },
//       { users: 100, duration: '10m', ramp_up: '2m' }
//     ]
//   })
//   .build();

// Example: Arrivals Pattern (Constant Request Rate)
// const arrivalsTest = test('${this.config.name} - Arrivals')
//   .baseUrl('${this.config.baseUrl || 'http://localhost:3000'}')
//   .scenario('User Journey', 100)
//     // ... add your steps here ...
//     .done()
//   .withLoad({
//     pattern: 'arrivals',
//     rate: 10,  // 10 requests per second
//     duration: '5m'
//   })
//   .build();

// Example: Using LoadBuilder
// import { load } from '@perfornium/dsl';
// 
// const customLoad = load()
//   .pattern('stepping')
//   .virtualUsers(100)
//   .rampUp('2m')
//   .duration('10m')
//   .build();
// 
// const testWithCustomLoad = test('${this.config.name}')
//   .baseUrl('${this.config.baseUrl || 'http://localhost:3000'}')
//   .scenario('User Journey', 100)
//     // ... add your steps here ...
//     .done()
//   .withLoad(customLoad)
//   .build();`;
    }




    private getSourceInfo(): string {
        const metadata = this.config.metadata || {};

        switch (this.config.sourceType) {
            case 'recorder':
                return `Recorded from: ${metadata.sourceUrl || this.config.baseUrl || 'unknown'}`;
            case 'openapi':
                return `Imported from OpenAPI: ${metadata.importedFrom || 'API specification'}`;
            case 'wsdl':
                return `Imported from WSDL: ${metadata.importedFrom || 'SOAP service'}`;
            case 'har':
                return `Imported from HAR: ${metadata.importedFrom || 'HTTP archive'}`;
            case 'postman':
                return `Imported from Postman: ${metadata.importedFrom || 'collection'}`;
            default:
                return 'Source: Generated test configuration';
        }
    }

    private generateDataSection(): string {
        if (!this.dslOptions.includeDataGeneration) {
            return '// Test data generation disabled';
        }

        return `// ============================================
// Test Data Generation
// ============================================

const testData = {
  // User data
  username: faker.internet.email(),
  password: faker.internet.password({ length: 12, memorable: true }),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  phoneNumber: faker.phone.number(),
  
  // Address data
  street: faker.location.streetAddress(),
  city: faker.location.city(),
  zipCode: faker.location.zipCode(),
  country: faker.location.country(),
  
  // Product/Order data
  productName: faker.commerce.productName(),
  productPrice: faker.commerce.price(),
  quantity: faker.number.int({ min: 1, max: 10 }),
  orderId: faker.string.uuid(),
  
  // Custom data
  timestamp: Date.now(),
  randomId: faker.string.alphanumeric(10),
  
  // Add your custom test data here
};

// Optional: Load data from external sources
${this.dslOptions.includeCSVSupport ? `// const csvData = await CSV.load('./test-data.csv');` : ''}

// Optional: Environment-specific configuration
const config = {
  baseUrl: process.env.BASE_URL || '${this.config.baseUrl || 'http://localhost:3000'}',
  apiKey: process.env.API_KEY || 'test-api-key',
  timeout: parseInt(process.env.TIMEOUT || '30000'),
};`;
    }

    private generateTestScenarios(): string {
        const scenarios: string[] = [];

        for (const scenario of this.config.scenarios) {
            scenarios.push(this.generateScenarioDSL(scenario));
        }

        return scenarios.join('\n\n');
    }

    private generateHooks(): string {
        return `
  .beforeScenario(async (context) => {
    // Setup: Authentication, test data preparation, etc.
    console.log(\`Starting test for VU: \${context.vu_id}\`);
    
    // Example: Get authentication token
    // const token = await authenticate(testData.username, testData.password);
    // context.variables.authToken = token;
    
    // Example: Create test data via API
    // const user = await createTestUser(testData);
    // context.variables.userId = user.id;
  })
  .afterScenario(async (context) => {
    // Cleanup: Logout, delete test data, etc.
    console.log(\`Test completed for VU: \${context.vu_id}\`);
    
    // Example: Cleanup test data
    // if (context.variables.userId) {
    //   await deleteTestUser(context.variables.userId);
    // }
  })`;
    }

    private generateVerifyStep(action: any, assertion: string, expectedValue?: string): string {
        if (action.name) {
            let verifyContent = `  .verify('${this.escape(action.name)}', async (page) => {\n`;
            verifyContent += `    await expect(page.locator('${this.escape(action.selector || '')}')).${assertion}`;
            if (expectedValue) {
                verifyContent += `('${this.escape(expectedValue)}')`;
            } else {
                verifyContent += `()`;
            }
            verifyContent += `;\n  })`;
            return verifyContent;
        }

        if (expectedValue) {
            return `  .expectText('${this.escape(action.selector || '')}', '${this.escape(expectedValue)}')`;
        }
        return `  .expectVisible('${this.escape(action.selector || '')}')`;
    }

    private buildTestConfiguration(): any {
        return {
            name: this.config.name,
            description: this.config.description || `Generated from ${this.config.sourceType || 'unknown source'}`,
            global: {
                base_url: this.config.baseUrl || '{{env.BASE_URL}}',
                timeout: 30000,
                think_time: '1-3',
                ...(this.hasWebScenarios() && {
                    browser: {
                        type: 'chromium',
                        headless: false
                    }
                })
            },
            load: {
                pattern: 'basic',
                virtual_users: this.getVirtualUsers(),
                ramp_up: this.getRampUp(),
                duration: this.getDuration()
            },
            scenarios: this.config.scenarios,
            outputs: [
                { type: 'json', file: 'results/test-results.json' }
            ],
            report: {
                generate: true,
                output: 'reports/test-report.html'
            }
        };
    }

    private hasWebScenarios(): boolean {
        return this.config.scenarios.some((s: any) =>
            s.steps?.some((step: any) => step.type === 'web' || step.action)
        );
    }

    private getVirtualUsers(): number {
        return this.config.sourceType === 'recorder' ? 1 : 5;
    }

    private getRampUp(): string {
        return this.config.sourceType === 'recorder' ? '10s' : '30s';
    }

    private getDuration(): string {
        return this.config.sourceType === 'recorder' ? '2m' : '5m';
    }

    private formatJSONForDSL(obj: any): string {
        if (typeof obj === 'string') {
            return `'${this.escape(obj)}'`;
        }

        const json = JSON.stringify(obj, null, 4);
        return json.split('\n').map((line, i) => i === 0 ? line : '    ' + line).join('\n');
    }

    private toCamelCase(str: string): string {
        return str
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
            .replace(/^[^a-zA-Z]+/, '');
    }

    private escape(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    // Static helper method for getting safe filename
    static async getSafeFilename(filepath: string): Promise<string> {
        try {
            await fs.promises.access(filepath);
            // File exists, create numbered version
            const ext = path.extname(filepath);
            const base = filepath.slice(0, -ext.length);
            let counter = 1;
            let newPath: string;

            do {
                newPath = `${base}_${counter}${ext}`;
                counter++;
                try {
                    await fs.promises.access(newPath);
                } catch {
                    break;
                }
            } while (counter < 100);

            return newPath;
        } catch {
            return filepath; // File doesn't exist, use original
        }
    }
}
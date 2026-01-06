import type {
    TestConfiguration,
    Scenario,
    Step,
    LoadConfig,
    LoadPhase,
    GlobalConfig,
    OutputConfig
} from '../config';
import { getFaker } from '../utils/faker-manager';

export interface ScenarioContext {
    vu_id: number | string;
    iteration: number;
    variables: Record<string, any>;
    page?: any; // Playwright Page if using browser
    request?: any; // Request client if using HTTP
    [key: string]: any;
}

export class ScenarioBuilder {
    private parent: TestBuilder;
    private scenario: Partial<Scenario> & { description?: string } = {
        steps: []
    };

    constructor(parent: TestBuilder, name: string, weight: number) {
        this.parent = parent;
        this.scenario.name = name;
        this.scenario.weight = weight;
    }

    description(desc: string): this {
        this.scenario.description = desc;
        return this;
    }

    loop(count: number): this {
        this.scenario.loop = count;
        return this;
    }

    thinkTime(time: string | number): this {
        this.scenario.think_time = time;
        return this;
    }

    variables(vars: Record<string, any>): this {
        this.scenario.variables = { ...this.scenario.variables, ...vars };
        return this;
    }

    withCSV(file: string, options?: any): this {
        (this.scenario as any).csv_data = { file, ...options };
        return this;
    }

    // Updated hook methods with context parameter
    beforeScenario(script: string | ((context: ScenarioContext) => Promise<void>)): this {
        const scriptStr = typeof script === 'function' ? script.toString() : script;
        (this.scenario as any).hooks = {
            ...(this.scenario as any).hooks,
            beforeScenario: { script: scriptStr }
        };
        return this;
    }

    afterScenario(script: string | ((context: ScenarioContext) => Promise<void>)): this {
        const scriptStr = typeof script === 'function' ? script.toString() : script;
        (this.scenario as any).hooks = {
            ...(this.scenario as any).hooks,
            afterScenario: { script: scriptStr }
        };
        return this;
    }

    // Web step methods
    goto(url: string): this {
        return this.addStep({
            name: `Navigate to ${url}`,
            type: 'web',
            action: { command: 'goto', url }
        });
    }

    click(selector: string): this {
        return this.addStep({
            name: `Click ${selector}`,
            type: 'web',
            action: { command: 'click', selector }
        });
    }

    fill(selector: string, value: any): this {
        const actualValue = typeof value === 'string' ? value : value.toString();
        return this.addStep({
            name: `Fill ${selector}`,
            type: 'web',
            action: { command: 'fill', selector, value: actualValue }
        });
    }

    select(selector: string, value: string): this {
        return this.addStep({
            name: `Select ${value} in ${selector}`,
            type: 'web',
            action: { command: 'select', selector, value }
        });
    }

    // press(selector: string, key: string): this {
    //     return this.addStep({
    //         name: `Press ${key} on ${selector}`,
    //         type: 'web',
    //         action: { command: 'press', selector, key }
    //     });
    // }

    expectVisible(selector: string, name?: string): this {
        return this.addStep({
            name: name || `Verify ${selector} is visible`,
            type: 'web',
            action: {
                command: 'verify_visible',
                selector,
                ...(name && { name })
            }
        });
    }

    expectText(selector: string, text: string, name?: string): this {
        return this.addStep({
            name: name || `Verify ${selector} contains ${text}`,
            type: 'web',
            action: {
                command: 'verify_text',
                selector,
                expected_text: text,
                ...(name && { name })
            }
        });
    }

    expectNotVisible(selector: string, name?: string): this {
        return this.addStep({
            name: name || `Verify ${selector} is not visible`,
            type: 'web',
            action: {
                command: 'verify_not_exists',
                selector,
                ...(name && { name })
            }
        });
    }

    wait(duration: string | number): this {
        const durationStr = typeof duration === 'number' ? `${duration}s` : duration;
        return this.addStep({
            name: `Wait ${durationStr}`,
            type: 'wait',
            duration: durationStr
        });
    }

    // REST API step methods
    get(path: string, options?: any): this {
        return this.request('GET', path, options);
    }

    post(path: string, body?: any, options?: any): this {
        return this.request('POST', path, { ...options, json: body });
    }

    put(path: string, body?: any, options?: any): this {
        return this.request('PUT', path, { ...options, json: body });
    }

    patch(path: string, body?: any, options?: any): this {
        return this.request('PATCH', path, { ...options, json: body });
    }

    delete(path: string, options?: any): this {
        return this.request('DELETE', path, options);
    }

    request(method: string, path: string, options?: any): this {
        const step: any = {
            name: options?.name || `${method} ${path}`,
            type: 'rest',
            method,
            path
        };

        if (options?.headers) step.headers = options.headers;
        if (options?.json) step.json = options.json;
        if (options?.body) step.body = options.body;
        if (options?.xml) step.xml = options.xml;
        if (options?.form) step.form = options.form;
        if (options?.multipart) step.multipart = options.multipart;
        if (options?.query) step.query = options.query;
        if (options?.auth) step.auth = options.auth;
        if (options?.extract) step.extract = options.extract;
        if (options?.checks) step.checks = options.checks;
        if (options?.timeout) step.timeout = options.timeout;

        return this.addStep(step);
    }

    // Enhanced methods for different auth types
    withBasicAuth(username: string, password: string): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (lastStep.type === 'rest') {
            lastStep.auth = { type: 'basic', username, password };
        }
        return this;
    }

    withBearerToken(token: string): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (lastStep.type === 'rest') {
            lastStep.auth = { type: 'bearer', token };
        }
        return this;
    }

    withHeaders(headers: Record<string, string>): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (lastStep.type === 'rest') {
            lastStep.headers = { ...lastStep.headers, ...headers };
        }
        return this;
    }

    withQuery(params: Record<string, string | number | boolean>): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (lastStep.type === 'rest') {
            lastStep.query = params;
        }
        return this;
    }

    // Add think time to the last step
    withThinkTime(time: string | number): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        lastStep.think_time = time;
        return this;
    }

    extract(name: string, expression: string, type: 'json_path' | 'regex' = 'json_path'): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (!lastStep.extract) lastStep.extract = [];
        lastStep.extract.push({ name, expression, type });
        return this;
    }

    check(type: string, value: any, description?: string): this {
        const lastStep = this.scenario.steps![this.scenario.steps!.length - 1] as any;
        if (!lastStep.checks) lastStep.checks = [];
        lastStep.checks.push({ type, value, description });
        return this;
    }

    // SOAP step method
    soap(operation: string, args: any, wsdl?: string): this {
        return this.addStep({
            name: `SOAP ${operation}`,
            type: 'soap',
            operation,
            args,
            ...(wsdl && { wsdl })
        });
    }

    // Custom step method
    // Updated custom step method with context
    step(name: string, script: string | ((context: ScenarioContext) => Promise<void>)): this {
        const scriptStr = typeof script === 'function' ?
            `(${script.toString()})(context)` : script;

        return this.addStep({
            name,
            type: 'custom',
            script: scriptStr
        });
    }

    // Add a raw step
    addStep(step: Step): this {
        this.scenario.steps = [...(this.scenario.steps || []), step];
        return this;
    }

    // Finish scenario and return to parent
    done(): TestBuilder {
        this.parent.addScenario(this.scenario as Scenario);
        return this.parent;
    }

    // Alias for done()
    endScenario(): TestBuilder {
        return this.done();
    }
}

export class LoadBuilder {
    private loadConfig: Partial<LoadPhase> = {};

    name(name: string): this {
        this.loadConfig.name = name;
        return this;
    }

    pattern(pattern: 'basic' | 'stepping' | 'arrivals'): this {
        this.loadConfig.pattern = pattern;
        return this;
    }

    virtualUsers(count: number): this {
        this.loadConfig.virtual_users = count;
        return this;
    }

    vus(count: number): this {
        this.loadConfig.vus = count;
        return this;
    }

    rampUp(duration: string): this {
        this.loadConfig.ramp_up = duration;
        return this;
    }

    duration(duration: string): this {
        this.loadConfig.duration = duration;
        return this;
    }

    rate(requestsPerSecond: number): this {
        this.loadConfig.rate = requestsPerSecond;
        return this;
    }

    steps(steps: any[]): this {
        this.loadConfig.steps = steps;
        return this;
    }

    build(): LoadPhase {
        if (!this.loadConfig.pattern) {
            this.loadConfig.pattern = 'basic';
        }
        if (!this.loadConfig.duration) {
            this.loadConfig.duration = '1m'; // Default duration
        }
        return this.loadConfig as LoadPhase;
    }
}


// Factory functions for convenience
export function test(name: string): TestBuilder {
    return new TestBuilder(name);
}
export function load(): LoadBuilder {
    return new LoadBuilder();
}


/**
 * Fluent DSL for building test configurations
 *
 * Usage:
 *   const config = test('My Test')
 *     .baseUrl('https://example.com')
 *     .withBrowser('chromium', { headless: false })
 *     .scenario('User Journey')
 *       .goto('/')
 *       .click('#login')
 *       .fill('#username', 'test@example.com')
 *       .expectVisible('#dashboard')
 *       .done()
 *     .withLoad({ pattern: 'basic', virtualUsers: 10 })
 *     .build();
 */

export class TestBuilder {
    private config: Partial<TestConfiguration> = {
        scenarios: [],
        outputs: [],
        global: {}
    };

    constructor(name: string) {
        this.config.name = name;
    }

    configuration(confis: GlobalConfig): this {
        this.config = confis;
        return this;
    }

    description(desc: string): this {
        this.config.description = desc;
        return this;
    }

    // Global configuration methods
    baseUrl(url: string): this {
        this.config.global = { ...this.config.global, base_url: url };
        return this;
    }

    timeout(ms: number): this {
        this.config.global = { ...this.config.global, timeout: ms };
        return this;
    }

    thinkTime(time: string | number): this {
        this.config.global = { ...this.config.global, think_time: time };
        return this;
    }

    headers(headers: Record<string, string>): this {
        this.config.global = {
            ...this.config.global,
            headers: { ...(this.config.global?.headers || {}), ...headers }
        };
        return this;
    }

    withBrowser(type: 'chromium' | 'firefox' | 'webkit', options?: any): this {
        this.config.global = {
            ...this.config.global,
            browser: {
                type,
                ...options
            }
        };
        return this;
    }

    withWSDL(url: string): this {
        this.config.global = { ...this.config.global, wsdl_url: url };
        return this;
    }

    variables(vars: Record<string, any>): this {
        if (!this.config.global) {
            this.config.global = {};
        }
        this.config.global = {
            ...this.config.global,
            variables: { ...(this.config.global.variables || {}), ...vars }
        };
        return this;
    }

    // Create a new scenario
    scenario(name: string, weight: number = 100): ScenarioBuilder {
        return new ScenarioBuilder(this, name, weight);
    }

    // Add a complete scenario
    addScenario(scenario: Scenario): this {
        this.config.scenarios = [...(this.config.scenarios || []), scenario];
        return this;
    }

    // Load configuration - supports single phase or array of phases
    withLoad(load: LoadConfig | LoadBuilder | LoadBuilder[]): this {
        if (Array.isArray(load)) {
            // Array of LoadBuilders - build each one
            this.config.load = load.map(lb => lb instanceof LoadBuilder ? lb.build() : lb);
        } else if (load instanceof LoadBuilder) {
            this.config.load = load.build();
        } else {
            this.config.load = load;
        }
        return this;
    }

    // Add multiple load phases (sequential execution)
    withLoadPhases(...phases: (LoadPhase | LoadBuilder)[]): this {
        this.config.load = phases.map(phase =>
            phase instanceof LoadBuilder ? phase.build() : phase
        );
        return this;
    }

    // Output configuration
    withOutput(type: string, options: Partial<OutputConfig>): this {
        this.config.outputs = [
            ...(this.config.outputs || []),
            { type, ...options } as OutputConfig
        ];
        return this;
    }

    withJSONOutput(file: string): this {
        return this.withOutput('json', { file });
    }

    withCSVOutput(file: string): this {
        return this.withOutput('csv', { file });
    }

    // Report configuration
    withReport(output: string = 'report.html'): this {
        this.config.report = {
            generate: true,
            output
        };
        return this;
    }

    // Build the final configuration
    build(): TestConfiguration {
        if (!this.config.name) throw new Error('Test name is required');
        if (!this.config.load) {
            // Default load configuration
            this.config.load = {
                pattern: 'basic',
                virtual_users: 1,
                ramp_up: '10s',
                duration: '1m'
            };
        }
        if (!this.config.scenarios || this.config.scenarios.length === 0) {
            throw new Error('At least one scenario is required');
        }

        return this.config as TestConfiguration;
    }

    // Run the test directly
    async run(): Promise<void> {
        const { TestRunner } = await import('../core/test-runner');
        const runner = new TestRunner(this.build());
        await runner.run();
    }
}
// Data generation utilities - lazily loaded
export { getFaker as faker };

export const testData = {
    email: () => getFaker().internet.email(),
    password: () => getFaker().internet.password(),
    firstName: () => getFaker().person.firstName(),
    lastName: () => getFaker().person.lastName(),
    phone: () => getFaker().phone.number(),
    uuid: () => getFaker().string.uuid(),
    randomInt: (min: number, max: number) => getFaker().number.int({ min, max })
};
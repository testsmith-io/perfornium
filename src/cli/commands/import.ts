// src/commands/import.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

import { OpenAPIImporter } from '../../importers/open-api-importer';
import { WSDLImporter } from '../../importers/wsdl-importer';
import { HARImporter } from '../../importers/har-importer';
// import { PostmanImporter } from '../importers/postman-importer';
// import { DataCorrelationAnalyzer } from '../importers/correlation-analyzer';
// import { logger } from '../utils/logger';

interface ImportOptions {
    output: string;
    format: 'yaml' | 'json';
    verbose?: boolean;
    interactive?: boolean;
    autoCorrelate?: boolean;
    baseUrl?: string;
    tags?: string;
    excludeTags?: string;
    paths?: string;
    methods?: string;
    filterDomains?: string;
    excludeDomains?: string;
    services?: string;
    operations?: string;
    folders?: string;
    scenariosPerFile?: string;
    confidence?: string;
    [key: string]: any;
}

// Define interfaces for better type safety
interface Endpoint {
    path: string;
    method: string;
    tags?: string[];
    description?: string;
    name?: string;
    folder?: string;
}

interface Scenario {
    name: string;
    steps: any[];
}

interface Dependency {
    sourceStep: string;
    targetStep: string;
    sourceField: string;
    targetLocation: string;
    targetField: string;
    description: string;
    required: boolean;
}

export async function importCommand(
    type: 'openapi' | 'wsdl' | 'har' | 'postman',
    sourceFile: string,
    options: ImportOptions
): Promise<void> {
    const spinner = ora(`Loading ${type.toUpperCase()} from ${sourceFile}`).start();

    try {
        // Validate source file exists
        await fs.access(sourceFile);

        let importer: any;
        let endpoints: Endpoint[] = [];

        // Create appropriate importer
        switch (type) {
            case 'openapi':
                importer = await createOpenAPIImporter(sourceFile, options);
                endpoints = importer.extractEndpoints();
                break;
            case 'wsdl':
                importer = await createWSDLImporter(sourceFile, options);
                endpoints = importer.extractServices();
                break;
            case 'har':
                importer = await createHARImporter(sourceFile, options);
                endpoints = importer.extractEndpoints();
                break;
            // case 'postman':
            //     importer = await createPostmanImporter(sourceFile, options);
            //     endpoints = importer.extractRequests();
            //     break;
            default:
                throw new Error(`Unsupported import type: ${type}`);
        }

        spinner.succeed(`Found ${endpoints.length} ${type === 'wsdl' ? 'services' : 'endpoints'}`);

        if (endpoints.length === 0) {
            console.log(chalk.yellow('No endpoints found to import'));
            return;
        }

        // Apply filters
        endpoints = applyFilters(endpoints, type, options);

        if (endpoints.length === 0) {
            console.log(chalk.yellow('No endpoints match the specified filters'));
            return;
        }

        console.log(chalk.blue(`${endpoints.length} endpoints after filtering`));

        // Interactive selection if enabled
        let selectedEndpoints = endpoints;
        if (options.interactive) {
            selectedEndpoints = await interactiveEndpointSelection(endpoints, type);
        }

        if (selectedEndpoints.length === 0) {
            console.log(chalk.yellow('No endpoints selected'));
            return;
        }

        // Generate scenarios
        console.log(chalk.blue(`Generating scenarios for ${selectedEndpoints.length} endpoints...`));
        let scenarios: Scenario[] = importer.generateScenarios(selectedEndpoints);

        // Apply correlations if enabled
        if (options.autoCorrelate) {
            console.log(chalk.blue('Analyzing data correlations...'));
            scenarios = await applyCorrelations(scenarios, options);
        }

        // Generate output files
        await generateOutputFiles(scenarios, type, options);

        console.log(chalk.green(`Successfully imported ${scenarios.length} scenarios to ${options.output}/`));

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Import failed: ${errorMessage}`);

        if (options.verbose && error instanceof Error) {
            console.error(error.stack);
        }

        process.exit(1);
    }
}

async function createOpenAPIImporter(sourceFile: string, options: ImportOptions): Promise<OpenAPIImporter> {
    const content = await fs.readFile(sourceFile, 'utf8');
    let spec: any;

    if (sourceFile.endsWith('.json')) {
        spec = JSON.parse(content);
    } else {
        spec = yaml.load(content);
    }

    // Apply base URL override
    if (options.baseUrl && spec.servers) {
        spec.servers[0].url = options.baseUrl;
    }

    return new OpenAPIImporter(spec);
}

async function createWSDLImporter(sourceFile: string, options: ImportOptions): Promise<WSDLImporter> {
    const content = await fs.readFile(sourceFile, 'utf8');
    return new WSDLImporter(content);
}

async function createHARImporter(sourceFile: string, options: ImportOptions): Promise<HARImporter> {
    const content = await fs.readFile(sourceFile, 'utf8');
    const har = JSON.parse(content);
    return new HARImporter(har);
}

// async function createPostmanImporter(sourceFile: string, options: ImportOptions): Promise<PostmanImporter> {
//     const content = await fs.readFile(sourceFile, 'utf8');
//     const collection = JSON.parse(content);
//
//     let environment = {};
//     if (options.environment) {
//         const envContent = await fs.readFile(options.environment, 'utf8');
//         environment = JSON.parse(envContent);
//     }
//
//     return new PostmanImporter(collection, environment);
// }

function applyFilters(endpoints: Endpoint[], type: string, options: ImportOptions): Endpoint[] {
    let filtered = [...endpoints];

    // Apply type-specific filters
    switch (type) {
        case 'openapi':
            filtered = applyOpenAPIFilters(filtered, options);
            break;
        case 'har':
            filtered = applyHARFilters(filtered, options);
            break;
        case 'wsdl':
            filtered = applyWSDLFilters(filtered, options);
            break;
        case 'postman':
            filtered = applyPostmanFilters(filtered, options);
            break;
    }

    return filtered;
}

function applyOpenAPIFilters(endpoints: Endpoint[], options: ImportOptions): Endpoint[] {
    let filtered = endpoints;

    // Filter by tags
    if (options.tags) {
        const includeTags = options.tags.split(',').map((t: string) => t.trim());
        filtered = filtered.filter(ep =>
            ep.tags && ep.tags.some((tag: string) => includeTags.includes(tag))
        );
    }

    if (options.excludeTags) {
        const excludeTags = options.excludeTags.split(',').map((t: string) => t.trim());
        filtered = filtered.filter(ep =>
            !ep.tags || !ep.tags.some((tag: string) => excludeTags.includes(tag))
        );
    }

    // Filter by paths
    if (options.paths) {
        const pathPatterns = options.paths.split(',').map((p: string) => new RegExp(p.trim()));
        filtered = filtered.filter(ep =>
            pathPatterns.some((pattern: RegExp) => pattern.test(ep.path))
        );
    }

    // Filter by methods
    if (options.methods) {
        const methods = options.methods.split(',').map((m: string) => m.trim().toUpperCase());
        filtered = filtered.filter(ep => methods.includes(ep.method));
    }

    return filtered;
}

function applyHARFilters(endpoints: Endpoint[], options: ImportOptions): Endpoint[] {
    let filtered = endpoints;

    // Filter by domains
    if (options.filterDomains) {
        const domains = options.filterDomains.split(',').map((d: string) => d.trim());
        filtered = filtered.filter(ep =>
            domains.some((domain: string) => ep.path.includes(domain) || (ep.description && ep.description.includes(domain)))
        );
    }

    if (options.excludeDomains) {
        const excludeDomains = options.excludeDomains.split(',').map((d: string) => d.trim());
        filtered = filtered.filter(ep =>
            !excludeDomains.some((domain: string) => ep.path.includes(domain) || (ep.description && ep.description.includes(domain)))
        );
    }

    // Filter by methods
    if (options.methods) {
        const methods = options.methods.split(',').map((m: string) => m.trim().toUpperCase());
        filtered = filtered.filter(ep => methods.includes(ep.method));
    }

    return filtered;
}

function applyWSDLFilters(services: Endpoint[], options: ImportOptions): Endpoint[] {
    let filtered = services;

    if (options.services) {
        const serviceNames = options.services.split(',').map((s: string) => s.trim());
        filtered = filtered.filter(svc =>
            svc.name && serviceNames.some((name: string) => svc.name!.includes(name))
        );
    }

    if (options.operations) {
        const operationNames = options.operations.split(',').map((op: string) => op.trim());
        filtered = filtered.filter(svc =>
            svc.name && operationNames.some((name: string) => svc.name!.includes(name))
        );
    }

    return filtered;
}

function applyPostmanFilters(requests: Endpoint[], options: ImportOptions): Endpoint[] {
    let filtered = requests;

    if (options.folders) {
        const folderNames = options.folders.split(',').map((f: string) => f.trim());
        filtered = filtered.filter(req =>
            req.folder && folderNames.includes(req.folder)
        );
    }

    return filtered;
}

async function interactiveEndpointSelection(endpoints: Endpoint[], type: string): Promise<Endpoint[]> {
    // Group endpoints for better presentation
    const grouped = groupEndpoints(endpoints, type);
    const selected: Endpoint[] = [];

    for (const [groupName, groupEndpoints] of Object.entries(grouped)) {
        console.log(chalk.blue(`\n📁 ${groupName} (${groupEndpoints.length} ${type === 'wsdl' ? 'services' : 'endpoints'})`));

        // Show endpoints in the group
        groupEndpoints.forEach((ep: Endpoint, index: number) => {
            const method = type === 'wsdl' ? 'SOAP' : ep.method;
            console.log(`  ${index + 1}. ${chalk.cyan(method.padEnd(6))} ${ep.path}`);
            if (ep.description) {
                console.log(`     ${chalk.gray(ep.description.substring(0, 80))}${ep.description.length > 80 ? '...' : ''}`);
            }
        });

        // Prompt for selection
        const { selection } = await inquirer.prompt([{
            type: 'input',
            name: 'selection',
            message: `Select from ${groupName} (numbers separated by commas, 'all', or 'skip'):`,
            default: 'skip'
        }]);

        if (selection.toLowerCase() === 'skip') continue;
        if (selection.toLowerCase() === 'all') {
            selected.push(...groupEndpoints);
            continue;
        }

        // Parse selection
        const indices = selection.split(',')
            .map((s: string) => parseInt(s.trim()) - 1)
            .filter((i: number) => i >= 0 && i < groupEndpoints.length);

        for (const index of indices) {
            selected.push(groupEndpoints[index]);
        }
    }

    return selected;
}

function groupEndpoints(endpoints: Endpoint[], type: string): Record<string, Endpoint[]> {
    const groups: Record<string, Endpoint[]> = {};

    endpoints.forEach(endpoint => {
        let groupName = 'Other';

        switch (type) {
            case 'openapi':
                groupName = endpoint.tags && endpoint.tags.length > 0
                    ? endpoint.tags[0]
                    : extractPathGroup(endpoint.path);
                break;
            case 'har':
                groupName = extractDomainFromEndpoint(endpoint);
                break;
            case 'wsdl':
                groupName = endpoint.name ? extractServiceGroup(endpoint.name) : 'Unknown';
                break;
            case 'postman':
                groupName = endpoint.folder || 'Root';
                break;
        }

        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(endpoint);
    });

    return groups;
}

function extractPathGroup(path: string): string {
    const parts = path.split('/').filter(p => p && !p.startsWith('{'));
    return parts.length > 0 ? parts[0] : 'Root';
}

function extractDomainFromEndpoint(endpoint: Endpoint): string {
    if (endpoint.description && endpoint.description.includes('://')) {
        try {
            const url = new URL(endpoint.description.split(' ').find((part: string) => part.includes('://')) || '');
            return url.hostname;
        } catch {
            return 'Unknown';
        }
    }
    return extractPathGroup(endpoint.path);
}

function extractServiceGroup(serviceName: string): string {
    const parts = serviceName.split('.');
    return parts.length > 1 ? parts[0] : serviceName;
}

async function applyCorrelations(scenarios: Scenario[], options: ImportOptions): Promise<Scenario[]> {
    // Note: DataCorrelationAnalyzer is not available, so we'll skip this functionality for now
    // You'll need to import and implement this class or remove this feature
    console.log(chalk.yellow('Data correlation analysis is not available - skipping'));
    return scenarios;

    /* Commented out until DataCorrelationAnalyzer is available:
    const analyzer = new DataCorrelationAnalyzer();
    const correlatedScenarios: Scenario[] = [];

    for (const scenario of scenarios) {
        console.log(`Analyzing correlations for: ${scenario.name}`);

        const dependencies = analyzer.analyzeSteps(scenario.steps);

        if (dependencies.length > 0) {
            console.log(`  Found ${dependencies.length} potential correlations`);

            if (options.interactive) {
                // Interactive correlation review
                const approvedDeps = await reviewCorrelations(dependencies, scenario.name);
                scenario.steps = analyzer.applyCorrelations(scenario.steps, approvedDeps);
            } else {
                // Auto-apply with confidence threshold
                const threshold = parseFloat(options.confidence || '0.6');
                const highConfidenceDeps = dependencies.filter((dep: Dependency) =>
                    dep.required || (dep.description && dep.description.includes('confidence:') &&
                        parseFloat(dep.description.match(/confidence:\s*(\d*\.?\d+)/)?.[1] || '0') >= threshold)
                );

                if (highConfidenceDeps.length > 0) {
                    console.log(`  Applying ${highConfidenceDeps.length} high-confidence correlations`);
                    scenario.steps = analyzer.applyCorrelations(scenario.steps, highConfidenceDeps);
                }
            }

            // Generate correlation report
            if (dependencies.length > 0 && options.output) {
                const report = analyzer.generateCorrelationReport(dependencies);
                const reportPath = path.join(options.output, `${scenario.name}-correlations.md`);
                await ensureDirectory(path.dirname(reportPath));
                await fs.writeFile(reportPath, report, 'utf8');
            }
        }

        correlatedScenarios.push(scenario);
    }

    return correlatedScenarios;
    */
}

async function reviewCorrelations(dependencies: Dependency[], scenarioName: string): Promise<Dependency[]> {
    console.log(chalk.blue(`\nReviewing correlations for: ${scenarioName}`));

    const approved: Dependency[] = [];

    for (const dep of dependencies) {
        console.log(chalk.yellow(`\nCorrelation: ${dep.sourceStep} → ${dep.targetStep}`));
        console.log(`  Extract: ${dep.sourceField}`);
        console.log(`  Use in: ${dep.targetLocation} as ${dep.targetField}`);
        console.log(`  ${dep.description}`);

        const { apply } = await inquirer.prompt([{
            type: 'confirm',
            name: 'apply',
            message: 'Apply this correlation?',
            default: dep.required
        }]);

        if (apply) {
            approved.push(dep);
        }
    }

    return approved;
}

async function generateOutputFiles(scenarios: Scenario[], type: string, options: ImportOptions): Promise<void> {
    await ensureDirectory(options.output);

    // Group scenarios into files based on scenariosPerFile option
    const scenariosPerFile = parseInt(options.scenariosPerFile || '10');
    const groups: Scenario[][] = [];

    for (let i = 0; i < scenarios.length; i += scenariosPerFile) {
        groups.push(scenarios.slice(i, i + scenariosPerFile));
    }

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const testConfig = {
            name: `${type.toUpperCase()} Import ${groups.length > 1 ? `(Part ${i + 1})` : ''}`,
            description: `Generated test configuration from ${type.toUpperCase()} import`,
            global: {
                base_url: '{{env.BASE_URL}}',
                timeout: 30000,
                think_time: '1-3'
            },
            load: {
                pattern: 'basic',
                virtual_users: 5,
                ramp_up: '30s',
                duration: '2m'
            },
            scenarios: group
        };

        const filename = groups.length > 1
            ? `${type}-import-${i + 1}.${options.format}`
            : `${type}-import.${options.format}`;

        const initialPath = path.join(options.output, filename);
        const filepath = await getSafeFilename(initialPath);

        if (options.format === 'json') {
            await fs.writeFile(filepath, JSON.stringify(testConfig, null, 2), 'utf8');
        } else {
            await fs.writeFile(filepath, yaml.dump(testConfig, { indent: 2, lineWidth: 120 }), 'utf8');
        }

        console.log(`Generated: ${filepath}`);
    }
}

async function getSafeFilename(filepath: string): Promise<string> {
    try {
        await fs.access(filepath);
        // File exists, create numbered version
        const ext = path.extname(filepath);
        const base = filepath.slice(0, -ext.length);
        let counter = 1;
        let newPath: string;

        do {
            newPath = `${base}_${counter}${ext}`;
            counter++;
            try { await fs.access(newPath); } catch { break; }
        } while (counter < 100);

        return newPath;
    } catch {
        return filepath; // File doesn't exist, use original
    }
}

async function ensureDirectory(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        // Directory might already exist
    }
}
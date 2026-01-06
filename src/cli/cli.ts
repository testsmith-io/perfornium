#!/usr/bin/env node

import { Command } from 'commander';
import { runCommand } from './commands/run';
import { validateCommand } from './commands/validate';
import { reportCommand } from './commands/report';
import { workerCommand } from './commands/worker';
import { initCommand } from './commands/init';
import { mockCommand } from './commands/mock';
import { startNativeRecording } from '../recorder/native-recorder';
import { distributedCommand } from './commands/distributed';

// Add new import commands
import { importCommand } from './commands/import';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('../../package.json');

const program = new Command();

program
    .name('perfornium')
    .description(packageJson.description)
    .version(packageJson.version);

program
    .command('run')
    .description('Run a performance test')
    .argument('<config>', 'Test configuration file')
    .option('-e, --env <environment>', 'Environment configuration')
    .option('-w, --workers <workers>', 'Comma-separated list of worker addresses')
    .option('-o, --output <directory>', 'Output directory for results')
    .option('-r, --report', 'Generate HTML report after test')
    .option('--dry-run', 'Validate configuration without running test')
    .option('-v, --verbose', 'Enable verbose logging (info level)')
    .option('-d, --debug', 'Enable debug logging (very detailed)')
    .option('--max-users <number>', 'Maximum virtual users override')
    .option('-g, --global <key=value>', 'Override global config (supports dot notation: browser.headless=false)', collectGlobals, [])
    .action(runCommand);

// Helper function to collect --global options
function collectGlobals(value: string, previous: string[]): string[] {
    previous.push(value);
    return previous;
}

program
    .command('distributed')
    .description('Run a distributed performance test across multiple workers')
    .argument('<config>', 'Test configuration file')
    .option('-e, --env <environment>', 'Environment configuration')
    .option('-w, --workers <workers>', 'Comma-separated list of worker addresses (host:port)')
    .option('--workers-file <file>', 'JSON file containing worker configurations')
    .option('-s, --strategy <strategy>', 'Load distribution strategy (even|capacity_based|round_robin|geographic)', 'capacity_based')
    .option('--sync-start', 'Synchronize test start across all workers')
    .option('-o, --output <directory>', 'Output directory for results')
    .option('-r, --report', 'Generate HTML report after test')
    .option('-v, --verbose', 'Enable verbose logging (info level)')
    .option('-d, --debug', 'Enable debug logging (very detailed)')
    .action(distributedCommand);

program
    .command('validate')
    .description('Validate test configuration')
    .argument('<config>', 'Test configuration file')
    .option('-e, --env <environment>', 'Environment configuration')
    .action(validateCommand);

program
    .command('report')
    .description('Generate HTML report from results')
    .argument('<results>', 'Results file (JSON or CSV)')
    .option('-o, --output <file>', 'Output HTML file', 'report.html')
    .option('-t, --template <template>', 'Custom report template')
    .option('--title <title>', 'Custom report title')
    .action(reportCommand);

// ============================================
// Record Command
// ============================================
program
    .command('record')
    .description('Record web interactions for test creation (Ctrl+W to add wait points)')
    .argument('<url>', 'Starting URL for recording')
    .option('-o, --output <file>', 'Output file for recorded scenario')
    .option('--viewport <viewport>', 'Browser viewport size (e.g., 1920x1080)')
    .option('--base-url <url>', 'Base URL to relativize recorded URLs')
    .option('-f, --format <format>', 'Output format: yaml, json, or typescript', 'yaml')
    .action(async (url: string, options: any) => {
        // Auto-determine file extension if output not specified
        // Save to tests/web directory by default
        if (!options.output) {
            const extensions: Record<string, string> = {
                yaml: 'tests/web/recorded-scenario.yml',
                json: 'tests/web/recorded-scenario.json',
                typescript: 'tests/web/recorded-scenario.spec.ts'
            };
            options.output = extensions[options.format] || 'tests/web/recorded-scenario.yml';
        }

        await startNativeRecording(url, {
            output: options.output,
            format: options.format,
            viewport: options.viewport,
            baseUrl: options.baseUrl
        });
    });

// ============================================
// Import Commands
// ============================================
const importCmd = program
    .command('import <type>')
    .description('Import API definitions to generate test scenarios')
    .argument('<source>', 'Source file to import');

// Common import options
const addImportOptions = (cmd: Command) => {
    return cmd
        .option('-o, --output <dir>', 'Output directory', './tests')
        .option('-f, --format <format>', 'Output format: yaml, json, or typescript', 'yaml')
        .option('-i, --interactive', 'Interactive mode for selecting endpoints')
        .option('--auto-correlate', 'Automatically detect and apply data correlations')
        .option('--base-url <url>', 'Override base URL from specification')
        .option('--scenarios-per-file <n>', 'Number of scenarios per output file', '10')
        .option('-v, --verbose', 'Verbose output with detailed information');
};

// OpenAPI import
addImportOptions(
    importCmd
        .command('openapi <file>')
        .description('Import from OpenAPI/Swagger specification')
        .option('--tags <tags>', 'Filter by tags (comma-separated)')
        .option('--exclude-tags <tags>', 'Exclude specific tags (comma-separated)')
        .option('--paths <patterns>', 'Filter by path patterns (comma-separated regex)')
        .option('--methods <methods>', 'Filter by HTTP methods (comma-separated)')
).action(async (file: string, options: any) => {
    await importCommand('openapi', file, options);
});

// WSDL import
addImportOptions(
    importCmd
        .command('wsdl <file>')
        .description('Import from WSDL file')
        .option('--services <names>', 'Filter by service names (comma-separated)')
        .option('--operations <names>', 'Filter by operation names (comma-separated)')
        .option('--soap-version <version>', 'SOAP version: 1.1, 1.2, or both', 'both')
).action(async (file: string, options: any) => {
    await importCommand('wsdl', file, options);
});

// HAR import
addImportOptions(
    importCmd
        .command('har <file>')
        .description('Import from HAR (HTTP Archive) file')
        .option('--filter-domains <domains>', 'Include specific domains (comma-separated)')
        .option('--exclude-domains <domains>', 'Exclude specific domains (comma-separated)')
        .option('--methods <methods>', 'Filter by HTTP methods (comma-separated)')
        .option('--skip-static', 'Skip static resources (images, CSS, JS)', true)
).action(async (file: string, options: any) => {
    await importCommand('har', file, options);
});

// importCmd
//     .command('postman')
//     .description('Import test scenarios from Postman collection')
//     .argument('<collection-file>', 'Postman collection file (JSON)')
//     .option('-o, --output <directory>', 'Output directory for generated tests', './tests')
//     .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
//     .option('--environment <env-file>', 'Postman environment file')
//     .option('--folders <folders>', 'Comma-separated list of folder names to include')
//     .option('--auto-correlate', 'Automatically detect and apply data correlations', true)
//     .option('--interactive', 'Interactive request selection', true)
//     .option('-v, --verbose', 'Enable verbose logging')
//     .action((collectionFile, options) => importCommand('postman', collectionFile, options));

// NEW: Correlate command
// program
//     .command('correlate')
//     .description('Analyze and apply data correlations to existing test configuration')
//     .argument('<config-file>', 'Test configuration file to analyze')
//     .option('-o, --output <file>', 'Output file for correlated configuration')
//     .option('--report <file>', 'Generate correlation analysis report')
//     .option('--auto-apply', 'Automatically apply detected correlations', true)
//     .option('--confidence <threshold>', 'Minimum confidence threshold (0-1)', '0.6')
//     .option('--interactive', 'Interactive correlation review and selection')
//     .option('--patterns <file>', 'Custom correlation patterns file')
//     .option('-v, --verbose', 'Enable verbose logging')
//     .action(correlateCommand);

program
    .command('worker')
    .description('Start a worker node for distributed testing')
    .option('-p, --port <port>', 'Port to listen on', '8080')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .action(workerCommand);

program
    .command('init')
    .description('Initialize a new test project')
    .argument('[directory]', 'Project directory', '.')
    .option('-t, --template <template>', 'Project template (basic|api|web|mixed)', 'basic')
    .option('--examples', 'Include example test configurations')
    .option('-f, --force', 'Overwrite existing project files')
    .option('--dry-run', 'Preview files without creating them')
    .action(initCommand);

program
    .command('mock')
    .description('Start a mock API server for testing')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .option('-d, --delay <ms>', 'Add delay to all responses (ms)', '0')
    .action(mockCommand);

program.parse();
#!/usr/bin/env node

import { Command } from 'commander';
import { runCommand } from './commands/run';
import { validateCommand } from './commands/validate';
import { reportCommand } from './commands/report';
import { workerCommand } from './commands/worker';
import { initCommand } from './commands/init';
import { recordCommand } from './commands/record';
import { distributedCommand } from './commands/distributed';

// Add new import commands
import { importCommand } from './commands/import';

const program = new Command();

program
    .name('perfornium')
    .description('Performance testing framework for REST, SOAP, and web applications')
    .version('1.0.0');

program
    .command('run')
    .description('Run a performance test')
    .argument('<config>', 'Test configuration file')
    .option('-e, --env <environment>', 'Environment configuration')
    .option('-w, --workers <workers>', 'Comma-separated list of worker addresses')
    .option('-o, --output <directory>', 'Output directory for results')
    .option('-r, --report', 'Generate HTML report after test')
    .option('--dry-run', 'Validate configuration without running test')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--max-users <number>', 'Maximum virtual users override')
    .action(runCommand);

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
    .option('-v, --verbose', 'Enable verbose logging')
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

program
    .command('record')
    .description('Record web interactions for test creation')
    .argument('<url>', 'Starting URL for recording')
    .option('-o, --output <file>', 'Output file for recorded scenario', 'recorded-scenario.yml')
    .option('--viewport <viewport>', 'Browser viewport size (e.g., 1920x1080)')
    .option('--base-url <url>', 'Base URL to relativize recorded URLs')
    .action(recordCommand);

// NEW: Import command group
const importCmd = program
    .command('import')
    .description('Import test scenarios from various sources');

importCmd
    .command('openapi')
    .description('Import test scenarios from OpenAPI specification')
    .argument('<spec-file>', 'OpenAPI specification file (JSON or YAML)')
    .option('-o, --output <directory>', 'Output directory for generated tests', './tests')
    .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
    .option('--base-url <url>', 'Override base URL from spec')
    .option('--tags <tags>', 'Comma-separated list of tags to include')
    .option('--exclude-tags <tags>', 'Comma-separated list of tags to exclude')
    .option('--paths <paths>', 'Comma-separated list of path patterns to include')
    .option('--methods <methods>', 'Comma-separated list of HTTP methods to include')
    .option('--auto-correlate', 'Automatically detect and apply data correlations', true)
    .option('--interactive', 'Interactive endpoint selection', true)
    .option('--scenarios-per-file <number>', 'Maximum scenarios per output file', '10')
    .option('-v, --verbose', 'Enable verbose logging')
    .action((specFile, options) => importCommand('openapi', specFile, options));

importCmd
    .command('wsdl')
    .description('Import test scenarios from WSDL specification')
    .argument('<wsdl-file>', 'WSDL specification file')
    .option('-o, --output <directory>', 'Output directory for generated tests', './tests')
    .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
    .option('--base-url <url>', 'Override service endpoint URL')
    .option('--services <services>', 'Comma-separated list of service names to include')
    .option('--operations <operations>', 'Comma-separated list of operation names to include')
    .option('--interactive', 'Interactive service selection', true)
    .option('-v, --verbose', 'Enable verbose logging')
    .action((wsdlFile, options) => importCommand('wsdl', wsdlFile, options));

importCmd
    .command('har')
    .description('Import test scenarios from HAR recording')
    .argument('<har-file>', 'HAR (HTTP Archive) file from browser recording')
    .option('-o, --output <directory>', 'Output directory for generated tests', './tests')
    .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
    .option('--filter-domains <domains>', 'Comma-separated list of domains to include')
    .option('--exclude-domains <domains>', 'Comma-separated list of domains to exclude')
    .option('--min-response-time <ms>', 'Minimum response time to include (ms)', '0')
    .option('--max-response-time <ms>', 'Maximum response time to include (ms)')
    .option('--methods <methods>', 'Comma-separated HTTP methods to include')
    .option('--exclude-static', 'Exclude static resources (images, CSS, JS)', true)
    .option('--auto-correlate', 'Automatically detect and apply data correlations', true)
    .option('--interactive', 'Interactive endpoint selection', true)
    .option('--group-by <criteria>', 'Group scenarios by (domain|path|none)', 'domain')
    .option('-v, --verbose', 'Enable verbose logging')
    .action((harFile, options) => importCommand('har', harFile, options));

importCmd
    .command('postman')
    .description('Import test scenarios from Postman collection')
    .argument('<collection-file>', 'Postman collection file (JSON)')
    .option('-o, --output <directory>', 'Output directory for generated tests', './tests')
    .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
    .option('--environment <env-file>', 'Postman environment file')
    .option('--folders <folders>', 'Comma-separated list of folder names to include')
    .option('--auto-correlate', 'Automatically detect and apply data correlations', true)
    .option('--interactive', 'Interactive request selection', true)
    .option('-v, --verbose', 'Enable verbose logging')
    .action((collectionFile, options) => importCommand('postman', collectionFile, options));

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
    .action(initCommand);

program.parse();
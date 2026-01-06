import * as vscode from 'vscode';

export class PerforniumCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        const currentIndent = this.getCurrentIndentLevel(linePrefix);
        const parentKey = this.findParentKey(document, position);

        const completionItems: vscode.CompletionItem[] = [];

        // Root level completions
        if (currentIndent === 0 && !parentKey) {
            this.addRootCompletions(completionItems);
        }
        // Global config completions
        else if (parentKey === 'global') {
            this.addGlobalCompletions(completionItems);
        }
        // Load config completions
        else if (parentKey === 'load') {
            this.addLoadCompletions(completionItems);
        }
        // Scenario completions
        else if (parentKey === 'scenarios' || this.isInScenariosArray(document, position)) {
            this.addScenarioCompletions(completionItems);
        }
        // Step level completions
        else if (parentKey === 'steps' || this.isInStepsArray(document, position)) {
            this.addStepCompletions(completionItems);
        }
        // REST step completions
        else if (this.isInRESTStep(document, position)) {
            this.addRESTCompletions(completionItems);
        }
        // Web step completions
        else if (parentKey === 'action' || this.isInWebStep(document, position)) {
            this.addWebCompletions(completionItems);
        }
        // Checks completions
        else if (parentKey === 'checks' || this.isInChecksArray(document, position)) {
            this.addCheckCompletions(completionItems);
        }
        // Extract completions
        else if (parentKey === 'extract' || this.isInExtractArray(document, position)) {
            this.addExtractCompletions(completionItems);
        }
        // Output completions
        else if (parentKey === 'outputs' || this.isInOutputsArray(document, position)) {
            this.addOutputCompletions(completionItems);
        }
        // Report completions
        else if (parentKey === 'report') {
            this.addReportCompletions(completionItems);
        }
        // Hooks completions
        else if (parentKey === 'hooks') {
            this.addHooksCompletions(completionItems);
        }
        // Debug config completions
        else if (parentKey === 'debug') {
            this.addDebugCompletions(completionItems);
        }
        // Browser config completions
        else if (parentKey === 'browser') {
            this.addBrowserCompletions(completionItems);
        }
        // Auth config completions
        else if (parentKey === 'auth') {
            this.addAuthCompletions(completionItems);
        }
        // HTTP methods
        else if (linePrefix.includes('method:')) {
            this.addHttpMethods(completionItems);
        }
        // Load patterns
        else if (linePrefix.includes('pattern:')) {
            this.addLoadPatterns(completionItems);
        }
        // Step types
        else if (linePrefix.includes('type:') && this.isInStepsArray(document, position)) {
            this.addStepTypes(completionItems);
        }
        // Web commands
        else if (linePrefix.includes('command:')) {
            this.addWebCommands(completionItems);
        }
        // Check types
        else if (linePrefix.includes('type:') && this.isInChecksArray(document, position)) {
            this.addCheckTypes(completionItems);
        }
        // Extract types
        else if (linePrefix.includes('type:') && this.isInExtractArray(document, position)) {
            this.addExtractTypes(completionItems);
        }

        return completionItems;
    }

    private getCurrentIndentLevel(linePrefix: string): number {
        const match = linePrefix.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    private findParentKey(document: vscode.TextDocument, position: vscode.Position): string | null {
        const currentIndent = this.getCurrentIndentLevel(document.lineAt(position).text);

        for (let i = position.line - 1; i >= 0; i--) {
            const line = document.lineAt(i).text;
            const indent = this.getCurrentIndentLevel(line);

            if (indent < currentIndent && line.trim().endsWith(':')) {
                const key = line.trim().replace(':', '');
                return key.startsWith('- ') ? key.substring(2) : key;
            }
        }

        return null;
    }

    private isInStepsArray(document: vscode.TextDocument, position: vscode.Position): boolean {
        return this.isInArraySection(document, position, 'steps:');
    }

    private isInScenariosArray(document: vscode.TextDocument, position: vscode.Position): boolean {
        return this.isInArraySection(document, position, 'scenarios:');
    }

    private isInOutputsArray(document: vscode.TextDocument, position: vscode.Position): boolean {
        return this.isInArraySection(document, position, 'outputs:');
    }

    private isInChecksArray(document: vscode.TextDocument, position: vscode.Position): boolean {
        return this.isInArraySection(document, position, 'checks:');
    }

    private isInExtractArray(document: vscode.TextDocument, position: vscode.Position): boolean {
        return this.isInArraySection(document, position, 'extract:');
    }

    private isInArraySection(document: vscode.TextDocument, position: vscode.Position, sectionKey: string): boolean {
        for (let i = position.line; i >= 0; i--) {
            const line = document.lineAt(i).text;
            if (line.trim() === sectionKey) return true;
            if (this.getCurrentIndentLevel(line) === 0 && line.trim() && !line.trim().startsWith('#')) {
                if (!line.includes(sectionKey.replace(':', ''))) return false;
            }
        }
        return false;
    }

    private isInRESTStep(document: vscode.TextDocument, position: vscode.Position): boolean {
        for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
            const line = document.lineAt(i).text;
            if (line.includes('type: rest') || line.includes("type: 'rest'") || line.includes('type: "rest"')) return true;
            if (line.includes('method:')) return true;
        }
        return false;
    }

    private isInWebStep(document: vscode.TextDocument, position: vscode.Position): boolean {
        for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
            const line = document.lineAt(i).text;
            if (line.includes('type: web') || line.includes("type: 'web'") || line.includes('type: "web"')) return true;
            if (line.includes('action:')) return true;
        }
        return false;
    }

    private addRootCompletions(items: vscode.CompletionItem[]) {
        const rootKeys = [
            { label: 'name', detail: 'Test configuration name (required)', insertText: 'name: ${1:My Load Test}' },
            { label: 'description', detail: 'Test description', insertText: 'description: ${1:Description}' },
            { label: 'global', detail: 'Global configuration', insertText: 'global:\n  base_url: ${1:https://api.example.com}\n  timeout: ${2:30000}' },
            { label: 'load', detail: 'Load pattern configuration (required)', insertText: 'load:\n  pattern: ${1|basic,stepping,arrivals|}\n  virtual_users: ${2:10}\n  duration: ${3:60s}' },
            { label: 'scenarios', detail: 'Test scenarios (required)', insertText: 'scenarios:\n  - name: ${1:Main Scenario}\n    steps:\n      - $0' },
            { label: 'outputs', detail: 'Output configuration', insertText: 'outputs:\n  - type: ${1|json,csv,html|}\n    file: ${2:results.json}' },
            { label: 'report', detail: 'Report generation', insertText: 'report:\n  generate: true\n  output: ${1:report.html}' },
            { label: 'hooks', detail: 'Test lifecycle hooks', insertText: 'hooks:\n  beforeTest:\n    type: inline\n    content: ${1:// setup code}' },
            { label: 'thresholds', detail: 'Performance thresholds', insertText: 'thresholds:\n  - metric: ${1|response_time,error_rate,throughput|}\n    value: ${2:1000}\n    operator: ${3|lt,lte,gt,gte|}' }
        ];

        for (const key of rootKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addGlobalCompletions(items: vscode.CompletionItem[]) {
        const globalKeys = [
            { label: 'base_url', detail: 'Base URL for all requests', insertText: 'base_url: ${1:https://api.example.com}' },
            { label: 'wsdl_url', detail: 'WSDL URL for SOAP services', insertText: 'wsdl_url: ${1:https://service.example.com?wsdl}' },
            { label: 'timeout', detail: 'Default timeout in milliseconds', insertText: 'timeout: ${1:30000}' },
            { label: 'think_time', detail: 'Default think time between requests', insertText: 'think_time: ${1:1s}' },
            { label: 'headers', detail: 'Default headers for all requests', insertText: 'headers:\n  ${1:Content-Type}: ${2:application/json}' },
            { label: 'variables', detail: 'Global variables', insertText: 'variables:\n  ${1:key}: ${2:value}' },
            { label: 'browser', detail: 'Browser configuration for web tests', insertText: 'browser:\n  type: ${1|chromium,firefox,webkit|}\n  headless: ${2|true,false|}' },
            { label: 'faker', detail: 'Faker.js configuration', insertText: 'faker:\n  locale: ${1:en}\n  seed: ${2:12345}' },
            { label: 'debug', detail: 'Debug configuration', insertText: 'debug:\n  log_level: ${1|debug,info,warn,error|}\n  capture_response_body: ${2|true,false|}' },
            { label: 'csv_data', detail: 'Global CSV data configuration', insertText: 'csv_data:\n  file: ${1:data.csv}\n  delimiter: ${2:,}' },
            { label: 'csv_mode', detail: 'CSV data access mode', insertText: 'csv_mode: ${1|next,unique,random|}' }
        ];

        for (const key of globalKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addLoadCompletions(items: vscode.CompletionItem[]) {
        const loadKeys = [
            { label: 'pattern', detail: 'Load pattern type', insertText: 'pattern: ${1|basic,stepping,arrivals|}' },
            { label: 'virtual_users', detail: 'Number of virtual users', insertText: 'virtual_users: ${1:10}' },
            { label: 'vus', detail: 'Number of virtual users (alias)', insertText: 'vus: ${1:10}' },
            { label: 'duration', detail: 'Test duration', insertText: 'duration: ${1:60s}' },
            { label: 'ramp_up', detail: 'Ramp-up time', insertText: 'ramp_up: ${1:30s}' },
            { label: 'rate', detail: 'Arrival rate (for arrivals pattern)', insertText: 'rate: ${1:10}' },
            { label: 'steps', detail: 'Stepping load steps', insertText: 'steps:\n  - users: ${1:10}\n    duration: ${2:1m}' },
            { label: 'name', detail: 'Phase name (for multi-phase loads)', insertText: 'name: ${1:Phase 1}' }
        ];

        for (const key of loadKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addScenarioCompletions(items: vscode.CompletionItem[]) {
        const scenarioKeys = [
            { label: 'name', detail: 'Scenario name (required)', insertText: 'name: ${1:Scenario Name}' },
            { label: 'description', detail: 'Scenario description', insertText: 'description: ${1:Description}' },
            { label: 'weight', detail: 'Scenario selection weight', insertText: 'weight: ${1:1}' },
            { label: 'loop', detail: 'Number of iterations or loop config', insertText: 'loop: ${1:1}' },
            { label: 'think_time', detail: 'Think time between steps', insertText: 'think_time: ${1:1s}' },
            { label: 'variables', detail: 'Scenario variables', insertText: 'variables:\n  ${1:key}: ${2:value}' },
            { label: 'steps', detail: 'Scenario steps (required)', insertText: 'steps:\n  - $0' },
            { label: 'csv_data', detail: 'CSV data configuration', insertText: 'csv_data:\n  file: ${1:data.csv}\n  mode: ${2|next,unique,random|}' },
            { label: 'csv_mode', detail: 'CSV data access mode', insertText: 'csv_mode: ${1|next,unique,random|}' },
            { label: 'condition', detail: 'Conditional execution (JS expression)', insertText: 'condition: ${1:true}' },
            { label: 'enabled', detail: 'Enable/disable scenario', insertText: 'enabled: ${1|true,false|}' },
            { label: 'hooks', detail: 'Scenario lifecycle hooks', insertText: 'hooks:\n  beforeScenario:\n    type: inline\n    content: ${1:// code}' }
        ];

        for (const key of scenarioKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addStepCompletions(items: vscode.CompletionItem[]) {
        const stepTemplates = [
            {
                label: 'REST GET',
                detail: 'REST API GET request',
                insertText: 'name: ${1:GET Request}\ntype: rest\nmethod: GET\npath: ${2:/api/endpoint}\nchecks:\n  - type: status\n    value: 200'
            },
            {
                label: 'REST POST',
                detail: 'REST API POST request with JSON body',
                insertText: 'name: ${1:POST Request}\ntype: rest\nmethod: POST\npath: ${2:/api/endpoint}\nheaders:\n  Content-Type: application/json\njson:\n  ${3:key}: ${4:value}\nchecks:\n  - type: status\n    value: ${5:201}'
            },
            {
                label: 'Web Navigate',
                detail: 'Browser navigation step',
                insertText: 'name: ${1:Navigate}\ntype: web\naction:\n  command: goto\n  url: ${2:https://example.com}'
            },
            {
                label: 'Web Click',
                detail: 'Browser click action',
                insertText: 'name: ${1:Click Element}\ntype: web\naction:\n  command: click\n  selector: ${2:#button-id}'
            },
            {
                label: 'Web Fill',
                detail: 'Browser form fill action',
                insertText: 'name: ${1:Fill Form}\ntype: web\naction:\n  command: fill\n  selector: ${2:#input-id}\n  value: ${3:text}'
            },
            {
                label: 'Web Vitals',
                detail: 'Measure Core Web Vitals',
                insertText: 'name: ${1:Measure Web Vitals}\ntype: web\naction:\n  command: measure_web_vitals\n  measureWebVitals: true\n  webVitalsWaitTime: ${2:5000}'
            },
            {
                label: 'SOAP Request',
                detail: 'SOAP service request',
                insertText: 'name: ${1:SOAP Request}\ntype: soap\noperation: ${2:OperationName}\nargs:\n  ${3:param}: ${4:value}'
            },
            {
                label: 'Wait',
                detail: 'Wait/delay step',
                insertText: 'name: ${1:Wait}\ntype: wait\nduration: ${2:1s}'
            },
            {
                label: 'Custom Script',
                detail: 'Custom JavaScript step',
                insertText: 'name: ${1:Custom Step}\ntype: custom\nscript: |\n  ${2:// Your code here}'
            },
            {
                label: 'Script File',
                detail: 'Execute external script file',
                insertText: 'name: ${1:Run Script}\ntype: script\nfile: ${2:scripts/my-script.ts}\nfunction: ${3:myFunction}'
            }
        ];

        const stepKeys = [
            { label: 'name', detail: 'Step name', insertText: 'name: ${1:Step Name}' },
            { label: 'type', detail: 'Step type', insertText: 'type: ${1|rest,web,soap,wait,custom,script|}' },
            { label: 'condition', detail: 'Conditional execution', insertText: 'condition: ${1:true}' },
            { label: 'continueOnError', detail: 'Continue on error', insertText: 'continueOnError: ${1|true,false|}' },
            { label: 'think_time', detail: 'Think time after step', insertText: 'think_time: ${1:1s}' },
            { label: 'retry', detail: 'Retry configuration', insertText: 'retry:\n  max_attempts: ${1:3}\n  delay: ${2:1s}\n  backoff: ${3|linear,exponential|}' },
            { label: 'thresholds', detail: 'Step-level thresholds', insertText: 'thresholds:\n  - metric: ${1|response_time,error_rate|}\n    value: ${2:1000}\n    operator: ${3|lt,lte|}' },
            { label: 'hooks', detail: 'Step lifecycle hooks', insertText: 'hooks:\n  beforeStep:\n    type: inline\n    content: ${1:// code}' }
        ];

        // Add templates first
        for (const template of stepTemplates) {
            const item = new vscode.CompletionItem(template.label, vscode.CompletionItemKind.Snippet);
            item.detail = template.detail;
            item.insertText = new vscode.SnippetString(template.insertText);
            item.sortText = '0' + template.label; // Sort templates first
            items.push(item);
        }

        // Add individual keys
        for (const key of stepKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            item.sortText = '1' + key.label;
            items.push(item);
        }
    }

    private addRESTCompletions(items: vscode.CompletionItem[]) {
        const restKeys = [
            { label: 'method', detail: 'HTTP method', insertText: 'method: ${1|GET,POST,PUT,DELETE,PATCH,HEAD,OPTIONS|}' },
            { label: 'path', detail: 'Request path', insertText: 'path: ${1:/api/endpoint}' },
            { label: 'headers', detail: 'Request headers', insertText: 'headers:\n  ${1:Content-Type}: ${2:application/json}' },
            { label: 'body', detail: 'Request body (string)', insertText: 'body: ${1:}' },
            { label: 'json', detail: 'JSON request body', insertText: 'json:\n  ${1:key}: ${2:value}' },
            { label: 'jsonFile', detail: 'Load JSON body from file', insertText: 'jsonFile: ${1:payloads/request.json}' },
            { label: 'overrides', detail: 'Override values in loaded JSON', insertText: 'overrides:\n  ${1:path.to.field}: ${2:value}' },
            { label: 'xml', detail: 'XML request body', insertText: 'xml: |\n  ${1:<xml>content</xml>}' },
            { label: 'form', detail: 'Form data (application/x-www-form-urlencoded)', insertText: 'form:\n  ${1:field}: ${2:value}' },
            { label: 'multipart', detail: 'Multipart form data', insertText: 'multipart:\n  ${1:file}: ${2:@path/to/file}' },
            { label: 'query', detail: 'Query parameters', insertText: 'query:\n  ${1:param}: ${2:value}' },
            { label: 'timeout', detail: 'Request timeout (ms)', insertText: 'timeout: ${1:30000}' },
            { label: 'auth', detail: 'Authentication', insertText: 'auth:\n  type: ${1|basic,bearer,digest,oauth|}\n  ${2:token}: ${3:value}' },
            { label: 'checks', detail: 'Response validation', insertText: 'checks:\n  - type: status\n    value: ${1:200}' },
            { label: 'extract', detail: 'Data extraction', insertText: 'extract:\n  - name: ${1:var_name}\n    type: json_path\n    expression: ${2:$.data}' }
        ];

        for (const key of restKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addWebCompletions(items: vscode.CompletionItem[]) {
        const webKeys = [
            { label: 'command', detail: 'Web action command', insertText: 'command: ${1|goto,click,fill,select,hover,screenshot,wait_for_selector,wait_for_text,verify_text,verify_exists,verify_visible,measure_web_vitals,evaluate|}' },
            { label: 'url', detail: 'URL for navigation', insertText: 'url: ${1:https://example.com}' },
            { label: 'selector', detail: 'Element selector', insertText: 'selector: ${1:#element-id}' },
            { label: 'value', detail: 'Input value', insertText: 'value: ${1:text}' },
            { label: 'text', detail: 'Expected text', insertText: 'text: ${1:expected text}' },
            { label: 'script', detail: 'JavaScript to evaluate', insertText: 'script: ${1:return document.title}' },
            { label: 'timeout', detail: 'Action timeout (ms)', insertText: 'timeout: ${1:30000}' },
            { label: 'measureWebVitals', detail: 'Measure Core Web Vitals', insertText: 'measureWebVitals: true' },
            { label: 'collectWebVitals', detail: 'Collect web vitals after action', insertText: 'collectWebVitals: ${1|true,false|}' },
            { label: 'webVitalsWaitTime', detail: 'Wait time for web vitals (ms)', insertText: 'webVitalsWaitTime: ${1:5000}' },
            { label: 'waitUntil', detail: 'Wait until state', insertText: 'waitUntil: ${1|load,domcontentloaded,networkidle,commit|}' },
            { label: 'options', detail: 'Additional options', insertText: 'options:\n  ${1:key}: ${2:value}' }
        ];

        for (const key of webKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addCheckCompletions(items: vscode.CompletionItem[]) {
        const checkKeys = [
            { label: 'type', detail: 'Check type', insertText: 'type: ${1|status,response_time,json_path,text_contains,selector,url_contains,custom|}' },
            { label: 'value', detail: 'Expected value', insertText: 'value: ${1:200}' },
            { label: 'operator', detail: 'Comparison operator', insertText: 'operator: ${1|equals,contains,exists,lt,gt,lte,gte|}' },
            { label: 'description', detail: 'Check description', insertText: 'description: ${1:Should return 200}' },
            { label: 'script', detail: 'Custom validation script', insertText: 'script: ${1:return response.status === 200}' }
        ];

        for (const key of checkKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addExtractCompletions(items: vscode.CompletionItem[]) {
        const extractKeys = [
            { label: 'name', detail: 'Variable name (required)', insertText: 'name: ${1:variable_name}' },
            { label: 'type', detail: 'Extraction type', insertText: 'type: ${1|json_path,regex,header,selector,custom|}' },
            { label: 'expression', detail: 'Extraction expression', insertText: 'expression: ${1:$.data.id}' },
            { label: 'script', detail: 'Custom extraction script', insertText: 'script: ${1:return response.data}' },
            { label: 'default', detail: 'Default value if extraction fails', insertText: 'default: ${1:null}' }
        ];

        for (const key of extractKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addOutputCompletions(items: vscode.CompletionItem[]) {
        const outputKeys = [
            { label: 'type', detail: 'Output type', insertText: 'type: ${1|json,csv,html,influxdb,graphite,webhook|}' },
            { label: 'file', detail: 'Output file path', insertText: 'file: ${1:results.json}' },
            { label: 'enabled', detail: 'Enable/disable output', insertText: 'enabled: ${1|true,false|}' },
            { label: 'url', detail: 'Endpoint URL (for remote outputs)', insertText: 'url: ${1:http://localhost:8086}' },
            { label: 'database', detail: 'Database name (for InfluxDB)', insertText: 'database: ${1:perfornium}' },
            { label: 'tags', detail: 'Output tags', insertText: 'tags:\n  ${1:env}: ${2:production}' },
            { label: 'headers', detail: 'HTTP headers (for webhook)', insertText: 'headers:\n  ${1:Authorization}: ${2:Bearer token}' },
            { label: 'template', detail: 'Custom template path (for HTML)', insertText: 'template: ${1:templates/custom.hbs}' }
        ];

        for (const key of outputKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addReportCompletions(items: vscode.CompletionItem[]) {
        const reportKeys = [
            { label: 'generate', detail: 'Generate HTML report', insertText: 'generate: ${1|true,false|}' },
            { label: 'output', detail: 'Report output path', insertText: 'output: ${1:report.html}' },
            { label: 'template', detail: 'Custom report template', insertText: 'template: ${1:default}' },
            { label: 'title', detail: 'Report title', insertText: 'title: ${1:Performance Test Report}' }
        ];

        for (const key of reportKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addHooksCompletions(items: vscode.CompletionItem[]) {
        const hookKeys = [
            { label: 'beforeTest', detail: 'Run before test starts', insertText: 'beforeTest:\n  type: ${1|inline,file,steps|}\n  ${2:content}: ${3:// code}' },
            { label: 'teardownTest', detail: 'Run after test completes', insertText: 'teardownTest:\n  type: ${1|inline,file,steps|}\n  ${2:content}: ${3:// cleanup}' },
            { label: 'onTestError', detail: 'Run on test error', insertText: 'onTestError:\n  type: ${1|inline,file|}\n  content: ${2:// error handling}' },
            { label: 'beforeVU', detail: 'Run before each VU starts', insertText: 'beforeVU:\n  type: inline\n  content: ${1:// VU setup}' },
            { label: 'teardownVU', detail: 'Run after each VU completes', insertText: 'teardownVU:\n  type: inline\n  content: ${1:// VU cleanup}' },
            { label: 'beforeScenario', detail: 'Run before scenario', insertText: 'beforeScenario:\n  type: inline\n  content: ${1:// scenario setup}' },
            { label: 'teardownScenario', detail: 'Run after scenario', insertText: 'teardownScenario:\n  type: inline\n  content: ${1:// scenario cleanup}' },
            { label: 'beforeLoop', detail: 'Run before each loop iteration', insertText: 'beforeLoop:\n  type: inline\n  content: ${1:// loop setup}' },
            { label: 'afterLoop', detail: 'Run after each loop iteration', insertText: 'afterLoop:\n  type: inline\n  content: ${1:// loop cleanup}' }
        ];

        for (const key of hookKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addDebugCompletions(items: vscode.CompletionItem[]) {
        const debugKeys = [
            { label: 'log_level', detail: 'Log level', insertText: 'log_level: ${1|debug,info,warn,error|}' },
            { label: 'capture_request_headers', detail: 'Capture request headers', insertText: 'capture_request_headers: ${1|true,false|}' },
            { label: 'capture_request_body', detail: 'Capture request body', insertText: 'capture_request_body: ${1|true,false|}' },
            { label: 'capture_response_headers', detail: 'Capture response headers', insertText: 'capture_response_headers: ${1|true,false|}' },
            { label: 'capture_response_body', detail: 'Capture response body', insertText: 'capture_response_body: ${1|true,false|}' },
            { label: 'capture_only_failures', detail: 'Only capture on failures', insertText: 'capture_only_failures: ${1|true,false|}' },
            { label: 'max_response_body_size', detail: 'Max response body size to capture', insertText: 'max_response_body_size: ${1:5000}' }
        ];

        for (const key of debugKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addBrowserCompletions(items: vscode.CompletionItem[]) {
        const browserKeys = [
            { label: 'type', detail: 'Browser type', insertText: 'type: ${1|chromium,firefox,webkit|}' },
            { label: 'headless', detail: 'Run in headless mode', insertText: 'headless: ${1|true,false|}' },
            { label: 'viewport', detail: 'Browser viewport', insertText: 'viewport:\n  width: ${1:1920}\n  height: ${2:1080}' },
            { label: 'slow_mo', detail: 'Slow motion delay (ms)', insertText: 'slow_mo: ${1:100}' },
            { label: 'base_url', detail: 'Base URL for browser', insertText: 'base_url: ${1:https://example.com}' },
            { label: 'highlight', detail: 'Highlight elements', insertText: 'highlight: ${1|true,false|}' },
            { label: 'clear_storage', detail: 'Clear browser storage', insertText: 'clear_storage: ${1|true,false|}' }
        ];

        for (const key of browserKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addAuthCompletions(items: vscode.CompletionItem[]) {
        const authKeys = [
            { label: 'type', detail: 'Authentication type', insertText: 'type: ${1|basic,bearer,digest,oauth|}' },
            { label: 'username', detail: 'Username (for basic/digest)', insertText: 'username: ${1:user}' },
            { label: 'password', detail: 'Password (for basic/digest)', insertText: 'password: ${1:pass}' },
            { label: 'token', detail: 'Token (for bearer/oauth)', insertText: 'token: ${1:your-token}' }
        ];

        for (const key of authKeys) {
            const item = new vscode.CompletionItem(key.label, vscode.CompletionItemKind.Property);
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
        }
    }

    private addHttpMethods(items: vscode.CompletionItem[]) {
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        for (const method of methods) {
            const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.EnumMember);
            item.insertText = method;
            items.push(item);
        }
    }

    private addLoadPatterns(items: vscode.CompletionItem[]) {
        const patterns = [
            { label: 'basic', detail: 'Constant load with optional ramp-up' },
            { label: 'stepping', detail: 'Step-wise load increase' },
            { label: 'arrivals', detail: 'Constant arrival rate' }
        ];
        for (const pattern of patterns) {
            const item = new vscode.CompletionItem(pattern.label, vscode.CompletionItemKind.EnumMember);
            item.detail = pattern.detail;
            item.insertText = pattern.label;
            items.push(item);
        }
    }

    private addStepTypes(items: vscode.CompletionItem[]) {
        const types = [
            { label: 'rest', detail: 'REST API request' },
            { label: 'web', detail: 'Browser automation (Playwright)' },
            { label: 'soap', detail: 'SOAP service request' },
            { label: 'wait', detail: 'Wait/delay step' },
            { label: 'custom', detail: 'Custom JavaScript code' },
            { label: 'script', detail: 'External script file' }
        ];
        for (const type of types) {
            const item = new vscode.CompletionItem(type.label, vscode.CompletionItemKind.EnumMember);
            item.detail = type.detail;
            item.insertText = type.label;
            items.push(item);
        }
    }

    private addWebCommands(items: vscode.CompletionItem[]) {
        const commands = [
            { label: 'goto', detail: 'Navigate to URL' },
            { label: 'click', detail: 'Click element' },
            { label: 'fill', detail: 'Fill input field' },
            { label: 'select', detail: 'Select dropdown option' },
            { label: 'hover', detail: 'Hover over element' },
            { label: 'screenshot', detail: 'Take screenshot' },
            { label: 'wait_for_selector', detail: 'Wait for element' },
            { label: 'wait_for_text', detail: 'Wait for text content' },
            { label: 'wait_for_load_state', detail: 'Wait for page load state' },
            { label: 'verify_text', detail: 'Verify text content' },
            { label: 'verify_exists', detail: 'Verify element exists' },
            { label: 'verify_visible', detail: 'Verify element visible' },
            { label: 'verify_not_exists', detail: 'Verify element does not exist' },
            { label: 'evaluate', detail: 'Execute JavaScript' },
            { label: 'measure_web_vitals', detail: 'Measure Core Web Vitals' },
            { label: 'measure_verification', detail: 'Measure verification timing' },
            { label: 'performance_audit', detail: 'Run performance audit' },
            { label: 'accessibility_audit', detail: 'Run accessibility audit' },
            { label: 'network_idle', detail: 'Wait for network idle' },
            { label: 'dom_ready', detail: 'Wait for DOM ready' }
        ];
        for (const cmd of commands) {
            const item = new vscode.CompletionItem(cmd.label, vscode.CompletionItemKind.EnumMember);
            item.detail = cmd.detail;
            item.insertText = cmd.label;
            items.push(item);
        }
    }

    private addCheckTypes(items: vscode.CompletionItem[]) {
        const types = [
            { label: 'status', detail: 'HTTP status code check' },
            { label: 'response_time', detail: 'Response time check' },
            { label: 'json_path', detail: 'JSONPath expression check' },
            { label: 'text_contains', detail: 'Text content check' },
            { label: 'selector', detail: 'Element selector check' },
            { label: 'url_contains', detail: 'URL content check' },
            { label: 'custom', detail: 'Custom script check' }
        ];
        for (const type of types) {
            const item = new vscode.CompletionItem(type.label, vscode.CompletionItemKind.EnumMember);
            item.detail = type.detail;
            item.insertText = type.label;
            items.push(item);
        }
    }

    private addExtractTypes(items: vscode.CompletionItem[]) {
        const types = [
            { label: 'json_path', detail: 'Extract using JSONPath' },
            { label: 'regex', detail: 'Extract using regex' },
            { label: 'header', detail: 'Extract from response header' },
            { label: 'selector', detail: 'Extract from HTML selector' },
            { label: 'custom', detail: 'Custom extraction script' }
        ];
        for (const type of types) {
            const item = new vscode.CompletionItem(type.label, vscode.CompletionItemKind.EnumMember);
            item.detail = type.detail;
            item.insertText = type.label;
            items.push(item);
        }
    }
}

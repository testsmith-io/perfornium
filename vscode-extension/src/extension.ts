import * as vscode from 'vscode';
import { PerforniumTestProvider } from './testProvider';
import { PerforniumCompletionProvider } from './completionProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Perfornium extension is now active!');

    // Register completion provider for YAML files
    const yamlSelector = [
        { scheme: 'file', pattern: '**/*.perfornium.yml' },
        { scheme: 'file', pattern: '**/*.perfornium.yaml' },
        { scheme: 'file', pattern: '**/perfornium.yml' },
        { scheme: 'file', pattern: '**/perfornium.yaml' },
        { scheme: 'file', language: 'yaml' }
    ];

    const completionProvider = new PerforniumCompletionProvider();
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            yamlSelector,
            completionProvider,
            '.', ':', ' ', '-'
        )
    );

    // Register hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            yamlSelector,
            {
                provideHover(document, position) {
                    const line = document.lineAt(position).text;
                    const wordRange = document.getWordRangeAtPosition(position);
                    const word = wordRange ? document.getText(wordRange) : '';

                    const hoverInfo = getHoverInfo(word, line);
                    if (hoverInfo) {
                        return new vscode.Hover(hoverInfo);
                    }
                }
            }
        )
    );

    // Register test provider
    const testProvider = new PerforniumTestProvider(context.workspaceState);
    const testController = vscode.tests.createTestController(
        'perforniumTestController',
        'Perfornium Tests'
    );

    context.subscriptions.push(testController);

    testController.createRunProfile(
        'Run',
        vscode.TestRunProfileKind.Run,
        (request, token) => {
            testProvider.runTests(testController, request, token);
        },
        true
    );

    testController.createRunProfile(
        'Debug',
        vscode.TestRunProfileKind.Debug,
        (request, token) => {
            testProvider.runTests(testController, request, token, true);
        },
        false
    );

    testController.resolveHandler = async (item) => {
        if (!item) {
            await testProvider.discoverTests(testController);
        } else {
            await testProvider.resolveTestItem(testController, item);
        }
    };

    // Watch for file changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{perfornium.yml,perfornium.yaml,perfornium.ts}');
    fileWatcher.onDidCreate(() => testProvider.discoverTests(testController));
    fileWatcher.onDidChange(() => testProvider.discoverTests(testController));
    fileWatcher.onDidDelete(() => testProvider.discoverTests(testController));

    context.subscriptions.push(fileWatcher);

    // Initial test discovery
    testProvider.discoverTests(testController);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('perfornium.runTest', async (testItem?: vscode.TestItem) => {
            if (testItem) {
                const run = testController.createTestRun(
                    new vscode.TestRunRequest([testItem]),
                    `Run ${testItem.label}`,
                    true
                );
                testProvider.runTest(testController, testItem, run);
            } else {
                // Run current file
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const terminal = vscode.window.createTerminal('Perfornium');
                    terminal.show();
                    terminal.sendText(`perfornium run "${editor.document.fileName}"`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('perfornium.debugTest', async (testItem?: vscode.TestItem) => {
            if (testItem) {
                const run = testController.createTestRun(
                    new vscode.TestRunRequest([testItem]),
                    `Debug ${testItem.label}`,
                    true
                );
                testProvider.runTest(testController, testItem, run, true);
            } else {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const terminal = vscode.window.createTerminal('Perfornium Debug');
                    terminal.show();
                    terminal.sendText(`perfornium run "${editor.document.fileName}" --debug`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('perfornium.validateConfig', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const terminal = vscode.window.createTerminal('Perfornium Validate');
                terminal.show();
                terminal.sendText(`perfornium validate "${editor.document.fileName}"`);
            }
        })
    );

    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(beaker) Perfornium';
    statusBar.tooltip = 'Perfornium Load Testing';
    statusBar.command = 'perfornium.runTest';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

function getHoverInfo(word: string, line: string): vscode.MarkdownString | undefined {
    const hoverData: { [key: string]: string } = {
        // Root level
        'name': '**name** `string` (required)\n\nThe name of your test configuration.',
        'description': '**description** `string`\n\nOptional description of the test.',
        'global': '**global** `object`\n\nGlobal configuration settings applied to all scenarios.',
        'load': '**load** `object` (required)\n\nLoad pattern configuration defining virtual users and duration.',
        'scenarios': '**scenarios** `array` (required)\n\nArray of test scenarios to execute.',
        'outputs': '**outputs** `array`\n\nOutput configurations for test results (json, csv, html, influxdb, graphite, webhook).',
        'report': '**report** `object`\n\nHTML report generation configuration.',
        'hooks': '**hooks** `object`\n\nTest lifecycle hooks (beforeTest, teardownTest, onTestError).',
        'thresholds': '**thresholds** `array`\n\nPerformance thresholds for pass/fail criteria.',

        // Global config
        'base_url': '**base_url** `string`\n\nBase URL for all HTTP requests. Can use environment variables: `${ENV_VAR}`',
        'wsdl_url': '**wsdl_url** `string`\n\nWSDL URL for SOAP services.',
        'timeout': '**timeout** `number`\n\nDefault request timeout in milliseconds (default: 30000).',
        'think_time': '**think_time** `string | number`\n\nPause between requests. Examples: `1s`, `500ms`, `2000`',
        'headers': '**headers** `object`\n\nDefault HTTP headers for all requests.',
        'variables': '**variables** `object`\n\nGlobal variables accessible in templates: `{{variable_name}}`',
        'browser': '**browser** `object`\n\nBrowser configuration for Playwright web testing.',
        'faker': '**faker** `object`\n\nFaker.js configuration for generating test data.\n\n```yaml\nfaker:\n  locale: en\n  seed: 12345\n```',
        'debug': '**debug** `object`\n\nDebug and logging configuration.',
        'csv_data': '**csv_data** `object`\n\nGlobal CSV data configuration for data-driven testing.',
        'csv_mode': '**csv_mode** `"next" | "unique" | "random"`\n\nCSV data access mode:\n- `next`: Round-robin access\n- `unique`: Each VU gets unique rows\n- `random`: Random row selection',

        // Load config
        'pattern': '**pattern** `"basic" | "stepping" | "arrivals"` (required)\n\n- `basic`: Constant load with optional ramp-up\n- `stepping`: Step-wise load increase\n- `arrivals`: Constant arrival rate',
        'virtual_users': '**virtual_users** `number`\n\nNumber of concurrent virtual users.',
        'vus': '**vus** `number`\n\nAlias for virtual_users.',
        'duration': '**duration** `string` (required)\n\nTest duration. Examples: `60s`, `5m`, `1h`',
        'ramp_up': '**ramp_up** `string`\n\nTime to ramp up to target users. Examples: `30s`, `1m`',
        'rate': '**rate** `number`\n\nArrival rate in requests per second (for arrivals pattern).',
        'steps': '**steps** `array`\n\nStepping load configuration:\n\n```yaml\nsteps:\n  - users: 10\n    duration: 1m\n  - users: 50\n    duration: 3m\n```',

        // Scenario config
        'weight': '**weight** `number`\n\nScenario selection weight for multi-scenario tests (default: 1).',
        'loop': '**loop** `number | object`\n\nNumber of iterations or advanced loop configuration.',
        'condition': '**condition** `string`\n\nJavaScript expression for conditional execution.',
        'enabled': '**enabled** `boolean`\n\nEnable or disable the scenario (default: true).',

        // Step types
        'type': '**type** `"rest" | "web" | "soap" | "wait" | "custom" | "script"`\n\nStep type:\n- `rest`: REST API request\n- `web`: Browser automation (Playwright)\n- `soap`: SOAP service call\n- `wait`: Delay/pause\n- `custom`: Inline JavaScript\n- `script`: External script file',
        'method': '**method** `string`\n\nHTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`',
        'path': '**path** `string`\n\nRequest path (appended to base_url). Supports templates: `/users/{{user_id}}`',
        'body': '**body** `string`\n\nRequest body as string.',
        'json': '**json** `object`\n\nJSON request body (automatically sets Content-Type).',
        'jsonFile': '**jsonFile** `string`\n\nPath to JSON file to load as request body.',
        'overrides': '**overrides** `object`\n\nOverride values in loaded JSON. Supports dot notation:\n\n```yaml\noverrides:\n  user.name: "{{faker.person.fullName}}"\n```',
        'xml': '**xml** `string`\n\nXML request body.',
        'form': '**form** `object`\n\nForm data (application/x-www-form-urlencoded).',
        'multipart': '**multipart** `object`\n\nMultipart form data for file uploads.',
        'query': '**query** `object`\n\nURL query parameters.',
        'auth': '**auth** `object`\n\nAuthentication configuration:\n\n```yaml\nauth:\n  type: bearer\n  token: "{{access_token}}"\n```\n\nTypes: `basic`, `bearer`, `digest`, `oauth`',

        // Web actions
        'action': '**action** `object`\n\nWeb action configuration for browser automation.',
        'command': '**command** `string`\n\nWeb action command:\n- Navigation: `goto`\n- Interaction: `click`, `fill`, `select`, `hover`\n- Waiting: `wait_for_selector`, `wait_for_text`, `wait_for_load_state`\n- Verification: `verify_text`, `verify_exists`, `verify_visible`\n- Performance: `measure_web_vitals`, `performance_audit`\n- Utility: `screenshot`, `evaluate`',
        'selector': '**selector** `string`\n\nCSS or XPath selector for element interaction.',
        'url': '**url** `string`\n\nURL for navigation (goto command).',
        'value': '**value** `string`\n\nInput value for fill/select commands.',
        'text': '**text** `string`\n\nExpected text for verification commands.',
        'script': '**script** `string`\n\nJavaScript code to execute (evaluate command or custom step).',
        'measureWebVitals': '**measureWebVitals** `boolean`\n\nMeasure Core Web Vitals (LCP, FID, CLS, FCP, TTFB).',
        'webVitalsWaitTime': '**webVitalsWaitTime** `number`\n\nTime to wait for Web Vitals measurement (ms).',
        'waitUntil': '**waitUntil** `"load" | "domcontentloaded" | "networkidle" | "commit"`\n\nPage load state to wait for.',

        // Checks
        'checks': '**checks** `array`\n\nResponse validation checks:\n\n```yaml\nchecks:\n  - type: status\n    value: 200\n  - type: json_path\n    value: $.success\n    operator: equals\n    expected: true\n```',
        'operator': '**operator** `string`\n\nComparison operator: `equals`, `contains`, `exists`, `lt`, `gt`, `lte`, `gte`',

        // Extract
        'extract': '**extract** `array`\n\nData extraction from responses:\n\n```yaml\nextract:\n  - name: user_id\n    type: json_path\n    expression: $.data.id\n```',
        'expression': '**expression** `string`\n\nExtraction expression (JSONPath, regex, etc.).',

        // Output types
        'file': '**file** `string`\n\nOutput file path. Supports templates: `results-{{timestamp}}.json`',

        // Hooks
        'beforeTest': '**beforeTest** `HookScript`\n\nRun before test starts. Can be inline, file, or steps.',
        'teardownTest': '**teardownTest** `HookScript`\n\nRun after test completes (cleanup).',
        'onTestError': '**onTestError** `HookScript`\n\nRun when test encounters an error.',
        'beforeVU': '**beforeVU** `HookScript`\n\nRun before each virtual user starts.',
        'teardownVU': '**teardownVU** `HookScript`\n\nRun after each virtual user completes.',
        'beforeScenario': '**beforeScenario** `HookScript`\n\nRun before each scenario execution.',
        'teardownScenario': '**teardownScenario** `HookScript`\n\nRun after each scenario completes.',
        'beforeLoop': '**beforeLoop** `HookScript`\n\nRun before each loop iteration.',
        'afterLoop': '**afterLoop** `HookScript`\n\nRun after each loop iteration.',
        'beforeStep': '**beforeStep** `HookScript`\n\nRun before each step execution.',
        'teardownStep': '**teardownStep** `HookScript`\n\nRun after each step completes.',

        // Step options
        'continueOnError': '**continueOnError** `boolean`\n\nContinue test execution if this step fails (default: false).',
        'retry': '**retry** `object`\n\nRetry configuration:\n\n```yaml\nretry:\n  max_attempts: 3\n  delay: 1s\n  backoff: exponential\n```',

        // Browser config
        'headless': '**headless** `boolean`\n\nRun browser in headless mode (default: true).',
        'viewport': '**viewport** `object`\n\nBrowser viewport size:\n\n```yaml\nviewport:\n  width: 1920\n  height: 1080\n```',
        'slow_mo': '**slow_mo** `number`\n\nSlow down browser actions by specified ms.',
        'highlight': '**highlight** `boolean | object`\n\nHighlight elements during interaction.',
        'clear_storage': '**clear_storage** `boolean | object`\n\nClear browser storage between scenarios.',

        // Debug config
        'log_level': '**log_level** `"debug" | "info" | "warn" | "error"`\n\nLogging level.',
        'capture_request_headers': '**capture_request_headers** `boolean`\n\nCapture request headers in results.',
        'capture_request_body': '**capture_request_body** `boolean`\n\nCapture request body in results.',
        'capture_response_headers': '**capture_response_headers** `boolean`\n\nCapture response headers in results.',
        'capture_response_body': '**capture_response_body** `boolean`\n\nCapture response body in results.',
        'capture_only_failures': '**capture_only_failures** `boolean`\n\nOnly capture data for failed requests.',
        'max_response_body_size': '**max_response_body_size** `number`\n\nMaximum response body size to capture (bytes).',

        // Report config
        'generate': '**generate** `boolean`\n\nGenerate HTML report (default: false).',
        'output': '**output** `string`\n\nReport output file path.',
        'template': '**template** `string`\n\nCustom report template path.',
        'title': '**title** `string`\n\nReport title.',

        // Web Vitals
        'LCP': '**LCP** - Largest Contentful Paint\n\nMeasures loading performance. Good: < 2.5s',
        'FID': '**FID** - First Input Delay\n\nMeasures interactivity. Good: < 100ms',
        'CLS': '**CLS** - Cumulative Layout Shift\n\nMeasures visual stability. Good: < 0.1',
        'FCP': '**FCP** - First Contentful Paint\n\nTime to first content render. Good: < 1.8s',
        'TTFB': '**TTFB** - Time to First Byte\n\nServer response time. Good: < 800ms',
        'INP': '**INP** - Interaction to Next Paint\n\nMeasures responsiveness. Good: < 200ms',

        // HTTP Methods
        'GET': '**GET** - Retrieve resource',
        'POST': '**POST** - Create resource',
        'PUT': '**PUT** - Update/replace resource',
        'DELETE': '**DELETE** - Remove resource',
        'PATCH': '**PATCH** - Partial update',
        'HEAD': '**HEAD** - Get headers only',
        'OPTIONS': '**OPTIONS** - Get allowed methods'
    };

    if (hoverData[word]) {
        const markdown = new vscode.MarkdownString(hoverData[word]);
        markdown.isTrusted = true;
        markdown.supportHtml = true;
        return markdown;
    }

    return undefined;
}

export function deactivate(): Thenable<void> | undefined {
    return undefined;
}

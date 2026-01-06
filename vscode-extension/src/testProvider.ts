import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class PerforniumTestProvider {
    private testData = new Map<string, vscode.TestItem>();

    constructor(private workspaceState: vscode.Memento) {}

    async discoverTests(controller: vscode.TestController) {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        // Clear existing tests
        this.testData.clear();
        controller.items.replace([]);

        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            await this.discoverTestsInFolder(workspaceFolder, controller);
        }
    }

    private async discoverTestsInFolder(
        workspaceFolder: vscode.WorkspaceFolder,
        controller: vscode.TestController
    ) {
        // Find all perfornium test files
        const testFilePatterns = [
            '**/*.perfornium.yml',
            '**/*.perfornium.yaml',
            '**/*.perfornium.ts',
            '**/perfornium.yml',
            '**/perfornium.yaml'
        ];

        for (const pattern of testFilePatterns) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, pattern),
                '**/node_modules/**'
            );

            for (const file of files) {
                await this.addTestFile(file, controller, workspaceFolder);
            }
        }
    }

    private async addTestFile(
        uri: vscode.Uri,
        controller: vscode.TestController,
        workspaceFolder: vscode.WorkspaceFolder
    ) {
        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        const testId = `perfornium:${uri.fsPath}`;

        // Create test item for the file
        const testItem = controller.createTestItem(
            testId,
            path.basename(uri.fsPath),
            uri
        );

        testItem.canResolveChildren = true;

        // Store test data
        this.testData.set(testId, testItem);

        // Add to controller
        controller.items.add(testItem);

        // Try to parse the file and create sub-tests
        await this.parseTestFile(uri, testItem, controller);
    }

    private async parseTestFile(
        uri: vscode.Uri,
        parentItem: vscode.TestItem,
        controller: vscode.TestController
    ) {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');

            if (uri.fsPath.endsWith('.yml') || uri.fsPath.endsWith('.yaml')) {
                // Parse YAML file for test scenarios
                const yaml = require('yaml');
                const config = yaml.parse(content);

                if (config.name) {
                    // Single test scenario
                    const scenarioItem = controller.createTestItem(
                        `${parentItem.id}:scenario:${config.name}`,
                        config.name,
                        uri
                    );
                    scenarioItem.range = this.findScenarioRange(content, config.name);
                    parentItem.children.add(scenarioItem);
                }

                // Check for multiple scenarios
                if (config.scenarios && Array.isArray(config.scenarios)) {
                    config.scenarios.forEach((scenario: any, index: number) => {
                        const scenarioName = scenario.name || `Scenario ${index + 1}`;
                        const scenarioItem = controller.createTestItem(
                            `${parentItem.id}:scenario:${index}`,
                            scenarioName,
                            uri
                        );
                        parentItem.children.add(scenarioItem);
                    });
                }

                // Add step items if steps exist
                if (config.steps && Array.isArray(config.steps)) {
                    config.steps.forEach((step: any, index: number) => {
                        const stepName = this.getStepName(step, index);
                        const stepItem = controller.createTestItem(
                            `${parentItem.id}:step:${index}`,
                            stepName,
                            uri
                        );
                        parentItem.children.add(stepItem);
                    });
                }
            } else if (uri.fsPath.endsWith('.ts')) {
                // Parse TypeScript file for test functions
                const testMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
                let index = 0;

                for (const match of testMatches) {
                    const functionName = match[1] || match[2];
                    if (functionName && (functionName.includes('test') || functionName.includes('Test') || functionName.includes('scenario'))) {
                        const testItem = controller.createTestItem(
                            `${parentItem.id}:function:${functionName}`,
                            functionName,
                            uri
                        );

                        // Find line number
                        const lines = content.substring(0, match.index).split('\n');
                        const lineNumber = lines.length - 1;
                        testItem.range = new vscode.Range(lineNumber, 0, lineNumber, 0);

                        parentItem.children.add(testItem);
                        index++;
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing test file:', error);
        }
    }

    private getStepName(step: any, index: number): string {
        if (step.name) return step.name;
        if (step.request) {
            const method = step.request.method || 'REQUEST';
            const url = step.request.url || '';
            return `${method} ${url}`;
        }
        if (step.web) {
            if (step.web.navigate) return `Navigate to ${step.web.navigate}`;
            if (step.web.click) return `Click ${step.web.click}`;
            return 'Web Step';
        }
        if (step.grpc) return `gRPC: ${step.grpc.service || 'Service'}/${step.grpc.method || 'Method'}`;
        if (step.websocket) return `WebSocket: ${step.websocket.connect || 'Connection'}`;
        return `Step ${index + 1}`;
    }

    private findScenarioRange(content: string, scenarioName: string): vscode.Range | undefined {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(scenarioName)) {
                return new vscode.Range(i, 0, i, lines[i].length);
            }
        }
        return undefined;
    }

    async resolveTestItem(
        controller: vscode.TestController,
        item: vscode.TestItem
    ) {
        // Resolve children if needed
        if (item.uri && !item.children.size) {
            await this.parseTestFile(item.uri, item, controller);
        }
    }

    async runTests(
        controller: vscode.TestController,
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        debug: boolean = false
    ) {
        const run = controller.createTestRun(request);
        const tests = request.include ?? this.gatherAllTests(controller.items);

        for (const test of tests) {
            if (token.isCancellationRequested) {
                run.skipped(test);
                continue;
            }

            await this.runTest(controller, test, run, debug);
        }

        run.end();
    }

    async runTest(
        controller: vscode.TestController,
        test: vscode.TestItem,
        run: vscode.TestRun,
        debug: boolean = false
    ) {
        run.started(test);

        try {
            // Get the test file path
            const testFile = test.uri?.fsPath || this.getParentTestFile(test);

            if (!testFile) {
                throw new Error('Could not determine test file path');
            }

            // Determine the command based on file type
            const command = this.getTestCommand(testFile, debug);

            // Run the test
            const result = await this.executeTest(command, testFile, run, test);

            if (result.success) {
                run.passed(test, result.duration);
            } else {
                const message = new vscode.TestMessage(result.error || 'Test failed');
                if (result.output) {
                    message.message += '\n\nOutput:\n' + result.output;
                }
                run.failed(test, message, result.duration);
            }
        } catch (error) {
            const message = new vscode.TestMessage(
                error instanceof Error ? error.message : 'Unknown error'
            );
            run.failed(test, message);
        }
    }

    private getParentTestFile(test: vscode.TestItem): string | undefined {
        let current: vscode.TestItem | undefined = test;
        while (current) {
            if (current.uri) {
                return current.uri.fsPath;
            }
            current = current.parent;
        }
        return undefined;
    }

    private getTestCommand(testFile: string, debug: boolean = false): string[] {
        const ext = path.extname(testFile);

        // Check if perfornium CLI is available
        const perforniumCli = path.join(
            vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            'node_modules/.bin/perfornium'
        );

        if (fs.existsSync(perforniumCli)) {
            // Use local perfornium CLI
            const args = ['run', testFile];
            if (debug) {
                args.push('--debug');
            }
            return [perforniumCli, ...args];
        }

        // Fallback to npx or direct execution
        if (ext === '.yml' || ext === '.yaml') {
            return ['npx', 'perfornium', 'run', testFile];
        } else if (ext === '.ts') {
            return ['npx', 'tsx', testFile];
        }

        return ['node', testFile];
    }

    private executeTest(
        command: string[],
        testFile: string,
        run: vscode.TestRun,
        test: vscode.TestItem
    ): Promise<{ success: boolean; duration: number; output?: string; error?: string }> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let output = '';
            let errorOutput = '';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath || path.dirname(testFile);

            const childProcess = spawn(command[0], command.slice(1), {
                cwd: workspaceFolder,
                env: { ...process.env }
            });

            childProcess.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                run.appendOutput(text, undefined, test);
            });

            childProcess.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                run.appendOutput(text, undefined, test);
            });

            childProcess.on('close', (code) => {
                const duration = Date.now() - startTime;

                resolve({
                    success: code === 0,
                    duration,
                    output,
                    error: code !== 0 ? errorOutput || `Process exited with code ${code}` : undefined
                });
            });

            childProcess.on('error', (error) => {
                const duration = Date.now() - startTime;
                resolve({
                    success: false,
                    duration,
                    error: error.message
                });
            });
        });
    }

    private gatherAllTests(collection: vscode.TestItemCollection): vscode.TestItem[] {
        const tests: vscode.TestItem[] = [];
        collection.forEach(item => {
            tests.push(item);
            if (item.children.size > 0) {
                tests.push(...this.gatherAllTests(item.children));
            }
        });
        return tests;
    }
}
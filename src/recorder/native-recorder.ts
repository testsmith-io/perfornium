import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as readline from 'readline';
import { logger } from '../utils/logger';

export interface NativeRecorderOptions {
  output?: string;
  format?: 'yaml' | 'typescript' | 'json';
  viewport?: string;
  baseUrl?: string;
  device?: string;
}

interface WaitPoint {
  afterLine: number;
  duration: string;
}

/**
 * Native Playwright Recorder
 *
 * Wraps the actual `playwright codegen` command to get the best selector
 * generation and recording experience, then converts output to Perfornium format.
 */
export async function startNativeRecording(url: string, options: NativeRecorderOptions = {}): Promise<void> {
  const format = options.format || 'yaml';
  const tempFile = path.join(process.cwd(), '.perfornium-recording.ts');
  const waitPointsFile = path.join(process.cwd(), '.perfornium-waitpoints.json');

  // Clean up temp files
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  if (fs.existsSync(waitPointsFile)) fs.unlinkSync(waitPointsFile);

  // Initialize wait points file
  fs.writeFileSync(waitPointsFile, JSON.stringify({ waitPoints: [] }));

  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════════════╗');
  logger.info('║          Native Playwright Recorder with Wait Points         ║');
  logger.info('╠══════════════════════════════════════════════════════════════╣');
  logger.info('║  The Playwright Inspector will open with the browser.        ║');
  logger.info('║                                                              ║');
  logger.info('║  RECORDING:                                                  ║');
  logger.info('║  • Interact with the page - actions are recorded             ║');
  logger.info('║  • Use the Inspector to pick elements and add assertions     ║');
  logger.info('║  • Click "Record" button to pause/resume recording           ║');
  logger.info('║                                                              ║');
  logger.info('║  WAIT POINTS (in this terminal):                             ║');
  logger.info('║  • Press W + Enter to add a wait point at current position   ║');
  logger.info('║  • You\'ll be prompted for duration (e.g., 2s, 500ms)         ║');
  logger.info('║                                                              ║');
  logger.info('║  FINISH:                                                     ║');
  logger.info('║  • Close the browser window when done                        ║');
  logger.info('╚══════════════════════════════════════════════════════════════╝');
  logger.info('');

  // Build playwright codegen arguments
  const args = ['codegen', '--output', tempFile];

  if (options.viewport) {
    const [width, height] = options.viewport.split('x');
    args.push('--viewport-size', `${width},${height}`);
  }

  if (options.device) {
    args.push('--device', options.device);
  }

  args.push(url);

  // Track wait points via terminal input
  const waitPoints: WaitPoint[] = [];
  let lineCount = 0;

  // Set up readline for wait point input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Watch the temp file for changes to track line count
  let fileWatcher: fs.FSWatcher | null = null;
  const updateLineCount = () => {
    try {
      if (fs.existsSync(tempFile)) {
        const content = fs.readFileSync(tempFile, 'utf-8');
        lineCount = content.split('\n').length;
      }
    } catch (e) {
      // File might be being written
    }
  };

  // Normalize duration to ensure it has a unit (default to seconds)
  const normalizeDuration = (input: string): string => {
    const trimmed = input.trim();
    // If it's just a number, add 's' for seconds
    if (/^\d+$/.test(trimmed)) {
      return `${trimmed}s`;
    }
    // If it already has a unit (s, ms, m), return as-is
    if (/^\d+\s*(s|ms|m)$/i.test(trimmed)) {
      return trimmed.replace(/\s+/g, '');
    }
    return trimmed;
  };

  // Prompt for wait points
  const promptForWaitPoint = () => {
    rl.question('\n⏱️  Enter wait duration (e.g., 2s, 500ms, or blank to cancel): ', (duration) => {
      if (duration && duration.trim()) {
        updateLineCount();
        const normalizedDuration = normalizeDuration(duration);
        waitPoints.push({ afterLine: lineCount, duration: normalizedDuration });
        fs.writeFileSync(waitPointsFile, JSON.stringify({ waitPoints }));
        logger.info(`✓ Wait point added: ${normalizedDuration} (after line ${lineCount})`);
      }
      logger.info('\nPress W + Enter to add another wait point...');
    });
  };

  // Listen for 'w' key
  rl.on('line', (input) => {
    if (input.toLowerCase() === 'w') {
      promptForWaitPoint();
    }
  });

  logger.info('Starting Playwright codegen...');
  logger.info('Press W + Enter in this terminal to add wait points.\n');

  // Start playwright codegen
  const codegen = spawn('npx', ['playwright', ...args], {
    stdio: ['inherit', 'inherit', 'inherit'],
    shell: true
  });

  // Start watching the file after a short delay
  setTimeout(() => {
    if (fs.existsSync(tempFile)) {
      fileWatcher = fs.watch(tempFile, () => updateLineCount());
    }
    // Also poll periodically in case watch doesn't work
    const pollInterval = setInterval(updateLineCount, 1000);
    codegen.on('exit', () => clearInterval(pollInterval));
  }, 2000);

  // Wait for codegen to finish
  await new Promise<void>((resolve, reject) => {
    codegen.on('exit', (code) => {
      rl.close();
      if (fileWatcher) fileWatcher.close();

      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Playwright codegen exited with code ${code}`));
      }
    });

    codegen.on('error', (err) => {
      rl.close();
      if (fileWatcher) fileWatcher.close();
      reject(err);
    });
  });

  // Check if recording was created
  if (!fs.existsSync(tempFile)) {
    logger.warn('No recording was saved. Browser may have been closed without recording.');
    return;
  }

  // Read the generated Playwright code
  const playwrightCode = fs.readFileSync(tempFile, 'utf-8');

  // Load wait points
  let savedWaitPoints: WaitPoint[] = [];
  if (fs.existsSync(waitPointsFile)) {
    try {
      savedWaitPoints = JSON.parse(fs.readFileSync(waitPointsFile, 'utf-8')).waitPoints;
    } catch (e) {
      // Ignore
    }
  }

  // Convert to Perfornium format
  const outputFile = options.output || getDefaultOutputFile(format);
  const outputPath = path.resolve(outputFile);

  logger.info(`\nConverting recording to ${format.toUpperCase()} format...`);

  const converter = new PlaywrightToPerfornium(playwrightCode, savedWaitPoints, url, options.baseUrl);

  switch (format) {
    case 'typescript':
      fs.writeFileSync(outputPath, converter.toTypeScript());
      break;
    case 'json':
      fs.writeFileSync(outputPath, converter.toJSON());
      break;
    default:
      fs.writeFileSync(outputPath, converter.toYAML());
  }

  // Clean up temp files
  fs.unlinkSync(tempFile);
  if (fs.existsSync(waitPointsFile)) fs.unlinkSync(waitPointsFile);

  logger.info(`✓ Recording saved to: ${outputPath}`);
  logger.info(`  Actions recorded: ${converter.getActionCount()}`);
  logger.info(`  Wait points: ${savedWaitPoints.length}`);
}

function getDefaultOutputFile(format: string): string {
  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  const baseName = `recording_${timestamp}`;

  // Ensure tests/web directory exists
  const outputDir = path.join(process.cwd(), 'tests', 'web');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  switch (format) {
    case 'typescript': return path.join(outputDir, `${baseName}.spec.ts`);
    case 'json': return path.join(outputDir, `${baseName}.json`);
    default: return path.join(outputDir, `${baseName}.yml`);
  }
}

/**
 * Converts Playwright codegen output to Perfornium formats
 */
class PlaywrightToPerfornium {
  private actions: ParsedAction[] = [];
  private waitPoints: WaitPoint[];
  private baseUrl: string;

  constructor(playwrightCode: string, waitPoints: WaitPoint[], startUrl: string, baseUrl?: string) {
    this.waitPoints = waitPoints;
    this.baseUrl = baseUrl || new URL(startUrl).origin;
    this.parsePlaywrightCode(playwrightCode);
  }

  private parsePlaywrightCode(code: string): void {
    const lines = code.split('\n');
    let lineNum = 0;

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      // Skip non-action lines
      if (!trimmed.startsWith('await page.') && !trimmed.startsWith('await expect(')) {
        continue;
      }

      const action = this.parseLine(trimmed, lineNum);
      if (action) {
        // Check if there's a wait point after this line
        const waitPoint = this.waitPoints.find(wp => wp.afterLine === lineNum || wp.afterLine === lineNum + 1);
        if (waitPoint) {
          action.waitAfter = waitPoint.duration;
        }
        this.actions.push(action);
      }
    }
  }

  private parseLine(line: string, lineNum: number): ParsedAction | null {
    // page.goto('url')
    let match = line.match(/await page\.goto\(['"](.+?)['"]\)/);
    if (match) {
      return { type: 'goto', url: this.relativizeUrl(match[1]), line: lineNum };
    }

    // page.getByRole('button', { name: 'Submit' }).click()
    match = line.match(/await page\.(getBy\w+)\((.+?)\)\.(\w+)\((.*?)\)/);
    if (match) {
      const [, locatorMethod, locatorArgs, action, actionArgs] = match;
      const selector = this.buildSelector(locatorMethod, locatorArgs);
      return this.buildAction(action, selector, actionArgs, lineNum);
    }

    // page.locator('selector').click()
    match = line.match(/await page\.locator\(['"](.+?)['"]\)\.(\w+)\((.*?)\)/);
    if (match) {
      const [, selector, action, actionArgs] = match;
      return this.buildAction(action, selector, actionArgs, lineNum);
    }

    // expect(page.getBy...).toBeVisible() etc
    match = line.match(/await expect\(page\.(getBy\w+)\((.+?)\)\)\.(to\w+)\((.*?)\)/);
    if (match) {
      const [, locatorMethod, locatorArgs, assertion, assertionArgs] = match;
      const selector = this.buildSelector(locatorMethod, locatorArgs);
      return this.buildAssertion(assertion, selector, assertionArgs, lineNum);
    }

    // expect(page.locator('selector')).toBeVisible()
    match = line.match(/await expect\(page\.locator\(['"](.+?)['"]\)\)\.(to\w+)\((.*?)\)/);
    if (match) {
      const [, selector, assertion, assertionArgs] = match;
      return this.buildAssertion(assertion, selector, assertionArgs, lineNum);
    }

    return null;
  }

  private buildSelector(method: string, args: string): string {
    // Keep Playwright's native selector format - it's more readable
    const cleanArgs = args.replace(/['"]/g, '').trim();

    switch (method) {
      case 'getByRole':
        return `role=${cleanArgs}`;
      case 'getByText':
        return `text=${cleanArgs}`;
      case 'getByLabel':
        return `label=${cleanArgs}`;
      case 'getByPlaceholder':
        return `placeholder=${cleanArgs}`;
      case 'getByTestId':
        return `data-testid=${cleanArgs}`;
      case 'getByAltText':
        return `alt=${cleanArgs}`;
      case 'getByTitle':
        return `title=${cleanArgs}`;
      default:
        return cleanArgs;
    }
  }

  private buildAction(action: string, selector: string, args: string, lineNum: number): ParsedAction | null {
    const cleanArgs = args.replace(/^['"]|['"]$/g, '').trim();

    switch (action) {
      case 'click':
        return { type: 'click', selector, line: lineNum };
      case 'fill':
        return { type: 'fill', selector, value: cleanArgs, line: lineNum };
      case 'press':
        return { type: 'press', selector, key: cleanArgs, line: lineNum };
      case 'check':
        return { type: 'check', selector, line: lineNum };
      case 'uncheck':
        return { type: 'uncheck', selector, line: lineNum };
      case 'selectOption':
        return { type: 'select', selector, value: cleanArgs, line: lineNum };
      case 'hover':
        return { type: 'hover', selector, line: lineNum };
      case 'dblclick':
        return { type: 'dblclick', selector, line: lineNum };
      default:
        return null;
    }
  }

  private buildAssertion(assertion: string, selector: string, args: string, lineNum: number): ParsedAction | null {
    const cleanArgs = args.replace(/^['"]|['"]$/g, '').trim();

    switch (assertion) {
      case 'toBeVisible':
        return { type: 'verify_visible', selector, line: lineNum };
      case 'toBeHidden':
        return { type: 'verify_hidden', selector, line: lineNum };
      case 'toHaveText':
        return { type: 'verify_text', selector, value: cleanArgs, line: lineNum };
      case 'toContainText':
        return { type: 'verify_contains', selector, value: cleanArgs, line: lineNum };
      case 'toBeEnabled':
        return { type: 'verify_enabled', selector, line: lineNum };
      case 'toBeDisabled':
        return { type: 'verify_disabled', selector, line: lineNum };
      default:
        return null;
    }
  }

  private relativizeUrl(url: string): string {
    if (url.startsWith(this.baseUrl)) {
      return url.substring(this.baseUrl.length) || '/';
    }
    return url;
  }

  getActionCount(): number {
    return this.actions.length;
  }

  toYAML(): string {
    const steps = this.actions.map((action, idx) => {
      const step: any = {
        name: `${action.type}_${idx + 1}`,
        type: 'web',
        action: this.actionToYamlAction(action)
      };

      if (action.waitAfter) {
        step.wait = action.waitAfter;
      }

      return step;
    });

    const scenario = {
      name: 'Recorded Web Scenario',
      description: `Recorded on ${new Date().toISOString()} using Playwright codegen`,
      global: {
        base_url: this.baseUrl,
        browser: { type: 'chromium', headless: false },
        think_time: '1-3'
      },
      load: {
        pattern: 'basic',
        virtual_users: 1,
        ramp_up: '30s'
      },
      scenarios: [{
        name: 'recorded_user_journey',
        weight: 100,
        loop: 1,
        steps
      }],
      outputs: [{ type: 'json', file: 'results/recorded-results.json' }],
      report: { generate: true, output: 'reports/recorded-report.html' }
    };

    return yaml.stringify(scenario, { indent: 2, lineWidth: 120 });
  }

  private actionToYamlAction(action: ParsedAction): any {
    const result: any = { command: action.type };

    if (action.selector) result.selector = action.selector;
    if (action.url) result.url = action.url;
    if (action.value) result.value = action.value;
    if (action.key) result.key = action.key;

    return result;
  }

  toTypeScript(): string {
    const steps = this.actions.map(action => {
      let step = this.actionToTypeScriptStep(action);
      if (action.waitAfter) {
        step += `\n    .wait('${action.waitAfter}')`;
      }
      return step;
    }).join('\n');

    return `import { test, faker } from 'perfornium2';

/**
 * Recorded Web Scenario
 * Generated: ${new Date().toISOString()}
 * Recorder: Playwright codegen
 * Base URL: ${this.baseUrl}
 */

const testConfig = test('Recorded Web Scenario')
  .baseUrl('${this.baseUrl}')
  .withBrowser('chromium', {
    headless: process.env.HEADLESS !== 'false',
    viewport: { width: 1920, height: 1080 }
  })
  .timeout(30000)
  .scenario('Recorded User Journey', 100)
${steps}
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 1,
    ramp_up: '30s',
    duration: '5m'
  })
  .withJSONOutput('results/test-results.json')
  .withReport('reports/test-report.html')
  .build();

export default testConfig;
`;
  }

  private actionToTypeScriptStep(action: ParsedAction): string {
    const sel = (s: string) => s.replace(/'/g, "\\'");

    switch (action.type) {
      case 'goto':
        return `    .goto('${sel(action.url || '/')}')`;
      case 'click':
        return `    .click('${sel(action.selector || '')}')`;
      case 'fill':
        return `    .fill('${sel(action.selector || '')}', '${sel(action.value || '')}')`;
      case 'press':
        return `    .press('${sel(action.selector || '')}', '${action.key || ''}')`;
      case 'check':
        return `    .check('${sel(action.selector || '')}')`;
      case 'uncheck':
        return `    .uncheck('${sel(action.selector || '')}')`;
      case 'select':
        return `    .select('${sel(action.selector || '')}', '${sel(action.value || '')}')`;
      case 'hover':
        return `    .hover('${sel(action.selector || '')}')`;
      case 'dblclick':
        return `    .dblclick('${sel(action.selector || '')}')`;
      case 'verify_visible':
        return `    .expectVisible('${sel(action.selector || '')}')`;
      case 'verify_hidden':
        return `    .expectHidden('${sel(action.selector || '')}')`;
      case 'verify_text':
        return `    .expectText('${sel(action.selector || '')}', '${sel(action.value || '')}')`;
      case 'verify_contains':
        return `    .expectContains('${sel(action.selector || '')}', '${sel(action.value || '')}')`;
      default:
        return `    // Unknown action: ${action.type}`;
    }
  }

  toJSON(): string {
    return JSON.stringify({
      metadata: {
        recorded: new Date().toISOString(),
        baseUrl: this.baseUrl,
        recorder: 'playwright-codegen'
      },
      actions: this.actions
    }, null, 2);
  }
}

interface ParsedAction {
  type: string;
  selector?: string;
  url?: string;
  value?: string;
  key?: string;
  line: number;
  waitAfter?: string;
}

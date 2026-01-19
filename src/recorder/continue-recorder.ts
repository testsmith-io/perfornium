import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as readline from 'readline';
import { chromium, firefox, webkit, Browser, Page } from 'playwright';
import { logger } from '../utils/logger';

export interface ContinueRecorderOptions {
  format?: 'yaml' | 'typescript' | 'json';
  browser?: 'chromium' | 'chrome' | 'msedge' | 'firefox' | 'webkit';
}

interface ParsedScenario {
  name: string;
  baseUrl: string;
  browser: {
    type: 'chromium' | 'chrome' | 'msedge' | 'firefox' | 'webkit';
    headless: boolean;
  };
  steps: ParsedStep[];
  rawConfig: any;
}

interface ParsedStep {
  name: string;
  type: string;
  action?: {
    command: string;
    selector?: string;
    url?: string;
    value?: string;
    key?: string;
  };
  wait?: string;
}

interface RecordedAction {
  type: string;
  selector?: string;
  url?: string;
  value?: string;
  key?: string;
  timestamp: number;
  waitAfter?: string;
}

/**
 * Continue Recorder
 *
 * Executes existing steps from a scenario file in a visible browser,
 * then injects a recording script to capture additional user interactions.
 */
export async function startContinueRecording(
  scenarioFile: string,
  options: ContinueRecorderOptions = {}
): Promise<void> {
  // Verify file exists
  if (!fs.existsSync(scenarioFile)) {
    throw new Error(`Scenario file not found: ${scenarioFile}`);
  }

  // Parse the scenario file
  const scenario = parseScenarioFile(scenarioFile);
  logger.info(`Loaded scenario: ${scenario.name}`);
  logger.info(`Found ${scenario.steps.length} existing steps`);

  // Display instructions
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════════════╗');
  logger.info('║            Continue Recording from Last Step                 ║');
  logger.info('╠══════════════════════════════════════════════════════════════╣');
  logger.info('║  Phase 1: Executing existing steps in visible browser        ║');
  logger.info('║  Phase 2: Recording new interactions                         ║');
  logger.info('║                                                              ║');
  logger.info('║  IN THE BROWSER:                                             ║');
  logger.info('║  • Left-click  - Records clicks and inputs automatically    ║');
  logger.info('║  • Right-click - Opens assertion menu (verify visible/text)  ║');
  logger.info('║                                                              ║');
  logger.info('║  IN THIS TERMINAL:                                           ║');
  logger.info('║  • Press W + Enter to add a wait point after last action     ║');
  logger.info('║  • Press Q + Enter to finish and save                        ║');
  logger.info('║                                                              ║');
  logger.info('║  NOTE: Closing the browser also saves the recording          ║');
  logger.info('╚══════════════════════════════════════════════════════════════╝');
  logger.info('');

  // Launch browser (visible, not headless)
  const browserType = options.browser || scenario.browser.type || 'chromium';
  logger.info('Phase 1: Executing existing steps...');

  const browser = await launchBrowser(browserType, false); // visible browser
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  try {
    // Execute existing steps
    await executeSteps(page, scenario.steps, scenario.baseUrl);
    logger.info(`✓ Executed ${scenario.steps.length} steps successfully`);
    logger.info('');

    // Phase 2: Start recording
    logger.info('Phase 2: Recording mode active');
    logger.info('Interact with the browser. Press Q + Enter when done.\n');

    const newActions = await recordInteractions(page, scenario.baseUrl);

    if (newActions.length > 0) {
      // Append new steps to the scenario file
      appendStepsToFile(scenarioFile, newActions, scenario);
      logger.info(`\n✓ Added ${newActions.length} new steps to: ${scenarioFile}`);
      logger.info(`  Total steps now: ${scenario.steps.length + newActions.length}`);
    } else {
      logger.info('\nNo new actions recorded.');
    }

  } finally {
    await browser.close();
  }
}

function parseScenarioFile(filePath: string): ParsedScenario {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  let config: any;
  if (ext === '.json') {
    config = JSON.parse(content);
  } else if (ext === '.yml' || ext === '.yaml') {
    config = yaml.parse(content);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .yml, .yaml, or .json`);
  }

  const baseUrl = config.global?.base_url || '';
  const browserConfig = config.global?.browser || {};
  const scenarios = config.scenarios || [];

  if (scenarios.length === 0) {
    throw new Error('No scenarios found in configuration file');
  }

  const firstScenario = scenarios[0];
  const steps: ParsedStep[] = (firstScenario.steps || []).map((step: any) => ({
    name: step.name,
    type: step.type,
    action: step.action,
    wait: step.wait
  }));

  return {
    name: config.name || firstScenario.name || 'Recorded Scenario',
    baseUrl,
    browser: {
      type: browserConfig.type || 'chromium',
      headless: browserConfig.headless !== undefined ? browserConfig.headless : true
    },
    steps,
    rawConfig: config
  };
}

async function launchBrowser(
  browserType: 'chromium' | 'chrome' | 'msedge' | 'firefox' | 'webkit',
  headless: boolean
): Promise<Browser> {
  const launchOptions: any = {
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  };

  switch (browserType) {
    case 'chromium':
      return chromium.launch(launchOptions);
    case 'chrome':
      return chromium.launch({ ...launchOptions, channel: 'chrome' });
    case 'msedge':
      return chromium.launch({ ...launchOptions, channel: 'msedge' });
    case 'firefox':
      return firefox.launch(launchOptions);
    case 'webkit':
      return webkit.launch(launchOptions);
    default:
      return chromium.launch(launchOptions);
  }
}

async function executeSteps(page: Page, steps: ParsedStep[], baseUrl: string): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    logger.info(`  [${i + 1}/${steps.length}] ${step.name || step.action?.command || 'unknown'}`);

    if (step.type !== 'web' || !step.action) {
      logger.warn(`    Skipping non-web step: ${step.type}`);
      continue;
    }

    const action = step.action;

    try {
      switch (action.command) {
        case 'goto': {
          const url = action.url?.startsWith('http') ? action.url : `${baseUrl}${action.url}`;
          await page.goto(url, { waitUntil: 'load' });
          break;
        }

        case 'click':
          await page.click(convertSelector(action.selector || ''));
          break;

        case 'fill':
          await page.fill(convertSelector(action.selector || ''), action.value || '');
          break;

        case 'press':
          await page.press(convertSelector(action.selector || ''), action.key || '');
          break;

        case 'select':
          await page.selectOption(convertSelector(action.selector || ''), action.value || '');
          break;

        case 'hover':
          await page.hover(convertSelector(action.selector || ''));
          break;

        case 'dblclick':
          await page.dblclick(convertSelector(action.selector || ''));
          break;

        case 'check':
          await page.check(convertSelector(action.selector || ''));
          break;

        case 'uncheck':
          await page.uncheck(convertSelector(action.selector || ''));
          break;

        case 'verify_visible':
          await page.waitForSelector(convertSelector(action.selector || ''), { state: 'visible' });
          break;

        case 'verify_text': {
          const element = await page.waitForSelector(convertSelector(action.selector || ''));
          if (element && action.value) {
            const text = await element.textContent();
            if (text?.trim() !== action.value) {
              logger.warn(`    Text mismatch: expected "${action.value}", got "${text?.trim()}"`);
            }
          }
          break;
        }

        case 'verify_contains': {
          const el = await page.waitForSelector(convertSelector(action.selector || ''));
          if (el && action.value) {
            const text = await el.textContent();
            if (!text?.includes(action.value)) {
              logger.warn(`    Text does not contain "${action.value}"`);
            }
          }
          break;
        }

        case 'verify_value': {
          const inputEl = await page.waitForSelector(convertSelector(action.selector || ''));
          if (inputEl && action.value) {
            const value = await inputEl.inputValue();
            if (value !== action.value) {
              logger.warn(`    Value mismatch: expected "${action.value}", got "${value}"`);
            }
          }
          break;
        }

        case 'wait_for_load_state':
          await page.waitForLoadState('load');
          break;

        case 'network_idle':
          // Try networkidle with shorter timeout, fall back to load
          try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
          } catch {
            await page.waitForLoadState('load');
          }
          break;

        case 'dom_ready':
          await page.waitForLoadState('domcontentloaded');
          break;

        default:
          logger.warn(`    Unknown command: ${action.command}`);
      }

      // Handle wait if specified
      if (step.wait) {
        const waitMs = parseWaitDuration(step.wait);
        await page.waitForTimeout(waitMs);
      }

    } catch (error: any) {
      logger.error(`    Failed to execute step: ${error.message}`);
      throw error;
    }
  }
}

function convertSelector(selector: string): string {
  if (selector.startsWith('role=')) {
    return selector;
  }
  if (selector.startsWith('text=')) {
    return selector;
  }
  if (selector.startsWith('placeholder=')) {
    return `[placeholder="${selector.substring(12)}"]`;
  }
  return selector;
}

function parseWaitDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m)?$/);
  if (!match) return 1000;

  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60000;
    default: return value * 1000;
  }
}

/**
 * Recording script to inject into the page.
 * Captures user interactions and generates selectors.
 * Right-click context menu for assertions.
 */
const RECORDING_SCRIPT = `
(function() {
  // Prevent double injection
  if (window.__perforniumRecorderActive) return;
  window.__perforniumRecorderActive = true;

  // Recording indicator
  const indicator = document.createElement('div');
  indicator.id = '__perfornium-recording-indicator';
  indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.9);color:white;padding:10px 16px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;z-index:999999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  indicator.innerHTML = '<span style="display:inline-block;width:12px;height:12px;background:#ef4444;border-radius:50%;animation:pulse 1s infinite;"></span><span>Recording</span>';

  const style = document.createElement('style');
  style.textContent = \`
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    .__perfornium-highlight{outline:2px solid #22c55e !important;outline-offset:2px;}
    .__perfornium-hover{outline:2px dashed #00d4ff !important;outline-offset:2px;}
    #__perfornium-context-menu {
      position: fixed;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 4px 0;
      min-width: 180px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      font-family: system-ui, sans-serif;
      font-size: 13px;
      z-index: 1000000;
      display: none;
    }
    #__perfornium-context-menu.visible { display: block; }
    .__perfornium-menu-item {
      padding: 8px 12px;
      color: #e2e8f0;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .__perfornium-menu-item:hover { background: rgba(0,212,255,0.15); }
    .__perfornium-menu-item svg { width: 16px; height: 16px; opacity: 0.7; }
    .__perfornium-menu-separator {
      height: 1px;
      background: rgba(255,255,255,0.1);
      margin: 4px 0;
    }
    .__perfornium-menu-header {
      padding: 6px 12px;
      color: #9ca3af;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  \`;
  document.head.appendChild(style);
  document.body.appendChild(indicator);

  // Context menu element
  const contextMenu = document.createElement('div');
  contextMenu.id = '__perfornium-context-menu';
  contextMenu.innerHTML = \`
    <div class="__perfornium-menu-header">Assertions</div>
    <div class="__perfornium-menu-item" data-action="verify_visible">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      Verify Visible
    </div>
    <div class="__perfornium-menu-item" data-action="verify_contains">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
      Verify Contains
    </div>
    <div class="__perfornium-menu-item" data-action="verify_value">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>
      Verify Value
    </div>
    <div class="__perfornium-menu-separator"></div>
    <div class="__perfornium-menu-item" data-action="cancel" style="color:#9ca3af;">
      Cancel
    </div>
  \`;
  document.body.appendChild(contextMenu);

  // Action queue
  window.__perforniumActions = [];
  let lastFillSelector = null;
  let lastFillTimeout = null;
  let contextMenuTarget = null;

  // Helper to check if selector is unique
  function isUnique(selector) {
    try {
      // Handle Playwright-specific selectors
      if (selector.startsWith('role=') || selector.startsWith('text=')) {
        return true; // Can't easily validate these, assume they work
      }
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  // Build a unique CSS path for any element
  function buildCssPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id && !/^[0-9]|[-_][0-9a-f]{8,}|\\d{5,}/.test(current.id)) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break; // ID is unique, stop here
      } else {
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + index + ')';
          }
        }
        path.unshift(selector);
      }
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // Generate best selector for an element
  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return null;

    // Priority 1: data-testid (always unique by convention)
    if (el.dataset.testid) {
      const sel = '[data-testid="' + el.dataset.testid + '"]';
      if (isUnique(sel)) return sel;
    }
    if (el.getAttribute('data-test-id')) {
      const sel = '[data-test-id="' + el.getAttribute('data-test-id') + '"]';
      if (isUnique(sel)) return sel;
    }
    if (el.getAttribute('data-cy')) {
      const sel = '[data-cy="' + el.getAttribute('data-cy') + '"]';
      if (isUnique(sel)) return sel;
    }

    // Priority 2: id (if not dynamic-looking and unique)
    if (el.id && !/^[0-9]|[-_][0-9a-f]{8,}|\\d{5,}/.test(el.id)) {
      const sel = '#' + CSS.escape(el.id);
      if (isUnique(sel)) return sel;
    }

    // Priority 3: role + accessible name (check uniqueness)
    const role = el.getAttribute('role') || getImplicitRole(el);
    const name = el.getAttribute('aria-label') ||
                 el.getAttribute('title') ||
                 el.placeholder;
    if (role && name) {
      const sel = 'role=' + role + '[name="' + name.replace(/"/g, '\\\\"') + '"]';
      return sel; // Playwright selector, assume it works
    }

    // Priority 4: input by name or placeholder (check uniqueness)
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      if (el.name && !/^[0-9]/.test(el.name)) {
        const sel = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
        if (isUnique(sel)) return sel;
      }
      if (el.placeholder) {
        const sel = '[placeholder="' + el.placeholder + '"]';
        if (isUnique(sel)) return sel;
      }
    }

    // Priority 5: button/link by text (only short, unique text)
    if (el.tagName === 'BUTTON' || el.tagName === 'A') {
      const text = el.innerText?.trim();
      if (text && text.length <= 40 && text.length >= 1) {
        const sel = 'text=' + text;
        return sel; // Playwright selector
      }
    }

    // Priority 6: unique class combination
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\\s+/).filter(c =>
        c && !/^[0-9]|active|selected|hover|focus|disabled|hidden|visible/.test(c)
      ).slice(0, 3);
      if (classes.length > 0) {
        const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
        if (isUnique(sel)) return sel;
      }
    }

    // Priority 7: Unique attribute selectors
    for (const attr of ['name', 'type', 'value', 'href', 'src', 'alt']) {
      const val = el.getAttribute(attr);
      if (val && val.length < 50) {
        const sel = el.tagName.toLowerCase() + '[' + attr + '="' + val.replace(/"/g, '\\\\"') + '"]';
        if (isUnique(sel)) return sel;
      }
    }

    // Fallback: build full CSS path (always unique)
    return buildCssPath(el);
  }

  function getImplicitRole(el) {
    const tag = el.tagName.toLowerCase();
    const type = el.type?.toLowerCase();
    const roles = {
      'button': 'button',
      'a': 'link',
      'input[type=submit]': 'button',
      'input[type=button]': 'button',
      'input[type=checkbox]': 'checkbox',
      'input[type=radio]': 'radio',
      'input[type=text]': 'textbox',
      'input[type=email]': 'textbox',
      'input[type=password]': 'textbox',
      'input[type=search]': 'searchbox',
      'textarea': 'textbox',
      'select': 'combobox',
      'img': 'img',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'form': 'form'
    };
    if (type) {
      return roles[tag + '[type=' + type + ']'] || roles[tag];
    }
    return roles[tag];
  }

  function recordAction(action) {
    action.timestamp = Date.now();
    window.__perforniumActions.push(action);

    // Notify Node.js
    if (window.__perforniumNotify) {
      window.__perforniumNotify(JSON.stringify(action));
    }
  }

  function hideContextMenu() {
    contextMenu.classList.remove('visible');
    if (contextMenuTarget) {
      contextMenuTarget.classList.remove('__perfornium-hover');
      contextMenuTarget = null;
    }
  }

  function showContextMenu(x, y, target) {
    contextMenuTarget = target;
    target.classList.add('__perfornium-hover');

    // Position menu, ensuring it stays within viewport
    const menuRect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    // Show temporarily to measure
    contextMenu.style.left = '0px';
    contextMenu.style.top = '0px';
    contextMenu.classList.add('visible');

    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;

    if (x + menuWidth > viewportWidth) {
      posX = viewportWidth - menuWidth - 10;
    }
    if (y + menuHeight > viewportHeight) {
      posY = viewportHeight - menuHeight - 10;
    }

    contextMenu.style.left = posX + 'px';
    contextMenu.style.top = posY + 'px';
  }

  // Handle context menu (right-click)
  document.addEventListener('contextmenu', function(e) {
    const el = e.target;

    // Ignore right-clicks on our UI elements
    if (el.closest('#__perfornium-recording-indicator') || el.closest('#__perfornium-context-menu')) {
      return;
    }

    const selector = getSelector(el);
    if (!selector) return;

    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, el);
  }, true);

  // Handle context menu item clicks
  contextMenu.addEventListener('click', function(e) {
    const item = e.target.closest('.__perfornium-menu-item');
    if (!item || !contextMenuTarget) return;

    const action = item.dataset.action;
    const selector = getSelector(contextMenuTarget);

    if (action === 'cancel' || !selector) {
      hideContextMenu();
      return;
    }

    if (action === 'verify_visible') {
      recordAction({ type: 'verify_visible', selector: selector });
      contextMenuTarget.classList.add('__perfornium-highlight');
      setTimeout(() => contextMenuTarget?.classList.remove('__perfornium-highlight'), 500);
    } else if (action === 'verify_contains') {
      const text = contextMenuTarget.innerText?.trim().substring(0, 100) || '';
      recordAction({ type: 'verify_contains', selector: selector, value: text });
      contextMenuTarget.classList.add('__perfornium-highlight');
      setTimeout(() => contextMenuTarget?.classList.remove('__perfornium-highlight'), 500);
    } else if (action === 'verify_value') {
      const tag = contextMenuTarget.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        const value = contextMenuTarget.value || '';
        recordAction({ type: 'verify_value', selector: selector, value: value });
        contextMenuTarget.classList.add('__perfornium-highlight');
        setTimeout(() => contextMenuTarget?.classList.remove('__perfornium-highlight'), 500);
      } else {
        alert('Verify Value is only available for input, textarea, and select elements.');
      }
    }

    hideContextMenu();
  });

  // Hide context menu on click elsewhere or Escape
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#__perfornium-context-menu')) {
      hideContextMenu();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });

  // Hide context menu on scroll
  document.addEventListener('scroll', hideContextMenu, true);

  // Capture left clicks for recording
  document.addEventListener('click', function(e) {
    const el = e.target;

    // Ignore clicks on recording indicator or context menu
    if (el.closest('#__perfornium-recording-indicator') || el.closest('#__perfornium-context-menu')) return;

    const selector = getSelector(el);
    if (!selector) return;

    // Record a click
    recordAction({ type: 'click', selector: selector });
  }, true);

  // Capture form inputs (debounced)
  document.addEventListener('input', function(e) {
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    if (el.type === 'submit' || el.type === 'button') return;

    const selector = getSelector(el);
    if (!selector) return;

    // Debounce: only record final value after user stops typing
    if (lastFillTimeout) clearTimeout(lastFillTimeout);

    lastFillSelector = selector;
    lastFillTimeout = setTimeout(function() {
      recordAction({ type: 'fill', selector: selector, value: el.value });
      lastFillSelector = null;
    }, 500);
  }, true);

  // Capture select changes
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (el.tagName !== 'SELECT') return;

    const selector = getSelector(el);
    if (selector) {
      recordAction({ type: 'select', selector: selector, value: el.value });
    }
  }, true);

  // Capture checkbox/radio changes
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    if (el.type !== 'checkbox' && el.type !== 'radio') return;

    const selector = getSelector(el);
    if (selector) {
      recordAction({ type: el.checked ? 'check' : 'uncheck', selector: selector });
    }
  }, true);

  // Capture key presses (Enter, Tab, Escape)
  document.addEventListener('keydown', function(e) {
    if (!['Enter', 'Tab', 'Escape'].includes(e.key)) return;
    if (e.key === 'Escape' && contextMenu.classList.contains('visible')) return; // Don't record Escape when closing menu

    const el = e.target;
    const selector = getSelector(el);
    if (selector) {
      recordAction({ type: 'press', selector: selector, key: e.key });
    }
  }, true);

  console.log('[Perfornium] Recording active - interact with the page, right-click for assertions');
})();
`;

async function recordInteractions(page: Page, baseUrl: string): Promise<RecordedAction[]> {
  const recordedActions: RecordedAction[] = [];
  let isRecording = true;
  const waitPoints: { afterIndex: number; duration: string }[] = [];

  // Expose function for the injected script to notify us
  await page.exposeFunction('__perforniumNotify', (actionJson: string) => {
    try {
      const action = JSON.parse(actionJson);

      // Debounce fill actions
      if (action.type === 'fill') {
        const lastAction = recordedActions[recordedActions.length - 1];
        if (lastAction?.type === 'fill' && lastAction.selector === action.selector) {
          lastAction.value = action.value;
          lastAction.timestamp = action.timestamp;
          logger.info(`  Updated: fill "${action.selector}" = "${action.value?.substring(0, 20)}..."`);
          return;
        }
      }

      recordedActions.push(action);

      // Log the action
      let logMsg = `  Recorded: ${action.type}`;
      if (action.selector) logMsg += ` "${action.selector}"`;
      if (action.value) logMsg += ` = "${action.value.substring(0, 30)}${action.value.length > 30 ? '...' : ''}"`;
      if (action.key) logMsg += ` [${action.key}]`;
      logger.info(logMsg);
    } catch {
      // Ignore parse errors
    }
  });

  // Inject the recording script
  await page.addInitScript(RECORDING_SCRIPT);
  await page.evaluate(RECORDING_SCRIPT);

  // Track navigation
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && isRecording) {
      const url = frame.url();
      const relativeUrl = url.startsWith(baseUrl) ? url.substring(baseUrl.length) || '/' : url;

      // Don't record if it's the same as last action
      const lastAction = recordedActions[recordedActions.length - 1];
      if (lastAction?.type === 'goto' && lastAction.url === relativeUrl) return;

      recordedActions.push({
        type: 'goto',
        url: relativeUrl,
        timestamp: Date.now()
      });
      logger.info(`  Recorded: goto "${relativeUrl}"`);
    }
  });

  // Set up readline for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const normalizeDuration = (input: string): string => {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return `${trimmed}s`;
    if (/^\d+\s*(s|ms|m)$/i.test(trimmed)) return trimmed.replace(/\s+/g, '');
    return trimmed;
  };

  return new Promise((resolve) => {
    const cleanup = () => {
      isRecording = false;
      rl.close();

      // Apply wait points
      waitPoints.forEach(wp => {
        if (recordedActions[wp.afterIndex]) {
          recordedActions[wp.afterIndex].waitAfter = wp.duration;
        }
      });

      resolve(recordedActions);
    };

    const promptInput = () => {
      rl.question('', async (input) => {
        const cmd = input.toLowerCase().trim();

        if (cmd === 'q' || cmd === 'quit' || cmd === 'exit' || cmd === 'done') {
          cleanup();
          return;
        }

        if (cmd === 'w' || cmd === 'wait') {
          rl.question('Enter wait duration (e.g., 2s, 500ms): ', (duration) => {
            if (duration.trim()) {
              const normalizedDuration = normalizeDuration(duration);
              waitPoints.push({ afterIndex: recordedActions.length - 1, duration: normalizedDuration });
              logger.info(`  ✓ Wait point added: ${normalizedDuration}`);
            }
            if (isRecording) promptInput();
          });
          return;
        }

        if (isRecording) promptInput();
      });
    };

    promptInput();

    // Handle browser close
    page.on('close', () => {
      if (isRecording) {
        logger.info('\nBrowser closed - saving recording...');
        cleanup();
      }
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      if (isRecording) {
        logger.info('\nInterrupted - saving recording...');
        cleanup();
      }
    });
  });
}

function appendStepsToFile(
  filePath: string,
  newActions: RecordedAction[],
  scenario: ParsedScenario
): void {
  const ext = path.extname(filePath).toLowerCase();

  // Convert actions to steps
  const newSteps = newActions.map((action, idx) => {
    const step: any = {
      name: `${action.type}_${scenario.steps.length + idx + 1}`,
      type: 'web',
      action: {
        command: action.type,
        ...(action.selector && { selector: action.selector }),
        ...(action.url && { url: action.url }),
        ...(action.value && { value: action.value }),
        ...(action.key && { key: action.key })
      }
    };
    if (action.waitAfter) {
      step.wait = action.waitAfter;
    }
    return step;
  });

  // Update the config
  const config = scenario.rawConfig;
  if (config.scenarios && config.scenarios[0]) {
    config.scenarios[0].steps = [...(config.scenarios[0].steps || []), ...newSteps];
  }

  // Write back to file
  if (ext === '.json') {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  } else {
    fs.writeFileSync(filePath, yaml.stringify(config, { indent: 2, lineWidth: 120 }));
  }
}

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { logger } from '../../utils/logger';

interface RecordOptions {
  output?: string;
  viewport?: string;
  baseUrl?: string;
}

interface Action {
  name: string;
  type: 'web';
  action: {
    command: string;
    selector?: string;
    url?: string;
    value?: string;
    key?: string;
    expected_text?: string;
    name?: string;
  };
  think_time?: string;
  timestamp: number;
}

export async function recordCommand(url: string, options: RecordOptions = {}): Promise<void> {
  const recorder = new WebRecorder({
    output_file: options.output || 'recorded-scenario.yml',
    base_url: options.baseUrl
  });

  try {
    logger.info('Starting web recording session...');
    logger.info('Navigate to your application and perform the actions you want to record');
    logger.info('Right-click elements to add named verifications for reporting');
    logger.info('Think times between actions will be automatically recorded');
    logger.info('Press Ctrl+C when done recording');

    await recorder.start(url, {
      browser: 'chromium',
      viewport: options.viewport
    });
  } catch (error: any) {
    logger.error(`Recording failed: ${error.message}`);
    process.exit(1);
  }
}

class WebRecorder {
  private config: any;
  private browser?: Browser;
  private page?: Page;
  private actions: Action[] = [];
  private isRecording = false;
  private lastActionTime = 0;
  private isShuttingDown = false;

  constructor(config: any) {
    this.config = {
      output_file: 'recorded-scenario.yml',
      ...config
    };
  }

  async start(url: string, options: any): Promise<void> {
    await this.initializeBrowser(url, options);
    this.setupGracefulShutdown();
    await this.startRecordingLoop();
  }

  private async initializeBrowser(url: string, options: any): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });

    const context = await this.browser.newContext({
      viewport: this.parseViewport(options.viewport)
    });

    this.page = await context.newPage();
    this.isRecording = true;

    await this.setupRecordingListeners();
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);

    // Extract base URL if not provided
    if (!this.config.base_url) {
      this.config.base_url = new URL(url).origin;
    }

    this.recordAction('goto', { url: this.relativizeUrl(url) });
    logger.info('Recording active. Press Ctrl+C to stop and save recording.');
  }

  private setupGracefulShutdown(): void {
    const shutdownHandler = async (signal: string) => {
      if (this.isShuttingDown || !this.isRecording) return;

      this.isShuttingDown = true;
      logger.info(`${signal} received, stopping recording...`);
      this.isRecording = false;

      try {
        await this.stopRecording();
        logger.info('Recording stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.on('SIGINT', () => shutdownHandler('Ctrl+C'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

    // Emergency save on uncaught errors
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      try {
        this.saveRecording();
        logger.info('Emergency save completed');
      } catch (e) {
        logger.error('Emergency save failed:', e);
      }
      process.exit(1);
    });
  }

  private async startRecordingLoop(): Promise<void> {
    while (this.isRecording) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async setupRecordingListeners(): Promise<void> {
    if (!this.page) return;

    await this.page.exposeFunction('recordWebAction', (action: any) => {
      this.recordAction(action.command, action);
      const actionDesc = this.getActionDescription(action);
      const lastAction = this.actions[this.actions.length - 1];
      const thinkTimeInfo = lastAction.think_time ? ` (${lastAction.think_time} think time)` : '';
      logger.info(`Recorded: ${actionDesc}${thinkTimeInfo}`);
    });

    await this.page.addInitScript(this.getClientScript());
  }

  private getClientScript(): string {
    return `
      (() => {
        let lastInputValues = new Map();
        let lastClickTime = 0;

        // Enhanced selector generation optimized for Mendix and complex applications
        function generateSelector(element) {
          // Helper functions
          function isDynamic(value) {
            // More sophisticated dynamic ID detection
            if (!value) return false;
            
            // Skip Mendix widget IDs (they contain predictable patterns)
            if (value.includes('mxui_widget_') || value.includes('_widget_')) return true;
            
            // Skip UUIDs, long hashes, and random IDs
            if (value.length > 15 && (
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
              /^[0-9A-Z]{15,}$/i.test(value) ||
              /^\d{10,}$/.test(value) ||
              /_\d{5,}$/.test(value)
            )) {
              return true;
            }
            
            return false;
          }

          function isUnique(selector) {
            try {
              const elements = document.querySelectorAll(selector);
              return elements.length === 1 && elements[0] === element;
            } catch (e) {
              return false;
            }
          }

          function getCleanText(el) {
            // Get direct text content, excluding child elements
            let text = '';
            for (const node of el.childNodes) {
              if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
              }
            }
            return text.trim();
          }

          // Priority 1: Mendix data-mendix-id (very stable for Mendix apps)
          const mendixId = element.getAttribute('data-mendix-id');
          if (mendixId && !isDynamic(mendixId) && isUnique(\`[data-mendix-id="\${mendixId}"]\`)) {
            return \`[data-mendix-id="\${mendixId}"]\`;
          }

          // Priority 2: Standard test attributes
          const testAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
          for (const attr of testAttrs) {
            const value = element.getAttribute(attr);
            if (value && !isDynamic(value) && isUnique(\`[\${attr}="\${value}"]\`)) {
              return \`[\${attr}="\${value}"]\`;
            }
          }

          // Priority 3: Stable ID (non-dynamic, non-widget)
          if (element.id && !isDynamic(element.id) && isUnique(\`#\${element.id}\`)) {
            return \`#\${element.id}\`;
          }

          // Priority 4: Form-specific attributes (very reliable for forms)
          const placeholder = element.getAttribute('placeholder');
          if (placeholder && placeholder.length > 0 && isUnique(\`[placeholder="\${placeholder}"]\`)) {
            return \`[placeholder="\${placeholder}"]\`;
          }

          const name = element.getAttribute('name');
          if (name && !isDynamic(name) && isUnique(\`[name="\${name}"]\`)) {
            return \`[name="\${name}"]\`;
          }

          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel && isUnique(\`[aria-label="\${ariaLabel}"]\`)) {
            return \`[aria-label="\${ariaLabel}"]\`;
          }

          // Priority 5: Button/link text (exact match)
          if (['BUTTON', 'A', 'SPAN'].includes(element.tagName)) {
            const directText = getCleanText(element);
            if (directText && directText.length > 0 && directText.length < 100) {
              // Clean text for selector use
              const cleanText = directText.replace(/\\s+/g, ' ').trim();
              
              // Try exact text match with XPath
              try {
                const xpath = \`//\${element.tagName.toLowerCase()}[normalize-space(text())="\${cleanText}"]\`;
                const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (result.snapshotLength === 1 && result.snapshotItem(0) === element) {
                  return \`text="\${cleanText}"\`;
                }
              } catch (e) {
                // Fallback: manual search
                const candidates = Array.from(document.querySelectorAll(element.tagName.toLowerCase()));
                const matches = candidates.filter(el => getCleanText(el) === directText);
                if (matches.length === 1 && matches[0] === element) {
                  return \`text="\${cleanText}"\`;
                }
              }
            }
          }

          // Priority 6: Type-specific selectors for inputs
          if (element.tagName === 'INPUT') {
            const type = element.getAttribute('type') || 'text';
            const typeSelector = \`input[type="\${type}"]\`;
            if (isUnique(typeSelector)) {
              return typeSelector;
            }

            // Try with additional context
            if (element.parentElement) {
              const parentClass = element.parentElement.className;
              if (parentClass) {
                const meaningfulClasses = parentClass.split(' ').filter(c => 
                  c.length > 3 && 
                  !c.match(/^(form-|mx-|spacing-|css-|style-|col-)/i) &&
                  !c.match(/^(row|container|wrapper|group)$/i)
                );
                
                for (const cls of meaningfulClasses.slice(0, 1)) {
                  const contextualSelector = \`.\${cls} input[type="\${type}"]\`;
                  if (isUnique(contextualSelector)) {
                    return contextualSelector;
                  }
                }
              }
            }
          }

          // Priority 7: Meaningful class names (Mendix-specific improvements)
          if (element.className) {
            const classes = element.className.split(' ').filter(c => {
              // Keep meaningful Mendix classes, skip generated ones
              return c.length > 3 && 
                     !c.match(/^(css-|style-|_|[0-9]|spacing-|margin-|padding-)/i) &&
                     !c.match(/^(row|col|container|wrapper|group|form-|btn-(?:primary|secondary|default))$/i);
            });
            
            // Try single meaningful classes first
            for (const cls of classes) {
              if (isUnique(\`.\${cls}\`)) {
                return \`.\${cls}\`;
              }
            }

            // Try tag + class combination
            for (const cls of classes) {
              const selector = \`\${element.tagName.toLowerCase()}.\${cls}\`;
              if (isUnique(selector)) {
                return selector;
              }
            }

            // Try class combinations for buttons and important elements
            if (['BUTTON', 'A', 'DIV'].includes(element.tagName) && classes.length >= 2) {
              const multiClass = classes.slice(0, 2).join('.');
              if (isUnique(\`.\${multiClass}\`)) {
                return \`.\${multiClass}\`;
              }
            }
          }

          // Priority 8: Contextual selectors with meaningful parents
          let parent = element.parentElement;
          let attempts = 0;
          while (parent && parent !== document.body && attempts < 3) {
            attempts++;

            // Parent with stable ID
            if (parent.id && !isDynamic(parent.id)) {
              const contextual = \`#\${parent.id} \${element.tagName.toLowerCase()}\`;
              if (isUnique(contextual)) return contextual;

              // Add element class for more specificity
              if (element.className) {
                const firstClass = element.className.split(' ')[0];
                if (firstClass && firstClass.length > 2) {
                  const specificContextual = \`#\${parent.id} \${element.tagName.toLowerCase()}.\${firstClass}\`;
                  if (isUnique(specificContextual)) return specificContextual;
                }
              }
            }

            // Parent with meaningful class
            if (parent.className) {
              const parentClasses = parent.className.split(' ').filter(c => 
                c.length > 3 && 
                !c.match(/^(css-|style-|_|spacing-|margin-|form-group|container)/i)
              );
              
              for (const cls of parentClasses.slice(0, 1)) {
                const contextual = \`.\${cls} \${element.tagName.toLowerCase()}\`;
                if (isUnique(contextual)) return contextual;
              }
            }

            parent = parent.parentElement;
          }

          // Priority 9: Position-based selector (last resort, but make it meaningful)
          if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children).filter(
              child => child.tagName === element.tagName
            );

            if (siblings.length > 1) {
              const index = siblings.indexOf(element) + 1;
              let nthSelector = \`\${element.tagName.toLowerCase()}:nth-of-type(\${index})\`;

              // Try to make it more specific with parent context
              if (element.parentElement.className) {
                const parentClasses = element.parentElement.className.split(' ')
                  .filter(c => c && !c.match(/^(form-|mx-name|spacing-)/));

                if (parentClasses.length > 0) {
                  const contextualNth = \`.\${parentClasses[0]} \${nthSelector}\`;
                  if (isUnique(contextualNth)) {
                    return contextualNth;
                  }
                }
              }

              return nthSelector;
            }
          }

          // Absolute fallback
          console.warn('Falling back to basic tag name for element:', element);
          return element.tagName.toLowerCase();
        }

        // Check if element is part of verification UI
        function isVerificationUI(element) {
          return element.closest('#verification-menu') ||
                 element.closest('[data-verification-ui]') ||
                 element.closest('.verification-overlay') ||
                 ['Add Verification', 'Cancel', 'Verify element', 'Name Your Verification']
                   .some(text => element.textContent?.includes(text));
        }

        // Click recording
        document.addEventListener('click', (e) => {
          const now = Date.now();
          if (now - lastClickTime < 300) return; // Debounce
          lastClickTime = now;
          
          const target = e.target;
            if (isVerificationUI(target) || 
                (target.tagName === 'INPUT' && !['submit', 'reset', 'button'].includes(target.type)) ||
                ['TEXTAREA', 'SELECT'].includes(target.tagName)) {
              return;
            }
          
          window.recordWebAction({
            command: 'click',
            selector: generateSelector(target)
          });
        }, true);

        // Input recording
        document.addEventListener('input', (e) => {
          const target = e.target;
          if (isVerificationUI(target)) return;
          lastInputValues.set(target, target.value);
        });

        document.addEventListener('blur', (e) => {
          const target = e.target;
          if (['INPUT', 'TEXTAREA'].includes(target.tagName) && 
              !isVerificationUI(target) && 
              lastInputValues.has(target)) {
            window.recordWebAction({
              command: 'fill',
              selector: generateSelector(target),
              value: lastInputValues.get(target)
            });
          }
        }, true);

        // Select and key recording
        document.addEventListener('change', (e) => {
          if (e.target.tagName === 'SELECT') {
            window.recordWebAction({
              command: 'select',
              selector: generateSelector(e.target),
              value: e.target.value
            });
          }
        });

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            const target = e.target;
            if (lastInputValues.has(target)) {
              window.recordWebAction({
                command: 'fill',
                selector: generateSelector(target),
                value: lastInputValues.get(target)
              });
            }
          } else if (['Tab', 'Escape'].includes(e.key)) {
            window.recordWebAction({
              command: 'press',
              selector: generateSelector(e.target),
              key: e.key
            });
          }
        });

        // Verification context menu
        document.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showVerificationMenu(e.target, e.clientX, e.clientY);
        });

        function showVerificationMenu(element, x, y) {
          // Remove existing menu
          const existing = document.getElementById('verification-menu');
          if (existing) existing.remove();

          const menu = document.createElement('div');
          menu.id = 'verification-menu';
          menu.style.cssText = \`
            position: fixed; top: \${y}px; left: \${x}px; background: white;
            border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 10000; padding: 5px 0; font-family: system-ui; font-size: 14px;
          \`;

          const options = [
            { text: 'Verify element exists', action: 'verify_exists' },
            { text: 'Verify element visible', action: 'verify_visible' },
            { text: 'Verify text content', action: 'verify_text' },
            { text: 'Verify element not exists', action: 'verify_not_exists' }
          ];

          options.forEach(option => {
            const item = document.createElement('div');
            item.textContent = option.text;
            item.style.cssText = 'padding: 8px 16px; cursor: pointer;';
            
            item.onmouseenter = () => item.style.backgroundColor = '#f0f0f0';
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            item.onclick = (e) => {
              e.stopPropagation();
              menu.remove();
              showNameDialog(element, option);
            };
            
            menu.appendChild(item);
          });

          document.body.appendChild(menu);
          setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
        }

        function showNameDialog(element, option) {
          const overlay = document.createElement('div');
          overlay.setAttribute('data-verification-ui', 'true');
          overlay.className = 'verification-overlay';
          overlay.style.cssText = \`
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 20000; display: flex;
            align-items: center; justify-content: center;
          \`;

          const dialog = document.createElement('div');
          dialog.setAttribute('data-verification-ui', 'true');
          dialog.innerHTML = \`
            <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #333;">Name Your Verification</h3>
            <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">
              \${option.text} for element: \${generateSelector(element)}
            </p>
            <input type="text" placeholder='e.g., "Login Success", "User Dashboard Loaded"'
                   style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; 
                          font-size: 14px; margin-bottom: 16px; box-sizing: border-box;">
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button class="cancel" style="padding: 8px 16px; border: 1px solid #ddd; background: white; 
                                          border-radius: 4px; cursor: pointer; font-size: 14px;">Cancel</button>
              <button class="save" style="padding: 8px 16px; border: none; background: #007bff; color: white; 
                                        border-radius: 4px; cursor: pointer; font-size: 14px;">Add Verification</button>
            </div>
          \`;
          dialog.style.cssText = \`
            background: white; border-radius: 8px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 400px; width: 90%; font-family: system-ui;
          \`;

          const input = dialog.querySelector('input');
          const cancelBtn = dialog.querySelector('.cancel');
          const saveBtn = dialog.querySelector('.save');

          const closeDialog = () => overlay.remove();
          
          const saveVerification = () => {
            const name = input.value.trim();
            if (!name) {
              input.style.borderColor = '#ff4444';
              input.focus();
              return;
            }

            const verification = {
              command: option.action,
              selector: generateSelector(element),
              name: name
            };

            if (option.action === 'verify_text') {
              const text = element.textContent?.trim();
              if (text) verification.expected_text = text;
            }

            window.recordWebAction(verification);
            closeDialog();
          };

          cancelBtn.onclick = closeDialog;
          saveBtn.onclick = saveVerification;
          overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };
          
          input.onkeydown = (e) => {
            if (e.key === 'Enter') saveVerification();
            else if (e.key === 'Escape') closeDialog();
          };

          overlay.appendChild(dialog);
          document.body.appendChild(overlay);
          setTimeout(() => input.focus(), 100);
        }

        console.log('Recording script initialized');
      })();
    `;
  }

  private recordAction(command: string, data: any): void {
    const currentTime = Date.now();
    const isVerification = command.startsWith('verify_');

    // Only calculate think time for user interactions, not verifications
    const thinkTime = !isVerification && this.lastActionTime > 0 ?
        Math.round((currentTime - this.lastActionTime) / 1000) : 0;

    const action: Action = {
      name: `${command}_step_${this.actions.length + 1}`,
      type: 'web',
      action: { command, ...data },
      timestamp: currentTime
    };

    // Only add think time for non-verification actions
    if (!isVerification && thinkTime > 1) {
      action.think_time = `${thinkTime}s`;
    }

    this.actions.push(action);

    // Only update lastActionTime for user interactions, not verifications
    if (!isVerification) {
      this.lastActionTime = currentTime;
    }
  }

  private getActionDescription(action: any): string {
    const { command, selector, value, key, expected_text, name } = action;

    switch (command) {
      case 'fill': return `fill "${selector}" with "${value}"`;
      case 'click': return `click "${selector}"`;
      case 'select': return `select "${value}" in "${selector}"`;
      case 'press': return `press "${key}" on "${selector}"`;
      case 'verify_exists': return `verify "${selector}" exists${name ? ` (${name})` : ''}`;
      case 'verify_visible': return `verify "${selector}" is visible${name ? ` (${name})` : ''}`;
      case 'verify_text': return `verify "${selector}" contains text "${expected_text}"${name ? ` (${name})` : ''}`;
      case 'verify_not_exists': return `verify "${selector}" does not exist${name ? ` (${name})` : ''}`;
      default: return `${command} ${selector || action.url || ''}`;
    }
  }

  private relativizeUrl(url: string): string {
    return this.config.base_url && url.startsWith(this.config.base_url)
        ? url.substring(this.config.base_url.length)
        : url;
  }

  private parseViewport(viewport?: string): { width: number; height: number } | undefined {
    if (!viewport) return undefined;
    const [width, height] = viewport.split('x').map(Number);
    return { width, height };
  }

  private async stopRecording(): Promise<void> {
    logger.info(`Stopping recording... Recorded ${this.actions.length} actions`);

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn('Error closing browser:', error);
      }
    }

    this.saveRecording();
  }

  private saveRecording(): void {
    try {
      const outputPath = path.resolve(this.config.output_file);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      // Clean up actions
      const cleanedActions = this.actions
          .filter(action => action.action && action.action.command)
          .map(action => {
            const cleanAction: any = {
              name: action.name,
              type: action.type,
              action: { ...action.action }
            };

            if (action.think_time) {
              cleanAction.think_time = action.think_time;
            }

            return cleanAction;
          });

      const scenario = {
        name: 'Recorded Web Scenario',
        description: `Recorded on ${new Date().toISOString()}`,
        global: {
          base_url: this.config.base_url || 'https://example.com',
          browser: { type: 'chromium', headless: false }
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
          think_time: '1-3',
          steps: cleanedActions
        }],
        outputs: [{ type: 'json', file: 'results/recorded-test-results.json' }],
        report: { generate: true, output: 'reports/recorded-test-report.html' }
      };

      const content = yaml.stringify(scenario, { indent: 2, lineWidth: 120 });
      fs.writeFileSync(outputPath, content, 'utf8');

      const stats = fs.statSync(outputPath);
      logger.info(`File saved successfully: ${outputPath} (${stats.size} bytes)`);

    } catch (error) {
      logger.error('Save failed:', error);

      // Emergency JSON save
      try {
        const emergencyPath = path.resolve('emergency-recording.json');
        const emergencyData = { actions: this.actions, error: (error as Error).message };
        fs.writeFileSync(emergencyPath, JSON.stringify(emergencyData, null, 2));
        logger.info(`Emergency save completed: ${emergencyPath}`);
      } catch (emergencyError) {
        logger.error('Emergency save also failed:', emergencyError);
      }
    }
  }
}
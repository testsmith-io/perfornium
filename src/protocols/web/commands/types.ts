import { Page } from 'playwright';
import { WebAction } from '../../../config';

export interface CommandResult {
  [key: string]: any;
  action_time?: number;
}

export interface CommandHandler {
  execute(page: Page, action: WebAction): Promise<CommandResult>;
}

export interface HighlightFunction {
  (page: Page, selector: string): Promise<void>;
}

import chalk from 'chalk';

export enum LogLevel { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3 }

export class Logger {
  // Default to WARN - minimal output unless verbose mode is enabled
  private level: LogLevel = LogLevel.WARN;
  
  setLevel(level: LogLevel): void { this.level = level; }
  
  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }
  
  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue(`[INFO] ${message}`), ...args);
    }
  }
  
  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow(`[WARN] ${message}`), ...args);
    }
  }
  
  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(chalk.red(`[ERROR] ${message}`), ...args);
    }
  }
  
  success(message: string, ...args: any[]): void {
    console.log(chalk.green(`[SUCCESS] ${message}`), ...args);
  }
}

export const logger = new Logger();
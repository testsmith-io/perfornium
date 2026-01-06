import * as fs from 'fs';
import * as path from 'path';
import { TimestampHelper } from './timestamp-helper';

/**
 * File management utility for handling timestamped files and ensuring directories exist
 */
export class FileManager {
  /**
   * Process template path and ensure directory exists
   */
  static processFilePath(templatePath: string, context?: any): string {
    let processedPath = templatePath;

    // Always process timestamp templates, even without full context
    if (templatePath.includes('{{timestamp')) {
      processedPath = this.processTimestampTemplate(templatePath);
    }

    // If context is provided, use full template processing
    if (context) {
      const { TemplateProcessor } = require('./template');
      const processor = new TemplateProcessor();
      processedPath = processor.process(processedPath, context);
    }

    // Ensure directory exists
    this.ensureDirectoryExists(processedPath);

    return processedPath;
  }

  /**
   * Process timestamp templates in file paths using TimestampHelper
   */
  private static processTimestampTemplate(templatePath: string): string {
    return templatePath.replace(/\{\{timestamp(?::([^}]+))?\}\}/g, (_match, format) => {
      const fmt = (format || 'file') as 'unix' | 'iso' | 'readable' | 'file';
      return TimestampHelper.getTimestamp(fmt);
    });
  }

  /**
   * Ensure directory exists for a file path
   */
  static ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  }

  /**
   * Create file with timestamped name and ensure directory exists
   */
  static createTimestampedFile(templatePath: string, content: string, context?: any): string {
    const processedPath = this.processFilePath(templatePath, context);
    
    try {
      fs.writeFileSync(processedPath, content);
      console.log(`📄 Created file: ${processedPath}`);
      return processedPath;
    } catch (error) {
      console.error(`❌ Failed to create file ${processedPath}:`, error);
      throw error;
    }
  }

  /**
   * Generate unique filename if file already exists
   */
  static generateUniqueFileName(originalPath: string): string {
    if (!fs.existsSync(originalPath)) {
      return originalPath;
    }
    
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const name = path.basename(originalPath, ext);
    
    let counter = 1;
    let newPath: string;
    
    do {
      newPath = path.join(dir, `${name}-${counter}${ext}`);
      counter++;
    } while (fs.existsSync(newPath));
    
    return newPath;
  }

  /**
   * Safe write - creates unique filename if needed
   */
  static safeWriteFile(templatePath: string, content: string, context?: any, overwrite: boolean = false): string {
    const processedPath = this.processFilePath(templatePath, context);
    const finalPath = overwrite ? processedPath : this.generateUniqueFileName(processedPath);
    
    try {
      fs.writeFileSync(finalPath, content);
      console.log(`📄 Safely created file: ${finalPath}`);
      return finalPath;
    } catch (error) {
      console.error(`❌ Failed to safely create file ${finalPath}:`, error);
      throw error;
    }
  }

  /**
   * Create timestamped backup of existing file
   */
  static createBackup(filePath: string): string | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const backupPath = path.join(dir, `${name}.${timestamp}.backup${ext}`);
    
    try {
      fs.copyFileSync(filePath, backupPath);
      console.log(`💾 Created backup: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error(`❌ Failed to create backup of ${filePath}:`, error);
      return null;
    }
  }
}
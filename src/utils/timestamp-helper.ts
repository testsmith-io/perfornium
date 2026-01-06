/**
 * Enhanced timestamp utility for file naming and templating
 */
export class TimestampHelper {
  /**
   * Generate various timestamp formats
   */
  static getTimestamp(format: 'unix' | 'iso' | 'readable' | 'file' = 'unix'): string {
    const now = new Date();
    
    switch (format) {
      case 'unix':
        return Date.now().toString();
      case 'iso':
        return now.toISOString();
      case 'readable':
        return now.toLocaleString().replace(/[/\s:]/g, '-');
      case 'file': {
        // Safe for filenames: YYYYMMDD-HHMMSS-mmm
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${year}${month}${day}-${hour}${minute}${second}-${ms}`;
      }
      default:
        return Date.now().toString();
    }
  }

  /**
   * Create filename with timestamp ensuring directory exists
   */
  static createTimestampedPath(template: string, format: 'unix' | 'iso' | 'readable' | 'file' = 'file'): string {
    const timestamp = this.getTimestamp(format);
    return template.replace(/\{\{timestamp\}\}/g, timestamp);
  }

  /**
   * Generate filename ensuring uniqueness
   */
  static generateUniqueFilename(baseTemplate: string): string {
    const timestamp = this.getTimestamp('file');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return baseTemplate
      .replace(/\{\{timestamp\}\}/g, timestamp)
      .replace(/\{\{unique\}\}/g, `${timestamp}-${random}`);
  }
}
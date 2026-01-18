import { TestConfiguration, OutputConfig } from '../../config';
import { OutputHandler } from '../../outputs/base';
import { CSVOutput } from '../../outputs/csv';
import { JSONOutput } from '../../outputs/json';
import { InfluxDBOutput } from '../../outputs/influxdb';
import { GraphiteOutput } from '../../outputs/graphite';
import { WebhookOutput } from '../../outputs/webhook';
import { FileManager } from '../../utils/file-manager';
import { logger } from '../../utils/logger';

export class OutputHandlerFactory {
  private testName: string;

  constructor(testName: string) {
    this.testName = testName;
  }

  async createOutputs(outputConfigs?: OutputConfig[]): Promise<OutputHandler[]> {
    if (!outputConfigs) return [];

    const outputs: OutputHandler[] = [];

    for (const outputConfig of outputConfigs) {
      // Skip disabled outputs
      if (outputConfig.enabled === false) {
        continue;
      }

      try {
        const output = await this.createOutput(outputConfig);
        if (output) {
          await output.initialize();
          outputs.push(output);
          logger.debug(`${outputConfig.type} output initialized`);
        }
      } catch (error) {
        logger.warn(`Failed to initialize ${outputConfig.type} output:`, error);
      }
    }

    return outputs;
  }

  private async createOutput(config: OutputConfig): Promise<OutputHandler | null> {
    // Process timestamp templates in file paths
    const processedFilePath = this.processTemplateFilePath(config.file);

    switch (config.type) {
      case 'csv':
        return new CSVOutput(processedFilePath);

      case 'json':
        return new JSONOutput(processedFilePath);

      case 'influxdb':
        return new InfluxDBOutput(
          config.url!,
          config.database!,
          config.tags
        );

      case 'graphite': {
        const [host, port] = (config.url || 'localhost:2003').split(':');
        return new GraphiteOutput(
          host,
          parseInt(port || '2003'),
          'perfornium'
        );
      }

      case 'webhook':
        return new WebhookOutput(
          config.url!,
          config.headers || {},
          'json',
          config.template
        );

      default:
        logger.warn(`Unsupported output type: ${config.type}`);
        return null;
    }
  }

  private processTemplateFilePath(filePath?: string): string {
    if (!filePath) {
      return `results/${this.testName}-{{timestamp}}.csv`;
    }

    // If no timestamp placeholder exists, automatically add one before the extension
    let processedPath = filePath;
    if (!filePath.includes('{{timestamp}}')) {
      const lastDot = filePath.lastIndexOf('.');
      if (lastDot > 0) {
        const name = filePath.substring(0, lastDot);
        const ext = filePath.substring(lastDot);
        processedPath = `${name}-{{timestamp}}${ext}`;
      } else {
        processedPath = `${filePath}-{{timestamp}}`;
      }
    }

    // Use FileManager to process timestamp templates
    return FileManager.processFilePath(processedPath);
  }

  static async finalizeOutputs(outputs: OutputHandler[], summary: any): Promise<void> {
    for (const output of outputs) {
      try {
        await output.writeSummary(summary);
        await output.finalize();
      } catch (error) {
        logger.warn('Output finalization failed:', error);
      }
    }
  }
}

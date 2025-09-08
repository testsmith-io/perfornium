import * as path from 'path';
import { ConfigParser } from '../../config/parser';
import { ConfigValidator } from '../../config/validator';
import { TestRunner } from '../../core/test-runner';
import { logger, LogLevel } from '../../utils/logger';

export async function runCommand(
  configPath: string,
  options: {
    env?: string;
    workers?: string;
    output?: string;
    report?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
    maxUsers?: string;
  }
): Promise<void> {
  try {
    if (options.verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }

    logger.info(`Loading configuration: ${configPath}`);
    
    const parser = new ConfigParser();
    const config = await parser.parse(configPath, options.env);
    
    // Apply CLI overrides
    if (options.maxUsers) {
      const maxUsers = parseInt(options.maxUsers);
      if (config.load.virtual_users && config.load.virtual_users > maxUsers) {
        logger.warn(`Limiting virtual users from ${config.load.virtual_users} to ${maxUsers}`);
        config.load.virtual_users = maxUsers;
      }
    }
    
    // Process templates with environment variables
    const processedConfig = parser.processTemplates(config, {
      env: process.env,
      timestamp: Date.now(),
      datetime: new Date().toISOString()
    });

    logger.info(`Validating configuration...`);
    const validator = new ConfigValidator();
    const validation = validator.validate(processedConfig);
    
    if (!validation.valid) {
      logger.error('Configuration validation failed:');
      validation.errors.forEach(error => logger.error(`  - ${error}`));
      process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('Configuration warnings:');
      validation.warnings.forEach(warning => logger.warn(`  - ${warning}`));
    }

    if (options.dryRun) {
      logger.success('Configuration is valid');
      return;
    }

    // Override output directory if specified
    if (options.output && processedConfig.outputs) {
      processedConfig.outputs.forEach(output => {
        if (output.file) {
          output.file = path.join(options.output!, path.basename(output.file));
        }
      });
    }

    // Enable report generation if requested
    if (options.report) {
      processedConfig.report = {
        generate: true,
        output: options.output ? path.join(options.output, 'report.html') : 'report.html',
        ...processedConfig.report
      };
    }

    if (options.workers) {
      const { WorkerManager } = await import('../../workers/manager');
      const manager = new WorkerManager();
      
      const workerAddresses = options.workers.split(',').map(w => w.trim());
      for (const address of workerAddresses) {
        await manager.addWorker(address);
      }
      
      await manager.distributeTest(processedConfig);
      await manager.waitForCompletion();
      
      const metrics = manager.getAggregatedMetrics();
      const summary = metrics.getSummary();
      logger.success(`Distributed test completed: ${summary.success_rate.toFixed(2)}% success rate`);
      
      await manager.cleanup();
    } else {
      const runner = new TestRunner(processedConfig);
      
      // Set up graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, stopping test...');
        await runner.stop();
        process.exit(0);
      });
      
      await runner.run();
    }

  } catch (error: any) {
    logger.error(`Test execution failed: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
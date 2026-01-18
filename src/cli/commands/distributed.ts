import { DistributedCoordinator, DistributedTestConfig } from '../../distributed/coordinator';
import { ConfigParser } from '../../config';
import { ConfigValidator } from '../../config/validator';
import { logger, LogLevel } from '../../utils/logger';
import { TimestampHelper } from '../../utils/timestamp-helper';
import * as fs from 'fs';
import { RemoteWorkerConfig } from '../../distributed/remote-worker'; // Fixed import

export async function distributedCommand(
  configPath: string,
  options: {
    workers?: string;
    workersFile?: string;
    strategy?: string;
    syncStart?: boolean;
    env?: string;
    output?: string;
    report?: boolean;
    verbose?: boolean;
    debug?: boolean;
  }
): Promise<void> {
  try {
    // Set log level: default=WARN, --verbose=INFO, --debug=DEBUG
    if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (options.verbose) {
      logger.setLevel(LogLevel.INFO);
    }

    // Parse test configuration
    const parser = new ConfigParser();
    const testConfig = await parser.parse(configPath, options.env);
    
    // Validate configuration
    const validator = new ConfigValidator();
    const validation = validator.validate(testConfig);
    
    if (!validation.valid) {
      logger.error('❌ Configuration validation failed:');
      validation.errors.forEach(error => logger.error(`  - ${error}`));
      process.exit(1);
    }

    // Parse worker configurations
    const workers = parseWorkerConfigs(options.workers, options.workersFile);
    
    if (workers.length === 0) {
      logger.error('❌ No workers specified');
      process.exit(1);
    }

    // Create distributed test configuration
    const distributedConfig: DistributedTestConfig = {
      workers,
      strategy: (options.strategy as any) || 'capacity_based',
      sync_start: options.syncStart || false,
      heartbeat_interval: 30000,
      timeout: 300000,
      retry_failed: true
    };

    // Initialize and run distributed test
    const coordinator = new DistributedCoordinator(distributedConfig);
    
    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Received SIGINT, stopping distributed test...');
      await coordinator.stop();
      await coordinator.cleanup();
      process.exit(0);
    });

    await coordinator.initialize();
    
    logger.info(`🚀 Starting distributed test with ${workers.length} workers`);
    logger.info(`📊 Strategy: ${distributedConfig.strategy}`);
    logger.info(`🔄 Sync start: ${distributedConfig.sync_start ? 'Yes' : 'No'}`);
    
    await coordinator.executeTest(testConfig);
    
    // Get aggregated results
    const results = coordinator.getAggregatedResults();
    
    logger.info('📊 Distributed Test Results:');
    logger.info(`   Total Requests: ${results.summary.total_requests}`);
    logger.info(`   Success Rate: ${results.summary.success_rate.toFixed(2)}%`);
    logger.info(`   Avg Response Time: ${results.summary.avg_response_time.toFixed(2)}ms`);
    logger.info(`   Requests/sec: ${results.summary.requests_per_second.toFixed(2)}`);
    
    // Output results if specified
    if (options.output) {
      const outputPath = options.output.endsWith('.json') ? options.output : `${options.output}/distributed-results.json`;
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      logger.success(`📄 Results written to: ${outputPath}`);
    }
    
    // Generate report if requested
    if (options.report || testConfig.report?.generate) {
      try {
        const { HTMLReportGenerator } = await import('../../reporting/html-generator');
        const generator = new HTMLReportGenerator();
        
        const timestamp = TimestampHelper.getTimestamp('file');
        const reportFilename = `distributed-report-${timestamp}.html`;
        // Always use timestamped filename for distributed reports in reports folder
        const reportPath = options.output ?
          `${options.output}/${reportFilename}` :
          `reports/${reportFilename}`;

        await generator.generate(
          {
            testName: `${testConfig.name} (Distributed)`,
            summary: results.summary,
            results: results.results
          },
          reportPath
        );
        
        logger.success(`📋 Report generated: ${reportPath}`);
      } catch (error) {
        logger.error(`❌ Report generation failed: ${error}`);
      }
    }
    
    await coordinator.cleanup();
    
  } catch (error: any) {
    logger.error(`❌ Distributed test failed: ${error.message}`);
    if (options.verbose || options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function parseWorkerConfigs(workersString?: string, workersFile?: string): RemoteWorkerConfig[] {
  const workers: RemoteWorkerConfig[] = [];
  
  // Parse from command line
  if (workersString) {
    const workerAddresses = workersString.split(',').map(w => w.trim());
    
    workerAddresses.forEach(address => {
      const [host, portStr] = address.split(':');
      const port = parseInt(portStr || '8080');
      
      workers.push({
        host: host.trim(),
        port,
        capacity: 100, // Default capacity
        region: 'default'
      });
    });
  }
  
  // Parse from file
  if (workersFile) {
    try {
      const fileContent = fs.readFileSync(workersFile, 'utf8');
      const fileWorkers = JSON.parse(fileContent);

      if (Array.isArray(fileWorkers)) {
        // Apply defaults to workers from file
        fileWorkers.forEach((w: any) => {
          workers.push({
            host: w.host || 'localhost',
            port: w.port || 8080,
            capacity: w.capacity ?? 100,  // Default capacity if not specified
            region: w.region || 'default'
          });
        });
      } else {
        throw new Error('Workers file must contain an array of worker configurations');
      }
    } catch (error) {
      logger.error(`❌ Failed to parse workers file ${workersFile}:`, error);
      throw error;
    }
  }
  
  return workers;
}

import * as fs from 'fs';
import * as path from 'path';
import { HTMLReportGenerator } from '../../reporting/generator';
import { logger } from '../../utils/logger';

export async function reportCommand(
  resultsPath: string,
  options: {
    output?: string;
    template?: string;
    title?: string;
  }
): Promise<void> {
  try {
    logger.info(`📊 Generating report from: ${resultsPath}`);
    
    if (!fs.existsSync(resultsPath)) {
      logger.error(`❌ Results file not found: ${resultsPath}`);
      process.exit(1);
    }
    
    const resultsContent = fs.readFileSync(resultsPath, 'utf8');
    let resultsData: any;
    
    if (resultsPath.endsWith('.json')) {
      resultsData = JSON.parse(resultsContent);
    } else {
      logger.error('❌ Only JSON results files are currently supported');
      process.exit(1);
    }
    
    const generator = new HTMLReportGenerator();
    const outputPath = options.output || 'report.html';
    
    const reportConfig = {
      generate: true,
      output: outputPath,
      template: options.template,
      title: options.title,
      percentiles: [50, 90, 95, 99],
      include_charts: true,
      include_raw_data: false
    };
    
    await generator.generate(
      {
        testName: options.title || resultsData.testName || 'Performance Test',
        summary: resultsData.summary,
        results: resultsData.results || []
      },
      reportConfig,
      outputPath
    );
    
    logger.success(`✅ Report generated: ${path.resolve(outputPath)}`);
    
  } catch (error: any) {
    logger.error(`❌ Report generation failed: ${error.message}`);
    process.exit(1);
  }
}
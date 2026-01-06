import * as fs from 'fs';
import * as path from 'path';
import { EnhancedHTMLReportGenerator } from '../../reporting/enhanced-html-generator';
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
    
    const generator = new EnhancedHTMLReportGenerator();
    const outputPath = options.output || 'report.html';

    await generator.generate(
      {
        testName: options.title || resultsData.testName || 'Performance Test',
        summary: resultsData.summary,
        results: resultsData.results || []
      },
      outputPath
    );
    
    logger.success(`✅ Report generated: ${path.resolve(outputPath)}`);
    
  } catch (error: any) {
    logger.error(`❌ Report generation failed: ${error.message}`);
    process.exit(1);
  }
}
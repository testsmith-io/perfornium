import { ConfigParser } from '../../config/parser';
import { ConfigValidator } from '../../config/validator';
import { logger } from '../../utils/logger';

export async function validateCommand(
  configPath: string,
  options: { env?: string }
): Promise<void> {
  try {
    logger.info(`🔍 Validating configuration: ${configPath}`);
    
    const parser = new ConfigParser();
    const config = await parser.parse(configPath, options.env);
    
    const validator = new ConfigValidator();
    const result = validator.validate(config);
    
    if (result.valid) {
      logger.success('✅ Configuration is valid');
      
      if (result.warnings.length > 0) {
        logger.warn('⚠️  Warnings:');
        result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
      }
    } else {
      logger.error('❌ Configuration validation failed:');
      result.errors.forEach(error => logger.error(`  - ${error}`));
      
      if (result.warnings.length > 0) {
        logger.warn('⚠️  Warnings:');
        result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
      }
      
      process.exit(1);
    }
  } catch (error: any) {
    logger.error(`❌ Validation failed: ${error.message}`);
    process.exit(1);
  }
}

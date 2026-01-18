import { ExtractConfig, VUContext } from '../../config';
import { logger } from '../../utils/logger';

export class DataExtractor {
  async extractData(
    extractors: ExtractConfig[],
    result: any,
    context: VUContext
  ): Promise<void> {
    for (const extractor of extractors) {
      try {
        let value: any;

        // Normalize type: accept both "jsonpath" and "json_path"
        const extractType = (extractor.type || 'jsonpath').toLowerCase().replace('_', '');
        // Normalize expression: accept both "path" and "expression"
        const expression = (extractor as any).expression || (extractor as any).path;

        switch (extractType) {
          case 'jsonpath':
            value = this.getJsonPath(result.data, expression);
            break;
          case 'regex':
            const match = String(result.data).match(new RegExp(expression));
            value = match ? (match[1] || match[0]) : null;
            break;
          case 'header':
            value = result.headers?.[expression.toLowerCase()];
            break;
          case 'custom':
            value = await this.extractCustom(extractor.script!, result, context);
            break;
          default:
            // Default to jsonpath if type not recognized but path/expression provided
            if (expression) {
              value = this.getJsonPath(result.data, expression);
            }
        }

        if (value !== null && value !== undefined) {
          context.extracted_data[extractor.name] = value;
          logger.debug(`Extracted ${extractor.name} = ${JSON.stringify(value)}`);
        } else if (extractor.default !== undefined) {
          context.extracted_data[extractor.name] = extractor.default;
        }
      } catch (error) {
        logger.debug(`Extraction failed for ${extractor.name}: ${error}`);
        if (extractor.default !== undefined) {
          context.extracted_data[extractor.name] = extractor.default;
        }
      }
    }
  }

  private async extractCustom(script: string, result: any, context: VUContext): Promise<any> {
    try {
      const fn = new Function('result', 'context', `return ${script}`);
      return fn(result, context);
    } catch (error) {
      return null;
    }
  }

  getJsonPath(obj: any, path: string): any {
    const keys = path.replace(/^\$\./, '').split('.');
    return keys.reduce((current, key) => {
      if (key.includes('[') && key.includes(']')) {
        const [prop, index] = key.split(/[\[\]]/);
        return current && current[prop] && current[prop][parseInt(index)];
      }
      return current && current[key];
    }, typeof obj === 'string' ? JSON.parse(obj) : obj);
  }
}

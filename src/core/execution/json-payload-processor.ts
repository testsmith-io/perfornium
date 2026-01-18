import * as fs from 'fs';
import * as path from 'path';
import { RESTStep, VUContext } from '../../config';
import { TemplateProcessor } from '../../utils/template';

export class JSONPayloadProcessor {
  private templateProcessor = new TemplateProcessor();

  processJsonFile(step: RESTStep, context: VUContext): RESTStep {
    if (!step.jsonFile) {
      return step;
    }

    // Resolve file path relative to CWD
    const filePath = path.resolve(process.cwd(), step.jsonFile);

    if (!fs.existsSync(filePath)) {
      throw new Error(`JSON payload file not found: ${step.jsonFile}`);
    }

    // Load and parse JSON file
    let payload: any;
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      payload = JSON.parse(fileContent);
    } catch (error: any) {
      throw new Error(`Failed to parse JSON file ${step.jsonFile}: ${error.message}`);
    }

    // Apply overrides if specified
    if (step.overrides) {
      payload = this.applyOverrides(payload, step.overrides, context);
    }

    // Return new step with json property set (removing jsonFile and overrides)
    const { jsonFile, overrides, ...restOfStep } = step;
    return {
      ...restOfStep,
      json: payload
    };
  }

  applyOverrides(obj: any, overrides: Record<string, any>, context: VUContext): any {
    // Deep clone the object to avoid mutating the original
    const result = JSON.parse(JSON.stringify(obj));

    const contextData = {
      __VU: context.vu_id,
      __ITER: context.iteration,
      vu_id: context.vu_id,
      iteration: context.iteration,
      variables: context.variables || {},
      extracted_data: context.extracted_data || {},
      ...context.variables,
      ...context.extracted_data
    };

    for (const [path, value] of Object.entries(overrides)) {
      // Process template expressions in override values
      let processedValue = value;
      if (typeof value === 'string') {
        processedValue = this.templateProcessor.process(value, contextData);
        // Try to parse as JSON if it looks like a number, boolean, or object
        if (processedValue === 'true') processedValue = true;
        else if (processedValue === 'false') processedValue = false;
        else if (!isNaN(Number(processedValue)) && processedValue !== '') {
          processedValue = Number(processedValue);
        }
      }

      this.setNestedValue(result, path, processedValue);
    }

    return result;
  }

  setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // Handle array indices like 'items[0]'
      const arrayMatch = key.match(/^(.+)\[(\d+)]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        if (!current[prop]) current[prop] = [];
        if (!current[prop][parseInt(index)]) current[prop][parseInt(index)] = {};
        current = current[prop][parseInt(index)];
      } else {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
    }

    const lastKey = keys[keys.length - 1];

    // Handle array index in last key
    const arrayMatch = lastKey.match(/^(.+)\[(\d+)]$/);
    if (arrayMatch) {
      const [, prop, index] = arrayMatch;
      if (!current[prop]) current[prop] = [];
      current[prop][parseInt(index)] = value;
    } else {
      current[lastKey] = value;
    }
  }
}

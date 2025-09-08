import { TestConfiguration } from './types';

export class ConfigValidator {
  validate(config: TestConfiguration): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!config.name) {
      errors.push('Test name is required');
    }

    if (!config.load) {
      errors.push('Load configuration is required');
    } else {
      this.validateLoadConfig(config.load, errors, warnings);
    }

    if (!config.scenarios || config.scenarios.length === 0) {
      errors.push('At least one scenario must be configured');
    } else {
      this.validateScenarios(config.scenarios, errors, warnings);
    }

    // Validate outputs
    if (config.outputs) {
      this.validateOutputs(config.outputs, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateLoadConfig(load: any, errors: string[], warnings: string[]): void {
    const validPatterns = ['basic', 'stepping', 'arrivals', 'mixed'];
    if (!validPatterns.includes(load.pattern)) {
      errors.push(`Invalid load pattern: ${load.pattern}. Valid patterns: ${validPatterns.join(', ')}`);
    }

    if (load.pattern === 'basic') {
      if (!load.virtual_users) {
        errors.push('virtual_users is required for basic load pattern');
      }
      if (!load.duration) {
        warnings.push('duration not specified for basic pattern');
      }
    }

    if (load.pattern === 'stepping') {
      if (!load.steps || load.steps.length === 0) {
        errors.push('steps configuration is required for stepping load pattern');
      }
    }

    if (load.pattern === 'arrivals') {
      if (!load.rate) {
        errors.push('rate is required for arrivals load pattern');
      }
    }

    // Validate reasonable limits
    if (load.virtual_users && load.virtual_users > 1000) {
      warnings.push(`High virtual user count (${load.virtual_users}). Consider distributed testing.`);
    }
  }

  private validateScenarios(scenarios: any[], errors: string[], warnings: string[]): void {
    scenarios.forEach((scenario, index) => {
      if (!scenario.name) {
        errors.push(`Scenario at index ${index} must have a name`);
      }

      if (!scenario.steps || scenario.steps.length === 0) {
        errors.push(`Scenario '${scenario.name}' must have at least one step`);
      }

      // Validate steps
      scenario.steps?.forEach((step: any, stepIndex: number) => {
        this.validateStep(step, stepIndex, scenario.name, errors, warnings);
      });

      // Validate weights
      if (scenario.weight && (scenario.weight < 0 || scenario.weight > 100)) {
        warnings.push(`Scenario '${scenario.name}' weight should be between 0-100`);
      }
    });

    // Check total weights
    const totalWeight = scenarios.reduce((sum, s) => sum + (s.weight || 100), 0);
    if (totalWeight > scenarios.length * 100) {
      warnings.push('Total scenario weights exceed 100% per scenario');
    }
  }

  private validateStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    const stepType = step.type || 'rest';

    if (!stepType) {
      errors.push(`Step at index ${index} in scenario '${scenarioName}' must have a type`);
      return;
    }

    const validTypes = ['rest', 'soap', 'web', 'custom', 'wait'];
    if (!validTypes.includes(stepType)) {
      errors.push(`Invalid step type '${stepType}' at index ${index} in scenario '${scenarioName}'`);
    }

    // Type-specific validation
    switch (stepType) {
      case 'rest':
        this.validateRESTStep(step, index, scenarioName, errors, warnings);
        break;
      case 'soap':
        this.validateSOAPStep(step, index, scenarioName, errors, warnings);
        break;
      case 'web':
        this.validateWebStep(step, index, scenarioName, errors, warnings);
        break;
      case 'custom':
        this.validateCustomStep(step, index, scenarioName, errors, warnings);
        break;
      case 'wait':
        this.validateWaitStep(step, index, scenarioName, errors, warnings);
        break;
    }
  }

  private validateRESTStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    if (!step.method) {
      errors.push(`REST step at index ${index} in scenario '${scenarioName}' must have a method`);
    }

    if (!step.path) {
      errors.push(`REST step at index ${index} in scenario '${scenarioName}' must have a path`);
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (step.method && !validMethods.includes(step.method.toUpperCase())) {
      warnings.push(`Unusual HTTP method '${step.method}' in scenario '${scenarioName}'`);
    }
  }

  private validateSOAPStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    if (!step.operation) {
      errors.push(`SOAP step at index ${index} in scenario '${scenarioName}' must have an operation`);
    }
  }

  private validateWebStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    if (!step.action) {
      errors.push(`Web step at index ${index} in scenario '${scenarioName}' must have an action`);
      return;
    }

    if (!step.action.command) {
      errors.push(`Web action at index ${index} in scenario '${scenarioName}' must have a command`);
    }

    const validCommands = ['goto', 'click', 'fill', 'select', 'hover', 'screenshot', 'wait_for_selector', 'wait_for_text', 'evaluate', 'verify_text', 'verify_not_exists', 'verify_exists', 'verify_visible'];
    if (step.action.command && !validCommands.includes(step.action.command)) {
      errors.push(`Invalid web command '${step.action.command}' at index ${index} in scenario '${scenarioName}'`);
    }
  }

  private validateCustomStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    if (!step.script) {
      errors.push(`Custom step at index ${index} in scenario '${scenarioName}' must have a script`);
    }

    if (step.script && step.script.includes('eval(')) {
      warnings.push(`Custom step in scenario '${scenarioName}' uses eval() which may be unsafe`);
    }
  }

  private validateWaitStep(step: any, index: number, scenarioName: string, errors: string[], warnings: string[]): void {
    if (!step.duration) {
      errors.push(`Wait step at index ${index} in scenario '${scenarioName}' must have a duration`);
    }
  }

  private validateOutputs(outputs: any[], errors: string[], warnings: string[]): void {
    const validTypes = ['csv', 'json', 'influxdb', 'graphite', 'webhook'];
    
    outputs.forEach((output, index) => {
      if (!output.type) {
        errors.push(`Output at index ${index} must have a type`);
        return;
      }

      if (!validTypes.includes(output.type)) {
        errors.push(`Invalid output type '${output.type}' at index ${index}`);
      }

      // Type-specific validation
      if (['csv', 'json'].includes(output.type) && !output.file) {
        errors.push(`${output.type.toUpperCase()} output at index ${index} must specify a file`);
      }

      if (['influxdb', 'graphite', 'webhook'].includes(output.type) && !output.url) {
        errors.push(`${output.type} output at index ${index} must specify a URL`);
      }

      if (output.type === 'influxdb' && !output.database) {
        errors.push(`InfluxDB output at index ${index} must specify a database`);
      }
    });

    // Check for duplicate file outputs
    const fileOutputs = outputs.filter(o => o.file);
    const filePaths = fileOutputs.map(o => o.file);
    const duplicates = filePaths.filter((path, index) => filePaths.indexOf(path) !== index);
    
    if (duplicates.length > 0) {
      warnings.push(`Duplicate output files detected: ${duplicates.join(', ')}`);
    }
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
import { TestConfiguration } from './types';
export declare class ConfigValidator {
    validate(config: TestConfiguration): ValidationResult;
    private validateLoadConfig;
    private validateScenarios;
    private validateStep;
    private validateRESTStep;
    private validateSOAPStep;
    private validateWebStep;
    private validateCustomStep;
    private validateWaitStep;
    private validateOutputs;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

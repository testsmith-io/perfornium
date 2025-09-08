export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface ValidationRule {
    field: string;
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    validator?: (value: any) => boolean;
    message?: string;
}

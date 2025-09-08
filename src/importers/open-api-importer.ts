import {ImportableEndpoint, Parameter, RequestBodySchema, ResponseSchema} from "../config/types/import-types";

export class OpenAPIImporter {
    private spec: any;

    constructor(spec: any) {
        this.spec = spec;
    }

    /**
     * Parse OpenAPI spec and extract all available endpoints
     */
    extractEndpoints(): ImportableEndpoint[] {
        const endpoints: ImportableEndpoint[] = [];
        const paths = this.spec.paths || {};

        for (const [path, pathItem] of Object.entries(paths)) {
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

            for (const method of methods) {
                const operation = (pathItem as any)[method];
                if (!operation) continue;

                endpoints.push({
                    id: `${method.toUpperCase()}_${path}`,
                    name: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
                    method: method.toUpperCase(),
                    path: path,
                    description: operation.description,
                    parameters: this.extractParameters(operation, pathItem),
                    requestBody: this.extractRequestBody(operation),
                    responses: this.extractResponses(operation),
                    tags: operation.tags || [],
                    selected: false
                });
            }
        }

        return endpoints;
    }

    /**
     * Generate test scenarios from selected endpoints
     */
    generateScenarios(selectedEndpoints: ImportableEndpoint[]): any[] {
        return selectedEndpoints.map(endpoint => ({
            name: `test_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
            steps: [{
                name: endpoint.name,
                method: endpoint.method,
                path: endpoint.path,
                headers: this.generateHeaders(endpoint),
                json: this.generateRequestBody(endpoint),
                extract: this.generateExtractions(endpoint)
            }]
        }));
    }

    private extractParameters(operation: any, pathItem: any): Parameter[] {
        const params: Parameter[] = [];

        // Operation-level parameters
        if (operation.parameters) {
            params.push(...this.parseParameters(operation.parameters));
        }

        // Path-level parameters
        if (pathItem.parameters) {
            params.push(...this.parseParameters(pathItem.parameters));
        }

        return params;
    }

    private parseParameters(parameters: any[]): Parameter[] {
        return parameters.map(param => ({
            name: param.name,
            in: param.in,
            required: param.required || false,
            type: param.schema?.type || param.type || 'string',
            description: param.description,
            example: param.example || param.schema?.example,
            enum: param.schema?.enum || param.enum
        }));
    }

    private extractRequestBody(operation: any): RequestBodySchema | undefined {
        if (!operation.requestBody) return undefined;

        const content = operation.requestBody.content || {};
        const contentType = Object.keys(content)[0]; // Take first content type

        if (!contentType) return undefined;

        return {
            contentType,
            schema: content[contentType].schema,
            example: content[contentType].example,
            required: operation.requestBody.required || false
        };
    }

    private extractResponses(operation: any): ResponseSchema[] {
        const responses: ResponseSchema[] = [];

        for (const [statusCode, response] of Object.entries(operation.responses || {})) {
            const content = (response as any).content || {};

            for (const [contentType, mediaType] of Object.entries(content)) {
                responses.push({
                    statusCode: parseInt(statusCode),
                    contentType,
                    schema: (mediaType as any).schema,
                    example: (mediaType as any).example
                });
            }
        }

        return responses;
    }

    private generateHeaders(endpoint: ImportableEndpoint): Record<string, string> {
        const headers: Record<string, string> = {};

        endpoint.parameters?.forEach(param => {
            if (param.in === 'header') {
                headers[param.name] = param.example || `{{${param.name}}}`;
            }
        });

        return headers;
    }

    private generateRequestBody(endpoint: ImportableEndpoint): any {
        if (!endpoint.requestBody) return undefined;

        if (endpoint.requestBody.example) {
            return endpoint.requestBody.example;
        }

        // Generate from schema
        return this.generateFromSchema(endpoint.requestBody.schema);
    }

    private generateExtractions(endpoint: ImportableEndpoint): any[] {
        const extractions: any[] = [];

        // Extract common response fields that might be useful for correlation
        endpoint.responses?.forEach(response => {
            if (response.statusCode >= 200 && response.statusCode < 300 && response.schema) {
                const commonFields = ['id', 'token', 'access_token', 'refresh_token', 'sessionId'];

                commonFields.forEach(field => {
                    if (this.schemaHasProperty(response.schema, field)) {
                        extractions.push({
                            name: field,
                            type: 'json_path',
                            expression: `$.${field}`
                        });
                    }
                });
            }
        });

        return extractions;
    }

    private generateFromSchema(schema: any): any {
        if (!schema) return {};

        // Basic schema-to-example generation
        if (schema.example) return schema.example;
        if (schema.properties) {
            const example: any = {};
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                example[prop] = this.generateValueFromSchema(propSchema as any);
            }
            return example;
        }

        return {};
    }

    private generateValueFromSchema(schema: any): any {
        if (schema.example !== undefined) return schema.example;
        if (schema.enum) return schema.enum[0];

        switch (schema.type) {
            case 'string':
                return schema.format === 'email' ? '{{faker.internet.email}}' : '{{faker.lorem.word}}';
            case 'number':
            case 'integer':
                return '{{faker.number.int}}';
            case 'boolean':
                return true;
            case 'array':
                return [this.generateValueFromSchema(schema.items || {})];
            case 'object':
                return this.generateFromSchema(schema);
            default:
                return `{{${schema.type || 'value'}}}`;
        }
    }

    private schemaHasProperty(schema: any, property: string): boolean {
        return schema && schema.properties && schema.properties[property];
    }
}
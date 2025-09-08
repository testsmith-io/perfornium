import {ImportableEndpoint, Parameter, RequestBodySchema} from "../config/types/import-types";

export class HARImporter {
    private har: any;

    constructor(harContent: any) {
        this.har = harContent;
    }

    extractEndpoints(): ImportableEndpoint[] {
        const endpoints: ImportableEndpoint[] = [];
        const entries = this.har.log?.entries || [];

        entries.forEach((entry: any, index: number) => {
            const request = entry.request;
            const response = entry.response;

            // Skip non-API requests (images, CSS, JS, etc.)
            if (!this.isAPIRequest(request)) return;

            endpoints.push({
                id: `har_${index}`,
                name: `${request.method} ${this.extractPath(request.url)}`,
                method: request.method,
                path: this.extractPath(request.url),
                description: `Captured from HAR: ${request.url}`,
                parameters: this.extractParametersFromHAR(request),
                requestBody: this.extractRequestBodyFromHAR(request),
                responses: [{
                    statusCode: response.status,
                    contentType: this.extractContentType(response),
                    schema: null,
                    example: response.content?.text
                }],
                selected: false
            });
        });

        return this.deduplicateEndpoints(endpoints);
    }

    generateScenarios(selectedEndpoints: ImportableEndpoint[]): any[] {
        return selectedEndpoints.map(endpoint => ({
            name: `test_${endpoint.path.replace(/[\/\{\}]/g, '_')}`,
            steps: [{
                name: endpoint.name,
                method: endpoint.method,
                path: endpoint.path,
                headers: this.extractHeadersFromEndpoint(endpoint),
                json: this.parseRequestBody(endpoint.requestBody),
                extract: this.generateHARExtractions(endpoint)
            }]
        }));
    }

    private isAPIRequest(request: any): boolean {
        const url = request.url.toLowerCase();
        const method = request.method.toUpperCase();

        // Skip static resources
        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.gif', '.ico', '.svg', '.woff', '.ttf'];
        if (staticExtensions.some(ext => url.includes(ext))) return false;

        // Include API-like requests
        const apiIndicators = ['/api/', '/v1/', '/v2/', '/graphql', '.json', '.xml'];
        const hasAPIIndicator = apiIndicators.some(indicator => url.includes(indicator));

        // Include non-GET requests to any endpoint
        const isNonGetRequest = method !== 'GET';

        return hasAPIIndicator || isNonGetRequest;
    }

    private extractPath(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname + urlObj.search;
        } catch {
            return url;
        }
    }

    private extractParametersFromHAR(request: any): Parameter[] {
        const params: Parameter[] = [];

        // Query parameters
        request.queryString?.forEach((param: any) => {
            params.push({
                name: param.name,
                in: 'query',
                required: false,
                type: 'string',
                example: param.value
            });
        });

        // Header parameters (excluding standard headers)
        const skipHeaders = ['host', 'user-agent', 'accept', 'accept-encoding', 'connection'];
        request.headers?.forEach((header: any) => {
            if (!skipHeaders.includes(header.name.toLowerCase())) {
                params.push({
                    name: header.name,
                    in: 'header',
                    required: false,
                    type: 'string',
                    example: header.value
                });
            }
        });

        return params;
    }

    private extractRequestBodyFromHAR(request: any): RequestBodySchema | undefined {
        const postData = request.postData;
        if (!postData) return undefined;

        return {
            contentType: postData.mimeType || 'application/json',
            schema: null,
            example: postData.text,
            required: true
        };
    }

    private extractContentType(response: any): string {
        const contentTypeHeader = response.headers?.find((h: any) =>
            h.name.toLowerCase() === 'content-type'
        );
        return contentTypeHeader?.value || 'application/json';
    }

    private deduplicateEndpoints(endpoints: ImportableEndpoint[]): ImportableEndpoint[] {
        const seen = new Set<string>();
        return endpoints.filter(endpoint => {
            const key = `${endpoint.method}_${endpoint.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private extractHeadersFromEndpoint(endpoint: ImportableEndpoint): Record<string, string> {
        const headers: Record<string, string> = {};

        endpoint.parameters?.forEach(param => {
            if (param.in === 'header') {
                headers[param.name] = param.example || `{{${param.name}}}`;
            }
        });

        return headers;
    }

    private parseRequestBody(requestBody?: RequestBodySchema): any {
        if (!requestBody?.example) return undefined;

        try {
            return JSON.parse(requestBody.example);
        } catch {
            return requestBody.example;
        }
    }

    private generateHARExtractions(endpoint: ImportableEndpoint): any[] {
        // Generate common extractions based on response patterns
        const extractions: any[] = [];

        endpoint.responses?.forEach(response => {
            if (response.example) {
                try {
                    const parsed = JSON.parse(response.example);
                    const commonFields = ['id', 'token', 'access_token', 'sessionId'];

                    commonFields.forEach(field => {
                        if (this.hasField(parsed, field)) {
                            extractions.push({
                                name: field,
                                type: 'json_path',
                                expression: `$.${field}`
                            });
                        }
                    });
                } catch {
                    // Not JSON, skip extraction generation
                }
            }
        });

        return extractions;
    }

    private hasField(obj: any, field: string): boolean {
        return obj && typeof obj === 'object' && field in obj;
    }
}
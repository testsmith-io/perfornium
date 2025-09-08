import { ImportableEndpoint } from "../config/types/import-types";
export declare class OpenAPIImporter {
    private spec;
    constructor(spec: any);
    /**
     * Parse OpenAPI spec and extract all available endpoints
     */
    extractEndpoints(): ImportableEndpoint[];
    /**
     * Generate test scenarios from selected endpoints
     */
    generateScenarios(selectedEndpoints: ImportableEndpoint[]): any[];
    private extractParameters;
    private parseParameters;
    private extractRequestBody;
    private extractResponses;
    private generateHeaders;
    private generateRequestBody;
    private generateExtractions;
    private generateFromSchema;
    private generateValueFromSchema;
    private schemaHasProperty;
}

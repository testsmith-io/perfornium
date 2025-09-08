import { ImportableEndpoint } from "../config/types/import-types";
export declare class HARImporter {
    private har;
    constructor(harContent: any);
    extractEndpoints(): ImportableEndpoint[];
    generateScenarios(selectedEndpoints: ImportableEndpoint[]): any[];
    private isAPIRequest;
    private extractPath;
    private extractParametersFromHAR;
    private extractRequestBodyFromHAR;
    private extractContentType;
    private deduplicateEndpoints;
    private extractHeadersFromEndpoint;
    private parseRequestBody;
    private generateHARExtractions;
    private hasField;
}

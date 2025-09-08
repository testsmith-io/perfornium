import { ImportableEndpoint } from "../config/types/import-types";
interface SoapVersion {
    version: string;
    bindingName: string;
    description: string;
}
export declare class WSDLImporter {
    private wsdlContent;
    private selectedSoapVersions;
    constructor(wsdlContent: string);
    detectSoapVersions(): SoapVersion[];
    setSoapVersions(versions: string[]): void;
    extractServices(): ImportableEndpoint[];
    generateOutputFilename(baseFilename: string): string;
    generateScenarios(selectedServices: ImportableEndpoint[]): any[];
    getWsdlUrl(selectedServices: ImportableEndpoint[]): string;
    private extractServiceElements;
    private extractPortElements;
    private extractEndpointFromPort;
    private isBindingVersionSelected;
    private getSoapVersionFromBinding;
    private extractOperationsFromBinding;
    private extractSoapAction;
    private getOperationDocumentation;
    private parseSchemaElement;
    private mapXsdType;
    private createImportableEndpoint;
    private getContentType;
    private getResponseContentType;
    private generateSOAPParameters;
    private generateSOAPExample;
    private generateSOAPResponseExample;
    private generateSampleParameters;
    private getSampleValue;
    private generateArgsFromSchema;
    private extractWsdlUrl;
    private generateSOAPExtractions;
    private getPathFromUrl;
    private getTargetNamespace;
    private extractAttribute;
}
export {};

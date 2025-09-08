import {ImportableEndpoint} from "../config/types/import-types";
import * as fs from 'fs';
import * as path from 'path';

interface SoapVersion {
    version: string;
    bindingName: string;
    description: string;
}

interface WSDLOperation {
    name: string;
    soapAction: string;
    documentation?: string;
    inputSchema: any;
    outputSchema: any;
}

export class WSDLImporter {
    private wsdlContent: string;
    private selectedSoapVersions: string[] = [];

    constructor(wsdlContent: string) {
        this.wsdlContent = wsdlContent;
    }

    detectSoapVersions(): SoapVersion[] {
        const versions: SoapVersion[] = [];

        // Find SOAP 1.1 bindings
        const soap11BindingRegex = /<wsdl:binding[^>]*name="([^"]*)"[^>]*>[\s\S]*?<soap:binding[^>]*>[\s\S]*?<\/wsdl:binding>/g;
        let soap11Match: RegExpExecArray | null;
        while ((soap11Match = soap11BindingRegex.exec(this.wsdlContent)) !== null) {
            if (!versions.some(v => v.bindingName === soap11Match![1])) {
                versions.push({
                    version: '1.1',
                    bindingName: soap11Match[1],
                    description: 'SOAP 1.1 (Legacy, widely supported)'
                });
            }
        }

        // Find SOAP 1.2 bindings
        const soap12BindingRegex = /<wsdl:binding[^>]*name="([^"]*)"[^>]*>[\s\S]*?<soap12:binding[^>]*>[\s\S]*?<\/wsdl:binding>/g;
        let soap12Match: RegExpExecArray | null;
        while ((soap12Match = soap12BindingRegex.exec(this.wsdlContent)) !== null) {
            if (!versions.some(v => v.bindingName === soap12Match![1])) {
                versions.push({
                    version: '1.2',
                    bindingName: soap12Match[1],
                    description: 'SOAP 1.2 (Modern, more features)'
                });
            }
        }

        return versions;
    }

    setSoapVersions(versions: string[]): void {
        this.selectedSoapVersions = versions;
    }

    extractServices(): ImportableEndpoint[] {
        const services: ImportableEndpoint[] = [];

        try {
            const serviceElements = this.extractServiceElements();

            for (const serviceElement of serviceElements) {
                const serviceName = this.extractAttribute(serviceElement.content, 'name') || 'UnknownService';
                const ports = this.extractPortElements(serviceElement.content);

                for (const port of ports) {
                    const bindingName = this.extractAttribute(port.content, 'binding')?.replace('tns:', '') || '';

                    if (!this.isBindingVersionSelected(bindingName)) {
                        continue;
                    }

                    const endpoint = this.extractEndpointFromPort(port.content);
                    const soapVersion = this.getSoapVersionFromBinding(bindingName);
                    const operations = this.extractOperationsFromBinding(bindingName);

                    for (const operation of operations) {
                        services.push(this.createImportableEndpoint({
                            serviceName,
                            bindingName,
                            endpoint,
                            soapVersion,
                            operation
                        }));
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing WSDL:', error);
        }

        return services;
    }

    generateOutputFilename(baseFilename: string): string {
        if (!fs.existsSync(baseFilename)) {
            return baseFilename;
        }

        const ext = path.extname(baseFilename);
        const nameWithoutExt = path.basename(baseFilename, ext);
        const dir = path.dirname(baseFilename);

        let counter = 1;
        let newFilename: string;

        do {
            newFilename = path.join(dir, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
        } while (fs.existsSync(newFilename));

        return newFilename;
    }

    generateScenarios(selectedServices: ImportableEndpoint[]): any[] {
        return selectedServices.map(service => {
            const operationName = service.name.split('.').pop() || 'Unknown';
            const args = this.generateArgsFromSchema(service.requestBody?.schema);
            const soapVersion = service.tags?.find(tag => tag.startsWith('SOAP-'))?.replace('SOAP-', '') || '1.1';

            return {
                name: `test_${service.name.toLowerCase().replace(/\./g, '_')}`,
                steps: [{
                    name: service.name,
                    type: 'soap',
                    operation: operationName,
                    args: args,
                    body: service.requestBody?.example || this.generateSOAPExample(operationName, service.requestBody?.schema, soapVersion),
                    extract: this.generateSOAPExtractions(operationName)
                }]
            };
        });
    }

    getWsdlUrl(selectedServices: ImportableEndpoint[]): string {
        return selectedServices.length > 0 ? this.extractWsdlUrl(selectedServices[0]) : '';
    }

    // Private helper methods

    private extractServiceElements(): Array<{name: string, content: string}> {
        const serviceRegex = /<wsdl:service[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/wsdl:service>/g;
        const services: Array<{name: string, content: string}> = [];
        let serviceMatch: RegExpExecArray | null;

        while ((serviceMatch = serviceRegex.exec(this.wsdlContent)) !== null) {
            services.push({
                name: serviceMatch[1],
                content: serviceMatch[2]
            });
        }

        return services;
    }

    private extractPortElements(serviceContent: string): Array<{name: string, content: string}> {
        const portRegex = /<wsdl:port[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/wsdl:port>/g;
        const ports: Array<{name: string, content: string}> = [];
        let portMatch: RegExpExecArray | null;

        while ((portMatch = portRegex.exec(serviceContent)) !== null) {
            ports.push({
                name: portMatch[1],
                content: portMatch[0] // Include the full port element
            });
        }

        return ports;
    }

    private extractEndpointFromPort(portContent: string): string {
        const soapAddressMatch = portContent.match(/location="([^"]*)"/);
        return soapAddressMatch ? soapAddressMatch[1] : '/soap';
    }

    private isBindingVersionSelected(bindingName: string): boolean {
        if (this.selectedSoapVersions.length === 0) {
            return true;
        }

        const soapVersion = this.getSoapVersionFromBinding(bindingName);
        return this.selectedSoapVersions.includes(soapVersion);
    }

    private getSoapVersionFromBinding(bindingName: string): string {
        const bindingRegex = new RegExp(`<wsdl:binding[^>]*name="${bindingName}"[^>]*>([\\s\\S]*?)<\\/wsdl:binding>`, 'i');
        const bindingMatch = this.wsdlContent.match(bindingRegex);

        if (bindingMatch && bindingMatch[1].includes('soap12:binding')) {
            return '1.2';
        }
        return '1.1';
    }

    private extractOperationsFromBinding(bindingName: string): WSDLOperation[] {
        const bindingRegex = new RegExp(`<wsdl:binding[^>]*name="${bindingName}"[^>]*>([\\s\\S]*?)<\\/wsdl:binding>`, 'i');
        const bindingMatch = this.wsdlContent.match(bindingRegex);

        if (!bindingMatch) return [];

        const operations: WSDLOperation[] = [];
        const operationRegex = /<wsdl:operation[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/wsdl:operation>/g;
        let operationMatch: RegExpExecArray | null;

        while ((operationMatch = operationRegex.exec(bindingMatch[1])) !== null) {
            const operationName = operationMatch[1];
            const operationContent = operationMatch[2];

            const soapAction = this.extractSoapAction(operationContent);
            const documentation = this.getOperationDocumentation(operationName);
            const inputSchema = this.parseSchemaElement(operationName);
            const outputSchema = this.parseSchemaElement(`${operationName}Response`);

            operations.push({
                name: operationName,
                soapAction,
                documentation,
                inputSchema,
                outputSchema
            });
        }

        return operations;
    }

    private extractSoapAction(operationContent: string): string {
        const soapActionMatch = operationContent.match(/soapAction="([^"]*)"/);
        return soapActionMatch ? soapActionMatch[1] : '';
    }

    private getOperationDocumentation(operationName: string): string | undefined {
        const operationRegex = new RegExp(`<wsdl:operation[^>]*name="${operationName}"[^>]*>([\\s\\S]*?)<\\/wsdl:operation>`, 'i');
        const operationMatch = this.wsdlContent.match(operationRegex);

        if (operationMatch) {
            const docMatch = operationMatch[1].match(/<wsdl:documentation[^>]*>([\s\S]*?)<\/wsdl:documentation>/i);
            return docMatch ? docMatch[1].trim() : undefined;
        }

        return undefined;
    }

    private parseSchemaElement(elementName: string): any {
        const elementRegex = new RegExp(`<s:element[^>]*name="${elementName}"[^>]*>([\\s\\S]*?)<\\/s:element>`, 'i');
        const elementMatch = this.wsdlContent.match(elementRegex);

        if (!elementMatch) return { type: 'object', properties: {} };

        const sequenceMatch = elementMatch[1].match(/<s:sequence[^>]*>([\s\S]*?)<\/s:sequence>/i);
        if (!sequenceMatch) return { type: 'object', properties: {} };

        const fields: any = {};
        const fieldRegex = /<s:element[^>]*name="([^"]*)"[^>]*type="([^"]*)"[^>]*minOccurs="([^"]*)"[^>]*\/?>|<s:element[^>]*name="([^"]*)"[^>]*type="([^"]*)"[^>]*>/g;
        let fieldMatch: RegExpExecArray | null;

        while ((fieldMatch = fieldRegex.exec(sequenceMatch[1])) !== null) {
            const name = fieldMatch[1] || fieldMatch[4];
            const type = fieldMatch[2] || fieldMatch[5];
            const minOccurs = fieldMatch[3];

            if (name && type) {
                fields[name] = {
                    type: this.mapXsdType(type),
                    required: minOccurs === '1',
                    description: `${name} parameter`
                };
            }
        }

        return { type: 'object', properties: fields };
    }

    private mapXsdType(xsdType: string): string {
        const typeMap: Record<string, string> = {
            's:int': 'integer',
            's:string': 'string',
            's:double': 'number',
            's:float': 'number',
            's:boolean': 'boolean',
            's:dateTime': 'string'
        };
        return typeMap[xsdType] || 'string';
    }

    private createImportableEndpoint(config: {
        serviceName: string;
        bindingName: string;
        endpoint: string;
        soapVersion: string;
        operation: WSDLOperation;
    }): ImportableEndpoint {
        const { serviceName, bindingName, endpoint, soapVersion, operation } = config;

        return {
            id: `${serviceName}_${bindingName}_${operation.name}_${soapVersion}`,
            name: `${serviceName}.${operation.name}`,
            method: 'POST',
            path: this.getPathFromUrl(endpoint),
            description: `${operation.documentation || `${operation.name} operation`} (SOAP ${soapVersion})`,
            requestBody: {
                contentType: this.getContentType(soapVersion),
                schema: operation.inputSchema,
                example: this.generateSOAPExample(operation.name, operation.inputSchema, soapVersion),
                required: true
            },
            responses: [{
                statusCode: 200,
                contentType: this.getResponseContentType(soapVersion),
                schema: operation.outputSchema,
                example: this.generateSOAPResponseExample(operation.name, operation.outputSchema, soapVersion)
            }],
            parameters: this.generateSOAPParameters(operation.soapAction, soapVersion),
            tags: ['SOAP', serviceName, `SOAP-${soapVersion}`],
            selected: false
        };
    }

    private getContentType(soapVersion: string): string {
        return soapVersion === '1.2'
            ? 'application/soap+xml; charset=utf-8'
            : 'text/xml; charset=utf-8';
    }

    private getResponseContentType(soapVersion: string): string {
        return soapVersion === '1.2' ? 'application/soap+xml' : 'text/xml';
    }

    private generateSOAPParameters(soapAction: string, soapVersion: string): any[] {
        if (soapVersion === '1.2') {
            return [{
                name: 'Content-Type',
                in: 'header',
                required: true,
                type: 'string',
                description: 'SOAP 1.2 Content Type with action',
                example: `application/soap+xml; charset=utf-8; action="${soapAction}"`
            }];
        } else {
            return [{
                name: 'SOAPAction',
                in: 'header',
                required: true,
                type: 'string',
                description: 'SOAP 1.1 Action header',
                example: `"${soapAction}"`
            }];
        }
    }

    private generateSOAPExample(operationName: string, schema: any, soapVersion: string): string {
        const targetNamespace = this.getTargetNamespace();
        const params = this.generateSampleParameters(schema);

        if (soapVersion === '1.2') {
            return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${operationName} xmlns="${targetNamespace}">
      ${params}
    </${operationName}>
  </soap12:Body>
</soap12:Envelope>`;
        } else {
            return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operationName} xmlns="${targetNamespace}">
      ${params}
    </${operationName}>
  </soap:Body>
</soap:Envelope>`;
        }
    }

    private generateSOAPResponseExample(operationName: string, schema: any, soapVersion: string): string {
        const targetNamespace = this.getTargetNamespace();
        const responseParams = this.generateSampleParameters(schema);
        const responseElementName = `${operationName}Response`;

        if (soapVersion === '1.2') {
            return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${responseElementName} xmlns="${targetNamespace}">
      ${responseParams}
    </${responseElementName}>
  </soap12:Body>
</soap12:Envelope>`;
        } else {
            return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${responseElementName} xmlns="${targetNamespace}">
      ${responseParams}
    </${responseElementName}>
  </soap:Body>
</soap:Envelope>`;
        }
    }

    private generateSampleParameters(schema: any): string {
        if (!schema?.properties) return '';

        return Object.entries(schema.properties)
            .map(([name, prop]: [string, any]) => {
                const sampleValue = this.getSampleValue(prop.type);
                return `<${name}>${sampleValue}</${name}>`;
            })
            .join('\n      ');
    }

    private getSampleValue(type: string): string | number {
        switch (type) {
            case 'integer': return 1;
            case 'number': return 1.0;
            case 'boolean': return 'true';
            default: return 'sample';
        }
    }

    private generateArgsFromSchema(schema: any): any {
        if (!schema?.properties) return {};

        const args: any = {};
        Object.entries(schema.properties).forEach(([name, prop]: [string, any]) => {
            args[name] = this.getSampleValue(prop.type);
        });

        return args;
    }

    private extractWsdlUrl(service: ImportableEndpoint): string {
        // Extract base URL from path and construct WSDL URL
        const basePath = service.path.replace('.asmx', '');
        return `http://www.dneonline.com${basePath}.asmx?wsdl`;
    }

    private generateSOAPExtractions(operationName: string): any[] {
        return [
            {
                name: 'soap_fault',
                type: 'regex',
                expression: '<soap:Fault[^>]*>([\\s\\S]*?)</soap:Fault>',
                optional: true
            },
            {
                name: `${operationName.toLowerCase()}_result`,
                type: 'regex',
                expression: `<${operationName}Result[^>]*>([^<]*)</${operationName}Result>`
            }
        ];
    }

    private getPathFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            const pathMatch = url.match(/^https?:\/\/[^\/]+(.*)$/);
            return pathMatch ? pathMatch[1] : '/calculator.asmx';
        }
    }

    private getTargetNamespace(): string {
        const namespaceMatch = this.wsdlContent.match(/targetNamespace="([^"]*)"/);
        return namespaceMatch ? namespaceMatch[1] : 'http://tempuri.org/';
    }

    private extractAttribute(xmlString: string, attributeName: string): string | null {
        const regex = new RegExp(`${attributeName}="([^"]*)"`, 'i');
        const match = xmlString.match(regex);
        return match ? match[1] : null;
    }
}
interface ImportOptions {
    output: string;
    format: 'yaml' | 'json';
    verbose?: boolean;
    interactive?: boolean;
    autoCorrelate?: boolean;
    baseUrl?: string;
    tags?: string;
    excludeTags?: string;
    paths?: string;
    methods?: string;
    filterDomains?: string;
    excludeDomains?: string;
    services?: string;
    operations?: string;
    folders?: string;
    scenariosPerFile?: string;
    confidence?: string;
    [key: string]: any;
}
export declare function importCommand(type: 'openapi' | 'wsdl' | 'har' | 'postman', sourceFile: string, options: ImportOptions): Promise<void>;
export {};

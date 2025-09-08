export interface ImportableEndpoint {
    id: string;
    name: string;
    method: string;
    path: string;
    description?: string;
    parameters?: Parameter[];
    requestBody?: RequestBodySchema;
    responses?: ResponseSchema[];
    tags?: string[];
    selected?: boolean;
}
export interface Parameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required: boolean;
    type: string;
    description?: string;
    example?: any;
    enum?: any[];
}
export interface RequestBodySchema {
    contentType: string;
    schema: any;
    example?: any;
    required: boolean;
}
export interface ResponseSchema {
    statusCode: number;
    contentType: string;
    schema: any;
    example?: any;
}

import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, RESTStep, DebugConfig } from '../../config/types';
export declare class RESTHandler implements ProtocolHandler {
    private axiosInstance;
    private debugConfig?;
    constructor(baseURL?: string, defaultHeaders?: Record<string, string>, timeout?: number, debugConfig?: DebugConfig);
    execute(request: RESTStep, context: VUContext): Promise<ProtocolResult>;
    private prepareRequestConfig;
    /**
     * Check if Content-Type header is already set (case-insensitive)
     */
    private hasContentTypeHeader;
    /**
     * Process body payload and detect content type
     */
    private processBodyPayload;
    /**
     * Detect if string is valid JSON
     */
    private isJsonString;
    /**
     * Detect if string is XML
     */
    private isXmlString;
    /**
     * Check if body contains template expressions
     */
    private isTemplateString;
    /**
     * Detect content type from template file extension or content
     */
    private detectTemplateContentType;
    private createSuccessResult;
    private handleError;
    private addDetailedInfo;
    private logRequestDetails;
    private logResponseDetails;
    private runChecksOptimized;
    private buildURL;
    private getResponseText;
    private getJsonPathOptimized;
    private flattenHeaders;
    private truncateIfNeeded;
    private shouldCaptureDetails;
}

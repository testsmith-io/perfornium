import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, SOAPStep } from '../../config/types';
export declare class SOAPHandler implements ProtocolHandler {
    private client;
    private wsdlUrl;
    constructor(wsdlUrl: string);
    initialize(): Promise<void>;
    execute(operation: SOAPStep, context: VUContext): Promise<ProtocolResult>;
    private executeRawSOAP;
    private extractSOAPActionFromXML;
    private parseSOAPResponse;
}

import { ProtocolHandler, ProtocolResult } from '../base';
import { VUContext, WebAction, BrowserConfig } from '../../config/types';
export declare class WebHandler implements ProtocolHandler {
    private browsers;
    private contexts;
    private pages;
    private config;
    constructor(config: BrowserConfig);
    initialize(): Promise<void>;
    execute(action: WebAction, context: VUContext): Promise<ProtocolResult>;
    private getPage;
    private createBrowserForVU;
    private parseTimeString;
    cleanup(): Promise<void>;
    getBrowserInfo(vuId: number): {
        connected: boolean;
    } | null;
    getActiveVUCount(): number;
    /**
     * Clean up browser resources for a specific VU
     */
    cleanupVU(vuId: number): Promise<void>;
}

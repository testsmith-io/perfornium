import { LoadPattern, VUFactory } from './base';
export declare class BasicPattern implements LoadPattern {
    execute(config: any, vuFactory: VUFactory): Promise<void>;
    private createVU;
    private runVUOnce;
    private runVUForDuration;
}

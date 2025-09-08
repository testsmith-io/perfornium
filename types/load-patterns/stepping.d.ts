import { LoadPattern, VUFactory } from './base';
export declare class SteppingPattern implements LoadPattern {
    execute(config: any, vuFactory: VUFactory): Promise<void>;
    private createVU;
    private runVUForDuration;
}

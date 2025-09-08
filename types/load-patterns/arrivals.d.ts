import { LoadPattern, VUFactory } from './base';
export declare class ArrivalsPattern implements LoadPattern {
    execute(config: any, vuFactory: VUFactory): Promise<void>;
    private createAndRunVU;
    private createVU;
    private runVUForDuration;
}

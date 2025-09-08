import { Step, VUContext } from '../config/types';
import { ProtocolHandler } from '../protocols/base';
import { TestResult } from '../metrics/types';
export declare class StepExecutor {
    private handlers;
    private templateProcessor;
    private testName;
    constructor(handlers: Map<string, ProtocolHandler>, testName?: string);
    executeStep(step: Step, context: VUContext, scenarioName: string): Promise<TestResult>;
    executeStepInternal(step: Step, context: VUContext, scenarioName: string, startTime: number): Promise<TestResult>;
    private shouldRecordStep;
    private executeRESTStep;
    private executeSOAPStep;
    private executeWebStep;
    private executeCustomStep;
    private executeWaitStep;
    private executeScript;
    private evaluateCondition;
    private processTemplate;
    private runChecks;
    private checkCustom;
    private extractData;
    private extractCustom;
    private getJsonPath;
}

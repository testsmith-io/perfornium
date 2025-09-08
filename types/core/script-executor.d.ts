import { HookScript, ScriptContext, ScriptResult } from '../config/types/hooks';
export declare class ScriptExecutor {
    private static baseDir;
    private static scriptCache;
    private static stepExecutor?;
    static setStepExecutor(stepExecutor: any): void;
    static setBaseDir(dir: string): void;
    static createContext(testName: string, vuId: number, variables: Record<string, any>, extractedData: Record<string, any>, csvData?: Record<string, any>, additionalContext?: Partial<ScriptContext>): ScriptContext;
    static executeHookScript(script: HookScript, context: ScriptContext, hookName: string): Promise<ScriptResult>;
    private static executeInlineScript;
    private static executeFileScript;
    private static executeStepsScript;
    private static transpileTypeScript;
    static clearCache(): void;
}

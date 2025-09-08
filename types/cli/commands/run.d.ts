export declare function runCommand(configPath: string, options: {
    env?: string;
    workers?: string;
    output?: string;
    report?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
    maxUsers?: string;
}): Promise<void>;

export declare function distributedCommand(configPath: string, options: {
    workers?: string;
    workersFile?: string;
    strategy?: string;
    syncStart?: boolean;
    env?: string;
    output?: string;
    report?: boolean;
    verbose?: boolean;
}): Promise<void>;

interface RecordOptions {
    output?: string;
    viewport?: string;
    baseUrl?: string;
}
export declare function recordCommand(url: string, options?: RecordOptions): Promise<void>;
export {};

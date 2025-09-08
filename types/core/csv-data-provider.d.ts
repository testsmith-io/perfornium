export interface CSVDataConfig {
    file: string;
    delimiter?: string;
    encoding?: BufferEncoding;
    skipEmptyLines?: boolean;
    skipFirstLine?: boolean;
    columns?: string[];
    filter?: string;
    randomize?: boolean;
    cycleOnExhaustion?: boolean;
}
export interface CSVDataRow {
    [key: string]: string | number | boolean;
}
export declare class CSVDataProvider {
    private static instances;
    private static baseDir;
    private filePath;
    private data;
    private originalData;
    private currentIndex;
    private config;
    private isLoaded;
    private isExhausted;
    private globalIndex;
    private accessCount;
    private constructor();
    static getInstance(config: CSVDataConfig): CSVDataProvider;
    static setBaseDir(dir: string): void;
    loadData(): Promise<void>;
    /**
     * Enhanced getNextRow - returns null when exhausted if cycleOnExhaustion is false
     */
    getNextRow(vuId: number): Promise<CSVDataRow | null>;
    /**
     * Enhanced getUniqueRow - returns null when exhausted if cycleOnExhaustion is false
     */
    getUniqueRow(vuId: number): Promise<CSVDataRow | null>;
    /**
     * Enhanced getRandomRow - returns null when exhausted if cycleOnExhaustion is false
     */
    getRandomRow(vuId?: number): Promise<CSVDataRow | null>;
    getAllRows(): Promise<CSVDataRow[]>;
    getRowCount(): Promise<number>;
    isDataExhausted(): boolean;
    reset(): void;
    private filterData;
    private shuffleArray;
    static clearInstances(): void;
}

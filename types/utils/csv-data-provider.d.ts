export interface CSVDataConfig {
    file: string;
    delimiter?: string;
    encoding?: string;
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
    private constructor();
    /**
     * Get or create CSV data provider instance
     */
    static getInstance(config: CSVDataConfig): CSVDataProvider;
    /**
     * Set base directory for CSV files
     */
    static setBaseDir(dir: string): void;
    /**
     * Load CSV data if not already loaded
     */
    loadData(): Promise<void>;
    /**
     * Get next data row for a VU
     */
    getNextRow(vuId: number): Promise<CSVDataRow | null>;
    /**
     * Get unique data row for a VU (each VU gets different data)
     */
    getUniqueRow(vuId: number): Promise<CSVDataRow | null>;
    /**
     * Get random row
     */
    getRandomRow(): Promise<CSVDataRow | null>;
    /**
     * Get all data
     */
    getAllRows(): Promise<CSVDataRow[]>;
    /**
     * Get row count
     */
    getRowCount(): Promise<number>;
    /**
     * Reset data provider state
     */
    reset(): void;
    /**
     * Filter data based on simple expression
     */
    private filterData;
    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    private shuffleArray;
    /**
     * Clear all instances (for testing)
     */
    static clearInstances(): void;
}

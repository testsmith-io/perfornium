// Primary exports
export { DataProvider, DataRow, DataResult, CheckedOutRow } from './data-provider';
export { DataManager, DataOptions, DataContext } from './data-manager';

// Backward compatibility aliases
export { DataProvider as EnhancedDataProvider } from './data-provider';
export { DataManager as EnhancedDataManager } from './data-manager';
export { DataOptions as EnhancedCSVOptions } from './data-manager';
export { DataOptions as GlobalCSVOptions } from './data-manager';
export type { DataRow as CSVDataRow } from './data-provider';
export type { DataContext as CSVContext } from './data-manager';

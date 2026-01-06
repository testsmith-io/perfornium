import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CSVDataProvider } from '../../../src/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CSVDataProvider', () => {
  let tempDir: string;
  let testCsvPath: string;
  let testCounter = 0;

  beforeEach(() => {
    testCounter++;
    // Create a temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `csv-test-${testCounter}-`));
    testCsvPath = path.join(tempDir, `test-${testCounter}.csv`);

    // Set base directory for CSVDataProvider
    CSVDataProvider.setBaseDir(tempDir);
  });

  afterEach(() => {
    // Clean up temp files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getInstance()', () => {
    it('should create a new CSVDataProvider instance', () => {
      fs.writeFileSync(testCsvPath, 'name,email\nJohn,john@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      expect(provider).toBeInstanceOf(CSVDataProvider);
    });

    it('should return the same instance for same config', () => {
      fs.writeFileSync(testCsvPath, 'name,email\nJohn,john@test.com\n');

      const provider1 = CSVDataProvider.getInstance({ file: `test-${testCounter}.csv` });
      const provider2 = CSVDataProvider.getInstance({ file: `test-${testCounter}.csv` });

      expect(provider1).toBe(provider2);
    });
  });

  describe('loadData()', () => {
    it('should load CSV file successfully', async () => {
      fs.writeFileSync(testCsvPath, 'name,email\nJohn,john@test.com\nJane,jane@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();

      // Verify data loaded by getting a row
      const row = await provider.getNextRow(1);
      expect(row).toBeDefined();
      expect(row).not.toBeNull();
    });

    it('should parse headers correctly', async () => {
      fs.writeFileSync(testCsvPath, 'firstName,lastName,email\nJohn,Doe,john@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data).toHaveProperty('firstName');
      expect(data).toHaveProperty('lastName');
      expect(data).toHaveProperty('email');
    });

    it('should throw error for non-existent file', async () => {
      const provider = CSVDataProvider.getInstance({
        file: 'non-existent-file.csv'
      });

      await expect(provider.loadData()).rejects.toThrow();
    });
  });

  describe('getNextRow()', () => {
    it('should return row data', async () => {
      fs.writeFileSync(testCsvPath, 'id,name\n1,Alice\n2,Bob\n3,Charlie\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();

      const row = await provider.getNextRow(1);
      expect(row).toBeDefined();
      expect(row?.name).toBeDefined();
    });

    it('should return null for empty CSV', async () => {
      fs.writeFileSync(testCsvPath, 'id,name\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();

      const row = await provider.getNextRow(1);
      expect(row).toBeNull();
    });
  });

  describe('getUniqueRow()', () => {
    it('should return unique row for each call', async () => {
      fs.writeFileSync(testCsvPath, 'id,name\n1,Alice\n2,Bob\n3,Charlie\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();

      const data1 = await provider.getUniqueRow(1);
      const data2 = await provider.getUniqueRow(2);
      const data3 = await provider.getUniqueRow(3);

      expect(data1?.name).toBe('Alice');
      expect(data2?.name).toBe('Bob');
      expect(data3?.name).toBe('Charlie');
    });
  });

  describe('getRandomRow()', () => {
    it('should return a row from the data', async () => {
      fs.writeFileSync(testCsvPath, 'id,name\n1,Alice\n2,Bob\n3,Charlie\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();

      const data = await provider.getRandomRow(1);
      expect(data).toBeDefined();
      expect(['Alice', 'Bob', 'Charlie']).toContain(data?.name);
    });
  });

  describe('setBaseDir()', () => {
    it('should set base directory for file resolution', () => {
      const customDir = '/custom/path';
      CSVDataProvider.setBaseDir(customDir);

      // This test just verifies no error is thrown
      expect(true).toBe(true);

      // Reset to temp dir for other tests
      CSVDataProvider.setBaseDir(tempDir);
    });
  });

  describe('CSV parsing options', () => {
    it('should handle custom delimiter', async () => {
      fs.writeFileSync(testCsvPath, 'id;name;email\n1;Alice;alice@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`,
        delimiter: ';'
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data?.name).toBe('Alice');
      expect(data?.email).toBe('alice@test.com');
    });

    it('should handle quoted fields', async () => {
      fs.writeFileSync(testCsvPath, 'id,name,description\n1,"John Doe","A, complex description"\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data?.name).toBe('John Doe');
      expect(data?.description).toBe('A, complex description');
    });

    it('should handle empty fields', async () => {
      fs.writeFileSync(testCsvPath, 'id,name,email\n1,,john@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data?.id).toBe(1);
      // Empty fields are parsed as null by the CSV parser
      expect(data?.name).toBeNull();
      expect(data?.email).toBe('john@test.com');
    });

    it('should handle headers with spaces', async () => {
      fs.writeFileSync(testCsvPath, 'First Name,Last Name,Email Address\nJohn,Doe,john@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data?.['First Name']).toBe('John');
      expect(data?.['Last Name']).toBe('Doe');
      expect(data?.['Email Address']).toBe('john@test.com');
    });
  });

  describe('variable mapping', () => {
    it('should map CSV columns to custom variable names', async () => {
      fs.writeFileSync(testCsvPath, 'user_name,user_email\nJohn,john@test.com\n');

      const provider = CSVDataProvider.getInstance({
        file: `test-${testCounter}.csv`,
        variables: {
          'user_name': 'name',
          'user_email': 'email'
        }
      });

      await provider.loadData();
      const data = await provider.getNextRow(1);

      expect(data?.name).toBe('John');
      expect(data?.email).toBe('john@test.com');
    });
  });
});

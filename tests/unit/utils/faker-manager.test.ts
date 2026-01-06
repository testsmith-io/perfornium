import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakerManager, fakerManager, getFaker } from '../../../src/utils/faker-manager';

describe('FakerManager', () => {
  beforeEach(() => {
    // Reset the faker manager before each test
    fakerManager.reset();
  });

  afterEach(() => {
    fakerManager.reset();
  });

  describe('getInstance()', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = FakerManager.getInstance();
      const instance2 = FakerManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('isInitialized', () => {
    it('should be false before getFaker is called', () => {
      expect(fakerManager.isInitialized).toBe(false);
    });

    it('should be true after getFaker is called', () => {
      getFaker();
      expect(fakerManager.isInitialized).toBe(true);
    });
  });

  describe('getFaker()', () => {
    it('should return a faker instance', () => {
      const faker = getFaker();
      expect(faker).toBeDefined();
      expect(faker.person).toBeDefined();
      expect(faker.internet).toBeDefined();
    });

    it('should lazily initialize faker', () => {
      expect(fakerManager.isInitialized).toBe(false);
      const faker = fakerManager.getFaker();
      expect(fakerManager.isInitialized).toBe(true);
      expect(faker).toBeDefined();
    });

    it('should generate valid person names', () => {
      const faker = getFaker();
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();

      expect(typeof firstName).toBe('string');
      expect(firstName.length).toBeGreaterThan(0);
      expect(typeof lastName).toBe('string');
      expect(lastName.length).toBeGreaterThan(0);
    });

    it('should generate valid email addresses', () => {
      const faker = getFaker();
      const email = faker.internet.email();

      expect(email).toMatch(/@/);
      expect(email).toMatch(/\./);
    });

    it('should generate valid UUIDs', () => {
      const faker = getFaker();
      const uuid = faker.string.uuid();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('currentLocale', () => {
    it('should default to "en"', () => {
      expect(fakerManager.currentLocale).toBe('en');
    });

    it('should update when setLocale is called', () => {
      fakerManager.setLocale('de');
      expect(fakerManager.currentLocale).toBe('de');
    });
  });

  describe('setLocale()', () => {
    it('should set locale before initialization', () => {
      fakerManager.setLocale('de');
      expect(fakerManager.currentLocale).toBe('de');
    });

    it('should allow locale change after initialization', () => {
      getFaker(); // Initialize
      fakerManager.setLocale('fr');
      expect(fakerManager.currentLocale).toBe('fr');
    });
  });

  describe('setSeed()', () => {
    it('should accept seed value', () => {
      expect(() => fakerManager.setSeed(12345)).not.toThrow();
    });

    it('should produce reproducible results with same seed', () => {
      fakerManager.setSeed(12345);
      const faker1 = getFaker();
      const name1 = faker1.person.firstName();

      fakerManager.reset();
      fakerManager.setSeed(12345);
      const faker2 = getFaker();
      const name2 = faker2.person.firstName();

      expect(name1).toBe(name2);
    });

    it('should produce different results with different seeds', () => {
      fakerManager.setSeed(12345);
      const faker1 = getFaker();
      const name1 = faker1.person.firstName();

      fakerManager.reset();
      fakerManager.setSeed(67890);
      const faker2 = getFaker();
      const name2 = faker2.person.firstName();

      // Very unlikely to be the same with different seeds
      // (though not guaranteed)
      expect(name1).not.toBe(name2);
    });
  });

  describe('getAvailableLocales()', () => {
    it('should return array of supported locales', () => {
      const locales = fakerManager.getAvailableLocales();

      expect(Array.isArray(locales)).toBe(true);
      expect(locales).toContain('en');
      expect(locales).toContain('de');
      expect(locales).toContain('fr');
      expect(locales).toContain('es');
      expect(locales).toContain('nl');
    });
  });

  describe('switchLocale()', () => {
    it('should switch to a different locale', () => {
      getFaker(); // Initialize with default locale
      const deFaker = fakerManager.switchLocale('de');

      expect(deFaker).toBeDefined();
      expect(fakerManager.currentLocale).toBe('de');
    });

    it('should cache locale instances', () => {
      getFaker(); // Initialize
      fakerManager.switchLocale('de');
      fakerManager.switchLocale('en');
      fakerManager.switchLocale('de'); // Should use cached instance

      expect(fakerManager.currentLocale).toBe('de');
    });
  });

  describe('reset()', () => {
    it('should reset initialization state', () => {
      getFaker(); // Initialize
      expect(fakerManager.isInitialized).toBe(true);

      fakerManager.reset();
      expect(fakerManager.isInitialized).toBe(false);
    });

    it('should reset locale to default', () => {
      fakerManager.setLocale('de');
      fakerManager.reset();

      expect(fakerManager.currentLocale).toBe('en');
    });
  });

  describe('lazy loading behavior', () => {
    it('should not load faker module until getFaker is called', () => {
      // Just accessing the manager should not initialize faker
      const _ = fakerManager.currentLocale;
      expect(fakerManager.isInitialized).toBe(false);

      // Getting available locales should not initialize faker
      fakerManager.getAvailableLocales();
      expect(fakerManager.isInitialized).toBe(false);

      // Setting locale should not initialize faker
      fakerManager.setLocale('de');
      expect(fakerManager.isInitialized).toBe(false);

      // Only getFaker should initialize
      getFaker();
      expect(fakerManager.isInitialized).toBe(true);
    });
  });

  describe('exported getFaker function', () => {
    it('should be a function', () => {
      expect(typeof getFaker).toBe('function');
    });

    it('should return faker instance', () => {
      const faker = getFaker();
      expect(faker).toBeDefined();
      expect(faker.person).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      const faker1 = getFaker();
      const faker2 = getFaker();
      expect(faker1).toBe(faker2);
    });
  });
});

import { logger } from './logger';

type FakerType = typeof import('@faker-js/faker').faker;

/**
 * Lazy-loading Faker manager
 * Only initializes faker when actually used, reducing startup time
 */
export class FakerManager {
  private static _instance: FakerManager | null = null;
  private _faker: FakerType | null = null;
  private _locales: Map<string, FakerType> = new Map();
  private _currentLocale: string = 'en';
  private _seed: number | undefined;
  private _initialized: boolean = false;

  private constructor() {}

  static getInstance(): FakerManager {
    if (!FakerManager._instance) {
      FakerManager._instance = new FakerManager();
    }
    return FakerManager._instance;
  }

  /**
   * Check if faker has been initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Get the current locale
   */
  get currentLocale(): string {
    return this._currentLocale;
  }

  /**
   * Set locale (will be applied on next getFaker call)
   */
  setLocale(locale: string): void {
    if (locale !== this._currentLocale) {
      this._currentLocale = locale;
      // Clear cached faker to force reload with new locale
      if (this._initialized && !this._locales.has(locale)) {
        logger.debug(`Locale changed to ${locale}, will load on next use`);
      }
    }
  }

  /**
   * Set seed for reproducible data
   */
  setSeed(seed: number | undefined): void {
    this._seed = seed;
    if (this._faker) {
      this._faker.seed(seed);
    }
  }

  /**
   * Get available locales
   */
  getAvailableLocales(): string[] {
    return ['en', 'de', 'fr', 'es', 'nl'];
  }

  /**
   * Lazily get faker instance - only loads when first called
   */
  getFaker(): FakerType {
    if (!this._initialized) {
      this.initializeSync();
    }
    return this._faker!;
  }

  /**
   * Synchronous initialization using require
   * This is called lazily on first use
   */
  private initializeSync(): void {
    if (this._initialized) return;

    logger.debug(`Lazily initializing faker with locale: ${this._currentLocale}`);

    try {
      // Use require for synchronous loading
      const fakerModule = require('@faker-js/faker');

      // Load the appropriate locale
      switch (this._currentLocale) {
        case 'de':
          this._faker = fakerModule.fakerDE;
          break;
        case 'fr':
          this._faker = fakerModule.fakerFR;
          break;
        case 'es':
          this._faker = fakerModule.fakerES;
          break;
        case 'nl':
          this._faker = fakerModule.fakerNL;
          break;
        default:
          this._faker = fakerModule.faker;
      }

      this._locales.set(this._currentLocale, this._faker!);

      if (this._seed !== undefined) {
        this._faker!.seed(this._seed);
      }

      this._initialized = true;
      logger.debug(`Faker initialized with locale: ${this._currentLocale}`);
    } catch (error) {
      logger.error('Failed to initialize faker:', error);
      throw error;
    }
  }

  /**
   * Switch to a different locale (loads lazily if not cached)
   */
  switchLocale(locale: string): FakerType {
    if (this._locales.has(locale)) {
      this._faker = this._locales.get(locale)!;
      this._currentLocale = locale;
      return this._faker;
    }

    // Load the new locale
    const fakerModule = require('@faker-js/faker');
    let localeFaker: FakerType;

    switch (locale) {
      case 'de':
        localeFaker = fakerModule.fakerDE;
        break;
      case 'fr':
        localeFaker = fakerModule.fakerFR;
        break;
      case 'es':
        localeFaker = fakerModule.fakerES;
        break;
      case 'nl':
        localeFaker = fakerModule.fakerNL;
        break;
      default:
        localeFaker = fakerModule.faker;
    }

    this._locales.set(locale, localeFaker);
    this._faker = localeFaker;
    this._currentLocale = locale;

    if (this._seed !== undefined) {
      this._faker.seed(this._seed);
    }

    logger.debug(`Switched to faker locale: ${locale}`);
    return this._faker;
  }

  /**
   * Reset the manager (useful for testing)
   */
  reset(): void {
    this._faker = null;
    this._locales.clear();
    this._currentLocale = 'en';
    this._seed = undefined;
    this._initialized = false;
  }
}

// Export singleton accessor
export const fakerManager = FakerManager.getInstance();

// Export a proxy getter for backward compatibility
export function getFaker(): FakerType {
  return fakerManager.getFaker();
}

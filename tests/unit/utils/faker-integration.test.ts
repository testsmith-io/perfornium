import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateProcessor } from '../../../src/utils/template';
import { FakerManager, fakerManager, getFaker } from '../../../src/utils/faker-manager';

describe('Faker Integration', () => {
  let processor: TemplateProcessor;

  beforeEach(() => {
    fakerManager.reset();
    processor = new TemplateProcessor();
  });

  afterEach(() => {
    fakerManager.reset();
  });

  describe('person data generation', () => {
    it('should generate first names', () => {
      const result = processor.process('{{faker.person.firstName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe('{{faker.person.firstName}}');
    });

    it('should generate last names', () => {
      const result = processor.process('{{faker.person.lastName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate full names', () => {
      const result = processor.process('{{faker.person.fullName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result).toContain(' '); // Full name has space between first and last
    });

    it('should generate job titles', () => {
      const result = processor.process('{{faker.person.jobTitle}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate gender', () => {
      const result = processor.process('{{faker.person.sex}}', { vu_id: 1, iteration: 1 });
      expect(['male', 'female']).toContain(result.toLowerCase());
    });
  });

  describe('internet data generation', () => {
    it('should generate valid emails', () => {
      const result = processor.process('{{faker.internet.email}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/@/);
      expect(result).toMatch(/\./);
    });

    it('should generate usernames', () => {
      const result = processor.process('{{faker.internet.userName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate passwords', () => {
      const result = processor.process('{{faker.internet.password}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate URLs', () => {
      const result = processor.process('{{faker.internet.url}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^https?:\/\//);
    });

    it('should generate IP addresses', () => {
      const result = processor.process('{{faker.internet.ipv4}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });
  });

  describe('string data generation', () => {
    it('should generate UUIDs', () => {
      const result = processor.process('{{faker.string.uuid}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate alphanumeric strings', () => {
      const result = processor.process('{{faker.string.alphanumeric}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should generate numeric strings', () => {
      const result = processor.process('{{faker.string.numeric}}', { vu_id: 1, iteration: 1 });
      expect(result).toMatch(/^\d+$/);
    });
  });

  describe('number data generation', () => {
    it('should generate integers', () => {
      const result = processor.process('{{faker.number.int}}', { vu_id: 1, iteration: 1 });
      const num = parseInt(result);
      expect(num).not.toBeNaN();
    });

    it('should generate floats', () => {
      const result = processor.process('{{faker.number.float}}', { vu_id: 1, iteration: 1 });
      const num = parseFloat(result);
      expect(num).not.toBeNaN();
    });
  });

  describe('address data generation', () => {
    it('should generate street addresses', () => {
      const result = processor.process('{{faker.location.streetAddress}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate cities', () => {
      const result = processor.process('{{faker.location.city}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate countries', () => {
      const result = processor.process('{{faker.location.country}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate zip codes', () => {
      const result = processor.process('{{faker.location.zipCode}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('commerce data generation', () => {
    it('should generate product names', () => {
      const result = processor.process('{{faker.commerce.productName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate prices', () => {
      const result = processor.process('{{faker.commerce.price}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate product descriptions', () => {
      const result = processor.process('{{faker.commerce.productDescription}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('date data generation', () => {
    it('should generate past dates', () => {
      const result = processor.process('{{faker.date.past}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate future dates', () => {
      const result = processor.process('{{faker.date.future}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate recent dates', () => {
      const result = processor.process('{{faker.date.recent}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('phone data generation', () => {
    it('should generate phone numbers', () => {
      const result = processor.process('{{faker.phone.number}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('company data generation', () => {
    it('should generate company names', () => {
      const result = processor.process('{{faker.company.name}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should generate catch phrases', () => {
      const result = processor.process('{{faker.company.catchPhrase}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('lorem ipsum generation', () => {
    it('should generate words', () => {
      const result = processor.process('{{faker.lorem.word}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate sentences', () => {
      const result = processor.process('{{faker.lorem.sentence}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });

    it('should generate paragraphs', () => {
      const result = processor.process('{{faker.lorem.paragraph}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(50);
    });
  });

  describe('combined faker in JSON payloads', () => {
    it('should generate complete user object', () => {
      const template = JSON.stringify({
        user: {
          firstName: '{{faker.person.firstName}}',
          lastName: '{{faker.person.lastName}}',
          email: '{{faker.internet.email}}',
          username: '{{faker.internet.userName}}',
          password: '{{faker.internet.password}}',
          id: '{{faker.string.uuid}}'
        }
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.user.firstName).toBeTruthy();
      expect(parsed.user.lastName).toBeTruthy();
      expect(parsed.user.email).toContain('@');
      expect(parsed.user.username).toBeTruthy();
      expect(parsed.user.password).toBeTruthy();
      expect(parsed.user.id).toMatch(/^[0-9a-f-]+$/i);
    });

    it('should generate product catalog entry', () => {
      const template = JSON.stringify({
        product: {
          name: '{{faker.commerce.productName}}',
          description: '{{faker.commerce.productDescription}}',
          price: '{{faker.commerce.price}}',
          sku: '{{faker.string.alphanumeric}}'
        }
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.product.name).toBeTruthy();
      expect(parsed.product.description).toBeTruthy();
      expect(parsed.product.price).toBeTruthy();
      expect(parsed.product.sku).toBeTruthy();
    });

    it('should generate address object', () => {
      const template = JSON.stringify({
        address: {
          street: '{{faker.location.streetAddress}}',
          city: '{{faker.location.city}}',
          state: '{{faker.location.state}}',
          country: '{{faker.location.country}}',
          zipCode: '{{faker.location.zipCode}}'
        }
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.address.street).toBeTruthy();
      expect(parsed.address.city).toBeTruthy();
      expect(parsed.address.country).toBeTruthy();
      expect(parsed.address.zipCode).toBeTruthy();
    });
  });

  describe('faker with VU context variation', () => {
    it('should generate different values for different VUs', () => {
      const results = new Set<string>();

      for (let vu = 1; vu <= 10; vu++) {
        const result = processor.process('{{faker.person.firstName}}', { vu_id: vu, iteration: 1 });
        results.add(result);
      }

      // Should have generated at least some different names
      expect(results.size).toBeGreaterThan(1);
    });

    it('should generate different values for different iterations', () => {
      const results = new Set<string>();

      for (let iter = 1; iter <= 10; iter++) {
        const result = processor.process('{{faker.string.uuid}}', { vu_id: 1, iteration: iter });
        results.add(result);
      }

      // UUIDs should all be unique
      expect(results.size).toBe(10);
    });
  });

  describe('faker locale support', () => {
    it('should support German locale', () => {
      processor.configureFaker({ locale: 'de' });
      const result = processor.process('{{faker.person.firstName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should support French locale', () => {
      processor.configureFaker({ locale: 'fr' });
      const result = processor.process('{{faker.person.firstName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });

    it('should support Spanish locale', () => {
      processor.configureFaker({ locale: 'es' });
      const result = processor.process('{{faker.person.firstName}}', { vu_id: 1, iteration: 1 });
      expect(result).toBeTruthy();
    });
  });

  describe('faker seeding via FakerManager', () => {
    it('should produce reproducible results with same seed using FakerManager directly', () => {
      fakerManager.setSeed(12345);
      const faker1 = getFaker();
      const result1 = faker1.person.firstName();

      // Reset and reseed
      fakerManager.reset();
      fakerManager.setSeed(12345);
      const faker2 = getFaker();
      const result2 = faker2.person.firstName();

      expect(result1).toBe(result2);
    });

    it('should produce different results with different seeds', () => {
      fakerManager.setSeed(11111);
      const faker1 = getFaker();
      const result1 = faker1.person.firstName();

      fakerManager.reset();
      fakerManager.setSeed(99999);
      const faker2 = getFaker();
      const result2 = faker2.person.firstName();

      // Very unlikely to be the same
      expect(result1).not.toBe(result2);
    });

    it('should accept seed via configureFaker', () => {
      // Just verify the method doesn't throw
      expect(() => processor.configureFaker({ seed: 54321 })).not.toThrow();
    });
  });

  describe('faker mixed with variables', () => {
    it('should combine faker with static variables', () => {
      const template = '{{userId}}: {{faker.person.firstName}} {{faker.person.lastName}}';
      const result = processor.process(template, {
        vu_id: 1,
        iteration: 1,
        userId: 'USER_001'
      });

      expect(result).toMatch(/^USER_001: .+ .+$/);
    });

    it('should combine faker with VU context', () => {
      const template = 'VU{{vu_id}}_{{faker.string.alphanumeric}}';
      const result = processor.process(template, { vu_id: 5, iteration: 1 });

      expect(result).toMatch(/^VU5_[a-zA-Z0-9]+$/);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple faker calls in one string', () => {
      const template = '{{faker.person.firstName}} {{faker.person.lastName}} <{{faker.internet.email}}>';
      const result = processor.process(template, { vu_id: 1, iteration: 1 });

      expect(result).toMatch(/^.+ .+ <.+@.+>$/);
    });

    it('should handle faker in nested JSON', () => {
      const template = JSON.stringify({
        level1: {
          level2: {
            level3: {
              value: '{{faker.string.uuid}}'
            }
          }
        }
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.level1.level2.level3.value).toMatch(/^[0-9a-f-]+$/i);
    });

    it('should handle array of faker values', () => {
      const template = JSON.stringify({
        users: [
          { name: '{{faker.person.firstName}}' },
          { name: '{{faker.person.firstName}}' },
          { name: '{{faker.person.firstName}}' }
        ]
      });

      const result = processor.process(template, { vu_id: 1, iteration: 1 });
      const parsed = JSON.parse(result);

      expect(parsed.users).toHaveLength(3);
      parsed.users.forEach((user: { name: string }) => {
        expect(user.name).toBeTruthy();
        expect(user.name).not.toBe('{{faker.person.firstName}}');
      });
    });
  });
});

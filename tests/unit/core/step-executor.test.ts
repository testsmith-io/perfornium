import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StepExecutor } from '../../../src/core/step-executor';
import { ProtocolHandler } from '../../../src/protocols/base';
import { VUContext } from '../../../src/config';

// Mock protocol handler
const createMockHandler = (response: any = {}) => {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: response,
      response_time: 100,
      ...response
    })
  } as unknown as ProtocolHandler;
};

describe('StepExecutor', () => {
  let executor: StepExecutor;
  let mockRestHandler: ProtocolHandler;
  let handlers: Map<string, ProtocolHandler>;

  beforeEach(() => {
    mockRestHandler = createMockHandler();
    handlers = new Map([['rest', mockRestHandler]]);
    executor = new StepExecutor(handlers, 'Test');
  });

  describe('data extraction', () => {
    describe('json_path extraction', () => {
      it('should extract value using simple json path', async () => {
        const responseData = {
          user: {
            id: 123,
            name: 'John Doe'
          }
        };

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/user',
          extract: [
            {
              name: 'userId',
              type: 'json_path' as const,
              expression: '$.user.id'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.userId).toBe(123);
      });

      it('should extract nested json path values', async () => {
        const responseData = {
          response: {
            data: {
              items: [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
              ]
            }
          }
        };

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/items',
          extract: [
            {
              name: 'firstItemName',
              type: 'json_path' as const,
              expression: '$.response.data.items[0].name'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.firstItemName).toBe('Item 1');
      });

      it('should use default value when json path not found', async () => {
        const responseData = { user: {} };

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/user',
          extract: [
            {
              name: 'missingField',
              type: 'json_path' as const,
              expression: '$.user.nonexistent.field',
              default: 'default_value'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.missingField).toBe('default_value');
      });

      it('should extract multiple values', async () => {
        const responseData = {
          token: 'abc123',
          user: {
            id: 456,
            email: 'test@example.com'
          }
        };

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'POST',
          url: 'http://example.com/api/login',
          extract: [
            { name: 'authToken', type: 'json_path' as const, expression: '$.token' },
            { name: 'userId', type: 'json_path' as const, expression: '$.user.id' },
            { name: 'userEmail', type: 'json_path' as const, expression: '$.user.email' }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.authToken).toBe('abc123');
        expect(context.extracted_data.userId).toBe(456);
        expect(context.extracted_data.userEmail).toBe('test@example.com');
      });
    });

    describe('regex extraction', () => {
      it('should extract value using regex', async () => {
        const responseData = 'User ID: 12345, Status: active';

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/status',
          extract: [
            {
              name: 'userId',
              type: 'regex' as const,
              expression: 'User ID: (\\d+)'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.userId).toBe('12345');
      });

      it('should extract first capture group from regex', async () => {
        const responseData = 'Bearer token_abc123_xyz';

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/token',
          extract: [
            {
              name: 'token',
              type: 'regex' as const,
              expression: 'Bearer (token_[a-z0-9]+)'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.token).toBe('token_abc123');
      });

      it('should use default value when regex does not match', async () => {
        const responseData = 'No matching content here';

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/data',
          extract: [
            {
              name: 'noMatch',
              type: 'regex' as const,
              expression: 'PATTERN_(\\d+)',
              default: 'not_found'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.noMatch).toBe('not_found');
      });
    });

    describe('custom extraction', () => {
      it('should extract value using custom script', async () => {
        const responseData = {
          items: [10, 20, 30, 40, 50]
        };

        mockRestHandler = createMockHandler({ data: responseData });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/items',
          extract: [
            {
              name: 'itemSum',
              type: 'custom' as const,
              expression: '',
              script: 'result.data.items.reduce((a, b) => a + b, 0)'
            }
          ]
        };

        await executor.executeStep(step, context, 'Test Scenario');

        expect(context.extracted_data.itemSum).toBe(150);
      });
    });
  });

  describe('checks', () => {
    describe('status check', () => {
      it('should pass when status matches', async () => {
        mockRestHandler = createMockHandler({ status: 200 });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/test',
          checks: [
            { type: 'status' as const, value: 200 }
          ]
        };

        const result = await executor.executeStep(step, context, 'Test Scenario');

        expect(result.success).toBe(true);
      });

      it('should fail when status does not match', async () => {
        mockRestHandler = createMockHandler({ status: 404 });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/test',
          checks: [
            { type: 'status' as const, value: 200, description: 'Status should be 200' }
          ]
        };

        const result = await executor.executeStep(step, context, 'Test Scenario');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Status should be 200');
      });
    });

    describe('text_contains check', () => {
      it('should pass when text is found', async () => {
        mockRestHandler = createMockHandler({ data: 'Hello World! Success message.' });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/test',
          checks: [
            { type: 'text_contains' as const, value: 'Success' }
          ]
        };

        const result = await executor.executeStep(step, context, 'Test Scenario');

        expect(result.success).toBe(true);
      });

      it('should fail when text is not found', async () => {
        mockRestHandler = createMockHandler({ data: 'Hello World!' });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/test',
          checks: [
            { type: 'text_contains' as const, value: 'NotFound', description: 'Should contain NotFound' }
          ]
        };

        const result = await executor.executeStep(step, context, 'Test Scenario');

        expect(result.success).toBe(false);
      });
    });

    describe('json_path check', () => {
      it('should pass when json path exists', async () => {
        mockRestHandler = createMockHandler({ data: { user: { id: 123 } } });
        handlers = new Map([['rest', mockRestHandler]]);
        executor = new StepExecutor(handlers, 'Test');

        const context: VUContext = {
          vu_id: 1,
          iteration: 1,
          variables: {},
          extracted_data: {}
        };

        const step = {
          type: 'rest' as const,
          method: 'GET',
          url: 'http://example.com/api/user',
          checks: [
            { type: 'json_path' as const, value: '$.user.id' }
          ]
        };

        const result = await executor.executeStep(step, context, 'Test Scenario');

        expect(result.success).toBe(true);
      });
    });
  });

  describe('template processing with extracted data', () => {
    it('should use extracted data in subsequent steps', async () => {
      mockRestHandler = createMockHandler({ data: { token: 'secret_token_123' } });
      handlers = new Map([['rest', mockRestHandler]]);
      executor = new StepExecutor(handlers, 'Test');

      const context: VUContext = {
        vu_id: 1,
        iteration: 1,
        variables: {},
        extracted_data: { previousToken: 'old_token' }
      };

      const step = {
        type: 'rest' as const,
        method: 'GET',
        url: 'http://example.com/api/data?token={{previousToken}}'
      };

      await executor.executeStep(step, context, 'Test Scenario');

      // Verify the handler was called with processed URL
      expect(mockRestHandler.execute).toHaveBeenCalled();
      const callArgs = (mockRestHandler.execute as any).mock.calls[0][0];
      expect(callArgs.url).toBe('http://example.com/api/data?token=old_token');
    });
  });

  describe('condition evaluation', () => {
    it('should skip step when condition is false', async () => {
      const context: VUContext = {
        vu_id: 1,
        iteration: 1,
        variables: { shouldRun: false },
        extracted_data: {}
      };

      const step = {
        type: 'rest' as const,
        method: 'GET',
        url: 'http://example.com/api/test',
        condition: 'context.variables.shouldRun === true'
      };

      const result = await executor.executeStep(step, context, 'Test Scenario');

      expect(result.success).toBe(true);
      expect(result.custom_metrics?.skipped).toBe(true);
      expect(mockRestHandler.execute).not.toHaveBeenCalled();
    });

    it('should execute step when condition is true', async () => {
      const context: VUContext = {
        vu_id: 1,
        iteration: 1,
        variables: { shouldRun: true },
        extracted_data: {}
      };

      const step = {
        type: 'rest' as const,
        method: 'GET',
        url: 'http://example.com/api/test',
        condition: 'context.variables.shouldRun === true'
      };

      await executor.executeStep(step, context, 'Test Scenario');

      expect(mockRestHandler.execute).toHaveBeenCalled();
    });
  });
});

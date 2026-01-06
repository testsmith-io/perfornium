# Hooks & Lifecycle

Hooks in Perfornium allow you to execute custom JavaScript code at specific points during test execution. They provide powerful capabilities for setup, teardown, data processing, and dynamic test behavior.

## Hook Types

### Scenario Hooks

Execute code at scenario lifecycle events:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Scenario with Hooks"
    hooks:
      beforeScenario: |
        // Execute before scenario starts
        console.log(`Starting scenario: ${scenario.name}`);
        context.variables.scenario_start_time = Date.now();
        context.variables.session_id = faker.string.uuid();

        // Initialize scenario-specific data
        context.variables.request_count = 0;
        context.variables.error_count = 0;

      afterScenario: |
        // Execute after scenario completes
        const duration = Date.now() - context.variables.scenario_start_time;
        console.log(`Scenario completed in ${duration}ms`);
        console.log(`Total requests: ${context.variables.request_count}`);
        console.log(`Total errors: ${context.variables.error_count}`);

        // Cleanup
        delete context.variables.temp_data;
    steps:
      - name: "API Call"
        type: "rest"
        method: "GET"
        path: "/api/test"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('Scenario with Hooks')
  .scenario('Scenario with Hooks')
    .beforeScenario(async (context) => {
      // Execute before scenario starts
      console.log(`Starting scenario: Scenario with Hooks`);
      context.variables.scenario_start_time = Date.now();
      context.variables.session_id = faker.string.uuid();

      // Initialize scenario-specific data
      context.variables.request_count = 0;
      context.variables.error_count = 0;
    })
    .afterScenario(async (context) => {
      // Execute after scenario completes
      const duration = Date.now() - context.variables.scenario_start_time;
      console.log(`Scenario completed in ${duration}ms`);
      console.log(`Total requests: ${context.variables.request_count}`);
      console.log(`Total errors: ${context.variables.error_count}`);

      // Cleanup
      delete context.variables.temp_data;
    })
    .get('/api/test', { name: 'API Call' })
    .done()
  .build();
```

<!-- tabs:end -->

### Step Hooks

Execute code before and after each step:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Step-level Hooks"
    hooks:
      beforeStep: |
        // Execute before each step
        context.variables.step_start_time = Date.now();
        context.variables.request_count++;

        console.log(`Executing step: ${step.name}`);
        console.log(`Request #${context.variables.request_count}`);

        // Add request tracking
        if (!context.variables.step_timings) {
          context.variables.step_timings = [];
        }

      afterStep: |
        // Execute after each step
        const step_duration = Date.now() - context.variables.step_start_time;

        // Record step timing
        context.variables.step_timings.push({
          step_name: step.name,
          duration: step_duration,
          success: result.success,
          status: result.status
        });

        // Track errors
        if (!result.success) {
          context.variables.error_count++;
          console.log(`Step failed: ${step.name} - ${result.error}`);
        }

        console.log(`Step ${step.name} completed in ${step_duration}ms`);
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/auth/login"
        body: '{"username": "test", "password": "test"}'

      - name: "Get Data"
        type: "rest"
        method: "GET"
        path: "/api/data"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Step-level Hooks')
  .scenario('Step-level Hooks')
    .beforeStep(async (context, step) => {
      // Execute before each step
      context.variables.step_start_time = Date.now();
      context.variables.request_count++;

      console.log(`Executing step: ${step.name}`);
      console.log(`Request #${context.variables.request_count}`);

      // Add request tracking
      if (!context.variables.step_timings) {
        context.variables.step_timings = [];
      }
    })
    .afterStep(async (context, step, result) => {
      // Execute after each step
      const step_duration = Date.now() - context.variables.step_start_time;

      // Record step timing
      context.variables.step_timings.push({
        step_name: step.name,
        duration: step_duration,
        success: result.success,
        status: result.status
      });

      // Track errors
      if (!result.success) {
        context.variables.error_count++;
        console.log(`Step failed: ${step.name} - ${result.error}`);
      }

      console.log(`Step ${step.name} completed in ${step_duration}ms`);
    })
    .post('/auth/login', {
      name: 'Login',
      body: { username: 'test', password: 'test' }
    })
    .get('/api/data', { name: 'Get Data' })
    .done()
  .build();
```

<!-- tabs:end -->

### Global Hooks

Execute code at test lifecycle events:

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  hooks:
    beforeTest: |
      // Execute once before test starts
      console.log('Starting performance test');
      context.global.test_start_time = Date.now();
      context.global.total_vus = 0;
      context.global.shared_data = {};

    afterTest: |
      // Execute once after test completes
      const test_duration = Date.now() - context.global.test_start_time;
      console.log(`Test completed in ${test_duration}ms`);
      console.log(`Total VUs created: ${context.global.total_vus}`);

      // Generate summary
      console.log('Test Summary:', JSON.stringify({
        duration: test_duration,
        vus: context.global.total_vus,
        shared_data_size: Object.keys(context.global.shared_data).length
      }, null, 2));

scenarios:
  - name: "Test Scenario"
    steps:
      - name: "API Call"
        type: "rest"
        method: "GET"
        path: "/api/status"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Global Hooks Test')
  .beforeTest(async (context) => {
    // Execute once before test starts
    console.log('Starting performance test');
    context.global.test_start_time = Date.now();
    context.global.total_vus = 0;
    context.global.shared_data = {};
  })
  .afterTest(async (context) => {
    // Execute once after test completes
    const test_duration = Date.now() - context.global.test_start_time;
    console.log(`Test completed in ${test_duration}ms`);
    console.log(`Total VUs created: ${context.global.total_vus}`);

    // Generate summary
    console.log('Test Summary:', JSON.stringify({
      duration: test_duration,
      vus: context.global.total_vus,
      shared_data_size: Object.keys(context.global.shared_data).length
    }, null, 2));
  })
  .scenario('Test Scenario')
    .get('/api/status', { name: 'API Call' })
    .done()
  .build();
```

<!-- tabs:end -->

## Hook Context

### Available Variables

Hooks have access to various context variables:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Context Access Example"
    hooks:
      beforeScenario: |
        // Context information available in hooks
        console.log('VU ID:', context.vu_id);
        console.log('Scenario name:', scenario.name);
        console.log('Test config:', JSON.stringify(context.config, null, 2));
        console.log('Global variables:', context.variables);
        console.log('CSV data:', context.csvData);

        // Environment information
        console.log('Base URL:', context.config.global.base_url);
        console.log('Environment:', process.env.NODE_ENV);

      beforeStep: |
        // Step-specific information
        console.log('Step name:', step.name);
        console.log('Step type:', step.type);
        console.log('Step config:', JSON.stringify(step, null, 2));

      afterStep: |
        // Result information
        console.log('Success:', result.success);
        console.log('Status:', result.status);
        console.log('Duration:', result.duration);
        console.log('Response body:', result.body);
        console.log('Response headers:', result.headers);
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Context Access Example')
  .scenario('Context Access Example')
    .beforeScenario(async (context) => {
      // Context information available in hooks
      console.log('VU ID:', context.vu_id);
      console.log('Scenario name:', 'Context Access Example');
      console.log('Test config:', JSON.stringify(context.config, null, 2));
      console.log('Global variables:', context.variables);
      console.log('CSV data:', context.csvData);

      // Environment information
      console.log('Base URL:', context.config.global.base_url);
      console.log('Environment:', process.env.NODE_ENV);
    })
    .beforeStep(async (context, step) => {
      // Step-specific information
      console.log('Step name:', step.name);
      console.log('Step type:', step.type);
      console.log('Step config:', JSON.stringify(step, null, 2));
    })
    .afterStep(async (context, step, result) => {
      // Result information
      console.log('Success:', result.success);
      console.log('Status:', result.status);
      console.log('Duration:', result.duration);
      console.log('Response body:', result.body);
      console.log('Response headers:', result.headers);
    })
    .done()
  .build();
```

<!-- tabs:end -->

### Modifying Context

Hooks can modify the test context:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Context Modification"
    hooks:
      beforeScenario: |
        // Set up authentication
        const authResponse = await fetch(`${context.config.global.base_url}/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'test_client',
            client_secret: 'test_secret'
          })
        });

        const authData = await authResponse.json();
        context.variables.access_token = authData.access_token;
        context.variables.token_expires_at = Date.now() + (authData.expires_in * 1000);

      beforeStep: |
        // Check token expiration and refresh if needed
        if (context.variables.token_expires_at &&
            Date.now() > context.variables.token_expires_at - 60000) { // 1 minute buffer

          console.log('Token expiring, refreshing...');
          const refreshResponse = await fetch(`${context.config.global.base_url}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${context.variables.access_token}`
            }
          });

          const refreshData = await refreshResponse.json();
          context.variables.access_token = refreshData.access_token;
          context.variables.token_expires_at = Date.now() + (refreshData.expires_in * 1000);
        }

        // Modify step dynamically
        if (step.type === 'rest' && context.variables.access_token) {
          step.headers = step.headers || {};
          step.headers.Authorization = `Bearer ${context.variables.access_token}`;
        }
    steps:
      - name: "Protected API Call"
        type: "rest"
        method: "GET"
        path: "/api/protected/data"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Context Modification')
  .scenario('Context Modification')
    .beforeScenario(async (context) => {
      // Set up authentication
      const authResponse = await fetch(`${context.config.global.base_url}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'test_client',
          client_secret: 'test_secret'
        })
      });

      const authData = await authResponse.json();
      context.variables.access_token = authData.access_token;
      context.variables.token_expires_at = Date.now() + (authData.expires_in * 1000);
    })
    .beforeStep(async (context, step) => {
      // Check token expiration and refresh if needed
      if (context.variables.token_expires_at &&
          Date.now() > context.variables.token_expires_at - 60000) { // 1 minute buffer

        console.log('Token expiring, refreshing...');
        const refreshResponse = await fetch(`${context.config.global.base_url}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${context.variables.access_token}`
          }
        });

        const refreshData = await refreshResponse.json();
        context.variables.access_token = refreshData.access_token;
        context.variables.token_expires_at = Date.now() + (refreshData.expires_in * 1000);
      }

      // Modify step dynamically
      if (step.type === 'rest' && context.variables.access_token) {
        step.headers = step.headers || {};
        step.headers.Authorization = `Bearer ${context.variables.access_token}`;
      }
    })
    .get('/api/protected/data', { name: 'Protected API Call' })
    .done()
  .build();
```

<!-- tabs:end -->

## Common Hook Patterns

### Authentication Flow

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Authentication with Hooks"
    hooks:
      beforeScenario: |
        // Perform login
        const loginResponse = await fetch(`${context.config.global.base_url}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: context.csvData?.username || 'default_user',
            password: context.csvData?.password || 'default_pass'
          })
        });

        if (!loginResponse.ok) {
          throw new Error(`Login failed: ${loginResponse.status}`);
        }

        const loginData = await loginResponse.json();
        context.variables.session_token = loginData.token;
        context.variables.user_id = loginData.user_id;
        context.variables.user_role = loginData.role;

        console.log(`Logged in as ${context.variables.user_id} with role ${context.variables.user_role}`);

      afterScenario: |
        // Perform logout
        if (context.variables.session_token) {
          try {
            await fetch(`${context.config.global.base_url}/logout`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${context.variables.session_token}`
              }
            });
            console.log(`Logged out user ${context.variables.user_id}`);
          } catch (error) {
            console.warn('Logout failed:', error.message);
          }
        }
    steps:
      - name: "Protected Resource"
        type: "rest"
        method: "GET"
        path: "/api/user/profile"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Authentication with Hooks')
  .scenario('Authentication with Hooks')
    .beforeScenario(async (context) => {
      // Perform login
      const loginResponse = await fetch(`${context.config.global.base_url}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: context.csvData?.username || 'default_user',
          password: context.csvData?.password || 'default_pass'
        })
      });

      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      const loginData = await loginResponse.json();
      context.variables.session_token = loginData.token;
      context.variables.user_id = loginData.user_id;
      context.variables.user_role = loginData.role;

      console.log(`Logged in as ${context.variables.user_id} with role ${context.variables.user_role}`);
    })
    .afterScenario(async (context) => {
      // Perform logout
      if (context.variables.session_token) {
        try {
          await fetch(`${context.config.global.base_url}/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${context.variables.session_token}`
            }
          });
          console.log(`Logged out user ${context.variables.user_id}`);
        } catch (error) {
          console.warn('Logout failed:', error.message);
        }
      }
    })
    .get('/api/user/profile', { name: 'Protected Resource' })
    .done()
  .build();
```

<!-- tabs:end -->

### Data Setup and Cleanup

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Data Lifecycle Management"
    hooks:
      beforeScenario: |
        // Create test data
        const testData = {
          name: faker.company.name(),
          email: faker.internet.email(),
          phone: faker.phone.number()
        };

        const createResponse = await fetch(`${context.config.global.base_url}/test-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData)
        });

        const createdData = await createResponse.json();
        context.variables.test_data_id = createdData.id;
        context.variables.test_data = testData;

        console.log(`Created test data with ID: ${context.variables.test_data_id}`);

      afterScenario: |
        // Cleanup test data
        if (context.variables.test_data_id) {
          try {
            await fetch(`${context.config.global.base_url}/test-data/${context.variables.test_data_id}`, {
              method: 'DELETE'
            });
            console.log(`Cleaned up test data: ${context.variables.test_data_id}`);
          } catch (error) {
            console.warn('Cleanup failed:', error.message);
          }
        }
    steps:
      - name: "Use Test Data"
        type: "rest"
        method: "GET"
        path: "/api/test-data/{{test_data_id}}"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('Data Lifecycle Management')
  .scenario('Data Lifecycle Management')
    .beforeScenario(async (context) => {
      // Create test data
      const testData = {
        name: faker.company.name(),
        email: faker.internet.email(),
        phone: faker.phone.number()
      };

      const createResponse = await fetch(`${context.config.global.base_url}/test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      const createdData = await createResponse.json();
      context.variables.test_data_id = createdData.id;
      context.variables.test_data = testData;

      console.log(`Created test data with ID: ${context.variables.test_data_id}`);
    })
    .afterScenario(async (context) => {
      // Cleanup test data
      if (context.variables.test_data_id) {
        try {
          await fetch(`${context.config.global.base_url}/test-data/${context.variables.test_data_id}`, {
            method: 'DELETE'
          });
          console.log(`Cleaned up test data: ${context.variables.test_data_id}`);
        } catch (error) {
          console.warn('Cleanup failed:', error.message);
        }
      }
    })
    .get('/api/test-data/{{test_data_id}}', { name: 'Use Test Data' })
    .done()
  .build();
```

<!-- tabs:end -->

### Performance Monitoring

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Performance Monitoring"
    hooks:
      beforeScenario: |
        // Initialize performance tracking
        context.variables.performance_metrics = {
          start_time: Date.now(),
          memory_start: process.memoryUsage(),
          request_times: [],
          errors: []
        };

      beforeStep: |
        // Record step start
        context.variables.step_start = Date.now();

      afterStep: |
        // Record performance data
        const duration = Date.now() - context.variables.step_start;
        context.variables.performance_metrics.request_times.push({
          step: step.name,
          duration: duration,
          status: result.status,
          success: result.success
        });

        if (!result.success) {
          context.variables.performance_metrics.errors.push({
            step: step.name,
            error: result.error,
            status: result.status,
            timestamp: Date.now()
          });
        }

      afterScenario: |
        // Generate performance report
        const metrics = context.variables.performance_metrics;
        const total_duration = Date.now() - metrics.start_time;
        const memory_end = process.memoryUsage();

        const avg_response_time = metrics.request_times.reduce((sum, req) => sum + req.duration, 0) / metrics.request_times.length;
        const success_rate = metrics.request_times.filter(req => req.success).length / metrics.request_times.length;

        console.log('Performance Summary:', {
          total_duration: total_duration,
          total_requests: metrics.request_times.length,
          avg_response_time: avg_response_time,
          success_rate: success_rate,
          error_count: metrics.errors.length,
          memory_used: memory_end.heapUsed - metrics.memory_start.heapUsed
        });
    steps:
      - name: "Monitored API Call"
        type: "rest"
        method: "GET"
        path: "/api/performance-test"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Performance Monitoring')
  .scenario('Performance Monitoring')
    .beforeScenario(async (context) => {
      // Initialize performance tracking
      context.variables.performance_metrics = {
        start_time: Date.now(),
        memory_start: process.memoryUsage(),
        request_times: [],
        errors: []
      };
    })
    .beforeStep(async (context) => {
      // Record step start
      context.variables.step_start = Date.now();
    })
    .afterStep(async (context, step, result) => {
      // Record performance data
      const duration = Date.now() - context.variables.step_start;
      context.variables.performance_metrics.request_times.push({
        step: step.name,
        duration: duration,
        status: result.status,
        success: result.success
      });

      if (!result.success) {
        context.variables.performance_metrics.errors.push({
          step: step.name,
          error: result.error,
          status: result.status,
          timestamp: Date.now()
        });
      }
    })
    .afterScenario(async (context) => {
      // Generate performance report
      const metrics = context.variables.performance_metrics;
      const total_duration = Date.now() - metrics.start_time;
      const memory_end = process.memoryUsage();

      const avg_response_time = metrics.request_times.reduce((sum, req) => sum + req.duration, 0) / metrics.request_times.length;
      const success_rate = metrics.request_times.filter(req => req.success).length / metrics.request_times.length;

      console.log('Performance Summary:', {
        total_duration: total_duration,
        total_requests: metrics.request_times.length,
        avg_response_time: avg_response_time,
        success_rate: success_rate,
        error_count: metrics.errors.length,
        memory_used: memory_end.heapUsed - metrics.memory_start.heapUsed
      });
    })
    .get('/api/performance-test', { name: 'Monitored API Call' })
    .done()
  .build();
```

<!-- tabs:end -->

## Advanced Hook Features

### Conditional Hooks

Execute hooks based on conditions:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Conditional Hook Execution"
    hooks:
      beforeScenario: |
        // Only run setup for certain VUs
        if (context.vu_id % 5 === 0) {
          console.log(`VU ${context.vu_id}: Running special setup`);
          context.variables.special_mode = true;
        }

      beforeStep: |
        // Conditional step modification
        if (context.variables.special_mode && step.name === 'Special Step') {
          step.headers = step.headers || {};
          step.headers['X-Special-Mode'] = 'true';
        }

        // Skip certain steps based on conditions
        if (step.name === 'Premium Feature' && context.variables.user_tier !== 'premium') {
          step.skip = true;
          console.log('Skipping premium feature for non-premium user');
        }
    steps:
      - name: "Regular Step"
        type: "rest"
        method: "GET"
        path: "/api/regular"

      - name: "Special Step"
        type: "rest"
        method: "GET"
        path: "/api/special"

      - name: "Premium Feature"
        type: "rest"
        method: "GET"
        path: "/api/premium"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Conditional Hook Execution')
  .scenario('Conditional Hook Execution')
    .beforeScenario(async (context) => {
      // Only run setup for certain VUs
      if (context.vu_id % 5 === 0) {
        console.log(`VU ${context.vu_id}: Running special setup`);
        context.variables.special_mode = true;
      }
    })
    .beforeStep(async (context, step) => {
      // Conditional step modification
      if (context.variables.special_mode && step.name === 'Special Step') {
        step.headers = step.headers || {};
        step.headers['X-Special-Mode'] = 'true';
      }

      // Skip certain steps based on conditions
      if (step.name === 'Premium Feature' && context.variables.user_tier !== 'premium') {
        step.skip = true;
        console.log('Skipping premium feature for non-premium user');
      }
    })
    .get('/api/regular', { name: 'Regular Step' })
    .get('/api/special', { name: 'Special Step' })
    .get('/api/premium', { name: 'Premium Feature' })
    .done()
  .build();
```

<!-- tabs:end -->

### Async Operations

Handle asynchronous operations in hooks:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Async Hook Operations"
    hooks:
      beforeScenario: |
        // Async setup operations
        const setupPromises = [];

        // Parallel API calls for setup
        setupPromises.push(
          fetch(`${context.config.global.base_url}/api/config`)
            .then(response => response.json())
            .then(config => {
              context.variables.api_config = config;
            })
        );

        setupPromises.push(
          fetch(`${context.config.global.base_url}/api/user-settings`)
            .then(response => response.json())
            .then(settings => {
              context.variables.user_settings = settings;
            })
        );

        // Wait for all setup operations to complete
        await Promise.all(setupPromises);
        console.log('Async setup completed');

      afterStep: |
        // Async logging
        if (result.status >= 400) {
          // Don't block test execution for logging
          setImmediate(async () => {
            try {
              await fetch(`${context.config.global.base_url}/api/error-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  vu_id: context.vu_id,
                  step: step.name,
                  error: result.error,
                  timestamp: Date.now()
                })
              });
            } catch (logError) {
              console.warn('Error logging failed:', logError.message);
            }
          });
        }
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Async Hook Operations')
  .scenario('Async Hook Operations')
    .beforeScenario(async (context) => {
      // Async setup operations
      const setupPromises = [];

      // Parallel API calls for setup
      setupPromises.push(
        fetch(`${context.config.global.base_url}/api/config`)
          .then(response => response.json())
          .then(config => {
            context.variables.api_config = config;
          })
      );

      setupPromises.push(
        fetch(`${context.config.global.base_url}/api/user-settings`)
          .then(response => response.json())
          .then(settings => {
            context.variables.user_settings = settings;
          })
      );

      // Wait for all setup operations to complete
      await Promise.all(setupPromises);
      console.log('Async setup completed');
    })
    .afterStep(async (context, step, result) => {
      // Async logging
      if (result.status >= 400) {
        // Don't block test execution for logging
        setImmediate(async () => {
          try {
            await fetch(`${context.config.global.base_url}/api/error-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vu_id: context.vu_id,
                step: step.name,
                error: result.error,
                timestamp: Date.now()
              })
            });
          } catch (logError) {
            console.warn('Error logging failed:', logError.message);
          }
        });
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### Hook Error Handling

Handle errors in hooks gracefully:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Robust Hook Error Handling"
    hooks:
      beforeScenario: |
        try {
          // Attempt primary setup
          const response = await fetch(`${context.config.global.base_url}/api/setup`);
          if (!response.ok) {
            throw new Error(`Setup failed: ${response.status}`);
          }
          const setup = await response.json();
          context.variables.setup_data = setup;
        } catch (error) {
          console.warn('Primary setup failed, using fallback:', error.message);
          // Fallback setup
          context.variables.setup_data = {
            fallback: true,
            mode: 'offline',
            timestamp: Date.now()
          };
        }

      beforeStep: |
        // Graceful error handling in step hooks
        try {
          if (step.type === 'rest' && context.variables.setup_data?.fallback) {
            // Modify step for fallback mode
            step.headers = step.headers || {};
            step.headers['X-Fallback-Mode'] = 'true';
          }
        } catch (error) {
          console.error('Hook error (non-fatal):', error.message);
          // Don't throw - allow test to continue
        }

      afterScenario: |
        // Cleanup with error handling
        const cleanupOperations = [
          async () => {
            try {
              if (context.variables.temp_file) {
                await fs.unlink(context.variables.temp_file);
              }
            } catch (error) {
              console.warn('File cleanup failed:', error.message);
            }
          },
          async () => {
            try {
              if (context.variables.session_id) {
                await fetch(`${context.config.global.base_url}/sessions/${context.variables.session_id}`, {
                  method: 'DELETE'
                });
              }
            } catch (error) {
              console.warn('Session cleanup failed:', error.message);
            }
          }
        ];

        // Execute cleanup operations without blocking
        await Promise.allSettled(cleanupOperations.map(op => op()));
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Robust Hook Error Handling')
  .scenario('Robust Hook Error Handling')
    .beforeScenario(async (context) => {
      try {
        // Attempt primary setup
        const response = await fetch(`${context.config.global.base_url}/api/setup`);
        if (!response.ok) {
          throw new Error(`Setup failed: ${response.status}`);
        }
        const setup = await response.json();
        context.variables.setup_data = setup;
      } catch (error) {
        console.warn('Primary setup failed, using fallback:', error.message);
        // Fallback setup
        context.variables.setup_data = {
          fallback: true,
          mode: 'offline',
          timestamp: Date.now()
        };
      }
    })
    .beforeStep(async (context, step) => {
      // Graceful error handling in step hooks
      try {
        if (step.type === 'rest' && context.variables.setup_data?.fallback) {
          // Modify step for fallback mode
          step.headers = step.headers || {};
          step.headers['X-Fallback-Mode'] = 'true';
        }
      } catch (error) {
        console.error('Hook error (non-fatal):', error.message);
        // Don't throw - allow test to continue
      }
    })
    .afterScenario(async (context) => {
      // Cleanup with error handling
      const cleanupOperations = [
        async () => {
          try {
            if (context.variables.temp_file) {
              await fs.unlink(context.variables.temp_file);
            }
          } catch (error) {
            console.warn('File cleanup failed:', error.message);
          }
        },
        async () => {
          try {
            if (context.variables.session_id) {
              await fetch(`${context.config.global.base_url}/sessions/${context.variables.session_id}`, {
                method: 'DELETE'
              });
            }
          } catch (error) {
            console.warn('Session cleanup failed:', error.message);
          }
        }
      ];

      // Execute cleanup operations without blocking
      await Promise.allSettled(cleanupOperations.map(op => op()));
    })
    .done()
  .build();
```

<!-- tabs:end -->

## Hook Best Practices

### 1. Keep Hooks Lightweight

<!-- tabs:start -->

#### **YAML**

```yaml
# Good: Lightweight, focused hooks
hooks:
  beforeScenario: |
    context.variables.start_time = Date.now();
    context.variables.request_count = 0;

  afterStep: |
    context.variables.request_count++;

# Avoid: Heavy operations in hooks
hooks:
  beforeStep: |
    // Avoid: Expensive operations before each step
    const heavyComputation = performExpensiveCalculation();
    const largeDataSet = loadLargeDataFromFile();
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

// Good: Lightweight, focused hooks
test('Lightweight Hooks')
  .scenario('Example')
    .beforeScenario(async (context) => {
      context.variables.start_time = Date.now();
      context.variables.request_count = 0;
    })
    .afterStep(async (context) => {
      context.variables.request_count++;
    })
    .done()
  .build();

// Avoid: Heavy operations in hooks
test('Heavy Hooks - Avoid')
  .scenario('Example')
    .beforeStep(async (context) => {
      // Avoid: Expensive operations before each step
      const heavyComputation = performExpensiveCalculation();
      const largeDataSet = loadLargeDataFromFile();
    })
    .done()
  .build();
```

<!-- tabs:end -->

### 2. Use Appropriate Hook Types

<!-- tabs:start -->

#### **YAML**

```yaml
# Use scenario hooks for setup/teardown
scenarios:
  - name: "Proper Hook Usage"
    hooks:
      beforeScenario: |
        // One-time setup per scenario
        context.variables.session = await createSession();

      afterScenario: |
        // One-time cleanup per scenario
        await cleanupSession(context.variables.session);

      beforeStep: |
        // Per-step preparation (keep minimal)
        context.variables.step_start = Date.now();

      afterStep: |
        // Per-step processing (keep minimal)
        logStepDuration(Date.now() - context.variables.step_start);
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

// Use scenario hooks for setup/teardown
test('Proper Hook Usage')
  .scenario('Proper Hook Usage')
    .beforeScenario(async (context) => {
      // One-time setup per scenario
      context.variables.session = await createSession();
    })
    .afterScenario(async (context) => {
      // One-time cleanup per scenario
      await cleanupSession(context.variables.session);
    })
    .beforeStep(async (context) => {
      // Per-step preparation (keep minimal)
      context.variables.step_start = Date.now();
    })
    .afterStep(async (context) => {
      // Per-step processing (keep minimal)
      logStepDuration(Date.now() - context.variables.step_start);
    })
    .done()
  .build();
```

<!-- tabs:end -->

### 3. Handle Errors Gracefully

<!-- tabs:start -->

#### **YAML**

```yaml
hooks:
  beforeScenario: |
    try {
      context.variables.auth_token = await getAuthToken();
    } catch (error) {
      console.warn('Auth failed, using anonymous mode:', error.message);
      context.variables.auth_token = null;
      context.variables.anonymous_mode = true;
    }

  beforeStep: |
    // Never throw in beforeStep unless you want to stop the test
    try {
      if (step.requiresAuth && !context.variables.auth_token) {
        step.skip = true;
        return;
      }
    } catch (error) {
      console.error('Hook error:', error.message);
      // Don't re-throw unless critical
    }
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Handle Errors Gracefully')
  .scenario('Example')
    .beforeScenario(async (context) => {
      try {
        context.variables.auth_token = await getAuthToken();
      } catch (error) {
        console.warn('Auth failed, using anonymous mode:', error.message);
        context.variables.auth_token = null;
        context.variables.anonymous_mode = true;
      }
    })
    .beforeStep(async (context, step) => {
      // Never throw in beforeStep unless you want to stop the test
      try {
        if (step.requiresAuth && !context.variables.auth_token) {
          step.skip = true;
          return;
        }
      } catch (error) {
        console.error('Hook error:', error.message);
        // Don't re-throw unless critical
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### 4. Use Global Context Wisely

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Global Context Usage"
    hooks:
      beforeScenario: |
        // Share data between VUs carefully
        if (!context.global.shared_counter) {
          context.global.shared_counter = 0;
        }

        // Atomic operations for shared data
        context.global.shared_counter++;
        context.variables.vu_number = context.global.shared_counter;

      afterScenario: |
        // Cleanup global data when appropriate
        if (context.vu_id === 1) { // Only first VU cleans up
          console.log('Final shared counter:', context.global.shared_counter);
        }
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Global Context Usage')
  .scenario('Global Context Usage')
    .beforeScenario(async (context) => {
      // Share data between VUs carefully
      if (!context.global.shared_counter) {
        context.global.shared_counter = 0;
      }

      // Atomic operations for shared data
      context.global.shared_counter++;
      context.variables.vu_number = context.global.shared_counter;
    })
    .afterScenario(async (context) => {
      // Cleanup global data when appropriate
      if (context.vu_id === 1) { // Only first VU cleans up
        console.log('Final shared counter:', context.global.shared_counter);
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### 5. Document Hook Behavior

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Well-Documented Hooks"
    hooks:
      beforeScenario: |
        /**
         * Scenario Setup Hook
         * - Authenticates user with test credentials
         * - Initializes performance tracking
         * - Sets up temporary data for test
         */
        console.log(`VU ${context.vu_id}: Starting scenario setup`);

        // Authentication
        context.variables.auth_token = await authenticateUser();

        // Performance tracking
        context.variables.perf_start = Date.now();

        // Test data
        context.variables.test_session = faker.string.uuid();

      afterScenario: |
        /**
         * Scenario Cleanup Hook
         * - Logs performance metrics
         * - Cleans up temporary data
         * - Invalidates authentication
         */
        const duration = Date.now() - context.variables.perf_start;
        console.log(`VU ${context.vu_id}: Scenario completed in ${duration}ms`);

        await cleanupTestData(context.variables.test_session);
        await invalidateAuth(context.variables.auth_token);
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('Well-Documented Hooks')
  .scenario('Well-Documented Hooks')
    .beforeScenario(async (context) => {
      /**
       * Scenario Setup Hook
       * - Authenticates user with test credentials
       * - Initializes performance tracking
       * - Sets up temporary data for test
       */
      console.log(`VU ${context.vu_id}: Starting scenario setup`);

      // Authentication
      context.variables.auth_token = await authenticateUser();

      // Performance tracking
      context.variables.perf_start = Date.now();

      // Test data
      context.variables.test_session = faker.string.uuid();
    })
    .afterScenario(async (context) => {
      /**
       * Scenario Cleanup Hook
       * - Logs performance metrics
       * - Cleans up temporary data
       * - Invalidates authentication
       */
      const duration = Date.now() - context.variables.perf_start;
      console.log(`VU ${context.vu_id}: Scenario completed in ${duration}ms`);

      await cleanupTestData(context.variables.test_session);
      await invalidateAuth(context.variables.auth_token);
    })
    .done()
  .build();
```

<!-- tabs:end -->

Hooks provide powerful capabilities for customizing test behavior, handling complex setup and cleanup operations, and implementing sophisticated test patterns. Use them strategically to create maintainable and robust performance tests.
# Default HTTP Headers

Configure default HTTP headers in the global configuration that will be applied to all REST API requests.

## Features

- **Global Headers**: Set headers once in `global.headers` that apply to all requests
- **Header Merging**: Step-specific headers are merged with (and can override) default headers
- **Common Use Cases**:
  - Authentication tokens
  - API keys
  - User-Agent strings
  - Content-Type preferences
  - Custom tracking headers

## YAML Configuration

### Basic Example

<!-- tabs:start -->

#### **YAML**

```yaml
name: "API Test with Headers"

global:
  base_url: "https://api.example.com"
  # Default headers applied to all requests
  headers:
    User-Agent: "Perfornium/1.0"
    X-API-Version: "v1"
    Accept: "application/json"

load:
  pattern: "basic"
  virtual_users: 10
  duration: "1m"

scenarios:
  - name: "api_requests"
    steps:
      # This request inherits all default headers
      - method: "GET"
        path: "/users"
        checks:
          - type: "status"
            value: 200
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('API Test with Headers')
  .baseUrl('https://api.example.com')

  .headers({
    'User-Agent': 'Perfornium/1.0',
    'X-API-Version': 'v1',
    'Accept': 'application/json'
  })

  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '1m'
  })

  .scenario('api_requests', 100)
    .get('/users')
      .check('status', 200)
    .done()

  .build();
```

<!-- tabs:end -->

### Authentication Example

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  base_url: "https://api.example.com"
  headers:
    Authorization: "Bearer your-token-here"
    X-API-Key: "your-api-key"
    Content-Type: "application/json"

scenarios:
  - name: "authenticated_requests"
    steps:
      - method: "GET"
        path: "/protected/resource"
        checks:
          - type: "status"
            value: 200
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Authenticated Requests')
  .baseUrl('https://api.example.com')

  .headers({
    'Authorization': 'Bearer your-token-here',
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json'
  })

  .scenario('authenticated_requests', 100)
    .get('/protected/resource')
      .check('status', 200)
    .done()

  .build();
```

<!-- tabs:end -->

### Overriding Default Headers

Step-specific headers will merge with and override default headers:

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  headers:
    User-Agent: "Default-Agent"
    X-Default-Header: "default-value"

scenarios:
  - name: "override_example"
    steps:
      # This request gets both headers
      - method: "GET"
        path: "/endpoint1"

      # This request overrides User-Agent but keeps X-Default-Header
      - method: "GET"
        path: "/endpoint2"
        headers:
          User-Agent: "Custom-Agent"
          X-Request-ID: "custom-id"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Override Example')
  .headers({
    'User-Agent': 'Default-Agent',
    'X-Default-Header': 'default-value'
  })

  .scenario('override_example', 100)
    // This request gets both headers
    .get('/endpoint1')

    // This request overrides User-Agent but keeps X-Default-Header
    .get('/endpoint2')
      .header('User-Agent', 'Custom-Agent')
      .header('X-Request-ID', 'custom-id')

    .done()

  .build();
```

<!-- tabs:end -->

## TypeScript DSL

### Basic Usage

```typescript
import { test, load } from '@testsmith/perfornium/dsl';

const config = test('API Test')
  .baseUrl('https://api.example.com')

  // Set default headers
  .headers({
    'User-Agent': 'Perfornium/1.0',
    'X-API-Version': 'v1',
    'Accept': 'application/json'
  })

  .withLoad(load().pattern('basic').vus(10).duration('1m'))

  .scenario('API Requests', 100)
    .get('/users')
      .check('status', 200)
    .done()

  .build();
```

### Multiple Header Sets

You can call `.headers()` multiple times to merge headers:

```typescript
const config = test('Multi-Header Test')
  .baseUrl('https://api.example.com')

  // Set authentication headers
  .headers({
    'Authorization': 'Bearer token123',
    'X-API-Key': 'key456'
  })

  // Add more headers (merged with previous)
  .headers({
    'User-Agent': 'Perfornium/1.0',
    'Accept': 'application/json'
  })

  .scenario('Test', 100)
    .get('/endpoint')
      .check('status', 200)
    .done()

  .build();
```

### Environment-Based Headers

```typescript
const environment = process.env.ENV || 'staging';
const apiToken = process.env.API_TOKEN;

const config = test('Environment Test')
  .baseUrl(`https://api-${environment}.example.com`)

  .headers({
    'Authorization': `Bearer ${apiToken}`,
    'X-Environment': environment,
    'X-Test-Run-ID': `test-${Date.now()}`
  })

  .scenario('Health Check', 100)
    .get('/health')
      .check('status', 200)
    .done()

  .build();
```

## How It Works

1. **Global Configuration**: Headers defined in `global.headers` are passed to the REST protocol handler during initialization
2. **Request Building**: When building each request, the handler merges:
   - Default headers (from global config)
   - Step-specific headers (from the step definition)
3. **Priority**: Step-specific headers take precedence over default headers with the same name
4. **Automatic Headers**: The framework adds some headers automatically:
   - `Connection: keep-alive` (for connection pooling)
   - `Keep-Alive: timeout=30`
   - `Content-Type` (based on payload type if not specified)

## Common Use Cases

### API Authentication

```yaml
global:
  base_url: "https://api.example.com"
  headers:
    Authorization: "Bearer {{API_TOKEN}}"
```

### API Versioning

```yaml
global:
  headers:
    Accept: "application/vnd.myapi.v2+json"
    X-API-Version: "2.0"
```

### Custom User Agent

```yaml
global:
  headers:
    User-Agent: "MyLoadTest/1.0 (Perfornium)"
```

### Request Tracking

```yaml
global:
  headers:
    X-Request-Source: "load-test"
    X-Test-ID: "{{TEST_RUN_ID}}"
```

## Notes

- Headers are case-insensitive per HTTP specification, but preserved as specified
- Default headers apply only to REST/HTTP requests, not SOAP or Web tests
- You can use Handlebars variables in header values (e.g., `{{API_TOKEN}}`)
- Empty header values are supported
- Special characters in header values should follow HTTP header field content rules

## Examples

Complete working examples are available:

- **YAML**: [tests/api/headers-test.yml](../../tests/api/headers-test.yml)
- **TypeScript**: [tmp/test-project/tests/rest/headers-example.ts](../../tmp/test-project/tests/rest/headers-example.ts)

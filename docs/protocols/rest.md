# REST API Testing

The REST protocol handler in Perfornium provides comprehensive HTTP/HTTPS testing capabilities with support for all HTTP methods, authentication, data extraction, and advanced validation.

## Basic REST Configuration

### Simple GET Request

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Get User List"
    type: "rest"
    method: "GET"
    path: "/users"
    headers:
      Content-Type: "application/json"
      Accept: "application/json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Get Users')
    .get('/users', {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### POST with JSON Body

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Create User"
    type: "rest"
    method: "POST"
    path: "/users"
    headers:
      Content-Type: "application/json"
    body: |
      {
        "name": "{{faker.person.fullName}}",
        "email": "{{faker.internet.email}}",
        "role": "user"
      }
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Create User')
    .post('/users', {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      role: 'user'
    })
    .done()
  .build();
```

<!-- tabs:end -->


## HTTP Methods

Perfornium supports all standard HTTP methods:

### GET Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Fetch Resource"
  type: "rest"
  method: "GET"
  path: "/api/resource/{{id}}"
  headers:
    Authorization: "Bearer {{token}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Fetch Resource')
    .get('/api/resource/${context.variables.id}')
    .withBearerToken('${context.variables.token}')
    .done()
  .build();
```

<!-- tabs:end -->


### POST Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Create Resource"
  type: "rest"
  method: "POST"
  path: "/api/resources"
  headers:
    Content-Type: "application/json"
  body: |
    {
      "title": "{{title}}",
      "content": "{{content}}"
    }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Create Resource')
    .post('/api/resources', {
      title: '${context.variables.title}',
      content: '${context.variables.content}'
    })
    .done()
  .build();
```

<!-- tabs:end -->


### PUT Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Update Resource"
  type: "rest"
  method: "PUT"
  path: "/api/resources/{{id}}"
  headers:
    Content-Type: "application/json"
  body: |
    {
      "title": "Updated Title",
      "content": "Updated content"
    }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Update Resource')
    .put('/api/resources/${context.variables.id}', {
      title: 'Updated Title',
      content: 'Updated content'
    })
    .done()
  .build();
```

<!-- tabs:end -->


### PATCH Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Partial Update"
  type: "rest"
  method: "PATCH"
  path: "/api/resources/{{id}}"
  headers:
    Content-Type: "application/json"
  body: |
    {
      "status": "published"
    }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Partial Update')
    .patch('/api/resources/${context.variables.id}', {
      status: 'published'
    })
    .done()
  .build();
```

<!-- tabs:end -->


### DELETE Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Delete Resource"
  type: "rest"
  method: "DELETE"
  path: "/api/resources/{{id}}"
  headers:
    Authorization: "Bearer {{token}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Delete Resource')
    .delete('/api/resources/${context.variables.id}')
    .withBearerToken('${context.variables.token}')
    .done()
  .build();
```

<!-- tabs:end -->


## Authentication

### Bearer Token Authentication

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Authenticated API Calls"
    hooks:
      beforeScenario: |
        // Login and get token
        const response = await fetch(`${global.base_url}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'testuser',
            password: 'testpass'
          })
        });
        const data = await response.json();
        context.variables.token = data.access_token;
    steps:
      - name: "Get Protected Resource"
        type: "rest"
        method: "GET"
        path: "/protected/resource"
        headers:
          Authorization: "Bearer {{token}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .baseUrl('https://api.example.com')
  .scenario('Authenticated API Calls')
    .beforeScenario(async (context) => {
      const response = await fetch(`${context.global.base_url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpass'
        })
      });
      const data = await response.json();
      context.variables.token = data.access_token;
    })
    .get('/protected/resource')
    .withBearerToken('${context.variables.token}')
    .done()
  .build();
```

<!-- tabs:end -->


### Basic Authentication

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Basic Auth Request"
    type: "rest"
    method: "GET"
    path: "/protected"
    headers:
      Authorization: "Basic {{base64(username + ':' + password)}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Basic Auth Request')
    .get('/protected')
    .withBasicAuth('${context.variables.username}', '${context.variables.password}')
    .done()
  .build();
```

<!-- tabs:end -->


### API Key Authentication

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  headers:
    X-API-Key: "your-api-key-here"

steps:
  - name: "API Key Request"
    type: "rest"
    method: "GET"
    path: "/api/data"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .headers({
    'X-API-Key': 'your-api-key-here'
  })
  .scenario('API Key Request')
    .get('/api/data')
    .done()
  .build();
```

<!-- tabs:end -->


### Custom Authentication Headers

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Custom Auth"
    type: "rest"
    method: "GET"
    path: "/api/secure"
    headers:
      X-Custom-Auth: "{{custom_token}}"
      X-User-ID: "{{user_id}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Custom Auth')
    .get('/api/secure')
    .withHeaders({
      'X-Custom-Auth': '${context.variables.custom_token}',
      'X-User-ID': '${context.variables.user_id}'
    })
    .done()
  .build();
```

<!-- tabs:end -->


## Request Body Formats

### JSON Body

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "JSON Request"
  type: "rest"
  method: "POST"
  path: "/api/data"
  headers:
    Content-Type: "application/json"
  body: |
    {
      "user": {
        "name": "{{faker.person.fullName}}",
        "age": {{faker.number.int({min: 18, max: 65})}},
        "preferences": {
          "theme": "dark",
          "notifications": true
        }
      }
    }
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('JSON Request')
    .post('/api/data', {
      user: {
        name: faker.person.fullName(),
        age: faker.number.int({ min: 18, max: 65 }),
        preferences: {
          theme: 'dark',
          notifications: true
        }
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### Form Data

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Form Data Request"
  type: "rest"
  method: "POST"
  path: "/api/form"
  headers:
    Content-Type: "application/x-www-form-urlencoded"
  body: "name={{name}}&email={{email}}&age={{age}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Form Data Request')
    .post('/api/form', `name=${context.variables.name}&email=${context.variables.email}&age=${context.variables.age}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### XML Body

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "XML Request"
  type: "rest"
  method: "POST"
  path: "/api/xml"
  headers:
    Content-Type: "application/xml"
  body: |
    <?xml version="1.0" encoding="UTF-8"?>
    <user>
      <name>{{name}}</name>
      <email>{{email}}</email>
    </user>
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('XML Request')
    .post('/api/xml', `<?xml version="1.0" encoding="UTF-8"?>
<user>
  <name>${context.variables.name}</name>
  <email>${context.variables.email}</email>
</user>`, {
      headers: {
        'Content-Type': 'application/xml'
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### File Upload (Multipart)

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "File Upload"
  type: "rest"
  method: "POST"
  path: "/api/upload"
  headers:
    Content-Type: "multipart/form-data"
  body:
    type: "multipart"
    fields:
      - name: "file"
        type: "file"
        path: "test-data/sample.pdf"
      - name: "description"
        type: "text"
        value: "Test file upload"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('File Upload')
    .post('/api/upload', {
      type: 'multipart',
      fields: [
        { name: 'file', type: 'file', path: 'test-data/sample.pdf' },
        { name: 'description', type: 'text', value: 'Test file upload' }
      ]
    }, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### JSON from External File (jsonFile)

Load request payloads from external JSON files with dynamic overrides. This is useful for:
- Reusing complex payloads across multiple tests
- Keeping test configurations clean
- Overriding specific values with faker data or variables

<!-- tabs:start -->

#### **YAML**
```yaml
# Basic usage - load entire payload from file
- name: "Create User from Template"
  type: "rest"
  method: "POST"
  path: "/users"
  jsonFile: "payloads/create-user.json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Create User from Template')
    .post('/users', {
      jsonFile: 'payloads/create-user.json'
    })
    .done()
  .build();
```

<!-- tabs:end -->


**With Dynamic Overrides**

Override specific fields with variables, faker data, or extracted values:

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Create User with Faker Data"
  type: "rest"
  method: "POST"
  path: "/users"
  jsonFile: "payloads/create-user.json"
  overrides:
    # Simple field override
    name: "{{faker.person.fullName}}"
    email: "{{faker.internet.email}}"

    # Nested field override (dot notation)
    profile.firstName: "{{faker.person.firstName}}"
    profile.lastName: "{{faker.person.lastName}}"

    # Override with VU context
    profile.bio: "Created by VU {{__VU}} at iteration {{__ITER}}"

    # Override with extracted data
    organizationId: "{{org_id}}"

    # Override with static values
    settings.notifications: false
    settings.theme: "dark"
    age: 30
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Create User with Faker Data')
    .post('/users', {
      jsonFile: 'payloads/create-user.json',
      overrides: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        'profile.firstName': faker.person.firstName(),
        'profile.lastName': faker.person.lastName(),
        'profile.bio': `Created by VU ${context.__VU} at iteration ${context.__ITER}`,
        organizationId: '${context.variables.org_id}',
        'settings.notifications': false,
        'settings.theme': 'dark',
        age: 30
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


**Example Payload File** (`payloads/create-user.json`):

```json
{
  "name": "Default User",
  "email": "default@example.com",
  "age": 25,
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "bio": "Default bio"
  },
  "settings": {
    "notifications": true,
    "theme": "light"
  }
}
```

**Multi-Step Example with Data Flow**

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "User Registration Flow"
    steps:
      - name: "Create Organization"
        type: "rest"
        method: "POST"
        path: "/organizations"
        json:
          name: "{{faker.company.name}}"
        extract:
          - name: "org_id"
            type: "json_path"
            expression: "$.id"

      - name: "Create User in Organization"
        type: "rest"
        method: "POST"
        path: "/users"
        jsonFile: "payloads/create-user.json"
        overrides:
          name: "{{faker.person.fullName}}"
          email: "{{faker.internet.email}}"
          organizationId: "{{org_id}}"
          profile.firstName: "{{faker.person.firstName}}"

      - name: "Update User Profile"
        type: "rest"
        method: "PUT"
        path: "/users/{{user_id}}"
        jsonFile: "payloads/update-user.json"
        overrides:
          profile.bio: "Updated at {{timestamp}}"
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('User Registration Flow')
    .post('/organizations', {
      name: faker.company.name()
    })
    .extract('org_id', '$.id')

    .post('/users', {
      jsonFile: 'payloads/create-user.json',
      overrides: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        organizationId: '${context.variables.org_id}',
        'profile.firstName': faker.person.firstName()
      }
    })

    .put('/users/${context.variables.user_id}', {
      jsonFile: 'payloads/update-user.json',
      overrides: {
        'profile.bio': `Updated at ${new Date().toISOString()}`
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


## Response Validation

### Status Code Checks

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "status"
    value: 200
    description: "Should return 200 OK"

  - type: "status"
    value: [200, 201, 202]
    description: "Should return success status"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Status Code Checks')
    .get('/api/resource')
    .check('status', 200, 'Should return 200 OK')
    .check('status', [200, 201, 202], 'Should return success status')
    .done()
  .build();
```

<!-- tabs:end -->


### Response Time Checks

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "response_time"
    value: "<2000"
    description: "Should respond within 2 seconds"

  - type: "response_time"
    value: ">=100"
    description: "Should take at least 100ms"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Response Time Checks')
    .get('/api/resource')
    .check('response_time', '<2000', 'Should respond within 2 seconds')
    .check('response_time', '>=100', 'Should take at least 100ms')
    .done()
  .build();
```

<!-- tabs:end -->


### Header Validation

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "header"
    name: "Content-Type"
    value: "application/json"
    description: "Should return JSON content"

  - type: "header"
    name: "X-Rate-Limit-Remaining"
    operator: ">"
    expected: 0
    description: "Should have rate limit remaining"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Header Validation')
    .get('/api/resource')
    .check('header', { name: 'Content-Type', value: 'application/json' }, 'Should return JSON content')
    .check('header', { name: 'X-Rate-Limit-Remaining', operator: '>', expected: 0 }, 'Should have rate limit remaining')
    .done()
  .build();
```

<!-- tabs:end -->


### JSON Response Validation

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "json_path"
    value: "$.user.id"
    description: "Response should contain user ID"

  - type: "json_path"
    value: "$.users.length"
    operator: ">"
    expected: 0
    description: "Should return at least one user"

  - type: "json_path"
    value: "$.status"
    expected: "success"
    description: "Status should be success"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('JSON Response Validation')
    .get('/api/user')
    .check('json_path', '$.user.id', 'Response should contain user ID')
    .check('json_path', { value: '$.users.length', operator: '>', expected: 0 }, 'Should return at least one user')
    .check('json_path', { value: '$.status', expected: 'success' }, 'Status should be success')
    .done()
  .build();
```

<!-- tabs:end -->


### Text Content Validation

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "text_contains"
    value: "success"
    description: "Response should contain 'success'"

  - type: "text_matches"
    value: "User \\d+ created"
    description: "Should match user creation pattern"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Text Content Validation')
    .get('/api/status')
    .check('text_contains', 'success', 'Response should contain \'success\'')
    .check('text_matches', 'User \\d+ created', 'Should match user creation pattern')
    .done()
  .build();
```

<!-- tabs:end -->


### Custom Validation

<!-- tabs:start -->

#### **YAML**
```yaml
checks:
  - type: "custom"
    script: |
      const data = JSON.parse(result.body);
      const isValid = data.users.every(user =>
        user.email && user.email.includes('@')
      );
      return isValid;
    description: "All users should have valid email addresses"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Custom Validation')
    .get('/api/users')
    .check('custom', (result) => {
      const data = JSON.parse(result.body);
      return data.users.every(user =>
        user.email && user.email.includes('@')
      );
    }, 'All users should have valid email addresses')
    .done()
  .build();
```

<!-- tabs:end -->


## Data Extraction

### JSON Path Extraction

<!-- tabs:start -->

#### **YAML**
```yaml
extract:
  - name: "user_id"
    type: "json_path"
    expression: "$.user.id"
    default: ""

  - name: "token"
    type: "json_path"
    expression: "$.access_token"

  - name: "user_list"
    type: "json_path"
    expression: "$.users[*].id"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('JSON Path Extraction')
    .get('/api/user')
    .extract('user_id', '$.user.id')
    .extract('token', '$.access_token')
    .extract('user_list', '$.users[*].id')
    .done()
  .build();
```

<!-- tabs:end -->


### Header Extraction

<!-- tabs:start -->

#### **YAML**
```yaml
extract:
  - name: "session_id"
    type: "header"
    name: "X-Session-ID"

  - name: "rate_limit"
    type: "header"
    name: "X-Rate-Limit-Remaining"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Header Extraction')
    .get('/api/resource')
    .extract('session_id', { type: 'header', name: 'X-Session-ID' })
    .extract('rate_limit', { type: 'header', name: 'X-Rate-Limit-Remaining' })
    .done()
  .build();
```

<!-- tabs:end -->


### Regex Extraction

<!-- tabs:start -->

#### **YAML**
```yaml
extract:
  - name: "csrf_token"
    type: "regex"
    expression: 'csrf_token=([^;]+)'
    default: ""

  - name: "order_number"
    type: "regex"
    expression: 'Order #(\\d+)'
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Regex Extraction')
    .get('/api/page')
    .extract('csrf_token', { type: 'regex', expression: 'csrf_token=([^;]+)' })
    .extract('order_number', { type: 'regex', expression: 'Order #(\\d+)' })
    .done()
  .build();
```

<!-- tabs:end -->


### Custom Extraction

<!-- tabs:start -->

#### **YAML**
```yaml
extract:
  - name: "processed_data"
    type: "custom"
    script: |
      const data = JSON.parse(result.body);
      return {
        count: data.items.length,
        total_value: data.items.reduce((sum, item) => sum + item.value, 0)
      };
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Custom Extraction')
    .get('/api/items')
    .extract('processed_data', (result) => {
      const data = JSON.parse(result.body);
      return {
        count: data.items.length,
        total_value: data.items.reduce((sum, item) => sum + item.value, 0)
      };
    })
    .done()
  .build();
```

<!-- tabs:end -->


## Advanced Configuration

### Request Timeout

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Slow API Call"
  type: "rest"
  method: "GET"
  path: "/slow-endpoint"
  timeout: 60000  # 60 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .timeout(60000)
  .scenario('Slow API Call')
    .get('/slow-endpoint')
    .done()
  .build();
```

<!-- tabs:end -->


### Follow Redirects

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Redirect Request"
  type: "rest"
  method: "GET"
  path: "/redirect-me"
  follow_redirects: true
  max_redirects: 5
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Redirect Request')
    .get('/redirect-me', {
      follow_redirects: true,
      max_redirects: 5
    })
    .done()
  .build();
```

<!-- tabs:end -->


### SSL Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  ssl:
    verify_certificates: false
    client_cert: "path/to/client.crt"
    client_key: "path/to/client.key"
    ca_cert: "path/to/ca.crt"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .ssl({
    verify_certificates: false,
    client_cert: 'path/to/client.crt',
    client_key: 'path/to/client.key',
    ca_cert: 'path/to/ca.crt'
  })
  .scenario('SSL Request')
    .get('/api/secure')
    .done()
  .build();
```

<!-- tabs:end -->


### Proxy Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  proxy:
    http: "http://proxy.example.com:8080"
    https: "https://proxy.example.com:8080"
    no_proxy: ["localhost", "127.0.0.1"]
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .proxy({
    http: 'http://proxy.example.com:8080',
    https: 'https://proxy.example.com:8080',
    no_proxy: ['localhost', '127.0.0.1']
  })
  .scenario('Proxied Request')
    .get('/api/data')
    .done()
  .build();
```

<!-- tabs:end -->


### Cookie Handling

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Cookie-based Session"
    cookie_jar: true  # Enable automatic cookie handling
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
        body: |
          {
            "username": "test",
            "password": "test"
          }

      - name: "Access Protected"
        type: "rest"
        method: "GET"
        path: "/protected"
        # Cookies from login will be automatically included
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Cookie-based Session')
    .cookieJar(true)
    .post('/login', {
      username: 'test',
      password: 'test'
    })
    .get('/protected')
    // Cookies from login will be automatically included
    .done()
  .build();
```

<!-- tabs:end -->


## Performance Considerations

### Connection Pooling

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  connection_pool:
    max_connections: 100
    max_connections_per_host: 10
    keep_alive_timeout: 30000
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .connectionPool({
    max_connections: 100,
    max_connections_per_host: 10,
    keep_alive_timeout: 30000
  })
  .scenario('Pooled Requests')
    .get('/api/data')
    .done()
  .build();
```

<!-- tabs:end -->


### Request Compression

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  compression: true

steps:
  - name: "Compressed Request"
    type: "rest"
    method: "POST"
    path: "/api/large-data"
    headers:
      Content-Encoding: "gzip"
      Accept-Encoding: "gzip, deflate"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .compression(true)
  .scenario('Compressed Request')
    .post('/api/large-data', {})
    .withHeaders({
      'Content-Encoding': 'gzip',
      'Accept-Encoding': 'gzip, deflate'
    })
    .done()
  .build();
```

<!-- tabs:end -->


### Batch Requests

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Batch API Calls"
  type: "rest"
  method: "POST"
  path: "/api/batch"
  body: |
    {
      "requests": [
        {"method": "GET", "path": "/users/1"},
        {"method": "GET", "path": "/users/2"},
        {"method": "GET", "path": "/users/3"}
      ]
    }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Batch API Calls')
    .post('/api/batch', {
      requests: [
        { method: 'GET', path: '/users/1' },
        { method: 'GET', path: '/users/2' },
        { method: 'GET', path: '/users/3' }
      ]
    })
    .done()
  .build();
```

<!-- tabs:end -->


## Error Handling

### Retry Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "Reliable API Call"
  type: "rest"
  method: "GET"
  path: "/unreliable-endpoint"
  retry:
    count: 3
    delay: "1s"
    on_status: [500, 502, 503, 504]
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Reliable API Call')
    .get('/unreliable-endpoint', {
      retry: {
        count: 3,
        delay: '1s',
        on_status: [500, 502, 503, 504]
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


### Error Response Handling

<!-- tabs:start -->

#### **YAML**
```yaml
- name: "API Call with Error Handling"
  type: "rest"
  method: "POST"
  path: "/api/create"
  body: '{"data": "test"}'
  on_error:
    continue: true
    extract:
      - name: "error_code"
        type: "json_path"
        expression: "$.error.code"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('API Call with Error Handling')
    .post('/api/create', { data: 'test' }, {
      on_error: {
        continue: true,
        extract: [
          { name: 'error_code', type: 'json_path', expression: '$.error.code' }
        ]
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->


## Best Practices

### 1. Use Base URL

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  base_url: "https://api.example.com/v1"

steps:
  - name: "Get Users"
    type: "rest"
    method: "GET"
    path: "/users"  # Will be https://api.example.com/v1/users
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .baseUrl('https://api.example.com/v1')
  .scenario('Get Users')
    .get('/users')  // Will be https://api.example.com/v1/users
    .done()
  .build();
```

<!-- tabs:end -->


### 2. Environment-Specific Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
# Base configuration
global:
  timeout: 30000

# Environment overrides
environments:
  staging:
    base_url: "https://staging-api.example.com"
    headers:
      X-Environment: "staging"
  production:
    base_url: "https://api.example.com"
    headers:
      X-Environment: "production"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .timeout(30000)
  .environment('staging', {
    base_url: 'https://staging-api.example.com',
    headers: {
      'X-Environment': 'staging'
    }
  })
  .environment('production', {
    base_url: 'https://api.example.com',
    headers: {
      'X-Environment': 'production'
    }
  })
  .scenario('Environment-specific Request')
    .get('/api/data')
    .done()
  .build();
```

<!-- tabs:end -->


### 3. Reusable Headers

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  headers:
    User-Agent: "Perfornium-LoadTest/1.0"
    Accept: "application/json"
    Content-Type: "application/json"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .headers({
    'User-Agent': 'Perfornium-LoadTest/1.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  })
  .scenario('Reusable Headers')
    .get('/api/data')
    .done()
  .build();
```

<!-- tabs:end -->


### 4. Data-Driven Testing

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "User CRUD Operations"
    csv_data:
      file: "test-data/users.csv"
      mode: "sequential"
    steps:
      - name: "Create User"
        type: "rest"
        method: "POST"
        path: "/users"
        body: |
          {
            "name": "{{name}}",
            "email": "{{email}}",
            "department": "{{department}}"
          }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('User CRUD Operations')
    .csvData({
      file: 'test-data/users.csv',
      mode: 'sequential'
    })
    .post('/users', {
      name: '${context.variables.name}',
      email: '${context.variables.email}',
      department: '${context.variables.department}'
    })
    .done()
  .build();
```

<!-- tabs:end -->


### 5. Response Validation Chain

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Create and Validate User"
    type: "rest"
    method: "POST"
    path: "/users"
    body: '{"name": "Test User", "email": "test@example.com"}'
    checks:
      - type: "status"
        value: 201
      - type: "json_path"
        value: "$.id"
        description: "Should return user ID"
      - type: "json_path"
        value: "$.email"
        expected: "test@example.com"
    extract:
      - name: "new_user_id"
        type: "json_path"
        expression: "$.id"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('REST API Test')
  .scenario('Create and Validate User')
    .post('/users', {
      name: 'Test User',
      email: 'test@example.com'
    })
    .check('status', 201)
    .check('json_path', '$.id', 'Should return user ID')
    .check('json_path', { value: '$.email', expected: 'test@example.com' })
    .extract('new_user_id', '$.id')
    .done()
  .build();
```

<!-- tabs:end -->


This REST protocol documentation provides comprehensive coverage of HTTP/HTTPS testing capabilities in Perfornium, from basic requests to advanced authentication and validation scenarios.
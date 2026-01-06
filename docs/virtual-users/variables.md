# Variables & Templating

Perfornium's powerful variables and templating system allows you to create dynamic, data-driven tests with realistic data generation, parameter extraction, and complex data relationships.

## Variable Types

### Static Variables

Define static values that remain constant:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Static Variables Example"
    variables:
      api_version: "v2"
      app_name: "MyApp"
      default_timeout: 30000
      admin_email: "admin@example.com"
    steps:
      - name: "API Call with Static Variables"
        type: "rest"
        method: "GET"
        path: "/{{api_version}}/status"
        headers:
          X-App-Name: "{{app_name}}"
        timeout: "{{default_timeout}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Static Variables Example')
  .baseUrl('https://api.example.com')
  .scenario('Static Variables Example')
    .variables({
      api_version: 'v2',
      app_name: 'MyApp',
      default_timeout: 30000,
      admin_email: 'admin@example.com'
    })
    .get('/{{api_version}}/status', {
      headers: {
        'X-App-Name': '{{app_name}}'
      },
      timeout: '{{default_timeout}}'
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Dynamic Variables

Variables that change during test execution:

```yaml
scenarios:
  - name: "Dynamic Variables Example"
    hooks:
      beforeScenario: |
        // Set dynamic variables
        context.variables.session_id = faker.string.uuid();
        context.variables.timestamp = Date.now();
        context.variables.request_count = 0;
        
      beforeStep: |
        // Update variables before each step
        context.variables.request_count++;
        context.variables.current_time = new Date().toISOString();
    steps:
      - name: "Dynamic Request"
        type: "rest"
        method: "POST"
        path: "/api/events"
        body: |
          {
            "session_id": "{{session_id}}",
            "timestamp": {{timestamp}},
            "request_number": {{request_count}},
            "event_time": "{{current_time}}"
          }
```

### Extracted Variables

Variables extracted from responses:

```yaml
scenarios:
  - name: "Data Extraction Flow"
    steps:
      - name: "Login and Extract Token"
        type: "rest"
        method: "POST"
        path: "/auth/login"
        body: '{"username": "test", "password": "test"}'
        extract:
          - name: "auth_token"
            type: "json_path"
            expression: "$.token"
          - name: "user_id"
            type: "json_path"
            expression: "$.user.id"
          - name: "expires_at"
            type: "json_path"
            expression: "$.expires_at"
            
      - name: "Use Extracted Variables"
        type: "rest"
        method: "GET"
        path: "/users/{{user_id}}/profile"
        headers:
          Authorization: "Bearer {{auth_token}}"
        checks:
          - type: "custom"
            script: |
              const expiresAt = new Date(context.variables.expires_at);
              return expiresAt > new Date();
            description: "Token should not be expired"
```

## Templating Syntax

### Basic Template Syntax

```yaml
# Simple variable substitution
path: "/users/{{user_id}}"

# Variables in JSON bodies
body: |
  {
    "name": "{{user_name}}",
    "age": {{user_age}},
    "active": {{is_active}}
  }

# Variables in headers
headers:
  Authorization: "Bearer {{token}}"
  X-User-ID: "{{user_id}}"
```

### Conditional Templates

```yaml
scenarios:
  - name: "Conditional Templating"
    variables:
      user_type: "premium"
      include_metadata: true
    steps:
      - name: "Conditional Request"
        type: "rest"
        method: "POST"
        path: "/api/data"
        body: |
          {
            "user_type": "{{user_type}}",
            {{#if include_metadata}}
            "metadata": {
              "source": "performance_test",
              "timestamp": "{{faker.date.recent}}"
            },
            {{/if}}
            {{#equals user_type "premium"}}
            "premium_features": ["analytics", "priority_support"],
            {{/equals}}
            "basic_data": "{{faker.lorem.sentence}}"
          }
```

### Loops and Arrays

```yaml
scenarios:
  - name: "Array Templating"
    variables:
      product_ids: [101, 102, 103, 104, 105]
      categories: ["electronics", "books", "clothing"]
    steps:
      - name: "Batch Request"
        type: "rest"
        method: "POST"
        path: "/api/batch-process"
        body: |
          {
            "products": [
              {{#each product_ids}}
              {
                "id": {{this}},
                "category": "{{lookup ../categories @index}}"
              }{{#unless @last}},{{/unless}}
              {{/each}}
            ]
          }
```

## Faker.js Integration

Perfornium integrates with [Faker.js](https://fakerjs.dev/) for generating realistic test data. Faker is **lazily loaded** - it's only initialized when your test actually uses faker expressions, keeping startup time fast for tests that don't need dynamic data generation.

### Supported Locales

Configure faker locale in your global settings:

```yaml
global:
  faker:
    locale: "de"        # German locale (en, de, fr, es, nl supported)
    seed: 12345         # Optional: for reproducible data
```

### Basic Faker Usage

Generate realistic fake data:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Fake Data Generation"
    steps:
      - name: "Create User with Fake Data"
        type: "rest"
        method: "POST"
        path: "/users"
        body: |
          {
            "personal_info": {
              "first_name": "{{faker.person.firstName}}",
              "last_name": "{{faker.person.lastName}}",
              "email": "{{faker.internet.email}}",
              "phone": "{{faker.phone.number}}",
              "birth_date": "{{faker.date.birthdate}}"
            },
            "address": {
              "street": "{{faker.location.streetAddress}}",
              "city": "{{faker.location.city}}",
              "state": "{{faker.location.state}}",
              "zip_code": "{{faker.location.zipCode}}",
              "country": "{{faker.location.country}}"
            },
            "account": {
              "username": "{{faker.internet.userName}}",
              "password": "{{faker.internet.password}}",
              "avatar": "{{faker.image.avatar}}"
            },
            "preferences": {
              "color": "{{faker.color.human}}",
              "locale": "{{faker.location.locale}}"
            }
          }
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('Fake Data Generation')
  .baseUrl('https://api.example.com')
  .scenario('Fake Data Generation')
    .post('/users', {
      body: {
        personal_info: {
          first_name: '{{faker.person.firstName}}',
          last_name: '{{faker.person.lastName}}',
          email: '{{faker.internet.email}}',
          phone: '{{faker.phone.number}}',
          birth_date: '{{faker.date.birthdate}}'
        },
        address: {
          street: '{{faker.location.streetAddress}}',
          city: '{{faker.location.city}}',
          state: '{{faker.location.state}}',
          zip_code: '{{faker.location.zipCode}}',
          country: '{{faker.location.country}}'
        },
        account: {
          username: '{{faker.internet.userName}}',
          password: '{{faker.internet.password}}',
          avatar: '{{faker.image.avatar}}'
        },
        preferences: {
          color: '{{faker.color.human}}',
          locale: '{{faker.location.locale}}'
        }
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Advanced Faker Patterns

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Advanced Fake Data"
    steps:
      - name: "E-commerce Product"
        type: "rest"
        method: "POST"
        path: "/products"
        body: |
          {
            "product": {
              "name": "{{faker.commerce.productName}}",
              "description": "{{faker.commerce.productDescription}}",
              "price": {{faker.commerce.price(10, 1000, 2)}},
              "currency": "USD",
              "category": "{{faker.commerce.department}}",
              "sku": "{{faker.string.alphanumeric(8)}}",
              "barcode": "{{faker.string.numeric(13)}}",
              "weight": {{faker.number.float({min: 0.1, max: 50.0, precision: 0.1})}},
              "dimensions": {
                "length": {{faker.number.int({min: 1, max: 100})}},
                "width": {{faker.number.int({min: 1, max: 100})}},
                "height": {{faker.number.int({min: 1, max: 100})}}
              },
              "tags": [
                "{{faker.commerce.productAdjective}}",
                "{{faker.commerce.productMaterial}}"
              ],
              "availability": {
                "in_stock": {{faker.datatype.boolean}},
                "quantity": {{faker.number.int({min: 0, max: 1000})}},
                "restock_date": "{{faker.date.future}}"
              }
            }
          }
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

test('Advanced Fake Data')
  .baseUrl('https://api.example.com')
  .scenario('Advanced Fake Data')
    .post('/products', {
      body: {
        product: {
          name: '{{faker.commerce.productName}}',
          description: '{{faker.commerce.productDescription}}',
          price: '{{faker.commerce.price(10, 1000, 2)}}',
          currency: 'USD',
          category: '{{faker.commerce.department}}',
          sku: '{{faker.string.alphanumeric(8)}}',
          barcode: '{{faker.string.numeric(13)}}',
          weight: '{{faker.number.float({min: 0.1, max: 50.0, precision: 0.1})}}',
          dimensions: {
            length: '{{faker.number.int({min: 1, max: 100})}}',
            width: '{{faker.number.int({min: 1, max: 100})}}',
            height: '{{faker.number.int({min: 1, max: 100})}}'
          },
          tags: [
            '{{faker.commerce.productAdjective}}',
            '{{faker.commerce.productMaterial}}'
          ],
          availability: {
            in_stock: '{{faker.datatype.boolean}}',
            quantity: '{{faker.number.int({min: 0, max: 1000})}}',
            restock_date: '{{faker.date.future}}'
          }
        }
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Custom Faker Providers

Create custom data providers:

```yaml
scenarios:
  - name: "Custom Data Providers"
    hooks:
      beforeScenario: |
        // Register custom faker provider
        faker.registerProvider('business', {
          companyType: () => faker.helpers.arrayElement([
            'LLC', 'Inc', 'Corp', 'LP', 'Partnership'
          ]),
          businessCategory: () => faker.helpers.arrayElement([
            'Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing'
          ]),
          employeeCount: () => faker.helpers.weightedArrayElement([
            { weight: 0.4, value: faker.number.int({min: 1, max: 10}) },
            { weight: 0.3, value: faker.number.int({min: 11, max: 50}) },
            { weight: 0.2, value: faker.number.int({min: 51, max: 200}) },
            { weight: 0.1, value: faker.number.int({min: 201, max: 1000}) }
          ])
        });
    steps:
      - name: "Create Business Entity"
        type: "rest"
        method: "POST"
        path: "/businesses"
        body: |
          {
            "company_name": "{{faker.company.name}} {{faker.business.companyType}}",
            "category": "{{faker.business.businessCategory}}",
            "employee_count": {{faker.business.employeeCount}},
            "founded_year": {{faker.date.past(20).getFullYear()}},
            "website": "{{faker.internet.url}}",
            "contact": {
              "email": "{{faker.internet.email}}",
              "phone": "{{faker.phone.number}}"
            }
          }
```

## Variable Scopes

### Global Variables

Available to all scenarios and VUs:

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  variables:
    app_version: "2.1.0"
    api_base_path: "/api/v2"
    test_environment: "staging"

scenarios:
  - name: "Global Variable Usage"
    steps:
      - name: "Use Global Variables"
        type: "rest"
        method: "GET"
        path: "{{api_base_path}}/status"
        headers:
          X-App-Version: "{{app_version}}"
          X-Environment: "{{test_environment}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Global Variable Usage')
  .baseUrl('https://api.example.com')
  .variables({
    app_version: '2.1.0',
    api_base_path: '/api/v2',
    test_environment: 'staging'
  })
  .scenario('Global Variable Usage')
    .get('{{api_base_path}}/status', {
      headers: {
        'X-App-Version': '{{app_version}}',
        'X-Environment': '{{test_environment}}'
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Scenario Variables

Available within a specific scenario:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "User Management"
    variables:
      user_role: "admin"
      permissions: ["read", "write", "delete"]
      session_timeout: 3600
    steps:
      - name: "Create Admin Session"
        type: "rest"
        method: "POST"
        path: "/auth/create-session"
        body: |
          {
            "role": "{{user_role}}",
            "permissions": {{json permissions}},
            "timeout": {{session_timeout}}
          }

  - name: "Product Management"
    variables:
      user_role: "manager"
      permissions: ["read", "write"]
      department: "inventory"
    steps:
      - name: "Access Product Database"
        type: "rest"
        method: "GET"
        path: "/products/manage"
        headers:
          X-Role: "{{user_role}}"
          X-Department: "{{department}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Scenario Variables')
  .baseUrl('https://api.example.com')
  .scenario('User Management')
    .variables({
      user_role: 'admin',
      permissions: ['read', 'write', 'delete'],
      session_timeout: 3600
    })
    .post('/auth/create-session', {
      body: {
        role: '{{user_role}}',
        permissions: '{{json permissions}}',
        timeout: '{{session_timeout}}'
      }
    })
  .done()
  .scenario('Product Management')
    .variables({
      user_role: 'manager',
      permissions: ['read', 'write'],
      department: 'inventory'
    })
    .get('/products/manage', {
      headers: {
        'X-Role': '{{user_role}}',
        'X-Department': '{{department}}'
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### VU-Specific Variables

Each Virtual User has its own variable context:

```yaml
scenarios:
  - name: "VU-Specific Context"
    hooks:
      beforeScenario: |
        // Each VU gets unique variables
        context.variables.vu_session = `session_${context.vu_id}_${Date.now()}`;
        context.variables.vu_start_time = Date.now();
        context.variables.request_counter = 0;
        
        // VU-specific fake data seed for consistency
        faker.seed(context.vu_id + 12345);
        context.variables.consistent_name = faker.person.fullName();
        
      beforeStep: |
        context.variables.request_counter++;
        context.variables.step_timestamp = Date.now();
    steps:
      - name: "VU-Specific Request"
        type: "rest"
        method: "POST"
        path: "/api/vu-tracking"
        body: |
          {
            "vu_id": {{vu_id}},
            "session_id": "{{vu_session}}",
            "consistent_name": "{{consistent_name}}",
            "request_number": {{request_counter}},
            "uptime_ms": {{step_timestamp - vu_start_time}}
          }
```

## Advanced Templating

### Template Functions

Built-in template functions:

```yaml
scenarios:
  - name: "Template Functions"
    steps:
      - name: "Function Examples"
        type: "rest"
        method: "POST"
        path: "/api/process"
        body: |
          {
            "data": {
              "uppercase_text": "{{upper 'hello world'}}",
              "lowercase_text": "{{lower 'HELLO WORLD'}}",
              "random_number": {{random 1 100}},
              "timestamp": {{timestamp}},
              "uuid": "{{uuid}}",
              "base64_encoded": "{{base64 'Hello World'}}",
              "url_encoded": "{{urlEncode 'hello world & more'}}",
              "json_stringified": "{{json variables}}"
            }
          }
```

### Math Operations

```yaml
scenarios:
  - name: "Math Operations"
    variables:
      base_price: 100
      tax_rate: 0.08
      quantity: 3
    steps:
      - name: "Calculate Order Total"
        type: "rest"
        method: "POST"
        path: "/orders"
        body: |
          {
            "items": [
              {
                "price": {{base_price}},
                "quantity": {{quantity}},
                "subtotal": {{multiply base_price quantity}},
                "tax": {{multiply (multiply base_price quantity) tax_rate}},
                "total": {{add (multiply base_price quantity) (multiply (multiply base_price quantity) tax_rate)}}
              }
            ]
          }
```

### Conditional Logic

```yaml
scenarios:
  - name: "Conditional Logic"
    variables:
      user_age: 25
      is_premium: true
      account_balance: 150.00
    steps:
      - name: "Conditional Content"
        type: "rest"
        method: "POST"
        path: "/api/personalized-content"
        body: |
          {
            "user_segment": "{{#if is_premium}}premium{{else}}standard{{/if}}",
            "age_category": "{{#if (gt user_age 18)}}adult{{else}}minor{{/if}}",
            "can_purchase": {{#and is_premium (gt account_balance 100)}}true{{else}}false{{/and}},
            "discount_rate": {{#if is_premium}}0.15{{else}}0.05{{/if}},
            "recommendations": [
              {{#if (gt user_age 21)}}
              "adult_content",
              {{/if}}
              {{#if is_premium}}
              "premium_features",
              {{/if}}
              "general_content"
            ]
          }
```

## Variable Persistence

### Context Persistence

Maintain variables across requests:

```yaml
scenarios:
  - name: "Multi-Step Flow"
    steps:
      - name: "Step 1: Initialize"
        type: "rest"
        method: "POST"
        path: "/api/initialize"
        body: '{"user_id": "{{faker.string.uuid}}"}'
        extract:
          - name: "workflow_id"
            type: "json_path"
            expression: "$.workflow_id"
          - name: "step_token"
            type: "json_path"
            expression: "$.step_token"
            
      - name: "Step 2: Process"
        type: "rest"
        method: "POST"
        path: "/api/process"
        body: |
          {
            "workflow_id": "{{workflow_id}}",
            "token": "{{step_token}}",
            "data": "{{faker.lorem.paragraph}}"
          }
        extract:
          - name: "process_result"
            type: "json_path"
            expression: "$.result"
            
      - name: "Step 3: Finalize"
        type: "rest"
        method: "POST"
        path: "/api/finalize"
        body: |
          {
            "workflow_id": "{{workflow_id}}",
            "result": "{{process_result}}"
          }
```

### Cross-VU Data Sharing

Share data between Virtual Users:

```yaml
scenarios:
  - name: "Producer VU"
    weight: 1                   # Only 1 VU produces data
    steps:
      - name: "Generate Shared Data"
        type: "custom"
        script: |
          // Generate data for all VUs to use
          const sharedTokens = [];
          for (let i = 0; i < 100; i++) {
            sharedTokens.push(faker.string.uuid());
          }
          
          // Store in global context
          context.global.sharedTokens = sharedTokens;
          context.global.dataGeneratedAt = Date.now();
          
          console.log(`Producer VU generated ${sharedTokens.length} tokens`);

  - name: "Consumer VU"
    weight: 9                   # 9 VUs consume data
    steps:
      - name: "Use Shared Data"
        type: "custom"
        script: |
          // Wait for producer to generate data
          if (!context.global.sharedTokens) {
            throw new Error('Shared data not available yet');
          }
          
          // Get a token from shared pool
          const token = context.global.sharedTokens.pop();
          if (!token) {
            throw new Error('No more tokens available');
          }
          
          context.variables.shared_token = token;
          
      - name: "API Call with Shared Token"
        type: "rest"
        method: "GET"
        path: "/api/secure-endpoint"
        headers:
          Authorization: "Bearer {{shared_token}}"
```

## Performance Optimization

### Variable Caching

Cache expensive variable computations:

```yaml
scenarios:
  - name: "Optimized Variables"
    hooks:
      beforeScenario: |
        // Cache expensive computations
        const cache = {};
        
        context.variables.getComplexValue = (key) => {
          if (!cache[key]) {
            // Expensive computation
            cache[key] = computeComplexValue(key);
          }
          return cache[key];
        };
        
        // Pre-compute common values
        context.variables.cached_uuid = faker.string.uuid();
        context.variables.cached_timestamp = Date.now();
    steps:
      - name: "Use Cached Variables"
        type: "rest"
        method: "POST"
        path: "/api/optimized"
        body: |
          {
            "id": "{{cached_uuid}}",
            "timestamp": {{cached_timestamp}},
            "complex_value": "{{getComplexValue 'expensive_key'}}"
          }
```

### Memory Management

Manage variable memory usage:

```yaml
scenarios:
  - name: "Memory Efficient Variables"
    hooks:
      afterStep: |
        // Clean up large variables after each step
        delete context.variables.large_data_buffer;
        delete context.variables.temporary_results;
        
        // Limit variable history
        if (context.variables.request_history) {
          context.variables.request_history = 
            context.variables.request_history.slice(-10); // Keep only last 10
        }
```

## Best Practices

### 1. Consistent Naming

<!-- tabs:start -->

#### **YAML**
```yaml
# Good: Consistent, descriptive names
variables:
  user_id: "{{faker.string.uuid}}"
  user_email: "{{faker.internet.email}}"
  user_created_at: "{{faker.date.recent}}"

# Avoid: Inconsistent naming
variables:
  uid: "{{faker.string.uuid}}"
  email_addr: "{{faker.internet.email}}"
  creation_timestamp: "{{faker.date.recent}}"
```

#### **TypeScript**
```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

// Good: Consistent, descriptive names
test('Good Naming')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .variables({
      user_id: '{{faker.string.uuid}}',
      user_email: '{{faker.internet.email}}',
      user_created_at: '{{faker.date.recent}}'
    })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();

// Avoid: Inconsistent naming
// uid, email_addr, creation_timestamp
```

<!-- tabs:end -->

### 2. Type Safety

```yaml
# Good: Clear data types
variables:
  user_id: "{{faker.string.uuid}}"        # String
  age: {{faker.number.int({min: 18, max: 65})}}  # Number
  is_active: {{faker.datatype.boolean}}   # Boolean
  tags: ["tag1", "tag2", "tag3"]         # Array

# Include type information in complex scenarios
body: |
  {
    "user_id": "{{user_id}}",             // String
    "age": {{age}},                       // Number (no quotes)
    "is_active": {{is_active}},           // Boolean (no quotes)
    "tags": {{json tags}}                 // Array as JSON
  }
```

### 3. Variable Documentation

```yaml
scenarios:
  - name: "Well-Documented Variables"
    variables:
      # Authentication
      api_key: "test-key-123"              # Test API key (not production)
      session_timeout: 3600                # Session timeout in seconds
      
      # User simulation
      user_type: "premium"                 # User tier: basic, premium, enterprise
      activity_level: "high"               # Activity: low, medium, high
      
      # Test configuration
      batch_size: 50                       # Records per batch
      retry_count: 3                       # Max retries for failed requests
```

### 4. Environment Variables

```yaml
# Use environment-specific variables
global:
  variables:
    api_base_url: "${API_BASE_URL:-https://api.example.com}"
    api_key: "${API_KEY:-default-test-key}"
    database_url: "${DB_URL:-postgresql://localhost/test}"
    max_connections: "${MAX_CONN:-10}"
```

### 5. Security Considerations

```yaml
# Don't hardcode sensitive data
variables:
  # Good: Use environment variables or external sources
  api_key: "${API_KEY}"
  database_password: "${DB_PASSWORD}"
  
  # Avoid: Hardcoded secrets
  # api_key: "real-production-key-123"
  # password: "actual-password"

# Use fake data for sensitive fields
body: |
  {
    "email": "{{faker.internet.email}}",           // Fake email
    "ssn": "{{faker.string.numeric(9)}}",          // Fake SSN
    "credit_card": "{{faker.finance.creditCardNumber}}"  // Fake CC
  }
```

Variables and templating are the foundation of flexible, maintainable performance tests. They enable realistic data generation, complex test flows, and environment-specific configurations while keeping tests readable and efficient.
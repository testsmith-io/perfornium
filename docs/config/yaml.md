# YAML Configuration

YAML is the primary configuration format for Perfornium tests. This guide covers all available configuration options and provides examples for common use cases.

## Basic Structure

A Perfornium YAML configuration file has the following main sections:

<!-- tabs:start -->

#### **YAML**

```yaml
# Test metadata
name: "Test Name"
description: "Test Description"

# Global settings
global:
  base_url: "https://api.example.com"
  timeout: 30000

# Load pattern configuration
load:
  pattern: "basic"
  virtual_users: 10
  duration: "2m"

# Test scenarios
scenarios:
  - name: "Scenario 1"
    steps:
      - name: "Step 1"
        type: "rest"
        method: "GET"
        path: "/endpoint"

# Output configuration
outputs:
  - type: "json"
    file: "results.json"

# Report generation
report:
  generate: true
  output: "report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Test Name')
  .description('Test Description')
  .baseUrl('https://api.example.com')
  .timeout(30000)
  .scenario('Scenario 1')
    .get('/endpoint', 'Step 1')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '2m'
  })
  .withOutputs([
    { type: 'json', file: 'results.json' }
  ])
  .withReport({
    generate: true,
    output: 'report.html'
  })
  .build();
```

<!-- tabs:end -->

## Test Metadata

### Basic Information

<!-- tabs:start -->

#### **YAML**

```yaml
name: "API Performance Test"
description: "Testing user registration and login endpoints"
version: "1.0.0"
tags: ["api", "auth", "performance"]
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('API Performance Test')
  .description('Testing user registration and login endpoints')
  .version('1.0.0')
  .tags(['api', 'auth', 'performance'])
  .build();
```

<!-- tabs:end -->

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Test name (used in reports) |
| `description` | string | No | Test description |
| `version` | string | No | Test version |
| `tags` | array | No | Tags for categorization |

## Global Configuration

The `global` section defines settings that apply to all scenarios:

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  base_url: "https://api.example.com"
  timeout: 30000
  think_time: "1-3"
  headers:
    User-Agent: "Perfornium/1.0"
    Accept: "application/json"
  debug:
    log_level: "info"
    capture_request_headers: true
    capture_response_body: true
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Global Config Example')
  .baseUrl('https://api.example.com')
  .timeout(30000)
  .thinkTime('1-3')
  .headers({
    'User-Agent': 'Perfornium/1.0',
    'Accept': 'application/json'
  })
  .debug({
    log_level: 'info',
    capture_request_headers: true,
    capture_response_body: true
  })
  .build();
```

<!-- tabs:end -->

### Global Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base_url` | string | - | Base URL for all requests |
| `timeout` | number | 30000 | Request timeout in milliseconds |
| `think_time` | string | "0" | Think time between requests (e.g., "1-3s") |
| `headers` | object | {} | Default headers for all requests |
| `debug` | object | - | Debug configuration |

### Debug Configuration

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  debug:
    log_level: "info"           # Log level: debug, info, warn, error
    capture_request_headers: true
    capture_request_body: true
    capture_response_headers: false
    capture_response_body: true
    capture_only_failures: false
    max_response_body_size: 5000
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Debug Config Example')
  .debug({
    log_level: 'info',
    capture_request_headers: true,
    capture_request_body: true,
    capture_response_headers: false,
    capture_response_body: true,
    capture_only_failures: false,
    max_response_body_size: 5000
  })
  .build();
```

<!-- tabs:end -->

## Load Pattern Configuration

Define how virtual users are created and managed:

### Basic Load Pattern

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "basic"
  virtual_users: 10      # Number of virtual users
  ramp_up: "30s"         # Time to ramp up all users
  duration: "2m"         # Test duration (optional)
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Basic Load Pattern')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    ramp_up: '30s',
    duration: '2m'
  })
  .build();
```

<!-- tabs:end -->

### Stepping Load Pattern

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "stepping"
  start_users: 1         # Starting number of users
  step_users: 2          # Users to add per step
  step_duration: "30s"   # Duration of each step
  max_users: 20          # Maximum users
  duration: "10m"        # Total test duration
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Stepping Load Pattern')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 1,
    step_users: 2,
    step_duration: '30s',
    max_users: 20,
    duration: '10m'
  })
  .build();
```

<!-- tabs:end -->

### Arrival Rate Pattern

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "arrivals"
  rate: 10               # Requests per second
  duration: "5m"         # Test duration
  max_virtual_users: 50  # Maximum concurrent users
  preallocation: 10      # Pre-allocated users
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Arrival Rate Pattern')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({
    pattern: 'arrivals',
    rate: 10,
    duration: '5m',
    max_virtual_users: 50,
    preallocation: 10
  })
  .build();
```

<!-- tabs:end -->

## Scenarios

Scenarios define the test steps that virtual users will execute:

### Basic Scenario

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "User Registration Flow"
    weight: 1            # Scenario selection weight
    loop: 1              # Number of times to repeat scenario
    steps:
      - name: "Register User"
        type: "rest"
        method: "POST"
        path: "/users/register"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "email": "{{faker.internet.email}}",
            "password": "{{faker.internet.password}}"
          }
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('User Registration Test')
  .scenario('User Registration Flow', { weight: 1, loop: 1 })
    .post('/users/register', 'Register User')
    .headers({ 'Content-Type': 'application/json' })
    .body({
      email: '{{faker.internet.email}}',
      password: '{{faker.internet.password}}'
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Scenario with CSV Data

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Login with Real Users"
    csv_data:
      file: "data/users.csv"
      mode: "sequential"   # or "random" or "shared"
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/auth/login"
        body: |
          {
            "email": "{{email}}",
            "password": "{{password}}"
          }
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Login with CSV Data')
  .scenario('Login with Real Users')
    .csvData({
      file: 'data/users.csv',
      mode: 'sequential'
    })
    .post('/auth/login', 'Login')
    .body({
      email: '{{email}}',
      password: '{{password}}'
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Scenario with Hooks

```yaml
scenarios:
  - name: "Authenticated API Calls"
    hooks:
      beforeScenario: |
        // Setup authentication token
        const authResponse = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'testuser',
            password: 'testpass'
          })
        });
        const auth = await authResponse.json();
        context.variables.token = auth.access_token;
        
      afterScenario: |
        // Cleanup
        console.log('Scenario completed');
    steps:
      - name: "Get Profile"
        type: "rest"
        method: "GET"
        path: "/user/profile"
        headers:
          Authorization: "Bearer {{token}}"
```

## Steps

Steps define individual actions within scenarios:

### REST API Step

```yaml
- name: "Create Post"
  type: "rest"
  method: "POST"
  path: "/posts"
  headers:
    Content-Type: "application/json"
    Authorization: "Bearer {{token}}"
  body: |
    {
      "title": "{{faker.lorem.sentence}}",
      "content": "{{faker.lorem.paragraphs}}"
    }
  checks:
    - type: "status"
      value: 201
      description: "Should return 201 Created"
    - type: "json_path"
      value: "$.id"
      description: "Should have an ID field"
  extract:
    - name: "post_id"
      type: "json_path"
      expression: "$.id"
```

### SOAP Step

```yaml
- name: "Calculate Sum"
  type: "soap"
  wsdl: "http://example.com/calculator?wsdl"
  operation: "Add"
  envelope: |
    <soap:Envelope>
      <soap:Body>
        <Add>
          <intA>{{a}}</intA>
          <intB>{{b}}</intB>
        </Add>
      </soap:Body>
    </soap:Envelope>
```

### Browser/Playwright Step

```yaml
- name: "Login via Browser"
  type: "web"
  action:
    command: "goto"
    url: "{{base_url}}/login"
  
- name: "Fill Login Form"
  type: "web"
  action:
    command: "fill"
    selector: "#email"
    value: "{{email}}"
```

### Wait Step

```yaml
- name: "Think Time"
  type: "wait"
  duration: "2-5s"       # Random wait between 2-5 seconds
```

### Custom Script Step

```yaml
- name: "Custom Logic"
  type: "custom"
  timeout: 10000
  script: |
    // Custom JavaScript code
    const result = Math.random() * 100;
    context.variables.randomValue = result;
    
    // Return data for metrics
    return { customMetric: result };
```

## Data and Templating

### Variables

```yaml
scenarios:
  - name: "With Variables"
    variables:
      api_key: "secret-key-123"
      user_type: "premium"
    steps:
      - name: "API Call"
        type: "rest"
        method: "GET"
        path: "/data"
        headers:
          X-API-Key: "{{api_key}}"
          X-User-Type: "{{user_type}}"
```

### CSV Data Injection

CSV file (`data/users.csv`):
```csv
email,password,user_type
john@example.com,pass123,admin
jane@example.com,pass456,user
```

Configuration:
```yaml
scenarios:
  - name: "Data-Driven Test"
    csv_data:
      file: "data/users.csv"
      mode: "sequential"     # sequential, random, shared
      delimiter: ","         # CSV delimiter
      header: true           # First row contains headers
      cycling: true          # Restart from beginning when exhausted
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
        body: |
          {
            "email": "{{email}}",
            "password": "{{password}}",
            "type": "{{user_type}}"
          }
```

### Faker.js Integration

```yaml
steps:
  - name: "Create User"
    type: "rest"
    method: "POST"
    path: "/users"
    body: |
      {
        "name": "{{faker.person.fullName}}",
        "email": "{{faker.internet.email}}",
        "age": {{faker.number.int({min: 18, max: 65})}},
        "city": "{{faker.location.city}}",
        "uuid": "{{faker.string.uuid}}"
      }
```

## Checks and Assertions

Add validation to your test steps:

### Status Code Checks

```yaml
checks:
  - type: "status"
    value: 200
    description: "Should return 200 OK"
```

### Response Time Checks

```yaml
checks:
  - type: "response_time"
    value: "<2000"         # Less than 2 seconds
    description: "Should respond quickly"
```

### JSON Path Checks

```yaml
checks:
  - type: "json_path"
    value: "$.user.id"
    description: "Response should contain user ID"
    
  - type: "json_path"
    value: "$.users.length"
    operator: ">"          # >, <, >=, <=, ==, !=
    expected: 0
    description: "Should return at least one user"
```

### Text Content Checks

```yaml
checks:
  - type: "text_contains"
    value: "success"
    description: "Response should contain 'success'"
```

### Custom Checks

```yaml
checks:
  - type: "custom"
    script: |
      const data = JSON.parse(result.body);
      return data.status === 'active' && data.count > 0;
    description: "Custom validation logic"
```

## Data Extraction

Extract data from responses for use in subsequent steps:

### JSON Path Extraction

```yaml
extract:
  - name: "user_id"
    type: "json_path"
    expression: "$.user.id"
    default: "unknown"     # Default value if extraction fails
```

### Regex Extraction

```yaml
extract:
  - name: "session_token"
    type: "regex"
    expression: 'session_token=([^;]+)'
    default: ""
```

### Custom Extraction

```yaml
extract:
  - name: "custom_value"
    type: "custom"
    script: |
      const data = JSON.parse(result.body);
      return data.metadata.customField;
```

## Output Configuration

Configure how test results are saved:

### JSON Output

```yaml
outputs:
  - type: "json"
    file: "results/test-{{timestamp}}.json"
    format: "array"        # array, ndjson, stream
```

### CSV Output

```yaml
outputs:
  - type: "csv"
    file: "results/test-{{timestamp}}.csv"
    fields: ["timestamp", "vu_id", "duration", "success", "status"]
```

### External Outputs

```yaml
outputs:
  - type: "influxdb"
    url: "http://localhost:8086"
    database: "performance"
    measurement: "http_requests"
    
  - type: "webhook"
    url: "https://hooks.slack.com/webhook-url"
    method: "POST"
    headers:
      Content-Type: "application/json"
```

## Report Configuration

Generate HTML reports after test completion:

```yaml
report:
  generate: true
  output: "reports/test-report-{{timestamp}}.html"
  template: "default"      # default, minimal, detailed
  include_raw_data: false  # Include raw request/response data
  charts:
    - "response_time_timeline"
    - "throughput_chart"
    - "error_distribution"
```

## Environment Support

Use different configurations for different environments:

### Base Configuration (`test.yml`):

```yaml
name: "API Test"
global:
  timeout: 30000
load:
  pattern: "basic"
  virtual_users: 10
scenarios:
  - name: "Basic Test"
    steps:
      - name: "Health Check"
        type: "rest"
        method: "GET"
        path: "/health"
```

### Environment Override (`environments/staging.yml`):

```yaml
global:
  base_url: "https://staging-api.example.com"
  headers:
    X-Environment: "staging"
load:
  virtual_users: 5
```

### Usage:

```bash
perfornium run test.yml --env staging
```

## Advanced Configuration

### Conditional Steps

```yaml
steps:
  - name: "Admin Only Step"
    type: "rest"
    method: "GET"
    path: "/admin/users"
    condition: "context.variables.user_type === 'admin'"
```

### Step Hooks

```yaml
steps:
  - name: "API Call with Hooks"
    type: "rest"
    method: "GET"
    path: "/data"
    hooks:
      beforeStep: |
        console.log('About to make API call');
        context.variables.startTime = Date.now();
      afterStep: |
        const duration = Date.now() - context.variables.startTime;
        console.log(`API call took ${duration}ms`);
```

### Think Time

```yaml
global:
  think_time: "1-3"        # 1-3 seconds between requests

# Or per scenario
scenarios:
  - name: "Slow User Scenario"
    think_time: "5-10"     # Override global think time
```

### Error Handling

```yaml
global:
  error_handling:
    continue_on_error: true
    max_errors: 5          # Stop after 5 errors
    retry_count: 2         # Retry failed requests
    retry_delay: "1s"      # Delay between retries
```

## Configuration Validation

Perfornium includes built-in configuration validation. Run validation without executing the test:

```bash
perfornium validate test.yml
```

Common validation errors:
- Missing required fields
- Invalid load pattern configurations
- Malformed step definitions
- Invalid file paths

## Best Practices

### 1. Use Descriptive Names
```yaml
name: "User Registration API - Load Test"
description: "Tests user registration endpoint under increasing load"
```

### 2. Organize with Comments
```yaml
# Authentication configuration
global:
  headers:
    User-Agent: "Performance-Test/1.0"

# Main test scenarios
scenarios:
  # Happy path - successful registration
  - name: "Successful User Registration"
    # Test data configuration
    csv_data:
      file: "data/valid-users.csv"
```

### 3. Use Environment Variables
```yaml
global:
  base_url: "${API_BASE_URL:-https://api.example.com}"
  timeout: "${API_TIMEOUT:-30000}"
```

### 4. Modular Configuration
Split large configurations into multiple files and use includes:

```yaml
# main-test.yml
name: "Main API Test"
includes:
  - "config/global-settings.yml"
  - "scenarios/auth-scenarios.yml"
  - "scenarios/crud-scenarios.yml"
```

### 5. Version Your Tests
```yaml
version: "2.1.0"
changelog:
  - "2.1.0: Added authentication scenarios"
  - "2.0.0: Migrated to new API endpoints"
  - "1.0.0: Initial test suite"
```

This comprehensive YAML configuration guide should help you create powerful and flexible performance tests with Perfornium. For more advanced scenarios, check out the [TypeScript Configuration](typescript.md) guide or explore the [examples section](../examples/rest-basic.md).
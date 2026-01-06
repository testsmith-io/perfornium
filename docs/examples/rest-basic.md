# Basic REST API Testing

This example demonstrates fundamental REST API testing with Perfornium, covering common scenarios like GET requests, POST requests with JSON data, authentication, and data validation.

## Simple GET Request

The most basic REST API test - making GET requests to retrieve data:

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Simple API GET Test"
description: "Basic test to verify API endpoint availability"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 5
  ramp_up: "10s"
  duration: "2m"

scenarios:
  - name: "Get Posts"
    steps:
      - name: "Fetch All Posts"
        type: "rest"
        method: "GET"
        path: "/posts"
        headers:
          Accept: "application/json"
        checks:
          - type: "status"
            value: 200
            description: "Should return 200 OK"
          - type: "response_time"
            value: "<2000"
            description: "Should respond within 2 seconds"
          - type: "json_path"
            value: "$.length"
            operator: ">"
            expected: 0
            description: "Should return at least one post"

outputs:
  - type: "json"
    file: "results/simple-get-{{timestamp}}.json"
  - type: "csv"
    file: "results/simple-get-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/simple-get-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Simple API GET Test')
  .description('Basic test to verify API endpoint availability')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .timeout(30000)
  .scenario('Get Posts')
    .get('/posts', {
      name: 'Fetch All Posts',
      headers: { Accept: 'application/json' }
    })
    .check('status', 200, 'Should return 200 OK')
    .check('response_time', '<2000', 'Should respond within 2 seconds')
    .check('json_path', { value: '$.length', operator: '>', expected: 0 }, 'Should return at least one post')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    ramp_up: '10s',
    duration: '2m'
  })
  .withJSONOutput('results/simple-get-{{timestamp}}.json')
  .withCSVOutput('results/simple-get-{{timestamp}}.csv')
  .withReport('reports/simple-get-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## POST Request with JSON Data

Testing POST endpoints with JSON payloads and data extraction:

<!-- tabs:start -->

#### **YAML**

```yaml
name: "REST API POST Test"
description: "Testing POST endpoints with JSON data creation"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 30000
  headers:
    Content-Type: "application/json"
    User-Agent: "Perfornium-Test/1.0"

load:
  pattern: "basic"
  virtual_users: 10
  ramp_up: "15s"
  duration: "3m"

scenarios:
  - name: "Create Posts"
    steps:
      - name: "Create New Post"
        type: "rest"
        method: "POST"
        path: "/posts"
        body: |
          {
            "title": "{{faker.lorem.sentence}}",
            "body": "{{faker.lorem.paragraphs(3)}}",
            "userId": {{faker.number.int({min: 1, max: 10})}}
          }
        checks:
          - type: "status"
            value: 201
            description: "Should return 201 Created"
          - type: "json_path"
            value: "$.id"
            description: "Should return post ID"
          - type: "json_path"
            value: "$.title"
            operator: "exists"
            description: "Should have title field"
        extract:
          - name: "post_id"
            type: "json_path"
            expression: "$.id"
          - name: "created_title"
            type: "json_path"
            expression: "$.title"

      - name: "Verify Created Post"
        type: "rest"
        method: "GET"
        path: "/posts/{{post_id}}"
        checks:
          - type: "status"
            value: 200
            description: "Should retrieve created post"
          - type: "json_path"
            value: "$.title"
            expected: "{{created_title}}"
            description: "Title should match created post"

outputs:
  - type: "json"
    file: "results/post-test-{{timestamp}}.json"
  - type: "csv"
    file: "results/post-test-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/post-test-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('REST API POST Test')
  .description('Testing POST endpoints with JSON data creation')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .timeout(30000)
  .headers({
    'Content-Type': 'application/json',
    'User-Agent': 'Perfornium-Test/1.0'
  })
  .scenario('Create Posts')
    .post('/posts', {
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraphs(3),
      userId: faker.number.int({ min: 1, max: 10 })
    }, { name: 'Create New Post' })
    .check('status', 201, 'Should return 201 Created')
    .check('json_path', '$.id', 'Should return post ID')
    .check('json_path', { value: '$.title', operator: 'exists' }, 'Should have title field')
    .extract('post_id', '$.id')
    .extract('created_title', '$.title')
    .get('/posts/{{post_id}}', { name: 'Verify Created Post' })
    .check('status', 200, 'Should retrieve created post')
    .check('json_path', { value: '$.title', expected: '{{created_title}}' }, 'Title should match created post')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    ramp_up: '15s',
    duration: '3m'
  })
  .withJSONOutput('results/post-test-{{timestamp}}.json')
  .withCSVOutput('results/post-test-{{timestamp}}.csv')
  .withReport('reports/post-test-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Authentication Flow Testing

Testing authentication and protected endpoints:

<!-- tabs:start -->

#### **YAML**

```yaml
name: "API Authentication Test"
description: "Testing login flow and protected endpoints"

global:
  base_url: "https://reqres.in/api"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 8
  ramp_up: "20s"
  duration: "5m"

scenarios:
  - name: "User Authentication Flow"
    steps:
      # Step 1: Login and get token
      - name: "User Login"
        type: "rest"
        method: "POST"
        path: "/login"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "email": "eve.holt@reqres.in",
            "password": "cityslicka"
          }
        checks:
          - type: "status"
            value: 200
            description: "Login should succeed"
          - type: "json_path"
            value: "$.token"
            description: "Should receive authentication token"
        extract:
          - name: "auth_token"
            type: "json_path"
            expression: "$.token"

      # Step 2: Access protected resource
      - name: "Get User Profile"
        type: "rest"
        method: "GET"
        path: "/users/2"
        headers:
          Authorization: "Bearer {{auth_token}}"
        checks:
          - type: "status"
            value: 200
            description: "Should access protected resource"
          - type: "json_path"
            value: "$.data.email"
            operator: "exists"
            description: "Should return user email"
        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.data.id"
          - name: "user_email"
            type: "json_path"
            expression: "$.data.email"

      # Step 3: Update user information
      - name: "Update User Profile"
        type: "rest"
        method: "PUT"
        path: "/users/{{user_id}}"
        headers:
          Authorization: "Bearer {{auth_token}}"
          Content-Type: "application/json"
        body: |
          {
            "name": "{{faker.person.fullName}}",
            "job": "{{faker.person.jobTitle}}"
          }
        checks:
          - type: "status"
            value: 200
            description: "Profile update should succeed"
          - type: "json_path"
            value: "$.updatedAt"
            operator: "exists"
            description: "Should include update timestamp"

outputs:
  - type: "json"
    file: "results/auth-test-{{timestamp}}.json"
  - type: "csv"
    file: "results/auth-test-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/auth-test-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('API Authentication Test')
  .description('Testing login flow and protected endpoints')
  .baseUrl('https://reqres.in/api')
  .timeout(30000)
  .scenario('User Authentication Flow')
    // Step 1: Login and get token
    .post('/login', {
      email: 'eve.holt@reqres.in',
      password: 'cityslicka'
    }, { name: 'User Login' })
    .check('status', 200, 'Login should succeed')
    .check('json_path', '$.token', 'Should receive authentication token')
    .extract('auth_token', '$.token')

    // Step 2: Access protected resource
    .get('/users/2', { name: 'Get User Profile' })
    .withBearerToken('{{auth_token}}')
    .check('status', 200, 'Should access protected resource')
    .check('json_path', { value: '$.data.email', operator: 'exists' }, 'Should return user email')
    .extract('user_id', '$.data.id')
    .extract('user_email', '$.data.email')

    // Step 3: Update user information
    .put('/users/{{user_id}}', {
      name: faker.person.fullName(),
      job: faker.person.jobTitle()
    }, { name: 'Update User Profile' })
    .withBearerToken('{{auth_token}}')
    .check('status', 200, 'Profile update should succeed')
    .check('json_path', { value: '$.updatedAt', operator: 'exists' }, 'Should include update timestamp')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 8,
    ramp_up: '20s',
    duration: '5m'
  })
  .withJSONOutput('results/auth-test-{{timestamp}}.json')
  .withCSVOutput('results/auth-test-{{timestamp}}.csv')
  .withReport('reports/auth-test-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Data-Driven API Testing

Using CSV data to test with multiple datasets:

**users.csv:**
```csv
name,email,age,department
John Doe,john.doe@company.com,28,Engineering
Jane Smith,jane.smith@company.com,32,Marketing
Bob Johnson,bob.johnson@company.com,45,Sales
Alice Brown,alice.brown@company.com,29,Engineering
```

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Data-Driven REST API Test"
description: "Testing API with multiple user datasets"

global:
  base_url: "https://reqres.in/api"
  timeout: 30000
  headers:
    Content-Type: "application/json"

load:
  pattern: "basic"
  virtual_users: 4
  ramp_up: "10s"
  duration: "2m"

scenarios:
  - name: "User CRUD Operations"
    csv_data:
      file: "test-data/users.csv"
      mode: "sequential"
    steps:
      # Create user with CSV data
      - name: "Create User"
        type: "rest"
        method: "POST"
        path: "/users"
        body: |
          {
            "name": "{{name}}",
            "email": "{{email}}",
            "age": {{age}},
            "department": "{{department}}"
          }
        checks:
          - type: "status"
            value: 201
            description: "User creation should succeed"
          - type: "json_path"
            value: "$.id"
            description: "Should return user ID"
          - type: "json_path"
            value: "$.email"
            expected: "{{email}}"
            description: "Should save correct email"
        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.id"

      # Retrieve created user
      - name: "Get User Details"
        type: "rest"
        method: "GET"
        path: "/users/{{user_id}}"
        checks:
          - type: "status"
            value: 200
            description: "Should retrieve user details"
          - type: "json_path"
            value: "$.data.email"
            operator: "exists"
            description: "User should have email"

      # Update user information
      - name: "Update User"
        type: "rest"
        method: "PUT"
        path: "/users/{{user_id}}"
        body: |
          {
            "name": "{{name}} (Updated)",
            "department": "{{department}} - Updated"
          }
        checks:
          - type: "status"
            value: 200
            description: "User update should succeed"

      # Delete user
      - name: "Delete User"
        type: "rest"
        method: "DELETE"
        path: "/users/{{user_id}}"
        checks:
          - type: "status"
            value: 204
            description: "User deletion should succeed"

outputs:
  - type: "json"
    file: "results/data-driven-{{timestamp}}.json"
  - type: "csv"
    file: "results/data-driven-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/data-driven-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Data-Driven REST API Test')
  .description('Testing API with multiple user datasets')
  .baseUrl('https://reqres.in/api')
  .timeout(30000)
  .headers({ 'Content-Type': 'application/json' })
  .scenario('User CRUD Operations')
    .withCSV('test-data/users.csv', { mode: 'sequential' })

    // Create user with CSV data
    .post('/users', {
      name: '{{name}}',
      email: '{{email}}',
      age: '{{age}}',
      department: '{{department}}'
    }, { name: 'Create User' })
    .check('status', 201, 'User creation should succeed')
    .check('json_path', '$.id', 'Should return user ID')
    .check('json_path', { value: '$.email', expected: '{{email}}' }, 'Should save correct email')
    .extract('user_id', '$.id')

    // Retrieve created user
    .get('/users/{{user_id}}', { name: 'Get User Details' })
    .check('status', 200, 'Should retrieve user details')
    .check('json_path', { value: '$.data.email', operator: 'exists' }, 'User should have email')

    // Update user information
    .put('/users/{{user_id}}', {
      name: '{{name}} (Updated)',
      department: '{{department}} - Updated'
    }, { name: 'Update User' })
    .check('status', 200, 'User update should succeed')

    // Delete user
    .delete('/users/{{user_id}}', { name: 'Delete User' })
    .check('status', 204, 'User deletion should succeed')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 4,
    ramp_up: '10s',
    duration: '2m'
  })
  .withJSONOutput('results/data-driven-{{timestamp}}.json')
  .withCSVOutput('results/data-driven-{{timestamp}}.csv')
  .withReport('reports/data-driven-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Error Handling and Edge Cases

Testing error scenarios and edge cases:

<!-- tabs:start -->

#### **YAML**

```yaml
name: "REST API Error Handling Test"
description: "Testing error scenarios and edge cases"

global:
  base_url: "https://httpbin.org"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 6
  duration: "3m"

scenarios:
  - name: "Error Scenarios"
    weight: 3
    steps:
      # Test 404 Not Found
      - name: "Test 404 Error"
        type: "rest"
        method: "GET"
        path: "/status/404"
        checks:
          - type: "status"
            value: 404
            description: "Should return 404 Not Found"
        on_error:
          continue: true

      # Test 500 Server Error
      - name: "Test 500 Error"
        type: "rest"
        method: "GET"
        path: "/status/500"
        checks:
          - type: "status"
            value: 500
            description: "Should return 500 Server Error"
        on_error:
          continue: true

      # Test timeout scenario
      - name: "Test Timeout"
        type: "rest"
        method: "GET"
        path: "/delay/10"
        timeout: 5000
        checks:
          - type: "response_time"
            value: "<5000"
            description: "Should timeout before 5 seconds"
        on_error:
          continue: true

  - name: "Edge Cases"
    weight: 2
    steps:
      # Special characters in data
      - name: "Special Characters"
        type: "rest"
        method: "POST"
        path: "/post"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "text": "Test with special chars: @#$%^&*()",
            "unicode": "Testing Unicode: cafe",
            "quotes": "String with quotes and apostrophes"
          }
        checks:
          - type: "status"
            value: 200
            description: "Should handle special characters"

outputs:
  - type: "json"
    file: "results/error-handling-{{timestamp}}.json"
    include_error_details: true
  - type: "csv"
    file: "results/error-handling-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/error-handling-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('REST API Error Handling Test')
  .description('Testing error scenarios and edge cases')
  .baseUrl('https://httpbin.org')
  .timeout(30000)

  .scenario('Error Scenarios', 3)
    // Test 404 Not Found
    .get('/status/404', { name: 'Test 404 Error' })
    .check('status', 404, 'Should return 404 Not Found')

    // Test 500 Server Error
    .get('/status/500', { name: 'Test 500 Error' })
    .check('status', 500, 'Should return 500 Server Error')

    // Test timeout scenario
    .get('/delay/10', { name: 'Test Timeout', timeout: 5000 })
    .check('response_time', '<5000', 'Should timeout before 5 seconds')
    .done()

  .scenario('Edge Cases', 2)
    // Special characters in data
    .post('/post', {
      text: 'Test with special chars: @#$%^&*()',
      unicode: 'Testing Unicode: cafe',
      quotes: 'String with quotes and apostrophes'
    }, { name: 'Special Characters' })
    .check('status', 200, 'Should handle special characters')
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 6,
    duration: '3m'
  })
  .withJSONOutput('results/error-handling-{{timestamp}}.json')
  .withCSVOutput('results/error-handling-{{timestamp}}.csv')
  .withReport('reports/error-handling-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Performance and Load Testing

Testing API performance under various load conditions:

<!-- tabs:start -->

#### **YAML**

```yaml
name: "API Performance Load Test"
description: "Testing API performance under increasing load"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 10000
  headers:
    User-Agent: "Perfornium-LoadTest/1.0"

load:
  pattern: "stepping"
  start_users: 5
  step_users: 5
  step_duration: "2m"
  max_users: 50
  hold_final: "3m"

scenarios:
  - name: "Mixed API Load"
    weight: 5
    steps:
      # Lightweight GET request
      - name: "Get Posts List"
        type: "rest"
        method: "GET"
        path: "/posts"
        headers:
          Accept: "application/json"
        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            value: "<3000"
            description: "Should respond within 3 seconds"

      # Medium weight POST request
      - name: "Create Post"
        type: "rest"
        method: "POST"
        path: "/posts"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "title": "{{faker.lorem.sentence}}",
            "body": "{{faker.lorem.paragraphs(2)}}",
            "userId": {{faker.number.int({min: 1, max: 10})}}
          }
        checks:
          - type: "status"
            value: 201
          - type: "response_time"
            value: "<5000"
            description: "Should create within 5 seconds"
        extract:
          - name: "new_post_id"
            type: "json_path"
            expression: "$.id"

      # GET request with specific ID
      - name: "Get Specific Post"
        type: "rest"
        method: "GET"
        path: "/posts/{{faker.number.int({min: 1, max: 100})}}"
        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            value: "<2000"

  - name: "Comments Load"
    weight: 2
    steps:
      - name: "Get Comments"
        type: "rest"
        method: "GET"
        path: "/comments?postId={{faker.number.int({min: 1, max: 100})}}"
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            value: "$.length"
            operator: ">="
            expected: 0

outputs:
  - type: "json"
    file: "results/load-test-{{timestamp}}.json"
  - type: "csv"
    file: "results/load-test-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/load-test-report.html"
```

#### **TypeScript**

```typescript
import { test, load, faker } from '@testsmith/perfornium/dsl';

const config = test('API Performance Load Test')
  .description('Testing API performance under increasing load')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .timeout(10000)
  .headers({ 'User-Agent': 'Perfornium-LoadTest/1.0' })

  .scenario('Mixed API Load', 5)
    // Lightweight GET request
    .get('/posts', {
      name: 'Get Posts List',
      headers: { Accept: 'application/json' }
    })
    .check('status', 200)
    .check('response_time', '<3000', 'Should respond within 3 seconds')

    // Medium weight POST request
    .post('/posts', {
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraphs(2),
      userId: faker.number.int({ min: 1, max: 10 })
    }, { name: 'Create Post' })
    .check('status', 201)
    .check('response_time', '<5000', 'Should create within 5 seconds')
    .extract('new_post_id', '$.id')

    // GET request with specific ID
    .get('/posts/{{faker.number.int({min: 1, max: 100})}}', { name: 'Get Specific Post' })
    .check('status', 200)
    .check('response_time', '<2000')
    .done()

  .scenario('Comments Load', 2)
    .get('/comments?postId={{faker.number.int({min: 1, max: 100})}}', { name: 'Get Comments' })
    .check('status', 200)
    .check('json_path', { value: '$.length', operator: '>=', expected: 0 })
    .done()

  .withLoad({
    pattern: 'stepping',
    start_users: 5,
    step_users: 5,
    step_duration: '2m',
    max_users: 50,
    hold_final: '3m'
  })
  .withJSONOutput('results/load-test-{{timestamp}}.json')
  .withCSVOutput('results/load-test-{{timestamp}}.csv')
  .withReport('reports/load-test-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Key Learning Points

### 1. Basic Structure
- Use `global.base_url` to set the API base URL
- Define scenarios with multiple steps for complete user journeys
- Use `checks` to validate responses
- Use `extract` to capture data for subsequent requests

### 2. Data Management
- Use Faker.js for dynamic test data: `{{faker.lorem.sentence}}`
- Extract data from responses: `$.id`, `$.user.email`
- Use CSV files for data-driven testing
- Pass data between steps using variables

### 3. Error Handling
- Set `on_error.continue: true` to continue test on failures
- Use appropriate timeouts for different endpoints
- Test both success and failure scenarios
- Include error analysis in reports

### 4. Performance Testing
- Start with low load and increase gradually
- Use stepping load patterns to find breaking points
- Monitor response times and error rates
- Set realistic SLA thresholds

### 5. Best Practices
- Use descriptive names for scenarios and steps
- Include meaningful validation checks
- Generate both JSON and CSV outputs for analysis
- Create HTML reports for stakeholder communication

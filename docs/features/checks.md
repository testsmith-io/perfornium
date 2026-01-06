# Checks & Assertions

Checks and assertions in Perfornium validate that your system behaves correctly under load. They ensure responses meet expectations, performance thresholds are maintained, and business logic functions properly.

## Basic Checks

### Status Code Checks

Validate HTTP response status codes:

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Successful API Call"
    type: "rest"
    method: "GET"
    path: "/api/users"
    checks:
      - type: "status"
        value: 200
        description: "Should return 200 OK"

  - name: "Create Resource"
    type: "rest"
    method: "POST"
    path: "/api/users"
    body: '{"name": "Test User", "email": "test@example.com"}'
    checks:
      - type: "status"
        value: 201
        description: "Should return 201 Created"

  - name: "Multiple Valid Status Codes"
    type: "rest"
    method: "GET"
    path: "/api/cache-or-fresh"
    checks:
      - type: "status"
        value: [200, 304]  # Accept either 200 OK or 304 Not Modified
        description: "Should return 200 or 304"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('User API Tests', async (scenario) => {
  await scenario
    .step('Successful API Call')
    .get('/api/users')
    .check('status', 200)

    .step('Create Resource')
    .post('/api/users')
    .json({ name: 'Test User', email: 'test@example.com' })
    .check('status', 201)

    .step('Multiple Valid Status Codes')
    .get('/api/cache-or-fresh')
    .check('status', [200, 304]);
});
```

<!-- tabs:end -->

### Response Time Checks

Validate performance requirements:

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Performance Critical Endpoint"
    type: "rest"
    method: "GET"
    path: "/api/fast-endpoint"
    checks:
      - type: "response_time"
        value: "<1000"
        description: "Should respond within 1 second"

      - type: "response_time"
        value: ">=50"
        description: "Should take at least 50ms (not cached)"

  - name: "Range Check"
    type: "rest"
    method: "POST"
    path: "/api/process"
    body: '{"data": "large payload"}'
    checks:
      - type: "response_time"
        value: "100-5000"  # Between 100ms and 5s
        description: "Should be between 100ms and 5 seconds"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Performance Checks', async (scenario) => {
  await scenario
    .step('Performance Critical Endpoint')
    .get('/api/fast-endpoint')
    .check('response_time', '<1000')
    .check('response_time', '>=50')

    .step('Range Check')
    .post('/api/process')
    .json({ data: 'large payload' })
    .check('response_time', '100-5000');
});
```

<!-- tabs:end -->

### Content Size Checks

Validate response size:

```yaml
steps:
  - name: "Size Validation"
    type: "rest"
    method: "GET"
    path: "/api/data"
    checks:
      - type: "size"
        value: "<10000"
        description: "Response should be under 10KB"
        
      - type: "size"
        value: ">100"
        description: "Response should not be empty"
```

## Content Validation

### JSON Content Checks

Validate JSON response structure and values:

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "JSON Validation"
    type: "rest"
    method: "GET"
    path: "/api/user/123"
    checks:
      # Check if field exists
      - type: "json_path"
        value: "$.id"
        description: "User should have an ID field"

      # Check exact value
      - type: "json_path"
        value: "$.id"
        expected: 123
        description: "ID should match requested user"

      # Check string content
      - type: "json_path"
        value: "$.email"
        operator: "contains"
        expected: "@"
        description: "Email should contain @ symbol"

      # Check numeric value
      - type: "json_path"
        value: "$.age"
        operator: ">"
        expected: 0
        description: "Age should be positive"

      # Check array length
      - type: "json_path"
        value: "$.roles.length"
        operator: ">="
        expected: 1
        description: "User should have at least one role"

      # Check nested object
      - type: "json_path"
        value: "$.profile.preferences.theme"
        expected: ["light", "dark"]
        description: "Theme should be light or dark"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('JSON Validation', async (scenario) => {
  await scenario
    .step('JSON Validation')
    .get('/api/user/123')
    .check('json_path', '$.id')
    .check('json_path', '$.id', { expected: 123 })
    .check('json_path', '$.email', { operator: 'contains', expected: '@' })
    .check('json_path', '$.age', { operator: '>', expected: 0 })
    .check('json_path', '$.roles.length', { operator: '>=', expected: 1 })
    .check('json_path', '$.profile.preferences.theme', { expected: ['light', 'dark'] });
});
```

<!-- tabs:end -->

### Text Content Checks

Validate text responses:

```yaml
steps:
  - name: "HTML Response Validation"
    type: "rest"
    method: "GET"
    path: "/health"
    checks:
      - type: "text_contains"
        value: "OK"
        description: "Health check should contain OK"
        
      - type: "text_contains"
        value: ["healthy", "operational", "running"]
        operator: "any"  # Any of these values
        description: "Should indicate system is operational"
        
      - type: "text_matches"
        value: "\\d{4}-\\d{2}-\\d{2}"  # Date pattern
        description: "Should contain a date in YYYY-MM-DD format"
        
      - type: "text_not_contains"
        value: ["error", "failed", "exception"]
        description: "Should not contain error indicators"
```

### Header Validation

Validate response headers:

```yaml
steps:
  - name: "Header Validation"
    type: "rest"
    method: "GET"
    path: "/api/data"
    checks:
      # Check header exists
      - type: "header"
        name: "Content-Type"
        description: "Should have Content-Type header"
        
      # Check header value
      - type: "header"
        name: "Content-Type"
        expected: "application/json"
        description: "Should return JSON content"
        
      # Check header contains value
      - type: "header"
        name: "Content-Type"
        operator: "contains"
        expected: "json"
        description: "Content-Type should indicate JSON"
        
      # Check security headers
      - type: "header"
        name: "X-Frame-Options"
        expected: ["DENY", "SAMEORIGIN"]
        description: "Should have proper X-Frame-Options"
        
      # Check rate limiting headers
      - type: "header"
        name: "X-RateLimit-Remaining"
        operator: ">"
        expected: 0
        description: "Should have rate limit remaining"
```

## Advanced Checks

### Custom JavaScript Checks

Implement complex validation logic:

```yaml
steps:
  - name: "Custom Validation"
    type: "rest"
    method: "GET"
    path: "/api/orders"
    checks:
      - type: "custom"
        script: |
          const data = JSON.parse(result.body);
          
          // Validate business rules
          const isValid = data.orders.every(order => {
            // Order must have required fields
            if (!order.id || !order.customer_id || !order.total) {
              return false;
            }
            
            // Total must match sum of items
            const itemsTotal = order.items.reduce((sum, item) => 
              sum + (item.price * item.quantity), 0);
            
            if (Math.abs(order.total - itemsTotal) > 0.01) {
              return false;
            }
            
            // Order date should be recent
            const orderDate = new Date(order.created_at);
            const daysOld = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
            
            return daysOld <= 90; // Within 90 days
          });
          
          return isValid;
        expected: true
        description: "All orders should pass business rule validation"
        
      - type: "custom"
        script: |
          const data = JSON.parse(result.body);
          
          // Performance validation
          const responseTime = result.duration;
          const recordCount = data.orders.length;
          
          // Should process at least 10 records per second
          const recordsPerSecond = (recordCount / responseTime) * 1000;
          
          return recordsPerSecond >= 10;
        expected: true
        description: "Should process at least 10 records per second"
```

### Conditional Checks

Apply checks based on conditions:

```yaml
steps:
  - name: "Conditional Validation"
    type: "rest"
    method: "GET"
    path: "/api/user-profile"
    checks:
      # Always check status
      - type: "status"
        value: 200
        
      # Only check admin fields for admin users
      - type: "json_path"
        value: "$.admin_privileges"
        condition: "{{user_role}} === 'admin'"
        description: "Admin users should have admin privileges"
        
      # Check different fields based on user type
      - type: "custom"
        script: |
          const data = JSON.parse(result.body);
          const userRole = context.variables.user_role;
          
          switch(userRole) {
            case 'admin':
              return data.permissions && data.permissions.includes('admin_access');
            case 'manager':
              return data.department && data.team_members;
            case 'user':
              return data.profile && data.preferences;
            default:
              return true; // Skip validation for unknown roles
          }
        expected: true
        description: "User data should match role requirements"
```

### Schema Validation

Validate JSON schema compliance:

```yaml
steps:
  - name: "Schema Validation"
    type: "rest"
    method: "GET"
    path: "/api/products"
    checks:
      - type: "json_schema"
        schema: |
          {
            "type": "object",
            "properties": {
              "products": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string", "minLength": 1},
                    "price": {"type": "number", "minimum": 0},
                    "category": {"type": "string"},
                    "in_stock": {"type": "boolean"},
                    "tags": {
                      "type": "array",
                      "items": {"type": "string"}
                    }
                  },
                  "required": ["id", "name", "price", "category"]
                }
              },
              "total_count": {"type": "integer", "minimum": 0}
            },
            "required": ["products", "total_count"]
          }
        description: "Response should match product schema"
```

## Performance Checks

### Throughput Validation

Validate system throughput requirements:

```yaml
global:
  performance_targets:
    min_throughput: 100  # RPS
    max_response_time: 2000  # ms
    max_error_rate: 0.01  # 1%

steps:
  - name: "High Throughput Endpoint"
    type: "rest"
    method: "GET"
    path: "/api/high-volume"
    checks:
      - type: "throughput"
        min_rps: "{{global.performance_targets.min_throughput}}"
        description: "Should handle minimum throughput requirement"
        
      - type: "response_time"
        percentile: 95
        value: "<{{global.performance_targets.max_response_time}}"
        description: "95th percentile should be under target"
```

### Resource Usage Checks

Monitor resource consumption:

```yaml
steps:
  - name: "Resource Monitoring"
    type: "rest"
    method: "POST"
    path: "/api/resource-intensive"
    body: '{"large_data": "{{faker.lorem.paragraphs(100)}}"}'
    checks:
      - type: "memory_usage"
        max_increase: "50MB"
        description: "Memory usage should not increase by more than 50MB"
        
      - type: "cpu_usage"
        max_percentage: 80
        description: "CPU usage should stay below 80%"
```

## Error Handling

### Expected Errors

Validate error responses:

```yaml
steps:
  - name: "Test Error Handling"
    type: "rest"
    method: "GET"
    path: "/api/users/nonexistent"
    checks:
      - type: "status"
        value: 404
        description: "Should return 404 for non-existent user"
        
      - type: "json_path"
        value: "$.error.code"
        expected: "USER_NOT_FOUND"
        description: "Should return proper error code"
        
      - type: "json_path"
        value: "$.error.message"
        operator: "contains"
        expected: "not found"
        description: "Error message should be descriptive"
        
  - name: "Validation Error Test"
    type: "rest"
    method: "POST"
    path: "/api/users"
    body: '{"email": "invalid-email"}'  # Invalid email format
    checks:
      - type: "status"
        value: 400
        description: "Should return 400 for invalid data"
        
      - type: "json_path"
        value: "$.validation_errors"
        description: "Should include validation errors"
        
      - type: "custom"
        script: |
          const data = JSON.parse(result.body);
          const hasEmailError = data.validation_errors?.some(
            error => error.field === 'email' && error.code === 'INVALID_FORMAT'
          );
          return hasEmailError;
        expected: true
        description: "Should include email validation error"
```

### Graceful Degradation

Validate system behavior under stress:

```yaml
steps:
  - name: "High Load Behavior"
    type: "rest"
    method: "GET"
    path: "/api/data"
    checks:
      # Primary check - should succeed
      - type: "status"
        value: [200, 202, 503]  # Accept partial success
        description: "Should handle high load gracefully"
        
      # If successful, validate content
      - type: "json_path"
        value: "$.data"
        condition: "result.status === 200"
        description: "Successful responses should include data"
        
      # If rate limited, check retry headers
      - type: "header"
        name: "Retry-After"
        condition: "result.status === 503"
        description: "Rate limited responses should include retry guidance"
```

## Check Configuration

### Fail Fast vs Continue

Configure check behavior on failure:

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Critical Check"
    type: "rest"
    method: "GET"
    path: "/api/critical"
    checks:
      - type: "status"
        value: 200
        fail_test: true  # Stop entire test if this fails
        description: "Critical endpoint must be operational"

  - name: "Optional Check"
    type: "rest"
    method: "GET"
    path: "/api/optional"
    checks:
      - type: "status"
        value: 200
        fail_test: false  # Continue test even if this fails
        description: "Optional endpoint may fail"

  - name: "Warning Check"
    type: "rest"
    method: "GET"
    path: "/api/monitored"
    checks:
      - type: "response_time"
        value: "<2000"
        severity: "warning"  # Log warning but don't fail
        description: "Should be fast but not critical"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Check Behavior Configuration', async (scenario) => {
  await scenario
    .step('Critical Check')
    .get('/api/critical')
    .check('status', 200, { failTest: true })

    .step('Optional Check')
    .get('/api/optional')
    .check('status', 200, { failTest: false })

    .step('Warning Check')
    .get('/api/monitored')
    .check('response_time', '<2000', { severity: 'warning' });
});
```

<!-- tabs:end -->

### Check Retry Logic

Retry checks on failure:

```yaml
checks:
  - type: "status"
    value: 200
    retry:
      count: 3
      delay: "1s"
      backoff: "exponential"  # 1s, 2s, 4s
    description: "Retry status check with backoff"
    
  - type: "custom"
    script: |
      // Check might be flaky, implement own retry logic
      const maxAttempts = 3;
      let attempt = 0;
      
      while (attempt < maxAttempts) {
        try {
          const data = JSON.parse(result.body);
          if (data.status === 'processing' && attempt < maxAttempts - 1) {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt++;
            continue;
          }
          return data.status === 'completed';
        } catch (error) {
          if (attempt === maxAttempts - 1) throw error;
          attempt++;
        }
      }
      return false;
    expected: true
    description: "Should eventually complete processing"
```

## Best Practices

### 1. Write Descriptive Check Messages

```yaml
# Good: Clear, specific descriptions
checks:
  - type: "status"
    value: 200
    description: "User creation should succeed with valid data"
    
  - type: "json_path"
    value: "$.id"
    description: "Created user should have a unique ID"

# Avoid: Generic, unclear descriptions
checks:
  - type: "status"
    value: 200
    description: "Should work"
    
  - type: "json_path"
    value: "$.id"
    description: "Check ID"
```

### 2. Use Appropriate Check Types

```yaml
# Good: Specific checks for specific validations
checks:
  - type: "status"
    value: 200
    
  - type: "response_time"
    value: "<2000"
    
  - type: "json_path"
    value: "$.email"
    operator: "matches"
    expected: "^[^@]+@[^@]+\\.[^@]+$"

# Avoid: Using custom checks for simple validations
checks:
  - type: "custom"
    script: "return result.status === 200;"  # Use status check instead
```

### 3. Balance Coverage and Performance

```yaml
# Good: Essential checks only
checks:
  - type: "status"
    value: 200
  - type: "json_path"
    value: "$.id"
  - type: "response_time"
    value: "<1000"

# Avoid: Excessive checking that slows down tests
checks:
  - type: "json_path"
    value: "$.field1"
  - type: "json_path" 
    value: "$.field2"
  # ... 20 more field checks
```

### 4. Use Variables for Dynamic Checks

```yaml
scenarios:
  - name: "Dynamic Validation"
    variables:
      expected_user_id: "{{faker.string.uuid}}"
      max_response_time: 2000
    steps:
      - name: "Validate User"
        type: "rest"
        method: "GET"
        path: "/api/users/{{expected_user_id}}"
        checks:
          - type: "json_path"
            value: "$.id"
            expected: "{{expected_user_id}}"
          - type: "response_time"
            value: "<{{max_response_time}}"
```

### 5. Group Related Checks

```yaml
steps:
  - name: "Comprehensive API Validation"
    type: "rest"
    method: "POST"
    path: "/api/orders"
    body: '{"items": [{"id": 1, "quantity": 2}]}'
    checks:
      # Response structure checks
      - type: "status"
        value: 201
        description: "Order creation should succeed"
      - type: "json_path"
        value: "$.order_id"
        description: "Should return order ID"
      - type: "json_path"
        value: "$.total"
        operator: ">"
        expected: 0
        description: "Order total should be positive"
        
      # Performance checks
      - type: "response_time"
        value: "<3000"
        description: "Order creation should be fast"
        
      # Business logic checks
      - type: "custom"
        script: |
          const data = JSON.parse(result.body);
          return data.status === 'pending' && data.items.length > 0;
        expected: true
        description: "New order should be pending with items"
```

Checks and assertions are crucial for validating system correctness under load. Use them strategically to ensure your performance tests validate both performance and functionality requirements.
# Performance Thresholds

Performance thresholds in Perfornium allow you to define success criteria for individual requests, operations, and browser actions. When thresholds are exceeded, you can automatically trigger actions like logging warnings, failing steps, or aborting tests entirely.

## Overview

Thresholds provide:
- **Per-step performance criteria** - Set specific limits for each API call, SOAP operation, or browser action
- **Automatic failure detection** - Immediately detect when performance degrades
- **Flexible actions** - Log, warn, fail, or abort based on threshold violations
- **Multiple metrics** - Response time, status codes, error rates, and custom metrics
- **Dynamic evaluation** - Use custom scripts for complex threshold logic

## Threshold Configuration

### Basic Threshold Structure

```yaml
thresholds:
  - metric: response_time
    value: 1000
    operator: lte
    severity: error
    action: fail_step
    description: "API response time should be under 1 second"
```

### Available Metrics

| Metric | Description | Units | Example Values |
|--------|-------------|-------|---------------|
| `response_time` | Request duration | milliseconds | `500`, `"1s"`, `"250ms"` |
| `status_code` | HTTP/SOAP status | number | `200`, `404`, `500` |
| `error_rate` | Percentage of errors | percentage | `0`, `5`, `"2%"` |
| `throughput` | Requests per second | req/s | `100`, `"50rps"` |
| `custom` | User-defined metric | varies | depends on implementation |

### Operators

| Operator | Symbol | Description | Example |
|----------|--------|-------------|---------|
| `lt` | `<` | Less than | `response_time < 500ms` |
| `lte` | `≤` | Less than or equal | `response_time ≤ 1000ms` |
| `gt` | `>` | Greater than | `throughput > 50rps` |
| `gte` | `≥` | Greater than or equal | `status_code ≥ 200` |
| `eq` | `=` | Equal to | `status_code = 200` |
| `ne` | `≠` | Not equal to | `status_code ≠ 404` |

### Severity Levels

- **`warning`** - Log threshold violation but continue
- **`error`** - Standard error level (default)
- **`critical`** - High priority threshold violation

### Actions

| Action | Behavior |
|--------|----------|
| `log` | Log threshold violation and continue (default) |
| `fail_step` | Fail the current step only |
| `fail_scenario` | Fail the entire scenario |
| `fail_test` | Fail the entire test |
| `abort` | Immediately terminate test execution |

## REST API Thresholds

### Basic API Threshold

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "API Performance Test"
    requests:
      - url: "/api/users"
        method: GET
        thresholds:
          - metric: response_time
            value: 500
            operator: lte
            description: "User list should load within 500ms"

          - metric: status_code
            value: 200
            operator: eq
            description: "Should return 200 OK"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('API Performance Test', async (scenario) => {
  await scenario
    .get('/api/users')
    .withThresholds({
      response_time: { value: 500, operator: 'lte' },
      status_code: { value: 200, operator: 'eq' }
    });
});
```

<!-- tabs:end -->

### Multiple Thresholds per Request

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Comprehensive API Test"
    requests:
      - url: "/api/search"
        method: POST
        body: |
          {
            "query": "performance testing",
            "limit": 100
          }
        thresholds:
          # Response time thresholds
          - metric: response_time
            value: "2s"
            operator: lte
            severity: warning
            action: log
            description: "Search should complete within 2 seconds"

          - metric: response_time
            value: "5s"
            operator: lte
            severity: critical
            action: fail_step
            description: "Search must complete within 5 seconds"

          # Status validation
          - metric: status_code
            value: 200
            operator: eq
            action: fail_step
            description: "Search API should return success"

          # Performance baseline
          - metric: throughput
            value: 10
            operator: gte
            severity: warning
            description: "Should maintain at least 10 req/s throughput"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Comprehensive API Test', async (scenario) => {
  await scenario
    .post('/api/search')
    .json({
      query: 'performance testing',
      limit: 100
    })
    .withThresholds({
      response_time: [
        { value: '2s', operator: 'lte', severity: 'warning', action: 'log' },
        { value: '5s', operator: 'lte', severity: 'critical', action: 'fail_step' }
      ],
      status_code: { value: 200, operator: 'eq', action: 'fail_step' },
      throughput: { value: 10, operator: 'gte', severity: 'warning' }
    });
});
```

<!-- tabs:end -->

### Dynamic Thresholds with Variables

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Dynamic Threshold Test"
    variables:
      max_response_time: 1000
      expected_status: 201

    requests:
      - url: "/api/orders"
        method: POST
        thresholds:
          - metric: response_time
            value: "{{max_response_time}}"
            operator: lte
            description: "Order creation within {{max_response_time}}ms"

          - metric: status_code
            value: "{{expected_status}}"
            operator: eq
            description: "Should return status {{expected_status}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Dynamic Threshold Test', async (scenario) => {
  const maxResponseTime = 1000;
  const expectedStatus = 201;

  await scenario
    .post('/api/orders')
    .withThresholds({
      response_time: { value: maxResponseTime, operator: 'lte' },
      status_code: { value: expectedStatus, operator: 'eq' }
    });
});
```

<!-- tabs:end -->

## SOAP Service Thresholds

### SOAP Operation Thresholds

```yaml
protocol: soap
soap:
  wsdl_url: "http://webservices.example.com/calculator?wsdl"

scenarios:
  - name: "SOAP Performance Test"
    requests:
      - operation: "ComplexCalculation"
        parameters:
          numbers: [1, 2, 3, 4, 5]
          operation: "sum"
        
        thresholds:
          - metric: response_time
            value: "3s"
            operator: lte
            severity: error
            action: fail_step
            description: "Complex calculation should complete within 3 seconds"
          
          - metric: status_code
            value: 200
            operator: eq
            description: "SOAP operation should succeed"
          
          # Custom threshold for SOAP faults
          - metric: custom
            value: 0
            operator: eq
            description: "Should not return SOAP faults"
            custom_script: |
              // Return true if no SOAP fault occurred
              return !result.error || !result.error.includes('soap:Fault');
```

### Enterprise SOAP Thresholds

```yaml
scenarios:
  - name: "Enterprise Service Test"
    requests:
      - operation: "ProcessBusinessTransaction"
        parameters:
          transactionData:
            amount: 1000.00
            currency: "USD"
            type: "PAYMENT"
        
        thresholds:
          # Strict SLA requirements
          - metric: response_time
            value: "2s"
            operator: lte
            severity: critical
            action: fail_test
            description: "Payment processing SLA: 2 seconds maximum"
          
          # Business rule validation
          - metric: custom
            description: "Transaction must be approved"
            custom_script: |
              const response = JSON.parse(result.response_body || '{}');
              return response.status === 'APPROVED';
            action: fail_scenario
```

## Browser Action Thresholds

### Page Load Thresholds

```yaml
protocol: browser

scenarios:
  - name: "Web Performance Test"
    browser:
      actions:
        - goto:
            url: "https://example.com"
          thresholds:
            - metric: response_time
              value: "3s"
              operator: lte
              description: "Page should load within 3 seconds"
            
            # Custom Web Vitals threshold
            - metric: custom
              description: "Largest Contentful Paint under 2.5s"
              custom_script: |
                const lcp = context.webVitals?.lcp || 0;
                return lcp <= 2500;
              severity: warning
              action: log
        
        - click:
            selector: "button#search"
          thresholds:
            - metric: response_time
              value: 1000
              operator: lte
              description: "Button click should respond within 1 second"
```

### Form Interaction Thresholds

```yaml
scenarios:
  - name: "Form Performance Test"
    browser:
      actions:
        - fill:
            selector: "input#email"
            value: "{{faker.internet.email}}"
          thresholds:
            - metric: response_time
              value: 200
              operator: lte
              severity: warning
              description: "Form field should respond immediately"
        
        - click:
            selector: "button[type='submit']"
          thresholds:
            - metric: response_time
              value: "5s"
              operator: lte
              severity: critical
              action: fail_step
              description: "Form submission must complete within 5 seconds"
            
            # Verify successful navigation
            - metric: custom
              description: "Should navigate to success page"
              custom_script: |
                return context.page.url().includes('/success') || 
                       context.page.url().includes('/dashboard');
              action: fail_step
```

## TypeScript Configuration

### TypeScript API Thresholds

```typescript
import { defineConfig } from '@testsmith/perfornium';

export default defineConfig({
  scenarios: [
    {
      name: 'API Performance Test',
      requests: [
        {
          url: '/api/users',
          method: 'GET',
          thresholds: [
            {
              metric: 'response_time',
              value: 500,
              operator: 'lte',
              severity: 'error',
              description: 'User list should load within 500ms'
            },
            {
              metric: 'status_code',
              value: 200,
              operator: 'eq',
              action: 'fail_step',
              description: 'Should return 200 OK'
            }
          ]
        }
      ]
    }
  ]
});
```

### TypeScript Browser Thresholds

```typescript
import { defineConfig } from '@testsmith/perfornium';

export default defineConfig({
  protocol: 'browser',
  scenarios: [
    {
      name: 'Browser Performance Test',
      browser: {
        actions: [
          {
            goto: { url: 'https://app.example.com' },
            thresholds: [
              {
                metric: 'response_time',
                value: '3s',
                operator: 'lte',
                severity: 'critical',
                action: 'fail_step',
                description: 'App should load within 3 seconds'
              }
            ]
          },
          {
            click: { selector: 'button#login' },
            thresholds: [
              {
                metric: 'response_time',
                value: 1000,
                operator: 'lte',
                description: 'Login button should respond within 1 second'
              },
              {
                metric: 'custom',
                description: 'Should show login form',
                custom_script: `
                  const loginForm = document.querySelector('.login-form');
                  return loginForm && loginForm.style.display !== 'none';
                `,
                action: 'fail_step'
              }
            ]
          }
        ]
      }
    }
  ]
});
```

## Advanced Threshold Scenarios

### Progressive Thresholds

```yaml
scenarios:
  - name: "Progressive Performance Test"
    requests:
      - url: "/api/data"
        method: GET
        thresholds:
          # Progressive response time thresholds
          - metric: response_time
            value: "500ms"
            operator: lte
            severity: warning
            action: log
            description: "Optimal performance: under 500ms"
          
          - metric: response_time
            value: "1s"
            operator: lte
            severity: error
            action: log
            description: "Acceptable performance: under 1 second"
          
          - metric: response_time
            value: "3s"
            operator: lte
            severity: critical
            action: fail_step
            description: "Maximum acceptable: under 3 seconds"
```

### Conditional Thresholds

```yaml
scenarios:
  - name: "Conditional Threshold Test"
    requests:
      - url: "/api/heavy-operation"
        method: POST
        thresholds:
          # Different thresholds based on data size
          - metric: custom
            description: "Adjust threshold based on payload size"
            custom_script: |
              const payloadSize = JSON.stringify(context.request.body).length;
              const expectedTime = payloadSize > 10000 ? 5000 : 2000;
              return result.duration <= expectedTime;
            action: fail_step
```

### Business Logic Thresholds

```yaml
scenarios:
  - name: "Business Logic Validation"
    requests:
      - url: "/api/orders"
        method: POST
        thresholds:
          # Standard performance threshold
          - metric: response_time
            value: "2s"
            operator: lte
            description: "Order creation performance"
          
          # Business validation threshold
          - metric: custom
            description: "Order must be valid and have confirmation number"
            custom_script: |
              try {
                const response = JSON.parse(result.response_body);
                return response.status === 'confirmed' && 
                       response.confirmation_number && 
                       response.order_id;
              } catch (e) {
                return false;
              }
            severity: critical
            action: fail_scenario
```

## Load Testing with Thresholds

### Scaling Threshold Management

```yaml
load:
  pattern: basic
  virtual_users: 100
  duration: "10m"

scenarios:
  - name: "Load Test with Thresholds"
    requests:
      - url: "/api/products"
        method: GET
        thresholds:
          # Relaxed thresholds for high-load scenarios
          - metric: response_time
            value: "2s"
            operator: lte
            description: "Products API under load"
          
          - metric: error_rate
            value: "5%"
            operator: lte
            severity: warning
            description: "Error rate should stay below 5% under load"
          
          # Throughput threshold
          - metric: throughput
            value: 50
            operator: gte
            description: "Should maintain 50+ req/s throughput"
```

### Environment-Specific Thresholds

```yaml
environments:
  development:
    api_threshold: "5s"
    error_tolerance: "10%"
  
  staging:
    api_threshold: "2s"
    error_tolerance: "5%"
  
  production:
    api_threshold: "1s"
    error_tolerance: "1%"

scenarios:
  - name: "Environment-Aware Test"
    requests:
      - url: "/api/search"
        method: GET
        thresholds:
          - metric: response_time
            value: "{{env.api_threshold}}"
            operator: lte
            description: "Environment-specific response time"
          
          - metric: error_rate
            value: "{{env.error_tolerance}}"
            operator: lte
            description: "Environment-specific error tolerance"
```

## Best Practices

### 1. Set Realistic Thresholds

```yaml
# Good: Based on actual requirements
thresholds:
  - metric: response_time
    value: "2s"  # Based on user experience research
    operator: lte
    description: "User attention span threshold"

# Avoid: Arbitrary or too strict
thresholds:
  - metric: response_time
    value: 50  # Unrealistic for complex operations
    operator: lte
```

### 2. Use Progressive Severity

```yaml
# Recommended approach
thresholds:
  - metric: response_time
    value: "1s"
    severity: warning
    action: log
  
  - metric: response_time
    value: "3s"
    severity: error
    action: fail_step
  
  - metric: response_time
    value: "10s"
    severity: critical
    action: fail_test
```

### 3. Environment-Appropriate Actions

```yaml
# Development environment
thresholds:
  - metric: response_time
    value: "5s"
    action: log  # Don't break development flow

# Production monitoring
thresholds:
  - metric: response_time
    value: "2s"
    action: fail_test  # Strict production requirements
```

### 4. Meaningful Descriptions

```yaml
# Good: Specific and actionable
thresholds:
  - metric: response_time
    value: "1s"
    description: "Search results must appear within 1 second for good UX"

# Avoid: Generic descriptions
thresholds:
  - metric: response_time
    value: "1s"
    description: "Should be fast"
```

Performance thresholds provide automated quality gates that ensure your applications meet performance requirements consistently across different environments and load conditions.
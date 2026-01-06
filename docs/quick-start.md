# Quick Start Guide

This guide will get you up and running with Perfornium in just a few minutes.

## Prerequisites

- Node.js 16 or higher
- npm or yarn package manager

## Installation

### Global Installation (Recommended)

```bash
npm install -g @testsmith/perfornium
```

### Local Installation

```bash
npm install @testsmith/perfornium
```

## Your First Test

Let's create a simple performance test for a REST API.

### 1. Create Test Configuration

Create a file called `my-first-test.yml` (or `my-first-test.ts` for TypeScript):

<!-- tabs:start -->

#### **YAML**

```yaml
name: "My First Performance Test"
description: "Testing JSONPlaceholder API"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 30000
  debug:
    log_level: "info"

load:
  pattern: "basic"
  virtual_users: 5
  ramp_up: "10s"
  duration: "30s"

scenarios:
  - name: "Get Posts"
    steps:
      - name: "List Posts"
        type: "rest"
        method: "GET"
        path: "/posts"
        headers:
          Content-Type: "application/json"
        checks:
          - type: "status"
            value: 200
            description: "Response should be 200 OK"

outputs:
  - type: "json"
    file: "results/my-first-test-{{timestamp}}.json"
  - type: "csv"
    file: "results/my-first-test-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/my-first-test-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('My First Performance Test')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .timeout(30000)
  .scenario('Get Posts')
    .get('/posts', 'List Posts')
      .headers({ 'Content-Type': 'application/json' })
      .check('status', 200, 'Response should be 200 OK')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    ramp_up: '10s',
    duration: '30s'
  })
  .withJSONOutput('results/my-first-test-{{timestamp}}.json')
  .withCSVOutput('results/my-first-test-{{timestamp}}.csv')
  .withReport('reports/my-first-test-report.html')
  .build();
```

<!-- tabs:end -->

### 2. Run the Test

```bash
perfornium run my-first-test.yml
```

You'll see output like this:

```
[INFO] Loading configuration: my-first-test.yml
[INFO] Validating configuration...
[INFO] 📊 Real-time metrics enabled with batch size: 10
[INFO] 📄 Incremental JSON/CSV files enabled
🚀 Starting test: My First Performance Test
🎯 Basic load: 5 VUs, ramp-up: 10.0s, duration: 30.0s
🔧 Creating VU 1...
✅ VU 1 ready
🔧 Creating VU 2...
✅ VU 2 ready
...
✅ Test completed successfully in 42.3s
📊 Generated report: reports/my-first-test-report.html
```

### 3. View Results

After the test completes, you'll have:

- **Real-time results**: `results/my-first-test-[timestamp].json` and `.csv`
- **HTML report**: `reports/my-first-test-report.html`

Open the HTML report in your browser to see detailed performance metrics, charts, and statistics.

## Understanding the Results

### CSV Output
The CSV file contains individual request results:

```csv
timestamp,vu_id,scenario,action,step_name,duration,success,status,error,request_url
"2024-01-15T10:30:25.123Z","1","Get Posts","List Posts","List Posts","156","true","200","","/posts"
```

### JSON Output
The JSON file contains the same data in structured format:

```json
[
  {
    "id": "1-1642248625123",
    "vu_id": 1,
    "scenario": "Get Posts",
    "action": "List Posts",
    "step_name": "List Posts",
    "timestamp": 1642248625123,
    "duration": 156,
    "success": true,
    "status": 200,
    "request_url": "/posts"
  }
]
```

### HTML Report
The HTML report includes:

- **Summary Statistics**: Total requests, success rate, average response time
- **Response Time Charts**: Timeline and distribution charts
- **Performance Metrics**: Min, max, mean, median, 95th percentile response times
- **Error Analysis**: Detailed breakdown of any failures

## Next Steps

Now that you've run your first test, explore more advanced features:

### Add Data-Driven Testing

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Get User Posts"
    csv_data:
      file: "test-data/users.csv"
      mode: "sequential"
    steps:
      - name: "Get Posts for User"
        type: "rest"
        method: "GET"
        path: "/users/{{userId}}/posts"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Data-Driven Test')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .scenario('Get User Posts')
    .csvData('test-data/users.csv', 'sequential')
    .get('/users/{{userId}}/posts', 'Get Posts for User')
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '30s'
  })
  .build();
```

<!-- tabs:end -->

### Add Authentication

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Authenticated API Calls"
    hooks:
      beforeScenario: |
        // Login and get token
        const response = await fetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'test', password: 'test' })
        });
        const data = await response.json();
        context.variables.token = data.token;
    steps:
      - name: "Protected Resource"
        type: "rest"
        method: "GET"
        path: "/protected"
        headers:
          Authorization: "Bearer {{token}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Authenticated Test')
  .baseUrl('https://api.example.com')
  .scenario('Authenticated API Calls')
    .beforeScenario(async (context) => {
      // Login and get token
      const response = await fetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'test', password: 'test' })
      });
      const data = await response.json();
      context.variables.token = data.token;
    })
    .get('/protected', 'Protected Resource')
      .headers({ 'Authorization': 'Bearer {{token}}' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '30s'
  })
  .build();
```

<!-- tabs:end -->

### Use Different Load Patterns

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "stepping"
  start_users: 1
  step_users: 2
  step_duration: "30s"
  max_users: 10
  duration: "5m"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Stepping Load Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint', 'Request')
    .done()
  .withLoad({
    pattern: 'stepping',
    start_users: 1,
    step_users: 2,
    step_duration: '30s',
    max_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Common Use Cases

### API Load Testing
Test your REST APIs under various load conditions to identify performance bottlenecks.

### Authentication Flow Testing
Test complete user authentication flows including login, token refresh, and API access.

### Data-Driven Testing
Use CSV files to provide test data, enabling testing with realistic user data sets.

### Browser-Based Testing
Use Playwright integration to test full user journeys in real browsers.

## Troubleshooting

### Test Not Starting
- Check Node.js version (`node --version` should be 16+)
- Verify YAML syntax with a YAML validator
- Check file permissions for output directories

### Connection Errors
- Verify the target URL is accessible
- Check firewall settings
- Ensure the target system can handle the load

### Performance Issues
- Reduce virtual user count for initial testing
- Increase timeout values if requests are slow
- Check system resources (CPU, memory)

## Getting Help

- **Documentation**: Continue reading this documentation for detailed guides
- **Examples**: Check the [examples section](examples/rest-basic.md) for more test scenarios
- **Issues**: Report problems on GitHub
- **Community**: Join discussions and share experiences

Ready to dive deeper? Check out:
- [YAML Configuration Guide](config/yaml.md)
- [Load Patterns](load-patterns/basic.md)
- [Protocol Guides](protocols/rest.md)
# Perfornium

> A powerful, flexible, and easy-to-use performance testing framework for REST APIs, SOAP services, and web applications.

[![npm version](https://img.shields.io/npm/v/@testsmith/perfornium.svg)](https://www.npmjs.com/package/@testsmith/perfornium)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![CI](https://github.com/testsmith-io/perfornium/actions/workflows/ci.yml/badge.svg)](https://github.com/testsmith-io/perfornium/actions/workflows/ci.yml)

## ✨ Features

- 🚀 **Easy to Use** - Simple YAML syntax or powerful TypeScript DSL
- 🔧 **Highly Extensible** - Plugin architecture for protocols and outputs
- 🌐 **Multi-Protocol** - REST, SOAP, and Web (Playwright) support
- 📊 **Rich Reporting** - JSON, CSV, InfluxDB, Graphite, HTML reports
- ⚡ **High Performance** - Efficient load generation with virtual users
- 🎯 **Flexible Load Patterns** - Basic, stepping, arrivals, and custom patterns
- 📈 **Real-time Metrics** - Monitor performance as tests run
- 🔄 **Data-Driven** - CSV data support for realistic test scenarios

## 🚀 Quick Start

### Installation

```bash
# Global installation
npm install -g @testsmith/perfornium

# Or as a project dependency
npm install --save-dev @testsmith/perfornium
```

### Your First Test (YAML)

Create a file `my-test.yml`:

```yaml
name: "Simple API Test"
global:
  base_url: "https://jsonplaceholder.typicode.com"

load:
  pattern: "basic"
  virtual_users: 10
  duration: "1m"

scenarios:
  - name: "get_posts"
    steps:
      - method: "GET"
        path: "/posts"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results.json"

report:
  generate: true
  output: "report.html"
```

Run it:

```bash
perfornium run my-test.yml
```

### Your First Test (TypeScript)

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('API Test')
  .baseUrl('https://jsonplaceholder.typicode.com')
  .scenario('Get Posts', 100)
    .get('/posts')
      .check('status', 200)
      .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '1m' })
  .run();
```

## 📖 Documentation

Full documentation is available at [https://testsmith-io.github.io/perfornium](https://testsmith-io.github.io/perfornium)

- [Quick Start](https://testsmith-io.github.io/perfornium/#/quick-start) - Get started in minutes
- [Configuration Guide](https://testsmith-io.github.io/perfornium/#/config/yaml) - YAML and TypeScript configuration
- [Load Patterns](https://testsmith-io.github.io/perfornium/#/load-patterns/basic) - Basic, stepping, and arrival patterns
- [Examples](https://testsmith-io.github.io/perfornium/#/examples/rest-basic) - Real-world examples

## 🎯 Use Cases

### REST API Testing

Test any REST API with support for:
- All HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Authentication (Basic, Bearer, OAuth, Digest)
- All payload types (JSON, XML, Form, Multipart)
- Query parameters and custom headers
- Response validation and data extraction

```yaml
steps:
  - method: "POST"
    path: "/api/users"
    auth:
      type: "bearer"
      token: "your-token"
    json:
      name: "John Doe"
      email: "john@example.com"
    checks:
      - type: "status"
        value: 201
    extract:
      - name: "user_id"
        type: "json_path"
        expression: "$.id"
```

### Web Application Testing

Test web applications with Playwright:

```yaml
global:
  web:
    type: "chromium"
    headless: true
    base_url: "https://example.com"

scenarios:
  - name: "user_journey"
    steps:
      - type: "web"
        action:
          command: "goto"
          url: "/"
      - type: "web"
        action:
          command: "fill"
          selector: "#email"
          value: "test@example.com"
      - type: "web"
        action:
          command: "click"
          selector: "#submit"
```

### SOAP Service Testing

```yaml
global:
  wsdl_url: "http://example.com/service?WSDL"

scenarios:
  - name: "soap_test"
    steps:
      - type: "soap"
        operation: "GetUser"
        args:
          userId: 123
```

## 🎨 Load Patterns

### Basic Pattern
Fixed number of virtual users for a duration:

```yaml
load:
  pattern: "basic"
  virtual_users: 50
  ramp_up: "30s"
  duration: "5m"
```

### Stepping Pattern
Gradually increase load:

```yaml
load:
  pattern: "stepping"
  steps:
    - users: 10
      duration: "2m"
    - users: 25
      duration: "3m"
    - users: 50
      duration: "5m"
```

### Arrivals Pattern
Constant arrival rate:

```yaml
load:
  pattern: "arrivals"
  rate: 10  # users per second
  duration: "5m"
```

### Multiple Profiles
Run different patterns concurrently:

```yaml
load:
  pattern: "mixed"
  profiles:
    - name: "readers"
      pattern: "basic"
      virtual_users: 100
      scenarios: ["read_data"]
    - name: "writers"
      pattern: "stepping"
      scenarios: ["write_data"]
```

## 📊 Outputs and Reporting

Perfornium supports multiple output formats:

```yaml
outputs:
  # Raw metrics
  - type: "csv"
    file: "results/metrics.csv"

  # Structured results
  - type: "json"
    file: "results/results.json"

  # Time-series databases
  - type: "influxdb"
    url: "http://localhost:8086"
    database: "perfornium"

  # Metrics backends
  - type: "graphite"
    url: "localhost:2003"

  # Webhooks
  - type: "webhook"
    url: "https://example.com/webhook"

# Beautiful HTML reports
report:
  generate: true
  output: "results/report.html"
```

## 💡 TypeScript DSL

For complex tests, use the TypeScript DSL:

```typescript
import { test, load, testData } from '@testsmith/perfornium/dsl';

const config = test('E-Commerce Test')
  .description('User shopping journey')
  .baseUrl('https://api.shop.com')
  .variables({ environment: 'staging' })

  .withLoad({
    pattern: 'stepping',
    duration: '10m',
    steps: [
      { users: 10, duration: '3m' },
      { users: 25, duration: '4m' },
      { users: 50, duration: '3m' }
    ]
  })

  .scenario('Shopping Flow', 100)
    .beforeScenario(async (context) => {
      context.variables.userId = testData.uuid();
    })

    .get('/products')
      .check('status', 200)
      .extract('product_id', '$.products[0].id')

    .post('/cart', {
      product_id: '{{product_id}}',
      quantity: 1
    })
      .withBearerToken('{{auth_token}}')
      .check('status', 201)

    .done()

  .withJSONOutput('results/shopping.json')
  .withReport('results/shopping-report.html')

  .build();

// Run it
import { TestRunner } from '@testsmith/perfornium';
await new TestRunner(config).run();
```

## 🛠️ CLI Commands

```bash
# Run a test
perfornium run test.yml

# Validate configuration
perfornium validate test.yml

# Run distributed test
perfornium distributed --config test.yml --workers 4

# Generate report from results
perfornium report --results results.json --output report.html
```

## 🏗️ Architecture

```
perfornium/
├── src/
│   ├── protocols/      # Protocol handlers (REST, SOAP, Web)
│   ├── load-patterns/  # Load generation patterns
│   ├── core/           # Test runner and execution engine
│   ├── outputs/        # Output handlers
│   ├── reporting/      # HTML report generation
│   ├── dsl/            # TypeScript DSL
│   └── config/         # Configuration types
│
├── examples/           # Example configurations
├── tmp/test-project/   # Sample test project
└── docs/              # Documentation
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT

## 🙏 Acknowledgments

Built with:
- [Axios](https://axios-http.com/) - HTTP client
- [Playwright](https://playwright.dev/) - Web testing
- [Commander](https://github.com/tj/commander.js) - CLI framework
- [Handlebars](https://handlebarsjs.com/) - Templating

---

**Happy Load Testing!** 🚀

For more information, see the [documentation](https://testsmith-io.github.io/perfornium).

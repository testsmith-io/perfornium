# Perfornium

> A modern, flexible performance testing framework that supports multiple protocols and provides real-time metrics.

## What is Perfornium?

Perfornium is a powerful performance testing framework designed for modern applications. It supports multiple protocols (REST, SOAP, Browser automation), provides flexible configuration options (YAML and TypeScript), and delivers real-time metrics with comprehensive reporting.

## Key Features

### 🚀 **Multi-Protocol Support**
- **REST API Testing** - Full HTTP/HTTPS support with headers, authentication, and data extraction
- **SOAP Web Services** - Native SOAP envelope handling and WSDL import
- **Browser Testing** - Powered by Playwright for full browser automation

### 📝 **Flexible Configuration**
- **YAML Configuration** - Human-readable configuration files
- **TypeScript Configuration** - Type-safe configuration with IDE support
- **Environment Support** - Multiple environments and variable substitution

### 📊 **Real-time Metrics**
- **Live CSV/JSON Output** - Streaming results during test execution
- **HTML Reports** - Beautiful, interactive reports generated after tests
- **External Integrations** - InfluxDB, Graphite, and webhook support

### 🎯 **Advanced Load Patterns**
- **Basic Load** - Simple ramp-up and constant load
- **Stepping Load** - Gradual load increase in steps
- **Arrival Rate** - Request-per-second based testing
- **Custom Patterns** - Define your own load profiles

### 🔧 **Virtual User Management**
- **Efficient VU Spawning** - Optimized virtual user creation and management
- **CSV Data Injection** - Feed data from CSV files to virtual users
- **Variable Templating** - Dynamic data generation with Faker.js

## Quick Start

### Installation

```bash
npm install -g @testsmith/perfornium
```

### Basic Usage

1. **Create a simple test configuration:**

<!-- tabs:start -->

#### **YAML**

```yaml
name: "My First Performance Test"
description: "Testing API performance"

global:
  base_url: "https://api.example.com"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 10
  ramp_up: "30s"
  duration: "2m"

scenarios:
  - name: "Get Users"
    steps:
      - name: "List Users"
        type: "rest"
        method: "GET"
        path: "/users"
        headers:
          Content-Type: "application/json"

outputs:
  - type: "json"
    file: "results/test-results.json"
  - type: "csv"
    file: "results/test-results.csv"

report:
  generate: true
  output: "reports/test-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('My First Performance Test')
  .description('Testing API performance')
  .baseUrl('https://api.example.com')
  .timeout(30000)
  .scenario('Get Users')
    .get('/users', {
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .done()
  .withLoad({
    pattern: 'basic',
    virtualUsers: 10,
    rampUp: '30s',
    duration: '2m'
  })
  .withOutputs([
    { type: 'json', file: 'results/test-results.json' },
    { type: 'csv', file: 'results/test-results.csv' }
  ])
  .withReport({
    generate: true,
    output: 'reports/test-report.html'
  })
  .build();
```

<!-- tabs:end -->

2. **Run the test:**

```bash
perfornium run my-test.yml
```

3. **View results:**
- Real-time metrics: `results/test-results.json` and `results/test-results.csv`
- Final report: `reports/test-report.html`

## Architecture Overview

Perfornium is built with performance and flexibility in mind:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Config Parser │    │  Virtual Users  │    │ Protocol Handlers│
│                 │    │                 │    │                 │
│ • YAML/TS       │───▶│ • VU Pool       │───▶│ • REST          │
│ • Validation    │    │ • CSV Data      │    │ • SOAP          │
│ • Templating    │    │ • Load Patterns │    │ • Browser       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Outputs       │    │  Metrics        │    │   Reporting     │
│                 │    │                 │    │                 │
│ • CSV           │◀───│ • Real-time     │───▶│ • HTML Reports  │
│ • JSON          │    │ • Aggregation   │    │ • Live Dashboard│
│ • External APIs │    │ • Percentiles   │    │ • Export        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Use Cases

### API Performance Testing
Test REST APIs with various load patterns, authentication methods, and data validation.

### Web Application Testing
Use browser automation to test complete user journeys and measure real-world performance.

### Microservices Testing
Test complex microservice architectures with dependent API calls and data flow validation.

### Load Testing
Generate sustained load to identify performance bottlenecks and capacity limits.

### Stress Testing
Push systems beyond normal capacity to identify breaking points and failure modes.

## Getting Help

- **Documentation**: Browse this documentation for detailed guides and examples
- **GitHub Issues**: Report bugs and request features
- **Community**: Join discussions and share experiences

## Next Steps

Ready to dive deeper? Check out:

- [Quick Start Guide](quick-start.md) - Step-by-step setup and first test
- [Configuration Guide](config/yaml.md) - Detailed configuration options
- [Examples](examples/rest-basic.md) - Real-world testing scenarios
- [API Reference](api/config-schema.md) - Complete configuration schema
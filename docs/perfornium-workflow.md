# Perfornium Workflow Guide

This guide walks through the complete Perfornium workflow, from installation to running sophisticated performance tests. Perfornium provides multiple paths to create tests quickly and efficiently.

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g @testsmith/perfornium
```

### Verify Installation
```bash
perfornium --version
# Output: 1.0.0
```

## 🚀 Core Workflow Options

Perfornium offers four main paths to create and run performance tests:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   1. Manual     │    │   2. Project     │    │  3. Browser     │
│  Configuration  │    │   Generator      │    │   Recording     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
  Write YAML/JSON         perfornium init         perfornium record
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                      ┌─────────────────────┐
                      │  4. API Import      │
                      │  (OpenAPI/WSDL/HAR) │
                      └─────────────────────┘
                                 │
                                 ▼
                     perfornium import openapi
                                 │
                                 ▼
                         ┌─────────────────┐
                         │  Run Test       │
                         │ perfornium run  │
                         └─────────────────┘
```

## 1️⃣ Method 1: Initialize New Project

### Quick Start - Initialize Project
```bash
# Create new project directory
mkdir my-performance-tests
cd my-performance-tests

# Initialize with template
perfornium init --template api --examples
```

### Available Templates
- **`basic`** - Simple HTTP/REST testing setup
- **`api`** - Complete API testing with authentication 
- **`web`** - Browser-based testing with Playwright
- **`mixed`** - Combination of API and browser testing

### Project Structure Created
```
my-performance-tests/
├── perfornium.yml          # Main configuration
├── data/                   # Test data (CSV files)
├── scenarios/              # Individual test scenarios
├── environments/           # Environment configs
├── results/               # Test outputs
├── reports/               # HTML reports
└── README.md              # Getting started guide
```

### Run Your First Test
```bash
# Run the example configuration
perfornium run perfornium.yml

# Run with different environment
perfornium run perfornium.yml --env staging
```

## 2️⃣ Method 2: Record Browser Script

### Interactive Browser Recording
```bash
# Start recording from a URL
perfornium record https://example.com

# Advanced recording options
perfornium record https://app.example.com \
  --output my-user-journey.yml \
  --viewport 1920x1080 \
  --base-url https://app.example.com
```

### Recording Process
1. **Browser Opens**: Automated browser window opens
2. **Perform Actions**: Click, type, navigate as a real user would
3. **Auto-Generation**: Actions are captured and converted to test scenario
4. **Output**: Complete YAML configuration ready to run

### Generated Output Example

<!-- tabs:start -->

#### **YAML**

```yaml
# my-user-journey.yml (generated automatically)
name: "Recorded User Journey"
protocol: browser

scenarios:
  - name: "User Login Flow"
    browser:
      actions:
        - goto: "https://app.example.com/login"
        - fill:
            selector: "input#email"
            value: "{{faker.internet.email}}"
        - fill:
            selector: "input#password"
            value: "testpassword123"
        - click: "button[type='submit']"
        - waitForNavigation:
            url: "**/dashboard"
        - screenshot:
            path: "screenshots/dashboard.png"
```

#### **TypeScript**

```typescript
// my-user-journey.ts (generated automatically)
import { test, faker } from '@testsmith/perfornium/dsl';

test('Recorded User Journey')
  .protocol('browser')
  .scenario('User Login Flow')
    .goto('https://app.example.com/login')
    .fill('input#email', faker.internet.email())
    .fill('input#password', 'testpassword123')
    .click('button[type="submit"]')
    .waitForNavigation({ url: '**/dashboard' })
    .screenshot('screenshots/dashboard.png')
    .done()
  .build();
```

<!-- tabs:end -->

### Run Recorded Test
```bash
# Run the recorded scenario
perfornium run my-user-journey.yml

# Run with load testing
perfornium run my-user-journey.yml --max-users 10
```

## 3️⃣ Method 3: Import OpenAPI/Swagger

### Import from OpenAPI Specification
```bash
# Import complete API specification
perfornium import openapi swagger.json

# Advanced filtering and options
perfornium import openapi https://petstore.swagger.io/v2/swagger.json \
  --output ./tests/petstore \
  --format yaml \
  --tags "user,pet" \
  --methods "GET,POST" \
  --interactive
```

### Import Options
- **`--tags`** - Filter by OpenAPI tags
- **`--methods`** - Include specific HTTP methods  
- **`--paths`** - Filter by URL path patterns
- **`--interactive`** - Choose endpoints interactively
- **`--auto-correlate`** - Automatically link dependent requests

### Generated Test Structure
```bash
# Import creates organized test files
tests/petstore/
├── pet-scenarios.yml       # Pet-related endpoints
├── user-scenarios.yml      # User management endpoints  
├── store-scenarios.yml     # Store/order endpoints
└── auth-flows.yml          # Authentication scenarios
```

### Generated Scenario Example

<!-- tabs:start -->

#### **YAML**

```yaml
# user-scenarios.yml (auto-generated)
name: "User Management API Tests"
base_url: "https://petstore.swagger.io/v2"

scenarios:
  - name: "User CRUD Operations"
    requests:
      # Create user
      - url: "/user"
        method: POST
        body: |
          {
            "username": "{{faker.internet.userName}}",
            "firstName": "{{faker.person.firstName}}",
            "lastName": "{{faker.person.lastName}}",
            "email": "{{faker.internet.email}}",
            "password": "{{faker.internet.password}}"
          }
        extract:
          - name: "username"
            type: "json_path"
            expression: "$.username"
        checks:
          - type: "status"
            value: 200

      # Get user (correlated with created user)
      - url: "/user/{{username}}"
        method: GET
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.username"
            value: "{{username}}"
```

#### **TypeScript**

```typescript
// user-scenarios.ts (auto-generated)
import { test, faker } from '@testsmith/perfornium/dsl';

test('User Management API Tests')
  .baseUrl('https://petstore.swagger.io/v2')
  .scenario('User CRUD Operations')
    // Create user
    .post('/user', {
      body: {
        username: faker.internet.userName(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        password: faker.internet.password()
      },
      extract: {
        username: '$.username'
      },
      checks: [
        { type: 'status', value: 200 }
      ]
    })
    // Get user (correlated with created user)
    .get('/user/{{username}}', {
      checks: [
        { type: 'status', value: 200 },
        { type: 'json_path', expression: '$.username', value: '{{username}}' }
      ]
    })
    .done()
  .build();
```

<!-- tabs:end -->

### Run Imported Tests
```bash
# Run all imported scenarios
perfornium run tests/petstore/user-scenarios.yml

# Run with load pattern
perfornium run tests/petstore/pet-scenarios.yml --max-users 50
```

## 4️⃣ Method 4: Import from Other Sources

### HAR File Import
```bash
# Import from browser HAR export
perfornium import har recorded-session.har \
  --output ./tests/recorded \
  --skip-static \
  --filter-domains api.example.com
```

### WSDL Import (SOAP Services)
```bash
# Import SOAP web services
perfornium import wsdl http://example.com/service?wsdl \
  --output ./tests/soap \
  --services CustomerService \
  --soap-version 1.2
```

## 🏃 Running Tests

### Basic Execution
```bash
# Run single test
perfornium run my-test.yml

# Run with options
perfornium run my-test.yml \
  --env production \
  --max-users 100 \
  --output ./results \
  --report \
  --verbose
```

### Distributed Testing
```bash
# Run across multiple workers
perfornium distributed my-test.yml \
  --workers worker1:8080,worker2:8080,worker3:8080 \
  --strategy capacity_based \
  --sync-start
```

### Load Testing Examples
```bash
# Quick load test
perfornium run api-test.yml --max-users 50

# Stress test
perfornium run stress-test.yml --max-users 500

# Endurance test  
perfornium run endurance-test.yml --duration 1h
```

## 📊 Results and Reporting

### Automatic Outputs
Every test run generates:
- **JSON results**: `results/test-[timestamp].json`
- **CSV data**: `results/test-[timestamp].csv`  
- **HTML report**: `reports/test-report.html` (if `--report` used)

### Generate Reports Later
```bash
# Generate report from existing results
perfornium report results/my-test-20241201-143022.json \
  --output detailed-report.html \
  --title "API Performance Analysis"
```

### View Results
```bash
# Open HTML report
open reports/test-report.html

# Quick stats from JSON
cat results/latest.json | jq '.summary'
```

## 🔧 Advanced Workflows

### Validation Before Running
```bash
# Validate configuration
perfornium validate my-test.yml --env production
```

### Worker Management
```bash
# Start worker nodes
perfornium worker --port 8080 --host 0.0.0.0

# Use workers file
perfornium distributed my-test.yml --workers-file workers.json
```

### Environment Management
```bash
# Use specific environment
perfornium run test.yml --env staging

# Multiple environments
perfornium run test.yml --env staging,load-testing
```

## 🎯 Workflow Best Practices

### 1. Start Simple, Scale Up
```bash
# Start with 1-2 users
perfornium run test.yml --max-users 2

# Gradually increase
perfornium run test.yml --max-users 10
perfornium run test.yml --max-users 50  
perfornium run test.yml --max-users 100
```

### 2. Use Project Templates
```bash
# Different project types for different needs
perfornium init --template api      # REST/GraphQL APIs
perfornium init --template web      # Browser testing
perfornium init --template mixed    # Both API and browser
```

### 3. Import First, Customize Later
```bash
# Import to get started quickly
perfornium import openapi swagger.json

# Then customize the generated files
vim tests/api-scenarios.yml
```

### 4. Validate Early and Often
```bash
# Always validate before running
perfornium validate my-test.yml

# Use dry-run for complex tests  
perfornium run my-test.yml --dry-run
```

## 🚦 Complete Example Workflow

Here's a complete workflow from zero to running tests:

```bash
# 1. Create new project
mkdir ecommerce-perf-tests
cd ecommerce-perf-tests

# 2. Initialize with API template
perfornium init --template api --examples

# 3. Import existing API specification
perfornium import openapi https://api.example.com/swagger.json \
  --output ./tests/api \
  --interactive

# 4. Record a user journey
perfornium record https://shop.example.com \
  --output ./tests/user-journey.yml

# 5. Validate all configurations
perfornium validate tests/api/product-scenarios.yml
perfornium validate tests/user-journey.yml

# 6. Run tests progressively
perfornium run tests/api/product-scenarios.yml --max-users 5
perfornium run tests/api/product-scenarios.yml --max-users 25
perfornium run tests/user-journey.yml --max-users 10

# 7. Generate comprehensive reports
perfornium report results/product-scenarios-latest.json \
  --title "E-commerce API Performance"

# 8. Scale to distributed testing
perfornium distributed tests/api/product-scenarios.yml \
  --workers-file production-workers.json \
  --max-users 1000
```

This workflow takes you from zero to sophisticated distributed performance testing in minutes, leveraging Perfornium's powerful automation and import capabilities.

## 📚 Next Steps

- **[Configuration Guide](config/yaml.md)** - Deep dive into YAML configuration
- **[Load Patterns](load-patterns/basic.md)** - Advanced load testing patterns  
- **[Browser Testing](protocols/browser.md)** - Detailed browser automation
- **[Distributed Testing](advanced/distributed.md)** - Scale across multiple machines
- **[Examples](examples/)** - Real-world testing scenarios
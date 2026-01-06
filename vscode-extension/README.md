# Perfornium VS Code Extension

Official VS Code extension for [Perfornium](https://github.com/testsmith-io/perfornium) load testing framework.

## Features

### IntelliSense & Autocomplete
- Smart completions for YAML configuration files
- Context-aware suggestions for test steps, checks, and configurations
- Hover information for all Perfornium keywords

### Snippets
- Quick snippets for common test patterns
- Full test templates for REST API and Web testing
- Step-specific snippets for requests, web automation, hooks, and more

Available snippets:
- `perf-test` - Complete test template
- `perf-rest` - REST API step
- `perf-rest-post` - REST POST with JSON body
- `perf-rest-auth` - REST step with authentication
- `perf-web` - Web automation step
- `perf-web-form` - Web form fill and submit
- `perf-soap` - SOAP request step
- `perf-wait` - Wait/think time step
- `perf-script` - Custom script step
- `perf-csv` - CSV data configuration
- `perf-hooks` - Test hooks configuration

### Test Runner Integration
- Run Perfornium tests directly from VS Code
- Context menu integration for YAML files
- Editor title bar play button

### Syntax Highlighting
- Custom syntax highlighting for Perfornium YAML files
- Highlights HTTP methods, Web Vitals metrics, and Perfornium keywords
- Variable (`${var}`) and template (`{{var}}`) highlighting
- Faker template (`{{faker.xxx}}`) highlighting

## Installation

1. Install from VS Code Marketplace: Search for "Perfornium"
2. Or install manually: `code --install-extension perfornium.vsix`

## Usage

### Creating Tests
1. Create a new file with `.perfornium.yml` or `.perfornium.yaml` extension
2. Start typing to see autocomplete suggestions
3. Type `perf-` to see available snippets

### Running Tests
1. Open a Perfornium test file
2. Click the play button in the editor title bar
3. Or right-click and select "Run Perfornium Test"
4. View results in the terminal output

### Example Test File

```yaml
name: API Load Test
description: Load test for user API

global:
  base_url: https://api.example.com
  timeout: 30000
  headers:
    Content-Type: application/json

load:
  pattern: basic
  virtual_users: 50
  duration: 5m
  ramp_up: 30s

scenarios:
  - name: User Operations
    weight: 100
    steps:
      - name: Get users
        type: rest
        method: GET
        path: /users
        checks:
          - type: status
            expected: 200
          - type: response_time
            operator: lt
            expected: 1000

      - name: Create user
        type: rest
        method: POST
        path: /users
        json:
          name: "{{faker.person.fullName}}"
          email: "{{faker.internet.email}}"
        checks:
          - type: status
            expected: 201
        extract:
          - name: userId
            type: json_path
            expression: $.id

thresholds:
  - metric: response_time_p95
    operator: lt
    expected: 1000
    severity: error
  - metric: error_rate
    operator: lt
    expected: 0.01
    severity: warning

outputs:
  - type: html
    file: report.html
  - type: json
    file: results.json
```

### Web Testing Example

```yaml
name: Web Performance Test

global:
  browser:
    headless: true
    viewport:
      width: 1920
      height: 1080

load:
  pattern: basic
  virtual_users: 5
  duration: 2m

scenarios:
  - name: Homepage Performance
    steps:
      - name: Navigate to homepage
        type: web
        command: goto
        url: https://example.com
        measureWebVitals: true
        webVitalsWaitTime: 5000

      - name: Click login
        type: web
        command: click
        selector: "#login-button"

      - name: Fill credentials
        type: web
        command: fill
        selector: "#email"
        value: "test@example.com"
```

## Requirements

- VS Code 1.85.0 or higher
- Perfornium CLI installed (`npm install -g @testsmith/perfornium`)

## Extension Settings

- `perfornium.autoComplete`: Enable/disable autocomplete (default: true)
- `perfornium.validation`: Enable/disable file validation (default: true)
- `perfornium.cliPath`: Path to the Perfornium CLI executable (default: "perfornium")

## Commands

- `Perfornium: Run Test` - Run the current test file
- `Perfornium: Debug Test` - Debug the current test file
- `Perfornium: Validate Configuration` - Validate the current configuration file

## File Associations

The extension automatically activates for:
- `*.perfornium.yml`
- `*.perfornium.yaml`
- `*.perfornium.ts`
- `perfornium.yml`
- `perfornium.yaml`

## Development

To build the extension:
```bash
cd vscode-extension
npm install
npm run compile
```

To package:
```bash
npx vsce package
```

## Support

- Documentation: https://testsmith-io.github.io/perfornium
- Issues: https://github.com/testsmith-io/perfornium/issues
- Repository: https://github.com/testsmith-io/perfornium

## License

MIT
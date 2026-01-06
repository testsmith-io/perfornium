# Troubleshooting

This guide covers common issues and their solutions when using Perfornium.

## Installation Issues

### Node.js Version Mismatch

**Symptom:** Error during installation or runtime about unsupported Node.js version.

**Solution:** Perfornium requires Node.js 18.0.0 or higher.

```bash
# Check your Node.js version
node --version

# If using nvm, switch to a supported version
nvm install 20
nvm use 20
```

### Permission Denied During Global Install

**Symptom:** `EACCES: permission denied` error during `npm install -g`.

**Solution:**

```bash
# Option 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Option 2: Use npx instead
npx @testsmith/perfornium run test.yml
```

### Playwright Browser Installation

**Symptom:** Browser tests fail with "browser not found" errors.

**Solution:**

```bash
# Install Playwright browsers
npx playwright install

# Or install specific browsers
npx playwright install chromium
npx playwright install firefox
```

## Configuration Issues

### YAML Syntax Errors

**Symptom:** `YAMLException: bad indentation` or similar parsing errors.

**Solution:**

1. Validate your YAML syntax:
```bash
perfornium validate my-test.yml
```

2. Common YAML mistakes to check:
   - Use spaces, not tabs, for indentation
   - Ensure consistent indentation (2 or 4 spaces)
   - Quote strings containing special characters
   - Check for missing colons after keys

```yaml
# Wrong - tabs used
scenarios:
	- name: "Test"

# Correct - spaces used
scenarios:
  - name: "Test"
```

### Invalid Configuration Schema

**Symptom:** `Configuration validation failed` error with details about missing or invalid fields.

**Solution:**

```bash
# Run validation to see detailed errors
perfornium validate my-test.yml --verbose
```

Common schema issues:
- Missing required fields (`name`, `scenarios`, `load`)
- Invalid load pattern type
- Incorrect step configuration

### Environment Variables Not Resolved

**Symptom:** Variables like `${API_KEY}` appear literally in requests.

**Solution:**

1. Ensure environment variables are exported:
```bash
export API_KEY="your-key"
perfornium run test.yml
```

2. Use an `.env` file:
```bash
# .env
API_KEY=your-key
BASE_URL=https://api.example.com
```

3. Check variable syntax - use `${VAR}` or `{{VAR}}`:

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  base_url: "${BASE_URL}"
  headers:
    Authorization: "Bearer {{API_KEY}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Environment Variables Test')
  .baseUrl(process.env.BASE_URL || 'https://api.example.com')
  .headers({
    Authorization: `Bearer ${process.env.API_KEY}`
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

## Runtime Issues

### Connection Refused / Timeout

**Symptom:** All requests fail with connection errors.

**Causes and Solutions:**

1. **Target server is down:**
   ```bash
   # Test connectivity
   curl -I https://your-api.com/health
   ```

2. **Firewall blocking connections:**
   - Check corporate firewall rules
   - Verify VPN connectivity if required

3. **Incorrect base URL:**

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  base_url: "https://api.example.com"  # Check protocol and host
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Base URL Test')
  .baseUrl('https://api.example.com')  // Check protocol and host
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

4. **Timeout too short:**

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  timeout: 60000  # Increase to 60 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Timeout Test')
  .baseUrl('https://api.example.com')
  .timeout(60000)  // Increase to 60 seconds
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

### SSL/TLS Certificate Errors

**Symptom:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or certificate errors.

**Solution:**

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  ssl:
    verify: false  # Only for testing! Not recommended for production

# Or specify custom CA certificate
global:
  ssl:
    ca: "/path/to/ca-certificate.pem"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Disable SSL verification (testing only)
test('SSL Disabled Test')
  .baseUrl('https://api.example.com')
  .ssl({ verify: false })  // Only for testing! Not recommended for production
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();

// Or specify custom CA certificate
test('Custom CA Test')
  .baseUrl('https://api.example.com')
  .ssl({ ca: '/path/to/ca-certificate.pem' })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

### Out of Memory Errors

**Symptom:** Node.js crashes with `JavaScript heap out of memory`.

**Solutions:**

1. **Increase Node.js memory:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" perfornium run test.yml
   ```

2. **Reduce concurrent virtual users:**

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  virtual_users: 50  # Lower from previous value
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Reduced Load Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 50, duration: '5m' })  // Lower from previous value
  .build();
```

<!-- tabs:end -->

3. **Use streaming outputs:**

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results.json"
    format: "stream"
    batch_size: 100
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Streaming Output Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .withOutputs([{
    type: 'json',
    file: 'results.json',
    format: 'stream',
    batchSize: 100
  }])
  .build();
```

<!-- tabs:end -->

4. **Disable response body capture:**

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    include_response_body: false
    include_request_body: false
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('No Body Capture Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .withOutputs([{
    type: 'json',
    includeResponseBody: false,
    includeRequestBody: false
  }])
  .build();
```

<!-- tabs:end -->

### High CPU Usage

**Symptom:** CPU spikes to 100% during tests.

**Solutions:**

1. **Reduce check frequency:**
   - Complex JSON path expressions are expensive
   - Use simpler status checks when possible

2. **Increase think time:**

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Test"
    think_time:
      min: 1000
      max: 3000
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Think Time Test')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .thinkTime({ min: 1000, max: 3000 })
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 100, duration: '5m' })
  .build();
```

<!-- tabs:end -->

3. **Use arrival rate pattern for controlled load:**

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "arrivals"
  rate: 10  # 10 requests per second
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Arrival Rate Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'arrivals', rate: 10, duration: '5m' })  // 10 requests per second
  .build();
```

<!-- tabs:end -->

## Protocol-Specific Issues

### REST API Issues

#### Authentication Failures

**Symptom:** 401 Unauthorized responses.

**Solution:**

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Authenticated Request"
    method: "GET"
    path: "/api/protected"
    auth:
      type: "bearer"
      token: "${AUTH_TOKEN}"
    # Or use headers directly
    headers:
      Authorization: "Bearer ${AUTH_TOKEN}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Authentication Test')
  .baseUrl('https://api.example.com')
  .scenario('Authenticated Request')
    .get('/api/protected')
    .auth({ type: 'bearer', token: process.env.AUTH_TOKEN })
    // Or use headers directly
    .headers({ Authorization: `Bearer ${process.env.AUTH_TOKEN}` })
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

#### Request Body Not Sent

**Symptom:** Server reports empty request body.

**Solution:**

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "POST Request"
    method: "POST"
    path: "/api/data"
    headers:
      Content-Type: "application/json"  # Required for JSON body
    json:
      key: "value"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('POST Request Test')
  .baseUrl('https://api.example.com')
  .scenario('POST Request')
    .post('/api/data')
    .headers({ 'Content-Type': 'application/json' })  // Required for JSON body
    .json({ key: 'value' })
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

### SOAP Issues

#### WSDL Loading Failures

**Symptom:** `Failed to load WSDL` error.

**Solutions:**

1. Verify WSDL URL is accessible:
   ```bash
   curl "http://service.example.com?WSDL"
   ```

2. Check for authentication requirements:

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  wsdl_url: "http://service.example.com?WSDL"
  soap_auth:
    username: "user"
    password: "pass"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('SOAP Authentication Test')
  .baseUrl('http://service.example.com')
  .wsdlUrl('http://service.example.com?WSDL')
  .soapAuth({ username: 'user', password: 'pass' })
  .scenario('SOAP Test')
    .soap({ operation: 'GetData' })
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

### Browser/Playwright Issues

#### Element Not Found

**Symptom:** `Element not found` or timeout waiting for selector.

**Solutions:**

1. **Increase timeout:**

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - type: "web"
    action:
      command: "click"
      selector: "#button"
      timeout: 30000  # 30 seconds
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Web Timeout Test')
  .baseUrl('https://example.com')
  .scenario('Web Test')
    .web()
      .click('#button', { timeout: 30000 })  // 30 seconds
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

2. **Wait for element:**

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - type: "web"
    action:
      command: "wait"
      selector: "#button"
      state: "visible"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Wait for Element Test')
  .baseUrl('https://example.com')
  .scenario('Web Test')
    .web()
      .wait('#button', { state: 'visible' })
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

3. **Use more specific selectors:**

<!-- tabs:start -->

#### **YAML**
```yaml
# Instead of generic selectors
selector: "button"

# Use specific selectors
selector: "[data-testid='submit-button']"
selector: "#form-submit"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Instead of generic selectors
test('Generic Selector')
  .baseUrl('https://example.com')
  .scenario('Web Test')
    .web().click('button')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();

// Use specific selectors
test('Specific Selectors')
  .baseUrl('https://example.com')
  .scenario('Web Test')
    .web()
      .click('[data-testid="submit-button"]')
      .click('#form-submit')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

#### Browser Crashes

**Symptom:** Browser process terminates unexpectedly.

**Solution:**

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  web:
    type: "chromium"
    headless: true
    args:
      - "--disable-dev-shm-usage"  # Required in Docker
      - "--no-sandbox"              # Required in some environments
      - "--disable-gpu"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Browser Config Test')
  .baseUrl('https://example.com')
  .webConfig({
    type: 'chromium',
    headless: true,
    args: [
      '--disable-dev-shm-usage',  // Required in Docker
      '--no-sandbox',              // Required in some environments
      '--disable-gpu'
    ]
  })
  .scenario('Web Test')
    .web().navigate('/')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

## Output and Reporting Issues

### Empty Results File

**Symptom:** Results file is empty or not created.

**Causes:**
- Test crashed before writing results
- Output directory doesn't exist
- Permission issues

**Solution:**

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results/test-results.json"  # Ensure 'results' directory exists

# Or create directory in test config
global:
  output_dir: "results"
  create_dirs: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Output Directory Test')
  .baseUrl('https://api.example.com')
  .outputDir('results')
  .createDirs(true)
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .withOutputs([{
    type: 'json',
    file: 'results/test-results.json'  // Ensure 'results' directory exists
  }])
  .build();
```

<!-- tabs:end -->

### HTML Report Not Generated

**Symptom:** Report generation fails or produces empty file.

**Solution:**

1. Ensure you have results:

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  - type: "json"
    file: "results.json"  # Required for report generation

report:
  generate: true
  output: "report.html"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Report Generation Test')
  .baseUrl('https://api.example.com')
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .withOutputs([{
    type: 'json',
    file: 'results.json'  // Required for report generation
  }])
  .withReport({
    generate: true,
    output: 'report.html'
  })
  .build();
```

<!-- tabs:end -->

2. Check for generation errors in console output

3. Generate manually:
   ```bash
   perfornium report --results results.json --output report.html
   ```

## Distributed Testing Issues

### Workers Not Connecting

**Symptom:** Coordinator reports no workers available.

**Solutions:**

1. **Check network connectivity:**
   ```bash
   # From worker machine
   curl http://coordinator-ip:3000/health
   ```

2. **Verify firewall rules:**
   - Coordinator default port: 3000
   - Ensure bidirectional communication

3. **Check worker configuration:**
   ```bash
   perfornium worker --coordinator http://coordinator-ip:3000
   ```

### Inconsistent Results Across Workers

**Symptom:** Different workers report vastly different response times.

**Causes:**
- Network latency differences
- Worker machine performance variance
- Load balancer distribution

**Solution:**
- Use similar hardware for all workers
- Place workers in same network zone
- Review load balancer configuration

## Debug Mode

Enable debug mode for detailed logging:

```bash
# Using environment variable
DEBUG=perfornium:* perfornium run test.yml

# Using config
```

<!-- tabs:start -->

#### **YAML**
```yaml
debug:
  enabled: true
  level: "verbose"
  log_requests: true
  log_responses: true
  log_file: "debug.log"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Debug Mode Test')
  .baseUrl('https://api.example.com')
  .debug({
    enabled: true,
    level: 'verbose',
    logRequests: true,
    logResponses: true,
    logFile: 'debug.log'
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtualUsers: 10, duration: '1m' })
  .build();
```

<!-- tabs:end -->

## Getting Help

If you can't resolve your issue:

1. **Check existing issues:** [GitHub Issues](https://github.com/testsmith-io/perfornium/issues)
2. **Create a new issue** with:
   - Perfornium version (`perfornium --version`)
   - Node.js version (`node --version`)
   - Operating system
   - Configuration file (sanitized)
   - Full error message
   - Steps to reproduce

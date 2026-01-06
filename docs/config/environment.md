# Environment Variables

Environment variables provide a flexible way to configure Perfornium tests without modifying configuration files. This enables easy adaptation across different environments, secure handling of sensitive data, and seamless CI/CD integration.

## Overview

Perfornium supports environment variables at multiple levels:
- System configuration
- Test configuration override
- Dynamic variable injection
- Secret management

## Using Environment Variables

### In YAML Configuration

Reference environment variables using the `{{env.VARIABLE_NAME}}` syntax:

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "API Test"
    requests:
      - url: "{{env.API_BASE_URL}}/users"
        method: GET
        headers:
          Authorization: "Bearer {{env.API_TOKEN}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Environment Variables Test')
  .scenario('API Test')
    .get('{{env.API_BASE_URL}}/users')
    .headers({
      'Authorization': 'Bearer {{env.API_TOKEN}}'
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### In TypeScript Configuration

```typescript
import { defineConfig } from '@testsmith/perfornium';

export default defineConfig({
  scenarios: [
    {
      name: 'API Test',
      requests: [
        {
          url: `${process.env.API_BASE_URL}/users`,
          headers: {
            'Authorization': `Bearer ${process.env.API_TOKEN}`
          }
        }
      ]
    }
  ]
});
```

## System Environment Variables

### Core Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PERFORNIUM_CONFIG` | Path to configuration file | `perfornium.yml` |
| `PERFORNIUM_LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `PERFORNIUM_OUTPUT_DIR` | Directory for test outputs | `./results` |
| `PERFORNIUM_WORKERS` | Number of worker processes | CPU cores |
| `PERFORNIUM_TIMEOUT` | Global timeout for requests | `30s` |
| `PERFORNIUM_RETRY_COUNT` | Default retry count | `0` |
| `PERFORNIUM_ENV` | Environment name (dev, staging, prod) | `dev` |

### Performance Variables

```bash
# Memory allocation
export PERFORNIUM_MAX_MEMORY=4096

# Connection pooling
export PERFORNIUM_MAX_CONNECTIONS=1000
export PERFORNIUM_KEEPALIVE_TIMEOUT=30000

# Request limits
export PERFORNIUM_MAX_REDIRECTS=5
export PERFORNIUM_MAX_BODY_SIZE=10485760
```

## Environment-specific Configuration

### Multiple Environment Files

Create environment-specific `.env` files:

```bash
# .env.development
API_BASE_URL=http://localhost:3000
DB_HOST=localhost
LOG_LEVEL=debug

# .env.staging
API_BASE_URL=https://staging.api.example.com
DB_HOST=staging-db.example.com
LOG_LEVEL=info

# .env.production
API_BASE_URL=https://api.example.com
DB_HOST=prod-db.example.com
LOG_LEVEL=warn
```

### Loading Environment Files

```bash
# Using --env flag
perfornium run --env staging

# Using NODE_ENV
NODE_ENV=production perfornium run

# Using custom env file
perfornium run --env-file .env.custom
```

## Variable Injection

### Command Line Override

```bash
# Single variable
perfornium run --set API_URL=https://test.api.com

# Multiple variables
perfornium run \
  --set API_URL=https://test.api.com \
  --set API_KEY=secret123 \
  --set USERS=100
```

### Inline Variables

```bash
# Direct environment variable setting
API_URL=https://test.api.com USERS=50 perfornium run

# Using export
export API_URL=https://test.api.com
export USERS=50
perfornium run
```

## Dynamic Variables

### Runtime Variables

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Dynamic Test"
    variables:
      timestamp: "{{env.TIMESTAMP || Date.now()}}"
      test_id: "{{env.TEST_ID || faker.string.uuid()}}"
    requests:
      - url: "{{env.API_URL}}/test/{{test_id}}"
        headers:
          X-Test-Timestamp: "{{timestamp}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Dynamic Variables Test')
  .scenario('Dynamic Test')
    .variables({
      timestamp: '{{env.TIMESTAMP || Date.now()}}',
      test_id: '{{env.TEST_ID || faker.string.uuid()}}'
    })
    .get('{{env.API_URL}}/test/{{test_id}}')
    .headers({
      'X-Test-Timestamp': '{{timestamp}}'
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Computed Variables

<!-- tabs:start -->

#### **YAML**

```yaml
variables:
  base_url: "{{env.API_PROTOCOL || 'https'}}://{{env.API_HOST || 'api.example.com'}}"
  full_url: "{{base_url}}{{env.API_PATH || '/v1'}}"

scenarios:
  - name: "Computed URL Test"
    requests:
      - url: "{{full_url}}/users"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Computed Variables Test')
  .variables({
    base_url: "{{env.API_PROTOCOL || 'https'}}://{{env.API_HOST || 'api.example.com'}}",
    full_url: "{{base_url}}{{env.API_PATH || '/v1'}}"
  })
  .scenario('Computed URL Test')
    .get('{{full_url}}/users')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

## Secret Management

### Using Secret Files

<!-- tabs:start -->

#### **YAML**

```yaml
# perfornium.yml
secrets:
  file: "{{env.SECRETS_FILE || '.secrets'}}"

scenarios:
  - name: "Secure API Test"
    requests:
      - url: "{{env.API_URL}}"
        headers:
          Authorization: "Bearer {{secrets.api_token}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Secure API Test')
  .secrets({
    file: "{{env.SECRETS_FILE || '.secrets'}}"
  })
  .scenario('Secure API Test')
    .get('{{env.API_URL}}')
    .headers({
      'Authorization': 'Bearer {{secrets.api_token}}'
    })
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Environment Variable Encryption

```bash
# Encrypt sensitive values
perfornium encrypt --value "my-secret-key" --output API_KEY

# Use encrypted value
export API_KEY_ENCRYPTED="encrypted:AES256:..."
perfornium run
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Performance Test
  env:
    API_URL: ${{ secrets.API_URL }}
    API_KEY: ${{ secrets.API_KEY }}
    TEST_ENV: staging
  run: |
    perfornium run --config perfornium.yml
```

## Variable Precedence

Variables are resolved in the following order (highest to lowest priority):

1. Command line `--set` flags
2. Inline environment variables
3. `.env` file variables
4. System environment variables
5. Default values in configuration

Example:
```yaml
# perfornium.yml
scenarios:
  - name: "Priority Test"
    requests:
      - url: "{{env.API_URL || 'http://default.com'}}"
```

```bash
# System environment
export API_URL=http://system.com

# .env file
API_URL=http://envfile.com

# Command execution
API_URL=http://inline.com perfornium run --set API_URL=http://cli.com

# Result: Uses http://cli.com (highest priority)
```

## Variable Validation

### Required Variables

<!-- tabs:start -->

#### **YAML**

```yaml
# perfornium.yml
required_env:
  - API_URL
  - API_KEY
  - TEST_USER

validation:
  API_URL:
    pattern: "^https?://"
    message: "API_URL must be a valid HTTP/HTTPS URL"

  API_KEY:
    length: 32
    message: "API_KEY must be 32 characters"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Environment Validation Test')
  .requiredEnv(['API_URL', 'API_KEY', 'TEST_USER'])
  .validation({
    API_URL: {
      pattern: '^https?://',
      message: 'API_URL must be a valid HTTP/HTTPS URL'
    },
    API_KEY: {
      length: 32,
      message: 'API_KEY must be 32 characters'
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 10, duration: '2m' })
  .build();
```

<!-- tabs:end -->

### Validation Script

```yaml
validation:
  script: |
    if (!process.env.API_URL) {
      throw new Error('API_URL is required');
    }
    if (!process.env.API_KEY || process.env.API_KEY.length < 10) {
      throw new Error('API_KEY must be at least 10 characters');
    }
```

## Environment Templates

### Template Definition

<!-- tabs:start -->

#### **YAML**

```yaml
# environments/staging.yml
name: "Staging Environment"
variables:
  API_URL: "https://staging.api.example.com"
  DB_HOST: "staging-db.example.com"
  LOG_LEVEL: "info"
  USERS: 50
  DURATION: "5m"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Staging Environment')
  .environment('staging', {
    base_url: 'https://staging.api.example.com',
    variables: {
      DB_HOST: 'staging-db.example.com',
      LOG_LEVEL: 'info',
      USERS: 50,
      DURATION: '5m'
    }
  })
  .scenario('Test Scenario')
    .get('/endpoint')
  .done()
  .withLoad({ pattern: 'basic', virtual_users: 50, duration: '5m' })
  .build();
```

<!-- tabs:end -->

### Using Templates

```bash
# Load environment template
perfornium run --env-template environments/staging.yml

# Override template values
perfornium run --env-template environments/staging.yml --set USERS=100
```

## Best Practices

### Security

1. **Never commit secrets**
   ```yaml
   # Bad: Hardcoded secret
   api_key: "sk_live_abcd1234"
   
   # Good: Environment variable
   api_key: "{{env.API_KEY}}"
   ```

2. **Use secret management tools**
   ```bash
   # AWS Secrets Manager
   export API_KEY=$(aws secretsmanager get-secret-value --secret-id api-key --query SecretString --output text)
   
   # HashiCorp Vault
   export API_KEY=$(vault kv get -field=api_key secret/perfornium)
   ```

3. **Validate sensitive variables**
   ```yaml
   validation:
     API_KEY:
       required: true
       sensitive: true  # Won't be logged
   ```

### Organization

1. **Naming conventions**
   ```bash
   # Use prefixes for clarity
   PERFORNIUM_API_URL=...
   PERFORNIUM_DB_HOST=...
   TEST_USER_EMAIL=...
   TEST_USER_PASSWORD=...
   ```

2. **Group related variables**
   ```bash
   # Database configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=testdb
   
   # API configuration
   API_BASE_URL=http://localhost:3000
   API_VERSION=v1
   API_TIMEOUT=30000
   ```

### Documentation

Create an `.env.example` file:
```bash
# Required variables
API_URL=https://api.example.com
API_KEY=your-api-key-here

# Optional variables (with defaults)
LOG_LEVEL=info
WORKERS=4
TIMEOUT=30s

# Test configuration
USERS=10
DURATION=1m
RAMP_UP=30s
```

## Troubleshooting

### Debug Environment Variables

```bash
# List all Perfornium environment variables
perfornium env

# Validate environment
perfornium validate --env

# Show resolved configuration
perfornium config --show-resolved
```

### Common Issues

1. **Variable not found**
   ```bash
   # Check if variable is set
   echo $API_URL
   
   # Set variable for current session
   export API_URL=https://api.example.com
   ```

2. **Wrong precedence**
   ```bash
   # Check all sources
   perfornium env --sources
   
   # Force specific value
   perfornium run --set API_URL=https://correct.url
   ```

3. **Encoding issues**
   ```bash
   # URL encode special characters
   export API_KEY=$(echo -n "key with spaces" | jq -sRr @uri)
   ```

Environment variables provide a powerful and flexible way to configure Perfornium tests across different environments while maintaining security and consistency.
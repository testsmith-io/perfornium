# CSV Data Injection

CSV Data Injection allows you to feed real data from CSV files into your performance tests. This feature supports two levels:
- **Global CSV**: Variables available to all scenarios
- **Scenario CSV**: Variables available only within a specific scenario

## Quick Start

### Basic Scenario-Level CSV

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "User Login Test"
    csv_data:
      file: "data/users.csv"
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
        body: |
          {
            "username": "{{username}}",
            "password": "{{password}}"
          }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('User Login Test')
  .baseUrl('https://api.example.com')
  .scenario('User Login Test')
    .withCSV('data/users.csv', { mode: 'sequential' })
    .post('/login', {
      body: {
        username: '{{username}}',
        password: '{{password}}'
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**users.csv:**
```csv
username,password,email,role
john_doe,pass123,john@example.com,user
jane_smith,pass456,jane@example.com,admin
bob_johnson,pass789,bob@example.com,user
```

## Global CSV Data

Global CSV data is available to **all scenarios** in your test. Use this for shared data like authentication credentials or common test data.

<!-- tabs:start -->

#### **YAML**
```yaml
global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/credentials.csv"
    skipFirstLine: false
    variables:
      user: "username"
      pass: "password"
  csv_mode: next

scenarios:
  - name: "API Test 1"
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
        body: '{"user": "{{user}}", "pass": "{{pass}}"}'

  - name: "API Test 2"
    steps:
      - name: "Profile"
        type: "rest"
        method: "GET"
        path: "/profile/{{user}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Global CSV Example')
  .baseUrl('https://api.example.com')
  .withCSV('data/credentials.csv', {
    mode: 'sequential',
    skipFirstLine: false,
    variables: {
      user: 'username',
      pass: 'password'
    }
  })
  .scenario('API Test 1')
    .post('/login', {
      body: {
        user: '{{user}}',
        pass: '{{pass}}'
      }
    })
  .done()
  .scenario('API Test 2')
    .get('/profile/{{user}}')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Global CSV Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `file` | string | required | Path to CSV file (relative to project root) |
| `delimiter` | string | `,` | Column delimiter |
| `encoding` | string | `utf8` | File encoding |
| `skipEmptyLines` | boolean | `true` | Skip empty lines |
| `skipFirstLine` | boolean | `false` | Skip the first data line (useful if header is not detected) |
| `columns` | string[] | all | Select specific columns |
| `filter` | string | none | Filter expression (e.g., `"status=active"`) |
| `randomize` | boolean | `false` | Shuffle data |
| `cycleOnExhaustion` | boolean | `true` | Restart from beginning when exhausted |
| `variables` | object | none | Map CSV columns to variable names |

## Scenario-Level CSV Data

Scenario CSV data is available **only within that scenario**. If the same variable name exists in both global and scenario CSV, the scenario CSV takes precedence.

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Product Test"
    csv_data:
      file: "data/products.csv"
      variables:
        pid: "product_id"
        pname: "product_name"
    csv_mode: random
    steps:
      - name: "Get Product"
        type: "rest"
        method: "GET"
        path: "/products/{{pid}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Product Test')
  .baseUrl('https://api.example.com')
  .scenario('Product Test')
    .withCSV('data/products.csv', {
      mode: 'random',
      variables: {
        pid: 'product_id',
        pname: 'product_name'
      }
    })
    .get('/products/{{pid}}')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Variable Name Mapping

Use the `variables` option to map CSV column names to custom variable names:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/users.csv"
  variables:
    user: "username"      # Use {{user}} instead of {{username}}
    pass: "password"      # Use {{pass}} instead of {{password}}
    mail: "email"         # Use {{mail}} instead of {{email}}
```

**CSV File:**
```csv
username,password,email
john,pass123,john@example.com
```

**Usage in steps:**
```yaml
body: '{"user": "{{user}}", "password": "{{pass}}", "email": "{{mail}}"}'
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Variable Mapping')
  .baseUrl('https://api.example.com')
  .scenario('User Login')
    .withCSV('data/users.csv', {
      mode: 'sequential',
      variables: {
        user: 'username',
        pass: 'password',
        mail: 'email'
      }
    })
    .post('/login', {
      body: {
        user: '{{user}}',
        password: '{{pass}}',
        email: '{{mail}}'
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Data Access Modes (`csv_mode`)

### `next` (Default) - Round-Robin

Each VU gets rows based on its ID in round-robin fashion:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/users.csv"
csv_mode: next
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Round Robin CSV')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .withCSV('data/users.csv', { mode: 'sequential' })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**Behavior:**
- VU 1 gets Row 1, VU 2 gets Row 2, VU 3 gets Row 3...
- When VUs exceed row count, wraps around (VU 5 with 3 rows gets Row 2)
- If `cycleOnExhaustion: false`, returns null when all rows used sequentially

### `unique` - Exhaustible Sequential

Each row is used only once, then removed from the pool:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/one-time-tokens.csv"
  cycleOnExhaustion: false  # Stop when exhausted
csv_mode: unique
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Unique CSV')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .withCSV('data/one-time-tokens.csv', {
      mode: 'unique',
      cycleOnExhaustion: false
    })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**Behavior:**
- First request gets Row 1 (removed), next gets Row 2 (removed)...
- When `cycleOnExhaustion: true` (default), reloads data when exhausted
- When `cycleOnExhaustion: false`, VU stops when data is exhausted

### `random` - Random Selection

Each request gets a random row:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/products.csv"
csv_mode: random
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Random CSV')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .withCSV('data/products.csv', { mode: 'random' })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**Behavior:**
- Random row selected each time
- Same row may be selected multiple times
- If `cycleOnExhaustion: false`, tracks access count and stops after N accesses

## Filtering Data

Filter CSV rows using expressions:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/users.csv"
  filter: "role=admin"      # Only admin users
```

**Supported operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`

```yaml
# Numeric comparison
filter: "age>=18"

# String equality
filter: "status=active"

# Not equal
filter: "role!=guest"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Filtered CSV')
  .baseUrl('https://api.example.com')
  .scenario('Admin Users')
    .withCSV('data/users.csv', {
      mode: 'sequential',
      filter: 'role=admin'
    })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();

// Other filter examples:
// filter: 'age>=18'
// filter: 'status=active'
// filter: 'role!=guest'
```

<!-- tabs:end -->

## Selecting Columns

Load only specific columns:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/users.csv"
  columns:
    - username
    - password
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Selected Columns')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .withCSV('data/users.csv', {
      mode: 'sequential',
      columns: ['username', 'password']
    })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Skip First Line

If your CSV has a header row that's being treated as data, or you want to skip the first data row:

<!-- tabs:start -->

#### **YAML**
```yaml
csv_data:
  file: "data/users.csv"
  skipFirstLine: true    # Skip first row after header
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Skip First Line')
  .baseUrl('https://api.example.com')
  .scenario('Test')
    .withCSV('data/users.csv', {
      mode: 'sequential',
      skipFirstLine: true
    })
    .get('/api/endpoint')
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

## Complete Example

**Global + Scenario CSV with variable mapping:**

<!-- tabs:start -->

#### **YAML**
```yaml
name: "E-Commerce Load Test"

global:
  base_url: "https://api.shop.com"
  csv_data:
    file: "data/auth-credentials.csv"
    variables:
      auth_user: "username"
      auth_pass: "password"
  csv_mode: next

load:
  pattern: basic
  virtual_users: 10
  duration: 5m

scenarios:
  - name: "Shopping Flow"
    csv_data:
      file: "data/products.csv"
      variables:
        item_id: "product_id"
        item_name: "name"
      filter: "in_stock=true"
      randomize: true
    csv_mode: random
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/auth/login"
        body: |
          {
            "username": "{{auth_user}}",
            "password": "{{auth_pass}}"
          }
        extract:
          - name: "token"
            type: "json_path"
            expression: "$.access_token"

      - name: "Add to Cart"
        type: "rest"
        method: "POST"
        path: "/cart/add"
        headers:
          Authorization: "Bearer {{token}}"
        body: |
          {
            "product_id": "{{item_id}}",
            "product_name": "{{item_name}}",
            "quantity": 1
          }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('E-Commerce Load Test')
  .baseUrl('https://api.shop.com')
  .withCSV('data/auth-credentials.csv', {
    mode: 'sequential',
    variables: {
      auth_user: 'username',
      auth_pass: 'password'
    }
  })
  .scenario('Shopping Flow')
    .withCSV('data/products.csv', {
      mode: 'random',
      variables: {
        item_id: 'product_id',
        item_name: 'name'
      },
      filter: 'in_stock=true',
      randomize: true
    })
    .post('/auth/login', {
      body: {
        username: '{{auth_user}}',
        password: '{{auth_pass}}'
      },
      extract: {
        token: '$.access_token'
      }
    })
    .post('/cart/add', {
      headers: {
        Authorization: 'Bearer {{token}}'
      },
      body: {
        product_id: '{{item_id}}',
        product_name: '{{item_name}}',
        quantity: 1
      }
    })
  .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**data/auth-credentials.csv:**
```csv
username,password
user1,secret123
user2,secret456
user3,secret789
```

**data/products.csv:**
```csv
product_id,name,price,in_stock
P001,Laptop,999.99,true
P002,Phone,599.99,true
P003,Tablet,399.99,false
P004,Watch,199.99,true
```

## Web Testing with CSV Data

```yaml
global:
  browser:
    type: chromium
    headless: false
  csv_data:
    file: "data/test-accounts.csv"
  csv_mode: unique

scenarios:
  - name: "User Registration"
    steps:
      - name: "Navigate to signup"
        type: web
        action:
          command: goto
          url: "/signup"

      - name: "Fill form"
        type: web
        action:
          command: fill
          selector: "#email"
          value: "{{email}}"

      - name: "Enter password"
        type: web
        action:
          command: fill
          selector: "#password"
          value: "{{password}}"

      - name: "Submit"
        type: web
        action:
          command: click
          selector: "button[type=submit]"
```

## Variable Precedence

When the same variable name exists at multiple levels:

1. **Extracted data** (from previous steps) - Highest priority
2. **Scenario CSV data**
3. **Scenario variables** (static)
4. **Global CSV data**
5. **Global variables** (static) - Lowest priority

```yaml
global:
  variables:
    env: "production"
  csv_data:
    file: "data/global.csv"  # Contains: env=staging

scenarios:
  - name: "Test"
    variables:
      env: "development"
    csv_data:
      file: "data/scenario.csv"  # Contains: env=test
    steps:
      - name: "Check Env"
        # {{env}} will be "test" (scenario CSV wins)
```

## Error Handling

### CSV Data Exhaustion

When `cycleOnExhaustion: false` and data runs out:

```yaml
csv_data:
  file: "data/limited-tokens.csv"
  cycleOnExhaustion: false
csv_mode: unique
```

- VU will stop executing when it can't get a row
- Other VUs continue if they still have data
- Test continues until all VUs stop or duration ends

### Missing Files

If a CSV file is not found:
- Error is logged
- VU continues without CSV data
- Template variables remain unresolved (show as `{{variable}}`)

## Common Use Cases

### Dedicated Credentials per VU

Each VU gets its own dedicated credentials that it uses throughout the entire test:

**credentials.csv** (must have at least as many rows as VUs):
```csv
username,password
user1,pass1
user2,pass2
user3,pass3
user4,pass4
user5,pass5
```

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Dedicated Credentials Test"

global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/credentials.csv"
  csv_mode: next  # VU1 gets row 1, VU2 gets row 2, etc.

load:
  pattern: basic
  virtual_users: 5  # Must not exceed CSV row count
  duration: 10m

scenarios:
  - name: "User Session"
    loop: 100  # Each VU runs 100 iterations with SAME credentials
    steps:
      - name: "Login"
        method: POST
        path: /api/login
        json:
          username: "{{username}}"
          password: "{{password}}"
        extract:
          - name: token
            type: json_path
            expression: $.token

      - name: "User Action"
        method: GET
        path: /api/profile
        headers:
          Authorization: "Bearer {{token}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Dedicated Credentials Test')
  .baseUrl('https://api.example.com')
  .scenario('User Session')
    .loop(100)  // Each VU runs 100 iterations with SAME credentials
    .withCSV('data/credentials.csv', { mode: 'next' })
    .post('/api/login', {
      username: '{{username}}',
      password: '{{password}}'
    })
    .extract('token', '$.token')
    .get('/api/profile')
    .withHeaders({ Authorization: 'Bearer {{token}}' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 5,  // Must not exceed CSV row count
    duration: '10m'
  })
  .build();
```

<!-- tabs:end -->

**Behavior:**
- VU 1 always uses `user1/pass1`
- VU 2 always uses `user2/pass2`
- VU 3 always uses `user3/pass3`
- Each VU maintains its own session throughout the test

### One-Time Use Credentials (Consumed)

Each credential can only be used ONCE across the entire test (e.g., registration tokens, one-time passwords):

**one-time-tokens.csv**:
```csv
token,email
TOKEN-001,user1@example.com
TOKEN-002,user2@example.com
TOKEN-003,user3@example.com
```

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Registration Test"

global:
  base_url: "https://api.example.com"

load:
  pattern: basic
  virtual_users: 3
  duration: 5m

scenarios:
  - name: "User Registration"
    csv_data:
      file: "data/one-time-tokens.csv"
      cycleOnExhaustion: false  # Stop VU when data runs out
    csv_mode: unique  # Each row used only once, then removed
    steps:
      - name: "Register"
        method: POST
        path: /api/register
        json:
          token: "{{token}}"
          email: "{{email}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Registration Test')
  .baseUrl('https://api.example.com')
  .scenario('User Registration')
    .withCSV('data/one-time-tokens.csv', {
      mode: 'unique',
      cycleOnExhaustion: false  // Stop VU when data runs out
    })
    .post('/api/register', {
      token: '{{token}}',
      email: '{{email}}'
    })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 3,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

**Behavior:**
- First VU to request gets `TOKEN-001` (removed from pool)
- Second request gets `TOKEN-002` (removed from pool)
- Third request gets `TOKEN-003` (removed from pool)
- When pool is empty, VUs stop (no cycling)

### Mode Comparison

| Mode | Use Case | Row Reuse | VU Assignment |
|------|----------|-----------|---------------|
| `next` | Dedicated credentials per VU | Yes (same row per VU) | VU ID based |
| `unique` | One-time tokens/codes | No (removed after use) | First-come-first-served |
| `random` | Random test data | Yes (random selection) | Random |

## Best Practices

1. **Use relative paths** - CSV files relative to project root
2. **Use variable mapping** - Keep CSV column names internal, use meaningful variable names
3. **Filter data** - Only load what you need for the test
4. **Consider cycleOnExhaustion** - Set to `false` for one-time-use data (tokens, unique IDs)
5. **Separate concerns** - Use global CSV for auth, scenario CSV for test-specific data
6. **Use unique mode carefully** - Ensure you have enough data rows for your VU count and iterations
7. **Match VU count to data** - For `next` mode, ensure CSV has at least as many rows as VUs

# Data Variable Policies

This document describes the comprehensive data variable policy system in Perfornium. These policies control how test data (from CSV files) is distributed and managed across virtual users.

## Overview

When using CSV data injection, you can configure three key policies:

1. **Value Change Policy** - When does the value change?
2. **Value Distribution Policy** - How are values shared and selected?
3. **Exhaustion Policy** - What happens when all values are used?

## Quick Reference

```yaml
global:
  csv_data:
    file: "data/test-data.csv"

    # Value Change Policy
    change_policy: each_iteration   # each_use | each_iteration | each_vu

    # Value Distribution Policy
    distribution:
      scope: unique                 # local | global | unique
      order: sequential             # sequential | random | any
      on_exhausted: cycle           # cycle | stop_vu | stop_test | no_value
```

---

## Value Change Policy

The **change_policy** determines when a new value is fetched from the data source.

### `each_use` - New Value Every Request

A new value is fetched for **every request/step** that uses the variable.

```yaml
csv_data:
  file: "data/tokens.csv"
  change_policy: each_use
```

**Use case:** Single-use tokens, unique identifiers per request.

**Example flow:**
```
VU1 Request 1 → TOKEN-001
VU1 Request 2 → TOKEN-002
VU1 Request 3 → TOKEN-003
```

### `each_iteration` - New Value Per Iteration (Default)

A new value is fetched at the **start of each iteration**. All requests within the same iteration use the same value.

```yaml
csv_data:
  file: "data/users.csv"
  change_policy: each_iteration
```

**Use case:** User sessions, login credentials where all actions in an iteration belong to the same user.

**Example flow:**
```
VU1 Iteration 1:
  - Login    → user1@example.com
  - Browse   → user1@example.com (same)
  - Checkout → user1@example.com (same)

VU1 Iteration 2:
  - Login    → user2@example.com (new value)
  - Browse   → user2@example.com (same)
```

### `each_vu` - Same Value for Entire VU Lifetime

The value is assigned when the VU starts and **remains constant** for all iterations.

```yaml
csv_data:
  file: "data/accounts.csv"
  change_policy: each_vu
```

**Use case:** Fixed user accounts, testing specific user types throughout the test.

**Example flow:**
```
VU1 (all iterations): user1@example.com
VU2 (all iterations): user2@example.com
VU3 (all iterations): user3@example.com
```

---

## Value Distribution Policy

The **distribution** policy controls how values are shared and selected across virtual users.

### Scope

#### `local` - VU-Private Data

Each VU has its own copy of the data. Values can repeat across different VUs.

```yaml
csv_data:
  file: "data/products.csv"
  distribution:
    scope: local
```

**Behavior:**
- VU1 and VU2 can use the same value simultaneously
- No coordination between VUs
- Best for: Independent test data, product catalogs

#### `global` - Shared Data Pool

All VUs share a single data pool. Values are distributed round-robin.

```yaml
csv_data:
  file: "data/credentials.csv"
  distribution:
    scope: global
```

**Behavior:**
- Sequential access across all VUs
- Same value may be used by multiple VUs (if they access it at the same time)
- Best for: General test data distribution

#### `unique` - Exclusive Locking (Checkout/Checkin)

Values are **exclusively locked** to one VU at a time. When the VU finishes (based on change_policy), the value is **returned to the pool**.

```yaml
csv_data:
  file: "data/activation-codes.csv"
  change_policy: each_iteration
  distribution:
    scope: unique
```

**Behavior:**
- A value can only be used by **one VU at a time**
- When iteration completes, the value is **released back** to the pool
- Other VUs can then use the released value
- Best for: Single-use codes, exclusive resources

**Example flow with unique scope:**
```
Time 0: CODE-001, CODE-002, CODE-003 available
Time 1: VU1 checks out CODE-001 (locked)
        Available: CODE-002, CODE-003
Time 2: VU2 checks out CODE-002 (locked)
        Available: CODE-003
Time 3: VU1 finishes iteration, releases CODE-001
        Available: CODE-001, CODE-003
Time 4: VU3 checks out CODE-001 (reused!)
        Available: CODE-003
```

### Order

#### `sequential` - In-Order Selection

Values are taken in the order they appear in the file.

```yaml
distribution:
  order: sequential
```

#### `random` - Random Selection

Values are selected randomly (shuffled on load).

```yaml
distribution:
  order: random
```

#### `any` - Best-Effort Sequential

More efficient than strict sequential, may vary slightly under high concurrency.

```yaml
distribution:
  order: any
```

---

## Exhaustion Policy

The **on_exhausted** policy determines what happens when all data values have been used.

### `cycle` - Restart from Beginning (Default)

When all values are used, start over from the first value.

```yaml
distribution:
  on_exhausted: cycle
```

**Use case:** Long-running tests, unlimited iterations.

### `stop_vu` - Stop the Virtual User

The VU stops executing when it runs out of data. Other VUs continue.

```yaml
distribution:
  on_exhausted: stop_vu
```

**Use case:** One-time registrations, limited resources per VU.

### `stop_test` - Stop the Entire Test

The entire test stops when any VU runs out of data.

```yaml
distribution:
  on_exhausted: stop_test
```

**Use case:** Critical data dependencies, must-have test data.

### `no_value` - Return Empty Value

Continue execution but return `null`/`undefined` for the variable.

```yaml
distribution:
  on_exhausted: no_value
```

**Use case:** Optional data, graceful degradation.

---

## Complete Examples

### Example 1: Exclusive Activation Codes

Each activation code can only be used by one VU at a time. When the iteration completes, the code is returned for reuse.

```yaml
name: "Activation Code Test"

global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/activation-codes.csv"
    change_policy: each_iteration
    distribution:
      scope: unique              # Exclusive access
      order: sequential
      on_exhausted: cycle        # Reuse codes

load:
  pattern: basic
  virtual_users: 10
  iterations: 100

scenarios:
  - name: "Activate Product"
    steps:
      - name: "Activate"
        type: rest
        method: POST
        path: /api/activate
        body: |
          {
            "code": "{{activation_code}}"
          }
```

**data/activation-codes.csv:**
```csv
activation_code,product_type
CODE-A1B2C3,premium
CODE-D4E5F6,standard
CODE-G7H8I9,basic
```

### Example 2: User Credentials with Session Stickiness

Each user credential is used for an entire iteration (login + multiple actions).

```yaml
name: "User Session Test"

global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/users.csv"
    change_policy: each_iteration   # Same user for entire iteration
    distribution:
      scope: global
      order: sequential

scenarios:
  - name: "User Journey"
    steps:
      - name: "Login"
        type: rest
        method: POST
        path: /auth/login
        body: '{"email": "{{email}}", "password": "{{password}}"}'

      - name: "Get Profile"
        type: rest
        method: GET
        path: /api/profile

      - name: "Update Settings"
        type: rest
        method: PUT
        path: /api/settings
        body: '{"theme": "dark"}'
```

### Example 3: One-Time Registration Codes

Each registration code can only be used once across the entire test.

```yaml
name: "Registration Test"

global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/registration-codes.csv"
    change_policy: each_use          # New code every request
    distribution:
      scope: unique                   # Exclusive access
      order: sequential
      on_exhausted: stop_vu           # Stop VU when codes run out

load:
  pattern: basic
  virtual_users: 5
  duration: 10m

scenarios:
  - name: "Register User"
    steps:
      - name: "Register"
        type: rest
        method: POST
        path: /api/register
        body: |
          {
            "registration_code": "{{code}}",
            "email": "{{email}}"
          }
```

### Example 4: Fixed Users Per VU

Each VU is assigned a permanent user for the entire test duration.

```yaml
name: "Fixed User Load Test"

global:
  base_url: "https://api.example.com"
  csv_data:
    file: "data/test-accounts.csv"
    change_policy: each_vu           # Same user for entire VU lifetime
    distribution:
      scope: global
      order: sequential

load:
  pattern: basic
  virtual_users: 50
  duration: 30m

scenarios:
  - name: "User Activity"
    loop: 1000
    steps:
      - name: "API Call"
        type: rest
        method: GET
        path: /api/data
        headers:
          X-User-ID: "{{user_id}}"
```

---

## Backward Compatibility

The legacy configuration options still work:

| Legacy Option | Equivalent New Configuration |
|---------------|------------------------------|
| `csv_mode: unique` | `distribution.scope: unique` with `change_policy: each_use` |
| `csv_mode: next` | `distribution.scope: global` with `distribution.order: sequential` |
| `csv_mode: random` | `distribution.order: random` |
| `randomize: true` | `distribution.order: random` |
| `cycleOnExhaustion: false` | `distribution.on_exhausted: stop_vu` |
| `cycleOnExhaustion: true` | `distribution.on_exhausted: cycle` |

---

## Summary Table

| Policy | Options | Default | Description |
|--------|---------|---------|-------------|
| `change_policy` | `each_use`, `each_iteration`, `each_vu` | `each_iteration` | When to fetch new value |
| `distribution.scope` | `local`, `global`, `unique` | `global` | How values are shared |
| `distribution.order` | `sequential`, `random`, `any` | `sequential` | Selection order |
| `distribution.on_exhausted` | `cycle`, `stop_vu`, `stop_test`, `no_value` | `cycle` | Exhaustion behavior |

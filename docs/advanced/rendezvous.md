# Rendezvous Points

Rendezvous points allow you to synchronize Virtual Users (VUs) at specific points in your test, creating coordinated load spikes on the server.

## What is a Rendezvous?

A rendezvous point works like a queue at a fairground ride:

1. **VUs arrive and wait** - As each VU reaches the rendezvous point, it joins a queue and waits
2. **Release when count is reached** - When the required number of VUs are waiting, they are all released simultaneously
3. **Timeout fallback** - If a timeout expires before enough VUs arrive, waiting VUs are released anyway

This is useful for testing scenarios where you need to assess server performance under simultaneous load, such as:
- Flash sales where many users check out at once
- Bank account balance checks during peak hours
- Conference registration opening
- Game server capacity at match start

## Basic Usage

<!-- tabs:start -->

### **YAML**

Add a `rendezvous` step to your scenario:

```yaml
name: Bank Account Check
load:
  pattern: basic
  virtual_users: 10
  duration: 1m

scenarios:
  - name: Check Balance
    steps:
      - name: Login
        method: POST
        path: /api/auth/login
        json:
          username: "{{csv:username}}"
          password: "{{csv:password}}"
        extract:
          - name: token
            type: json_path
            expression: $.token

      # Wait for all 10 VUs to reach this point
      - type: rendezvous
        name: Sync Balance Check
        rendezvous: balance_check
        count: 10
        timeout: 30s

      # All VUs execute this simultaneously
      - name: Check Account Balance
        method: GET
        path: /api/account/balance
        headers:
          Authorization: "Bearer {{token}}"
```

### **TypeScript**

Use the `.rendezvous()` method in the fluent DSL:

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Bank Account Check')
  .baseUrl('https://api.example.com')
  .scenario('Check Balance')
    .post('/api/auth/login', {
      username: '{{csv:username}}',
      password: '{{csv:password}}'
    })
    .extract('token', '$.token')

    // Wait for all 10 VUs to reach this point
    .rendezvous('balance_check', 10, { timeout: '30s' })

    // All VUs execute this simultaneously
    .get('/api/account/balance')
    .withHeaders({ Authorization: 'Bearer {{token}}' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    duration: '1m'
  })
  .build();
```

<!-- tabs:end -->

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `rendezvous` | string | Yes | - | Unique name for the rendezvous point |
| `count` | number | Yes | - | Number of VUs to wait for before releasing |
| `timeout` | string/number | No | `30s` | Maximum wait time (e.g., "30s", "1m", or milliseconds) |
| `policy` | string | No | `all` | Release policy: `all` or `count` |

### Release Policies

- **`all`** (default): When the count is reached OR timeout occurs, ALL waiting VUs are released
- **`count`**: Releases exactly `count` VUs when threshold is reached; remaining VUs wait for the next batch

## Examples

### E-commerce Flash Sale

Simulate 100 users attempting to purchase a limited item simultaneously:

<!-- tabs:start -->

#### **YAML**

```yaml
name: Flash Sale Test
load:
  pattern: basic
  virtual_users: 100
  duration: 5m

scenarios:
  - name: Flash Sale Purchase
    steps:
      - name: Load Product Page
        method: GET
        path: /products/limited-edition-item

      - name: Add to Cart
        method: POST
        path: /api/cart/add
        json:
          productId: "LIMITED-001"
          quantity: 1

      # Synchronize all users at checkout
      - type: rendezvous
        name: Checkout Sync
        rendezvous: checkout_rush
        count: 100
        timeout: 60s

      # All 100 users hit checkout simultaneously
      - name: Process Checkout
        method: POST
        path: /api/checkout
        json:
          paymentMethod: "credit_card"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

export default test('Flash Sale Test')
  .baseUrl('https://api.example.com')
  .scenario('Flash Sale Purchase')
    .get('/products/limited-edition-item', { name: 'Load Product Page' })
    .post('/api/cart/add', { productId: 'LIMITED-001', quantity: 1 }, { name: 'Add to Cart' })

    // Synchronize all users at checkout
    .rendezvous('checkout_rush', 100, { timeout: '60s' })

    // All 100 users hit checkout simultaneously
    .post('/api/checkout', { paymentMethod: 'credit_card' }, { name: 'Process Checkout' })
    .done()
  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    duration: '5m'
  })
  .build();
```

<!-- tabs:end -->

### Database Stress Test

Test database performance with simultaneous writes:

```yaml
name: Database Write Stress
load:
  pattern: basic
  virtual_users: 50
  duration: 2m

scenarios:
  - name: Concurrent Writes
    steps:
      # Prepare data
      - name: Generate Record
        type: script
        file: scripts/generate-data.ts
        function: generateRecord
        returns: record_data

      # Wait for all VUs
      - type: rendezvous
        name: Write Sync
        rendezvous: db_write_sync
        count: 50
        timeout: 10s

      # Simultaneous writes
      - name: Write Record
        method: POST
        path: /api/records
        json: "{{record_data}}"
```

### Staged Rendezvous with Multiple Sync Points

Create multiple synchronization points throughout a scenario:

```yaml
name: Multi-Stage Sync Test
load:
  pattern: basic
  virtual_users: 20
  duration: 3m

scenarios:
  - name: Staged Operations
    steps:
      - name: Initialize Session
        method: POST
        path: /api/session/init

      # First sync point - wait for all users to initialize
      - type: rendezvous
        name: Init Complete
        rendezvous: stage_1_init
        count: 20
        timeout: 30s

      - name: Load Data
        method: GET
        path: /api/data/load

      # Second sync point - wait before processing
      - type: rendezvous
        name: Ready to Process
        rendezvous: stage_2_ready
        count: 20
        timeout: 30s

      - name: Process Data
        method: POST
        path: /api/data/process

      # Third sync point - wait before committing
      - type: rendezvous
        name: Ready to Commit
        rendezvous: stage_3_commit
        count: 20
        timeout: 30s

      - name: Commit Changes
        method: POST
        path: /api/data/commit
```

### Partial Release with Count Policy

Release VUs in batches using the `count` policy:

```yaml
name: Batch Processing Test
load:
  pattern: basic
  virtual_users: 30
  duration: 5m

scenarios:
  - name: Batch Process
    steps:
      - name: Prepare Request
        method: GET
        path: /api/prepare

      # Release in batches of 10
      - type: rendezvous
        name: Batch Sync
        rendezvous: batch_release
        count: 10
        timeout: 20s
        policy: count  # Only release 10 at a time

      - name: Execute Batch
        method: POST
        path: /api/batch/execute
```

## Timing and Metrics

Rendezvous steps record the following metrics:

- **Response Time**: Time spent waiting at the rendezvous point
- **Custom Metrics**:
  - `rendezvous_name`: Name of the rendezvous point
  - `rendezvous_wait_time`: Wait time in milliseconds
  - `rendezvous_reason`: Why VUs were released (`count_reached` or `timeout`)
  - `rendezvous_vu_count`: Number of VUs released together

These metrics appear in the HTML report and can be used to analyze synchronization behavior.

## Best Practices

1. **Set appropriate timeouts**: If VUs are slow to arrive (due to variable response times in prior steps), a short timeout may cause premature release. Set timeout based on expected step durations.

2. **Match count to VU count**: For full synchronization, set `count` equal to `virtual_users`. For partial synchronization, use a lower count.

3. **Use unique rendezvous names**: Each rendezvous point should have a unique name. Reusing names allows VUs from different iterations to synchronize together.

4. **Consider test duration**: In long-running tests, VUs may reach rendezvous points at different iterations. Use the `policy: count` option if you want controlled batch releases.

5. **Monitor rendezvous metrics**: Check the report to ensure VUs are synchronizing as expected. High wait times may indicate performance issues before the rendezvous point.

## Comparison with Think Time

| Feature | Think Time | Rendezvous |
|---------|-----------|------------|
| Purpose | Simulate user think time | Synchronize VUs |
| Behavior | Individual VU delay | Coordinated group wait |
| Timing | Fixed/random duration | Until count reached or timeout |
| Use Case | Realistic user pacing | Load spike testing |

## Troubleshooting

### VUs Released by Timeout Instead of Count

If VUs are consistently being released by timeout:
- Check for errors in steps before the rendezvous that cause VUs to fail
- Increase the timeout value
- Verify the `count` matches your actual VU count

### Rendezvous Not Working in Distributed Mode

Rendezvous points work within a single worker node. In distributed testing, each worker has its own rendezvous manager. To synchronize across workers, use the `--sync-start` flag for test-level synchronization.

### High Wait Times

If wait times are very high:
- Check for slow steps before the rendezvous point
- Consider if synchronization is truly necessary
- Reduce the rendezvous count to allow partial releases

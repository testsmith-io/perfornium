# Think Time

Think Time simulates realistic user behavior by adding pauses between requests, mimicking how real users read content, make decisions, and interact with applications. This creates more realistic load patterns and helps identify performance issues that only occur with natural usage patterns.

## Understanding Think Time

### What is Think Time?

Think Time is the delay between actions that simulates:
- **Reading time**: Users reading content before clicking
- **Decision time**: Users considering options before selecting
- **Navigation time**: Users looking for the next action
- **Processing time**: Users filling out forms or entering data

### Why Think Time Matters

Without think time, performance tests generate unrealistic load:

<!-- tabs:start -->

#### **YAML**
```yaml
# Without think time - Unrealistic constant load
scenarios:
  - name: "Unrealistic Load"
    steps:
      - name: "Request 1"
        type: "rest"
        method: "GET"
        path: "/page1"
      - name: "Request 2"  # Fires immediately
        type: "rest"
        method: "GET"
        path: "/page2"
      - name: "Request 3"  # Fires immediately
        type: "rest"
        method: "GET"
        path: "/page3"

# With think time - Realistic user behavior
scenarios:
  - name: "Realistic Load"
    think_time: "2-5s"  # 2-5 second pauses between requests
    steps:
      - name: "Request 1"
        type: "rest"
        method: "GET"
        path: "/page1"
      - name: "Request 2"  # Waits 2-5 seconds
        type: "rest"
        method: "GET"
        path: "/page2"
      - name: "Request 3"  # Waits 2-5 seconds
        type: "rest"
        method: "GET"
        path: "/page3"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// Without think time - Unrealistic constant load
test('Unrealistic Load', async (scenario) => {
  await scenario
    .step('Request 1')
    .get('/page1')

    .step('Request 2')  // Fires immediately
    .get('/page2')

    .step('Request 3')  // Fires immediately
    .get('/page3');
});

// With think time - Realistic user behavior
test('Realistic Load', async (scenario) => {
  await scenario
    .withThinkTime('2-5s')  // 2-5 second pauses between requests

    .step('Request 1')
    .get('/page1')

    .step('Request 2')  // Waits 2-5 seconds
    .get('/page2')

    .step('Request 3')  // Waits 2-5 seconds
    .get('/page3');
});
```

<!-- tabs:end -->

## Think Time Configuration

### Global Think Time

Set default think time for all scenarios:

```yaml
global:
  think_time: "1-3s"  # 1-3 seconds between all requests

scenarios:
  - name: "Scenario with Global Think Time"
    steps:
      - name: "Home Page"
        type: "rest"
        method: "GET"
        path: "/"
      - name: "Products"  # Waits 1-3 seconds
        type: "rest"
        method: "GET"
        path: "/products"
```

### Scenario-Level Think Time

Override global think time per scenario:

```yaml
global:
  think_time: "2s"  # Default 2 seconds

scenarios:
  - name: "Fast User Behavior"
    think_time: "0.5-1s"  # Override: 0.5-1 second
    steps:
      - name: "Quick Browse"
        type: "rest"
        method: "GET"
        path: "/quick-browse"
        
  - name: "Careful User Behavior"
    think_time: "5-10s"  # Override: 5-10 seconds
    steps:
      - name: "Detailed Review"
        type: "rest"
        method: "GET"
        path: "/detailed-review"
        
  - name: "API Calls"
    think_time: "0"  # No think time for API scenarios
    steps:
      - name: "API Request"
        type: "rest"
        method: "GET"
        path: "/api/data"
```

### Step-Level Think Time

Customize think time for specific steps:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Mixed Think Time"
    think_time: "2s"  # Default
    steps:
      - name: "Landing Page"
        type: "rest"
        method: "GET"
        path: "/"
        # Uses default 2s think time

      - name: "Quick Navigation"
        type: "rest"
        method: "GET"
        path: "/menu"
        think_time: "0.5s"  # Override: quick navigation

      - name: "Read Article"
        type: "rest"
        method: "GET"
        path: "/article"
        think_time: "30-60s"  # Override: reading time

      - name: "Submit Form"
        type: "rest"
        method: "POST"
        path: "/submit"
        think_time: "10-20s"  # Override: form filling time
        body: '{"comment": "Great article!"}'
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Mixed Think Time', async (scenario) => {
  await scenario
    .withThinkTime('2s')  // Default

    .step('Landing Page')
    .get('/')
    // Uses default 2s think time

    .step('Quick Navigation')
    .get('/menu')
    .thinkTime('0.5s')  // Override: quick navigation

    .step('Read Article')
    .get('/article')
    .thinkTime('30-60s')  // Override: reading time

    .step('Submit Form')
    .post('/submit')
    .json({ comment: 'Great article!' })
    .thinkTime('10-20s');  // Override: form filling time
});
```

<!-- tabs:end -->

## Think Time Formats

### Fixed Duration

```yaml
think_time: "5s"      # Exactly 5 seconds
think_time: "2000"    # 2000 milliseconds (2 seconds)
```

### Random Range

```yaml
think_time: "1-5s"    # Random between 1-5 seconds
think_time: "500-2000" # Random between 500-2000 milliseconds
think_time: "0.5-3s"  # Random between 0.5-3 seconds
```

### Weighted Distribution

```yaml
think_time:
  distribution: "normal"
  mean: "3s"
  std_dev: "1s"        # Most values around 3s, some variation

think_time:
  distribution: "exponential"
  lambda: 0.5          # Exponential distribution
  min: "1s"
  max: "10s"
```

### No Think Time

```yaml
think_time: "0"       # No pauses
think_time: "0s"      # No pauses (explicit)
```

## Realistic Think Time Patterns

### E-commerce User Journey

Simulate realistic shopping behavior:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "E-commerce Shopping"
    steps:
      - name: "Home Page"
        type: "rest"
        method: "GET"
        path: "/"
        think_time: "3-7s"    # Browse home page

      - name: "Category Browse"
        type: "rest"
        method: "GET"
        path: "/category/electronics"
        think_time: "5-15s"   # Review category options

      - name: "Product View"
        type: "rest"
        method: "GET"
        path: "/product/laptop-123"
        think_time: "20-45s"  # Read product details, reviews

      - name: "Add to Cart"
        type: "rest"
        method: "POST"
        path: "/cart/add"
        body: '{"product_id": "laptop-123", "quantity": 1}'
        think_time: "2-5s"    # Quick decision

      - name: "View Cart"
        type: "rest"
        method: "GET"
        path: "/cart"
        think_time: "8-15s"   # Review cart contents

      - name: "Checkout"
        type: "rest"
        method: "POST"
        path: "/checkout"
        think_time: "60-120s" # Fill out checkout form
        body: |
          {
            "payment": {"method": "credit_card"},
            "shipping": {"address": "123 Main St"}
          }
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('E-commerce Shopping', async (scenario) => {
  await scenario
    .step('Home Page')
    .get('/')
    .thinkTime('3-7s')  // Browse home page

    .step('Category Browse')
    .get('/category/electronics')
    .thinkTime('5-15s')  // Review category options

    .step('Product View')
    .get('/product/laptop-123')
    .thinkTime('20-45s')  // Read product details, reviews

    .step('Add to Cart')
    .post('/cart/add')
    .json({ product_id: 'laptop-123', quantity: 1 })
    .thinkTime('2-5s')  // Quick decision

    .step('View Cart')
    .get('/cart')
    .thinkTime('8-15s')  // Review cart contents

    .step('Checkout')
    .post('/checkout')
    .json({
      payment: { method: 'credit_card' },
      shipping: { address: '123 Main St' }
    })
    .thinkTime('60-120s');  // Fill out checkout form
});
```

<!-- tabs:end -->

### Content Consumption

Model reading and content interaction:

```yaml
scenarios:
  - name: "Blog Reader"
    steps:
      - name: "Blog Home"
        type: "rest"
        method: "GET"
        path: "/blog"
        think_time: "5-10s"   # Scan article titles
        
      - name: "Read Article"
        type: "rest"
        method: "GET"
        path: "/blog/article-123"
        think_time: "2-5m"    # Read full article
        
      - name: "Post Comment"
        type: "rest"
        method: "POST"
        path: "/blog/article-123/comments"
        think_time: "30-90s"  # Write comment
        body: '{"comment": "{{faker.lorem.paragraph}}"}'
        
      - name: "Browse Related"
        type: "rest"
        method: "GET"
        path: "/blog/related/123"
        think_time: "3-8s"    # Quick scan of related articles
```

### Application Workflow

Simulate business application usage:

```yaml
scenarios:
  - name: "CRM Workflow"
    steps:
      - name: "Dashboard"
        type: "rest"
        method: "GET"
        path: "/dashboard"
        think_time: "5-15s"   # Review dashboard metrics
        
      - name: "Customer List"
        type: "rest"
        method: "GET"
        path: "/customers"
        think_time: "3-10s"   # Scan customer list
        
      - name: "Customer Details"
        type: "rest"
        method: "GET"
        path: "/customers/{{customer_id}}"
        think_time: "15-30s"  # Review customer information
        
      - name: "Edit Customer"
        type: "rest"
        method: "PUT"
        path: "/customers/{{customer_id}}"
        think_time: "45-90s"  # Update customer information
        body: |
          {
            "notes": "{{faker.lorem.sentences(2)}}",
            "last_contact": "{{faker.date.recent}}"
          }
        
      - name: "Create Follow-up Task"
        type: "rest"
        method: "POST"
        path: "/tasks"
        think_time: "20-40s"  # Create task details
        body: |
          {
            "customer_id": "{{customer_id}}",
            "task": "Follow up on meeting",
            "due_date": "{{faker.date.future}}"
          }
```

## Dynamic Think Time

### Conditional Think Time

Adjust think time based on response content:

```yaml
scenarios:
  - name: "Adaptive Think Time"
    steps:
      - name: "Get Content"
        type: "rest"
        method: "GET"
        path: "/content/{{content_id}}"
        hooks:
          afterStep: |
            // Adjust think time based on content length
            const contentLength = result.body.length;
            
            if (contentLength < 1000) {
              context.variables.next_think_time = "2-5s";   // Short content
            } else if (contentLength < 5000) {
              context.variables.next_think_time = "10-20s"; // Medium content
            } else {
              context.variables.next_think_time = "30-60s"; // Long content
            }
            
      - name: "Next Action"
        type: "rest"
        method: "GET"
        path: "/next-page"
        think_time: "{{next_think_time}}"
```

### User Type-Based Think Time

Different think times for different user types:

```yaml
scenarios:
  - name: "User Type Simulation"
    hooks:
      beforeScenario: |
        // Define user types with different behavior
        const userTypes = {
          'power_user': { think_time: '0.5-2s', experience: 'high' },
          'casual_user': { think_time: '3-8s', experience: 'medium' },
          'new_user': { think_time: '8-20s', experience: 'low' }
        };
        
        const userType = faker.helpers.arrayElement(Object.keys(userTypes));
        context.variables.user_type = userType;
        context.variables.think_time_base = userTypes[userType].think_time;
        
    steps:
      - name: "Navigate UI"
        type: "rest"
        method: "GET"
        path: "/interface"
        think_time: "{{think_time_base}}"
        
      - name: "Complex Task"
        type: "rest"
        method: "POST"
        path: "/complex-task"
        think_time: |
          {{#if (eq user_type 'power_user')}}
          2-5s
          {{else if (eq user_type 'casual_user')}}
          10-20s
          {{else}}
          30-60s
          {{/if}}
```

### Time-of-Day Think Time

Simulate different behavior patterns by time:

```yaml
scenarios:
  - name: "Time-Based Behavior"
    hooks:
      beforeScenario: |
        const hour = new Date().getHours();
        
        if (hour >= 9 && hour <= 17) {
          // Business hours - focused, faster
          context.variables.think_time_multiplier = 0.7;
        } else if (hour >= 18 && hour <= 22) {
          // Evening - relaxed browsing
          context.variables.think_time_multiplier = 1.5;
        } else {
          // Night - casual browsing
          context.variables.think_time_multiplier = 2.0;
        }
        
    steps:
      - name: "Browse Content"
        type: "rest"
        method: "GET"
        path: "/browse"
        think_time: "{{multiply 5 think_time_multiplier}}s"
```

## Advanced Think Time Features

### Think Time Ramp-Up

Gradually change think time during test:

```yaml
scenarios:
  - name: "Progressive Think Time"
    hooks:
      beforeStep: |
        // Gradually decrease think time as test progresses
        const elapsed = Date.now() - context.variables.scenario_start_time;
        const minutes = elapsed / (60 * 1000);
        
        // Start with 10s, decrease to 2s over 30 minutes
        const baseThinkTime = Math.max(2, 10 - (minutes / 30 * 8));
        context.variables.current_think_time = `${baseThinkTime}s`;
        
    steps:
      - name: "User Action"
        type: "rest"
        method: "GET"
        path: "/action"
        think_time: "{{current_think_time}}"
```

### Think Time Distribution Analysis

Track and analyze think time patterns:

```yaml
scenarios:
  - name: "Think Time Analysis"
    hooks:
      beforeScenario: |
        context.variables.think_times = [];
        
      beforeStep: |
        context.variables.step_start = Date.now();
        
      afterStep: |
        if (context.variables.last_step_end) {
          const actualThinkTime = context.variables.step_start - context.variables.last_step_end;
          context.variables.think_times.push({
            step: step.name,
            planned: step.think_time,
            actual: actualThinkTime,
            timestamp: context.variables.step_start
          });
        }
        context.variables.last_step_end = Date.now();
        
      afterScenario: |
        // Log think time analysis
        const thinkTimes = context.variables.think_times;
        const avgThinkTime = thinkTimes.reduce((sum, t) => sum + t.actual, 0) / thinkTimes.length;
        
        console.log('Think Time Analysis:', {
          total_steps: thinkTimes.length,
          avg_think_time: avgThinkTime,
          min_think_time: Math.min(...thinkTimes.map(t => t.actual)),
          max_think_time: Math.max(...thinkTimes.map(t => t.actual))
        });
```

## Think Time Anti-Patterns

### Avoid These Common Mistakes

<!-- tabs:start -->

#### **YAML**
```yaml
# ❌ Wrong: No think time for user scenarios
scenarios:
  - name: "Web User Simulation"
    steps:
      - name: "Browse Products"
        type: "rest"
        method: "GET"
        path: "/products"
      - name: "View Product"  # Immediate request - unrealistic
        type: "rest"
        method: "GET"
        path: "/product/123"

# ✅ Correct: Realistic think time
scenarios:
  - name: "Web User Simulation"
    think_time: "2-8s"  # Realistic user pauses
    steps:
      - name: "Browse Products"
        type: "rest"
        method: "GET"
        path: "/products"
      - name: "View Product"  # Waits 2-8 seconds
        type: "rest"
        method: "GET"
        path: "/product/123"

# ❌ Wrong: Same think time for all actions
scenarios:
  - name: "Mixed Actions"
    think_time: "5s"  # Same for all actions
    steps:
      - name: "Quick Navigation"
        type: "rest"
        method: "GET"
        path: "/menu"
      - name: "Read Long Article"  # Should take much longer
        type: "rest"
        method: "GET"
        path: "/article"

# ✅ Correct: Action-appropriate think time
scenarios:
  - name: "Mixed Actions"
    steps:
      - name: "Quick Navigation"
        type: "rest"
        method: "GET"
        path: "/menu"
        think_time: "1-2s"    # Quick action
      - name: "Read Long Article"
        type: "rest"
        method: "GET"
        path: "/article"
        think_time: "60-180s"  # Reading time
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

// ❌ Wrong: No think time for user scenarios
test('Web User Simulation - Wrong', async (scenario) => {
  await scenario
    .step('Browse Products')
    .get('/products')

    .step('View Product')  // Immediate request - unrealistic
    .get('/product/123');
});

// ✅ Correct: Realistic think time
test('Web User Simulation - Correct', async (scenario) => {
  await scenario
    .withThinkTime('2-8s')  // Realistic user pauses

    .step('Browse Products')
    .get('/products')

    .step('View Product')  // Waits 2-8 seconds
    .get('/product/123');
});

// ❌ Wrong: Same think time for all actions
test('Mixed Actions - Wrong', async (scenario) => {
  await scenario
    .withThinkTime('5s')  // Same for all actions

    .step('Quick Navigation')
    .get('/menu')

    .step('Read Long Article')  // Should take much longer
    .get('/article');
});

// ✅ Correct: Action-appropriate think time
test('Mixed Actions - Correct', async (scenario) => {
  await scenario
    .step('Quick Navigation')
    .get('/menu')
    .thinkTime('1-2s')  // Quick action

    .step('Read Long Article')
    .get('/article')
    .thinkTime('60-180s');  // Reading time
});
```

<!-- tabs:end -->

## Performance Impact

### Think Time vs Load

Understand how think time affects load generation:

```yaml
# Without think time: 100 VUs × 60 requests/minute = 6000 RPM
scenarios:
  - name: "High Load"
    think_time: "0"
    steps:
      - name: "Rapid Requests"
        type: "rest"
        method: "GET"
        path: "/api"

# With think time: 100 VUs × 6 requests/minute = 600 RPM  
scenarios:
  - name: "Realistic Load"
    think_time: "10s"  # 10s between requests
    steps:
      - name: "Realistic Requests"
        type: "rest"
        method: "GET"
        path: "/api"
```

### Calculating Required VUs

```yaml
# Formula: VUs = Target RPS × (Response Time + Think Time)
# Example: Want 100 RPS, 500ms response time, 5s think time
# VUs needed = 100 × (0.5 + 5) = 550 VUs

load:
  pattern: "basic"
  virtual_users: 550
  
scenarios:
  - name: "Calculated Load"
    think_time: "5s"
    steps:
      - name: "API Call"
        type: "rest"
        method: "GET"
        path: "/api/endpoint"
```

## Best Practices

### 1. Match Real User Behavior

```yaml
# Research actual user behavior patterns
scenarios:
  - name: "Research-Based Think Time"
    steps:
      - name: "Product Search"
        type: "rest"
        method: "GET"
        path: "/search"
        think_time: "3-12s"    # Based on user research
        
      - name: "Filter Results"
        type: "rest"
        method: "GET"
        path: "/search?filter=price"
        think_time: "5-15s"    # Time to review and select filters
```

### 2. Use Different Patterns for Different Scenarios

```yaml
scenarios:
  - name: "Human User Simulation"
    think_time: "2-15s"      # Variable human behavior
    
  - name: "Mobile App API"
    think_time: "0.5-2s"     # Faster mobile interactions
    
  - name: "Automated System"
    think_time: "0"          # No delays for system-to-system
```

### 3. Document Think Time Decisions

```yaml
scenarios:
  - name: "Customer Portal Usage"
    # Think times based on UX research showing average interaction times
    steps:
      - name: "Login"
        type: "rest"
        method: "POST"
        path: "/login"
        think_time: "0"        # No delay after login
        
      - name: "Dashboard Review"
        type: "rest"
        method: "GET"
        path: "/dashboard"
        think_time: "8-15s"    # Time to review dashboard widgets
        
      - name: "Account Details"
        type: "rest"
        method: "GET"
        path: "/account"
        think_time: "20-45s"   # Time to review and potentially update account info
```

### 4. Test Both With and Without Think Time

```yaml
# Run tests both ways to understand different load patterns
scenarios:
  - name: "Peak Load Test"
    think_time: "0"          # Maximum possible load
    
  - name: "Realistic Load Test"  
    think_time: "3-12s"      # Realistic user behavior
```

Think Time is essential for realistic performance testing. It helps create accurate load patterns, identifies real-world performance issues, and ensures your system can handle actual user behavior patterns rather than artificial synthetic load.
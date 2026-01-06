# Data Extraction

Data extraction in Perfornium allows you to capture values from responses and use them in subsequent requests. This enables complex test flows with data dependencies and realistic user journeys.

## Extraction Types

### JSON Path Extraction

Extract data from JSON responses using JSON Path expressions:

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Create User and Extract ID"
    type: "rest"
    method: "POST"
    path: "/api/users"
    body: |
      {
        "name": "{{faker.person.fullName}}",
        "email": "{{faker.internet.email}}"
      }
    extract:
      - name: "user_id"
        type: "json_path"
        expression: "$.id"
        description: "Extract user ID for subsequent requests"

      - name: "user_email"
        type: "json_path"
        expression: "$.email"

      - name: "created_at"
        type: "json_path"
        expression: "$.metadata.created_at"
        default: "2024-01-01T00:00:00Z"  # Default if not found

  - name: "Get User Profile"
    type: "rest"
    method: "GET"
    path: "/api/users/{{user_id}}"
    checks:
      - type: "json_path"
        value: "$.email"
        expected: "{{user_email}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('User Creation and Extraction', async (scenario) => {
  await scenario
    .step('Create User and Extract ID')
    .post('/api/users')
    .json({
      name: '{{faker.person.fullName}}',
      email: '{{faker.internet.email}}'
    })
    .extract('user_id', '$.id')
    .extract('user_email', '$.email')
    .extract('created_at', '$.metadata.created_at')

    .step('Get User Profile')
    .get('/api/users/{{user_id}}')
    .check('json_path', '$.email', { expected: '{{user_email}}' });
});
```

<!-- tabs:end -->

### Complex JSON Path Examples

<!-- tabs:start -->

#### **YAML**
```yaml
steps:
  - name: "Extract Complex Data"
    type: "rest"
    method: "GET"
    path: "/api/orders"
    extract:
      # Extract single value
      - name: "first_order_id"
        type: "json_path"
        expression: "$.orders[0].id"

      # Extract array of values
      - name: "all_order_ids"
        type: "json_path"
        expression: "$.orders[*].id"

      # Extract with filter
      - name: "pending_orders"
        type: "json_path"
        expression: "$.orders[?(@.status=='pending')].id"

      # Extract nested object
      - name: "customer_info"
        type: "json_path"
        expression: "$.orders[0].customer"

      # Extract with length
      - name: "order_count"
        type: "json_path"
        expression: "$.orders.length"

      # Extract based on condition
      - name: "high_value_orders"
        type: "json_path"
        expression: "$.orders[?(@.total > 100)].id"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Extract Complex Data', async (scenario) => {
  await scenario
    .step('Extract Complex Data')
    .get('/api/orders')
    .extract('first_order_id', '$.orders[0].id')
    .extract('all_order_ids', '$.orders[*].id')
    .extract('pending_orders', '$.orders[?(@.status=="pending")].id')
    .extract('customer_info', '$.orders[0].customer')
    .extract('order_count', '$.orders.length')
    .extract('high_value_orders', '$.orders[?(@.total > 100)].id');
});
```

<!-- tabs:end -->

### XPath Extraction (SOAP/XML)

Extract data from XML responses using XPath:

```yaml
steps:
  - name: "SOAP Service Call"
    type: "soap"
    wsdl: "http://example.com/service?WSDL"
    operation: "GetUserInfo"
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <GetUserInfo>
            <UserId>123</UserId>
          </GetUserInfo>
        </soap:Body>
      </soap:Envelope>
    extract:
      - name: "user_name"
        type: "xpath"
        expression: "//GetUserInfoResponse/User/Name/text()"
        namespaces:
          soap: "http://schemas.xmlsoap.org/soap/envelope/"
          
      - name: "user_attributes"
        type: "xpath"
        expression: "//User/@*"
        return_type: "array"
        
      - name: "user_element"
        type: "xpath"
        expression: "//User"
        return_type: "xml"
        
      - name: "user_count"
        type: "xpath"
        expression: "count(//User)"
        return_type: "number"
```

### Regular Expression Extraction

Extract data using regular expressions:

```yaml
steps:
  - name: "Extract with Regex"
    type: "rest"
    method: "GET"
    path: "/api/html-response"
    extract:
      # Extract first match
      - name: "csrf_token"
        type: "regex"
        expression: 'name="csrf_token" value="([^"]+)"'
        group: 1  # Capture group 1
        
      # Extract multiple matches
      - name: "all_links"
        type: "regex"
        expression: 'href="([^"]+)"'
        group: 1
        return_type: "array"
        
      # Extract with flags
      - name: "case_insensitive"
        type: "regex"
        expression: 'error:\\s*([^\\n]+)'
        flags: "i"  # Case insensitive
        
      # Extract numbers
      - name: "order_total"
        type: "regex"
        expression: 'Total:\\s*\\$([\\d,]+\\.\\d{2})'
        group: 1
        transform: "parseFloat"  # Convert to number
```

### Header Extraction

Extract values from response headers:

```yaml
steps:
  - name: "API Call with Header Extraction"
    type: "rest"
    method: "POST"
    path: "/api/sessions"
    body: '{"action": "create"}'
    extract:
      - name: "session_id"
        type: "header"
        name: "X-Session-ID"
        
      - name: "rate_limit_remaining"
        type: "header"
        name: "X-RateLimit-Remaining"
        transform: "parseInt"
        
      - name: "content_type"
        type: "header"
        name: "Content-Type"
        
      - name: "all_custom_headers"
        type: "header"
        pattern: "X-Custom-*"  # Extract headers matching pattern
        return_type: "object"
```

### Cookie Extraction

Extract cookies from response:

```yaml
steps:
  - name: "Login and Extract Cookies"
    type: "rest"
    method: "POST"
    path: "/auth/login"
    body: '{"username": "test", "password": "test"}'
    extract:
      - name: "session_cookie"
        type: "cookie"
        name: "SESSIONID"
        
      - name: "auth_token"
        type: "cookie"
        name: "auth_token"
        
      - name: "all_cookies"
        type: "cookie"
        name: "*"  # Extract all cookies
        return_type: "object"
```

### Custom Extraction

Use JavaScript for complex extraction logic:

```yaml
steps:
  - name: "Custom Data Processing"
    type: "rest"
    method: "GET"
    path: "/api/complex-data"
    extract:
      - name: "processed_data"
        type: "custom"
        script: |
          const data = JSON.parse(result.body);
          
          // Complex processing
          const processedItems = data.items
            .filter(item => item.active)
            .map(item => ({
              id: item.id,
              display_name: `${item.name} (${item.category})`,
              price_with_tax: item.price * 1.08,
              availability: item.stock > 0 ? 'available' : 'out_of_stock'
            }))
            .sort((a, b) => b.price_with_tax - a.price_with_tax);
          
          return {
            total_active: processedItems.length,
            highest_price: processedItems[0]?.price_with_tax || 0,
            available_count: processedItems.filter(i => i.availability === 'available').length,
            items: processedItems.slice(0, 10) // Top 10
          };
          
      - name: "summary_stats"
        type: "custom"
        script: |
          const data = JSON.parse(result.body);
          
          // Calculate statistics
          const values = data.items.map(item => item.value);
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = sum / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);
          
          // Calculate percentiles
          const sorted = values.sort((a, b) => a - b);
          const p50 = sorted[Math.floor(sorted.length * 0.5)];
          const p95 = sorted[Math.floor(sorted.length * 0.95)];
          
          return { sum, avg, min, max, p50, p95, count: values.length };
```

## Data Transformation

### Built-in Transformations

Transform extracted data automatically:

```yaml
extract:
  - name: "price_as_number"
    type: "json_path"
    expression: "$.price"
    transform: "parseFloat"
    
  - name: "quantity_as_int"
    type: "json_path"
    expression: "$.quantity"
    transform: "parseInt"
    
  - name: "date_as_timestamp"
    type: "json_path"
    expression: "$.created_at"
    transform: "toTimestamp"  # Convert ISO date to timestamp
    
  - name: "uppercase_name"
    type: "json_path"
    expression: "$.name"
    transform: "toUpperCase"
    
  - name: "trimmed_description"
    type: "json_path"
    expression: "$.description"
    transform: "trim"
```

### Custom Transformations

```yaml
extract:
  - name: "formatted_phone"
    type: "json_path"
    expression: "$.phone"
    transform: |
      function(value) {
        // Remove all non-digits
        const digits = value.replace(/\D/g, '');
        
        // Format as (XXX) XXX-XXXX
        if (digits.length === 10) {
          return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        }
        
        return value; // Return original if not 10 digits
      }
      
  - name: "price_tier"
    type: "json_path"
    expression: "$.price"
    transform: |
      function(price) {
        const numPrice = parseFloat(price);
        if (numPrice < 10) return 'budget';
        if (numPrice < 50) return 'mid-range';
        if (numPrice < 200) return 'premium';
        return 'luxury';
      }
```

## Conditional Extraction

Extract data based on conditions:

```yaml
steps:
  - name: "Conditional Extraction"
    type: "rest"
    method: "GET"
    path: "/api/user-profile"
    extract:
      # Extract only if condition is met
      - name: "admin_token"
        type: "json_path"
        expression: "$.admin_token"
        condition: "{{user_role}} === 'admin'"
        
      # Extract with fallback
      - name: "display_name"
        type: "json_path"
        expression: "$.full_name"
        fallback:
          type: "json_path"
          expression: "$.username"
        default: "Anonymous User"
        
      # Extract based on response status
      - name: "error_details"
        type: "json_path"
        expression: "$.error"
        condition: "result.status >= 400"
        
      # Extract different paths based on user type
      - name: "dashboard_url"
        type: "custom"
        script: |
          const data = JSON.parse(result.body);
          if (data.user_type === 'admin') {
            return data.admin_dashboard_url;
          } else if (data.user_type === 'manager') {
            return data.manager_dashboard_url;
          } else {
            return data.user_dashboard_url;
          }
```

## Advanced Patterns

### Multi-step Data Flow

Chain extracted data through multiple requests:

<!-- tabs:start -->

#### **YAML**
```yaml
scenarios:
  - name: "Multi-step Data Flow"
    steps:
      - name: "Step 1: Create Order"
        type: "rest"
        method: "POST"
        path: "/api/orders"
        body: |
          {
            "customer_id": "{{customer_id}}",
            "items": [{"product_id": "{{product_id}}", "quantity": 2}]
          }
        extract:
          - name: "order_id"
            type: "json_path"
            expression: "$.order_id"
          - name: "order_total"
            type: "json_path"
            expression: "$.total"
          - name: "payment_required"
            type: "json_path"
            expression: "$.payment_required"

      - name: "Step 2: Process Payment"
        type: "rest"
        method: "POST"
        path: "/api/payments"
        condition: "{{payment_required}} === true"
        body: |
          {
            "order_id": "{{order_id}}",
            "amount": {{order_total}},
            "payment_method": "credit_card"
          }
        extract:
          - name: "payment_id"
            type: "json_path"
            expression: "$.payment_id"
          - name: "transaction_id"
            type: "json_path"
            expression: "$.transaction_id"

      - name: "Step 3: Confirm Order"
        type: "rest"
        method: "PUT"
        path: "/api/orders/{{order_id}}/confirm"
        body: |
          {
            "payment_id": "{{payment_id}}",
            "transaction_id": "{{transaction_id}}"
          }
        extract:
          - name: "confirmation_number"
            type: "json_path"
            expression: "$.confirmation_number"
          - name: "estimated_delivery"
            type: "json_path"
            expression: "$.estimated_delivery_date"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Multi-step Data Flow', async (scenario) => {
  await scenario
    .step('Step 1: Create Order')
    .post('/api/orders')
    .json({
      customer_id: '{{customer_id}}',
      items: [{ product_id: '{{product_id}}', quantity: 2 }]
    })
    .extract('order_id', '$.order_id')
    .extract('order_total', '$.total')
    .extract('payment_required', '$.payment_required')

    .step('Step 2: Process Payment')
    .post('/api/payments')
    .json({
      order_id: '{{order_id}}',
      amount: '{{order_total}}',
      payment_method: 'credit_card'
    })
    .extract('payment_id', '$.payment_id')
    .extract('transaction_id', '$.transaction_id')

    .step('Step 3: Confirm Order')
    .put('/api/orders/{{order_id}}/confirm')
    .json({
      payment_id: '{{payment_id}}',
      transaction_id: '{{transaction_id}}'
    })
    .extract('confirmation_number', '$.confirmation_number')
    .extract('estimated_delivery', '$.estimated_delivery_date');
});
```

<!-- tabs:end -->

### Data Aggregation

Aggregate data across multiple requests:

```yaml
scenarios:
  - name: "Data Aggregation"
    hooks:
      beforeScenario: |
        // Initialize aggregation arrays
        context.variables.all_prices = [];
        context.variables.all_categories = [];
        context.variables.total_items = 0;
        
    steps:
      - name: "Get Product Category"
        type: "rest"
        method: "GET"
        path: "/api/categories/{{category_id}}/products"
        extract:
          - name: "category_products"
            type: "custom"
            script: |
              const data = JSON.parse(result.body);
              
              // Add to aggregation
              data.products.forEach(product => {
                context.variables.all_prices.push(product.price);
                if (!context.variables.all_categories.includes(product.category)) {
                  context.variables.all_categories.push(product.category);
                }
              });
              
              context.variables.total_items += data.products.length;
              
              // Return summary for this category
              return {
                category: data.category_name,
                product_count: data.products.length,
                avg_price: data.products.reduce((sum, p) => sum + p.price, 0) / data.products.length,
                min_price: Math.min(...data.products.map(p => p.price)),
                max_price: Math.max(...data.products.map(p => p.price))
              };
              
      - name: "Generate Final Report"
        type: "custom"
        script: |
          // Calculate overall statistics
          const allPrices = context.variables.all_prices;
          const overallStats = {
            total_items: context.variables.total_items,
            total_categories: context.variables.all_categories.length,
            avg_price: allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length,
            min_price: Math.min(...allPrices),
            max_price: Math.max(...allPrices),
            price_range: Math.max(...allPrices) - Math.min(...allPrices)
          };
          
          console.log('Aggregated Statistics:', JSON.stringify(overallStats, null, 2));
          
          return overallStats;
        extract:
          - name: "final_report"
            type: "custom"
            script: "return result;"
```

### Dynamic Extraction

Extract different data based on runtime conditions:

```yaml
steps:
  - name: "Dynamic Response Processing"
    type: "rest"
    method: "GET"
    path: "/api/data/{{data_type}}"
    extract:
      - name: "dynamic_data"
        type: "custom"
        script: |
          const data = JSON.parse(result.body);
          const dataType = context.variables.data_type;
          
          switch(dataType) {
            case 'users':
              return {
                type: 'users',
                ids: data.users.map(u => u.id),
                count: data.users.length,
                emails: data.users.map(u => u.email)
              };
              
            case 'products':
              return {
                type: 'products',
                ids: data.products.map(p => p.id),
                count: data.products.length,
                categories: [...new Set(data.products.map(p => p.category))]
              };
              
            case 'orders':
              return {
                type: 'orders',
                ids: data.orders.map(o => o.id),
                count: data.orders.length,
                total_value: data.orders.reduce((sum, o) => sum + o.total, 0)
              };
              
            default:
              return {
                type: 'unknown',
                raw_data: data
              };
          }
```

## Error Handling

### Extraction Error Handling

Handle extraction failures gracefully:

```yaml
extract:
  - name: "safe_user_id"
    type: "json_path"
    expression: "$.user.id"
    default: "anonymous"
    on_error: "continue"  # Continue test even if extraction fails
    
  - name: "robust_price"
    type: "custom"
    script: |
      try {
        const data = JSON.parse(result.body);
        const price = data.product?.price || data.item?.cost || data.value;
        
        if (typeof price === 'string') {
          return parseFloat(price.replace(/[^0-9.-]/g, ''));
        }
        
        return typeof price === 'number' ? price : 0;
      } catch (error) {
        console.warn('Price extraction failed:', error.message);
        return 0;
      }
    default: 0
    
  - name: "validated_email"
    type: "json_path"
    expression: "$.email"
    validation: |
      function(value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error(`Invalid email format: ${value}`);
        }
        return value;
      }
    default: "invalid@example.com"
```

## Performance Considerations

### Efficient Extraction

Optimize extraction for performance:

```yaml
# Good: Specific, efficient extractions
extract:
  - name: "user_id"
    type: "json_path"
    expression: "$.id"  # Direct path
    
  - name: "status"
    type: "json_path"
    expression: "$.status"

# Avoid: Complex, expensive extractions
extract:
  - name: "complex_calc"
    type: "custom"
    script: |
      // Avoid heavy computations in extraction
      const data = JSON.parse(result.body);
      return data.items.map(item => {
        // Expensive operation for each item
        return performComplexCalculation(item);
      });
```

### Memory Management

Manage extracted data memory usage:

```yaml
scenarios:
  - name: "Memory Efficient Extraction"
    hooks:
      afterStep: |
        // Clean up large extracted data after use
        if (context.variables.large_dataset) {
          // Keep only what's needed
          context.variables.summary_stats = {
            count: context.variables.large_dataset.length,
            first_id: context.variables.large_dataset[0]?.id
          };
          delete context.variables.large_dataset;
        }
```

## Best Practices

### 1. Use Descriptive Names

```yaml
# Good: Clear, descriptive names
extract:
  - name: "new_user_id"
    type: "json_path"
    expression: "$.user.id"
    
  - name: "auth_token_expires_at"
    type: "json_path"
    expression: "$.token.expires_at"

# Avoid: Generic, unclear names
extract:
  - name: "id"
    type: "json_path"
    expression: "$.user.id"
    
  - name: "data"
    type: "json_path"
    expression: "$.token.expires_at"
```

### 2. Always Provide Defaults

```yaml
extract:
  - name: "optional_field"
    type: "json_path"
    expression: "$.optional_data"
    default: null  # Explicit default
    
  - name: "user_preferences"
    type: "json_path"
    expression: "$.user.preferences"
    default: {}    # Default object
```

### 3. Validate Extracted Data

```yaml
extract:
  - name: "validated_id"
    type: "json_path"
    expression: "$.id"
    validation: |
      function(value) {
        if (!value || typeof value !== 'string') {
          throw new Error('ID must be a non-empty string');
        }
        return value;
      }
```

### 4. Document Complex Extractions

```yaml
extract:
  - name: "business_metrics"
    type: "custom"
    description: "Calculates key business metrics from order data"
    script: |
      /**
       * Processes order response to extract business metrics:
       * - Revenue per customer segment
       * - Average order value by region
       * - Product category performance
       */
      const data = JSON.parse(result.body);
      // ... processing logic
```

Data extraction is crucial for creating realistic test flows and validating complex business logic. Use appropriate extraction methods and handle edge cases to ensure robust and maintainable tests.
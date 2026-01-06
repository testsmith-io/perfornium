# Data-Driven Tests

Data-driven testing in Perfornium enables you to run the same test logic with multiple datasets, making tests more comprehensive and realistic. This example covers CSV data injection, dynamic data generation, and parameterized testing scenarios.

## Overview

Data-driven testing provides:
- Realistic test data diversity
- Parameterized test execution
- External data source integration
- Dynamic data generation
- Data validation and processing

## CSV Data Integration

### Basic CSV Data Usage

<!-- tabs:start -->

#### **YAML**

```yaml
# users.csv
# username,email,age,country
# john.doe,john@example.com,25,US
# jane.smith,jane@example.com,30,UK
# carlos.rodriguez,carlos@example.com,35,ES

scenarios:
  - name: "User Registration with CSV Data"

    csv_data:
      file: "data/users.csv"
      mode: "sequential"  # sequential, random, shared

    requests:
      - url: "https://api.example.com/users"
        method: POST
        headers:
          Content-Type: "application/json"
        body: |
          {
            "username": "{{csv.username}}",
            "email": "{{csv.email}}",
            "age": {{csv.age}},
            "country": "{{csv.country}}",
            "registration_date": "{{date.now}}"
          }

        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.id"

        checks:
          - type: "status"
            value: 201
          - type: "json_path"
            expression: "$.username"
            value: "{{csv.username}}"
          - type: "json_path"
            expression: "$.email"
            value: "{{csv.email}}"

      # Follow-up request using extracted data
      - url: "https://api.example.com/users/{{user_id}}/profile"
        method: GET

        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.country"
            value: "{{csv.country}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('User Registration with CSV Data')
  .baseUrl('https://api.example.com')

  .scenario('User Registration with CSV Data', 100)
    .withCSV('data/users.csv', { mode: 'sequential' })

    .post('/users')
      .header('Content-Type', 'application/json')
      .body({
        username: '{{csv.username}}',
        email: '{{csv.email}}',
        age: '{{csv.age}}',
        country: '{{csv.country}}',
        registration_date: '{{date.now}}'
      })
      .extract('user_id', 'json', '$.id')
      .check('status', 201)
      .check('jsonPath', '$.username', { value: '{{csv.username}}' })
      .check('jsonPath', '$.email', { value: '{{csv.email}}' })

    .get('/users/{{user_id}}/profile')
      .check('status', 200)
      .check('jsonPath', '$.country', { value: '{{csv.country}}' })

    .done()

  .build();
```

<!-- tabs:end -->

### Multiple CSV Files

```yaml
scenarios:
  - name: "E-commerce Order Flow"
    
    csv_data:
      customers:
        file: "data/customers.csv"
        mode: "sequential"
      products:
        file: "data/products.csv"
        mode: "random"
      
    requests:
      # Login as customer
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "email": "{{csv.customers.email}}",
            "password": "{{csv.customers.password}}"
          }
        
        extract:
          - name: "auth_token"
            type: "json_path"
            expression: "$.token"
        
        checks:
          - type: "status"
            value: 200
      
      # Add product to cart
      - url: "https://api.example.com/cart/add"
        method: POST
        headers:
          Authorization: "Bearer {{auth_token}}"
        body: |
          {
            "product_id": "{{csv.products.id}}",
            "quantity": {{csv.products.default_quantity}},
            "price": {{csv.products.price}}
          }
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.total_amount"
            exists: true
      
      # Checkout with customer data
      - url: "https://api.example.com/checkout"
        method: POST
        headers:
          Authorization: "Bearer {{auth_token}}"
        body: |
          {
            "shipping_address": {
              "street": "{{csv.customers.address}}",
              "city": "{{csv.customers.city}}",
              "country": "{{csv.customers.country}}",
              "postal_code": "{{csv.customers.postal_code}}"
            },
            "payment_method": "{{csv.customers.preferred_payment}}"
          }
        
        extract:
          - name: "order_id"
            type: "json_path"
            expression: "$.order_id"
        
        checks:
          - type: "status"
            value: 201
          - type: "response_time"
            threshold: 3000
```

## Dynamic Data Generation

### Faker.js Integration

```yaml
scenarios:
  - name: "Dynamic User Data Generation"
    
    requests:
      - url: "https://api.example.com/users"
        method: POST
        body: |
          {
            "personal_info": {
              "first_name": "{{faker.person.firstName}}",
              "last_name": "{{faker.person.lastName}}",
              "email": "{{faker.internet.email}}",
              "phone": "{{faker.phone.number}}",
              "date_of_birth": "{{faker.date.past(50).toISOString().split('T')[0]}}",
              "avatar": "{{faker.image.avatar}}"
            },
            "address": {
              "street": "{{faker.location.streetAddress}}",
              "city": "{{faker.location.city}}",
              "state": "{{faker.location.state}}",
              "country": "{{faker.location.country}}",
              "postal_code": "{{faker.location.zipCode}}",
              "coordinates": {
                "lat": {{faker.location.latitude}},
                "lng": {{faker.location.longitude}}
              }
            },
            "professional": {
              "job_title": "{{faker.person.jobTitle}}",
              "company": "{{faker.company.name}}",
              "department": "{{faker.commerce.department}}",
              "salary": {{faker.number.int({min: 30000, max: 200000})}},
              "start_date": "{{faker.date.past(10).toISOString().split('T')[0]}}"
            },
            "preferences": {
              "language": "{{faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'it'])}}",
              "timezone": "{{faker.date.timeZone}}",
              "theme": "{{faker.helpers.arrayElement(['light', 'dark', 'auto'])}}",
              "notifications": {{faker.datatype.boolean}}
            },
            "metadata": {
              "user_agent": "{{faker.internet.userAgent}}",
              "ip_address": "{{faker.internet.ip}}",
              "session_id": "{{faker.string.uuid}}",
              "referrer": "{{faker.internet.url}}"
            }
          }
        
        extract:
          - name: "generated_user_id"
            type: "json_path"
            expression: "$.id"
          - name: "generated_email"
            type: "json_path"
            expression: "$.personal_info.email"
        
        checks:
          - type: "status"
            value: 201
          - type: "json_path"
            expression: "$.personal_info.email"
            regex: "^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$"
          - type: "json_path"
            expression: "$.address.postal_code"
            exists: true
```

### Custom Data Generators

```yaml
scenarios:
  - name: "Financial Data Generation"
    variables:
      # Custom generators using JavaScript
      account_number: "{{faker.finance.account}}"
      routing_number: "{{faker.finance.routingNumber}}"
      iban: "{{faker.finance.iban}}"
      credit_card: "{{faker.finance.creditCardNumber}}"
      transaction_amount: "{{faker.finance.amount}}"
      currency_code: "{{faker.finance.currencyCode}}"
      
    requests:
      - url: "https://api.example.com/accounts"
        method: POST
        body: |
          {
            "account_details": {
              "account_number": "{{account_number}}",
              "routing_number": "{{routing_number}}",
              "iban": "{{iban}}",
              "account_type": "{{faker.helpers.arrayElement(['checking', 'savings', 'business'])}}",
              "currency": "{{currency_code}}",
              "initial_balance": {{transaction_amount}}
            },
            "owner_info": {
              "full_name": "{{faker.person.fullName}}",
              "ssn": "{{faker.phone.number('###-##-####')}}",
              "date_of_birth": "{{faker.date.past(60).toISOString().split('T')[0]}}",
              "employment": {
                "employer": "{{faker.company.name}}",
                "income": {{faker.number.int({min: 25000, max: 500000})}},
                "employment_type": "{{faker.helpers.arrayElement(['full-time', 'part-time', 'contractor', 'self-employed'])}}"
              }
            },
            "contact_info": {
              "email": "{{faker.internet.email}}",
              "phone": "{{faker.phone.number}}",
              "address": {
                "street": "{{faker.location.streetAddress}}",
                "city": "{{faker.location.city}}",
                "state": "{{faker.location.state}}",
                "zip": "{{faker.location.zipCode}}"
              }
            }
          }
        
        extract:
          - name: "account_id"
            type: "json_path"
            expression: "$.account_id"
        
        checks:
          - type: "status"
            value: 201
          - type: "json_path"
            expression: "$.account_details.currency"
            value: "{{currency_code}}"
```

## Database-Driven Testing

### SQL Data Source

```yaml
scenarios:
  - name: "Database-driven User Testing"
    
    data_source:
      type: "sql"
      connection:
        host: "{{env.DB_HOST}}"
        port: 5432
        database: "testdata"
        username: "{{env.DB_USER}}"
        password: "{{env.DB_PASSWORD}}"
      
      query: |
        SELECT 
          u.id,
          u.username,
          u.email,
          u.status,
          p.first_name,
          p.last_name,
          p.phone,
          a.street,
          a.city,
          a.country
        FROM users u
        JOIN profiles p ON u.id = p.user_id
        JOIN addresses a ON u.id = a.user_id
        WHERE u.status = 'active'
        AND u.created_at > NOW() - INTERVAL '30 days'
        ORDER BY RANDOM()
        LIMIT 1000;
      
      mode: "sequential"
    
    requests:
      - url: "https://api.example.com/users/{{data.id}}/profile"
        method: GET
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.email"
            value: "{{data.email}}"
          - type: "json_path"
            expression: "$.status"
            value: "{{data.status}}"
      
      - url: "https://api.example.com/users/{{data.id}}/update"
        method: PUT
        body: |
          {
            "profile": {
              "first_name": "{{data.first_name}}",
              "last_name": "{{data.last_name}}",
              "phone": "{{data.phone}}"
            },
            "address": {
              "street": "{{data.street}}",
              "city": "{{data.city}}",
              "country": "{{data.country}}"
            }
          }
        
        checks:
          - type: "status"
            value: 200
```

## API-Driven Data

### External API Data Source

```yaml
scenarios:
  - name: "External API Data Integration"
    
    data_source:
      type: "api"
      endpoint: "https://jsonplaceholder.typicode.com/users"
      method: "GET"
      cache_duration: "1h"
      
    requests:
      # Use external API data for testing
      - url: "https://api.example.com/import/user"
        method: POST
        body: |
          {
            "external_id": {{data.id}},
            "name": "{{data.name}}",
            "username": "{{data.username}}",
            "email": "{{data.email}}",
            "phone": "{{data.phone}}",
            "website": "{{data.website}}",
            "company": "{{data.company.name}}",
            "address": {
              "street": "{{data.address.street}}",
              "suite": "{{data.address.suite}}",
              "city": "{{data.address.city}}",
              "zipcode": "{{data.address.zipcode}}"
            }
          }
        
        extract:
          - name: "imported_user_id"
            type: "json_path"
            expression: "$.id"
        
        checks:
          - type: "status"
            value: 201
          - type: "json_path"
            expression: "$.external_id"
            value: "{{data.id}}"
      
      # Verify imported data
      - url: "https://api.example.com/users/{{imported_user_id}}"
        method: GET
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.name"
            value: "{{data.name}}"
```

## Complex Data Scenarios

### Hierarchical Data Testing

```yaml
# organizations.csv
# org_id,org_name,industry,employee_count
# 1,TechCorp,Technology,500
# 2,HealthPlus,Healthcare,1200
# 3,EduLearn,Education,300

# employees.csv  
# emp_id,org_id,name,role,department,salary
# 1,1,John Doe,Developer,Engineering,75000
# 2,1,Jane Smith,Manager,Engineering,95000
# 3,2,Bob Johnson,Nurse,Medical,60000

scenarios:
  - name: "Hierarchical Organization Data"
    
    csv_data:
      organizations:
        file: "data/organizations.csv"
        mode: "sequential"
      employees:
        file: "data/employees.csv"
        mode: "sequential"
        filter: "org_id == organizations.org_id"  # Link data
    
    requests:
      # Create organization
      - url: "https://api.example.com/organizations"
        method: POST
        body: |
          {
            "name": "{{csv.organizations.org_name}}",
            "industry": "{{csv.organizations.industry}}",
            "employee_count": {{csv.organizations.employee_count}},
            "external_id": "{{csv.organizations.org_id}}"
          }
        
        extract:
          - name: "org_id"
            type: "json_path"
            expression: "$.id"
        
        checks:
          - type: "status"
            value: 201
      
      # Add employee to organization
      - url: "https://api.example.com/organizations/{{org_id}}/employees"
        method: POST
        body: |
          {
            "name": "{{csv.employees.name}}",
            "role": "{{csv.employees.role}}",
            "department": "{{csv.employees.department}}",
            "salary": {{csv.employees.salary}},
            "external_id": "{{csv.employees.emp_id}}"
          }
        
        extract:
          - name: "employee_id"
            type: "json_path"
            expression: "$.id"
        
        checks:
          - type: "status"
            value: 201
          - type: "json_path"
            expression: "$.organization_id"
            value: "{{org_id}}"
      
      # Verify relationship
      - url: "https://api.example.com/organizations/{{org_id}}/employees/{{employee_id}}"
        method: GET
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.department"
            value: "{{csv.employees.department}}"
```

### Time-Series Data Testing

```yaml
# metrics.csv
# timestamp,metric_name,value,unit,tags
# 2023-12-01T10:00:00Z,cpu_usage,75.5,percent,server=web1
# 2023-12-01T10:01:00Z,cpu_usage,78.2,percent,server=web1
# 2023-12-01T10:02:00Z,memory_usage,1024,MB,server=web1

scenarios:
  - name: "Time-Series Metrics Ingestion"
    
    csv_data:
      file: "data/metrics.csv"
      mode: "sequential"
      
    requests:
      - url: "https://api.example.com/metrics"
        method: POST
        body: |
          {
            "timestamp": "{{csv.timestamp}}",
            "metric": {
              "name": "{{csv.metric_name}}",
              "value": {{csv.value}},
              "unit": "{{csv.unit}}"
            },
            "tags": {
              {{#each (split csv.tags ',')}}
              "{{split this '='}}[0]": "{{split this '='}}[1]"{{#unless @last}},{{/unless}}
              {{/each}}
            },
            "metadata": {
              "source": "performance_test",
              "test_run_id": "{{test_run_id}}",
              "ingestion_time": "{{date.now}}"
            }
          }
        
        checks:
          - type: "status"
            value: 201
          - type: "response_time"
            threshold: 500
            description: "Metrics ingestion should be fast"
```

## Data Validation and Processing

### Data Transformation

```yaml
scenarios:
  - name: "Data Processing and Validation"
    
    csv_data:
      file: "data/raw_customers.csv"
      mode: "sequential"
      transformations:
        - field: "email"
          transform: "toLowerCase"
        - field: "phone"
          transform: "normalize"
          pattern: "###-###-####"
        - field: "postal_code"
          transform: "pad"
          length: 5
          character: "0"
        - field: "registration_date"
          transform: "parseDate"
          format: "MM/dd/yyyy"
          output_format: "yyyy-MM-dd"
    
    requests:
      - url: "https://api.example.com/customers/validate"
        method: POST
        body: |
          {
            "customer_data": {
              "email": "{{csv.email}}",
              "phone": "{{csv.phone}}",
              "postal_code": "{{csv.postal_code}}",
              "registration_date": "{{csv.registration_date}}"
            }
          }
        
        extract:
          - name: "validation_result"
            type: "json_path"
            expression: "$.validation"
          - name: "is_valid"
            type: "json_path"
            expression: "$.is_valid"
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.is_valid"
            value: true
            description: "Transformed data should be valid"
      
      # Only create customer if validation passed
      - url: "https://api.example.com/customers"
        method: POST
        condition: "is_valid == true"
        body: |
          {
            "email": "{{csv.email}}",
            "phone": "{{csv.phone}}",
            "postal_code": "{{csv.postal_code}}",
            "registration_date": "{{csv.registration_date}}",
            "source": "data_driven_test"
          }
        
        checks:
          - type: "status"
            value: 201
```

## Performance Testing with Data

### Load Testing with Realistic Data

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "basic"
  virtual_users: 200
  ramp_up: "5m"
  duration: "20m"

scenarios:
  - name: "User Registration Load Test"
    weight: 60

    # Large dataset for diverse load testing
    csv_data:
      file: "data/test_users_10k.csv"
      mode: "random"  # Random selection for load testing

    requests:
      - url: "https://api.example.com/register"
        method: POST
        body: |
          {
            "username": "{{csv.username}}_{{faker.number.int({min:1000, max:9999})}}",
            "email": "{{csv.email}}",
            "password": "{{csv.password}}",
            "profile": {
              "first_name": "{{csv.first_name}}",
              "last_name": "{{csv.last_name}}",
              "age": {{csv.age}},
              "country": "{{csv.country}}"
            }
          }

        checks:
          - type: "status"
            value: 201
          - type: "response_time"
            percentile: 95
            threshold: 2000
            description: "95% of registrations under 2s"

  - name: "Profile Update Load Test"
    weight: 40

    csv_data:
      file: "data/existing_users.csv"
      mode: "random"

    requests:
      # Login first
      - url: "https://api.example.com/login"
        method: POST
        body: |
          {
            "email": "{{csv.email}}",
            "password": "{{csv.password}}"
          }

        extract:
          - name: "auth_token"
            type: "json_path"
            expression: "$.token"

        checks:
          - type: "status"
            value: 200

      # Update profile with new data
      - url: "https://api.example.com/profile"
        method: PUT
        headers:
          Authorization: "Bearer {{auth_token}}"
        body: |
          {
            "bio": "{{faker.lorem.paragraph}}",
            "website": "{{faker.internet.url}}",
            "location": "{{csv.country}}",
            "updated_at": "{{date.now}}"
          }

        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            percentile: 90
            threshold: 1500
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('Data-Driven Load Test')
  .baseUrl('https://api.example.com')

  .withLoad({
    pattern: 'basic',
    virtual_users: 200,
    ramp_up: '5m',
    duration: '20m'
  })

  .scenario('User Registration Load Test', 60)
    .withCSV('data/test_users_10k.csv', { mode: 'random' })

    .post('/register')
      .body({
        username: `{{csv.username}}_${faker.number.int({ min: 1000, max: 9999 })}`,
        email: '{{csv.email}}',
        password: '{{csv.password}}',
        profile: {
          first_name: '{{csv.first_name}}',
          last_name: '{{csv.last_name}}',
          age: '{{csv.age}}',
          country: '{{csv.country}}'
        }
      })
      .check('status', 201)
      .check('responseTime', { percentile: 95, threshold: 2000 })

    .done()

  .scenario('Profile Update Load Test', 40)
    .withCSV('data/existing_users.csv', { mode: 'random' })

    .post('/login')
      .body({
        email: '{{csv.email}}',
        password: '{{csv.password}}'
      })
      .extract('auth_token', 'json', '$.token')
      .check('status', 200)

    .put('/profile')
      .header('Authorization', 'Bearer {{auth_token}}')
      .body({
        bio: faker.lorem.paragraph(),
        website: faker.internet.url(),
        location: '{{csv.country}}',
        updated_at: '{{date.now}}'
      })
      .check('status', 200)
      .check('responseTime', { percentile: 90, threshold: 1500 })

    .done()

  .build();
```

<!-- tabs:end -->

This comprehensive data-driven testing example demonstrates how to leverage various data sources, transformation techniques, and realistic data patterns to create robust and maintainable performance tests.
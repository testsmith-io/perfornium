# SOAP Services

This example demonstrates comprehensive SOAP web service testing with Perfornium, including WSDL-based testing, complex data structures, authentication, and performance monitoring for enterprise SOAP services.

## Overview

SOAP service testing covers:
- WSDL-based service discovery
- Complex XML request/response handling
- WS-Security authentication
- Fault handling and error scenarios
- Performance testing of enterprise services
- Data extraction from SOAP responses

## Basic SOAP Service Testing

### Simple SOAP Request

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Calculator SOAP Service Test"

global:
  wsdl_url: "http://webservices.example.com/calculator?wsdl"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 5
  duration: "3m"

scenarios:
  - name: "Basic Calculator Operations"
    steps:
      # Addition operation
      - name: "Add Numbers"
        type: "soap"
        operation: "Add"
        args:
          intA: 10
          intB: 5
        extract:
          - name: "addition_result"
            type: "xpath"
            expression: "//AddResult/text()"
        checks:
          - type: "xpath"
            expression: "//AddResult"
            operator: "exists"
          - type: "response_time"
            value: "<2000"

      # Subtraction operation
      - name: "Subtract Numbers"
        type: "soap"
        operation: "Subtract"
        args:
          intA: 20
          intB: 7
        extract:
          - name: "subtraction_result"
            type: "xpath"
            expression: "//SubtractResult/text()"
        checks:
          - type: "xpath"
            expression: "//SubtractResult/text()"
            value: "13"

      # Multiplication operation
      - name: "Multiply Numbers"
        type: "soap"
        operation: "Multiply"
        args:
          intA: 6
          intB: 7
        checks:
          - type: "xpath"
            expression: "//MultiplyResult/text()"
            value: "42"

report:
  generate: true
  output: "reports/calculator-soap-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Calculator SOAP Service Test')
  .withWSDL('http://webservices.example.com/calculator?wsdl')
  .timeout(30000)
  .scenario('Basic Calculator Operations')
    // Addition operation
    .soap('Add', { intA: 10, intB: 5 })
    .extract('addition_result', '//AddResult/text()', 'xpath')
    .check('xpath', { expression: '//AddResult', operator: 'exists' })
    .check('response_time', '<2000')

    // Subtraction operation
    .soap('Subtract', { intA: 20, intB: 7 })
    .extract('subtraction_result', '//SubtractResult/text()', 'xpath')
    .check('xpath', { expression: '//SubtractResult/text()', value: '13' })

    // Multiplication operation
    .soap('Multiply', { intA: 6, intB: 7 })
    .check('xpath', { expression: '//MultiplyResult/text()', value: '42' })
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '3m'
  })
  .withReport('reports/calculator-soap-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Complex Data Structure Testing

### Enterprise Customer Management

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Customer Management SOAP Test"

global:
  wsdl_url: "http://erp.example.com/CustomerService?wsdl"
  timeout: 60000

load:
  pattern: "basic"
  virtual_users: 10
  ramp_up: "30s"
  duration: "5m"

scenarios:
  - name: "Customer Management Operations"
    variables:
      customer_id: "{{faker.string.uuid}}"

    steps:
      # Create customer with complex structure
      - name: "Create Customer"
        type: "soap"
        operation: "CreateCustomer"
        args:
          customerRequest:
            customerId: "{{customer_id}}"
            personalInfo:
              firstName: "{{faker.person.firstName}}"
              lastName: "{{faker.person.lastName}}"
              dateOfBirth: "1985-06-15"
            contactInfo:
              primaryEmail: "{{faker.internet.email}}"
              phones:
                - phoneType: "HOME"
                  phoneNumber: "{{faker.phone.number}}"
                  isPrimary: true
                - phoneType: "MOBILE"
                  phoneNumber: "{{faker.phone.number}}"
                  isPrimary: false
            addresses:
              - addressType: "BILLING"
                street1: "{{faker.location.streetAddress}}"
                city: "{{faker.location.city}}"
                state: "{{faker.location.state}}"
                zipCode: "{{faker.location.zipCode}}"
                country: "US"
                isPrimary: true
        extract:
          - name: "created_customer_id"
            type: "xpath"
            expression: "//CreateCustomerResult/CustomerId/text()"
          - name: "customer_status"
            type: "xpath"
            expression: "//CreateCustomerResult/Status/text()"
        checks:
          - type: "xpath"
            expression: "//CreateCustomerResult/Status/text()"
            value: "SUCCESS"
          - type: "response_time"
            value: "<5000"

      # Retrieve customer details
      - name: "Get Customer"
        type: "soap"
        operation: "GetCustomer"
        args:
          customerId: "{{created_customer_id}}"
          includeHistory: true
        extract:
          - name: "customer_full_name"
            type: "xpath"
            expression: "concat(//Customer/PersonalInfo/FirstName/text(), ' ', //Customer/PersonalInfo/LastName/text())"
          - name: "primary_email"
            type: "xpath"
            expression: "//Customer/ContactInfo/PrimaryEmail/text()"
        checks:
          - type: "xpath"
            expression: "//Customer/CustomerId/text()"
            value: "{{created_customer_id}}"
          - type: "xpath"
            expression: "//Customer/Status/text()"
            value: "ACTIVE"

      # Update customer preferences
      - name: "Update Customer"
        type: "soap"
        operation: "UpdateCustomerPreferences"
        args:
          customerId: "{{created_customer_id}}"
          preferences:
            communicationPreferences:
              emailOptIn: false
              smsOptIn: true
        checks:
          - type: "xpath"
            expression: "//UpdateResult/Success/text()"
            value: "true"

report:
  generate: true
  output: "reports/customer-soap-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('Customer Management SOAP Test')
  .withWSDL('http://erp.example.com/CustomerService?wsdl')
  .timeout(60000)
  .scenario('Customer Management Operations')
    .variables({ customer_id: faker.string.uuid() })

    // Create customer with complex structure
    .soap('CreateCustomer', {
      customerRequest: {
        customerId: '{{customer_id}}',
        personalInfo: {
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          dateOfBirth: '1985-06-15'
        },
        contactInfo: {
          primaryEmail: faker.internet.email(),
          phones: [
            { phoneType: 'HOME', phoneNumber: faker.phone.number(), isPrimary: true },
            { phoneType: 'MOBILE', phoneNumber: faker.phone.number(), isPrimary: false }
          ]
        },
        addresses: [{
          addressType: 'BILLING',
          street1: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zipCode: faker.location.zipCode(),
          country: 'US',
          isPrimary: true
        }]
      }
    })
    .extract('created_customer_id', '//CreateCustomerResult/CustomerId/text()', 'xpath')
    .extract('customer_status', '//CreateCustomerResult/Status/text()', 'xpath')
    .check('xpath', { expression: '//CreateCustomerResult/Status/text()', value: 'SUCCESS' })
    .check('response_time', '<5000')

    // Retrieve customer details
    .soap('GetCustomer', {
      customerId: '{{created_customer_id}}',
      includeHistory: true
    })
    .extract('customer_full_name', "concat(//Customer/PersonalInfo/FirstName/text(), ' ', //Customer/PersonalInfo/LastName/text())", 'xpath')
    .extract('primary_email', '//Customer/ContactInfo/PrimaryEmail/text()', 'xpath')
    .check('xpath', { expression: '//Customer/CustomerId/text()', value: '{{created_customer_id}}' })
    .check('xpath', { expression: '//Customer/Status/text()', value: 'ACTIVE' })

    // Update customer preferences
    .soap('UpdateCustomerPreferences', {
      customerId: '{{created_customer_id}}',
      preferences: {
        communicationPreferences: {
          emailOptIn: false,
          smsOptIn: true
        }
      }
    })
    .check('xpath', { expression: '//UpdateResult/Success/text()', value: 'true' })
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 10,
    ramp_up: '30s',
    duration: '5m'
  })
  .withReport('reports/customer-soap-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Error Handling and Fault Testing

### SOAP Fault Scenarios

<!-- tabs:start -->

#### **YAML**

```yaml
name: "SOAP Error Handling Test"

global:
  wsdl_url: "http://api.example.com/ValidationService?wsdl"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 5
  duration: "3m"

scenarios:
  - name: "Error Handling and Fault Testing"
    steps:
      # Test invalid input validation
      - name: "Invalid Data Test"
        type: "soap"
        operation: "ValidateCustomerData"
        args:
          customerData:
            email: "invalid-email-format"
            phoneNumber: "abc123"
            ssn: "invalid-ssn"
        checks:
          - type: "soap_fault"
            expected: true
          - type: "xpath"
            expression: "//soap:Fault/faultcode/text()"
            value: "Client"
          - type: "xpath"
            expression: "//soap:Fault/faultstring"
            operator: "contains"
            expected: "validation"
        on_error:
          continue: true

      # Test business logic errors
      - name: "Closed Account Test"
        type: "soap"
        operation: "ProcessPayment"
        args:
          paymentRequest:
            accountNumber: "CLOSED_ACCOUNT_123"
            amount: 1000.00
            currency: "USD"
        checks:
          - type: "soap_fault"
            expected: true
          - type: "xpath"
            expression: "//soap:Fault/detail/BusinessError/ErrorCode/text()"
            value: "ACCOUNT_CLOSED"
        on_error:
          continue: true

      # Test authorization errors
      - name: "Unauthorized Access Test"
        type: "soap"
        operation: "AccessRestrictedData"
        args:
          dataRequest:
            resourceId: "CONFIDENTIAL_RESOURCE"
            accessLevel: "READ"
        checks:
          - type: "soap_fault"
            expected: true
          - type: "xpath"
            expression: "//soap:Fault/detail/SecurityError/ErrorType/text()"
            value: "INSUFFICIENT_PRIVILEGES"
        on_error:
          continue: true

report:
  generate: true
  output: "reports/soap-error-handling-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('SOAP Error Handling Test')
  .withWSDL('http://api.example.com/ValidationService?wsdl')
  .timeout(30000)
  .scenario('Error Handling and Fault Testing')
    // Test invalid input validation
    .soap('ValidateCustomerData', {
      customerData: {
        email: 'invalid-email-format',
        phoneNumber: 'abc123',
        ssn: 'invalid-ssn'
      }
    })
    .check('soap_fault', true)
    .check('xpath', { expression: '//soap:Fault/faultcode/text()', value: 'Client' })
    .check('xpath', { expression: '//soap:Fault/faultstring', operator: 'contains', expected: 'validation' })

    // Test business logic errors
    .soap('ProcessPayment', {
      paymentRequest: {
        accountNumber: 'CLOSED_ACCOUNT_123',
        amount: 1000.00,
        currency: 'USD'
      }
    })
    .check('soap_fault', true)
    .check('xpath', { expression: '//soap:Fault/detail/BusinessError/ErrorCode/text()', value: 'ACCOUNT_CLOSED' })

    // Test authorization errors
    .soap('AccessRestrictedData', {
      dataRequest: {
        resourceId: 'CONFIDENTIAL_RESOURCE',
        accessLevel: 'READ'
      }
    })
    .check('soap_fault', true)
    .check('xpath', { expression: '//soap:Fault/detail/SecurityError/ErrorType/text()', value: 'INSUFFICIENT_PRIVILEGES' })
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '3m'
  })
  .withReport('reports/soap-error-handling-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Performance Testing SOAP Services

### Load Testing Enterprise Services

<!-- tabs:start -->

#### **YAML**

```yaml
name: "SOAP Service Load Test"

global:
  wsdl_url: "http://erp.example.com/CustomerService?wsdl"
  timeout: 30000

load:
  pattern: "stepping"
  start_users: 5
  step_users: 5
  step_duration: "2m"
  max_users: 50
  hold_final: "3m"

scenarios:
  - name: "Customer Service Load Test"
    weight: 70
    csv_data:
      file: "data/customer_accounts.csv"
      mode: "shared"
    steps:
      # Realistic customer lookup pattern
      - name: "Get Customer"
        type: "soap"
        operation: "GetCustomerById"
        args:
          customerId: "{{csv.customer_id}}"
          includeDetails: true
        extract:
          - name: "customer_status"
            type: "xpath"
            expression: "//Customer/Status/text()"
        checks:
          - type: "xpath"
            expression: "//Customer"
            operator: "exists"
          - type: "response_time"
            value: "<3000"
            description: "95% of lookups under 3 seconds"

      # Update customer information
      - name: "Update Contact"
        type: "soap"
        operation: "UpdateCustomerContact"
        args:
          customerId: "{{csv.customer_id}}"
          contactInfo:
            primaryEmail: "updated_{{faker.internet.email}}"
            phoneNumber: "{{faker.phone.number}}"
        checks:
          - type: "xpath"
            expression: "//UpdateResult/Success/text()"
            value: "true"
          - type: "response_time"
            value: "<4000"

  - name: "Account Balance Inquiries"
    weight: 30
    steps:
      - name: "Get Balance"
        type: "soap"
        operation: "GetAccountBalance"
        args:
          accountNumber: "{{csv.account_number}}"
          includeHistory: false
        extract:
          - name: "current_balance"
            type: "xpath"
            expression: "//AccountBalance/CurrentBalance/text()"
        checks:
          - type: "xpath"
            expression: "//AccountBalance/CurrentBalance"
            operator: "exists"
          - type: "response_time"
            value: "<2000"

outputs:
  - type: "json"
    file: "results/soap-load-test-{{timestamp}}.json"
  - type: "csv"
    file: "results/soap-load-test-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/soap-load-test-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('SOAP Service Load Test')
  .withWSDL('http://erp.example.com/CustomerService?wsdl')
  .timeout(30000)

  .scenario('Customer Service Load Test', 70)
    .withCSV('data/customer_accounts.csv', { mode: 'shared' })

    // Realistic customer lookup pattern
    .soap('GetCustomerById', {
      customerId: '{{csv.customer_id}}',
      includeDetails: true
    })
    .extract('customer_status', '//Customer/Status/text()', 'xpath')
    .check('xpath', { expression: '//Customer', operator: 'exists' })
    .check('response_time', '<3000', '95% of lookups under 3 seconds')

    // Update customer information
    .soap('UpdateCustomerContact', {
      customerId: '{{csv.customer_id}}',
      contactInfo: {
        primaryEmail: `updated_${faker.internet.email()}`,
        phoneNumber: faker.phone.number()
      }
    })
    .check('xpath', { expression: '//UpdateResult/Success/text()', value: 'true' })
    .check('response_time', '<4000')
    .done()

  .scenario('Account Balance Inquiries', 30)
    .soap('GetAccountBalance', {
      accountNumber: '{{csv.account_number}}',
      includeHistory: false
    })
    .extract('current_balance', '//AccountBalance/CurrentBalance/text()', 'xpath')
    .check('xpath', { expression: '//AccountBalance/CurrentBalance', operator: 'exists' })
    .check('response_time', '<2000')
    .done()

  .withLoad({
    pattern: 'stepping',
    start_users: 5,
    step_users: 5,
    step_duration: '2m',
    max_users: 50,
    hold_final: '3m'
  })
  .withJSONOutput('results/soap-load-test-{{timestamp}}.json')
  .withCSVOutput('results/soap-load-test-{{timestamp}}.csv')
  .withReport('reports/soap-load-test-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Multi-Service Integration Testing

### End-to-End Business Process

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Multi-Service Integration Test"

global:
  timeout: 60000

load:
  pattern: "basic"
  virtual_users: 5
  duration: "5m"

scenarios:
  - name: "End-to-End Business Process"
    steps:
      # Step 1: Create customer in CRM system
      - name: "Create Customer in CRM"
        type: "soap"
        wsdl: "http://crm.example.com/CustomerService?wsdl"
        operation: "CreateCustomer"
        args:
          customerData:
            firstName: "{{faker.person.firstName}}"
            lastName: "{{faker.person.lastName}}"
            email: "{{faker.internet.email}}"
            source: "INTEGRATION_TEST"
        extract:
          - name: "crm_customer_id"
            type: "xpath"
            expression: "//CustomerResult/CustomerId/text()"
        checks:
          - type: "xpath"
            expression: "//CustomerResult/Status/text()"
            value: "CREATED"

      # Step 2: Create account in banking system
      - name: "Open Bank Account"
        type: "soap"
        wsdl: "http://banking.example.com/AccountService?wsdl"
        operation: "OpenAccount"
        args:
          accountRequest:
            customerId: "{{crm_customer_id}}"
            accountType: "CHECKING"
            initialDeposit: 1000.00
            currency: "USD"
        extract:
          - name: "account_number"
            type: "xpath"
            expression: "//AccountResult/AccountNumber/text()"
          - name: "routing_number"
            type: "xpath"
            expression: "//AccountResult/RoutingNumber/text()"
        checks:
          - type: "xpath"
            expression: "//AccountResult/Status/text()"
            value: "ACTIVE"
          - type: "response_time"
            value: "<8000"

      # Step 3: Link account to customer profile
      - name: "Link Account"
        type: "soap"
        wsdl: "http://crm.example.com/CustomerService?wsdl"
        operation: "LinkAccountToCustomer"
        args:
          linkRequest:
            customerId: "{{crm_customer_id}}"
            accountNumber: "{{account_number}}"
            accountType: "PRIMARY_CHECKING"
            isActive: true
        checks:
          - type: "xpath"
            expression: "//LinkResult/Success/text()"
            value: "true"

      # Step 4: Send welcome notification
      - name: "Send Welcome Email"
        type: "soap"
        wsdl: "http://notification.example.com/NotificationService?wsdl"
        operation: "SendWelcomeNotification"
        args:
          notification:
            customerId: "{{crm_customer_id}}"
            notificationType: "WELCOME_PACKAGE"
            deliveryMethod: "EMAIL"
            templateData:
              accountNumber: "{{account_number}}"
              routingNumber: "{{routing_number}}"
        checks:
          - type: "xpath"
            expression: "//NotificationResult/Status/text()"
            value: "SENT"

report:
  generate: true
  output: "reports/multi-service-integration-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('Multi-Service Integration Test')
  .timeout(60000)
  .scenario('End-to-End Business Process')
    // Step 1: Create customer in CRM system
    .soap('CreateCustomer', {
      customerData: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        source: 'INTEGRATION_TEST'
      }
    }, 'http://crm.example.com/CustomerService?wsdl')
    .extract('crm_customer_id', '//CustomerResult/CustomerId/text()', 'xpath')
    .check('xpath', { expression: '//CustomerResult/Status/text()', value: 'CREATED' })

    // Step 2: Create account in banking system
    .soap('OpenAccount', {
      accountRequest: {
        customerId: '{{crm_customer_id}}',
        accountType: 'CHECKING',
        initialDeposit: 1000.00,
        currency: 'USD'
      }
    }, 'http://banking.example.com/AccountService?wsdl')
    .extract('account_number', '//AccountResult/AccountNumber/text()', 'xpath')
    .extract('routing_number', '//AccountResult/RoutingNumber/text()', 'xpath')
    .check('xpath', { expression: '//AccountResult/Status/text()', value: 'ACTIVE' })
    .check('response_time', '<8000')

    // Step 3: Link account to customer profile
    .soap('LinkAccountToCustomer', {
      linkRequest: {
        customerId: '{{crm_customer_id}}',
        accountNumber: '{{account_number}}',
        accountType: 'PRIMARY_CHECKING',
        isActive: true
      }
    }, 'http://crm.example.com/CustomerService?wsdl')
    .check('xpath', { expression: '//LinkResult/Success/text()', value: 'true' })

    // Step 4: Send welcome notification
    .soap('SendWelcomeNotification', {
      notification: {
        customerId: '{{crm_customer_id}}',
        notificationType: 'WELCOME_PACKAGE',
        deliveryMethod: 'EMAIL',
        templateData: {
          accountNumber: '{{account_number}}',
          routingNumber: '{{routing_number}}'
        }
      }
    }, 'http://notification.example.com/NotificationService?wsdl')
    .check('xpath', { expression: '//NotificationResult/Status/text()', value: 'SENT' })
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '5m'
  })
  .withReport('reports/multi-service-integration-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Key Learning Points

### 1. SOAP Configuration
- Use `withWSDL()` to configure the service endpoint
- Set appropriate timeouts for enterprise services
- Handle complex nested data structures

### 2. Operations and Arguments
- `.soap()` method for SOAP operations
- Pass complex nested objects as arguments
- Support for arrays and nested structures

### 3. XPath Extraction
- Use XPath expressions to extract response data
- Extract multiple values from a single response
- Use namespaces when required

### 4. Error Handling
- Test SOAP faults and error scenarios
- Validate fault codes and messages
- Use `on_error.continue` to continue after expected faults

### 5. Multi-Service Testing
- Test end-to-end business processes
- Pass data between different SOAP services
- Verify integration points and data flow

### 6. Best Practices
- Use descriptive operation names
- Include response time checks for SLA compliance
- Test both success and failure scenarios
- Generate reports for stakeholder communication

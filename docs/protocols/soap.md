# SOAP Web Services Testing

The SOAP protocol handler in Perfornium provides comprehensive support for testing SOAP web services with WSDL integration, custom envelopes, and advanced XML processing capabilities.

## Basic SOAP Configuration

### Simple SOAP Request

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Calculator Add Operation"
    type: "soap"
    wsdl: "http://www.dneonline.com/calculator.asmx?WSDL"
    operation: "Add"
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <Add xmlns="http://tempuri.org/">
            <intA>{{a}}</intA>
            <intB>{{b}}</intB>
          </Add>
        </soap:Body>
      </soap:Envelope>
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('SOAP Calculator Test')
  .scenario('Calculator Add Operation')
    .withWSDL('http://www.dneonline.com/calculator.asmx?WSDL')
    .soap('Add', {
      envelope: `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <Add xmlns="http://tempuri.org/">
              <intA>{{a}}</intA>
              <intB>{{b}}</intB>
            </Add>
          </soap:Body>
        </soap:Envelope>
      `
    })
    .done()
  .build();
```

<!-- tabs:end -->

### SOAP with Authentication

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Authenticated SOAP Call"
    type: "soap"
    wsdl: "https://example.com/service?WSDL"
    operation: "GetUserInfo"
    headers:
      SOAPAction: "http://example.com/GetUserInfo"
      Authorization: "Basic {{base64(username + ':' + password)}}"
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Header>
          <AuthHeader xmlns="http://example.com/">
            <Username>{{username}}</Username>
            <Password>{{password}}</Password>
          </AuthHeader>
        </soap:Header>
        <soap:Body>
          <GetUserInfo xmlns="http://example.com/">
            <UserId>{{user_id}}</UserId>
          </GetUserInfo>
        </soap:Body>
      </soap:Envelope>
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Authenticated SOAP Test')
  .scenario('Authenticated SOAP Call')
    .withWSDL('https://example.com/service?WSDL')
    .soap('GetUserInfo', {
      headers: {
        SOAPAction: 'http://example.com/GetUserInfo',
        Authorization: 'Basic {{base64(username + ":" + password)}}'
      },
      envelope: `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Header>
            <AuthHeader xmlns="http://example.com/">
              <Username>{{username}}</Username>
              <Password>{{password}}</Password>
            </AuthHeader>
          </soap:Header>
          <soap:Body>
            <GetUserInfo xmlns="http://example.com/">
              <UserId>{{user_id}}</UserId>
            </GetUserInfo>
          </soap:Body>
        </soap:Envelope>
      `
    })
    .done()
  .build();
```

<!-- tabs:end -->

## WSDL Integration

### Automatic WSDL Parsing

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Auto-generated from WSDL"
    type: "soap"
    wsdl: "http://example.com/service.wsdl"
    operation: "ProcessOrder"
    parameters:
      orderId: "{{order_id}}"
      customerName: "{{customer_name}}"
      items:
        - productId: "{{product_1}}"
          quantity: 2
        - productId: "{{product_2}}"
          quantity: 1
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('WSDL Auto-generated Test')
  .scenario('Auto-generated from WSDL')
    .withWSDL('http://example.com/service.wsdl')
    .soap('ProcessOrder', {
      parameters: {
        orderId: '{{order_id}}',
        customerName: '{{customer_name}}',
        items: [
          { productId: '{{product_1}}', quantity: 2 },
          { productId: '{{product_2}}', quantity: 1 }
        ]
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### WSDL with Binding Selection

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Specific Binding"
    type: "soap"
    wsdl: "http://example.com/multiport.wsdl"
    binding: "OrderServiceSoap12"
    operation: "CreateOrder"
    parameters:
      order:
        customerId: "{{customer_id}}"
        orderDate: "{{current_date}}"
        items: "{{items_array}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('SOAP Binding Test')
  .scenario('Specific Binding')
    .withWSDL('http://example.com/multiport.wsdl')
    .soap('CreateOrder', {
      binding: 'OrderServiceSoap12',
      parameters: {
        order: {
          customerId: '{{customer_id}}',
          orderDate: '{{current_date}}',
          items: '{{items_array}}'
        }
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### Local WSDL Files

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Local WSDL"
    type: "soap"
    wsdl: "file://./wsdl/OrderService.wsdl"
    operation: "UpdateOrder"
    parameters:
      orderId: "{{order_id}}"
      status: "shipped"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Local WSDL Test')
  .scenario('Local WSDL')
    .withWSDL('file://./wsdl/OrderService.wsdl')
    .soap('UpdateOrder', {
      parameters: {
        orderId: '{{order_id}}',
        status: 'shipped'
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

## Custom SOAP Envelopes

### Full Custom Envelope

```yaml
steps:
  - name: "Custom SOAP Envelope"
    type: "soap"
    endpoint: "http://example.com/soap"
    headers:
      Content-Type: "text/xml; charset=utf-8"
      SOAPAction: "http://example.com/ProcessPayment"
    envelope: |
      <?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope 
        xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:pay="http://example.com/payment">
        <soap:Header>
          <pay:Security>
            <pay:Token>{{security_token}}</pay:Token>
          </pay:Security>
        </soap:Header>
        <soap:Body>
          <pay:ProcessPayment>
            <pay:Amount>{{amount}}</pay:Amount>
            <pay:Currency>{{currency}}</pay:Currency>
            <pay:CardNumber>{{card_number}}</pay:CardNumber>
            <pay:ExpiryDate>{{expiry_date}}</pay:ExpiryDate>
          </pay:ProcessPayment>
        </soap:Body>
      </soap:Envelope>
```

### Template-based Envelopes

```yaml
scenarios:
  - name: "Order Processing"
    variables:
      namespace: "http://example.com/orders"
      service_version: "1.2"
    steps:
      - name: "Create Order"
        type: "soap"
        endpoint: "{{base_url}}/OrderService"
        envelope: |
          <soap:Envelope 
            xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:ord="{{namespace}}">
            <soap:Header>
              <ord:ServiceVersion>{{service_version}}</ord:ServiceVersion>
            </soap:Header>
            <soap:Body>
              <ord:CreateOrder>
                <ord:CustomerInfo>
                  <ord:CustomerId>{{customer_id}}</ord:CustomerId>
                  <ord:Name>{{customer_name}}</ord:Name>
                </ord:CustomerInfo>
                <ord:OrderItems>
                  {{#each items}}
                  <ord:Item>
                    <ord:ProductId>{{productId}}</ord:ProductId>
                    <ord:Quantity>{{quantity}}</ord:Quantity>
                    <ord:Price>{{price}}</ord:Price>
                  </ord:Item>
                  {{/each}}
                </ord:OrderItems>
              </ord:CreateOrder>
            </soap:Body>
          </soap:Envelope>
```

## SOAP Headers and Security

### WS-Security Username Token

```yaml
steps:
  - name: "WS-Security Authentication"
    type: "soap"
    wsdl: "https://secure.example.com/service?WSDL"
    operation: "SecureOperation"
    security:
      type: "username_token"
      username: "{{username}}"
      password: "{{password}}"
      password_type: "digest"  # or "text"
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <SecureOperation xmlns="http://secure.example.com/">
            <Data>{{sensitive_data}}</Data>
          </SecureOperation>
        </soap:Body>
      </soap:Envelope>
```

### Custom Security Headers

```yaml
steps:
  - name: "Custom Security"
    type: "soap"
    endpoint: "https://api.example.com/soap"
    envelope: |
      <soap:Envelope 
        xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:sec="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
        <soap:Header>
          <sec:Security>
            <sec:UsernameToken>
              <sec:Username>{{username}}</sec:Username>
              <sec:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{{password_digest}}</sec:Password>
              <sec:Nonce>{{nonce}}</sec:Nonce>
              <sec:Created>{{created_timestamp}}</sec:Created>
            </sec:UsernameToken>
          </sec:Security>
        </soap:Header>
        <soap:Body>
          <GetSecureData xmlns="http://example.com/">
            <RequestId>{{request_id}}</RequestId>
          </GetSecureData>
        </soap:Body>
      </soap:Envelope>
```

### SAML Token Authentication

```yaml
scenarios:
  - name: "SAML Authentication"
    hooks:
      beforeScenario: |
        // Get SAML token from identity provider
        const response = await fetch('https://idp.example.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: context.variables.username,
            password: context.variables.password
          })
        });
        const data = await response.json();
        context.variables.saml_token = data.saml_token;
    steps:
      - name: "SAML Authenticated Call"
        type: "soap"
        endpoint: "https://api.example.com/soap"
        envelope: |
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Header>
              <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
                {{saml_token}}
              </saml:Assertion>
            </soap:Header>
            <soap:Body>
              <GetProtectedResource xmlns="http://example.com/">
                <ResourceId>{{resource_id}}</ResourceId>
              </GetProtectedResource>
            </soap:Body>
          </soap:Envelope>
```

## Response Processing

### XML Path Validation

```yaml
checks:
  - type: "xpath"
    expression: "//soap:Body/response/status"
    expected: "success"
    description: "Operation should succeed"
    
  - type: "xpath"
    expression: "//soap:Body/response/data/user/@id"
    operator: "exists"
    description: "User ID should be present"
    
  - type: "xpath"
    expression: "count(//soap:Body/response/items/item)"
    operator: ">"
    expected: 0
    description: "Should return at least one item"
```

### XML Namespace Handling

```yaml
checks:
  - type: "xpath"
    expression: "//ord:CreateOrderResponse/ord:OrderId"
    namespaces:
      ord: "http://example.com/orders"
      soap: "http://schemas.xmlsoap.org/soap/envelope/"
    description: "Should return order ID"
```

### SOAP Fault Detection

```yaml
checks:
  - type: "soap_fault"
    should_exist: false
    description: "Request should not return SOAP fault"
    
  - type: "xpath"
    expression: "//soap:Fault/faultcode"
    should_not_exist: true
    description: "No fault code should be present"
```

## Data Extraction

### XPath Extraction

```yaml
extract:
  - name: "order_id"
    type: "xpath"
    expression: "//soap:Body/CreateOrderResponse/OrderId/text()"
    namespaces:
      soap: "http://schemas.xmlsoap.org/soap/envelope/"
    
  - name: "user_details"
    type: "xpath"
    expression: "//GetUserResponse/User"
    return_type: "xml"  # Returns XML fragment
    
  - name: "item_count"
    type: "xpath"
    expression: "count(//Items/Item)"
    return_type: "number"
```

### Attribute Extraction

```yaml
extract:
  - name: "session_id"
    type: "xpath"
    expression: "//Response/@sessionId"
    
  - name: "all_product_ids"
    type: "xpath"
    expression: "//Product/@id"
    return_type: "array"
```

### Custom XML Processing

```yaml
extract:
  - name: "processed_response"
    type: "custom"
    script: |
      const DOMParser = require('xmldom').DOMParser;
      const doc = new DOMParser().parseFromString(result.body, 'text/xml');
      const items = doc.getElementsByTagName('Item');
      const processedItems = [];
      for (let i = 0; i < items.length; i++) {
        processedItems.push({
          id: items[i].getAttribute('id'),
          name: items[i].textContent,
          order: i + 1
        });
      }
      return processedItems;
```

## Advanced SOAP Features

### Attachments (MTOM/SwA)

```yaml
steps:
  - name: "SOAP with Attachment"
    type: "soap"
    wsdl: "http://example.com/fileservice?WSDL"
    operation: "UploadFile"
    attachments:
      - name: "document"
        path: "test-data/document.pdf"
        content_type: "application/pdf"
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <UploadFile xmlns="http://example.com/fileservice">
            <FileName>{{file_name}}</FileName>
            <FileData>
              <xop:Include href="cid:document" xmlns:xop="http://www.w3.org/2004/08/xop/include"/>
            </FileData>
          </UploadFile>
        </soap:Body>
      </soap:Envelope>
```

### Compression Support

```yaml
steps:
  - name: "Compressed SOAP Request"
    type: "soap"
    endpoint: "http://example.com/soap"
    headers:
      Content-Encoding: "gzip"
      Accept-Encoding: "gzip, deflate"
    compression: true
    envelope: |
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <LargeDataOperation xmlns="http://example.com/">
            <Data>{{large_data_set}}</Data>
          </LargeDataOperation>
        </soap:Body>
      </soap:Envelope>
```

### Connection Configuration

```yaml
global:
  soap:
    timeout: 60000
    keep_alive: true
    connection_pool_size: 10
    wsdl_cache: true
    wsdl_cache_ttl: 3600  # 1 hour

steps:
  - name: "Optimized SOAP Call"
    type: "soap"
    wsdl: "http://example.com/service?WSDL"
    operation: "BulkOperation"
    parameters:
      items: "{{bulk_items}}"
```

## Error Handling

### SOAP Fault Handling

```yaml
steps:
  - name: "Handle SOAP Faults"
    type: "soap"
    wsdl: "http://example.com/service?WSDL"
    operation: "RiskyOperation"
    on_soap_fault:
      extract_fault_details: true
      continue_on_fault: false
    extract:
      - name: "fault_code"
        type: "xpath"
        expression: "//soap:Fault/faultcode/text()"
        condition: "soap_fault_occurred"
      - name: "fault_string"
        type: "xpath"
        expression: "//soap:Fault/faultstring/text()"
        condition: "soap_fault_occurred"
```

### Retry Configuration

```yaml
steps:
  - name: "Reliable SOAP Call"
    type: "soap"
    wsdl: "http://unreliable.example.com/service?WSDL"
    operation: "ImportantOperation"
    retry:
      count: 3
      delay: "2s"
      on_soap_fault: true
      on_timeout: true
    parameters:
      data: "{{critical_data}}"
```

## Performance Optimization

### WSDL Caching

```yaml
global:
  soap:
    wsdl_cache_enabled: true
    wsdl_cache_directory: "./cache/wsdl"
    wsdl_cache_max_age: 86400  # 24 hours
```

### Connection Pooling

```yaml
global:
  soap:
    connection_pool:
      max_connections: 50
      max_idle_time: 300000  # 5 minutes
      keep_alive: true
```

### Batch Operations

```yaml
scenarios:
  - name: "Bulk SOAP Operations"
    steps:
      - name: "Batch Process"
        type: "soap"
        wsdl: "http://example.com/batch?WSDL"
        operation: "ProcessBatch"
        parameters:
          batchId: "{{batch_id}}"
          items:
            - id: "{{item_1_id}}"
              data: "{{item_1_data}}"
            - id: "{{item_2_id}}"
              data: "{{item_2_data}}"
            - id: "{{item_3_id}}"
              data: "{{item_3_data}}"
```

## Data-Driven SOAP Testing

### CSV Data with SOAP

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "Customer Data Processing"
    csv_data:
      file: "test-data/customers.csv"
      mode: "sequential"
    steps:
      - name: "Process Customer"
        type: "soap"
        wsdl: "http://crm.example.com/service?WSDL"
        operation: "UpdateCustomer"
        parameters:
          customerId: "{{customer_id}}"
          personalInfo:
            firstName: "{{first_name}}"
            lastName: "{{last_name}}"
            email: "{{email}}"
          address:
            street: "{{street}}"
            city: "{{city}}"
            zipCode: "{{zip_code}}"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Customer Data Processing Test')
  .scenario('Customer Data Processing')
    .withCSVData({
      file: 'test-data/customers.csv',
      mode: 'sequential'
    })
    .withWSDL('http://crm.example.com/service?WSDL')
    .soap('UpdateCustomer', {
      parameters: {
        customerId: '{{customer_id}}',
        personalInfo: {
          firstName: '{{first_name}}',
          lastName: '{{last_name}}',
          email: '{{email}}'
        },
        address: {
          street: '{{street}}',
          city: '{{city}}',
          zipCode: '{{zip_code}}'
        }
      }
    })
    .done()
  .build();
```

<!-- tabs:end -->

### Dynamic SOAP Envelope Generation

```yaml
steps:
  - name: "Dynamic Order Processing"
    type: "soap"
    endpoint: "http://orders.example.com/soap"
    envelope_template: "order_template.xml"
    template_data:
      order_id: "{{order_id}}"
      customer: "{{customer_data}}"
      items: "{{order_items}}"
      shipping: "{{shipping_info}}"
```

## Best Practices

### 1. WSDL Management

```yaml
# Use local WSDL files for better performance and reliability
global:
  soap:
    wsdl_directory: "./wsdl"
    
steps:
  - name: "Local WSDL Usage"
    type: "soap"
    wsdl: "file://./wsdl/ProductService.wsdl"
    operation: "GetProduct"
```

### 2. Error Handling Strategy

```yaml
steps:
  - name: "Robust SOAP Call"
    type: "soap"
    wsdl: "http://service.example.com?WSDL"
    operation: "CriticalOperation"
    checks:
      - type: "soap_fault"
        should_exist: false
      - type: "status"
        value: 200
      - type: "xpath"
        expression: "//OperationResponse/Status"
        expected: "Success"
    on_error:
      log_full_response: true
      continue: false
```

### 3. Namespace Management

```yaml
# Define namespaces globally for reuse
global:
  soap:
    namespaces:
      ord: "http://example.com/orders"
      cust: "http://example.com/customers"
      prod: "http://example.com/products"
```

### 4. Security Best Practices

```yaml
global:
  soap:
    security:
      validate_certificates: true
      client_certificate: "certs/client.p12"
      client_certificate_password: "{{cert_password}}"
    
steps:
  - name: "Secure SOAP Call"
    type: "soap"
    endpoint: "https://secure-api.example.com/soap"
    security:
      type: "certificate"
```

This SOAP protocol documentation covers comprehensive SOAP web service testing capabilities in Perfornium, from basic operations to advanced security and performance optimizations.
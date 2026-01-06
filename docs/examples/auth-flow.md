# Authentication Flow

This example demonstrates how to test complete authentication flows in Perfornium, including login, token refresh, session management, and various authentication patterns commonly used in modern applications.

## Overview

Authentication flow testing covers:
- User login and logout
- Token-based authentication (JWT, OAuth)
- Session management
- Multi-factor authentication
- SSO integration
- Authentication error handling

## Basic Login Flow

### Simple Username/Password Login

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "User Login Flow"
    requests:
      # Login request
      - url: "https://api.example.com/auth/login"
        method: POST
        headers:
          Content-Type: "application/json"
        body: |
          {
            "username": "testuser@example.com",
            "password": "testpassword123"
          }

        # Extract authentication token
        extract:
          - name: "auth_token"
            type: "json_path"
            expression: "$.token"
          - name: "user_id"
            type: "json_path"
            expression: "$.user.id"
          - name: "expires_at"
            type: "json_path"
            expression: "$.expires_at"

        # Validate login response
        checks:
          - type: "status"
            value: 200
            description: "Login should succeed"
          - type: "json_path"
            expression: "$.token"
            exists: true
            description: "Token should be present"
          - type: "response_time"
            threshold: 2000
            description: "Login should be fast"

      # Use token for authenticated request
      - url: "https://api.example.com/user/profile"
        method: GET
        headers:
          Authorization: "Bearer {{auth_token}}"

        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.id"
            value: "{{user_id}}"

        # Extract profile data
        extract:
          - name: "user_name"
            type: "json_path"
            expression: "$.name"

      # Update profile (authenticated operation)
      - url: "https://api.example.com/user/profile"
        method: PUT
        headers:
          Authorization: "Bearer {{auth_token}}"
          Content-Type: "application/json"
        body: |
          {
            "name": "{{user_name}} - Updated"
          }

        checks:
          - type: "status"
            value: 200

      # Logout
      - url: "https://api.example.com/auth/logout"
        method: POST
        headers:
          Authorization: "Bearer {{auth_token}}"

        checks:
          - type: "status"
            value: 204
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('User Login Flow')
  .baseUrl('https://api.example.com')

  .scenario('User Login Flow', 100)
    // Login request
    .post('/auth/login')
      .header('Content-Type', 'application/json')
      .body({
        username: 'testuser@example.com',
        password: 'testpassword123'
      })
      .extract('auth_token', 'json', '$.token')
      .extract('user_id', 'json', '$.user.id')
      .extract('expires_at', 'json', '$.expires_at')
      .check('status', 200)
      .check('jsonPath', '$.token', { exists: true })
      .check('responseTime', 2000)

    // Use token for authenticated request
    .get('/user/profile')
      .header('Authorization', 'Bearer {{auth_token}}')
      .check('status', 200)
      .check('jsonPath', '$.id', { value: '{{user_id}}' })
      .extract('user_name', 'json', '$.name')

    // Update profile
    .put('/user/profile')
      .header('Authorization', 'Bearer {{auth_token}}')
      .header('Content-Type', 'application/json')
      .body({ name: '{{user_name}} - Updated' })
      .check('status', 200)

    // Logout
    .post('/auth/logout')
      .header('Authorization', 'Bearer {{auth_token}}')
      .check('status', 204)

    .done()

  .build();
```

<!-- tabs:end -->

## JWT Token Management

### Token Refresh Flow

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "JWT Authentication with Refresh"
    variables:
      username: "{{faker.internet.email}}"
      password: "SecurePassword123!"

    requests:
      # Initial login
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "{{username}}",
            "password": "{{password}}"
          }

        extract:
          - name: "access_token"
            type: "json_path"
            expression: "$.access_token"
          - name: "refresh_token"
            type: "json_path"
            expression: "$.refresh_token"
          - name: "expires_in"
            type: "json_path"
            expression: "$.expires_in"

        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.access_token"
            exists: true

      # Make authenticated requests
      - url: "https://api.example.com/data"
        method: GET
        headers:
          Authorization: "Bearer {{access_token}}"

        checks:
          - type: "status"
            value: 200

      # Simulate token expiry by waiting
      - wait: "{{expires_in + 1}}s"

      # Try request with expired token (should fail)
      - url: "https://api.example.com/data"
        method: GET
        headers:
          Authorization: "Bearer {{access_token}}"

        checks:
          - type: "status"
            value: 401
            description: "Should fail with expired token"

      # Refresh token
      - url: "https://api.example.com/auth/refresh"
        method: POST
        body: |
          {
            "refresh_token": "{{refresh_token}}"
          }

        extract:
          - name: "new_access_token"
            type: "json_path"
            expression: "$.access_token"
          - name: "new_refresh_token"
            type: "json_path"
            expression: "$.refresh_token"

        checks:
          - type: "status"
            value: 200

      # Use new token
      - url: "https://api.example.com/data"
        method: GET
        headers:
          Authorization: "Bearer {{new_access_token}}"

        checks:
          - type: "status"
            value: 200
            description: "Should work with new token"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('JWT Authentication with Refresh')
  .baseUrl('https://api.example.com')

  .scenario('JWT Authentication with Refresh', 100)
    .variables({
      username: faker.internet.email(),
      password: 'SecurePassword123!'
    })

    // Initial login
    .post('/auth/login')
      .body({
        username: '{{username}}',
        password: '{{password}}'
      })
      .extract('access_token', 'json', '$.access_token')
      .extract('refresh_token', 'json', '$.refresh_token')
      .extract('expires_in', 'json', '$.expires_in')
      .check('status', 200)
      .check('jsonPath', '$.access_token', { exists: true })

    // Make authenticated requests
    .get('/data')
      .header('Authorization', 'Bearer {{access_token}}')
      .check('status', 200)

    // Simulate token expiry by waiting
    .wait('{{expires_in + 1}}s')

    // Try request with expired token (should fail)
    .get('/data')
      .header('Authorization', 'Bearer {{access_token}}')
      .check('status', 401)

    // Refresh token
    .post('/auth/refresh')
      .body({ refresh_token: '{{refresh_token}}' })
      .extract('new_access_token', 'json', '$.access_token')
      .extract('new_refresh_token', 'json', '$.refresh_token')
      .check('status', 200)

    // Use new token
    .get('/data')
      .header('Authorization', 'Bearer {{new_access_token}}')
      .check('status', 200)

    .done()

  .build();
```

<!-- tabs:end -->

## OAuth 2.0 Flow

### Authorization Code Flow

```yaml
scenarios:
  - name: "OAuth 2.0 Authorization Code Flow"
    variables:
      client_id: "{{env.OAUTH_CLIENT_ID}}"
      client_secret: "{{env.OAUTH_CLIENT_SECRET}}"
      redirect_uri: "https://app.example.com/callback"
      state: "{{faker.string.uuid}}"
      
    requests:
      # Step 1: Get authorization code (simulated)
      - url: "https://oauth.example.com/authorize"
        method: GET
        query:
          response_type: "code"
          client_id: "{{client_id}}"
          redirect_uri: "{{redirect_uri}}"
          scope: "read write"
          state: "{{state}}"
        
        # In a real test, this would redirect to login page
        # For testing purposes, we simulate getting the code
        extract:
          - name: "authorization_code"
            type: "header"
            expression: "Location"
            regex: "code=([^&]+)"
        
        checks:
          - type: "status"
            value: 302
      
      # Step 2: Exchange code for tokens
      - url: "https://oauth.example.com/token"
        method: POST
        headers:
          Content-Type: "application/x-www-form-urlencoded"
          Authorization: "Basic {{base64(client_id + ':' + client_secret)}}"
        body: |
          grant_type=authorization_code&
          code={{authorization_code}}&
          redirect_uri={{redirect_uri}}&
          client_id={{client_id}}
        
        extract:
          - name: "oauth_access_token"
            type: "json_path"
            expression: "$.access_token"
          - name: "oauth_refresh_token"
            type: "json_path"
            expression: "$.refresh_token"
          - name: "token_type"
            type: "json_path"
            expression: "$.token_type"
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.access_token"
            exists: true
      
      # Step 3: Use access token
      - url: "https://api.example.com/user/info"
        method: GET
        headers:
          Authorization: "{{token_type}} {{oauth_access_token}}"
        
        checks:
          - type: "status"
            value: 200
```

## Multi-Factor Authentication

### TOTP-based 2FA

```yaml
scenarios:
  - name: "Multi-Factor Authentication Flow"
    variables:
      username: "testuser@example.com"
      password: "SecurePassword123!"
      
    requests:
      # Step 1: Initial login (first factor)
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "{{username}}",
            "password": "{{password}}"
          }
        
        extract:
          - name: "mfa_token"
            type: "json_path"
            expression: "$.mfa_token"
          - name: "mfa_required"
            type: "json_path"
            expression: "$.mfa_required"
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.mfa_required"
            value: true
      
      # Step 2: Generate TOTP code (simulate)
      - script: |
          // In real scenario, this would generate actual TOTP
          const totp_code = Math.floor(Math.random() * 900000) + 100000;
          context.variables.totp_code = totp_code.toString();
      
      # Step 3: Submit MFA code
      - url: "https://api.example.com/auth/mfa/verify"
        method: POST
        headers:
          Authorization: "Bearer {{mfa_token}}"
        body: |
          {
            "code": "{{totp_code}}"
          }
        
        extract:
          - name: "final_token"
            type: "json_path"
            expression: "$.access_token"
        
        checks:
          - type: "status"
            value: 200
          - type: "json_path"
            expression: "$.access_token"
            exists: true
      
      # Step 4: Access protected resource
      - url: "https://api.example.com/secure/data"
        method: GET
        headers:
          Authorization: "Bearer {{final_token}}"
        
        checks:
          - type: "status"
            value: 200
```

## Session-Based Authentication

### Cookie-based Session Management

```yaml
scenarios:
  - name: "Cookie-based Session Authentication"
    
    requests:
      # Login with session cookie
      - url: "https://app.example.com/login"
        method: POST
        headers:
          Content-Type: "application/x-www-form-urlencoded"
        body: "username=testuser&password=testpassword"
        
        # Cookies are automatically handled
        extract:
          - name: "session_id"
            type: "cookie"
            name: "SESSIONID"
        
        checks:
          - type: "status"
            value: 302  # Redirect after login
          - type: "header"
            name: "Set-Cookie"
            contains: "SESSIONID"
      
      # Access protected page (cookie sent automatically)
      - url: "https://app.example.com/dashboard"
        method: GET
        
        checks:
          - type: "status"
            value: 200
          - type: "body"
            contains: "Welcome"
      
      # Make API call with session
      - url: "https://app.example.com/api/user/profile"
        method: GET
        
        extract:
          - name: "user_data"
            type: "json_path"
            expression: "$"
        
        checks:
          - type: "status"
            value: 200
      
      # Logout (invalidate session)
      - url: "https://app.example.com/logout"
        method: POST
        
        checks:
          - type: "status"
            value: 302
      
      # Verify session is invalidated
      - url: "https://app.example.com/dashboard"
        method: GET
        
        checks:
          - type: "status"
            value: 302  # Redirect to login
```

## API Key Authentication

### Header-based API Keys

```yaml
scenarios:
  - name: "API Key Authentication"
    variables:
      api_key: "{{env.API_KEY}}"
      
    requests:
      # Test API key in header
      - url: "https://api.example.com/data"
        method: GET
        headers:
          X-API-Key: "{{api_key}}"
        
        checks:
          - type: "status"
            value: 200
      
      # Test API key in query parameter
      - url: "https://api.example.com/data"
        method: GET
        query:
          api_key: "{{api_key}}"
        
        checks:
          - type: "status"
            value: 200
      
      # Test invalid API key
      - url: "https://api.example.com/data"
        method: GET
        headers:
          X-API-Key: "invalid-key"
        
        checks:
          - type: "status"
            value: 401
            description: "Should reject invalid API key"
```

## SSO Integration

### SAML Authentication Flow

```yaml
scenarios:
  - name: "SAML SSO Flow"
    
    requests:
      # Step 1: Initiate SSO
      - url: "https://app.example.com/sso/initiate"
        method: GET
        query:
          provider: "company-sso"
        
        extract:
          - name: "saml_request"
            type: "form_field"
            name: "SAMLRequest"
          - name: "relay_state"
            type: "form_field"
            name: "RelayState"
        
        checks:
          - type: "status"
            value: 200
      
      # Step 2: Submit to identity provider
      - url: "https://sso.company.com/saml/login"
        method: POST
        headers:
          Content-Type: "application/x-www-form-urlencoded"
        body: "SAMLRequest={{saml_request}}&RelayState={{relay_state}}"
        
        extract:
          - name: "saml_response"
            type: "form_field"
            name: "SAMLResponse"
        
        checks:
          - type: "status"
            value: 200
      
      # Step 3: Post back SAML response
      - url: "https://app.example.com/sso/callback"
        method: POST
        headers:
          Content-Type: "application/x-www-form-urlencoded"
        body: "SAMLResponse={{saml_response}}&RelayState={{relay_state}}"
        
        extract:
          - name: "sso_session"
            type: "cookie"
            name: "SSO_SESSION"
        
        checks:
          - type: "status"
            value: 302  # Redirect to application
      
      # Step 4: Access application
      - url: "https://app.example.com/dashboard"
        method: GET
        
        checks:
          - type: "status"
            value: 200
```

## Authentication Error Handling

### Comprehensive Error Testing

```yaml
scenarios:
  - name: "Authentication Error Handling"
    
    requests:
      # Test invalid credentials
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "invalid@example.com",
            "password": "wrongpassword"
          }
        
        checks:
          - type: "status"
            value: 401
          - type: "json_path"
            expression: "$.error"
            value: "invalid_credentials"
          - type: "response_time"
            threshold: 3000
            description: "Error response should be reasonably fast"
      
      # Test account lockout
      - name: "Account Lockout Test"
        repeat: 5
        url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "lockout@example.com",
            "password": "wrongpassword"
          }
        
        checks:
          - type: "status"
            oneOf: [401, 429]  # 429 after lockout
      
      # Test expired token
      - url: "https://api.example.com/data"
        method: GET
        headers:
          Authorization: "Bearer expired.jwt.token"
        
        checks:
          - type: "status"
            value: 401
          - type: "json_path"
            expression: "$.error"
            value: "token_expired"
      
      # Test malformed token
      - url: "https://api.example.com/data"
        method: GET
        headers:
          Authorization: "Bearer malformed-token"
        
        checks:
          - type: "status"
            value: 401
          - type: "json_path"
            expression: "$.error"
            value: "invalid_token"
```

## Performance Testing Authentication

### Load Testing Login Flow

<!-- tabs:start -->

#### **YAML**

```yaml
load:
  pattern: "basic"
  virtual_users: 100
  ramp_up: "2m"
  duration: "10m"

scenarios:
  - name: "Login Performance Test"
    weight: 70

    # Use different users to avoid session conflicts
    csv_data:
      file: "test-users.csv"
      mode: "sequential"

    requests:
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "{{csv.username}}",
            "password": "{{csv.password}}"
          }

        extract:
          - name: "token"
            type: "json_path"
            expression: "$.token"

        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            percentile: 95
            threshold: 2000
            description: "95% of logins under 2s"

      # Authenticated operations
      - url: "https://api.example.com/user/dashboard"
        method: GET
        headers:
          Authorization: "Bearer {{token}}"

        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            percentile: 95
            threshold: 1000

      # Logout
      - url: "https://api.example.com/auth/logout"
        method: POST
        headers:
          Authorization: "Bearer {{token}}"

        checks:
          - type: "status"
            value: 204

  - name: "Token Refresh Test"
    weight: 30

    requests:
      # Simulate token refresh scenario
      - url: "https://api.example.com/auth/refresh"
        method: POST
        body: |
          {
            "refresh_token": "{{faker.string.uuid}}"
          }

        checks:
          - type: "response_time"
            percentile: 95
            threshold: 500
            description: "Token refresh should be fast"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('Login Performance Test')
  .baseUrl('https://api.example.com')

  .withLoad({
    pattern: 'basic',
    virtual_users: 100,
    ramp_up: '2m',
    duration: '10m'
  })

  .scenario('Login Performance Test', 70)
    .withCSV('test-users.csv', { mode: 'sequential' })

    .post('/auth/login')
      .body({
        username: '{{csv.username}}',
        password: '{{csv.password}}'
      })
      .extract('token', 'json', '$.token')
      .check('status', 200)
      .check('responseTime', { percentile: 95, threshold: 2000 })

    .get('/user/dashboard')
      .header('Authorization', 'Bearer {{token}}')
      .check('status', 200)
      .check('responseTime', { percentile: 95, threshold: 1000 })

    .post('/auth/logout')
      .header('Authorization', 'Bearer {{token}}')
      .check('status', 204)

    .done()

  .scenario('Token Refresh Test', 30)
    .post('/auth/refresh')
      .body({ refresh_token: faker.string.uuid() })
      .check('responseTime', { percentile: 95, threshold: 500 })

    .done()

  .build();
```

<!-- tabs:end -->

## Data-Driven Authentication Testing

### CSV-based User Testing

```yaml
# test-users.csv contains:
# username,password,role,expected_status
# admin@example.com,admin123,admin,200
# user@example.com,user123,user,200
# disabled@example.com,disabled123,disabled,403

scenarios:
  - name: "Data-Driven Authentication Test"
    
    csv_data:
      file: "test-users.csv"
      mode: "sequential"
    
    requests:
      - url: "https://api.example.com/auth/login"
        method: POST
        body: |
          {
            "username": "{{csv.username}}",
            "password": "{{csv.password}}"
          }
        
        extract:
          - name: "token"
            type: "json_path"
            expression: "$.token"
            condition: "status == 200"
          - name: "user_role"
            type: "json_path"
            expression: "$.user.role"
            condition: "status == 200"
        
        checks:
          - type: "status"
            value: "{{csv.expected_status}}"
          - type: "json_path"
            expression: "$.user.role"
            value: "{{csv.role}}"
            condition: "status == 200"
      
      # Role-based access test
      - url: "https://api.example.com/admin/users"
        method: GET
        headers:
          Authorization: "Bearer {{token}}"
        condition: "token != null"
        
        checks:
          - type: "status"
            value: "{{user_role == 'admin' ? 200 : 403}}"
            description: "Admin endpoint access based on role"
```

This comprehensive authentication flow example demonstrates testing various authentication patterns, error handling, performance under load, and data-driven scenarios commonly encountered in modern applications.
# Network Capture for Web Tests

Capture and analyze all HTTP network calls during Playwright-based web performance tests. This feature provides detailed visibility into API calls, resource loading, and network performance during browser tests.

## Configuration

Enable network capture in your test configuration under the `browser` section:

```yaml
global:
  browser:
    type: chromium
    headless: false
    network_capture:
      enabled: true

      # URL Filtering
      include_patterns: ["**/api/**"]      # Only capture matching URLs
      exclude_patterns: ["**/*.png", "**/*.css"]  # Skip matching URLs

      # Body Capture
      capture_request_body: true
      capture_response_body: true
      max_body_size: 10240                 # Max body size in bytes (10KB)
      content_type_filters: ["application/json", "text/plain"]

      # Storage Options
      store_inline: true                   # Store in TestResult.custom_metrics
      store_separate: true                 # Emit [NETWORK] events for dashboard
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable network capture |
| `include_patterns` | string[] | `[]` | Glob patterns for URLs to capture (empty = capture all) |
| `exclude_patterns` | string[] | `[]` | Glob patterns for URLs to skip |
| `capture_request_body` | boolean | `false` | Capture request body content |
| `capture_response_body` | boolean | `false` | Capture response body content |
| `max_body_size` | number | `10240` | Maximum body size to capture (bytes) |
| `content_type_filters` | string[] | `[]` | Only capture bodies with matching content-types |
| `store_inline` | boolean | `true` | Store network calls in test results |
| `store_separate` | boolean | `true` | Emit separate events for live dashboard |

## URL Pattern Matching

Use glob patterns to filter which URLs are captured:

```yaml
network_capture:
  enabled: true
  # Capture only API calls
  include_patterns:
    - "**/api/**"
    - "**/graphql"
  # Exclude static assets
  exclude_patterns:
    - "**/*.png"
    - "**/*.jpg"
    - "**/*.css"
    - "**/*.woff2"
```

Pattern matching rules:
- `**` matches any path segments
- `*` matches any characters within a segment
- Patterns are matched against the full URL and pathname
- Exclude patterns take precedence over include patterns

## Body Capture

Control which request/response bodies are captured:

```yaml
network_capture:
  enabled: true
  capture_request_body: true
  capture_response_body: true
  max_body_size: 51200              # 50KB max
  content_type_filters:
    - "application/json"
    - "application/xml"
    - "text/plain"
    - "text/html"
```

Notes:
- Bodies are only captured if the content-type matches the filter (uses substring matching)
- Bodies exceeding `max_body_size` are truncated
- Binary content is not captured
- Request bodies for POST/PUT/PATCH are captured from the request payload

## Complete Example

```yaml
name: Web Test with Network Capture
description: Capture all API calls during user journey

global:
  base_url: https://myapp.example.com
  browser:
    type: chromium
    headless: true
    network_capture:
      enabled: true
      include_patterns: ["**/api/**"]
      exclude_patterns: ["**/*.png"]
      capture_request_body: true
      capture_response_body: true
      max_body_size: 10240
      content_type_filters: ["application/json"]
      store_inline: true
      store_separate: true

load:
  pattern: basic
  virtual_users: 1
  duration: 60s

scenarios:
  - name: user_login_journey
    weight: 100
    steps:
      - name: goto_home
        type: web
        action:
          command: goto
          url: /

      - name: click_login
        type: web
        action:
          command: click
          selector: '[data-test="login-btn"]'

      - name: fill_email
        type: web
        action:
          command: fill
          selector: '[data-test="email"]'
          value: user@example.com

      - name: fill_password
        type: web
        action:
          command: fill
          selector: '[data-test="password"]'
          value: password123

      - name: submit_login
        type: web
        action:
          command: click
          selector: '[data-test="submit"]'

      - name: verify_logged_in
        type: web
        action:
          command: verify_contains
          selector: '[data-test="welcome"]'
          value: Welcome

outputs:
  - type: json
    file: results/test-results.json
```

## Output Format

### Captured Network Call Structure

Each captured network call contains:

```json
{
  "id": "req_1705123456789_abc123",
  "vu_id": 1,
  "timestamp": 1705123456789,
  "request_url": "https://api.example.com/users/login",
  "request_method": "POST",
  "request_headers": {
    "content-type": "application/json",
    "accept": "application/json"
  },
  "request_body": "{\"email\":\"user@example.com\",\"password\":\"...\"}",
  "request_body_truncated": false,
  "response_status": 200,
  "response_status_text": "OK",
  "response_headers": {
    "content-type": "application/json",
    "cache-control": "no-cache"
  },
  "response_body": "{\"token\":\"eyJhbGciOiJIUzI1NiIs...\",\"user\":{...}}",
  "response_body_truncated": false,
  "response_size": 1234,
  "start_time": 1705123456789,
  "end_time": 1705123457123,
  "duration": 334,
  "resource_type": "xhr",
  "scenario": "user_login_journey",
  "step_name": "submit_login",
  "success": true,
  "error": null
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the request |
| `vu_id` | number | Virtual user ID that made the request |
| `timestamp` | number | Unix timestamp when request started |
| `request_url` | string | Full request URL |
| `request_method` | string | HTTP method (GET, POST, etc.) |
| `request_headers` | object | Request headers (if captured) |
| `request_body` | string | Request body content (if captured) |
| `request_body_truncated` | boolean | Whether body was truncated |
| `response_status` | number | HTTP status code (0 = failed) |
| `response_status_text` | string | HTTP status text |
| `response_headers` | object | Response headers (if captured) |
| `response_body` | string | Response body content (if captured) |
| `response_body_truncated` | boolean | Whether body was truncated |
| `response_size` | number | Response body size in bytes |
| `start_time` | number | Request start timestamp |
| `end_time` | number | Response received timestamp |
| `duration` | number | Total duration in milliseconds |
| `resource_type` | string | Resource type (xhr, fetch, document, etc.) |
| `scenario` | string | Scenario name |
| `step_name` | string | Step that triggered the request |
| `success` | boolean | Whether request succeeded (2xx/3xx) |
| `error` | string | Error message if request failed |

### Resource Types

| Type | Description |
|------|-------------|
| `xhr` | XMLHttpRequest calls |
| `fetch` | Fetch API calls |
| `document` | HTML document requests |
| `script` | JavaScript files |
| `stylesheet` | CSS files |
| `image` | Image files |
| `font` | Font files |
| `other` | Other resource types |

## JSON Output

When `store_inline: true`, network calls are included in the JSON results file:

```json
{
  "summary": { ... },
  "results": [
    {
      "step_name": "submit_login",
      "duration": 1500,
      "success": true,
      "custom_metrics": {
        "network_calls": [
          {
            "id": "req_123...",
            "request_url": "https://api.example.com/login",
            "duration": 334,
            ...
          }
        ]
      }
    }
  ]
}
```

## Dashboard Visualization

When `store_separate: true`, the dashboard displays network data with:

### Charts

1. **Network Requests Over Time** (Scatter Plot)
   - Each request as a dot
   - X-axis: Time since test start
   - Y-axis: Duration in milliseconds
   - Color-coded by resource type
   - Failed requests shown in red

2. **Request Timeline** (Bar Chart)
   - Duration for each request in order
   - Color indicates status (success/redirect/error)

3. **Response Time by Endpoint** (Horizontal Bar Chart)
   - Average duration per endpoint
   - Sorted by slowest endpoints

4. **Status Code Distribution** (Doughnut Chart)
   - Breakdown of 2xx, 3xx, 4xx, 5xx, failed

5. **Request Type Distribution** (Doughnut Chart)
   - Breakdown by resource type

### Network Calls Table

Interactive table with:
- Sortable columns (click headers)
- Filter by URL, type, or status
- Click any row to view full request/response details

### Request Detail Modal

Click any network call to see:
- Full URL and method
- Status code and duration
- Request headers and body
- Response headers and body
- Error details (if failed)

## CSV Output

Network statistics are included in CSV output:

| Column | Description |
|--------|-------------|
| `network_call_count` | Number of network calls in the step |
| `network_avg_duration_ms` | Average network call duration |
| `network_total_size_bytes` | Total response size |

## HTML Report

The HTML report includes a Network Calls Analysis section with:
- Total calls, average duration, success rate
- Endpoint performance table
- Status code breakdown

## Status Code 0

A status code of `0` indicates the request failed before receiving an HTTP response:

- `net::ERR_ABORTED` - Request was cancelled (page navigation)
- `net::ERR_CONNECTION_REFUSED` - Server not reachable
- `net::ERR_NAME_NOT_RESOLVED` - DNS lookup failed
- `net::ERR_SSL_PROTOCOL_ERROR` - SSL/TLS error
- `net::ERR_BLOCKED_BY_CLIENT` - Blocked by browser/extension

The error message is captured in the `error` field.

## Best Practices

### 1. Filter to Relevant URLs

```yaml
network_capture:
  enabled: true
  include_patterns: ["**/api/**"]  # Only capture API calls
  exclude_patterns: ["**/analytics/**"]  # Skip tracking calls
```

### 2. Limit Body Size

```yaml
network_capture:
  max_body_size: 10240  # 10KB - sufficient for most JSON responses
```

### 3. Filter Content Types

```yaml
network_capture:
  content_type_filters: ["application/json"]  # Only capture JSON
```

### 4. Use for Debugging

Enable full capture during development:

```yaml
network_capture:
  enabled: true
  capture_request_body: true
  capture_response_body: true
  max_body_size: 102400  # 100KB for debugging
```

### 5. Disable in Production Load Tests

For high-load tests, consider disabling body capture:

```yaml
network_capture:
  enabled: true
  capture_request_body: false
  capture_response_body: false
  store_inline: false
  store_separate: true  # Still show in dashboard
```

## Troubleshooting

### No Network Calls Captured

1. Verify `network_capture.enabled: true`
2. Check `include_patterns` aren't too restrictive
3. Ensure test is using web/browser protocol

### Response Body Not Captured

1. Check `capture_response_body: true`
2. Verify content-type matches `content_type_filters`
3. Increase `max_body_size` if body is large

### Status 0 for All Requests

Requests may be aborted if:
- Page navigates away before completion
- Test ends before responses arrive
- Network errors occur

Check the `error` field for specific failure reasons.

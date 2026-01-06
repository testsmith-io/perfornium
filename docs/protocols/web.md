# Web Browser Testing with Playwright

The Web/Playwright protocol handler in Perfornium enables comprehensive browser automation and user journey testing. It supports multiple browsers, device simulation, and advanced web application testing scenarios.

## Basic Web Configuration

### Simple Page Navigation

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Navigate to Homepage"
    type: "web"
    action:
      command: "goto"
      url: "{{base_url}}"
      options:
        waitUntil: "networkidle"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Navigate to Homepage')
  .withBrowser('chromium', { headless: true })

  .scenario('Navigate to Homepage', 100)
    .goto('{{base_url}}', { waitUntil: 'networkidle' })
    .done()

  .build();
```

<!-- tabs:end -->

### Form Interaction

<!-- tabs:start -->

#### **YAML**

```yaml
steps:
  - name: "Fill Login Form"
    type: "web"
    action:
      command: "fill"
      selector: "#email"
      value: "{{email}}"

  - name: "Enter Password"
    type: "web"
    action:
      command: "fill"
      selector: "#password"
      value: "{{password}}"

  - name: "Click Login Button"
    type: "web"
    action:
      command: "click"
      selector: "button[type='submit']"
      options:
        waitForNavigation: true
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Login Form')
  .withBrowser('chromium', { headless: true })

  .scenario('Login Form', 100)
    .fill('#email', '{{email}}')
    .fill('#password', '{{password}}')
    .click('button[type="submit"]', { waitForNavigation: true })
    .done()

  .build();
```

<!-- tabs:end -->

## Browser Configuration

### Browser Selection

<!-- tabs:start -->

#### **YAML**

```yaml
global:
  browser:
    type: "chromium"  # chromium, firefox, webkit
    headless: true
    viewport:
      width: 1280
      height: 720
    user_agent: "Mozilla/5.0 (compatible; Perfornium/1.0)"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Browser Configuration')
  .withBrowser('chromium', {
    headless: true,
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (compatible; Perfornium/1.0)'
  })

  .scenario('Test', 100)
    .goto('https://example.com')
    .done()

  .build();
```

<!-- tabs:end -->

### Multiple Browser Testing

```yaml
scenarios:
  - name: "Cross-Browser Testing"
    browser_matrix:
      - type: "chromium"
        name: "Chrome"
      - type: "firefox" 
        name: "Firefox"
      - type: "webkit"
        name: "Safari"
    steps:
      - name: "Load Application"
        type: "web"
        action:
          command: "goto"
          url: "{{app_url}}"
```

### Device Simulation

```yaml
global:
  browser:
    device: "iPhone 12"  # Predefined device
    # Or custom device configuration
    custom_device:
      name: "Custom Mobile"
      viewport:
        width: 375
        height: 812
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
      device_scale_factor: 3
      is_mobile: true
      has_touch: true
```

## Page Actions

### Navigation Actions

```yaml
steps:
  - name: "Navigate to Page"
    type: "web"
    action:
      command: "goto"
      url: "https://example.com/dashboard"
      options:
        timeout: 30000
        waitUntil: "domcontentloaded"
        
  - name: "Go Back"
    type: "web"
    action:
      command: "goBack"
      
  - name: "Go Forward"
    type: "web"
    action:
      command: "goForward"
      
  - name: "Reload Page"
    type: "web"
    action:
      command: "reload"
      options:
        waitUntil: "networkidle"
```

### Element Interactions

```yaml
steps:
  - name: "Click Element"
    type: "web"
    action:
      command: "click"
      selector: ".btn-primary"
      options:
        force: false
        timeout: 5000
        
  - name: "Double Click"
    type: "web"
    action:
      command: "dblclick"
      selector: ".editable-field"
      
  - name: "Right Click"
    type: "web"
    action:
      command: "rightClick"
      selector: ".context-menu-trigger"
      
  - name: "Hover Over Element"
    type: "web"
    action:
      command: "hover"
      selector: ".dropdown-trigger"
```

### Form Handling

```yaml
steps:
  - name: "Fill Text Input"
    type: "web"
    action:
      command: "fill"
      selector: "input[name='username']"
      value: "{{username}}"
      
  - name: "Type with Delay"
    type: "web"
    action:
      command: "type"
      selector: "#search-box"
      text: "{{search_query}}"
      options:
        delay: 100  # ms between keystrokes
        
  - name: "Select Dropdown Option"
    type: "web"
    action:
      command: "selectOption"
      selector: "select[name='country']"
      value: "{{country_code}}"
      
  - name: "Check Checkbox"
    type: "web"
    action:
      command: "check"
      selector: "input[type='checkbox'][name='terms']"
      
  - name: "Upload File"
    type: "web"
    action:
      command: "setInputFiles"
      selector: "input[type='file']"
      files: ["test-data/document.pdf"]
```

### Keyboard and Mouse Actions

```yaml
steps:
  - name: "Press Key"
    type: "web"
    action:
      command: "press"
      selector: "body"
      key: "Escape"
      
  - name: "Key Combination"
    type: "web"
    action:
      command: "press"
      selector: "input"
      key: "Control+A"
      
  - name: "Mouse Move"
    type: "web"
    action:
      command: "mouse"
      operation: "move"
      x: 100
      y: 200
      
  - name: "Mouse Drag"
    type: "web"
    action:
      command: "dragAndDrop"
      source: "#draggable"
      target: "#droppable"
```

## Waiting and Synchronization

### Wait for Elements

```yaml
steps:
  - name: "Wait for Element to be Visible"
    type: "web"
    action:
      command: "waitForSelector"
      selector: ".loading-complete"
      options:
        state: "visible"
        timeout: 10000
        
  - name: "Wait for Element to be Hidden"
    type: "web"
    action:
      command: "waitForSelector"
      selector: ".loading-spinner"
      options:
        state: "hidden"
        timeout: 5000
```

### Wait for Network

```yaml
steps:
  - name: "Wait for API Response"
    type: "web"
    action:
      command: "waitForResponse"
      url: "**/api/user/profile"
      options:
        timeout: 15000
        
  - name: "Wait for Network Idle"
    type: "web"
    action:
      command: "waitForLoadState"
      state: "networkidle"
      options:
        timeout: 30000
```

### Custom Wait Conditions

```yaml
steps:
  - name: "Wait for Custom Condition"
    type: "web"
    action:
      command: "waitForFunction"
      script: |
        () => {
          const element = document.querySelector('#dynamic-content');
          return element && element.textContent.includes('Loaded');
        }
      options:
        timeout: 10000
```

## Data Extraction

### Text Content Extraction

```yaml
extract:
  - name: "page_title"
    type: "web_text"
    selector: "title"
    
  - name: "user_name"
    type: "web_text"
    selector: ".user-profile .name"
    
  - name: "all_product_names"
    type: "web_text"
    selector: ".product-list .product-name"
    return_type: "array"
```

### Attribute Extraction

```yaml
extract:
  - name: "current_url"
    type: "web_attribute"
    selector: "body"
    attribute: "data-page-id"
    
  - name: "form_action"
    type: "web_attribute"
    selector: "form"
    attribute: "action"
    
  - name: "all_image_sources"
    type: "web_attribute"
    selector: "img"
    attribute: "src"
    return_type: "array"
```

### JavaScript Evaluation

```yaml
extract:
  - name: "page_data"
    type: "web_evaluate"
    script: |
      () => {
        return {
          title: document.title,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        };
      }
      
  - name: "local_storage_data"
    type: "web_evaluate"
    script: |
      () => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
        return data;
      }
```

## Performance Monitoring

### Network Performance

```yaml
steps:
  - name: "Monitor Network Performance"
    type: "web"
    action:
      command: "goto"
      url: "{{app_url}}"
    performance:
      collect_network_timing: true
      collect_resource_timing: true
      
extract:
  - name: "navigation_timing"
    type: "web_performance"
    metric: "navigation"
    
  - name: "resource_timing"
    type: "web_performance" 
    metric: "resources"
```

### Core Web Vitals

```yaml
extract:
  - name: "core_web_vitals"
    type: "web_evaluate"
    script: |
      () => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const vitals = {};
            
            entries.forEach((entry) => {
              if (entry.name === 'first-contentful-paint') {
                vitals.fcp = entry.startTime;
              }
              if (entry.entryType === 'largest-contentful-paint') {
                vitals.lcp = entry.startTime;
              }
              if (entry.entryType === 'layout-shift') {
                vitals.cls = (vitals.cls || 0) + entry.value;
              }
            });
            
            resolve(vitals);
          }).observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] });
          
          setTimeout(() => resolve({}), 5000);
        });
      }
```

### Memory Usage

```yaml
extract:
  - name: "memory_usage"
    type: "web_evaluate"
    script: |
      () => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          };
        }
        return {};
      }
```

## Validation and Assertions

### Inline Verification Steps

Use verification commands directly in your test steps:

```yaml
steps:
  # Verify element exists
  - name: "Check Success Message Exists"
    type: "web"
    action:
      command: "verify_exists"
      selector: ".success-message"

  # Verify element is visible
  - name: "Check Modal is Visible"
    type: "web"
    action:
      command: "verify_visible"
      selector: "#confirmation-modal"

  # Verify element contains text (uses value property)
  - name: "Check Alert Message"
    type: "web"
    action:
      command: "verify_contains"
      selector: "role=alert"
      value: "Thanks for your message!"

  # Verify exact text match (uses expected_text property)
  - name: "Check Page Title"
    type: "web"
    action:
      command: "verify_text"
      selector: "h1"
      expected_text: "Welcome"

  # Verify element does not exist
  - name: "Check Error Gone"
    type: "web"
    action:
      command: "verify_not_exists"
      selector: ".error-message"
```

### Element State Checks

```yaml
checks:
  - type: "web_element"
    selector: ".success-message"
    state: "visible"
    description: "Success message should be visible"

  - type: "web_element"
    selector: "#loading"
    state: "hidden"
    description: "Loading indicator should be hidden"

  - type: "web_element"
    selector: "input[name='email']"
    state: "enabled"
    description: "Email input should be enabled"
```

### Text Content Validation

```yaml
checks:
  - type: "web_text"
    selector: "h1"
    expected: "Welcome Dashboard"
    description: "Page title should match"
    
  - type: "web_text"
    selector: ".error-message"
    operator: "contains"
    expected: "Invalid credentials"
    description: "Should show error message"
    
  - type: "web_text"
    selector: ".user-count"
    operator: "matches"
    expected: "\\d+ users online"
    description: "Should show user count format"
```

### URL and Navigation Checks

```yaml
checks:
  - type: "web_url"
    expected: "https://example.com/dashboard"
    description: "Should navigate to dashboard"
    
  - type: "web_url"
    operator: "contains"
    expected: "/success"
    description: "URL should contain success path"
    
  - type: "web_title"
    expected: "Dashboard - MyApp"
    description: "Page title should be correct"
```

### Custom JavaScript Validation

```yaml
checks:
  - type: "web_custom"
    script: |
      () => {
        const elements = document.querySelectorAll('.required-field');
        return Array.from(elements).every(el => el.value.trim() !== '');
      }
    expected: true
    description: "All required fields should be filled"
```

## Advanced Features

### Screenshots and Recording

```yaml
steps:
  - name: "Take Screenshot"
    type: "web"
    action:
      command: "screenshot"
      path: "screenshots/step-{{step_number}}.png"
      options:
        fullPage: true
        
  - name: "Start Video Recording"
    type: "web"
    action:
      command: "startVideo"
      path: "recordings/session-{{vu_id}}.webm"
      
  - name: "Stop Video Recording"
    type: "web"
    action:
      command: "stopVideo"
```

### Cookie and Storage Management

```yaml
steps:
  - name: "Set Cookie"
    type: "web"
    action:
      command: "setCookie"
      cookies:
        - name: "session_id"
          value: "{{session_id}}"
          domain: "example.com"
          path: "/"
          
  - name: "Local Storage Operation"
    type: "web"
    action:
      command: "evaluate"
      script: |
        () => {
          localStorage.setItem('user_preferences', JSON.stringify({
            theme: 'dark',
            language: 'en'
          }));
        }
```

### Geolocation and Permissions

```yaml
global:
  browser:
    context_options:
      geolocation:
        latitude: 37.7749
        longitude: -122.4194
      permissions: ["geolocation", "notifications"]
      
steps:
  - name: "Test Location Feature"
    type: "web"
    action:
      command: "click"
      selector: "#get-location-btn"
```

### Network Interception

```yaml
scenarios:
  - name: "API Mock Testing"
    hooks:
      beforeScenario: |
        // Setup network interception
        await page.route('**/api/user/profile', route => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 123,
              name: 'Test User',
              email: 'test@example.com'
            })
          });
        });
    steps:
      - name: "Load Profile Page"
        type: "web"
        action:
          command: "goto"
          url: "{{app_url}}/profile"
```

## Multi-Tab and Multi-Context Testing

### Tab Management

```yaml
steps:
  - name: "Open New Tab"
    type: "web"
    action:
      command: "newPage"
      
  - name: "Switch to Tab"
    type: "web"
    action:
      command: "switchToTab"
      tab_index: 1
      
  - name: "Close Tab"
    type: "web"
    action:
      command: "closePage"
      tab_index: 1
```

### Multiple Contexts

```yaml
scenarios:
  - name: "Multi-User Simulation"
    contexts:
      - name: "admin_context"
        cookies:
          - name: "role"
            value: "admin"
      - name: "user_context"
        cookies:
          - name: "role"
            value: "user"
    steps:
      - name: "Admin Actions"
        type: "web"
        context: "admin_context"
        action:
          command: "goto"
          url: "{{app_url}}/admin"
          
      - name: "User Actions"
        type: "web"
        context: "user_context"
        action:
          command: "goto"
          url: "{{app_url}}/dashboard"
```

## Performance Optimization

### Browser Pool Management

```yaml
global:
  browser:
    pool_size: 5
    reuse_contexts: true
    context_timeout: 300000  # 5 minutes
    
load:
  pattern: "basic"
  virtual_users: 20
  browser_per_vu: false  # Share browser instances
```

### Resource Optimization

```yaml
global:
  browser:
    block_resources: ["image", "stylesheet", "font"]
    disable_javascript: false
    disable_images: true
    disable_css: true
```

### Parallel Execution

```yaml
steps:
  - name: "Parallel Page Loads"
    type: "web"
    parallel: true
    actions:
      - command: "goto"
        url: "{{app_url}}/page1"
      - command: "goto" 
        url: "{{app_url}}/page2"
      - command: "goto"
        url: "{{app_url}}/page3"
```

## Error Handling and Debugging

### Error Recovery

```yaml
steps:
  - name: "Resilient Click"
    type: "web"
    action:
      command: "click"
      selector: ".dynamic-button"
    retry:
      count: 3
      delay: "1s"
      on_error: ["timeout", "element_not_found"]
```

### Debug Information

```yaml
global:
  browser:
    debug:
      slow_mo: 100  # ms delay between actions
      devtools: true
      console_logs: true
      network_logs: true
      
steps:
  - name: "Debug Action"
    type: "web"
    action:
      command: "click"
      selector: "#debug-button"
    debug:
      screenshot_on_failure: true
      full_page_screenshot: true
      console_log_level: "verbose"
```

## Best Practices

### 1. Efficient Selectors

```yaml
# Good - Specific and stable
selector: "[data-testid='login-button']"

# Better - Use semantic attributes
selector: "button[type='submit'][aria-label='Log in']"

# Avoid - Fragile selectors
selector: "body > div:nth-child(3) > form > button"
```

### 2. Proper Wait Strategies

```yaml
steps:
  - name: "Wait for Dynamic Content"
    type: "web"
    action:
      command: "waitForSelector"
      selector: ".content-loaded"
      options:
        state: "visible"
        timeout: 10000
```

### 3. Resource Management

```yaml
scenarios:
  - name: "Efficient Browser Testing"
    hooks:
      beforeScenario: |
        // Setup browser context with optimizations
        context.variables.startTime = Date.now();
      afterScenario: |
        // Cleanup
        await page.close();
        console.log(`Scenario completed in ${Date.now() - context.variables.startTime}ms`);
```

### 4. Data-Driven Web Testing

```yaml
scenarios:
  - name: "User Journey Testing"
    csv_data:
      file: "test-data/user-journeys.csv"
      mode: "sequential"
    steps:
      - name: "Login as User"
        type: "web"
        action:
          command: "goto"
          url: "{{login_url}}"
      - name: "Fill Credentials"
        type: "web"
        action:
          command: "fill"
          selector: "#email"
          value: "{{email}}"
```

This Web/Playwright protocol documentation provides comprehensive coverage of browser automation capabilities in Perfornium, enabling realistic user journey testing and performance monitoring.
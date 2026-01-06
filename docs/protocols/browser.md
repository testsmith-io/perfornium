# Browser Testing (Playwright)

Perfornium integrates Playwright for comprehensive browser-based performance testing, enabling you to measure real user experience, test complex JavaScript applications, and validate full page load performance.

## Overview

Browser testing with Playwright provides:
- Real browser rendering and JavaScript execution
- User interaction simulation
- Performance metrics collection
- Visual regression testing
- Multi-browser support (Chromium, Firefox, WebKit)

## Configuration

### Basic Browser Test

<!-- tabs:start -->

#### **YAML**

```yaml
protocol: browser
browser:
  type: chromium
  headless: true

scenarios:
  - name: "Homepage Load Test"
    browser:
      actions:
        - goto: "https://example.com"
        - wait: "load"
        - screenshot: "homepage.png"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Homepage Load Test')
  .withBrowser('chromium', { headless: true })

  .scenario('Homepage Load Test', 100)
    .goto('https://example.com')
    .wait('load')
    .screenshot('homepage.png')
    .done()

  .build();
```

<!-- tabs:end -->

### TypeScript Configuration

```typescript
import { defineConfig } from '@testsmith/perfornium';

export default defineConfig({
  protocol: 'browser',
  browser: {
    type: 'chromium',
    headless: true,
    viewport: { width: 1920, height: 1080 }
  },
  scenarios: [
    {
      name: 'E2E User Flow',
      browser: {
        actions: [
          { goto: 'https://example.com' },
          { click: 'button#login' },
          { fill: 'input#username', value: 'testuser' },
          { fill: 'input#password', value: 'password' },
          { click: 'button[type="submit"]' },
          { waitForSelector: '.dashboard' }
        ]
      }
    }
  ]
});
```

## Browser Options

### Browser Types

```yaml
browser:
  type: chromium  # chromium, firefox, webkit
  channel: chrome  # chrome, msedge (for chromium)
  
  # Device emulation
  device: "iPhone 12"  # Predefined device
  
  # Custom viewport
  viewport:
    width: 1920
    height: 1080
  
  # Browser context
  context:
    userAgent: "Perfornium/1.0"
    locale: "en-US"
    timezone: "America/New_York"
    permissions: ["geolocation", "notifications"]
```

### Launch Options

```yaml
browser:
  launch:
    headless: true
    slowMo: 100  # Slow down operations by 100ms
    devtools: false
    args:
      - "--disable-blink-features=AutomationControlled"
      - "--disable-dev-shm-usage"
      - "--no-sandbox"
    
  timeout: 30000  # Default timeout for operations
  navigationTimeout: 30000
  actionTimeout: 10000
```

## Browser Actions

### Navigation

```yaml
scenarios:
  - name: "Navigation Test"
    browser:
      actions:
        - goto: 
            url: "https://example.com"
            waitUntil: "networkidle"  # load, domcontentloaded, networkidle
        
        - reload:
            waitUntil: "load"
        
        - goBack: true
        
        - goForward: true
```

### Element Interaction

```yaml
scenarios:
  - name: "Form Interaction"
    browser:
      actions:
        # Click elements
        - click: "button#submit"
        - dblclick: ".item"
        - rightclick: "#context-menu"
        
        # Input operations
        - fill:
            selector: "input#email"
            value: "{{faker.internet.email}}"
        
        - type:
            selector: "textarea#comment"
            value: "Test comment"
            delay: 100  # Delay between keystrokes
        
        - selectOption:
            selector: "select#country"
            value: "US"
        
        - check: "input#agree"
        - uncheck: "input#subscribe"
        
        # File upload
        - setInputFiles:
            selector: "input[type='file']"
            files: ["./test-file.pdf"]
```

### Waiting and Assertions

```yaml
scenarios:
  - name: "Wait Operations"
    browser:
      actions:
        # Wait for element
        - waitForSelector:
            selector: ".loading"
            state: "hidden"  # visible, hidden, attached, detached
            timeout: 5000
        
        # Wait for navigation
        - waitForNavigation:
            url: "**/success"
            waitUntil: "networkidle"
        
        # Wait for function
        - waitForFunction:
            expression: "document.querySelector('.counter').innerText === '100'"
            polling: 100
        
        # Wait for timeout
        - wait: 2000  # Wait 2 seconds
        
        # Assert element
        - expect:
            selector: "h1"
            toHaveText: "Welcome"
        
        - expect:
            selector: ".error"
            toBeHidden: true
```

## Performance Metrics

### Collecting Metrics

```yaml
scenarios:
  - name: "Performance Test"
    browser:
      metrics:
        enabled: true
        types:
          - navigation  # Navigation Timing API
          - paint       # Paint timing
          - resource    # Resource timing
          - layout      # Layout shifts
          - memory      # Memory usage
      
      actions:
        - goto: "https://example.com"
        - collectMetrics:
            name: "homepage_metrics"
```

### Custom Performance Marks

```yaml
scenarios:
  - name: "Custom Metrics"
    browser:
      actions:
        - goto: "https://example.com"
        
        - evaluate:
            expression: "performance.mark('search-start')"
        
        - fill:
            selector: "input#search"
            value: "performance testing"
        
        - click: "button#search-button"
        
        - waitForSelector: ".results"
        
        - evaluate:
            expression: |
              performance.mark('search-end');
              performance.measure('search-duration', 'search-start', 'search-end');
        
        - collectMetrics:
            name: "search_performance"
            custom: ["search-duration"]
```

## Page Objects Pattern

### Define Page Objects

```yaml
browser:
  pages:
    login:
      url: "https://example.com/login"
      elements:
        username: "input#username"
        password: "input#password"
        submit: "button[type='submit']"
        error: ".error-message"
    
    dashboard:
      url: "https://example.com/dashboard"
      elements:
        profile: ".user-profile"
        menu: ".nav-menu"
        logout: "button#logout"

scenarios:
  - name: "Login Flow"
    browser:
      actions:
        - goto: "{{pages.login.url}}"
        - fill:
            selector: "{{pages.login.elements.username}}"
            value: "testuser"
        - fill:
            selector: "{{pages.login.elements.password}}"
            value: "password"
        - click: "{{pages.login.elements.submit}}"
        - waitForSelector: "{{pages.dashboard.elements.profile}}"
```

## Multi-Page Scenarios

### Handle Multiple Pages

```yaml
scenarios:
  - name: "Multi-Window Test"
    browser:
      actions:
        - goto: "https://example.com"
        
        # Open new page
        - newPage:
            name: "popup"
            url: "https://example.com/popup"
        
        # Switch between pages
        - usePage: "popup"
        - click: "button#action"
        
        - usePage: "main"
        - waitForSelector: ".updated"
        
        # Close page
        - closePage: "popup"
```

### Handle Popups

```yaml
scenarios:
  - name: "Popup Handling"
    browser:
      actions:
        - goto: "https://example.com"
        
        - handleDialog:
            action: "accept"  # accept, dismiss
            text: "OK"
        
        - click: "button#show-alert"
```

## Network Interception

### Mock Responses

```yaml
scenarios:
  - name: "API Mocking"
    browser:
      network:
        mocks:
          - url: "**/api/users"
            response:
              status: 200
              body: |
                [{"id": 1, "name": "Test User"}]
      
      actions:
        - goto: "https://example.com"
        - waitForSelector: ".user-list"
```

### Modify Requests

```yaml
scenarios:
  - name: "Request Modification"
    browser:
      network:
        intercept:
          - url: "**/api/**"
            headers:
              "X-Test-Header": "performance-test"
            continue: true
```

### Block Resources

```yaml
scenarios:
  - name: "Resource Blocking"
    browser:
      network:
        block:
          - "**/*.css"  # Block CSS
          - "**/*.png"  # Block images
          - "**/analytics/**"  # Block analytics
      
      actions:
        - goto: "https://example.com"
```

## Visual Testing

### Screenshots

```yaml
scenarios:
  - name: "Visual Regression"
    browser:
      actions:
        - goto: "https://example.com"
        
        # Full page screenshot
        - screenshot:
            path: "screenshots/fullpage.png"
            fullPage: true
        
        # Element screenshot
        - screenshot:
            selector: ".hero-section"
            path: "screenshots/hero.png"
        
        # With options
        - screenshot:
            path: "screenshots/viewport.png"
            clip:
              x: 0
              y: 0
              width: 1200
              height: 800
```

### Video Recording

```yaml
browser:
  context:
    recordVideo:
      dir: "./videos"
      size:
        width: 1920
        height: 1080

scenarios:
  - name: "Recorded Flow"
    browser:
      actions:
        - goto: "https://example.com"
        - click: "button#start"
        - wait: 3000
```

## Mobile Testing

### Device Emulation

```yaml
browser:
  device: "iPhone 12 Pro"  # Use predefined device
  
  # Or custom mobile settings
  viewport:
    width: 390
    height: 844
  
  context:
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
    isMobile: true
    hasTouch: true
    deviceScaleFactor: 3

scenarios:
  - name: "Mobile Test"
    browser:
      actions:
        - goto: "https://m.example.com"
        - tap: ".mobile-menu"  # Mobile-specific action
        - swipe:
            from: { x: 200, y: 500 }
            to: { x: 200, y: 100 }
```

## Parallel Browser Testing

### Multiple Browsers

```yaml
browser:
  parallel:
    browsers:
      - type: chromium
        name: "Chrome Test"
      - type: firefox
        name: "Firefox Test"
      - type: webkit
        name: "Safari Test"
    
    maxConcurrent: 3

scenarios:
  - name: "Cross-Browser Test"
    browser:
      actions:
        - goto: "https://example.com"
        - screenshot: "screenshots/{{browser.name}}.png"
```

## Advanced Scenarios

### Complex User Flow

<!-- tabs:start -->

#### **YAML**

```yaml
scenarios:
  - name: "E-Commerce Flow"
    browser:
      actions:
        # Navigate to product
        - goto: "https://shop.example.com"
        - click: "a[href*='product']"
        - waitForSelector: ".product-details"

        # Add to cart
        - selectOption:
            selector: "select#size"
            value: "M"
        - click: "button#add-to-cart"
        - waitForSelector: ".cart-notification"

        # Checkout
        - click: "a#cart"
        - click: "button#checkout"

        # Fill shipping
        - fill:
            selector: "input#email"
            value: "{{faker.internet.email}}"
        - fill:
            selector: "input#address"
            value: "{{faker.location.streetAddress}}"

        # Payment
        - frame: "iframe#payment"
        - fill:
            selector: "input#card-number"
            value: "4242424242424242"
        - fill:
            selector: "input#expiry"
            value: "12/25"
        - fill:
            selector: "input#cvc"
            value: "123"

        # Submit order
        - click: "button#place-order"
        - waitForNavigation:
            url: "**/order-confirmation"

        # Collect metrics
        - collectMetrics:
            name: "checkout_flow"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('E-Commerce Flow')
  .withBrowser('chromium', { headless: true })

  .scenario('E-Commerce Flow', 100)
    // Navigate to product
    .goto('https://shop.example.com')
    .click('a[href*="product"]')
    .expectVisible('.product-details')

    // Add to cart
    .selectOption('select#size', 'M')
    .click('button#add-to-cart')
    .expectVisible('.cart-notification')

    // Checkout
    .click('a#cart')
    .click('button#checkout')

    // Fill shipping
    .fill('input#email', faker.internet.email())
    .fill('input#address', faker.location.streetAddress())

    // Payment (in iframe)
    .fill('iframe#payment input#card-number', '4242424242424242')
    .fill('iframe#payment input#expiry', '12/25')
    .fill('iframe#payment input#cvc', '123')

    // Submit order
    .click('button#place-order')
    .expectVisible('[href*="order-confirmation"]')

    .done()

  .build();
```

<!-- tabs:end -->

### Script Injection

```yaml
scenarios:
  - name: "Script Injection Test"
    browser:
      actions:
        - goto: "https://example.com"
        
        # Add script tag
        - addScriptTag:
            url: "https://cdn.example.com/analytics.js"
        
        # Evaluate in page context
        - evaluate:
            expression: |
              window.perforniumData = {
                testId: '{{test_id}}',
                timestamp: Date.now()
              };
        
        # Extract data
        - evaluate:
            expression: "window.performance.timing"
            extract: "timing_data"
```

## Best Practices

### Performance Optimization

1. **Resource Management**
   ```yaml
   browser:
     launch:
       args:
         - "--disable-gpu"
         - "--disable-dev-shm-usage"
         - "--disable-setuid-sandbox"
         - "--no-sandbox"
   ```

2. **Reuse Contexts**
   ```yaml
   browser:
     reuseContext: true
     persistentContext:
       dir: "./browser-data"
   ```

3. **Selective Loading**
   ```yaml
   browser:
     network:
       block: ["**/fonts/**", "**/analytics/**"]
   ```

### Error Handling

```yaml
scenarios:
  - name: "Robust Test"
    browser:
      retry:
        count: 3
        delay: 1000
      
      errorHandling:
        screenshot: true
        console: true
        network: true
      
      actions:
        - goto:
            url: "https://example.com"
            retry: true
        
        - tryClick:
            selector: "button#optional"
            optional: true
```

### Debugging

```yaml
browser:
  debug:
    slowMo: 500
    headless: false
    devtools: true
    
  trace:
    enabled: true
    screenshots: true
    snapshots: true
    sources: true
```

Browser testing with Playwright provides comprehensive capabilities for testing modern web applications, measuring real user experience, and ensuring cross-browser compatibility.
# Browser Automation

This example demonstrates comprehensive browser automation testing with Perfornium, covering real user interactions, performance monitoring, visual testing, and complex multi-page workflows using Playwright integration.

## Overview

Browser automation testing includes:
- User interface interaction simulation
- Performance monitoring of web applications
- Visual regression testing
- Multi-step user journeys
- Mobile browser testing
- Cross-browser compatibility

## Basic E-commerce User Journey

### Complete Shopping Flow

<!-- tabs:start -->

#### **YAML**

```yaml
name: "E-commerce Shopping Test"

global:
  base_url: "https://shop.example.com"
  browser:
    type: chromium
    headless: true
    viewport:
      width: 1920
      height: 1080

load:
  pattern: "basic"
  virtual_users: 5
  duration: "5m"

scenarios:
  - name: "E-commerce Shopping Journey"
    steps:
      # Home page navigation
      - name: "Visit Homepage"
        type: "web"
        action:
          command: "goto"
          url: "/"

      # Search for products
      - name: "Search Products"
        type: "web"
        action:
          command: "fill"
          selector: "input[data-testid='search-input']"
          value: "wireless headphones"

      - name: "Submit Search"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='search-button']"

      # Select first product
      - name: "Click Product"
        type: "web"
        action:
          command: "click"
          selector: ".product-card:first-child .product-link"

      # Select product options
      - name: "Select Color"
        type: "web"
        action:
          command: "select"
          selector: "select[name='color']"
          value: "black"

      # Add to cart
      - name: "Add to Cart"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='add-to-cart']"

      - name: "Verify Added"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".cart-notification"

      # Navigate to cart
      - name: "Go to Cart"
        type: "web"
        action:
          command: "click"
          selector: "a[data-testid='cart-link']"

      # Proceed to checkout
      - name: "Checkout"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='checkout-button']"

      # Fill shipping information
      - name: "Fill First Name"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='firstName']"
          value: "{{faker.person.firstName}}"

      - name: "Fill Last Name"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='lastName']"
          value: "{{faker.person.lastName}}"

      - name: "Fill Email"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='email']"
          value: "{{faker.internet.email}}"

      - name: "Fill Address"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='address']"
          value: "{{faker.location.streetAddress}}"

      # Complete purchase
      - name: "Place Order"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='place-order']"

      - name: "Verify Confirmation"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".order-confirmation"

report:
  generate: true
  output: "reports/ecommerce-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('E-commerce Shopping Test')
  .baseUrl('https://shop.example.com')
  .withBrowser('chromium', {
    headless: true,
    viewport: { width: 1920, height: 1080 }
  })
  .scenario('E-commerce Shopping Journey')
    // Home page navigation
    .goto('/')

    // Search for products
    .fill("input[data-testid='search-input']", 'wireless headphones')
    .click("button[data-testid='search-button']")

    // Select first product
    .click('.product-card:first-child .product-link')

    // Select product options
    .select("select[name='color']", 'black')

    // Add to cart
    .click("button[data-testid='add-to-cart']")
    .expectVisible('.cart-notification')

    // Navigate to cart
    .click("a[data-testid='cart-link']")

    // Proceed to checkout
    .click("button[data-testid='checkout-button']")

    // Fill shipping information
    .fill("input[name='firstName']", faker.person.firstName())
    .fill("input[name='lastName']", faker.person.lastName())
    .fill("input[name='email']", faker.internet.email())
    .fill("input[name='address']", faker.location.streetAddress())

    // Complete purchase
    .click("button[data-testid='place-order']")
    .expectVisible('.order-confirmation')
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '5m'
  })
  .withReport('reports/ecommerce-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Form Testing with Validation

### Complex Form Interactions

<!-- tabs:start -->

#### **YAML**

```yaml
name: "User Registration Form Test"

global:
  base_url: "https://app.example.com"
  browser:
    type: chromium
    headless: true

load:
  pattern: "basic"
  virtual_users: 3
  duration: "3m"

scenarios:
  - name: "User Registration Form Testing"
    steps:
      - name: "Navigate to Register"
        type: "web"
        action:
          command: "goto"
          url: "/register"

      # Test form validation - submit empty
      - name: "Submit Empty Form"
        type: "web"
        action:
          command: "click"
          selector: "button[type='submit']"

      # Check for validation errors
      - name: "Verify Error Message"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".error-message"

      # Fill form with valid data
      - name: "Fill First Name"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='firstName']"
          value: "{{faker.person.firstName}}"

      - name: "Fill Last Name"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='lastName']"
          value: "{{faker.person.lastName}}"

      - name: "Fill Email"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='email']"
          value: "{{faker.internet.email}}"

      - name: "Fill Password"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='password']"
          value: "SecurePassword123!"

      - name: "Confirm Password"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='confirmPassword']"
          value: "SecurePassword123!"

      # Submit valid form
      - name: "Submit Form"
        type: "web"
        action:
          command: "click"
          selector: "button[type='submit']"

      # Verify successful registration
      - name: "Verify Welcome"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".welcome-message"

report:
  generate: true
  output: "reports/registration-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('User Registration Form Test')
  .baseUrl('https://app.example.com')
  .withBrowser('chromium', { headless: true })
  .scenario('User Registration Form Testing')
    .goto('/register')

    // Test form validation - submit empty
    .click("button[type='submit']")

    // Check for validation errors
    .expectVisible('.error-message')

    // Fill form with valid data
    .fill("input[name='firstName']", faker.person.firstName())
    .fill("input[name='lastName']", faker.person.lastName())
    .fill("input[name='email']", faker.internet.email())
    .fill("input[name='password']", 'SecurePassword123!')
    .fill("input[name='confirmPassword']", 'SecurePassword123!')

    // Submit valid form
    .click("button[type='submit']")

    // Verify successful registration
    .expectVisible('.welcome-message')
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 3,
    duration: '3m'
  })
  .withReport('reports/registration-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Single Page Application Testing

### React/Angular App Interactions

<!-- tabs:start -->

#### **YAML**

```yaml
name: "SPA Dashboard Test"

global:
  base_url: "https://dashboard.example.com"
  browser:
    type: chromium
    headless: true

load:
  pattern: "basic"
  virtual_users: 5
  duration: "5m"

scenarios:
  - name: "SPA Dashboard Interactions"
    steps:
      # Login to SPA
      - name: "Go to Login"
        type: "web"
        action:
          command: "goto"
          url: "/login"

      - name: "Enter Username"
        type: "web"
        action:
          command: "fill"
          selector: "input[data-testid='username']"
          value: "testuser@example.com"

      - name: "Enter Password"
        type: "web"
        action:
          command: "fill"
          selector: "input[data-testid='password']"
          value: "password123"

      - name: "Click Login"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='login-button']"

      # Wait for SPA to load
      - name: "Verify Dashboard"
        type: "web"
        action:
          command: "verify_visible"
          selector: "[data-testid='dashboard']"

      # Navigate through SPA routes
      - name: "Go to Analytics"
        type: "web"
        action:
          command: "click"
          selector: "nav a[href='/analytics']"

      - name: "Verify Analytics Page"
        type: "web"
        action:
          command: "verify_visible"
          selector: "[data-testid='analytics-page']"

      # Test data filtering
      - name: "Select Date Range"
        type: "web"
        action:
          command: "select"
          selector: "select[data-testid='date-range']"
          value: "last-30-days"

      # Test modal interactions
      - name: "Create Report Button"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='create-report']"

      - name: "Fill Report Name"
        type: "web"
        action:
          command: "fill"
          selector: ".modal input[name='reportName']"
          value: "Monthly Performance Report"

      - name: "Generate Report"
        type: "web"
        action:
          command: "click"
          selector: ".modal button[data-testid='generate-report']"

report:
  generate: true
  output: "reports/spa-dashboard-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('SPA Dashboard Test')
  .baseUrl('https://dashboard.example.com')
  .withBrowser('chromium', { headless: true })
  .scenario('SPA Dashboard Interactions')
    // Login to SPA
    .goto('/login')
    .fill("input[data-testid='username']", 'testuser@example.com')
    .fill("input[data-testid='password']", 'password123')
    .click("button[data-testid='login-button']")

    // Wait for SPA to load
    .expectVisible("[data-testid='dashboard']")

    // Navigate through SPA routes
    .click("nav a[href='/analytics']")
    .expectVisible("[data-testid='analytics-page']")

    // Test data filtering
    .select("select[data-testid='date-range']", 'last-30-days')

    // Test modal interactions
    .click("button[data-testid='create-report']")
    .fill(".modal input[name='reportName']", 'Monthly Performance Report')
    .click(".modal button[data-testid='generate-report']")
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '5m'
  })
  .withReport('reports/spa-dashboard-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Mobile Browser Testing

### Responsive Design Testing

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Mobile E-commerce Test"

global:
  base_url: "https://m.shop.example.com"
  browser:
    type: chromium
    headless: true
    device: "iPhone 12 Pro"

load:
  pattern: "basic"
  virtual_users: 5
  duration: "5m"

scenarios:
  - name: "Mobile E-commerce Experience"
    steps:
      - name: "Visit Mobile Homepage"
        type: "web"
        action:
          command: "goto"
          url: "/"

      # Mobile navigation menu
      - name: "Open Menu"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='mobile-menu-toggle']"

      - name: "Verify Menu Visible"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".mobile-menu"

      - name: "Go to Categories"
        type: "web"
        action:
          command: "click"
          selector: ".mobile-menu a[href='/categories']"

      # Mobile-specific interactions
      - name: "Select Category"
        type: "web"
        action:
          command: "click"
          selector: ".category-card:first-child"

      - name: "Verify Product Grid"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".product-grid"

      - name: "Add to Cart"
        type: "web"
        action:
          command: "click"
          selector: ".product-card:first-child .add-to-cart"

      # Mobile cart drawer
      - name: "Verify Cart Drawer"
        type: "web"
        action:
          command: "verify_visible"
          selector: ".mobile-cart-drawer"

      - name: "Checkout Mobile"
        type: "web"
        action:
          command: "click"
          selector: "button[data-testid='checkout-mobile']"

      # Mobile-optimized checkout form
      - name: "Fill Email"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='email']"
          value: "{{faker.internet.email}}"

      - name: "Fill Phone"
        type: "web"
        action:
          command: "fill"
          selector: "input[name='phone']"
          value: "{{faker.phone.number}}"

report:
  generate: true
  output: "reports/mobile-ecommerce-report.html"
```

#### **TypeScript**

```typescript
import { test, faker } from '@testsmith/perfornium/dsl';

const config = test('Mobile E-commerce Test')
  .baseUrl('https://m.shop.example.com')
  .withBrowser('chromium', {
    headless: true,
    device: 'iPhone 12 Pro'
  })
  .scenario('Mobile E-commerce Experience')
    .goto('/')

    // Mobile navigation menu
    .click("button[data-testid='mobile-menu-toggle']")
    .expectVisible('.mobile-menu')
    .click(".mobile-menu a[href='/categories']")

    // Mobile-specific interactions
    .click('.category-card:first-child')
    .expectVisible('.product-grid')
    .click('.product-card:first-child .add-to-cart')

    // Mobile cart drawer
    .expectVisible('.mobile-cart-drawer')
    .click("button[data-testid='checkout-mobile']")

    // Mobile-optimized checkout form
    .fill("input[name='email']", faker.internet.email())
    .fill("input[name='phone']", faker.phone.number())
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 5,
    duration: '5m'
  })
  .withReport('reports/mobile-ecommerce-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Custom Script Scenarios

### Advanced Browser Interactions with Custom Scripts

<!-- tabs:start -->

#### **YAML**

```yaml
name: "Advanced Browser Test"

global:
  base_url: "https://app.example.com"
  browser:
    type: chromium
    headless: true

load:
  pattern: "basic"
  virtual_users: 3
  duration: "3m"

scenarios:
  - name: "Custom Script Interactions"
    steps:
      - name: "Navigate to App"
        type: "web"
        action:
          command: "goto"
          url: "/"

      - name: "Execute Custom Script"
        type: "custom"
        script: |
          // Access page from context
          const title = await context.page.title();
          context.variables.pageTitle = title;

          // Scroll to bottom
          await context.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });

          // Wait for lazy-loaded content
          await context.page.waitForSelector('.lazy-content');

      - name: "Capture Performance Metrics"
        type: "custom"
        script: |
          const metrics = await context.page.evaluate(() => {
            const timing = performance.timing;
            return {
              loadTime: timing.loadEventEnd - timing.navigationStart,
              domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
              firstPaint: performance.getEntriesByType('paint')[0]?.startTime
            };
          });
          context.variables.performanceMetrics = metrics;

report:
  generate: true
  output: "reports/advanced-browser-report.html"
```

#### **TypeScript**

```typescript
import { test } from '@testsmith/perfornium/dsl';

const config = test('Advanced Browser Test')
  .baseUrl('https://app.example.com')
  .withBrowser('chromium', { headless: true })
  .scenario('Custom Script Interactions')
    .goto('/')

    // Custom script for advanced interactions
    .step('Execute Custom Script', async (context) => {
      // Access page from context
      const title = await context.page.title();
      context.variables.pageTitle = title;

      // Scroll to bottom
      await context.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for lazy-loaded content
      await context.page.waitForSelector('.lazy-content');
    })

    // Capture performance metrics
    .step('Capture Performance Metrics', async (context) => {
      const metrics = await context.page.evaluate(() => {
        const timing = performance.timing;
        return {
          loadTime: timing.loadEventEnd - timing.navigationStart,
          domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
          firstPaint: performance.getEntriesByType('paint')[0]?.startTime
        };
      });
      context.variables.performanceMetrics = metrics;
    })
    .done()

  .withLoad({
    pattern: 'basic',
    virtual_users: 3,
    duration: '3m'
  })
  .withReport('reports/advanced-browser-report.html')
  .build();

export default config;
```

<!-- tabs:end -->

## Key Learning Points

### 1. Browser Configuration
- Use `withBrowser()` to configure browser type (chromium, firefox, webkit)
- Set viewport dimensions and device emulation
- Control headless mode for CI/CD pipelines

### 2. Navigation and Interactions
- `.goto()` for page navigation
- `.click()` for button/link clicks
- `.fill()` for form inputs
- `.select()` for dropdown selections
- `.expectVisible()` for assertions

### 3. Mobile Testing
- Use device emulation for mobile testing
- Test touch interactions and responsive layouts
- Verify mobile-specific UI components

### 4. Custom Scripts
- Use `.step()` for complex custom interactions
- Access Playwright page via `context.page`
- Capture custom metrics and data

### 5. Best Practices
- Use data-testid attributes for reliable selectors
- Implement proper waits for dynamic content
- Capture screenshots for visual verification
- Test across multiple browsers and devices

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

export async function initCommand(
  directory: string,
  options: { template?: string; examples?: boolean }
): Promise<void> {
  try {
    const projectDir = path.resolve(directory);
    const template = options.template || 'basic';
    
    logger.info(`Initializing new perfornium project in: ${projectDir}`);
    
    // Create directory structure
    const dirs = [
      'tests/api',
      'tests/web',
      'tests/mixed',
      'config/environments',
      'scripts',
      'data',              // CSV and test data files
      'payloads',          // JSON/XML payload templates for API tests
      'results',           // Test results (JSON, CSV)
      'results/screenshots', // Screenshots from web tests
      'reports'            // HTML reports
    ];
    
    dirs.forEach(dir => {
      const fullPath = path.join(projectDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
    
    // Create package.json
    const packageJson = {
      name: path.basename(projectDir),
      version: '1.0.0',
      description: 'Performance testing project using Perfornium',
      scripts: {
        'test': 'perfornium run',
        'test:api': 'perfornium run tests/api/',
        'test:web': 'perfornium run tests/web/',
        'test:mixed': 'perfornium run tests/mixed/',
        'validate': 'perfornium validate',
        'record': 'perfornium record',
        'report': 'perfornium report',
        'worker': 'perfornium worker',
        'worker:8080': 'perfornium worker --port 8080',
        'worker:8081': 'perfornium worker --port 8081',
        'distributed': 'perfornium distributed --workers-file config/workers.json'
      },
      devDependencies: {
        perfornium: '^1.0.0'
      }
    };
    
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create configuration files based on template
    await createTemplateFiles(projectDir, template, options.examples || false);
    
    // Create .gitignore
    const gitignore = `node_modules/
results/
reports/
*.log
.env
.DS_Store
`;
    
    fs.writeFileSync(path.join(projectDir, '.gitignore'), gitignore);
    
    // Create README
    const readme = generateReadme(path.basename(projectDir), template);
    fs.writeFileSync(path.join(projectDir, 'README.md'), readme);
    
    logger.success(`✅ Project initialized successfully!`);
    logger.info(`📁 Project template: ${template}`);
    logger.info(`📋 Next steps:`);
    logger.info(`   cd ${path.relative(process.cwd(), projectDir)}`);
    logger.info(`   npm install`);
    logger.info(`   perfornium run tests/api/sample-test.yml`);
    
  } catch (error: any) {
    logger.error(`Project initialization failed: ${error.message}`);
    process.exit(1);
  }
}

async function createTemplateFiles(projectDir: string, template: string, includeExamples: boolean): Promise<void> {
  const templates = {
    basic: () => createBasicTemplate(projectDir),
    api: () => createAPITemplate(projectDir),
    web: () => createWebTemplate(projectDir),
    mixed: () => createMixedTemplate(projectDir)
  };
  
  const templateFunc = templates[template as keyof typeof templates];
  if (!templateFunc) {
    throw new Error(`Unknown template: ${template}`);
  }
  
  await templateFunc();
  
  if (includeExamples) {
    await createExampleFiles(projectDir);
  }
  
  // Create environment configurations
  createEnvironmentConfigs(projectDir);
}

async function createExampleFiles(projectDir: string): Promise<void> {
  logger.info('📚 Creating example files...');
  
  // Create additional example tests
  const advancedAPIExample = `name: "Advanced API Example"
description: "Complex API testing with data extraction and validation"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 30

load:
  pattern: "stepping"
  steps:
    - users: 2
      duration: "30s"
    - users: 5
      duration: "1m"
    - users: 3
      duration: "30s"

scenarios:
  - name: "user_data_flow"
    weight: 100
    loop: 2
    steps:
      - name: "get_users"
        type: "rest"
        method: "GET"
        path: "/users"
        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            value: 1000
            operator: "lt"
        extract:
          - name: "first_user_id"
            type: "json_path"
            expression: "$[0].id"

      - name: "get_user_posts"
        type: "rest"
        method: "GET"
        path: "/users/{{first_user_id}}/posts"
        checks:
          - type: "status"
            value: 200

      - name: "create_post"
        type: "rest"
        method: "POST"
        path: "/posts"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "title": "Test Post from VU {{__VU}}",
            "body": "This is a test post created during performance testing",
            "userId": "{{first_user_id}}"
          }
        checks:
          - type: "status"
            value: 201

outputs:
  - type: "json"
    file: "results/advanced-api-example.json"
  - type: "csv"
    file: "results/advanced-api-example.csv"

report:
  generate: true
  output: "reports/advanced-api-report.html"
`;

  const webExampleAdvanced = `name: "Web Interaction Example"
description: "Browser automation testing example"

global:
  browser:
    type: "chromium"
    headless: true
    viewport:
      width: 1920
      height: 1080

load:
  pattern: "basic"
  virtual_users: 3
  ramp_up: "30s"
  duration: "2m"

scenarios:
  - name: "web_navigation"
    weight: 100
    loop: 1
    think_time: "2-4"
    steps:
      - name: "visit_example_site"
        type: "web"
        action:
          command: "goto"
          url: "https://example.com"
        checks:
          - type: "url_contains"
            value: "example.com"
          - type: "selector"
            value: "h1"

      - name: "take_screenshot"
        type: "web"
        action:
          command: "screenshot"
          options:
            path: "results/screenshots/example-{{__VU}}-{{timestamp}}.png"

      - name: "wait_and_verify"
        type: "web"
        action:
          command: "wait_for_selector"
          selector: "body"
          timeout: 5000

outputs:
  - type: "json"
    file: "results/web-example.json"

report:
  generate: true
  output: "reports/web-example-report.html"
`;

  const mixedExample = `name: "Mixed Protocol Example"
description: "Example combining API calls and web interactions"

global:
  base_url: "https://httpbin.org"
  browser:
    type: "chromium"
    headless: true

load:
  pattern: "basic"
  virtual_users: 2
  duration: "1m"

scenarios:
  - name: "api_web_combination"
    weight: 100
    loop: 1
    steps:
      # API interaction
      - name: "api_get_json"
        type: "rest"
        method: "GET"
        path: "/json"
        checks:
          - type: "status"
            value: 200
        extract:
          - name: "slideshow_title"
            type: "json_path"
            expression: "$.slideshow.title"

      # Wait step
      - name: "processing_delay"
        type: "wait"
        duration: "1s"

      # Web interaction
      - name: "visit_website"
        type: "web"
        action:
          command: "goto"
          url: "https://example.com"
        checks:
          - type: "url_contains"
            value: "example.com"

      # Custom validation
      - name: "validate_extracted_data"
        type: "custom"
        script: |
          const title = context.extracted_data.slideshow_title;
          if (!title) {
            throw new Error('No slideshow title extracted from API');
          }
          return { 
            validation_passed: true, 
            title_length: title.length 
          };

outputs:
  - type: "json"
    file: "results/mixed-example.json"

report:
  generate: true
  output: "reports/mixed-example-report.html"
`;

  // Write example files
  fs.writeFileSync(path.join(projectDir, 'tests/api/advanced-example.yml'), advancedAPIExample);
  fs.writeFileSync(path.join(projectDir, 'tests/web/web-example.yml'), webExampleAdvanced);
  fs.writeFileSync(path.join(projectDir, 'tests/mixed/mixed-example.yml'), mixedExample);
  
  // Create example TypeScript script
  const exampleScript = `// Example TypeScript helpers for performance tests
// Use with type: "script" steps in your test scenarios

interface ScriptParams {
  __context?: any;
  __variables?: Record<string, any>;
  __extracted_data?: Record<string, any>;
  __vu_id?: number;
  __iteration?: number;
  [key: string]: any;
}

/**
 * Generate test user data
 * Usage in YAML:
 *   - type: "script"
 *     file: "scripts/helpers.ts"
 *     function: "generateUsers"
 *     params:
 *       count: 5
 *       prefix: "user"
 *     returns: "users"
 */
export function generateUsers(params: ScriptParams) {
  const count = params.count || 1;
  const prefix = params.prefix || 'user';

  return {
    users: Array.from({ length: count }, (_, i) => ({
      id: \`\${prefix}-\${i + 1}\`,
      name: \`Test User \${i + 1}\`,
      email: \`\${prefix}\${i + 1}@example.com\`
    })),
    generatedAt: new Date().toISOString(),
    vuId: params.__vu_id,
    iteration: params.__iteration
  };
}

/**
 * Calculate total from items array
 * Usage in YAML:
 *   - type: "script"
 *     file: "scripts/helpers.ts"
 *     function: "calculateTotal"
 *     params:
 *       items: [{ price: 10 }, { price: 20 }]
 *     returns: "totals"
 */
export function calculateTotal(params: ScriptParams) {
  const items = params.items || [];
  const total = items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

  return {
    total,
    itemCount: items.length,
    average: items.length > 0 ? total / items.length : 0
  };
}

/**
 * Validate API response
 */
export function validateResponse(params: ScriptParams) {
  const response = params.response;
  const expectedStatus = params.expectedStatus || 'ok';

  if (!response) {
    return { valid: false, error: 'No response provided' };
  }

  return {
    valid: response.status === expectedStatus,
    status: response.status
  };
}
`;

  fs.writeFileSync(path.join(projectDir, 'scripts/helpers.ts'), exampleScript);
  
  logger.info('✅ Example files created');
}

function createBasicTemplate(projectDir: string): void {
  // Simple working test against local mock server
  const basicTest = `name: "API Health Check"
description: "Simple API status check against local mock server"

global:
  base_url: "http://localhost:3000"
  timeout: 30000

load:
  pattern: basic
  virtual_users: 10
  ramp_up: 10s

scenarios:
  - name: "health_check"
    loop: 1
    steps:
      - name: "check_status"
        type: "rest"
        method: "GET"
        path: "/status"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results/health-check.json"

report:
  generate: true
  output: "reports/health-check-report.html"
`;

  // Load test against local mock server
  const loadTest = `name: "Sample Load Test"
description: "Load test against local mock server"

# First start the mock server: perfornium mock
global:
  base_url: "http://localhost:3000"
  timeout: 30000

load:
  pattern: "basic"
  virtual_users: 5
  ramp_up: "10s"
  duration: "30s"

scenarios:
  - name: "api_requests"
    weight: 100
    loop: 3
    steps:
      - name: "get_users"
        type: "rest"
        method: "GET"
        path: "/users"
        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            value: 1000
            operator: "lt"

      - name: "get_products"
        type: "rest"
        method: "GET"
        path: "/products"
        checks:
          - type: "status"
            value: 200

      - name: "get_random"
        type: "rest"
        method: "GET"
        path: "/random"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results/load-test.json"

report:
  generate: true
  output: "reports/load-test-report.html"
`;

  // Create sample CSV data file
  const sampleCSV = `username,password,email
user1,pass123,user1@example.com
user2,pass456,user2@example.com
user3,pass789,user3@example.com
`;

  // Script test example - demonstrates calling TypeScript functions
  const scriptTest = `name: "Script Step Example"
description: "Demonstrates calling TypeScript functions from tests"

global:
  base_url: "http://localhost:3000"
  timeout: 30000

load:
  pattern: basic
  virtual_users: 2
  ramp_up: 2s

scenarios:
  - name: "script_workflow"
    loop: 1
    steps:
      # Call TypeScript function to generate test data
      - name: "generate_users"
        type: "script"
        file: "scripts/helpers.ts"
        function: "generateUsers"
        params:
          count: 3
          prefix: "test"
        returns: "user_data"

      # Use API endpoint
      - name: "check_status"
        type: "rest"
        method: "GET"
        path: "/status"
        checks:
          - type: "status"
            value: 200

      # Call another TypeScript function
      - name: "calculate_prices"
        type: "script"
        file: "scripts/helpers.ts"
        function: "calculateTotal"
        params:
          items:
            - name: "Item 1"
              price: 10.50
            - name: "Item 2"
              price: 25.00
        returns: "price_data"

outputs:
  - type: "json"
    file: "results/script-test.json"
`;

  // TypeScript helper script
  const helperScript = `// TypeScript helpers for performance tests
// Use with type: "script" steps in your test scenarios

interface ScriptParams {
  __context?: any;
  __variables?: Record<string, any>;
  __extracted_data?: Record<string, any>;
  __vu_id?: number;
  __iteration?: number;
  [key: string]: any;
}

/**
 * Generate test user data
 */
export function generateUsers(params: ScriptParams) {
  const count = params.count || 1;
  const prefix = params.prefix || 'user';

  return {
    users: Array.from({ length: count }, (_, i) => ({
      id: \`\${prefix}-\${i + 1}\`,
      name: \`Test User \${i + 1}\`,
      email: \`\${prefix}\${i + 1}@example.com\`
    })),
    generatedAt: new Date().toISOString(),
    vuId: params.__vu_id,
    iteration: params.__iteration
  };
}

/**
 * Calculate total from items array
 */
export function calculateTotal(params: ScriptParams) {
  const items = params.items || [];
  const total = items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

  return {
    total,
    itemCount: items.length,
    average: items.length > 0 ? total / items.length : 0
  };
}

/**
 * Validate API response
 */
export function validateResponse(params: ScriptParams) {
  const response = params.response;
  const expectedStatus = params.expectedStatus || 'ok';

  if (!response) {
    return { valid: false, error: 'No response provided' };
  }

  return {
    valid: response.status === expectedStatus,
    status: response.status
  };
}
`;

  // JSON payload file example - create-user.json
  const createUserPayload = `{
  "name": "Default User",
  "email": "default@example.com",
  "age": 25,
  "role": "user",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "bio": "Default bio text"
  },
  "settings": {
    "notifications": true,
    "theme": "light"
  }
}
`;

  // JSON payload file example - update-user.json
  const updateUserPayload = `{
  "name": "Updated Name",
  "profile": {
    "bio": "Updated bio"
  },
  "settings": {
    "theme": "dark"
  }
}
`;

  // Templating example test - demonstrates jsonFile with overrides
  const templatingTest = `name: "Payload Templating Example"
description: "Demonstrates loading JSON payloads from files with dynamic overrides"

# This test shows how to:
# 1. Load request payloads from external JSON files
# 2. Override specific values using variables, faker, and extracted data
# 3. Use dot notation to override nested properties

global:
  base_url: "http://localhost:3000"
  timeout: 30000

load:
  pattern: basic
  virtual_users: 2
  ramp_up: 5s

scenarios:
  - name: "payload_templating"
    loop: 1
    variables:
      default_role: "tester"
    steps:
      # Example 1: Load JSON file and override with faker data
      - name: "create_user_with_faker"
        type: "rest"
        method: "POST"
        path: "/users"
        jsonFile: "payloads/create-user.json"
        overrides:
          name: "{{faker.person.fullName}}"
          email: "{{faker.internet.email}}"
          profile.firstName: "{{faker.person.firstName}}"
          profile.lastName: "{{faker.person.lastName}}"
        checks:
          - type: "status"
            value: 200
        extract:
          - name: "created_user_id"
            type: "json_path"
            expression: "$.id"
            default: "1"

      # Example 2: Override with variables and VU context
      - name: "create_user_with_variables"
        type: "rest"
        method: "POST"
        path: "/users"
        jsonFile: "payloads/create-user.json"
        overrides:
          name: "Test User VU{{__VU}}"
          email: "vu{{__VU}}-iter{{__ITER}}@test.com"
          role: "{{default_role}}"
          age: 30
          settings.notifications: false
        checks:
          - type: "status"
            value: 200

      # Example 3: Use extracted data in overrides
      - name: "update_created_user"
        type: "rest"
        method: "PUT"
        path: "/users/{{created_user_id}}"
        jsonFile: "payloads/update-user.json"
        overrides:
          name: "Updated by VU{{__VU}}"
          profile.bio: "Updated at iteration {{__ITER}}"
        checks:
          - type: "status"
            value: 200

      # Example 4: Simple JSON without file (for comparison)
      - name: "inline_json_example"
        type: "rest"
        method: "POST"
        path: "/users"
        json:
          name: "{{faker.person.fullName}}"
          email: "{{faker.internet.email}}"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results/templating-test.json"

report:
  generate: true
  output: "reports/templating-test-report.html"
`;

  // Faker example test - demonstrates dynamic data generation
  const fakerTest = `name: "Faker Data Generation Example"
description: "Demonstrates using faker to generate realistic test data"

# Faker is lazily loaded - only initialized when faker expressions are used
# This keeps startup fast for tests that don't need dynamic data

global:
  base_url: "http://localhost:3000"
  timeout: 30000
  # Optional: Configure faker locale (en, de, fr, es, nl)
  # faker:
  #   locale: "en"
  #   seed: 12345  # Optional: for reproducible data

load:
  pattern: basic
  virtual_users: 3
  ramp_up: 5s
  duration: 30s

scenarios:
  - name: "user_registration"
    weight: 100
    loop: 2
    steps:
      # Create user with fully random data
      - name: "register_new_user"
        type: "rest"
        method: "POST"
        path: "/users"
        json:
          # Person data
          firstName: "{{faker.person.firstName}}"
          lastName: "{{faker.person.lastName}}"
          fullName: "{{faker.person.fullName}}"
          jobTitle: "{{faker.person.jobTitle}}"

          # Contact info
          email: "{{faker.internet.email}}"
          phone: "{{faker.phone.number}}"

          # Address
          address:
            street: "{{faker.location.streetAddress}}"
            city: "{{faker.location.city}}"
            state: "{{faker.location.state}}"
            zipCode: "{{faker.location.zipCode}}"
            country: "{{faker.location.country}}"

          # Account details
          username: "{{faker.internet.username}}"
          password: "{{faker.internet.password}}"

          # Identifiers
          id: "{{faker.string.uuid}}"

          # Numbers
          age: "{{randomInt(18, 65)}}"
          score: "{{randomInt(0, 100)}}"

          # Dates
          registeredAt: "{{isoDate(0)}}"
          birthDate: "{{isoDate(-10000)}}"
        checks:
          - type: "status"
            value: 200
        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.id"
            default: "{{faker.string.uuid}}"

      # Create a product with random data
      - name: "create_product"
        type: "rest"
        method: "POST"
        path: "/products"
        json:
          name: "{{faker.commerce.productName}}"
          description: "{{faker.commerce.productDescription}}"
          price: "{{randomInt(10, 500)}}"
          category: "{{faker.commerce.department}}"
          sku: "{{faker.string.alphanumeric(10)}}"
          inStock: true
          createdBy: "{{user_id}}"
        checks:
          - type: "status"
            value: 200

      # Create an order combining user and product data
      - name: "create_order"
        type: "rest"
        method: "POST"
        path: "/orders"
        json:
          orderId: "{{faker.string.uuid}}"
          userId: "{{user_id}}"
          items:
            - productName: "{{faker.commerce.productName}}"
              quantity: "{{randomInt(1, 5)}}"
              price: "{{randomInt(10, 100)}}"
          shippingAddress:
            recipient: "{{faker.person.fullName}}"
            street: "{{faker.location.streetAddress}}"
            city: "{{faker.location.city}}"
            zipCode: "{{faker.location.zipCode}}"
          paymentMethod: "{{randomChoice('credit_card', 'paypal', 'bank_transfer')}}"
          notes: "{{faker.lorem.sentence}}"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results/faker-test.json"

report:
  generate: true
  output: "reports/faker-test-report.html"
`;

  // Workers configuration for distributed testing
  const workersConfig = `[
  {
    "host": "localhost",
    "port": 8080,
    "capacity": 100,
    "region": "local"
  },
  {
    "host": "localhost",
    "port": 8081,
    "capacity": 100,
    "region": "local"
  }
]
`;

  fs.writeFileSync(path.join(projectDir, 'tests/api/sample-test.yml'), basicTest);
  fs.writeFileSync(path.join(projectDir, 'tests/api/load-test.yml'), loadTest);
  fs.writeFileSync(path.join(projectDir, 'tests/api/script-test.yml'), scriptTest);
  fs.writeFileSync(path.join(projectDir, 'tests/api/templating-test.yml'), templatingTest);
  fs.writeFileSync(path.join(projectDir, 'tests/api/faker-test.yml'), fakerTest);
  fs.writeFileSync(path.join(projectDir, 'scripts/helpers.ts'), helperScript);
  fs.writeFileSync(path.join(projectDir, 'data/users.csv'), sampleCSV);
  fs.writeFileSync(path.join(projectDir, 'payloads/create-user.json'), createUserPayload);
  fs.writeFileSync(path.join(projectDir, 'payloads/update-user.json'), updateUserPayload);
  fs.writeFileSync(path.join(projectDir, 'config/workers.json'), workersConfig);
}

function createAPITemplate(projectDir: string): void {
  createBasicTemplate(projectDir);
  
  const advancedTest = `name: "Advanced API Test"
description: "Complex API testing with authentication and data flow"

global:
  base_url: "https://reqres.in/api"
  timeout: 30

load:
  pattern: "stepping"
  steps:
    - users: 5
      duration: "1m"
    - users: 15
      duration: "2m"
    - users: 10
      duration: "1m"

scenarios:
  - name: "user_lifecycle"
    weight: 100
    loop: 1
    steps:
      - name: "create_user"
        type: "rest"
        method: "POST"
        path: "/users"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "name": "Test User {{__VU}}",
            "job": "Performance Tester"
          }
        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.id"

      - name: "get_user"
        type: "rest"
        method: "GET"
        path: "/users/{{user_id}}"
        checks:
          - type: "status"
            value: 200

      - name: "update_user"
        type: "rest"
        method: "PUT"
        path: "/users/{{user_id}}"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "name": "Updated User {{__VU}}",
            "job": "Senior Tester"
          }

outputs:
  - type: "json"
    file: "results/advanced-api-{{timestamp}}.json"
  - type: "csv"
    file: "results/advanced-api-{{timestamp}}.csv"

report:
  generate: true
  output: "reports/advanced-api-report.html"
`;
  
  fs.writeFileSync(path.join(projectDir, 'tests/api/advanced-test.yml'), advancedTest);
}

function createWebTemplate(projectDir: string): void {
  const webTest = `name: "Web Application Test"
description: "Testing web application user interactions"

global:
  browser:
    type: "chromium"
    headless: true
    viewport:
      width: 1920
      height: 1080

load:
  pattern: "basic"
  virtual_users: 5
  ramp_up: "1m"
  duration: "3m"

scenarios:
  - name: "web_user_journey"
    weight: 100
    loop: 1
    think_time: "2-4"
    steps:
      - name: "visit_homepage"
        type: "web"
        action:
          command: "goto"
          url: "https://example.com"
        checks:
          - type: "url_contains"
            value: "example.com"
          - type: "selector"
            value: "h1"

      - name: "take_screenshot"
        type: "web"
        action:
          command: "screenshot"
          options:
            path: "results/screenshots/homepage-{{__VU}}-{{timestamp}}.png"

outputs:
  - type: "json"
    file: "results/web-test-{{timestamp}}.json"

report:
  generate: true
  output: "reports/web-test-report.html"
`;
  
  fs.writeFileSync(path.join(projectDir, 'tests/web/sample-web-test.yml'), webTest);
}

function createMixedTemplate(projectDir: string): void {
  createBasicTemplate(projectDir);
  createWebTemplate(projectDir);
  
  const mixedTest = `name: "Mixed Protocol Test"
description: "Testing both API and web interactions"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  browser:
    type: "chromium"
    headless: true

load:
  pattern: "basic"
  virtual_users: 3
  ramp_up: "30s"
  duration: "2m"

scenarios:
  - name: "api_to_web_flow"
    weight: 100
    loop: 1
    steps:
      # API interaction
      - name: "fetch_data_api"
        type: "rest"
        method: "GET"
        path: "/posts/1"
        checks:
          - type: "status"
            value: 200
        extract:
          - name: "post_title"
            type: "json_path"
            expression: "$.title"

      # Wait step
      - name: "processing_time"
        type: "wait"
        duration: "2s"

      # Web interaction
      - name: "visit_web_page"
        type: "web"
        action:
          command: "goto"
          url: "https://example.com"
        checks:
          - type: "url_contains"
            value: "example.com"

      # Custom validation
      - name: "validate_data"
        type: "custom"
        script: |
          // Custom validation logic
          const postTitle = context.extracted_data.post_title;
          if (!postTitle || postTitle.length === 0) {
            throw new Error('No post title extracted');
          }
          return { validated: true, title_length: postTitle.length };

outputs:
  - type: "json"
    file: "results/mixed-test-{{timestamp}}.json"

report:
  generate: true
  output: "reports/mixed-test-report.html"
`;
  
  fs.writeFileSync(path.join(projectDir, 'tests/mixed/sample-mixed-test.yml'), mixedTest);
}

function createEnvironmentConfigs(projectDir: string): void {
  const devConfig = `# Development environment
base_url: "http://localhost:3000"
timeout: 10

load:
  virtual_users: 2
  duration: "30s"

browser:
  headless: false

outputs:
  - type: "json"
    file: "results/dev-{{timestamp}}.json"
`;

  const stagingConfig = `# Staging environment
base_url: "https://staging-api.example.com"
timeout: 20

load:
  virtual_users: 10
  duration: "5m"

outputs:
  - type: "json"
    file: "results/staging-{{timestamp}}.json"
`;

  const prodConfig = `# Production environment
base_url: "https://api.example.com"
timeout: 30

load:
  virtual_users: 50
  duration: "30m"

outputs:
  - type: "json"
    file: "results/prod-{{timestamp}}.json"

report:
  generate: true
  output: "reports/production-{{timestamp}}.html"
`;

  fs.writeFileSync(path.join(projectDir, 'config/environments/dev.yml'), devConfig);
  fs.writeFileSync(path.join(projectDir, 'config/environments/staging.yml'), stagingConfig);
  fs.writeFileSync(path.join(projectDir, 'config/environments/production.yml'), prodConfig);
}

function generateReadme(projectName: string, template: string): string {
  return `# ${projectName}

Performance testing project created with Perfornium framework.

## Getting Started

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Run a test:**
   \`\`\`bash
   perfornium run tests/api/sample-test.yml
   \`\`\`

3. **Run with environment:**
   \`\`\`bash
   perfornium run tests/api/sample-test.yml --env dev
   \`\`\`

4. **Generate report:**
   \`\`\`bash
   perfornium run tests/api/sample-test.yml --report
   \`\`\`

## Project Structure

- \`tests/\` - Test configurations
  - \`api/\` - REST API tests
  - \`web/\` - Web application tests
  - \`mixed/\` - Mixed protocol tests
- \`config/environments/\` - Environment-specific configurations
- \`data/\` - CSV and test data files
- \`payloads/\` - JSON/XML payload templates for API tests
- \`scripts/\` - Custom scripts and utilities
- \`results/\` - Test results (JSON, CSV, screenshots)
- \`reports/\` - HTML reports (auto-generated)

## Using Faker for Dynamic Data

Generate realistic test data using faker (lazily loaded for performance):

\`\`\`yaml
steps:
  - name: "create_user"
    type: "rest"
    method: "POST"
    path: "/users"
    json:
      firstName: "{{faker.person.firstName}}"
      lastName: "{{faker.person.lastName}}"
      email: "{{faker.internet.email}}"
      phone: "{{faker.phone.number}}"
      address:
        city: "{{faker.location.city}}"
        zipCode: "{{faker.location.zipCode}}"
      age: "{{randomInt(18, 65)}}"
      role: "{{randomChoice('admin', 'user', 'guest')}}"
\`\`\`

See \`tests/api/faker-test.yml\` for comprehensive examples.

## Using Payload Files

Load JSON payloads from files and override values dynamically:

\`\`\`yaml
steps:
  - name: "create_user"
    type: "rest"
    method: "POST"
    path: "/users"
    jsonFile: "payloads/create-user.json"
    overrides:
      email: "{{faker.internet.email}}"
      profile.firstName: "{{firstName}}"
      settings.notifications: false
\`\`\`

See \`tests/api/templating-test.yml\` for more examples.

## Distributed Testing

Run load tests across multiple worker nodes for higher throughput:

\`\`\`bash
# Terminal 1: Start first worker
perfornium worker --port 8080

# Terminal 2: Start second worker
perfornium worker --port 8081

# Terminal 3: Run distributed test
perfornium distributed tests/api/load-test.yml --workers-file config/workers.json --report
\`\`\`

Workers configuration is in \`config/workers.json\`. You can also specify workers inline:

\`\`\`bash
perfornium distributed tests/api/load-test.yml --workers "localhost:8080,localhost:8081"
\`\`\`

## Available Commands

\`\`\`bash
# Run tests
npm run test                 # Run default test
npm run test:api            # Run API tests
npm run test:web            # Run web tests
npm run test:mixed          # Run mixed tests

# Distributed testing
npm run worker:8080         # Start worker on port 8080
npm run worker:8081         # Start worker on port 8081
npm run distributed tests/api/load-test.yml  # Run distributed test

# Validate configurations
npm run validate tests/api/sample-test.yml

# Record web interactions
npm run record https://example.com

# Generate reports
npm run report results/test-results.json
\`\`\`

## Template: ${template}

${getTemplateDescription(template)}

## Environment Configuration

Use different environments:
- \`--env dev\` - Development (localhost)
- \`--env staging\` - Staging environment
- \`--env production\` - Production environment

## Learn More

- [Perfornium Documentation](https://github.com/your-org/perfornium)
- [Example Configurations](./tests/)
- [Environment Setup](./config/environments/)
`;
}

function getTemplateDescription(template: string): string {
  const descriptions = {
    basic: 'Simple REST API testing setup with basic load patterns.',
    api: 'Advanced API testing with authentication, data extraction, and complex workflows.',
    web: 'Web application testing using Playwright for browser automation.',
    mixed: 'Combined API and web testing for complete user journey validation.'
  };
  
  return descriptions[template as keyof typeof descriptions] || 'Custom template configuration.';
}
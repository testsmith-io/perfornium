import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

// Read package version dynamically
const packageJsonPath = path.join(__dirname, '../../../package.json');
const packageVersion = fs.existsSync(packageJsonPath)
  ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
  : '1.0.0';

// ============================================================================
// TEMPLATES - Single source of truth for all generated files
// ============================================================================

const TEMPLATES = {
  // TypeScript helper script (used by both basic and examples)
  helperScript: `// TypeScript helpers for performance tests
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
`,

  // Sample CSV data
  sampleCSV: `username,password,email
user1,pass123,user1@example.com
user2,pass456,user2@example.com
user3,pass789,user3@example.com
`,

  // JSON payloads
  createUserPayload: `{
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
`,

  updateUserPayload: `{
  "name": "Updated Name",
  "profile": {
    "bio": "Updated bio"
  },
  "settings": {
    "theme": "dark"
  }
}
`,

  // Workers configuration
  workersConfig: `[
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
`,

  // Git ignore
  gitignore: `node_modules/
results/
reports/
*.log
.env
.DS_Store
`,

  // Environment configs
  envDev: `# Development environment
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
`,

  envStaging: `# Staging environment
base_url: "https://staging-api.example.com"
timeout: 20

load:
  virtual_users: 10
  duration: "5m"

outputs:
  - type: "json"
    file: "results/staging-{{timestamp}}.json"
`,

  envProduction: `# Production environment
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
`,
};

// Test templates
const TEST_TEMPLATES = {
  basicTest: `name: "API Health Check"
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
`,

  loadTest: `name: "Sample Load Test"
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
`,

  scriptTest: `name: "Script Step Example"
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
      - name: "generate_users"
        type: "script"
        file: "scripts/helpers.ts"
        function: "generateUsers"
        params:
          count: 3
          prefix: "test"
        returns: "user_data"

      - name: "check_status"
        type: "rest"
        method: "GET"
        path: "/status"
        checks:
          - type: "status"
            value: 200

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
`,

  templatingTest: `name: "Payload Templating Example"
description: "Demonstrates loading JSON payloads from files with dynamic overrides"

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

outputs:
  - type: "json"
    file: "results/templating-test.json"

report:
  generate: true
  output: "reports/templating-test-report.html"
`,

  fakerTest: `name: "Faker Data Generation Example"
description: "Demonstrates using faker to generate realistic test data"

global:
  base_url: "http://localhost:3000"
  timeout: 30000

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
      - name: "register_new_user"
        type: "rest"
        method: "POST"
        path: "/users"
        json:
          firstName: "{{faker.person.firstName}}"
          lastName: "{{faker.person.lastName}}"
          fullName: "{{faker.person.fullName}}"
          email: "{{faker.internet.email}}"
          phone: "{{faker.phone.number}}"
          address:
            street: "{{faker.location.streetAddress}}"
            city: "{{faker.location.city}}"
            state: "{{faker.location.state}}"
            zipCode: "{{faker.location.zipCode}}"
          username: "{{faker.internet.username}}"
          id: "{{faker.string.uuid}}"
          age: "{{randomInt(18, 65)}}"
        checks:
          - type: "status"
            value: 200
        extract:
          - name: "user_id"
            type: "json_path"
            expression: "$.id"
            default: "{{faker.string.uuid}}"

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

outputs:
  - type: "json"
    file: "results/faker-test.json"

report:
  generate: true
  output: "reports/faker-test-report.html"
`,

  advancedAPITest: `name: "Advanced API Test"
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
`,

  webTest: `name: "Web Application Test"
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
`,

  mixedTest: `name: "Mixed Protocol Test"
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

      - name: "processing_time"
        type: "wait"
        duration: "2s"

      - name: "visit_web_page"
        type: "web"
        action:
          command: "goto"
          url: "https://example.com"
        checks:
          - type: "url_contains"
            value: "example.com"

      - name: "validate_data"
        type: "custom"
        script: |
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
`,
};

// ============================================================================
// MAIN COMMAND
// ============================================================================

export interface InitOptions {
  template?: string;
  examples?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export async function initCommand(
  directory: string,
  options: InitOptions
): Promise<void> {
  try {
    const projectDir = path.resolve(directory);
    const template = options.template || 'basic';
    const dryRun = options.dryRun || false;

    // Check if directory already has files
    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0 && !options.force) {
      const hasPackageJson = fs.existsSync(path.join(projectDir, 'package.json'));
      if (hasPackageJson) {
        logger.error(`Directory ${projectDir} already contains a project. Use --force to overwrite.`);
        process.exit(1);
      }
    }

    if (dryRun) {
      console.log('⚠️  DRY RUN - No files will be created\n');
    }

    console.log(`🚀 Initializing new perfornium project in: ${projectDir}\n`);

    // Collect all files to create
    const filesToCreate: Array<{ path: string; content: string }> = [];

    // Create directory structure
    const dirs = [
      'tests/api',
      'tests/web',
      'tests/mixed',
      'config/environments',
      'scripts',
      'data',
      'payloads',
      'results',
      'results/screenshots',
      'reports'
    ];

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
        'mock': 'perfornium mock',
        'worker': 'perfornium worker',
        'worker:8080': 'perfornium worker --port 8080',
        'worker:8081': 'perfornium worker --port 8081',
        'distributed': 'perfornium distributed --workers-file config/workers.json -s even --sync-start'
      },
      devDependencies: {
        '@testsmith/perfornium': `^${packageVersion}`
      }
    };

    filesToCreate.push({
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2)
    });

    // Add common files
    filesToCreate.push({ path: '.gitignore', content: TEMPLATES.gitignore });
    filesToCreate.push({ path: 'scripts/helpers.ts', content: TEMPLATES.helperScript });
    filesToCreate.push({ path: 'data/users.csv', content: TEMPLATES.sampleCSV });
    filesToCreate.push({ path: 'payloads/create-user.json', content: TEMPLATES.createUserPayload });
    filesToCreate.push({ path: 'payloads/update-user.json', content: TEMPLATES.updateUserPayload });
    filesToCreate.push({ path: 'config/workers.json', content: TEMPLATES.workersConfig });
    filesToCreate.push({ path: 'config/environments/dev.yml', content: TEMPLATES.envDev });
    filesToCreate.push({ path: 'config/environments/staging.yml', content: TEMPLATES.envStaging });
    filesToCreate.push({ path: 'config/environments/production.yml', content: TEMPLATES.envProduction });

    // Add template-specific files
    switch (template) {
      case 'api':
        filesToCreate.push({ path: 'tests/api/sample-test.yml', content: TEST_TEMPLATES.basicTest });
        filesToCreate.push({ path: 'tests/api/load-test.yml', content: TEST_TEMPLATES.loadTest });
        filesToCreate.push({ path: 'tests/api/script-test.yml', content: TEST_TEMPLATES.scriptTest });
        filesToCreate.push({ path: 'tests/api/templating-test.yml', content: TEST_TEMPLATES.templatingTest });
        filesToCreate.push({ path: 'tests/api/faker-test.yml', content: TEST_TEMPLATES.fakerTest });
        filesToCreate.push({ path: 'tests/api/advanced-test.yml', content: TEST_TEMPLATES.advancedAPITest });
        break;

      case 'web':
        filesToCreate.push({ path: 'tests/web/sample-web-test.yml', content: TEST_TEMPLATES.webTest });
        break;

      case 'mixed':
        filesToCreate.push({ path: 'tests/api/sample-test.yml', content: TEST_TEMPLATES.basicTest });
        filesToCreate.push({ path: 'tests/api/load-test.yml', content: TEST_TEMPLATES.loadTest });
        filesToCreate.push({ path: 'tests/web/sample-web-test.yml', content: TEST_TEMPLATES.webTest });
        filesToCreate.push({ path: 'tests/mixed/sample-mixed-test.yml', content: TEST_TEMPLATES.mixedTest });
        break;

      case 'basic':
      default:
        filesToCreate.push({ path: 'tests/api/sample-test.yml', content: TEST_TEMPLATES.basicTest });
        filesToCreate.push({ path: 'tests/api/load-test.yml', content: TEST_TEMPLATES.loadTest });
        filesToCreate.push({ path: 'tests/api/script-test.yml', content: TEST_TEMPLATES.scriptTest });
        filesToCreate.push({ path: 'tests/api/templating-test.yml', content: TEST_TEMPLATES.templatingTest });
        filesToCreate.push({ path: 'tests/api/faker-test.yml', content: TEST_TEMPLATES.fakerTest });
        break;
    }

    // Add example files if requested
    if (options.examples) {
      filesToCreate.push({ path: 'tests/api/advanced-example.yml', content: TEST_TEMPLATES.advancedAPITest });
      filesToCreate.push({ path: 'tests/web/web-example.yml', content: TEST_TEMPLATES.webTest });
      filesToCreate.push({ path: 'tests/mixed/mixed-example.yml', content: TEST_TEMPLATES.mixedTest });
    }

    // Add README
    filesToCreate.push({
      path: 'README.md',
      content: generateReadme(path.basename(projectDir), template)
    });

    // Create directories
    if (!dryRun) {
      dirs.forEach(dir => {
        const fullPath = path.join(projectDir, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      });
    }

    // Create/preview files
    for (const file of filesToCreate) {
      const fullPath = path.join(projectDir, file.path);

      if (dryRun) {
        console.log(`  [dry-run] Would create: ${file.path}`);
      } else {
        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content);
        console.log(`  ✓ ${file.path}`);
      }
    }

    // Summary
    if (dryRun) {
      console.log(`\n⚠️  DRY RUN complete. ${filesToCreate.length} files would be created.`);
      console.log('Run without --dry-run to create the project.');
    } else {
      console.log(`\n✅ Project initialized successfully!`);
      console.log(`📁 Template: ${template}`);
      console.log(`📄 Files created: ${filesToCreate.length}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   cd ${path.relative(process.cwd(), projectDir) || '.'}`);
      console.log(`   npm install`);
      console.log(`   perfornium mock          # Start mock server`);
      console.log(`   perfornium run tests/api/sample-test.yml --report`);
    }

  } catch (error: any) {
    logger.error(`Project initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// README GENERATOR
// ============================================================================

function generateReadme(projectName: string, template: string): string {
  const descriptions: Record<string, string> = {
    basic: 'Simple REST API testing setup with basic load patterns.',
    api: 'Advanced API testing with authentication, data extraction, and complex workflows.',
    web: 'Web application testing using Playwright for browser automation.',
    mixed: 'Combined API and web testing for complete user journey validation.'
  };

  return `# ${projectName}

Performance testing project created with Perfornium.

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start mock server (in one terminal)
perfornium mock

# Run a test (in another terminal)
perfornium run tests/api/sample-test.yml --report
\`\`\`

## Project Structure

\`\`\`
├── tests/
│   ├── api/          # REST API tests
│   ├── web/          # Web application tests
│   └── mixed/        # Mixed protocol tests
├── config/
│   ├── environments/ # Environment configs (dev, staging, prod)
│   └── workers.json  # Distributed testing workers
├── data/             # CSV and test data files
├── payloads/         # JSON/XML payload templates
├── scripts/          # TypeScript helper functions
├── results/          # Test results (auto-generated)
└── reports/          # HTML reports (auto-generated)
\`\`\`

## Running Tests

\`\`\`bash
# Run with HTML report
perfornium run tests/api/load-test.yml --report

# Run with environment config
perfornium run tests/api/load-test.yml -e config/environments/staging.yml

# Run with visible browser
perfornium run tests/web/sample-web-test.yml -g browser.headless=false

# Validate config without running
perfornium run tests/api/load-test.yml --dry-run
\`\`\`

## Distributed Testing

\`\`\`bash
# Terminal 1 & 2: Start workers
perfornium worker --port 8080
perfornium worker --port 8081

# Terminal 3: Run distributed test
perfornium distributed tests/api/load-test.yml \\
  --workers-file config/workers.json \\
  -s even --sync-start --report
\`\`\`

## Using Faker for Dynamic Data

\`\`\`yaml
steps:
  - name: "create_user"
    type: "rest"
    method: "POST"
    path: "/users"
    json:
      name: "{{faker.person.fullName}}"
      email: "{{faker.internet.email}}"
      age: "{{randomInt(18, 65)}}"
\`\`\`

## Template: ${template}

${descriptions[template] || 'Custom template configuration.'}

## Documentation

- [Perfornium Docs](https://perfornium.dev)
- [CLI Reference](https://perfornium.dev/#/cli)
- [Distributed Testing](https://perfornium.dev/#/advanced/distributed)
`;
}

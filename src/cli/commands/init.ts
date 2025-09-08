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
      'results',
      'reports',
      'screenshots'
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
        'report': 'perfornium report'
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
screenshots/
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
            path: "screenshots/example-{{__VU}}-{{timestamp}}.png"

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
  
  // Create example script
  const exampleScript = `// Example custom script for data generation
// This file can be used with custom steps in your test scenarios

function generateTestData(context) {
  return {
    timestamp: Date.now(),
    userId: context.vu_id,
    testData: \`test-data-\${Date.now()}\`
  };
}

function validateResponse(response, context) {
  if (!response || !response.data) {
    throw new Error('Invalid response structure');
  }
  
  return {
    isValid: true,
    responseSize: JSON.stringify(response.data).length
  };
}

module.exports = {
  generateTestData,
  validateResponse
};
`;

  fs.writeFileSync(path.join(projectDir, 'scripts/example-helpers.js'), exampleScript);
  
  logger.info('✅ Example files created');
}

function createBasicTemplate(projectDir: string): void {
  const basicTest = `name: "Sample Performance Test"
description: "Basic performance test template"

global:
  base_url: "https://jsonplaceholder.typicode.com"
  timeout: 30

load:
  pattern: "basic"
  virtual_users: 10
  ramp_up: "30s"
  duration: "2m"

scenarios:
  - name: "api_requests"
    weight: 100
    loop: 3
    steps:
      - name: "get_posts"
        type: "rest"
        method: "GET"
        path: "/posts"
        checks:
          - type: "status"
            value: 200
          - type: "response_time"
            value: 1000
            operator: "lt"

      - name: "get_specific_post"
        type: "rest"
        method: "GET"
        path: "/posts/1"
        checks:
          - type: "status"
            value: 200

outputs:
  - type: "json"
    file: "results/sample-test-{{timestamp}}.json"

report:
  generate: true
  output: "reports/sample-test-report.html"
`;
  
  fs.writeFileSync(path.join(projectDir, 'tests/api/sample-test.yml'), basicTest);
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
            path: "screenshots/homepage-{{__VU}}-{{timestamp}}.png"

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
- \`scripts/\` - Custom scripts and utilities
- \`results/\` - Test results (auto-generated)
- \`reports/\` - HTML reports (auto-generated)
- \`screenshots/\` - Web test screenshots

## Available Commands

\`\`\`bash
# Run tests
npm run test                 # Run default test
npm run test:api            # Run API tests
npm run test:web            # Run web tests
npm run test:mixed          # Run mixed tests

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
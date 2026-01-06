# TypeScript Configuration

Perfornium supports TypeScript configuration files, providing type safety, IntelliSense, and better development experience for complex test configurations.

## Getting Started with TypeScript

### Prerequisites

- TypeScript 4.0 or higher
- Node.js 16 or higher
- Perfornium with TypeScript support

### Basic TypeScript Configuration

Create a test configuration file with `.ts` extension:

```typescript
// my-test.config.ts
import { PerforniumConfig } from '@testsmith/perfornium';

const config: PerforniumConfig = {
  name: "TypeScript API Test",
  description: "Type-safe performance testing configuration",
  
  global: {
    base_url: "https://api.example.com",
    timeout: 30000,
    headers: {
      'User-Agent': 'Perfornium-TS/1.0',
      'Accept': 'application/json'
    },
    debug: {
      log_level: "info",
      capture_request_headers: true,
      capture_response_body: true
    }
  },

  load: {
    pattern: "basic",
    virtual_users: 10,
    ramp_up: "30s",
    duration: "2m"
  },

  scenarios: [
    {
      name: "User Registration Flow",
      steps: [
        {
          name: "Register New User",
          type: "rest",
          method: "POST",
          path: "/users/register",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: "{{faker.internet.email}}",
            password: "{{faker.internet.password}}",
            firstName: "{{faker.person.firstName}}",
            lastName: "{{faker.person.lastName}}"
          }),
          checks: [
            {
              type: "status",
              value: 201,
              description: "Should return 201 Created"
            },
            {
              type: "json_path",
              value: "$.user.id",
              description: "Should return user ID"
            }
          ],
          extract: [
            {
              name: "user_id",
              type: "json_path",
              expression: "$.user.id"
            }
          ]
        }
      ]
    }
  ],

  outputs: [
    {
      type: "json",
      file: "results/typescript-test-{{timestamp}}.json"
    },
    {
      type: "csv",
      file: "results/typescript-test-{{timestamp}}.csv"
    }
  ],

  report: {
    generate: true,
    output: "reports/typescript-test-report.html"
  }
};

export default config;
```

### Running TypeScript Configuration

```bash
perfornium run my-test.config.ts
```

## Type Definitions

### Core Configuration Types

```typescript
interface PerforniumConfig {
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  global?: GlobalConfig;
  load: LoadConfig;
  scenarios: Scenario[];
  outputs?: OutputConfig[];
  report?: ReportConfig;
}
```

### Global Configuration

```typescript
interface GlobalConfig {
  base_url?: string;
  timeout?: number;
  think_time?: string;
  headers?: Record<string, string>;
  debug?: DebugConfig;
  faker?: FakerConfig;
  error_handling?: ErrorHandlingConfig;
}

interface DebugConfig {
  log_level?: 'debug' | 'info' | 'warn' | 'error';
  capture_request_headers?: boolean;
  capture_request_body?: boolean;
  capture_response_headers?: boolean;
  capture_response_body?: boolean;
  capture_only_failures?: boolean;
  max_response_body_size?: number;
}
```

### Load Pattern Types

```typescript
type LoadConfig = BasicLoadConfig | SteppingLoadConfig | ArrivalsLoadConfig;

interface BasicLoadConfig {
  pattern: 'basic';
  virtual_users: number;
  ramp_up?: string;
  duration?: string;
}

interface SteppingLoadConfig {
  pattern: 'stepping';
  start_users: number;
  step_users: number;
  step_duration: string;
  max_users: number;
  duration?: string;
}

interface ArrivalsLoadConfig {
  pattern: 'arrivals';
  rate: number;
  duration: string;
  max_virtual_users?: number;
  preallocation?: number;
}
```

### Scenario Types

```typescript
interface Scenario {
  name: string;
  weight?: number;
  loop?: number;
  think_time?: string;
  variables?: Record<string, any>;
  csv_data?: CSVDataConfig;
  hooks?: ScenarioHooks;
  steps: Step[];
}

interface CSVDataConfig {
  file: string;
  mode?: 'sequential' | 'random' | 'shared';
  delimiter?: string;
  header?: boolean;
  cycling?: boolean;
}

interface ScenarioHooks {
  beforeScenario?: string;
  afterScenario?: string;
}
```

### Step Types

```typescript
type Step = RESTStep | SOAPStep | WebStep | WaitStep | CustomStep;

interface RESTStep {
  name: string;
  type: 'rest';
  method: HTTPMethod;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  condition?: string;
  checks?: Check[];
  extract?: Extractor[];
  hooks?: StepHooks;
}

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
```

## Advanced TypeScript Features

### Generic Type Helpers

```typescript
// Type-safe scenario builder
class ScenarioBuilder<T = {}> {
  private scenario: Partial<Scenario> = {};

  name(name: string): ScenarioBuilder<T & { name: string }> {
    this.scenario.name = name;
    return this as any;
  }

  addRESTStep(step: Omit<RESTStep, 'type'>): ScenarioBuilder<T> {
    if (!this.scenario.steps) this.scenario.steps = [];
    this.scenario.steps.push({ ...step, type: 'rest' });
    return this;
  }

  withCSVData(config: CSVDataConfig): ScenarioBuilder<T> {
    this.scenario.csv_data = config;
    return this;
  }

  build(): T extends { name: string } ? Scenario : never {
    if (!this.scenario.name) {
      throw new Error('Scenario name is required');
    }
    return this.scenario as any;
  }
}

// Usage
const userScenario = new ScenarioBuilder()
  .name("User Management")
  .addRESTStep({
    name: "Create User",
    method: "POST",
    path: "/users",
    body: JSON.stringify({ name: "Test User" })
  })
  .withCSVData({
    file: "data/users.csv",
    mode: "sequential"
  })
  .build();
```

### Configuration Factory

```typescript
// Configuration factory with environment support
interface EnvironmentConfig {
  base_url: string;
  virtual_users: number;
  duration: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

class ConfigurationFactory {
  private environments: Record<string, EnvironmentConfig> = {
    development: {
      base_url: "http://localhost:3000",
      virtual_users: 2,
      duration: "30s",
      log_level: "debug"
    },
    staging: {
      base_url: "https://staging.api.example.com",
      virtual_users: 10,
      duration: "2m",
      log_level: "info"
    },
    production: {
      base_url: "https://api.example.com",
      virtual_users: 50,
      duration: "10m",
      log_level: "warn"
    }
  };

  createConfig(environment: keyof typeof this.environments): PerforniumConfig {
    const env = this.environments[environment];
    
    return {
      name: `API Test - ${environment}`,
      description: `Performance test for ${environment} environment`,
      
      global: {
        base_url: env.base_url,
        timeout: 30000,
        debug: {
          log_level: env.log_level,
          capture_request_headers: true,
          capture_response_body: environment !== 'production'
        }
      },
      
      load: {
        pattern: "basic",
        virtual_users: env.virtual_users,
        ramp_up: "30s",
        duration: env.duration
      },
      
      scenarios: this.createScenarios(),
      
      outputs: [
        {
          type: "json",
          file: `results/${environment}-test-{{timestamp}}.json`
        }
      ]
    };
  }

  private createScenarios(): Scenario[] {
    return [
      {
        name: "Health Check",
        steps: [
          {
            name: "GET Health",
            type: "rest",
            method: "GET",
            path: "/health",
            checks: [
              {
                type: "status",
                value: 200,
                description: "Health check should return 200"
              }
            ]
          }
        ]
      }
    ];
  }
}

// Usage
const factory = new ConfigurationFactory();
export default factory.createConfig('staging');
```

### Type-Safe Data Models

```typescript
// Define data models for type safety
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

// Type-safe step creator
function createUserRegistrationStep(userData: CreateUserRequest): RESTStep {
  return {
    name: "Register User",
    type: "rest",
    method: "POST",
    path: "/users/register",
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(userData),
    checks: [
      {
        type: "status",
        value: 201,
        description: "User should be created successfully"
      },
      {
        type: "json_path",
        value: "$.user.email",
        description: "Response should contain user email"
      }
    ],
    extract: [
      {
        name: "user_id",
        type: "json_path",
        expression: "$.user.id"
      }
    ]
  };
}
```

### Configuration Validation

```typescript
// Runtime configuration validation
import Joi from 'joi';

const configSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().optional(),
  global: Joi.object({
    base_url: Joi.string().uri().required(),
    timeout: Joi.number().positive().optional(),
    headers: Joi.object().optional()
  }).optional(),
  load: Joi.object({
    pattern: Joi.string().valid('basic', 'stepping', 'arrivals').required(),
    virtual_users: Joi.number().positive().required()
  }).required(),
  scenarios: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      steps: Joi.array().min(1).required()
    })
  ).min(1).required()
});

function validateConfig(config: PerforniumConfig): void {
  const { error } = configSchema.validate(config);
  if (error) {
    throw new Error(`Configuration validation failed: ${error.message}`);
  }
}

// Use validation in your config
const config: PerforniumConfig = {
  // ... your configuration
};

validateConfig(config);
export default config;
```

### Modular Configuration

```typescript
// base-config.ts
export const baseConfig = {
  global: {
    timeout: 30000,
    headers: {
      'User-Agent': 'Perfornium-TS/1.0'
    },
    debug: {
      log_level: "info" as const,
      capture_request_headers: true
    }
  },
  
  outputs: [
    {
      type: "json" as const,
      file: "results/test-{{timestamp}}.json"
    },
    {
      type: "csv" as const,
      file: "results/test-{{timestamp}}.csv"
    }
  ]
};

// auth-scenarios.ts
export const authScenarios: Scenario[] = [
  {
    name: "User Authentication",
    steps: [
      {
        name: "Login",
        type: "rest",
        method: "POST",
        path: "/auth/login",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: "{{faker.internet.email}}",
          password: "testpassword123"
        }),
        extract: [
          {
            name: "access_token",
            type: "json_path",
            expression: "$.access_token"
          }
        ]
      },
      {
        name: "Get Profile",
        type: "rest",
        method: "GET",
        path: "/user/profile",
        headers: {
          'Authorization': 'Bearer {{access_token}}'
        }
      }
    ]
  }
];

// main-config.ts
import { baseConfig } from './base-config';
import { authScenarios } from './auth-scenarios';

const config: PerforniumConfig = {
  name: "Modular TypeScript Test",
  description: "Example of modular TypeScript configuration",
  
  ...baseConfig,
  
  load: {
    pattern: "basic",
    virtual_users: 10,
    duration: "2m"
  },
  
  scenarios: [
    ...authScenarios,
    // Add more scenario modules
  ]
};

export default config;
```

### Environment-Specific Configuration

```typescript
// config/environments.ts
export interface Environment {
  name: string;
  base_url: string;
  virtual_users: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

export const environments: Record<string, Environment> = {
  dev: {
    name: "Development",
    base_url: "http://localhost:3000",
    virtual_users: 2,
    log_level: "debug"
  },
  stage: {
    name: "Staging",
    base_url: "https://staging.api.example.com",
    virtual_users: 10,
    log_level: "info"
  },
  prod: {
    name: "Production",
    base_url: "https://api.example.com",
    virtual_users: 50,
    log_level: "warn"
  }
};

// Get environment from command line or environment variable
const envName = process.argv[2] || process.env.PERFORNIUM_ENV || 'dev';
const env = environments[envName];

if (!env) {
  throw new Error(`Unknown environment: ${envName}`);
}

const config: PerforniumConfig = {
  name: `API Test - ${env.name}`,
  
  global: {
    base_url: env.base_url,
    debug: {
      log_level: env.log_level
    }
  },
  
  load: {
    pattern: "basic",
    virtual_users: env.virtual_users,
    duration: "2m"
  },
  
  scenarios: [
    // Your scenarios here
  ]
};

export default config;
```

### Testing Configuration

```typescript
// config.test.ts
import { describe, it, expect } from 'jest';
import config from './my-test.config';

describe('Performance Test Configuration', () => {
  it('should have required fields', () => {
    expect(config.name).toBeDefined();
    expect(config.load).toBeDefined();
    expect(config.scenarios).toBeDefined();
    expect(config.scenarios.length).toBeGreaterThan(0);
  });

  it('should have valid load configuration', () => {
    expect(config.load.virtual_users).toBeGreaterThan(0);
    expect(['basic', 'stepping', 'arrivals']).toContain(config.load.pattern);
  });

  it('should have valid scenarios', () => {
    config.scenarios.forEach(scenario => {
      expect(scenario.name).toBeDefined();
      expect(scenario.steps).toBeDefined();
      expect(scenario.steps.length).toBeGreaterThan(0);
    });
  });

  it('should have valid REST steps', () => {
    const restSteps = config.scenarios
      .flatMap(s => s.steps)
      .filter(step => step.type === 'rest');
    
    restSteps.forEach(step => {
      expect(step.method).toBeDefined();
      expect(step.path).toBeDefined();
    });
  });
});
```

### IDE Integration

#### VS Code Configuration

Add to `.vscode/settings.json`:

```json
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "files.associations": {
    "*.config.ts": "typescript"
  }
}
```

#### TSConfig for Perfornium

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node", "perfornium"]
  },
  "include": [
    "**/*.config.ts",
    "tests/**/*.ts",
    "config/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

## Best Practices

### 1. Use Strong Typing

```typescript
// Good: Strongly typed
interface APIEndpoint {
  method: HTTPMethod;
  path: string;
  expectedStatus: number;
}

const endpoints: APIEndpoint[] = [
  { method: 'GET', path: '/users', expectedStatus: 200 },
  { method: 'POST', path: '/users', expectedStatus: 201 }
];

// Bad: Loosely typed
const endpoints = [
  { method: 'GET', path: '/users', status: 200 },
  { method: 'POST', path: '/users', status: 201 }
];
```

### 2. Extract Common Configurations

```typescript
// common.ts
export const commonHeaders = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
} as const;

export const commonChecks = {
  status200: { type: 'status' as const, value: 200 },
  status201: { type: 'status' as const, value: 201 }
};

// Usage in config
steps: [
  {
    name: "API Call",
    type: "rest",
    method: "GET",
    path: "/data",
    headers: commonHeaders,
    checks: [commonChecks.status200]
  }
]
```

### 3. Use Configuration Builders

```typescript
class TestConfigBuilder {
  private config: Partial<PerforniumConfig> = {};

  name(name: string) {
    this.config.name = name;
    return this;
  }

  baseUrl(url: string) {
    this.config.global = { ...this.config.global, base_url: url };
    return this;
  }

  basicLoad(virtualUsers: number, duration: string) {
    this.config.load = {
      pattern: 'basic',
      virtual_users: virtualUsers,
      duration
    };
    return this;
  }

  addScenario(scenario: Scenario) {
    if (!this.config.scenarios) this.config.scenarios = [];
    this.config.scenarios.push(scenario);
    return this;
  }

  build(): PerforniumConfig {
    if (!this.config.name || !this.config.load || !this.config.scenarios) {
      throw new Error('Missing required configuration');
    }
    return this.config as PerforniumConfig;
  }
}
```

### 4. Environment Type Safety

```typescript
const ENVIRONMENTS = ['dev', 'stage', 'prod'] as const;
type Environment = typeof ENVIRONMENTS[number];

function getConfig(env: Environment): PerforniumConfig {
  // Type-safe environment handling
}
```

This comprehensive TypeScript configuration guide provides you with the tools and patterns needed to create maintainable, type-safe performance test configurations in Perfornium.
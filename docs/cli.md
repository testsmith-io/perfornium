# Perfornium CLI Reference

Command‑line interface for running, recording, importing, and reporting performance tests with Perfornium.

---

## Conventions

* `<>` = required argument, `[]` = optional.
* Comma‑separated lists should be quoted by your shell if they contain spaces.
* Unless noted, paths may be relative or absolute.

---

## Top‑level synopsis

```bash
perfornium <command> [options]
```

**Commands:** `run`, `distributed`, `validate`, `report`, `record`, `import <subcommand>`, `worker`, `mock`, `init`

---

## init — Initialize a new test project

Scaffold a project directory with a starter template.

**Usage**

```bash
perfornium init [directory] [options]
```

**Arguments**

* `[directory]` — Project directory (default: current directory `.`).

**Options**

| Option                      | Default | Description                                             |
| --------------------------- | ------: | ------------------------------------------------------- |
| `-t, --template <template>` | `basic` | Project template: `basic` \| `api` \| `web` \| `mixed`. |
| `--examples`                |       — | Include example test configurations.                    |

**Examples**

```bash
# Create a new project in ./perf with API‑focused template and examples
perfornium init perf -t api --examples
```

---

## run — Run a performance test

Run a test from a configuration file.

**Usage**

```bash
perfornium run <config> [options]
```

**Arguments**

* `<config>` — Test configuration file.

**Options**

| Option                        | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `-e, --env <environment>`     | Environment configuration.                                      |
| `-w, --workers <workers>`     | Comma‑separated list of worker addresses.                       |
| `-o, --output <directory>`    | Output directory for results.                                   |
| `-r, --report`                | Generate HTML report after test.                                |
| `--dry-run`                   | Validate configuration without running test.                    |
| `-v, --verbose`               | Enable verbose logging (info level).                            |
| `-d, --debug`                 | Enable debug logging (very detailed).                           |
| `--max-users <number>`        | Maximum virtual users override.                                 |
| `-g, --global <key=value>`    | Override any global config value (supports dot notation).       |

**Logging Levels**

By default, Perfornium runs quietly showing only warnings and errors. Use flags to increase verbosity:

| Flag | Level | Output |
| ---- | ----- | ------ |
| (none) | WARN | Only warnings and errors |
| `-v, --verbose` | INFO | Progress messages (loading config, test start/end, etc.) |
| `-d, --debug` | DEBUG | Detailed step-by-step execution, variable values, etc. |

**Global Variable Overrides (`-g, --global`)**

Override any global configuration value from the command line using dot notation for nested properties.

**Syntax:** `-g key=value` or `--global key.nested.path=value`

Values are automatically converted to the appropriate type:
- `true` / `false` → boolean
- Numbers → integer or float
- JSON objects/arrays → parsed JSON
- Everything else → string

**Common global config paths:**

| Path                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `base_url`                 | Base URL for all requests                            |
| `timeout`                  | Default timeout in milliseconds                      |
| `think_time`               | Think time between steps (e.g., `1s`, `500ms`)       |
| `browser.type`             | Browser type: `chromium`, `chrome`, `msedge`, `firefox`, `webkit` |
| `browser.headless`         | Run browser in headless mode (`true`/`false`)        |
| `browser.highlight`        | Highlight elements before interaction                |
| `browser.clear_storage`    | Clear browser storage at start                       |
| `browser.slow_mo`          | Slow down browser actions (ms)                       |
| `browser.viewport.width`   | Viewport width                                       |
| `browser.viewport.height`  | Viewport height                                      |
| `headers.<name>`           | Set a default header                                 |
| `variables.<name>`         | Set a global variable                                |

**Examples**

```bash
# Local run with report and verbose logs
perfornium run tests/api.yml -e env/staging.yml -o results/staging --report --verbose

# Validate only (no execution)
perfornium run tests/load.yml --dry-run

# Cap virtual users at 500
perfornium run tests/spike.yml --max-users 500

# Coordinate workers directly from a single node
perfornium run tests/endurance.yml -w "10.0.0.12:8080,10.0.0.13:8080"

# Override base URL for a different environment
perfornium run tests/api.yml -g base_url=https://staging.example.com

# Run web test with visible browser and element highlighting
perfornium run tests/web.yml -g browser.headless=false -g browser.highlight=true -g browser.slow_mo=100

# Switch browser type from config default
perfornium run tests/web.yml -g browser.type=firefox -g browser.headless=false

# Set custom variables from CLI
perfornium run tests/api.yml -g variables.API_KEY=secret123 -g variables.ENV=staging

# Override think time for faster execution
perfornium run tests/web.yml -g think_time=500ms

# Clear browser storage before running
perfornium run tests/login.yml -g browser.clear_storage=true

# Set default headers
perfornium run tests/api.yml -g headers.Authorization="Bearer token123"

# Set viewport size
perfornium run tests/web.yml -g browser.viewport.width=1920 -g browser.viewport.height=1080

# Multiple overrides in one command
perfornium run tests/web.yml \
  -g base_url=https://staging.example.com \
  -g browser.type=firefox \
  -g browser.headless=false \
  -g browser.highlight=true \
  -g timeout=60000
```

---

## validate — Validate test configuration

Check that a configuration (optionally with an environment) is valid.

**Usage**

```bash
perfornium validate <config> [options]
```

**Arguments**

* `<config>` — Test configuration file.

**Options**

| Option                    | Description                |
| ------------------------- | -------------------------- |
| `-e, --env <environment>` | Environment configuration. |

**Examples**

```bash
perfornium validate tests/api.yml -e env/local.yml
```

---

## report — Generate an HTML report

Build an HTML report from a results file.

**Usage**

```bash
perfornium report <results> [options]
```

**Arguments**

* `<results>` — Results file (JSON or CSV).

**Options**

| Option                      |       Default | Description             |
| --------------------------- | ------------: | ----------------------- |
| `-o, --output <file>`       | `report.html` | Output HTML file.       |
| `-t, --template <template>` |             — | Custom report template. |
| `--title <title>`           |             — | Custom report title.    |

**Examples**

```bash
perfornium report results/run_2025-09-07.json -o results/report.html --title "Staging Load Test"
```

---

## record — Record web interactions

Open a browser, capture user flows, and save a scenario file.

**Usage**

```bash
perfornium record <url> [options]
```

**Arguments**

* `<url>` — Starting URL for recording.

**Options**

| Option                    |                 Default | Description                                         |
| ------------------------- | ----------------------: | --------------------------------------------------- |
| `-o, --output <file>`     | `recorded-scenario.yml` | Output file for the recorded scenario.              |
| `-f, --format <format>`   |                  `yaml` | Output format: `yaml`, `json`, or `typescript`.     |
| `-b, --browser <browser>` |              `chromium` | Browser to use: `chromium`, `chrome`, `msedge`, `firefox`, `webkit`. |
| `--viewport <viewport>`   |                       — | Browser viewport size (e.g., `1920x1080`).          |
| `--base-url <url>`        |                       — | Base URL to relativize recorded URLs.               |

**Wait Points**

During recording, you can add wait points between actions:
- Press **Ctrl+W** (or **W + Enter**) in the terminal to add a wait point
- You'll be prompted to enter the wait duration (e.g., `2s`, `500ms`)

**Examples**

```bash
# Basic recording to YAML
perfornium record https://example.com --output flows/login.yml --viewport 1366x768 --base-url https://example.com

# Record to TypeScript format
perfornium record https://myapp.com -f typescript -o tests/user-flow.spec.ts

# Record to JSON format
perfornium record https://api.example.com -f json -o tests/flow.json

# Record using Microsoft Edge
perfornium record https://example.com -b msedge -o tests/edge-flow.yml

# Record using Google Chrome
perfornium record https://example.com -b chrome -o tests/chrome-flow.yml

# Record using Firefox
perfornium record https://example.com -b firefox -o tests/firefox-flow.yml
```

---

## import — Import scenarios from external artifacts

Generate test scenarios from existing API specs or recordings.

**Usage**

```bash
perfornium import <subcommand> [options]
```

**Subcommands**

### import openapi — From an OpenAPI spec

**Usage**

```bash
perfornium import openapi <spec-file> [options]
```

**Arguments**

* `<spec-file>` — OpenAPI specification (JSON or YAML).

**Options**

| Option                          |   Default | Description                                       |
| ------------------------------- | --------: | ------------------------------------------------- |
| `-o, --output <directory>`      | `./tests` | Output directory for generated tests.             |
| `-f, --format <format>`         |    `yaml` | Output format: `yaml` \| `json`.                  |
| `--base-url <url>`              |         — | Override base URL from spec.                      |
| `--tags <tags>`                 |         — | Comma‑separated list of tags to include.          |
| `--exclude-tags <tags>`         |         — | Comma‑separated list of tags to exclude.          |
| `--paths <paths>`               |         — | Comma‑separated list of path patterns to include. |
| `--methods <methods>`           |         — | Comma‑separated list of HTTP methods to include.  |
| `--auto-correlate`              |    `true` | Automatically detect and apply data correlations. |
| `--interactive`                 |    `true` | Interactive endpoint selection.                   |
| `--scenarios-per-file <number>` |      `10` | Maximum scenarios per output file.                |
| `-v, --verbose`                 |         — | Enable verbose logging.                           |

**Examples**

```bash
# Import only tagged endpoints and limit to GET/POST
perfornium import openapi openapi.yml --tags auth,orders --methods GET,POST -o tests/api
```

### import wsdl — From a WSDL

**Usage**

```bash
perfornium import wsdl <wsdl-file> [options]
```

**Arguments**

* `<wsdl-file>` — WSDL specification file.

**Options**

| Option                      |   Default | Description                                         |
| --------------------------- | --------: | --------------------------------------------------- |
| `-o, --output <directory>`  | `./tests` | Output directory for generated tests.               |
| `-f, --format <format>`     |    `yaml` | Output format: `yaml` \| `json`.                    |
| `--base-url <url>`          |         — | Override service endpoint URL.                      |
| `--services <services>`     |         — | Comma‑separated list of service names to include.   |
| `--operations <operations>` |         — | Comma‑separated list of operation names to include. |
| `--interactive`             |    `true` | Interactive service selection.                      |
| `-v, --verbose`             |         — | Enable verbose logging.                             |

**Examples**

```bash
perfornium import wsdl service.wsdl --services Billing,Accounts --operations CreateInvoice,GetInvoice
```

### import har — From a HAR recording

**Usage**

```bash
perfornium import har <har-file> [options]
```

**Arguments**

* `<har-file>` — HAR (HTTP Archive) file from a browser recording.

**Options**

| Option                        |   Default | Description                                       |
| ----------------------------- | --------: | ------------------------------------------------- |
| `-o, --output <directory>`    | `./tests` | Output directory for generated tests.             |
| `-f, --format <format>`       |    `yaml` | Output format: `yaml` \| `json`.                  |
| `--filter-domains <domains>`  |         — | Comma‑separated domains to include.               |
| `--exclude-domains <domains>` |         — | Comma‑separated domains to exclude.               |
| `--min-response-time <ms>`    |       `0` | Minimum response time to include (ms).            |
| `--max-response-time <ms>`    |         — | Maximum response time to include (ms).            |
| `--methods <methods>`         |         — | Comma‑separated HTTP methods to include.          |
| `--exclude-static`            |    `true` | Exclude static resources (images, CSS, JS).       |
| `--auto-correlate`            |    `true` | Automatically detect and apply data correlations. |
| `--interactive`               |    `true` | Interactive endpoint selection.                   |
| `--group-by <criteria>`       |  `domain` | Group scenarios by `domain` \| `path` \| `none`.  |
| `-v, --verbose`               |         — | Enable verbose logging.                           |

**Examples**

```bash
# Import only API calls for api.example.com and group by path
perfornium import har capture.har --filter-domains api.example.com --group-by path -o tests/har
```

### import postman — From a Postman collection

**Usage**

```bash
perfornium import postman <collection-file> [options]
```

**Arguments**

* `<collection-file>` — Postman collection file (JSON).

**Options**

| Option                     |   Default | Description                                       |
| -------------------------- | --------: | ------------------------------------------------- |
| `-o, --output <directory>` | `./tests` | Output directory for generated tests.             |
| `-f, --format <format>`    |    `yaml` | Output format: `yaml` \| `json`.                  |
| `--environment <env-file>` |         — | Postman environment file.                         |
| `--folders <folders>`      |         — | Comma‑separated list of folder names to include.  |
| `--auto-correlate`         |    `true` | Automatically detect and apply data correlations. |
| `--interactive`            |    `true` | Interactive request selection.                    |
| `-v, --verbose`            |         — | Enable verbose logging.                           |

**Examples**

```bash
perfornium import postman postman_collection.json --folders "Auth,Orders" --environment postman_env.json -o tests/postman
```

---

## distributed — Run across multiple workers

Start a distributed run from a controller node.

**Usage**

```bash
perfornium distributed <config> [options]
```

**Arguments**

* `<config>` — Test configuration file.

**Options**

| Option                      |          Default | Description                                                                              |
| --------------------------- | ---------------: | ---------------------------------------------------------------------------------------- |
| `-e, --env <environment>`   |                — | Environment configuration.                                                               |
| `-w, --workers <workers>`   |                — | Comma‑separated list of worker addresses (`host:port`).                                  |
| `--workers-file <file>`     |                — | JSON file containing worker configurations.                                              |
| `-s, --strategy <strategy>` | `capacity_based` | Load distribution strategy: `even` \| `capacity_based` \| `round_robin` \| `geographic`. |
| `--sync-start`              |                — | Synchronize test start across all workers.                                               |
| `-o, --output <directory>`  |                — | Output directory for results.                                                            |
| `-r, --report`              |                — | Generate HTML report after test.                                                         |
| `-v, --verbose`             |                — | Enable verbose logging (info level).                                                     |
| `-d, --debug`               |                — | Enable debug logging (very detailed).                                                    |

**Examples**

```bash
# Evenly distribute to two workers
perfornium distributed tests/api.yml -w "10.0.0.12:8080,10.0.0.13:8080" -s even --sync-start -o results/distributed --report

# Use a workers JSON file and capacity‑based strategy (default)
perfornium distributed tests/checkout.yml --workers-file workers.json --sync-start -v

# Round‑robin across a list
perfornium distributed tests/browse.yml -w "w1.local:8080,w2.local:8080,w3.local:8080" -s round_robin
```

---

## worker — Start a worker node

Run a worker process for distributed testing.

**Usage**

```bash
perfornium worker [options]
```

**Options**

| Option              |     Default | Description        |
| ------------------- | ----------: | ------------------ |
| `-p, --port <port>` |      `8080` | Port to listen on. |
| `--host <host>`     | `localhost` | Host to bind to.   |

**Examples**

```bash
perfornium worker --host 0.0.0.0 --port 8080
```

---

## mock — Start a mock API server

Start a local mock server for testing without external dependencies. Useful for local development and CI/CD pipelines.

**Usage**

```bash
perfornium mock [options]
```

**Options**

| Option               |     Default | Description                              |
| -------------------- | ----------: | ---------------------------------------- |
| `-p, --port <port>`  |      `3000` | Port to listen on.                       |
| `--host <host>`      | `localhost` | Host to bind to.                         |
| `-d, --delay <ms>`   |         `0` | Add artificial delay to responses (ms).  |

**Available Endpoints**

| Endpoint             | Method | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `/status`, `/health` | GET    | Health check (returns status, uptime, count).  |
| `/users`             | GET    | List all mock users.                           |
| `/users/:id`         | GET    | Get user by ID.                                |
| `/users`             | POST   | Create a new user.                             |
| `/products`          | GET    | List products (supports `?category=X&inStock=true`). |
| `/products/:id`      | GET    | Get product by ID.                             |
| `/auth/login`        | POST   | Login (returns mock token).                    |
| `/echo`              | POST   | Echo back the request body.                    |
| `/delay?ms=1000`     | GET    | Respond after specified delay.                 |
| `/error?code=500`    | GET    | Simulate an error response.                    |
| `/random`            | GET    | Return random data (id, uuid, timestamp).      |

**Examples**

```bash
# Start mock server on default port 3000
perfornium mock

# Start on custom port with 100ms delay
perfornium mock --port 8080 --delay 100

# Bind to all interfaces (for Docker/remote access)
perfornium mock --host 0.0.0.0 --port 3000
```

**Using with Tests**

The mock server is designed to work with the sample tests created by `perfornium init`:

```bash
# Terminal 1: Start mock server
perfornium mock

# Terminal 2: Run tests against mock server
perfornium run tests/api/load-test.yml --report
```

---

## End‑to‑end example

```bash
# 1) Initialize project
perfornium init perf-project -t mixed --examples

# 2) Import scenarios from OpenAPI
perfornium import openapi openapi.yml -o perf-project/tests --tags core

# 3) Validate config
perfornium validate perf-project/tests/core.yaml -e env/staging.yml

# 4) Run in distributed mode with two workers
perfornium distributed perf-project/tests/core.yaml -w "10.0.0.12:8080,10.0.0.13:8080" --sync-start -o results/staging --report

# 5) (Optional) Re‑generate a custom report title
perfornium report results/staging/results.json --title "Staging – Core endpoints"
```

---

### Notes

* Defaults shown above reflect the current CLI implementation.
* Boolean flags with defaults shown as `true` are enabled by default; pass the corresponding negative form (if available) to disable.
* For distributed runs, use `--sync-start` to align the start timestamp across workers for cleaner reports.

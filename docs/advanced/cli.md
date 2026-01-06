# CLI Reference

The Perfornium Command Line Interface provides comprehensive control over performance testing operations. This reference covers all commands, options, and usage patterns for effective test management.

## Overview

The Perfornium CLI offers:
- Test execution and management
- Configuration validation
- Result analysis
- Environment management
- Debugging and troubleshooting tools

## Global Options

### Common Flags

```bash
# Help and version
perfornium --help
perfornium --version

# Configuration
perfornium --config <path>        # Custom config file
perfornium --env <environment>    # Environment name
perfornium --set KEY=VALUE        # Override variables
perfornium --verbose              # Verbose output
perfornium --quiet                # Minimal output
perfornium --debug                # Debug mode
```

### Output Control

```bash
# Output formats
perfornium --output json          # JSON output
perfornium --output yaml          # YAML output
perfornium --output table         # Table format
perfornium --output csv           # CSV format

# Output destinations
perfornium --output-file results.json
perfornium --output-dir ./results
```

## Core Commands

### run

Execute performance tests with comprehensive options.

```bash
# Basic usage
perfornium run                    # Run with default config
perfornium run test.yml           # Run specific config
perfornium run --config test.yml  # Explicit config

# Load pattern control
perfornium run --vus 100          # Override virtual users
perfornium run --duration 5m      # Override test duration
perfornium run --ramp-up 2m       # Override ramp-up time

# Environment control
perfornium run --env production   # Use production environment
perfornium run --set API_URL=https://api.example.com

# Output control
perfornium run --output json --output-file results.json
perfornium run --no-summary       # Skip summary output
perfornium run --real-time         # Enable real-time metrics
```

#### Advanced run Options

```bash
# Scenario control
perfornium run --scenario "Login Test"    # Run specific scenario
perfornium run --scenarios scenario1,scenario2  # Multiple scenarios
perfornium run --exclude-scenario "Stress Test"  # Exclude scenarios

# Protocol selection
perfornium run --protocol rest     # Force REST protocol
perfornium run --protocol browser  # Force browser protocol

# Execution control
perfornium run --dry-run           # Validate without executing
perfornium run --iterations 5      # Run multiple times
perfornium run --parallel 3        # Parallel test execution

# Resource limits
perfornium run --max-memory 4GB    # Memory limit
perfornium run --max-cpu 80%       # CPU limit
perfornium run --timeout 30m       # Global timeout
```

### validate

Validate configuration files and test setup.

```bash
# Basic validation
perfornium validate               # Validate default config
perfornium validate test.yml      # Validate specific config

# Validation options
perfornium validate --strict      # Strict validation mode
perfornium validate --schema      # Schema validation only
perfornium validate --connectivity # Test connectivity
perfornium validate --env staging # Validate with environment

# Output formats
perfornium validate --output json
perfornium validate --verbose     # Detailed validation info
```

#### Validation Examples

```bash
# Check configuration syntax
perfornium validate --syntax-only

# Validate environment variables
perfornium validate --check-env --env production

# Test external dependencies
perfornium validate --check-dependencies --timeout 10s

# Validate load pattern
perfornium validate --check-load-pattern --duration 1m
```

### init

Initialize new Perfornium projects and configurations.

```bash
# Project initialization
perfornium init                   # Interactive project setup
perfornium init myproject         # Create named project
perfornium init --template rest-api  # Use template

# Configuration generation
perfornium init --config-only     # Generate config file only
perfornium init --typescript      # Generate TypeScript config
perfornium init --yaml            # Generate YAML config (default)

# Template options
perfornium init --template basic
perfornium init --template api-testing
perfornium init --template browser-testing
perfornium init --template microservices
```

#### Init Templates

```bash
# Available templates
perfornium templates list

# Template details
perfornium templates show rest-api

# Custom templates
perfornium init --template-url https://github.com/company/perfornium-template
perfornium init --template-path ./custom-template
```

### analyze

Analyze test results and generate reports.

```bash
# Basic analysis
perfornium analyze results.json   # Analyze specific results
perfornium analyze ./results/     # Analyze directory

# Analysis options
perfornium analyze --baseline baseline.json  # Compare with baseline
perfornium analyze --threshold response_time_p95=1000  # Set thresholds
perfornium analyze --format html  # Generate HTML report

# Comparison analysis
perfornium analyze --compare result1.json result2.json
perfornium analyze --trend --period 30d  # Trend analysis
```

#### Analysis Features

```bash
# Statistical analysis
perfornium analyze --percentiles 50,90,95,99
perfornium analyze --outliers     # Identify outliers
perfornium analyze --correlation  # Correlation analysis

# Performance regression
perfornium analyze --regression --baseline previous.json
perfornium analyze --performance-budget budget.yml

# Custom metrics
perfornium analyze --custom-metrics metrics.js
perfornium analyze --aggregation custom
```

### config

Manage configuration files and settings.

```bash
# View configuration
perfornium config show           # Show current config
perfornium config show --resolved  # Show with variables resolved
perfornium config show --schema  # Show configuration schema

# Configuration validation
perfornium config validate       # Validate current config
perfornium config validate --fix # Auto-fix common issues

# Configuration conversion
perfornium config convert --from yaml --to typescript
perfornium config convert test.yml --output test.ts
```

#### Configuration Management

```bash
# Environment-specific configs
perfornium config create --env production
perfornium config merge base.yml production.yml

# Configuration templates
perfornium config template list
perfornium config template apply rest-api

# Configuration migration
perfornium config migrate --from-version 1.0 --to-version 2.0
```

### env

Manage environments and variables.

```bash
# Environment management
perfornium env list              # List environments
perfornium env show staging      # Show environment details
perfornium env create production # Create new environment

# Variable management
perfornium env set API_URL=https://api.prod.com
perfornium env get API_URL       # Get variable value
perfornium env unset API_URL     # Remove variable

# Environment files
perfornium env load .env.production
perfornium env export --format dotenv
```

### debug

Debug test execution and troubleshoot issues.

```bash
# Debug modes
perfornium debug run test.yml    # Run in debug mode
perfornium debug --trace         # Enable request tracing
perfornium debug --profile       # Enable profiling

# Diagnostic information
perfornium debug info            # System information
perfornium debug connectivity   # Test connectivity
perfornium debug performance    # Performance diagnostics

# Debug specific components
perfornium debug --http          # HTTP debugging
perfornium debug --timing        # Timing debugging
perfornium debug --memory        # Memory debugging
```

### clean

Clean up test artifacts and temporary files.

```bash
# Basic cleanup
perfornium clean                 # Clean default artifacts
perfornium clean --all           # Clean everything

# Selective cleanup
perfornium clean --results       # Clean result files
perfornium clean --logs          # Clean log files
perfornium clean --cache         # Clean cache files
perfornium clean --temp          # Clean temporary files

# Cleanup options
perfornium clean --older-than 7d  # Clean files older than 7 days
perfornium clean --dry-run       # Show what would be cleaned
```

## Utility Commands

### version

Display version information.

```bash
perfornium version               # Basic version info
perfornium version --full        # Full version details
perfornium version --check       # Check for updates
```

### help

Get help information.

```bash
perfornium help                  # General help
perfornium help run              # Command-specific help
perfornium help --examples       # Show usage examples
```

### completion

Generate shell completion scripts.

```bash
# Bash completion
perfornium completion bash > /etc/bash_completion.d/perfornium

# Zsh completion
perfornium completion zsh > ~/.zsh/completions/_perfornium

# Fish completion
perfornium completion fish > ~/.config/fish/completions/perfornium.fish
```

## Advanced Commands

### worker

Manage distributed testing workers.

```bash
# Worker management
perfornium worker start          # Start worker node
perfornium worker stop           # Stop worker node
perfornium worker status         # Show worker status

# Worker configuration
perfornium worker --master-host coordinator.example.com
perfornium worker --capacity 1000  # Set worker capacity
perfornium worker --id worker-001  # Set worker ID
```

### cluster

Manage test clusters and coordination.

```bash
# Cluster operations
perfornium cluster create        # Create test cluster
perfornium cluster join <cluster-id>  # Join existing cluster
perfornium cluster leave         # Leave cluster

# Cluster management
perfornium cluster status        # Show cluster status
perfornium cluster nodes         # List cluster nodes
perfornium cluster scale 10      # Scale cluster to 10 nodes
```

### plugin

Manage plugins and extensions.

```bash
# Plugin management
perfornium plugin list           # List installed plugins
perfornium plugin install <name> # Install plugin
perfornium plugin uninstall <name>  # Uninstall plugin

# Plugin development
perfornium plugin create myplugin # Create plugin template
perfornium plugin validate       # Validate plugin
perfornium plugin publish        # Publish plugin
```

## Configuration File Commands

### Generate configurations

```bash
# YAML configuration
perfornium config generate --format yaml --output perfornium.yml

# TypeScript configuration
perfornium config generate --format typescript --output perfornium.config.ts

# Environment-specific
perfornium config generate --env production --format yaml
```

### Configuration templates

```bash
# REST API template
perfornium config template apply rest-api

# Browser testing template
perfornium config template apply browser

# Custom template
perfornium config template apply ./my-template.yml
```

## Environment Variables

Perfornium CLI respects various environment variables:

```bash
# Configuration
export PERFORNIUM_CONFIG="./custom-config.yml"
export PERFORNIUM_ENV="staging"

# Output control
export PERFORNIUM_OUTPUT_DIR="./custom-results"
export PERFORNIUM_LOG_LEVEL="debug"

# Connection settings
export PERFORNIUM_TIMEOUT="30s"
export PERFORNIUM_MAX_CONNECTIONS="1000"

# Authentication
export PERFORNIUM_API_KEY="your-api-key"
export PERFORNIUM_TOKEN="your-auth-token"
```

## Exit Codes

Perfornium CLI uses standard exit codes:

```bash
0   # Success
1   # General error
2   # Misuse of shell command
3   # Configuration error
4   # Connection error
5   # Timeout error
6   # Authentication error
7   # Permission error
8   # Resource exhaustion
9   # SLA violation (when --fail-on-sla is used)
```

## Command Examples

### Basic Testing Workflow

```bash
# 1. Initialize project
perfornium init api-load-test --template rest-api

# 2. Validate configuration
perfornium validate --connectivity

# 3. Run test
perfornium run --env staging --output json --output-file results.json

# 4. Analyze results
perfornium analyze results.json --format html --output report.html
```

### CI/CD Integration

```bash
#!/bin/bash
# CI/CD pipeline script

# Validate configuration
if ! perfornium validate --strict; then
    echo "Configuration validation failed"
    exit 1
fi

# Run performance test
perfornium run \
    --env $ENVIRONMENT \
    --timeout 30m \
    --output json \
    --output-file "results-$BUILD_NUMBER.json" \
    --fail-on-sla

# Generate report
perfornium analyze "results-$BUILD_NUMBER.json" \
    --format html \
    --output "report-$BUILD_NUMBER.html"

# Cleanup old results
perfornium clean --older-than 30d
```

### Debugging Workflow

```bash
# Debug connectivity issues
perfornium debug connectivity --verbose

# Run with full debugging
perfornium debug run test.yml --trace --profile

# Analyze performance bottlenecks
perfornium debug performance --output debug-report.json
```

## Configuration File Reference

### Command Line Config Override

```bash
# Override any configuration value
perfornium run \
    --set load.virtual_users=100 \
    --set load.duration=5m \
    --set scenarios[0].requests[0].url=https://api.example.com
```

### Multiple Environment Support

```bash
# Use environment-specific settings
perfornium run --env production --config production.yml

# Merge configurations
perfornium run --config base.yml --config production-overrides.yml
```

The Perfornium CLI provides comprehensive control over all aspects of performance testing, from project initialization to results analysis, with extensive customization and integration capabilities.
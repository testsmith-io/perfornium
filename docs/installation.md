# Installation Guide

This guide covers different ways to install and set up Perfornium for your performance testing needs.

## System Requirements

### Minimum Requirements
- **Node.js**: Version 16.0 or higher
- **Memory**: 512MB RAM available
- **Storage**: 100MB free disk space

### Recommended Requirements
- **Node.js**: Version 18.0 or higher (for best performance)
- **Memory**: 2GB RAM or more (for high-load testing)
- **Storage**: 1GB free disk space (for results and reports)

## Installation Methods

### Method 1: Global Installation (Recommended)

Install Perfornium globally to use it from anywhere:

```bash
npm install -g @testsmith/perfornium
```

Verify the installation:

```bash
perfornium --version
```

### Method 2: Local Project Installation

Install Perfornium as a project dependency:

```bash
# Using npm
npm install @testsmith/perfornium --save-dev

# Using yarn
yarn add @testsmith/perfornium --dev
```

Run using npx:

```bash
npx @testsmith/perfornium run test.yml
```

### Method 3: From Source

Clone and install from the GitHub repository:

```bash
git clone https://github.com/testsmith-io/perfornium.git
cd perfornium
npm install
npm run build
npm link
```

## Platform-Specific Setup

### Windows

#### Prerequisites
```bash
# Install Node.js from nodejs.org
# Or using chocolatey
choco install nodejs
```

#### Installation
```bash
npm install -g @testsmith/perfornium
```

#### Common Issues
- **Path Issues**: Ensure Node.js and npm are in your PATH
- **Permissions**: Run Command Prompt as Administrator if needed
- **Antivirus**: Whitelist Node.js and npm folders

### macOS

#### Prerequisites
```bash
# Install Node.js using Homebrew
brew install node

# Or download from nodejs.org
```

#### Installation
```bash
npm install -g @testsmith/perfornium
```

#### Common Issues
- **Permission Errors**: Use `sudo` if needed, or configure npm permissions
- **Path Issues**: Add `/usr/local/bin` to your PATH

### Linux (Ubuntu/Debian)

#### Prerequisites
```bash
# Update package list
sudo apt update

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or using snap
sudo snap install node --classic
```

#### Installation
```bash
npm install -g @testsmith/perfornium
```

#### Common Issues
- **Permission Errors**: Configure npm to use a different directory:
  ```bash
  mkdir ~/.npm-global
  npm config set prefix '~/.npm-global'
  echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
  source ~/.bashrc
  ```

### Docker Installation

Run Perfornium in a Docker container:

#### Basic Usage
```bash
docker run --rm -v $(pwd):/app perfornium/perfornium run /app/test.yml
```

#### Custom Dockerfile
```dockerfile
FROM node:18-alpine

RUN npm install -g @testsmith/perfornium

WORKDIR /app

CMD ["perfornium", "--help"]
```

Build and run:
```bash
docker build -t my-perfornium .
docker run --rm -v $(pwd):/app my-perfornium run test.yml
```

## Verification

After installation, verify Perfornium is working correctly:

### Check Version
```bash
perfornium --version
```

### Check Help
```bash
perfornium --help
```

### Run Test Configuration
```bash
perfornium validate --help
```

### Simple Test
Create a test file:

<!-- tabs:start -->

#### **YAML**

Create `verify.yml`:

```yaml
name: "Installation Verification"
global:
  base_url: "https://httpbin.org"
load:
  pattern: "basic"
  virtual_users: 1
  duration: "5s"
scenarios:
  - name: "Simple GET"
    steps:
      - name: "Test GET"
        type: "rest"
        method: "GET"
        path: "/get"
```

#### **TypeScript**

Create `verify.ts`:

```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Installation Verification')
  .baseUrl('https://httpbin.org')
  .scenario('Simple GET')
    .get('/get')
    .done()
  .withLoad({
    pattern: 'basic',
    virtualUsers: 1,
    duration: '5s'
  })
  .build();
```

<!-- tabs:end -->

Run the test:
```bash
perfornium run verify.yml
# or
perfornium run verify.ts
```

## Configuration

### Environment Variables

Set these environment variables for better performance:

```bash
# Increase Node.js memory limit for large tests
export NODE_OPTIONS="--max-old-space-size=4096"

# Set default configuration directory
export PERFORNIUM_CONFIG_DIR="./config"

# Set default output directory
export PERFORNIUM_OUTPUT_DIR="./results"
```

### Configuration File

Create a global configuration file at `~/.perfornium/config.yml`:

```yaml
# Global defaults
defaults:
  timeout: 30000
  log_level: "info"
  output_dir: "./results"
  report_dir: "./reports"

# Output preferences
outputs:
  default_format: ["json", "csv"]
  timestamp_format: "YYYY-MM-DD_HH-mm-ss"

# Performance settings
performance:
  max_virtual_users: 1000
  batch_size: 10
  memory_limit: "2GB"
```

## IDE Integration

### Visual Studio Code

Install the Perfornium extension for syntax highlighting and validation:

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Perfornium"
4. Install the extension

### IntelliJ/WebStorm

Enable YAML support and add the Perfornium schema:

1. Go to File → Settings → Languages & Frameworks → Schemas and DTDs
2. Add new schema with URL: `https://schema.perfornium.io/config.json`
3. Associate with `*.yml` files in your test directories

## Troubleshooting Installation

### Common Issues

#### "command not found: perfornium"
- Verify Node.js is installed: `node --version`
- Check npm global bin directory: `npm config get prefix`
- Add npm bin to PATH: `export PATH=$PATH:$(npm config get prefix)/bin`

#### Permission Denied Errors
```bash
# Fix npm permissions (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use a Node version manager like nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
nvm use node
```

#### Module Resolution Errors
```bash
# Clear npm cache
npm cache clean --force

# Reinstall
npm uninstall -g @testsmith/perfornium
npm install -g @testsmith/perfornium
```

#### Windows Path Issues
```cmd
# Add Node.js to PATH manually
set PATH=%PATH%;C:\Program Files\nodejs\
```

### Getting Help

If you encounter issues during installation:

1. **Check System Requirements**: Ensure Node.js version compatibility
2. **Review Error Messages**: Look for specific error codes or messages
3. **Search Documentation**: Check this documentation for similar issues
4. **Community Support**: Ask questions in GitHub issues
5. **Verbose Installation**: Use `--verbose` flag for detailed logs

## Next Steps

After successful installation:

1. **Read the Quick Start**: [Quick Start Guide](quick-start.md)
2. **Explore Examples**: [Example Tests](examples/rest-basic.md)
3. **Learn Configuration**: [YAML Configuration](config/yaml.md)
4. **Join Community**: GitHub discussions and issues

## Updating Perfornium

### Check Current Version
```bash
perfornium --version
```

### Update to Latest Version
```bash
# Global installation
npm update -g @testsmith/perfornium

# Local installation
npm update @testsmith/perfornium
```

### Version-Specific Installation
```bash
npm install -g @testsmith/perfornium@1.2.3
```

Happy performance testing! 🚀
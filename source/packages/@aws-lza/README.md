# AWS LZA - Landing Zone Accelerator Modules

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

AWS LZA is a TypeScript library that provides modular AWS service management capabilities through both programmatic APIs and a command-line interface. It enables organizations to configure and manage AWS services at scale with a focus on compliance and best practices.

## 🚀 Quick Start

```bash
# Setup Amazon Macie
aws-lza setup macie -c file://macie-config.json

# Get help
aws-lza --help
```

## 🏗️ Architecture

### Core Components
- **`lib/common/`** - Shared utilities, logging, and AWS SDK helpers
- **`lib/cli/`** - Command-line interface framework and handlers
- **`lib/amazon-macie/`** - Amazon Macie service implementation
- **`bin/`** - CLI entry points and executables

### Project Structure
```
@aws-lza/
├── lib/
│   ├── common/           # Shared utilities and functions
│   ├── cli/              # CLI framework and commands
│   └── amazon-macie/     # Macie service module
├── bin/                  # CLI executables
└── test/                 # Test suites
```

## 🚀 Usage

### Command Line Interface

The LZA CLI provides a verb-first approach for managing AWS services:

```bash
# Setup Amazon Macie
aws-lza setup macie -c file://config.json

# Get help
aws-lza --help
aws-lza setup --help
aws-lza setup macie --help
```

#### Configuration Options
- **File**: `aws-lza setup macie -c file://macie-config.json`
- **JSON String**: `aws-lza setup macie -c '{"enable":true,"delegatedAdminAccountId":"123456789012"}'`
- **Dry Run**: `aws-lza setup macie -c config.json --dry-run`
- **Region Override**: `aws-lza setup macie -c config.json --region us-west-2`

### Programmatic API

```typescript
import { configureMacie, IMacieModuleConfiguration } from 'aws-lza';

const config: IMacieModuleConfiguration = {
  moduleName: 'macie',
  operation: 'setup',
  partition: 'aws',
  region: 'us-east-1',
  dryRun: false,
  configuration: {
    enable: true,
    delegatedAdminAccountId: '123456789012',
    regions: ['us-east-1', 'us-west-2'],
  }
};

const result = await configureMacie(config);
```

## 📦 Available Services

### Amazon Macie ✅
- **Setup**: Configure Macie organization-wide with delegated administrator
- **Multi-region Support**: Enable Macie across specified AWS regions
- **Organization Management**: Automatic member account enrollment
- **Session Management**: Configure Macie sessions and findings

### Module Runner
- **Environment Control**: Skip module execution via environment variables
- **Batch Processing**: Execute multiple modules with dependency management
- **Configuration Loading**: Support for various configuration sources

## 🔧 Adding New Services

### 1. Create Service Module
```typescript
// lib/new-service/index.ts
export async function configureNewService(config: INewServiceConfiguration): Promise<string> {
  // Implementation
}
```

### 2. Add CLI Commands
```typescript
// lib/cli/commands/new-service.ts
export const newServiceCommands = {
  setup: {
    description: 'Setup New Service',
    handler: async (args) => {
      // CLI handler implementation
    }
  }
};
```

### 3. Export from Main Index
```typescript
// index.ts
export { configureNewService, INewServiceConfiguration } from './lib/new-service';
```

## 🧪 Development

### Testing
```bash
npm run test:unit          # Unit tests with coverage
npm run test:integration   # Integration tests
npm run test:clean         # Clean test reports
```

### Building
```bash
npm run build              # Compile TypeScript
npm run watch              # Watch mode compilation
npm run lint               # ESLint with auto-fix
npm run precommit          # Pre-commit checks
```

### Project Status

- ✅ **Core Framework** - Common utilities, CLI framework, logging
- ✅ **Amazon Macie** - Complete implementation with organization support
- ✅ **Module Runner** - Environment-controlled execution system
- 🚧 **Additional Services** - Planned for future releases

## 🎯 Design Principles

1. **Modular Architecture** - Self-contained service modules with clear interfaces
2. **Type Safety** - Full TypeScript support with comprehensive type definitions
3. **CLI-First Design** - Intuitive command-line interface with programmatic API support
4. **Environment Control** - Runtime configuration through environment variables
5. **Testability** - Comprehensive unit and integration test coverage
6. **AWS Best Practices** - Built following AWS security and operational guidelines

## 🤝 Contributing

### Development Setup
```bash
git clone <repository-url>
cd source/packages/@aws-lza
npm install
npm run build
```

### Code Standards
- Follow existing TypeScript patterns and ESLint configuration
- Add comprehensive tests for new features
- Update documentation and type definitions
- Use conventional commit messages

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 🐛 [Report Issues](https://github.com/awslabs/landing-zone-accelerator-on-aws/issues)
- 💬 [Community Discussions](https://github.com/awslabs/landing-zone-accelerator-on-aws/discussions)
- 📖 [Documentation](https://awslabs.github.io/landing-zone-accelerator-on-aws)

---

**AWS LZA** - Simplifying AWS service management at scale with type-safe, modular architecture.

# Integration Guide: Using LZA Modules

## Overview
This guide demonstrates how to integrate and utilize LZA modules in LZA accelerator and other projects. Each module provides specific AWS service management capabilities through well-defined interfaces.

## Basic Implementation

### 1. Module Import and Basic Usage

```typescript
import { 
  setupControlTowerLandingZone,
  ISetupLandingZoneHandlerParameter 
} from '@aws-lza';

async function deployControlTower() {
  const params: ISetupLandingZoneHandlerParameter = {
    dryRun: false,
    partition: 'aws',
    homeRegion: 'us-east-1',
    configuration: {
      version: '3.3',
      enabledRegions: ['us-east-1', 'us-west-2'],
      logging: {
        organizationTrail: true,
        retention: {
          loggingBucket: 365,
          accessLoggingBucket: 365
        }
      },
      security: {
        enableIdentityCenterAccess: true
      },
      sharedAccounts: {
        management: {
          name: 'Management',
          email: 'management@example.com'
        },
        logging: {
          name: 'LogArchive',
          email: 'log-archive@example.com'
        },
        audit: {
          name: 'Audit',
          email: 'audit@example.com'
        }
      }
    }
  };

  try {
    const result = await setupControlTowerLandingZone(params);
    console.log('Status:', result);
  } catch (error) {
    console.error('Failure:', error.message);
  }
}
```

### 2. Implementing Error Handling

```typescript
async function safeModuleExecution() {
  try {
    return await setupControlTowerLandingZone(params);
  } catch (err) {
    console.error(err.message);
    return err;
  }
}

// Using IIFE (Immediately Invoked Function Expression)
(async () => {
  try {
    const result = await safeModuleExecution();
    // Handle result
  } catch (err) {
    // Handle error
  }
})();
```


## Implementation Best Practices

### 1. Configuration Management
- Store configurations in separate files
- Use environment variables for sensitive data
- Validate configurations before passing to modules

```typescript
// config-validator.ts
function validateConfig(config: ISetupLandingZoneHandlerParameter): boolean {
  // Add validation logic
  return true;
}

// usage.ts
if (!validateConfig(params)) {
  throw new Error('Invalid configuration');
}
```

### 2. Error Handling Patterns
```typescript
try {
  await setupControlTowerLandingZone(params);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors
  } else if (error instanceof AWSError) {
    // Handle AWS-specific errors
  } else {
    // Handle other errors
  }
}
```

### 3. Asynchronous Operations
- Always use async/await for module operations
- Implement proper promise handling
- Handle promise rejections

## Testing and Validation

### Integration Testing Example
```typescript
describe('SetupLandingZoneModule Integration Test', () => {
  it('should successfully deploy Control Tower Landing Zone', async () => {
    const params = {
      // Test configuration
    };
    
    const result = await setupControlTowerLandingZone(params);
    expect(result).toBeDefined();
  });

  it('should handle invalid configurations', async () => {
    const invalidParams = {
      // Invalid configuration
    };
    
    await expect(setupControlTowerLandingZone(invalidParams))
      .rejects
      .toThrow();
  });
});
```

## Troubleshooting Guide

### 1. Configuration Issues
- Verify all required parameters are provided
- Check parameter types and formats
- Ensure AWS credentials are properly configured

### 2. AWS Service Related Issues
- Check AWS service quotas and limits
- Verify IAM permissions
- Review AWS service health dashboard

### 3. Module Operation Issues
- Check module version compatibility
- Verify input parameter format
- Review module documentation for updates


---

[← Back to Module Development Guide](./index.md)

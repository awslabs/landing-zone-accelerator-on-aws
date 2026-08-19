# CDK Aspects

## Overview

LZA uses CDK Aspects (`accelerator-aspects.ts`) to apply cross-cutting modifications to all constructs in a stack after synthesis. Aspects handle partition-specific overrides, permissions boundaries, Lambda runtime enforcement, and solution metadata.

## Aspect Classes

### `AwsSolutionAspect`

Adds the `SOLUTION_ID` environment variable to LZA-managed `AWS::Lambda::Function` resources so that AWS SDK calls made by those functions carry the solution user agent for usage attribution. It is only registered when `useExistingRoles` is disabled.

For Lambda functions defined in customer-authored customization templates (`customizations.cloudFormationStacks`, synthesized by `CustomStack`), this aspect does not inject `SOLUTION_ID`. This avoids adding an unsupported environment variable to [Lambda@Edge functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html). Other LZA aspects continue to apply to these templates according to their existing behavior; for example, `LambdaDefaultMemoryAspect` still sets the default Lambda memory size.

### `LambdaRuntimeAspect`

Enforces a consistent Lambda runtime across all Lambda functions. Ensures all functions use the same Node.js version.

### `LambdaDefaultMemoryAspect`

Sets a default memory size for Lambda functions that don't explicitly specify one.

### `PermissionsBoundaryAspect`

Attaches a permissions boundary to all IAM roles created by the stack. The boundary ARN is derived from the account and partition.

### `IamServiceLinkedRoleAspect`

Handles service-linked role creation edge cases across partitions.

### `ExistingRoleOverrides`

When `useExistingRoles` is enabled, replaces CDK-generated IAM roles with references to pre-existing roles. This is used in environments where IAM role creation is restricted. Handles:

- Lambda function execution roles
- CloudTrail CloudWatch Logs roles

### Partition Override Aspects

Each non-standard partition has a dedicated aspect class:

| Aspect              | Partition    | Purpose                                                |
| ------------------- | ------------ | ------------------------------------------------------ |
| `GovCloudOverrides` | `aws-us-gov` | GovCloud-specific service endpoint and ARN adjustments |
| `CnOverrides`       | `aws-cn`     | China region overrides                                 |
| `IsoOverrides`      | `aws-iso`    | ISO (Secret) region overrides                          |
| `IsobOverrides`     | `aws-iso-b`  | ISOB (Top Secret) region overrides                     |
| `IsofOverrides`     | `aws-iso-f`  | ISOF region overrides                                  |
| `IsoeOverrides`     | `aws-iso-e`  | ISOE region overrides                                  |

These aspects modify service endpoints, ARN formats, and feature availability for non-standard partitions.

### `AseaLambdaRuntimeAspect`

Specific to ASEA import stacks — ensures imported Lambda functions use a supported runtime.

## How Aspects Are Applied

Aspects are applied in `AcceleratorAspects` constructor, which is called during app initialization:

```typescript
new AcceleratorAspects(app, partition, useExistingRoles);
```

This registers all applicable aspects based on the target partition.

## Key Code Path

| Component   | File                                     |
| ----------- | ---------------------------------------- |
| All aspects | `accelerator/lib/accelerator-aspects.ts` |

## Relevance for Contributors

When adding new constructs that create IAM roles or Lambda functions, be aware that:

1. Permissions boundaries will be automatically attached to roles
2. Lambda runtimes will be overridden to the standard version
3. Partition-specific endpoints may be modified
4. If `useExistingRoles` is enabled, role references will be replaced

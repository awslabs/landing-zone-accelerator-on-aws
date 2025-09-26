# Configuration File Includes

The Landing Zone Accelerator on AWS supports the `!include` directive in configuration files to modularize and organize complex configurations. This feature allows you to split large configuration files into smaller, more manageable files and include them using relative paths.

!!! note "See also"
    - [Implementation Guide - Configuration File Reference](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-file-reference.html)

## Overview

The `!include` directive enables you to:

- Break down large configuration files into smaller, focused modules
- Reuse common configuration blocks across multiple files
- Improve configuration maintainability and readability
- Organize configurations by logical groupings (e.g., accounts by environment, security policies by type)

!!! note
    The `!include` feature works with the `load` method in configuration processing but not with the `loadFromString` method.

## Supported Configuration Files

The `!include` directive is supported in all Landing Zone Accelerator configuration files:

- `global-config.yaml`
- `accounts-config.yaml`
- `security-config.yaml`
- `network-config.yaml`
- `iam-config.yaml`
- `customizations-config.yaml`
- `replacements-config.yaml`

## Basic Usage

### Syntax

```yaml
configurationSection: !include relative/path/to/file.yaml
```

The path must be relative to the main configuration file and should point to a valid YAML file containing the configuration data for that section.

### Simple Include Example

**accounts-config.yaml:**
```yaml
mandatoryAccounts:
  - name: Management
    description: The management (primary) account
    email: management@example.com
    organizationalUnit: Root
  - name: LogArchive
    description: The log archive account
    email: logarchive@example.com
    organizationalUnit: Security
  - name: Audit
    description: The security audit account
    email: audit@example.com
    organizationalUnit: Security

workloadAccounts: !include include/account-config-workloads.yaml
```

**include/account-config-workloads.yaml:**
```yaml
- name: SharedServices
  description: The SharedServices account
  email: shared-services@example.com
  organizationalUnit: Infrastructure
- name: Network
  description: The Network account
  email: network@example.com
  organizationalUnit: Infrastructure
```

## Advanced Usage

### Nested Includes

You can use `!include` directives within included files to create a hierarchical structure:

**include/account-config-workloads.yaml:**
```yaml
- name: SharedServices
  description: The SharedServices account
  email: shared-services@example.com
  organizationalUnit: Infrastructure
- name: Network
  description: The Network account
  email: network@example.com
  organizationalUnit: Infrastructure
- !include account-config-workload-nested.yaml
```

**include/account-config-workload-nested.yaml:**
```yaml
name: GovCloudWorkloadAccount01
description: Sample govCloud workload account
email: govcloud-workload@example.com
organizationalUnit: GovCloud
enableGovCloud: true
```

### Including Configuration Arrays

The `!include` directive works seamlessly with YAML arrays and objects:

**customizations-config.yaml:**
```yaml
customizations:
  cloudFormationStacks: !include include/customization-config-targets.yaml
  cloudFormationStackSets:
    - name: Custom-StackSet
      template: templates/example.yaml
      # ... other stackset configuration
```

**include/customization-config-targets.yaml:**
```yaml
- deploymentTargets:
    accounts:
      - Management
  description: Sample stack description
  name: Custom-S3-Stack
  regions:
    - us-east-1
  runOrder: 1
  template: cloudformation-templates/custom-s3-bucket.yaml
  terminationProtection: false
- deploymentTargets:
    organizationalUnits:
      - Security
  description: Second sample stack description
  name: Custom-S3-Stack-2
  regions:
    - us-east-1
    - us-west-2
  runOrder: 2
  template: cloudformation-templates/custom-s3-bucket.yaml
  terminationProtection: true
```

### Including Complex Objects

**global-config.yaml:**
```yaml
homeRegion: us-east-1
enabledRegions:
  - us-east-1
  - us-west-2

controlTower: !include include/global-config-control-tower.yaml

logging:
  account: LogArchive
  # ... other logging configuration
```

**include/global-config-control-tower.yaml:**
```yaml
enable: true
landingZone:
  version: '3.3'
  logging:
    loggingBucketRetentionDays: 365
    accessLoggingBucketRetentionDays: 365
    organizationTrail: true
  security:
    enableIdentityCenterAccess: true
controls:
  - identifier: AWS-GR_RESTRICT_ROOT_USER_ACCESS_KEYS
    enable: true
    deploymentTargets:
      organizationalUnits:
        - SecureWorkloads
```

## Best Practices

### File Organization

Create a logical directory structure for your included files e.g.:

```
config/
├── accounts-config.yaml
├── global-config.yaml
├── network-config.yaml
├── security-config.yaml
├── iam-config.yaml
├── customizations-config.yaml
├── replacements-config.yaml
└── include/
    ├── accounts/
    │   ├── workload-accounts.yaml
    │   └── sandbox-accounts.yaml
    ├── security/
    │   ├── config-rules.yaml
    │   └── security-hub.yaml
    ├── network/
    │   ├── vpcs.yaml
    │   └── transit-gateways.yaml
    └── customizations/
        ├── cloudformation-stacks.yaml
        └── applications.yaml
```

### Naming Conventions

- Use descriptive filenames that clearly indicate the content
- Use consistent naming patterns (e.g., `config-` prefix for configuration sections)
- Include the parent configuration type in the filename when helpful

### Content Organization

- Group related configurations together in included files
- Keep included files focused on a single logical unit
- Use nested includes sparingly to maintain readability

## Limitations and Considerations

### Path Requirements

- All paths must be relative to the main configuration file
- Paths cannot reference files outside the configuration directory structure
- Use forward slashes (`/`) for path separators regardless of operating system

### Processing Method Compatibility

- The `!include` directive works with the `load` method during normal configuration processing
- It does **not** work with the `loadFromString` method used in certain testing scenarios

### Validation

- Included files must contain valid YAML syntax
- The combined configuration (main file + included files) must pass all schema validation
- Circular includes are not supported and will cause processing errors

## Troubleshooting

### Common Issues

**File Not Found Error:**
- Verify the relative path is correct
- Ensure the included file exists in the specified location
- Check file permissions

**YAML Syntax Error:**
- Validate YAML syntax in both main and included files
- Ensure proper indentation in included files
- Verify that included content matches the expected structure for that configuration section

**Schema Validation Error:**
- Ensure the included content conforms to the expected schema
- Check that required fields are present in included files
- Validate that the combined configuration is complete and valid

### Debugging Tips

- Use a YAML validator to check syntax before deployment
- Test configurations in a development environment first
- Review the Landing Zone Accelerator logs for specific error messages related to file processing

!!! warning "Important"
    Always validate your complete configuration after adding or modifying `!include` directives to ensure the resulting merged configuration is valid and complete.
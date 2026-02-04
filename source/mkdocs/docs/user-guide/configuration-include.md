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

## How It Works

The `!include` directive is a custom YAML tag that instructs the configuration parser to:

1. Read the specified file from disk
2. Parse its YAML content
3. Replace the `!include` directive with the parsed content
4. Continue processing the merged configuration

This process occurs during configuration loading, before validation. The result is equivalent to having written all content directly in the main file.

The included file's content replaces the `!include` directive at its exact location. This means:

- When `key: !include file.yaml` is specified, the file's content becomes the value of `key`
- When `- !include file.yaml` is specified in a list, the file's content becomes that list item
- If the included file contains an array (starts with `-`), and it is included as a list item, a nested array results

!!! info "Technical Note"
    The `!include` directive is implemented as a YAML custom tag using the `js-yaml` library. It follows standard YAML syntax rules and must be used in valid YAML contexts (as a scalar value, array item, or mapping value).

## Basic Usage

### Syntax

The `!include` directive must follow YAML syntax rules. Valid usage patterns:

```yaml
# As a mapping value (most common)
configurationSection: !include relative/path/to/file.yaml

# As an array item
items:
  - !include path/to/item1.yaml
  - !include path/to/item2.yaml
```

The path must be relative to the main configuration file and must point to a valid YAML file containing the configuration data for that section.

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

### Multiple Includes in Arrays

When including multiple files as array items, the structure depends on what each included file contains:

**Option 1: Include a file that contains an entire array**

If your included file contains a complete array (with `-` markers), use it as a mapping value:

**accounts-config.yaml:**
```yaml
workloadAccounts: !include include/all-workload-accounts.yaml
```

**include/all-workload-accounts.yaml:**
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

**Option 2: Include multiple files, each containing a single object**

If each included file contains a single object (no `-` markers), include them as list items:

**accounts-config.yaml:**
```yaml
workloadAccounts:
  - !include include/shared-services-account.yaml
  - !include include/network-account.yaml
  - !include include/dev-account.yaml
```

**include/shared-services-account.yaml:**
```yaml
name: SharedServices
description: The SharedServices account
email: shared-services@example.com
organizationalUnit: Infrastructure
```

**Incorrect usage - nested arrays:**
```yaml
# This pattern creates nested arrays when included files contain arrays
workloadAccounts:
  - !include include/dev-accounts.yaml    # File contains an array
  - !include include/prod-accounts.yaml   # File contains an array
# Result: workloadAccounts[0] is an array, not an object
```

!!! warning "Common Mistake"
    Including a file that contains an array as a list item results in nested arrays and causes parse errors.

### Nested Includes

You can use `!include` directives within included files to create a hierarchical structure:

**include/account-config-workloads.yaml:**
```yaml
- name: SharedServices
  description: The SharedServices account
  email: shared-services@example.com
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

### Mixing Inline and Included Content

You can combine inline configuration with included files:

```yaml
workloadAccounts:
  - name: InlineAccount
    description: Defined directly in main file
    email: inline@example.com
    organizationalUnit: Infrastructure
  - !include include/dev-account.yaml
  - !include include/prod-account.yaml
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

## Troubleshooting

### Common Issues

**File Not Found Error:**
```
Failed to include file /path/to/config/include/missing-file.yaml: ENOENT: no such file or directory
```
- Verify the relative path is correct
- Ensure the included file exists in the specified location
- Check file permissions
- Remember paths are relative to the main config file, not the current working directory

**YAML Syntax Error:**
```
Could not parse content in accounts-config: YAMLException: bad indentation
```
- Validate YAML syntax in both main and included files
- Ensure proper indentation in included files (use spaces, not tabs)
- Verify that included content matches the expected structure for that configuration section
- Check that the included file contains valid YAML (not just plain text)

**Multiple Includes Not Working:**
```
# If you see unexpected behavior with multiple includes
```
- Ensure you're using proper YAML list syntax with `-` markers
- Each `!include` must be a separate list item or array element
- Don't write consecutive `!include` directives without list markers

**Schema Validation Error:**
```
Could not parse content in accounts-config: * /workloadAccounts/0 => must have required property 'name'
```
- Ensure the included content conforms to the expected schema
- Check that required fields are present in included files
- Validate that the combined configuration is complete and valid
- The included file's content must match what would be valid in that position

**Circular Include Error:**
```
Circular include detected: file-a.yaml -> file-b.yaml -> file-a.yaml
```
- Review your include chain to find the circular reference
- Restructure your includes to avoid circular dependencies
- Consider consolidating files if they need to reference each other

### Debugging Tips

1. **Validate YAML syntax separately**: Use a YAML validator (like `yamllint` or online tools) to check syntax before deployment
2. **Test the merged result**: Mentally (or actually) merge the included content into the main file to verify it makes sense
3. **Check file paths**: Use `ls` or `tree` commands to verify your include paths are correct
4. **Start simple**: Begin with a single include and add more incrementally
5. **Review logs**: Check the Landing Zone Accelerator logs for specific error messages related to file processing
6. **Test in development**: Always test configurations in a development environment first

### Example Debugging Process

If you encounter an error:

1. **Verify the included file exists and is readable:**
   ```bash
   cat config/include/your-file.yaml
   ```

2. **Check YAML syntax:**
   ```bash
   yamllint config/include/your-file.yaml
   ```

3. **Manually merge and validate:**
   - Copy the content from the included file
   - Paste it where the `!include` directive is
   - Validate the merged configuration

4. **Check for proper list syntax:**
   ```yaml
   # Make sure you have this:
   items:
     - !include file1.yaml
     - !include file2.yaml
   
   # Not this:
   items:
     !include file1.yaml
     !include file2.yaml
   ```

!!! warning "Important"
    Always validate your complete configuration after adding or modifying `!include` directives to ensure the resulting merged configuration is valid and complete.
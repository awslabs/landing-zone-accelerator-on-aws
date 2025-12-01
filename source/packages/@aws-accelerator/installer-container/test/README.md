# Installer Container Tests

This directory contains snapshot tests for the `InstallerContainerStack` CDK construct.

## Overview

Snapshot testing captures the synthesized CloudFormation template and compares it against a saved snapshot. This approach:

- **Catches unintended changes** to infrastructure
- **Provides clear diffs** when infrastructure changes
- **Acts as documentation** of expected infrastructure state
- **Fast to write and maintain** compared to assertion-based tests

## Test Structure

```
test/
├── README.md                           # This file
├── snapshot-test.ts                    # Snapshot testing utility
├── installer-container-stack.test.ts   # Stack snapshot tests
└── __snapshots__/                      # Generated snapshot files
    └── installer-container-stack.test.ts.snap
```

## Running Tests

### Run all tests
```bash
yarn test:unit
```

### Run with coverage report
```bash
yarn test:unit --coverage
```

### Run specific test
```bash
yarn test:unit -t "Default Configuration"
```

### Update snapshots (after intentional changes)
```bash
yarn test:unit -u
```

### Watch mode (re-run on file changes)
```bash
yarn test:unit --watch
```

## Test Cases

The test suite covers five key configuration scenarios:

### 1. Default Configuration
Standard deployment with all optional features disabled.

**Key Resources:**
- CloudFormation parameters (ECR URI, account emails)
- KMS encryption key
- S3 buckets (config and access logs)
- VPC and networking resources
- ECS task definition and cluster

### 2. External Pipeline Account
Cross-account deployment from an external pipeline account.

**Additional Resources:**
- AcceleratorQualifier parameter
- ManagementAccountId parameter
- ManagementAccountRoleName parameter
- Cross-account IAM roles

### 3. Permission Boundary
Deployment with IAM permission boundaries for restricted environments.

**Additional Resources:**
- PermissionBoundaryPolicyName parameter
- IAM roles with permission boundary attached

### 4. S3 Source
Using an existing S3 bucket as the source instead of ECR.

**Additional Resources:**
- S3 source bucket references
- KMS key permissions for S3 access
- Modified ECS task definition

### 5. Single Account Mode
Simplified deployment for single-account scenarios.

**Modified Resources:**
- Simplified IAM permissions
- Reduced cross-account configurations

## Adding New Tests

To add a new test case:

1. **Add test in `installer-container-stack.test.ts`:**
```typescript
snapShotTest('Construct(InstallerContainerStack): My New Config', () => {
  const app = new cdk.App();
  return new InstallerContainerStack(app, 'TestStack', {
    // Your configuration
    myNewProp: true,
  });
});
```

2. **Run tests to generate snapshot:**
```bash
yarn test:unit
```

3. **Review the generated snapshot** in `__snapshots__/` directory

4. **Commit both the test and snapshot** to version control

## Updating Snapshots

When you intentionally change infrastructure:

1. **Make your code changes** to the stack

2. **Run tests** to see the diff:
```bash
yarn test:unit
```

3. **Review the diff carefully** - ensure changes are intentional

4. **Update snapshots** if changes are correct:
```bash
yarn test:unit -u
```

5. **Commit updated snapshots** with your code changes

⚠️ **Warning:** Always review snapshot diffs before updating. Large unexpected changes may indicate bugs.

## Troubleshooting

### "Cannot find module" errors

**Problem:** Vitest can't resolve monorepo dependencies.

**Solution:** Build the dependency packages first:
```bash
# Build installer package
yarn --cwd ../installer build

# Build utils package
yarn --cwd ../utils build

# Build constructs package
yarn --cwd ../constructs build
```

### Tests timeout

**Problem:** Tests exceed 120s timeout.

**Solution:** Increase timeout in `vitest.config.ts`:
```typescript
test: {
  testTimeout: 180000, // 3 minutes
}
```

### Snapshot instability

**Problem:** Snapshots change on every test run due to dynamic values.

**Solution:** Add a new serializer in `snapshot-test.ts`:
```typescript
// 1. Identify the pattern
const myValueRegex = /my-dynamic-pattern/;
const isMyValue = (val: unknown) => 
  typeof val === 'string' && val.match(myValueRegex) != null;

// 2. Add serializer in configureSnapshotSerializers()
expect.addSnapshotSerializer({
  test: isMyValue,
  print: () => '"REPLACED-MY-VALUE"',
});
```

### Coverage thresholds not met

**Problem:** Coverage falls below thresholds after changes.

**Solution:** Either improve test coverage or adjust thresholds in `vitest.config.ts`:
```typescript
coverage: {
  thresholds: {
    branches: 70,
    functions: 75,
    lines: 85,
    statements: 85,
  },
}
```

## Snapshot Serializers

The test suite uses custom serializers to normalize dynamic values:

| Pattern | Replacement | Purpose |
|---------|-------------|---------|
| UUIDs | `REPLACED-UUID` | CDK-generated unique identifiers |
| Zip files | `REPLACED-GENERATED-NAME.zip` | Lambda function code bundles |
| JSON paths | `REPLACED-JSON-PATH.json` | File paths in templates |
| MD5 hashes | `REPLACED-MD5` | Content hashes |

These ensure snapshots remain stable across test runs.

## Best Practices

### ✅ Do

- **Review diffs carefully** before updating snapshots
- **Test multiple configurations** to ensure flexibility
- **Keep tests focused** on one configuration aspect per test
- **Document test purpose** with clear descriptions
- **Commit snapshots** with code changes

### ❌ Don't

- **Blindly update snapshots** without reviewing changes
- **Test implementation details** - focus on CloudFormation output
- **Ignore large unexpected diffs** - investigate first
- **Skip snapshot review** in code reviews
- **Forget to build dependencies** before running tests

## Integration with CI/CD

Tests run automatically in CI/CD pipelines:

```bash
# In CI/CD pipeline
yarn test:unit --coverage --reporter=junit
```

**Snapshot failures in CI** indicate:
- Unintended infrastructure changes
- Missing snapshot updates in commit
- Environment-specific differences

Always investigate snapshot failures before merging.

## Related Documentation

- [Vitest Documentation](https://vitest.dev/)
- [CDK Testing Guide](https://docs.aws.amazon.com/cdk/v2/guide/testing.html)
- [Snapshot Testing Best Practices](https://vitest.dev/guide/snapshot.html)

## Questions?

For questions about testing:
1. Check this README
2. Review existing tests for examples
3. Consult the team's testing guidelines
4. Ask in the team's development channel

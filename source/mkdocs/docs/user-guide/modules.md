# Security Service Modules

## Overview

Starting with LZA v1.16.0, security services like Amazon Macie are managed through **modules** — direct AWS API orchestration that replaces the previous CloudFormation custom resource approach. Modules provide faster execution, better error handling, and idempotent convergence across your AWS organization.

### What changed?

| Aspect | Previous (Custom Resources) | Current (Modules) |
|--------|----------------------------|-------------------|
| Execution | Lambda-backed CloudFormation custom resources | Direct AWS SDK API calls from the pipeline |
| Scope | One stack per account/region | Centralized orchestration across all accounts and regions |
| State | CloudFormation stack state | DynamoDB state table with config change detection |
| Logging | CloudWatch Logs (Lambda function logs) | Pipeline execution logs + optional verbose CloudWatch logging |
| Lifecycle | CloudFormation CREATE/UPDATE/DELETE events | Enable/disable with proper dependency ordering |

### What happens to existing custom resources?

When a module takes over management of a service, the corresponding CloudFormation custom resources are **retained** (not deleted). This means:

- The Lambda functions and CloudWatch Log Groups from previous custom resources remain in your accounts
- LZA does not clean up these retained resources — they are inert but still exist
- You can choose to manually clean up the retained Lambda functions and their log groups once you've verified the module is operating correctly
- The CloudWatch Log Groups contain historical execution logs that may be useful for auditing

!!! note
    LZA intentionally does not delete retained resources. This is a safety measure to prevent accidental service disruption during the migration.

---

## Module Execution State

Modules track their execution state in a DynamoDB table. On each pipeline run, the module compares the current configuration against the last saved state. If nothing has changed, the module skips execution entirely.

### Checking module state

Module execution state is stored in a dedicated DynamoDB table: `{Prefix}-Module-State-{AccountId}-{Region}` (created by the Module Infrastructure stack). The `{Prefix}` is your configured accelerator prefix for standard deployments, or the qualifier prefix for external deployments. Each module entry contains:

- Configuration hash from the last successful execution
- Execution timestamp
- Result status (COMPLETED, FAILED, SKIPPED)

### Forcing re-execution

If you need to force a module to re-execute regardless of state (for example, after manual changes to the service):

1. Set `overrideExisting: true` in the module's configuration section in `security-config.yaml`
2. Run the pipeline
3. Remove `overrideExisting: true` after successful execution

```yaml
centralSecurityServices:
  macie:
    enable: true
    overrideExisting: true  # Forces module to execute even if config unchanged
```

---

## Cross-account role used by modules

For cross-account operations, modules resolve their role using the same precedence as the CDK deploy path:
`cdkOptions.useManagementAccessRole` takes precedence (uses `managementAccountAccessRole`), then a configured
`cdkOptions.customDeploymentRole`, otherwise `managementAccountAccessRole`. The default LZA-created role already
has the required permissions; a custom role must trust the module runner and grant the per-module actions. See
[Bootstrap → Deployment Role and SDK-based modules](../developer-guide/stacks/bootstrap.md) for details.

---

## Verbose Logging

Modules support verbose logging to CloudWatch for detailed troubleshooting. To enable:

1. Set the `VERBOSE_LOG_GROUP_NAME` environment variable in your pipeline configuration
2. Module execution details will be written to the specified CloudWatch Log Group
3. Logs include API calls, responses, timing, and error details

---

## Troubleshooting Module Failures

### Reading module execution logs

Module execution results appear in the LZA pipeline logs with structured output:

```
ℹ️  Module macie will be executed...
ℹ️  Checking if macie configuration has changed
ℹ️  Configuration changed for macie
🚀  Starting Macie configuration phase
✅  Macie configuration phase completed
✅  Module execution state saved successfully
✅  Completed module macie
```

If a module fails:

```
❌  Module macie failed (ErrorName): error description
```

### Common failure scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `InvalidInputException: unrecognized service principal` | Service not available in partition (e.g., Macie in GovCloud) | Module auto-skips in unsupported partitions. If you see this on older versions, upgrade LZA. |
| `State management failure: DynamoDB table not found` | Prepare stack hasn't been deployed or table was deleted | Re-run the pipeline from the Prepare stage |
| `AccessDeniedException` | Insufficient permissions for cross-account operations | Verify the cross-account role exists in all accounts. If `cdkOptions.customDeploymentRole` is set, ensure that role trusts the module runner and grants the module's required actions (see Bootstrap docs); otherwise verify the management account access role. |
| `TooManyRequestsException` | API rate limiting | Pipeline will retry automatically. If persistent, check for concurrent executions. |

---

## Skipping a Module

!!! warning "Use with caution"
    Skipping a module is an emergency measure for break/fix scenarios. It prevents the module from executing, which means the service will not be configured or updated by LZA. Only use this as a temporary workaround while investigating an issue.

If a module is causing pipeline failures and you need to unblock other deployments, you can skip it using an environment variable in the LZA pipeline:

```
SKIP_MACIE_MODULE=true
```

### Environment variable naming convention

```
SKIP_{MODULE_NAME}_MODULE=true
```

Where `{MODULE_NAME}` is the uppercase, underscore-separated module name:

| Module | Environment Variable |
|--------|---------------------|
| Amazon Macie | `SKIP_MACIE_MODULE=true` |
| TGW Associations & Propagations | `SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE=true` |
| Stack Resources Retention | `SKIP_STACK_RESOURCES_RETENTION_MODULE=true` |

### How to set the environment variable

Add the variable to your LZA CodeBuild/CodePipeline environment configuration. The exact method depends on your deployment:

- **CodeBuild**: Add to the buildspec environment variables or project configuration
- **GitLab CI**: Add as a CI/CD variable in project settings
- **Manual execution**: Export the variable before running the pipeline

### What happens when a module is skipped

- The module returns a `SKIPPED` status in the pipeline logs
- No module API calls are made for that service
- **The service continues to be managed by the existing CloudFormation custom resources** (previous LZA behavior)
- Resource retention is also skipped, so custom resources remain active and functional
- Other modules continue executing normally
- Skipping `STACK_RESOURCES_RETENTION` also causes dependent modules (like Macie) to skip, since custom resources remain active

### Re-enabling a skipped module

Remove the environment variable (or set it to `false`) and re-run the pipeline. The module will detect the configuration state and execute normally.

---

## Partition Support

Not all AWS services are available in all partitions (e.g., Amazon Macie is not available in GovCloud). LZA modules automatically detect partition availability and skip gracefully when a service is not supported:

```
ℹ️  Macie is not available in this partition: You specified an unrecognized service principal.
ℹ️  Skipping module macie as Amazon Macie is not available in this partition.
```

No action is needed — this is expected behavior in unsupported partitions.


---

## TGW Associations & Propagations Module

The TGW module manages Transit Gateway route table associations and propagations via direct API calls, replacing the previous CloudFormation custom resources. It uses **ownership-based state tracking** to safely coexist with externally-managed resources.

### How ownership tracking works

The module tracks which associations and propagations it creates. On each run, it only deletes resources that:

1. Were previously created or adopted by LZA (recorded in state), AND
2. Are no longer declared in `network-config.yaml`

Resources created outside LZA (manually, via customization stacks, or other tooling) are never deleted by the module.

### Behavior summary

| Scenario | Module action |
|----------|-------------|
| Resource in config, not in AWS | Creates it |
| Resource in config, already in AWS | Adopts it (records as owned, no change to AWS) |
| Resource not in config, owned by LZA | Deletes it |
| Resource not in config, NOT owned by LZA | Leaves it alone |
| First run (no previous state) | Creates from config, no deletions |
| Previous run failed | Creates from config, no deletions (create-only mode) |

### Upgrading from a previous version

On the first run after upgrading to a version with ownership tracking:

- The module operates in **create-only mode** (no deletions) because it has no historical ownership data
- All resources matching the current config are recorded as owned
- From the second run onwards, config-driven deletions work normally

!!! tip
    On the first post-upgrade run, the module automatically detects the absence of ownership state and forces a seeding execution — even if your config hasn't changed. This is a one-time operation that records the current resources as owned. No manual steps are required.

### Coexistence with customization stacks

Resources created by customization stacks (which run after the TGW module) are safe:

- They are never recorded in the module's owned state
- The module will never delete them on subsequent runs
- They persist indefinitely alongside LZA-managed resources

### Moving an attachment between route tables

When you change an attachment's `routeTableAssociations` in config (e.g., move from `core-rt` to `segregated-rt`), the module:

1. Disassociates from the current route table
2. Associates to the new route table

This applies regardless of how the original association was created. Adding an attachment to `network-config.yaml` means LZA manages it — including moving it if the config specifies a different route table than the current state.

### Recovery after failure

If the module fails (e.g., due to API errors or timeouts), it enters **create-only mode** on the next run:

- No deletions are performed
- Resources from config are created or verified
- On successful completion, the owned state is re-established
- Subsequent runs resume normal operation (including config-driven deletions)

This ensures transient failures never lead to unintended resource deletion.

### Important: Do not skip the module after migration

!!! danger
    Once the TGW module has executed successfully, do **not** set `SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE=true`. Skipping re-enables CloudFormation custom resources in the template, and CloudFormation will attempt to create associations/propagations that already exist in AWS — causing the **deployment to fail**. If you need to temporarily disable the module due to a pipeline issue, contact AWS Support for guidance.

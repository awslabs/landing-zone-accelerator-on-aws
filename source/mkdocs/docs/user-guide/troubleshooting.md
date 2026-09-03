# Troubleshooting

For the full troubleshooting guide, see the [Troubleshooting](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/troubleshooting.html) section of the Implementation Guide.

## Common Pipeline Errors

### Environment Validation Failures

These errors occur during the Prepare stage when the `validate-environment` Lambda detects configuration issues.

| Error Message | Cause | Resolution |
|--------------|-------|------------|
| SCP count exceeds limit | Adding SCPs would exceed the 5-per-target limit | Consolidate or remove SCPs |
| Account not found in organization | Config references an account email not in the org | Verify account emails in `accounts-config.yaml` |
| OU not found in organization | Config references a non-existent OU | Create the OU or fix `organization-config.yaml` |
| CIDR order validation failed | VPC CIDRs were reordered in config | Maintain original CIDR order; append new CIDRs |
| Stack in ROLLBACK state | A previous deployment left a stack in a failed state | Delete the rolled-back stack and retry |

### CloudFormation Stack Failures

| Error Pattern | Likely Stage | Resolution |
|--------------|-------------|------------|
| `TerminationProtection is enabled` | Any (during cleanup) | Disable termination protection, then delete |
| `Resource limit exceeded` | Network VPC | Enable V2 stacks (`useV2Stacks: true`) |
| `NoAvailableConfigurationRecorder` | Security Resources | Ensure AWS Config is enabled; for Control Tower, update accounts first |
| `Export with name already exists` | Any | Check for stack name collisions from previous deployments |
| `The Route Table Id 'rtb-...' does not exist` | Network VPC Endpoints | Removed a route table used by an S3/DynamoDB gateway endpoint in one run. Remove the gateway endpoint routes first, then delete the route table on a second run (see below) |
| `Role arn:aws:iam::<account>:role/<prefix>-Management-Deployment-Role is invalid or cannot be assumed` | Prepare (bootstrap) | `cdkOptions.centralizeBuckets` was set to `false`, so the accelerator bootstraps with the default CDK template instead of its custom template and never creates the deployment roles the Prepare stage assumes. This is not supported in version 1.14.0 and later. Set `cdkOptions.centralizeBuckets: true` in `global-config.yaml` |

### Removing a route table used by a gateway endpoint

Deleting a route table (or subnet and route table) that an S3 or DynamoDB gateway endpoint routes into causes the `Network-VpcEndpoints` stack to fail, because the `Network-Vpc` stack deletes the route table before the endpoint can drop the association. Split the change across two pipeline runs: first remove the `s3`/`dynamodb` route entries, then delete the route table. If a stack is already stuck in `UPDATE_ROLLBACK_FAILED` from a single-pass attempt, recover it with `continue-update-rollback` before re-running the pipeline. See [Removing a route table that a gateway endpoint routes into](../faq/networking/general.md#how-do-i-remove-a-route-table-that-a-gateway-endpoint-s3-or-dynamodb-routes-into) in the Networking FAQ for the full procedure and recovery steps.

### Control Tower Specific

| Issue | Resolution |
|-------|------------|
| Accounts show "Update Available" after adding a region | Manually update accounts in Control Tower (5 at a time) before retrying the pipeline |
| Landing Zone update fails | Ensure Control Tower is managed by LZA via `controlTower/landingZone` in `global-config.yaml` |

## Removing the deprecated Diagnostics Pack

The installer-deployed Diagnostics Pack has been removed. Failure diagnostics are now collected automatically by the pipeline on every failed run — see [Pipeline Diagnostics](pipeline-diagnostics.md).

Upgrading to a release without the Diagnostics Pack leaves two categories of previously deployed resources:

- **`<prefix>-DiagnosticsPackAccessRole` (each account, home region):** removed automatically. It is created by the `DependenciesStack` (deployed in the Key stage), so the next pipeline run synthesizes without it and CloudFormation deletes the role. No manual action is required.
- **`<prefix>-DiagnosticsPackStack-<account-id>-<home-region>` (pipeline account, home region):** this stack is deployed directly by the installer with termination protection enabled, so it does **not** self-delete when the installer stops deploying it. It is idle and incurs effectively no cost, so it is safe to leave in place. To remove it manually, in the pipeline account and home region:

    1. Look up the exact stack name. The deployed name includes the pipeline account ID and home region as a suffix (for example `AWSAccelerator-DiagnosticsPackStack-111122223333-us-east-1`), so confirm it before running any delete command:

        ```bash
        aws cloudformation list-stacks \
          --region <home-region> \
          --query "StackSummaries[?contains(StackName, 'DiagnosticsPackStack') && StackStatus != 'DELETE_COMPLETE'].StackName"
        ```

    2. Disable termination protection on the stack, using the full name from the previous step:

        ```bash
        aws cloudformation update-termination-protection \
          --no-enable-termination-protection \
          --stack-name <prefix>-DiagnosticsPackStack-<account-id>-<home-region> \
          --region <home-region>
        ```

    3. Delete the stack:

        ```bash
        aws cloudformation delete-stack \
          --stack-name <prefix>-DiagnosticsPackStack-<account-id>-<home-region> \
          --region <home-region>
        ```

    Replace `<prefix>` with your accelerator prefix (`AWSAccelerator` by default, or your configured qualifier), `<account-id>` with the pipeline account ID, and `<home-region>` with the home region. `delete-stack` returns success even when the stack name does not exist, so verify the name in step 1 first — otherwise the protected stack silently remains. Running a full LZA uninstall also removes this stack, so no manual step is needed if you are uninstalling the solution entirely.

## Getting Help

File support tickets via the [AWS Support console](https://support.console.aws.amazon.com/support/home) using **Service: Control Tower → Category: Landing Zone Accelerator**.

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
| `Error while trying to attach policy: p-<id>` with `PolicyNotFoundException` | Organization, Accounts or Finalize | A rollback before version 1.17.1 deleted a policy that another stack still references. See [Recovering shared AWS Organizations policies after a rollback](#recovering-shared-aws-organizations-policies-after-a-rollback) |
| `Role arn:aws:iam::<account>:role/<prefix>-Management-Deployment-Role is invalid or cannot be assumed` | Prepare (bootstrap) | `cdkOptions.centralizeBuckets` was set to `false`, so the accelerator bootstraps with the default CDK template instead of its custom template and never creates the deployment roles the Prepare stage assumes. This is not supported in version 1.14.0 and later. Set `cdkOptions.centralizeBuckets: true` in `global-config.yaml` |

### Removing a route table used by a gateway endpoint

Deleting a route table (or subnet and route table) that an S3 or DynamoDB gateway endpoint routes into causes the `Network-VpcEndpoints` stack to fail, because the `Network-Vpc` stack deletes the route table before the endpoint can drop the association. Split the change across two pipeline runs: first remove the `s3`/`dynamodb` route entries, then delete the route table. If a stack is already stuck in `UPDATE_ROLLBACK_FAILED` from a single-pass attempt, recover it with `continue-update-rollback` before re-running the pipeline. See [Removing a route table that a gateway endpoint routes into](../faq/networking/general.md#how-do-i-remove-a-route-table-that-a-gateway-endpoint-s3-or-dynamodb-routes-into) in the Networking FAQ for the full procedure and recovery steps.

### Recovering shared AWS Organizations policies after a rollback

Before version 1.17.1, more than one stack managed the same AWS Organizations policy. The OrganizationsStack in every enabled Region managed each tag policy, and both the AccountsStack and the FinalizeStack managed each service control policy, resource control policy and declarative policy. When one of these stacks rolled back, for example the OrganizationsStack of a newly added Region that failed to create, it detached and deleted the policy for the whole organization. The other stacks kept the ID of the deleted policy.

A deployment in this state shows these symptoms:

- A later pipeline run fails in the Organization, Accounts or Finalize stage with `Error while trying to attach policy: p-<id>` and `PolicyNotFoundException`.
- The rollback of that update fails the same way, and the stack is left in `UPDATE_ROLLBACK_FAILED`.

Version 1.17.1 and later no longer delete a shared policy from a stack that does not own it, but they do not repair a deployment that is already in this state.

!!!warning
    Recover before you remove an affected policy, or one of its targets, from `organization-config.yaml`. Only the owning stack removes a policy. While the owning stack still holds the ID of the deleted policy, it cannot find the policy that replaced it, so that policy stays attached and the accelerator no longer removes it.

1. **Return failed stacks to a stable state.** In the management account, check the OrganizationsStack in every enabled Region and the AccountsStack and FinalizeStack in the global Region (`us-east-1` in the commercial partition). For each stack in `UPDATE_ROLLBACK_FAILED`, open the **Events** tab and note the logical IDs of the `Custom::AttachPolicy` resources whose `UPDATE_FAILED` status reason contains `PolicyNotFoundException`. Other attachments in the same stack can also show `UPDATE_FAILED` with the reason `Resource update cancelled`; do not skip those, because CloudFormation rolls them back normally. Continue the rollback, skipping only the attachments you noted (separate several logical IDs with spaces):

    ```bash
    aws cloudformation continue-update-rollback \
      --stack-name <stack-name> \
      --resources-to-skip <AttachPolicyLogicalId> \
      --region <region>
    ```

2. **Force the policy resources to update.** On the toolkit CodeBuild project in the home Region, add the environment variable `ACCELERATOR_FORCED_UPDATE` with the value `true`. The project is named `<prefix>-ToolkitProject`, or `<qualifier>-toolkit-project` for external pipeline account deployments. Replace `<prefix>` with your accelerator prefix (`AWSAccelerator` by default) and `<qualifier>` with the installer `AcceleratorQualifier` parameter.

3. **Re-run the pipeline.** Release the pipeline once. Every `Custom::CreatePolicy` resource looks up its policy by name, creates it again if it no longer exists, and records the current policy ID. The `Custom::AttachPolicy` resources then attach that policy to the configured targets. Cleaning up a stale policy ID finds nothing to delete, because the IDs no longer match.

4. **Remove the environment variable.** Remove `ACCELERATOR_FORCED_UPDATE` from the toolkit project. While it is set, every pipeline run updates every policy and policy attachment.

The uninstaller still detaches and deletes these policies when it deletes the OrganizationsStack of a Region other than the home Region, and when it deletes the FinalizeStack in the same run as the AccountsStack. A partial uninstall that keeps the AccountsStack, for example with `--action-name Finalize`, leaves the service control policies, resource control policies and declarative policies in place for the AccountsStack. If the home Region is not listed in `enabledRegions`, every OrganizationsStack keeps the earlier behavior and deletes the tag policies itself.

### Control Tower Specific

| Issue | Resolution |
|-------|------------|
| Accounts show "Update Available" after adding a region | Manually update accounts in Control Tower (5 at a time) before retrying the pipeline |
| Landing Zone update fails | Ensure Control Tower is managed by LZA via `controlTower/landingZone` in `global-config.yaml` |

### Recovering log groups encrypted with a deleted accelerator CloudWatch Logs key

In versions before 1.17.1, if the first deployment of a `LoggingStack` failed after the accelerator had associated its CloudWatch Logs KMS key with existing log groups, the CloudFormation rollback scheduled that key for deletion. Those log groups then cannot ingest new events or return events encrypted with the key. From version 1.17.1 the key is retained on rollback, so this cannot recur; the retained key stays associated with those log groups and keeps working, so do not delete it. Log groups that are already affected must be recovered manually. The accelerator does not re-point them automatically, because it cannot distinguish a former accelerator key from a customer-managed key.

Run the following in each affected account and region.

1. Find the affected log groups. List every log group's key, then check the state of each distinct key with `aws kms describe-key`. Affected log groups use a key in the `PendingDeletion` or `Disabled` state:

    ```bash
    aws logs describe-log-groups \
      --query "logGroups[?kmsKeyId].[logGroupName,kmsKeyId]" \
      --output text --region <region>

    aws kms describe-key --key-id <key-arn> \
      --query "KeyMetadata.[KeyState,DeletionDate,Description]" --region <region>
    ```

    From version 1.15.0, accelerator CloudWatch Logs keys have the description `KMS key for encrypting CloudWatch Log Groups created by LZA`. A description can be copied, so also confirm that you did not create the key yourself before changing anything. If `describe-key` returns `NotFoundException`, the key has already been deleted and events encrypted with it cannot be recovered.

2. Restore each former key before its deletion date. AWS KMS deletes a key permanently at the end of its 7 to 30 day waiting period, after which events encrypted with it cannot be recovered. A cancelled key is `Disabled`, so enable it as well:

    ```bash
    aws kms cancel-key-deletion --key-id <old-key-arn> --region <region>
    aws kms enable-key --key-id <old-key-arn> --region <region>
    ```

    Once the key is enabled, CloudWatch Logs can use it again for those log groups. You can stop here, or continue to move the log groups to the current accelerator key.

3. Look up the current accelerator CloudWatch Logs key, which the `LoggingStack` stores in Parameter Store. Replace `/accelerator` with `/<prefix>` if you use a custom accelerator prefix:

    ```bash
    aws ssm get-parameter --name /accelerator/kms/cloudwatch/key-arn \
      --query "Parameter.Value" --output text --region <region>
    ```

4. Re-associate the affected log groups with the full ARN of the current key in small batches. Only change log groups that you confirmed in step 1 were on a former accelerator key; do not change log groups that use your own keys:

    ```bash
    aws logs associate-kms-key --log-group-name <log-group-name> \
      --kms-key-id <current-key-arn> --region <region>
    ```

    The change can take up to five minutes to take effect. After each batch, confirm that new events arrive and that older events can still be read.

5. Keep the former keys enabled until every event encrypted with them has expired under the log group's retention period, which is indefinitely for a log group whose events never expire. Newly ingested events use the current key, but existing events stay encrypted with the key that was in use when they were ingested.

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

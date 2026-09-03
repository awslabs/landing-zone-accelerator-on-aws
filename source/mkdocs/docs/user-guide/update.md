# Updating the Solution

For step-by-step instructions on updating the Landing Zone Accelerator to a newer version, please refer to the [Update the solution](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html) section of the Implementation Guide.

## Before You Update

1. Run the core pipeline manually on your current version
2. Troubleshoot any existing issues so your current version runs cleanly
3. Review the [release notes](https://github.com/awslabs/landing-zone-accelerator-on-aws/releases) for the target version

## Update Process Summary

1. Navigate to the CloudFormation console and select the `AWSAccelerator-InstallerStack`
2. Choose **Update** → **Replace current template**
3. Use the latest template URL from the [solution page](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)
4. Update the **Branch Name** parameter to the release branch of the target version
5. Review and execute the stack update

The update automatically triggers the core pipeline with the new version.

!!! warning
    Always review the release notes for breaking changes before updating. Some version upgrades may require configuration file changes.

## Removed Installer Parameters

When a release removes a parameter from the installer template, updating through the CloudFormation console needs no action: the console only prompts for the parameters the new template declares. Automation is different. CloudFormation rejects a parameter key that the template does not declare, so a call that still supplies the removed parameter fails with a `ValidationError` (for example `Parameters: [EnableDiagnosticsPack] do not exist in the template`). The call is rejected before the update starts, so the stack is left untouched rather than rolled back, but the upgrade does not proceed until the caller is fixed.

Check for both of these shapes before upgrading:

- an explicit value, such as `--parameters ParameterKey=EnableDiagnosticsPack,ParameterValue=No`;
- a wrapper that reads the stack's current parameter set and replays it in full, including `ParameterKey=EnableDiagnosticsPack,UsePreviousValue=true`.

| Removed in | Parameter | Action |
| ---------- | --------- | ------ |
| 1.18.0 | `EnableDiagnosticsPack` | Drop the parameter from any installer stack update automation. The Diagnostics Pack it enabled has been removed; failure diagnostics are now collected automatically on every failed pipeline run. See [Removing the deprecated Diagnostics Pack](./troubleshooting.md#removing-the-deprecated-diagnostics-pack) for the leftover resources. |

## Configuration Changes That Replace Resources

Some configuration properties map to CloudFormation properties that require the underlying resource to be **replaced (recreated)** when they change. For these properties, CloudFormation treats *first adding the property* (absent → present) as a change, so declaring the field on a pre-existing resource can trigger a replacement **even if the value you set matches the current default behavior**. Replacement can be disruptive and, if the resource has dependencies that are not managed by LZA, may fail and leave the old resource orphaned.

### Transit Gateway `multicastSupport`

Adding or changing `multicastSupport` on an existing Transit Gateway in `network-config.yaml` recreates the Transit Gateway, because `MulticastSupport` on `AWS::EC2::TransitGateway` is a replacement-triggering property. This happens for **any** value — including `disable` — the first time the field is declared on a Transit Gateway that was created by an LZA version that did not emit the property.

A Transit Gateway replacement disrupts all attachments (VPC, VPN, Direct Connect, peering, and Connect) and their route tables. If any attachments are managed outside LZA, deletion of the old Transit Gateway can fail and leave it orphaned alongside the new one.

- If you do not need multicast, do **not** add `multicastSupport` to a pre-existing Transit Gateway.
- If you do need it, plan the change as a controlled migration and consider protecting critical resources with a [stack policy](./stack-policy.md).

!!! tip
    Before an upgrade — especially one that crosses a version where new properties are introduced — generate a CloudFormation change set with `--no-execute` on the affected stacks (for example, `AWSAccelerator-NetworkPrepStack`) and scan for `"Replacement": "True"` to catch unintended resource replacements before running the pipeline.

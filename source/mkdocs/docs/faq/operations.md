# Operations FAQ

## How do I manage my organizational units (OUs) when using CT and Landing Zone Accelerator?

All OUs and accounts that you create in CT are governed automatically by CT. OUs that are generated outside of CT require you to manually enroll the OU with CT before it can be managed and governed by CT. When using CT and Landing Zone Accelerator together, Landing Zone Accelerator will not automate the creation of additional OUs, as there is currently not an automated mechanism to enroll the newly created OU with CT. This design decision minimizes opportunities for environment drift with CT.

When using Landing Zone Accelerator without CT, this additional step is not required.

For more information on enrolling OUs in Landing Zone Accelerator, please see [Adding an Organizational Unit (OU)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-an-organizational-unit-ou) in the solution implementation guide.

## How do I create additional accounts when using CT and Landing Zone Accelerator?

When new account entries are added to the Landing Zone Accelerator `accounts-config.yaml` configuration file and the Core pipeline is released, Landing Zone Accelerator will utilize the CT Account Factory Service Catalog product to generate the new accounts. Similar to OUs, accounts that are generated outside of CT require you to enroll the account with CT before it can be managed and governed by CT. If you create an account outside of Control Tower (likely directly through the Organizations console or API), you can add the account information to the Landing Zone Accelerator configuration and the solution will automatically enroll the new account into CT using the CT Account Factory Service Catalog product.

For more information on enrolling new accounts in Landing Zone Accelerator, please see [Adding a new account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-a-new-account) in the solution implementation guide.

## How do I add existing accounts when using CT and Landing Zone Accelerator?

Please refer to [Adding an existing account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-an-existing-account) in the solution implementation guide for guidance on adding an existing account to your Landing Zone Accelerator environment.

## How do I remove an existing AWS Account?

The account removal process requires several important steps to ensure a clean transition, please see [closing-an-account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#closing-an-account) in the solution implementation guide for guidance on closing an account from your Landing Zone Accelerator environment

## How do I migrate my configuration repository from CodeCommit to S3?

Updating the `AWSAccelerator-InstallerStack` with `ConfigurationRepositoryLocation` changed from `codecommit` to `s3` fails with `ConfigRepositoryLocation parameter set to s3, but existing deployment using CodeCommit was detected`. The installer's validation lambda inspects the `Configuration` Source action of the existing `AWSAccelerator-Pipeline` and blocks the change while its provider is `CodeCommit`. Switching that action's provider away from `CodeCommit` before the installer update lets the validation pass.

1. Back up the contents of the `aws-accelerator-config` CodeCommit repository (for example, by cloning it locally).
2. Create a temporary S3 bucket, e.g. `aws-accelerator-tmp-<ACCOUNT_ID>-<HOME_REGION>`. The bucket can be empty; it only needs to exist long enough to satisfy the Source action edit.
3. Edit the `Configuration` action in the `Source` stage of `AWSAccelerator-Pipeline` to use the temporary bucket as an S3 source. The action provider is now `S3` instead of `CodeCommit`.
4. Update the `AWSAccelerator-InstallerStack` with `ConfigurationRepositoryLocation` set to `s3`. The installer pipeline runs and CDK redeploys `AWSAccelerator-PipelineStack`, which creates the `aws-accelerator-config-<ACCOUNT_ID>-<HOME_REGION>` bucket (`<accelerator-prefix>-config-...` for non-default prefixes) and re-points the `Configuration` action at it. The build seeds the new bucket with a default skeleton configuration at `zipped/aws-accelerator-config.zip`.
5. As soon as `AWSAccelerator-Pipeline` starts automatically, stop the execution. This prevents the skeleton configuration from being applied.
6. Zip your backed-up configuration files with the YAML files at the root of the archive, and upload it to `s3://aws-accelerator-config-<ACCOUNT_ID>-<HOME_REGION>/zipped/aws-accelerator-config.zip`, overwriting the skeleton.
7. Release a change on `AWSAccelerator-Pipeline` to deploy the migrated configuration.
8. Delete the temporary bucket from step 2.

## Why doesn't my updated GitHub token take effect?

This applies only when **all** of the following are true: you deploy from a GitHub source, CloudTrail is **not** enabled in the management account, and you have updated the `accelerator/github-token` secret after deployment. In that case the installer pipeline keeps using the old token and fails at the `Source` stage once it expires. If CloudTrail is enabled (AWS Control Tower enables it for you), token updates sync automatically and this issue does not occur.

The personal access token is stored in the `accelerator/github-token` secret in Secrets Manager. When the installer stack is deployed, CloudFormation resolves the secret once and writes its value directly into the installer pipeline's GitHub `Source` action. The pipeline does **not** re-read the secret afterward, so updating the secret on its own leaves the pipeline using the value captured at deploy time.

To keep the pipeline in sync, the installer deploys an `update-pipeline-github-token` Lambda that rewrites the token in the pipeline whenever the secret changes. That Lambda is triggered by an EventBridge rule which matches the Secrets Manager `PutSecretValue` API call **in CloudTrail**. Without CloudTrail in the management account, the API call is never recorded, the rule never fires, and the pipeline keeps using the old token. After the old token expires, the pipeline fails at the `Source` stage with an error similar to:

```
Could not access the GitHub repository: "landing-zone-accelerator-on-aws".
The access token might be invalid or has been revoked.
```

You have two ways to address this.

**Option A - Enable CloudTrail (recommended).** Enable a CloudTrail trail in the management account so Secrets Manager API calls are recorded. Future token updates then sync to the pipeline automatically with no further action.

**Option B - Update the token manually.** Use this if you cannot enable CloudTrail, or to recover immediately after a rotation.

1. Update the secret value. Follow [Update the value for an AWS Secrets Manager secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_update-secret-value.html) and set the new token as the plaintext value of the `accelerator/github-token` secret.

2. Find the installer pipeline name. The GitHub token lives only on the **installer** pipeline (the core `*-Pipeline` deploys from your configuration repository, not GitHub). The name depends on your deployment: it is `AWSAccelerator-Installer` by default, `<AcceleratorPrefix>-Installer` if you set a custom prefix, or `<AcceleratorQualifier>-installer` for external-pipeline deployments. To list the exact name (replace `<profile>` with your AWS CLI profile):

    ```bash
    aws codepipeline list-pipelines --profile <profile> \
      --query "pipelines[?contains(name, 'nstaller')].name"
    ```

3. Export the current pipeline definition to a file. This returns the full structure, including the GitHub `Source` action whose `OAuthToken` needs refreshing. See [get-pipeline](https://docs.aws.amazon.com/cli/latest/reference/codepipeline/get-pipeline.html).

    ```bash
    aws codepipeline get-pipeline --name <installer-pipeline-name> --profile <profile> \
      > pipeline.json
    ```

4. Edit `pipeline.json`:
    - In the `Source` stage's `Source` action, set `configuration.OAuthToken` to your new token value (the exported file shows it masked as `****`).
    - Remove the top-level `metadata` block (the `pipelineArn`, `created`, and `updated` fields). `update-pipeline` rejects the file if it is present.

5. Apply the updated definition. Each successful update increments the pipeline version. See [update-pipeline](https://docs.aws.amazon.com/cli/latest/reference/codepipeline/update-pipeline.html).

    ```bash
    aws codepipeline update-pipeline --cli-input-json file://pipeline.json --profile <profile>
    ```

6. Release a change to confirm the `Source` stage now succeeds.

## How do I manage my SCPs when using CT and Landing Zone Accelerator?

You can use Landing Zone Accelerator to deploy custom SCPs into your environment in addition to the SCPs that are deployed and managed by CT. Landing Zone Accelerator will only manage SCPs that are part of the accelerator configuration, and will not manage any SCPs that are deployed by CT. Note, Organizations sets a limit of 5 SCPs per OU and CT will consume up to 3 SCPs which will leave 2 additional SCPs that you can add. For finer grained SCPs, Landing Zone Accelerator also allows you to deploy custom SCPs to specific accounts.

For more information on managing SCPs in Landing Zone Accelerator, please see [Adding a Service Control Policy (SCP)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-a-service-control-policy-scp) in the solution implementation guide.

## How do I troubleshoot deployment and validation errors?

Common troubleshooting scenarios are documented in the [Troubleshooting](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/troubleshooting.html) section of the solution implementation guide. This section will continue to grow with additional scenarios as common deployment and environment validation error cases are reported.

## How do I troubleshoot AWS Control Tower Landing Zone deployment and validation errors?

It is recommended that you refer to the AWS Control Tower [pre-requisites](./ct-cfct.md#can-i-deploy-or-manage-existing-aws-control-tower-in-landing-zone-accelerator-solution) before troubleshooting any issues related to AWS Control Tower Landing Zone deployment.

##### Common Errors

`AWSOrganizationsNotInUseException: Your account is not a member of an organization. in accounts-config.yaml config file`

Landing Zone Accelerator may return an error during configuration validation if AWS Organizations is not configured. Please configure AWS Organizations before deploying the solution. In order to learn more about setting up an AWS organization, you may refer to this [Creating an organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html)

`AWS Control Tower Landing Zone cannot deploy because AWS Organizations have not been configured for the environment.`

AWS Control Tower Landing Zone can be deployed using the Landing Zone Accelerator solution when AWS Organizations configured in the environment. AWS Organizations should be configured with all features enabled before Landing Zone Accelerator can be deployed. In order to learn more about setting up an AWS organization, you may refer to this [Creating an organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html). After you create an organization and before you can deploy Landing Zone Accelerator solution, you must verify that you own the email address provided for the management account in the organization. 

`AWS Control Tower Landing Zone cannot deploy because there are multiple organizational units in AWS Organizations.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are organizational units in AWS Organizations. Prior to deploying the solution, it is necessary to clean up existing organizational units. When there are existing organizational units within the AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because there are multiple accounts in AWS Organizations.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are additional accounts in AWS Organizations. AWS Organizations can have only management account. When there are existing AWS accounts within the AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because IAM Identity Center is configured.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there is existing IAM Identity Center configured. When there is existing IAM Identity Center configured, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because AWS Organizations have services enabled.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are trusted access with any AWS service is enabled for AWS Organizations. When when there are trusted access with any AWS service is enabled for AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_dist_packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html configuration, you can manage existing AWS Control Tower Landing Zone.

`The landing zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,

The Landing Zone Accelerator solution cannot update or reset AWS Control Tower Landing Zone when there is already an execution in progress. The current AWS Control Tower change operation must be completed before you can proceed.

 `AWS Control Tower Landing Zone's most recent version is <LATEST_VERSION>, which is different from the version <CONFIG_VERSION> specified in global-config.yaml file.` 

Landing Zone Accelerator cannot update or reset AWS Control Tower Landing Zone if the Landing Zone version does not match the latest version of the AWS Control Tower Landing Zone. In order to resolve this issue, it is recommended that you review the [AWS Control Tower release notes](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html), and update the version property of `landingZone` [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html) configuration. Alternatively, you may rollback [ControlTowerLandingZoneConfig](/landing-zone-accelerator-on-aws/typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.IControlTowerLandingZoneConfig.html) configuration changes so that the solution does not attempt to update the AWS Control Tower Landing Zone. In the event the current AWS Control Tower Landing Zone drifts, the solution will attempt to reset the landing zone, which will require the latest version to be specified in the configuration.

`AWS Control Tower operation with identifier <OPERATION_IDENTIFIER> in FAILED state !!!!. Please investigate CT operation before executing pipeline`

Landing Zone Accelerator returns this error when creating a AWS Control Tower Landing Zone fails with any errors. Resolve the root cause of the AWS Control Tower setup failure before retrying the failed stage of the Landing Zone Accelerator pipeline. It may be possible to identify the root cause of the issue by reviewing AWS CloudTrail trails or AWS CloudFormation stacks. It should be noted that if the home region for the environment is different from the [global region](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#ensure-your-global-region-is-accessible), you may need to review trails in the global region as well to identify the root cause.
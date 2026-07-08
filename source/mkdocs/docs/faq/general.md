# General FAQ

## What is Landing Zone Accelerator on AWS?

The Landing Zone Accelerator on AWS is an open-source solution that will help customers quickly deploy a secure, scalable, and fully-automated cloud foundation. The Landing Zone Accelerator is architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. When used in coordination with services such as AWS Control Tower, it provides a simplified no-code solution to manage and govern a multi-account environment built to support customers with complex compliance requirements. Additionally, the Landing Zone Accelerator on AWS supports non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and Top Secret regions.

The Landing Zone Accelerator is built using the AWS Cloud Development Kit (CDK), and installs directly into a customers environment, where they have full access to the infrastructure as code (IaC) solution. Through a simplified set of configuration files, customers are able to enable additional functionality, guardrails (e.g., AWS Managed Config Rules), and manage their foundational networking topology (e.g., Transit Gateways and Network Firewall).

## Why should I use this solution?

Landing Zone Accelerator is ideal for customers that don't have the expertise or don't want to design an enterprise platform and governance tool chain. Any customer who is looking to build on AWS and wants to do so in a compliant way can use this solution to quickly improve their cloud security posture.

## How does it work?

Landing Zone Accelerator is installed into your AWS Organizations Management account through AWS CloudFormation. You can utilize a provided default configuration to initialize your environment with technical security controls and foundational infrastructure on AWS that aligns with best practices and conforms with several compliance frameworks. Customers are able to make additional modifications to configuration files, such as adding additional AWS accounts or VPCs.

## Is this solution only applicable to government customers?

No, Landing Zone Accelerator is applicable for all customers that need to implement an architecture based on best practice security. Deployment is supported in any of the regions where Control Tower is available, as well as AWS GovCloud (US).

Landing Zone Accelerator is delivered with [sample configuration files](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations) which deploy opinionated and prescriptive architectures designed to meet the security and operational requirements of many customers around the world. While installation of the provided prescriptive architectures are reasonably simple, deploying a customized architecture does require extensive understanding of the AWS platform.

## Will AWS have access to customer's data if they use this solution?

No, Landing Zone Accelerator resides within your Management account and is controlled by you. The Landing Zone Accelerator on AWS does not change any of the responsibilities in the [Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/). Another benefit to having the code available as open source is the transparency it brings so customers can be certain of what is being done in their accounts.

## Where can I get additional technical assistance for Landing Zone Accelerator?

Customers are able use the [AWS Support console](https://support.console.aws.amazon.com/support/home) to file issues directly against Landing Zone Accelerator. Please use **_Service: Control Tower → Category: Landing Zone Accelerator_** when filing support tickets.

## Where can I find a software bill of materials (SBOM) for the Landing Zone Accelerator?

A software bill of materials can be generated from the Landing Zone Accelerator repository hosted on [GitHub](https://github.com/awslabs/landing-zone-accelerator-on-aws). For instructions on how to generate the SBOM, please see [Exporting a software bill of materials for your repository](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/exporting-a-software-bill-of-materials-for-your-repository).

## How do I add a new region to Landing Zone Accelerator?

The process for adding a new region depends on your deployment type. Choose the appropriate section below:

### With AWS Organizations Only (No Control Tower)

**Prerequisites:**

1. For opt-in regions: Ensure STS Global Endpoints are set to be valid in all regions (IAM Settings in the Management account)
2. For opt-in regions: Set `enableOptInRegions: true` in `global-config.yaml`
3. In `security-config.yaml`, configure proper exclusions for security services or Config Rules that are not available in the target region (e.g., Amazon Macie is not supported in ca-west-1)
4. Ensure AWS Config is enabled: Add `enableConfigurationRecorder: true` under `awsConfig` in `security-config.yaml`

**Configuration Steps:**

1. Add the new region to `enabledRegions` in `global-config.yaml`
2. Deploy the LZA pipeline
3. Monitor the deployment for any failed stacks and address issues as needed

**Troubleshooting:**

- **Failed Security_Resources Stacks:** If stacks fail during deployment:
  1. Disable termination protection on failed stacks
  2. Manually delete the orphaned CloudFormation stacks in the new region
  3. Retry the Deploy stage in the LZA pipeline

### With AWS Control Tower

!!! info "How LZA handles this for you"
    When you add a Region to a Control Tower-governed landing zone, Control Tower starts governing that Region at the OU level, but each member account's AWS Config configuration recorder is only created once the account's baseline is updated. Until that happens the accounts are in a **mixed governance** state (the OU is governed in the new Region, but the accounts are not yet updated), and deploying resources into the new Region would fail in the `Security_Resources` (or later) stage with a `NoAvailableConfigurationRecorder` error.

    LZA handles this for you. When it detects that the governed Region list changed, it automatically re-registers (resets the baseline of) every governed OU during the `Prepare` stage, which updates all member accounts and provisions their Config recorders in the new Region before later stages deploy resources. You no longer need to update accounts manually or split the change across two commits. For background, see the AWS Control Tower documentation on [About landing zone updates](https://docs.aws.amazon.com/controltower/latest/userguide/about-updates.html) and [Avoid mixed governance when configuring Regions](https://docs.aws.amazon.com/controltower/latest/userguide/mixed-governance.html).

**Prerequisites:**

1. For opt-in regions: Ensure STS Global Endpoints are set to be valid in all regions (IAM Settings in the Management account)
2. For opt-in regions: Set `enableOptInRegions: true` in `global-config.yaml`
3. Have Control Tower managed by LZA by defining the `controlTower/landingZone` in `global-config.yaml`
4. In `security-config.yaml`, configure proper exclusions for security services or Config Rules that are not available in the target region (e.g., Amazon Macie is not supported in ca-west-1)
5. Optionally, ensure AWS Config is enabled: Add `enableConfigurationRecorder: true` under `awsConfig` in `security-config.yaml`

**Steps:**

1. Add the new region to `enabledRegions` in `global-config.yaml`. You can add resources that target the new Region (for example, VPCs in `network-config.yaml`, or security services in `security-config.yaml`) in the same commit.
2. Deploy the LZA pipeline. During the `Prepare` stage LZA calls the Control Tower `UpdateLandingZone` API with the new Region, detects the governed-region change, and automatically re-registers each governed OU (resetting its baseline). This updates all member accounts in those OUs and provisions their AWS Config recorders in the new Region. LZA waits for these baseline operations to complete before continuing.
3. Later stages (`Security_Resources` and downstream) then deploy into the new Region against the now-present Config recorders.

!!! note "Timing in large environments"
    Baseline re-registration runs per OU and can take significant time in organizations with many accounts. The `Prepare` stage waits for the operations to complete, but they are bounded by a timeout. If a baseline operation exceeds it, the pipeline aborts and asks you to confirm completion in the Control Tower console, after which you can re-run the pipeline. You can monitor progress in the Control Tower console (see "Confirming mixed governance" below). Note that the Security / Log Archive OU baseline is managed separately and is not part of this automatic re-registration.

**What is a mixed governance state?**

Mixed governance occurs when the controls governing an OU do not match the controls actually applied to every account within that OU. It happens when Control Tower extends (or removes) governance for a Region but the member accounts have not yet been updated. In this state, Control Tower cannot reliably enable detective controls (which are backed by AWS Config rules), so you may see `FAILED_TO_ENABLE` in Control Tower and `NoAvailableConfigurationRecorder` in the LZA pipeline. Note that mixed governance is **not** the same as drift and is not reported as drift.

**Confirming mixed governance (console and CLI):**

- **Console:** In the AWS Control Tower console, open **Organization**. Accounts that still need updating show **Update available** (rather than **Enrolled** / current). An OU in mixed governance also surfaces an alert banner, and opt-in Regions can show **Not governed** for accounts that have not been updated.
- **CLI:** There is no single API that returns "mixed governance" directly. You can inspect per-account baseline currency with `aws controltower list-enabled-baselines` and `aws controltower get-enabled-baseline --enabled-baseline-identifier <arn>` (check the baseline version and operation status per target), and enumerate accounts with `aws organizations list-accounts`. If baseline versions differ across accounts in the same OU, or an OU shows accounts pending update, you are in a mixed governance state.

**Troubleshooting:**

- **"NoAvailableConfigurationRecorder" Error:** AWS Config is not yet set up in the new Region for one or more accounts, meaning the automatic OU re-registration did not update them (for example, a baseline operation timed out, or the account is in the separately managed Security / Log Archive OU). Confirm all accounts show **Enrolled** / up to date in the Control Tower console, update any that are still pending, then retry the LZA pipeline.
- **Failed Security_Resources Stacks:** If stacks fail during initial deployment:
    1. Disable termination protection on failed stacks
    2. Manually delete the orphaned CloudFormation stacks in the new region
    3. Retry the Deploy stage in the LZA pipeline
- **Mixed Governance State:** Ensure all accounts show as **Enrolled** (not **Update available**) in Control Tower before proceeding. See "Confirming mixed governance" above.

**Important Notes for Control Tower Deployments:**

- Adding a Region to `global-config.yaml` triggers automatic OU re-registration during the `Prepare` stage. You do not need to update Control Tower accounts manually or split enabling and using the Region across two commits.
- Baseline re-registration can take significant time in environments with many accounts. Monitor the `Prepare` stage and the Control Tower console; if operations exceed the pipeline timeout, confirm completion in the console and re-run.
- If an account is not updated automatically (for example, a timed-out baseline operation or the separately managed Security / Log Archive OU), update it in Control Tower before retrying failed LZA pipeline actions.
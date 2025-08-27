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

**Prerequisites:**

1. For opt-in regions: Ensure STS Global Endpoints are set to be valid in all regions (IAM Settings in the Management account)
2. For opt-in regions: Set `enableOptInRegions: true` in `global-config.yaml`
3. Have Control Tower managed by LZA by defining the `controlTower/landingZone` in `global-config.yaml`
4. In `security-config.yaml`, configure proper exclusions for security services or Config Rules that are not available in the target region (e.g., Amazon Macie is not supported in ca-west-1)
5. Optionally, ensure AWS Config is enabled: Add `enableConfigurationRecorder: true` under `awsConfig` in `security-config.yaml`

**Configuration Steps:**

1. Add the new region to `enabledRegions` in `global-config.yaml`
2. Deploy the LZA pipeline - it will call the UpdateLandingZone API with the new regions during the Prepare stage
3. Once the operation completes, all accounts outside the Security OU will show as "Update Available" in Control Tower
4. **Critical Step:** Manually update all accounts in Control Tower (5 at a time) to activate the region and deploy AWS Config recorders
5. Verify all accounts show "Enrolled" status before proceeding

**Troubleshooting:**

- **"NoAvailableConfigurationRecorder" Error:** This occurs when AWS Config is not properly set up in the new region. You must update accounts in Control Tower before retrying the LZA pipeline.
- **Failed Security_Resources Stacks:** If stacks fail during initial deployment:
  1. Disable termination protection on failed stacks
  2. Manually delete the orphaned CloudFormation stacks in the new region
  3. Retry the Deploy stage in the LZA pipeline
- **Mixed Governance State:** Ensure all accounts show as "Enrolled" (not "Update Available") in Control Tower before proceeding

**Important Notes for Control Tower Deployments:**
- Simply adding a region to `global-config.yaml` is not sufficient - manual Control Tower account updates are required
- The process may take significant time for environments with many accounts
- Always update Control Tower accounts before retrying failed LZA pipeline actions
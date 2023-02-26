# Canadian Centre for Cyber Security (CCCS) Cloud Medium

## Configuration Files and Installation Instructions

AWS developed the sample config files herein for use with the Landing Zone Accelerator on AWS (LZA) solution. Using these sample config files with LZA will automate the deployment of [CCCS Medium](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/cloud-services/government-canada-security-control-profile-cloud-based-it-services.html) (formerly PBMM) security controls.

LZA will deploy an opinionated architecture that has been designed in consultation with CCCS and Government of Canada’s Treasury Board Secretariat. Inheriting the controls from the [CCCS assessment of AWS](https://aws.amazon.com/compliance/services-in-scope/CCCS/) and deploying additional controls using LZA with the sample config files allow customers to meet up to 70% of the controls that have a technical element. This reduces security control implementation time, allowing customers to focus on operational capabilities and the evidentiary exercise in a [Security Assessment and Authorization](https://www.cyber.gc.ca/en/guidance/guidance-cloud-security-assessment-and-authorization-itsp50105) (SA&A) process like that used by the Government of Canada.

The sample config files define a log retention period of 2 years based on [guidance](https://www.canada.ca/en/government/system/digital-government/online-security-privacy/event-logging-guidance.html) provided by the Treasury Board Secretariat.  Customers are encouraged to consider defining longer retention periods, such as 10 years, so that you'll have the data you need to investigate and reconstruct events long after they occur.

Customers are encouraged to work with their local AWS Account Teams to learn more about customizing this configuration, to learn more about the CCCS-Medium reference architecture, and the Landing Zone Accelerator on AWS solution.

**NOTE: The initial release of the CCCS-Medium LZA sample configuration files included as part of LZA v1.3 do not yet fully automate the delivery of this architecture. This will be resolved in subsequent LZA releases.**

## Deployment Considerations

### Mandatory accounts

The Landing Zone Accelerator on AWS builds on top of an existing AWS Control Tower or AWS Organizations multi-account structure. This configuration is built for an AWS Organizations based deployment. The following mandatory accounts must be created manually in AWS Organizations with the default **OrganizationAccountAccessRole** cross-account role before beginning:

**Management account** – This account is designated when first creating an AWS Organization. It is a privileged account where all AWS Organizations global configuration management and billing consolidation occurs.

**LogArchive account** – This account is used for centralized logging of AWS service logs.

**SecurityTooling account** – This account is used to centralize all security operations and management activities. This account is typically used as a delegated administrator of centralized security services such as Amazon Macie, Amazon GuardDuty, and AWS Security Hub. NOTE: The LZA configuration files refer to this as the Audit account, but it serves the function of the Security Tooling account.

### Administrative role

Landing Zone Accelerator on AWS utilizes an IAM role with administrative privileges to manage the orchestration of resources across the environment. This configuration, by default, leverages the default cross-account role that is utilized by AWS Organizations (**OrganizationAccountAccessRole**).

## Customizing the solution

The Landing Zone Accelerator on AWS deploys an AWS CodeCommit repository along with six customizable YAML configuration files. The YAML files are pre-populated with a minimal configuration for the solution. The configuration files found in this directory should replace the files in the default AWS CodeCommit repository after adjusting environment specific configurations.

- accounts-config.yaml - Replace all the AWS Account Email addresses with valid emails for the deployment. These are used to create AWS Accounts.
- global-config.yaml - Replace all emails used for AWS Budget notifications.
- security-config.yaml - Replace all emails used for the SNS notifications.
- This sample configuration is built using the **ca-central-1** AWS region as the home or installation region. If installing to a different home region, the five references to **ca-central-1** must be updated to reference your desired home region in the following four configuration files (global-config, iam-config, network-config, security-config).

## Prerequisites

1. [Enable AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html) in _all features_ mode
2. Ensure the three mandatory accounts, as described above, are configured using AWS Organizations. See [Creating an AWS account in your organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html).
3. Create the **Infrastructure** Organization Unit. The default configuration for Landing Zone Accelerator on AWS assumes that an OU named **Infrastructure** has been created. This OU is intended to be used for core infrastructure workload accounts that you can add to your organization, such as central networking or operations accounts.

## Deployment overview

Use the following steps to deploy this solution on AWS. For detailed instructions, follow the links for each step.

[Step 1. Launch the stack](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)

- Launch the LZA AWS CloudFormation template into your AWS account. (Ensure the region is set to your desired home region, as it typically defaults to US East (N. Virginia);
- Ensure that the Environment Configuration for Control Tower Environment is set to **No** (AWS Organizations deployment);

- Review the template’s parameters and enter or adjust the default values as needed.

[Step 2. Await initial environment deployment](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)

- Await successful completion of `AWSAccelerator-Pipeline` pipeline.

Step 3. Copy the configuration files

- Clone the `aws-accelerator-config` AWS CodeCommit repository.
- Clone the `landing-zone-accelerator-on-aws` repo
- Copy the contents from the `aws-best-practice-cccs-medium` folder under reference/sample-configurations to your local `aws-accelerator-config` repo. You may be prompted to over-write duplicate configs, such as accounts-config.yaml.

Step 4. Update the configuration files and release a change.

- Using the IDE of your choice, in your local `aws-accelerator-config` repo, update the variables at the top of each config, such as `homeRegion`, to match where you deployed the solution to.
- Update the configuration files to match the desired state of your environment. Look for the UPDATE comments for areas requiring updates, such as e-mail addresses in your accounts-config.yaml
- Review the contents in the Security Controls section below to understand if any changes need to be made to meet organizational requirements, such as applying SCPs to the various OUs.
- Commit and push all your change to the `aws-accelerator-config` AWS CodeCommit repository.
- Release a change manually to the `AWSAccelerator-Pipeline` pipeline.
- After the **Accounts** stage completes, the **Network** account will be created. VPC service quotas need to be increased in the Network account before the Networking phase begins or the Pipeline will fail. This is approximately 20 minutes after the **Accounts** stage completes. (If it does, executing a **Retry** is the next action).
- Two service limits need to be increased in the **Network** AWS Account. Follow these steps:
  - Assume the **OrganizationAccountAccessRole** role into the **Network** account. (The AWS Account ID can be determined in AWS Organizations)
  - Navigate to **Service Quotas → AWS Services**
  - Search for **VPC** and select when found
  - Click on Interface **VPC endpoints per VPC** (Quota Code: L-29B6F2EB) and request a quota increase to 90
  - Click on **VPCs per Region** (Quota Code: L-F678F1CE) and request a quota increase to 8
  - (It takes approximately 15-30 minutes for the requested quota increase to apply)
- (optional) Retry the failed Pipeline Stage if the quota increase was not completed in time.
- Await successful completion of `AWSAccelerator-Pipeline` pipeline.

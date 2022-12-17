AWS developed the sample config files herein for use with the Landing Zone Accelerator on AWS (LZA) solution.  Using these sample config files with LZA will automate the deployment of [CCCS Medium](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/cloud-services/government-canada-security-control-profile-cloud-based-it-services.html) (formerly PBMM) security controls.  LZA will deploy an opinionated architecture that has been designed in consultation with CCCS and Government of Canada’s Treasury Board Secretariat.  Inheriting the controls from the [CCCS assessment of AWS](https://aws.amazon.com/compliance/services-in-scope/CCCS/) and deploying additional controls using LZA with the sample config files allow customers to meet up to 70% of the controls that have a technical element.  This reduces security control implementation time, allowing customers to focus on the evidentiary exercise in a [Security Assessment and Authorization](https://www.cyber.gc.ca/en/guidance/guidance-cloud-security-assessment-and-authorization-itsp50105) (SA&A) process like that used by the Government of Canada.  Work with your AWS Account Team to understand what additional configuration may be needed. Future iterations will continue to add functionality to close gaps in automation.


## Deployment Considerations

### Mandatory accounts

The Landing Zone Accelerator on AWS builds on top of an existing AWS Control Tower or AWS Organizations multi-account structure. This configuration is for AWS Organizations in the ca-central-1 AWS Region. The following mandatory accounts must be created manually, and created with the default **OrganizationAccountAccessRole** cross-account role:

**Management account** – This account is designated when first creating an AWS Organization. It is a privileged account where all AWS Organizations global configuration management and billing consolidation occurs.

**LogArchive account** – This account is used for centralized logging of AWS service logs and AWS CloudTrail trails.

**Audit account** – This account is used to centralize all security operations and management activities. This account is typically used as a delegated administrator of centralized security services such as Amazon Macie, Amazon GuardDuty, and AWS Security Hub.


### Administrative role

Landing Zone Accelerator on AWS utilizes an IAM role with administrative privileges to manage the orchestration of resources across the environment. This configuration, by default, leverages the default cross-account role that is utilized by AWS Organizations (**OrganizationAccountAccessRole**)**.** 


## Customizing the solution

The Landing Zone Accelerator on AWS deploys an AWS CodeCommit repository along with six customizable YAML configuration files. The YAML files are pre-populated with a minimal configuration for the solution. The configuration files found in this directory should replace the files in the default AWS CodeCommit repository after adjusting environment specific configurations.

* accounts-config.yaml - Replace all the AWS Account Email addresses with valid emails for the deployment. These are used to create AWS Accounts.
* global-config.yaml - Replace all emails used for AWS Budget notifications.
* security-config.yaml - Replace all emails used for the SNS notifications.



## Prerequisites

1. [Enable AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html)
2. Ensure the three Mandatory Accounts, as described above, are configured using AWS Organziations. See [Creating an AWS account in your organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html).
3. Create the **Infrastructure** Organization Unit. The default configuration for Landing Zone Accelerator on AWS assumes that an OU named **Infrastructure** has been created. This OU is intended to be used for core infrastructure workload accounts that you can add to your organization, such as central networking or shared services.



## Deployment overview

Use the following steps to deploy this solution on AWS. For detailed instructions, follow the links for each step.

[Step 1. Launch the stack](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)

* Launch the AWS CloudFormation template into your AWS account. (Ensure the region is switched back to Canada. It will default to US East (N. Virginia).
* Ensure that the Environment Configuration for Control Tower Environment is **No** (AWS Organizations deployment)

* Review the template’s parameters and enter or adjust the default values as needed.

[Step 2. Await initial environment deployment](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)

* Await successful completion of `AWSAccelerator-Pipeline` pipeline.

Step 3. Update the configuration files

* Navigate to the `aws-accelerator-config` AWS CodeCommit repository.

* Update the configuration files to match the desired state of your environment. Look for the #UPDATE EMAIL ADDRESS comments in all files for areas requiring updates.
* Release a change manually to the AWSAccelerator-Pipeline pipeline. 
* After the **Accounts** stage completes, the **Network** account will be created. VPC Service Limit increases need to be created in the Networking account before the Networking phase begins or the Pipeline will fail. This is approximately 20 minutes after the **Accounts** stage completes. (If it does, executing a **Retry** is the next action).

* Two service limits need to be increased in the **Network** AWS Account. Follow these steps:
    * Assume the **OrganizationAccountAccessRole** Role into the **Network** account. (The AWS Account ID can be determined in AWS Organizations)
    * Navigate to **Service Quotas → AWS Services**
    * Search for **VPC** and select when found
    * Click on **Interface VPC endpoints per VPC** (Quota Code: L-29B6F2EB) and request a Limit increase to 90
    * Click on **VPCs per Region** (Quota Code: L-F678F1CE) and request a Limit increase to 8
    * (The request limit to complete is approximately 15-30 minutes)
* (optional) Retry the failed Pipeline Stage if the limit increase was not completed in time.
* Await successful completion of `AWSAccelerator-Pipeline` pipeline.





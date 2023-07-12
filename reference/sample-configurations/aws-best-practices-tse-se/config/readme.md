# Trusted Secure Enclaves Sensitive Edition (TSE-SE)

## Overview

National security, defence, and national law enforcement organizations around the world need the scale, global footprint, agility, and services that cloud brings to their critical missions—all while they are required to meet stringent security and compliance requirements for their data. Increasingly, these organizations leverage the AWS global hyper-scale cloud to deliver their missions while keeping their sensitive data and workloads secure. To help you accelerate these sensitive missions in cloud, we developed Trusted Secure Enclaves for National Security, Defence and National Law Enforcement.

The _Trusted Secure Enclaves Sensitive Edition (TSE-SE) Reference Architecture_ is a comprehensive, multi-account AWS cloud architecture targeting sensitive level workloads. This architecture was designed in collaboration with our national security; defence; national law enforcement; and federal, provincial, and municipal government customers to accelerate compliance with their strict and unique security and compliance requirements. The _TSE-SE Reference Architecture_ was designed to help customers address central identity and access management, governance, data security, comprehensive logging, and network design/segmentation in alignment with security frameworks such as NIST 800-53, ITSG-33, FEDRAMP Moderate, CCCS-Medium, IRAP, and other sensitive or medium level security profiles.

Please refer to the TSE-SE [Reference Architecture document](../architecture-doc/readme.md) for the full detailed design.

## Configuration Files and Installation Instructions

AWS developed the sample configuration files herein for use with the Landing Zone Accelerator on AWS (LZA) solution. Using these sample config files with LZA will automate the deployment of the prescriptive and opinionated _Trusted Secure Enclaves Sensitive Edition_ reference architecture.

Deploying the TSE-SE with the LZA automation engine reduces customers foundational build effort by months over manual approaches. It allows customers to rapidly establish a baseline set of technical security controls in alignment with sensitive security frameworks. The TSE-SE is deployed by customers on the customer side of the responsibility model and builds on the [security of the AWS cloud](https://aws.amazon.com/compliance/services-in-scope/).

The sample config files define a log retention period of 2 years based on consultation with regional policy and cybersecurity authorities.  Customers are encouraged to consider defining longer retention periods, such as 10 years, so that you'll have the data you need to investigate and reconstruct events long after they occur.

Customers are encouraged to work with their local AWS Account Teams to learn more about customizing this configuration, to learn more about the TSE-SE reference architecture, the Landing Zone Accelerator on AWS solution, or global national security and defense solutions.

**NOTE: The initial release of the TSE-SE LZA sample configuration files included as part of LZA v1.3 do not yet fully automate the delivery of this architecture. This will be resolved in subsequent LZA releases.**

## Deployment Considerations

The Landing Zone Accelerator on AWS builds on top of an existing AWS Control Tower or AWS Organizations multi-account structure. The following mandatory accounts need to be created before launching the Landing Zone Accelerator stack.

**Management account** – This account is designated when first creating an AWS Organization. It is a privileged account where all AWS Organizations global configuration management and billing consolidation occurs.

**LogArchive account** – This account is used for centralized logging of AWS service logs.

**SecurityTooling account** – This account is used to centralize all security operations and management activities. This account is typically used as a delegated administrator of centralized security services such as Amazon Macie, Amazon GuardDuty, and AWS Security Hub. NOTE: The LZA configuration files refer to this as the Audit account, but it serves the function of the Security Tooling account.

### AWS Organizations (without Control Tower)
The three mandatory accounts must be created manually in AWS Organizations with the default **OrganizationAccountAccessRole** cross-account role before beginning.

### AWS Control Tower
You should first configure AWS Control Tower in your home region using the documentation from [Getting started with AWS Control Tower](https://docs.aws.amazon.com/controltower/latest/userguide/getting-started-with-control-tower.html)
- When deploying Control Tower, leave the Region deny setting set to Not enabled - the Accelerator needs a customized region deny policy.

After Control Tower deployment you should have a **Security** and **Sandbox** OU as well as the three mandatory accounts.

### Administrative role

Landing Zone Accelerator on AWS utilizes an IAM role with administrative privileges to manage the orchestration of resources across the environment. This configuration, by default, leverages the default cross-account role that is utilized by AWS Organizations (**OrganizationAccountAccessRole**) or AWS Control Tower (**AWSControlTowerExecution**).

## Customizing the solution

The Landing Zone Accelerator on AWS deploys an AWS CodeCommit repository along with six customizable YAML configuration files. The YAML files are pre-populated with a minimal configuration for the solution. The configuration files found in this directory should replace the files in the default AWS CodeCommit repository after adjusting environment specific configurations.

- accounts-config.yaml - Replace all the AWS Account Email addresses with valid emails for the deployment. These are used to create AWS Accounts.
- global-config.yaml - Replace all emails used for AWS Budget notifications.
- security-config.yaml - Replace all emails used for the SNS notifications.
- This sample configuration is built using the **ca-central-1** AWS region as the home or installation region. If installing to a different home region, the five references to **ca-central-1** must be updated to reference your desired home region in the following four configuration files (global-config, iam-config, network-config, security-config).

### Prerequisites - AWS Organizations (without Control Tower)

1. [Enable AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html) in _all features_ mode
2. Ensure the three mandatory accounts, as described above, are configured using AWS Organizations. See [Creating an AWS account in your organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html).
3. Create the **Infrastructure** Organization Unit. The default configuration for Landing Zone Accelerator on AWS assumes that an OU named **Infrastructure** has been created. This OU is intended to be used for core infrastructure workload accounts that you can add to your organization, such as central networking or operations accounts.
4. If you are using the github source for the LZA code, you will need to follow the prerequisite step to [store a github token in secrets manager](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#create-a-github-personal-access-token-and-store-in-secrets-manager)

In file `global-config.yaml`:
- Make sure `managementAccountAccessRole` is set to **OrganizationAccountAccessRole**
- Make sure `controlTower` is set to `enable: false`

### Prerequisites - AWS Control Tower

1. Create the **Infrastructure** Organizational Unit from the **Control Tower** console. The default configuration for Landing Zone Accelerator on AWS assumes that an OU named **Infrastructure** has been created. This OU is intended to be used for core infrastructure workload accounts that you can add to your organization, such as central networking or operations accounts.
2. Using Control Tower, create the additional Organizational Units that are referenced from your configuration file. The default configuration for Landing Zone Accelerator on AWS assumes that the following OUs are created and registered in AWS Control Tower: **Central**, **Dev**, **Test**, **Prod**, **UnClass** and **Sandbox**.
3. Go to Control Tower Account Factory and edit the Network configuration
    - Set the Maximum number of private subnets to 0
    - Uncheck all regions for VPC creations (VPC creation will be handled by the accelerator)


## Deployment overview

Use the following steps to deploy this solution on AWS. For detailed instructions, follow the links for each step.

[Step 1. Launch the stack](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)

- Launch the LZA AWS CloudFormation template into your AWS account. (Ensure the region is set to your desired home region, as it typically defaults to US East (N. Virginia);
- If deploying without Control Tower, ensure that the Environment Configuration for Control Tower Environment is set to **No**, otherwise set it to **Yes**

- Review the template’s parameters and enter or adjust the default values as needed.

[Step 2. Await initial environment deployment](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)

- Await successful completion of `AWSAccelerator-Pipeline` pipeline.

[Step 3. Copy the configuration files](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-3.-update-the-configuration-files.html)
- Clone the `aws-accelerator-config` AWS CodeCommit repository.
- Clone the `landing-zone-accelerator-on-aws` repo
- Copy the contents from the `aws-best-practice-cccs-medium` folder under reference/sample-configurations to your local `aws-accelerator-config` repo. You may be prompted to over-write duplicate configs, such as accounts-config.yaml.

Step 4. Update the configuration files and release a change.

- Using the IDE of your choice, in your local `aws-accelerator-config` repo, update the variables at the top of each config, such as `homeRegion`, to match where you deployed the solution to.
- Update the configuration files to match the desired state of your environment. Look for the UPDATE comments for areas requiring updates, such as e-mail addresses in your accounts-config.yaml
- Review the contents in the Security Controls section below to understand if any changes need to be made to meet organizational requirements, such as applying SCPs to the various OUs.
- If using Control Tower, review these specific settings:

    In file `global-config.yaml`:
    - Update `managementAccountAccessRole` value to **AWSControlTowerExecution**
    - Make sure `controlTower` is set to `enable: true`

    In file `organization-config.yaml`:
    - Uncomment the proper configuration block under the `AWSAccelerator-Guardrails-Sensitive-Part-1` configuration to have the following configuration

      ```
        - name: AWSAccelerator-Guardrails-Sensitive-Part-1
          description: >
            LZA Guardrails Sensitive Environment Specific Part 1
          policy: service-control-policies/LZA-Guardrails-Sensitive.json
          type: customerManaged
          deploymentTargets:
            organizationalUnits: 
            - Infrastructure
            - Central
            - Dev
            - Test
            - Prod
            accounts:
            - Audit
            - LogArchive
      ```


- Commit and push all your change to the `aws-accelerator-config` AWS CodeCommit repository.
- Release a change manually to the `AWSAccelerator-Pipeline` pipeline.
- After the **Accounts** stage completes, the **Network** account will be created. VPC service quotas need to be increased in the Network account before the Networking phase begins or the Pipeline will fail. This is approximately 20 minutes after the **Accounts** stage completes. (If it does, executing a **Retry** is the next action).
- Two service limits need to be increased in the **Network** AWS Account. Follow these steps:
  - Assume the **OrganizationAccountAccessRole** or **AWSControlTowerExecution** role into the **Network** account. (The AWS Account ID can be determined in AWS Organizations)
  - Navigate to **Service Quotas → AWS Services**
  - Search for **VPC** and select when found
  - Click on Interface **VPC endpoints per VPC** (Quota Code: L-29B6F2EB) and request a quota increase to 90
  - Click on **VPCs per Region** (Quota Code: L-F678F1CE) and request a quota increase to 8
  - (It takes approximately 15-30 minutes for the requested quota increase to apply)
- (optional) Retry the failed Pipeline Stage if the quota increase was not completed in time.
- Await successful completion of `AWSAccelerator-Pipeline` pipeline.

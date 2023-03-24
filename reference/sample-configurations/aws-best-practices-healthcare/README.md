# Landing Zone Accelerator on AWS for Healthcare 

## Overview

The Landing Zone Accelerator (LZA) for Healthcare is an industry specific deployment of the [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) solution architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. Built on top of the standard AWS Control Tower accounts, namely `Management`, `Audit`, and `LogArchive`, the LZA for Healthcare deploys additional resources that helps establish platform readiness with security, compliance, and operational capabilities.  

The Healthcare industry best practices folder contains the deviation from the default [aws-best-practices](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/aws-best-practices) and the differences are noted in this readme.  To leverage these configs it is first expected that you use all of the `aws-best-practices` before adding or replacing the configuration files referenced in this folder.  The primary deviations from the `aws-best-practices` and the healthcare industry are related to the Organization/Account structure and the Network topology.  It is important to note that the Landing Zone Accelerator solution will not, by itself, make you compliant. It provides the foundational infrastructure from which additional complementary solutions can be integrated. You must review, evaluate, assess, and approve the solution in compliance with your organization’s particular security features, tools, and configurations.

## Deployment Overview

Use the following steps to deploy the industry guidance. For detailed instructions, follow the links for each step.

[Step 1. Launch the stack](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)

* Launch the AWS CloudFormation template into your AWS account.
* Review the templates parameters and enter or adjust the default values as needed.

[Step 2. Await initial environment deployment](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)

* Await successful completion of `AWSAccelerator-Pipeline` pipeline.

Step 3. Copy the configuration files

* Clone the `aws-accelerator-config` AWS CodeCommit repository.
* Clone the [landing-zone-accelerator-on-aws](https://github.com/awslabs/landing-zone-accelerator-on-aws) repo
* Copy the configs and all the contents from the `aws-best-practices` folder under `reference/sample-configurations` to your local `aws-accelerator-config` repo.
* Copy the contents from the `aws-best-practices-healthcare` folder under `reference/sample-configurations` to your local `aws-accelerator-config` repo.  You may be prompted to over-write duplicate configs, such as `accounts-config.yaml`.

Step 4. Update the configuration files and release a change.

* Using the IDE of your choice.  Update the `homeRegion` variable at the top of each config to match the region you deployed the solution to.
* Update the configuration files to match the desired state of your environment. Look for the `UPDATE` comments for areas requiring updates, such as e-mail addresses in your `accounts-config.yaml`
* Review the contents in the `Security Controls` section below to understand if any changes need to be made to meet organizational requirements, such as applying SCPs to the various OUs.
* Commit and push all your change to the `aws-accelerator-config` AWS CodeCommit repository.
* Release a change manually to the AWSAccelerator-Pipeline pipeline.


## Security Frameworks
The healthcare industry is high regulated.  The LZA for Healthcare provides additional guardrails to help mitigate against the threats faced by healthcare customers.  The LZA for Healthcare is not meant to be feature complete for fully compliant, but rather is intended to help accelerate cloud migrations and cloud refactoring efforts by organizations serving the healthcare industry.  While much effort has been made to reduce the effort required to manually build a production-ready infrastructure, you will still need to tailor it to your unique business needs.

This solution includes controls from frameworks in various geographies, including HIPAA, NCSC, ENS High, C5, and Fascicolo Sanitario Elettronico.  If you are deploying the Landing Zone Accelerator on AWS for Healthcare solution, please consult with your AWS team to understand controls to meet your requirements.

## Security Controls 
These controls are created as detective or preventative guardrails in the AWS environment through AWS Config rules or through Service Control Policies (SCPs).  Within the file `organization-config.yaml` are sections for declaring SCPs, Tagging Policies, and Backup Policies.  SCPs can be highly specific to the organization and its workload(s) and should be reviewed and modified to meet your specific requirements.  Sample policies have been provided for the following:  
* `Service Control Policies`:  A service control policy has been provided in `service-control-policies/scp-hlc-base-root.json` that prevents accounts from leaving your organization or disabling block public access.  The `service-control-policies/scp-hlc-hipaa-service.json` policy is an example of a policy that can be used to ensure only HIPAA eligible services can be used in a specific OU or account.  It is important to note that SCPs are not automatically updated and that changes to the HIPAA eligible service list will be to be updated.  However, this is an example of how your organization can ensure that a select list of AWS services are used for specific use cases.
* `Tagging Policies`: A sample tagging policy has been provided in `tagging-policies/healthcare-org-tag-policy.json` showing how you can further extend these policies to define `Environment Type` for `Prod`, `QA`, and `Dev` workloads, `Data Classification` to track sensitive and non-sentive workloads such as `PHI` and `Company Confidental` and how to enforce them to specific AWS services. The sample policy should be edited to reflect your own organization's cost centers so that resources provisioned by the LZA are automatically tagged in accordance with your business requirements.
* `Backup policies`: A sample backup policy has been provided in `backup-policies/backup-plan.json` as an example for how backups can scheduled along with lifecycle and retention management settings.

In the `security-config.yaml` file, AWS security services can be configured such as AWS Config, AWS Security Hub, and enabling storage encryption. Additional alarms and metrics have been provided to inform you of actions within your AWS Cloud environment.  For a list of all of the services and settings that can be configured, see the [LZA on AWS Implementation Guide](#references) in the references section below.  This file also contains the AWS Config rules that make up the list of detective guardrails used to meet many of the controls from the various frameworks.  These rules are implemented through a combination from Security Hub AWS Foundational Security Best Practices, CIS AWS Foundations Benchmark, and the rules from the [Operational Best Practices for HIPAA Security sample conformance pack](https://docs.aws.amazon.com/config/latest/developerguide/operational-best-practices-for-hipaa_security.html). The default best-practices has the Security Hub PCI rules enabled, however it is encouraged to not enable the PCI rules if they are not needed in your environment to reduce cost.

Amazon Macie is enabled by default in the LZA aws-best-practices.  This can be leveraged to identify various types of [PHI](https://docs.aws.amazon.com/macie/latest/user/managed-data-identifiers.html#managed-data-identifiers-phi). 

The `global-config.yaml` file contains the settings that enable regions, centralized logging using AWS CloudTrail and Amazon CloudWatch Logs and the retention period for those logs to help you meet your specific auditing and monitoring needs.  You can also define cost and usage reporting with budgets in the this file and examples are provided.

You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.  For example you may remove the reports section if you do no need any cost and usage reporting for budgets in your organization.

## Organizational Structure

Healthcare LZA accounts are generated and organized as follows:
<!--
```sh
+-- Root
|   +-- Management
|   +-- Security
|       +-- LogArchive
|       +-- Audit
|   +-- Infrastructure
|       +-- Infra-Prod
|       +-- Infra-Dev
|   +-- HIS
|       +-- HIS-Non-Prod
|       +-- HIS-Prod
|   +-- EIS
```
-->
![Healthcare LZA Org Structure](./images/LZA_EGA_Healthcare_Org_Structure.png)

The Health Information System (HIS) Organizational Unit (OU) represents the logical construct where workloads that contain sentitive data, such as critical business or Personal Health Information (PHI) reside. Whereas, the Executive Information System (EIS) OU is intended for business workloads that may not require the same regulatory controls.  This OU structure is provided for you.  However, you are free to change the organizational structure, Organizational Units (OUs), and accounts to meet your specific needs.  For additional information about how to best organize your AWS OU and account structure, please reference the Recommended OUs and accounts in the [For further consideration](#for-further-consideration) section below as you begin to experiment with the LZA for Healthcare.

## Architecture Diagrams
AWS LZA for Healthcare Organizational Structure
![Healthcare LZA Architecture](./images/LZAforHealthcare_2022-08-30.png)

By default, the LZA for Healthcare builds the above organizational structure, with the exception of the `Management` and `Security` OU, which are predefined by you prior to launching the LZA.  The below architecture diagram highlights the key deployments:

* A `HIS` OU
  * Contains one `HIS-Prod` and one `HIS-Non-Prod` Account
  * Each contains a single VPC in `us-east-1`
  * Each VPC uses a /16 CIDR block in the 10.0.0.0/8 RFC-1918 range
* An `Infrastructure` OU
  * Contains one `Network` and one `SharedServices` Account under `Infra-Prod`
  * The `Network` account also contains a Transit Gateway for infrastructure routing
  * Each contains a single VPC in `us-east-1`
  * Each VPC uses a /22 CIDR block in the 10.0.0.0/8 RFC-1918 range

AWS LZA for Healthcare Network Diagram  
![Healthcare LZA Network Diagram](./images/LZA_EGA_Healthcare_Network_Diagram_v2.1.png)


The accounts in the `HIS` OU represent a standard infrastructure for development or production deployment of your workloads.  The `Infrastructure` OU provides the following specialized functions:

* The `Network` account contains an `Network Inspection VPC` for inspecting AWS traffic as well as routing traffic to and from the Internet.  If a route table is defined, for example `Network-Main-Core`, traffic will flow from the `HIS-pms-Prod-Main VPC` through the `Network-Main-TGW` Transit Gateway, where it will can be inspected by AWS Firewall before being blackholed or continuing to the internet or its final destination.
* The `SharedServices` VPC is intended to house centrally-shared services that are accessible to all of the accounts in your infrastructure.  For example, you might deploy central security services such as Endpoint Detection and Response (EDR) or a central directory service such as LDAP.  This central location and corresponding route tables allow you to efficiently design your network and compartmentalize access control accordingly.
## Cost
You are responsible for the cost of the AWS services used while running this solution. As of September 2022, the cost for running this solution using the Landing Zone Accelerator with the healthcare configuration files and AWS Control Tower in the US East (N. Virginia) Region within a test environment with no active workloads is between $1000-$1,1250 USD per month.  As additional AWS services and workloads are deployed, the cost will increase.  It is also noteworthy VPC inspection is approximately 60% of the cost of this configuration.  While this is a significant percentage, the ability to inspect and control network traffic in  enviroment is an important capability for improving your overall security posture.

| AWS Service      | Cost per month |
| ---------------- | ----------- |
| AWS CloudTrail  | $4.30 |
| Amazon CloudWatch | $8.75 |
| Amazon Config | $35.55 |
| Amazon GuardDuty | $5.75 |
| Amazon AWS Key Management Services (AWS KMS) | $15.65 |
| Amazon Amazon Route 53 | $2.00 |
| Amazon Simple Storage Service (Amazon S3) | $1.48 |
| Amazon Virtual Private Cloud (Amazon VPC) | $301.56 |
| AWS Network Firewall | $648.52 |
| Amazon AWS Security Hub | $44.32 |
| Amazon Secrets Manager | $0.48 |
| Amazon Simple Notification Services (Amazon SNS) | $0.42 |
| Total monthly cost | $1,068.78 |


## For further consideration

Although the Healthcare LZA aims to be prescriptive in applying best practices for Healthcare customers, it intentionally avoids being *overly prescriptive* out of deference to the unique realities for each individual organization.  Consider the baseline Healthcare LZA as a good starting point, but bear in mind your objectives as you begin to tailor it for your specific business requirements.  From this perspective AWS provides resources that you should consult as you begin customizing your deployment of the Healthcare LZA:

1. This set of configuration files was tested with AWS Control Tower version 3.0.  AWS Control Tower version 3.0 supports the use of an AWS CloudTrail Organization Trail.  The global-config.yaml file shows organizationTail set to false because it is enabled through the AWS Control Tower setup.
1. Refer to the [Best Practices] for Organizational Units with AWS Organizations blog post for an overview.
1. [Recommended OUs and accounts].  This section of the `Organizing your AWS Environment Using Multiple Accounts` Whitepaper discusses the deployment of specific-purpose OUs in addition to the foundational ones established by the LZA.  For example, you may wish to establish a `Sandbox` OU for experimentation, a `Policy Staging` OU to safely test policy changes before deploying them more broadly, or a `Suspended` OU to hold, constrain, and eventually retire accounts that you no longer need.
1. [AWS Security Reference Architecture] (SRA). The SRA "is a holistic set of guidelines for deploying the full complement of AWS security services in a multi-account environment."  This document is aimed at helping you to explore the "big picture" of AWS security and security-related services in order to determine the architectures most suited to your organization's unique security requirements.
1. Transite Gateway Flow logs are not enabled by default, work AWS team to determine if enabling TGW Flow logs help you meet your regulatory and organizational requirements.  
1. 

## References

* LZA on AWS [Implementation Guide].  This is the official documenation of the Landing Zone Accelerator Project and serves as your starting point.  Use the instructions in the implementation guide to stand up your environment and then return to this project for Healthcare-specific customization.
* AWS Labs [LZA Accelerator] GitHub Repository.  The official codebase of the Landing Zone Accelerator Project.
* Introduding the AWS [LZA for Healthcare] blog 
* Get started with the [LZA Immersion Day] and follow the LZA Best Practices Day section for guidance on using the healthcare specific configuration files.
<!-- Hyperlinks -->
[Best Practices]: https://aws.amazon.com/blogs/mt/best-practices-for-organizational-units-with-aws-organizations/
[Recommended OUs and accounts]: https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/recommended-ous-and-accounts.html
[AWS Security Reference Architecture]: https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html
[Implementation Guide]: https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/landing-zone-accelerator-on-aws.pdf
[LZA Accelerator]: https://github.com/awslabs/landing-zone-accelerator-on-aws
[Operational Best Practices for HIPAA Security]: https://docs.aws.amazon.com/config/latest/developerguide/operational-best-practices-for-hipaa_security.html
[VPC Sharing: key considerations and best practices]: https://aws.amazon.com/blogs/networking-and-content-delivery/vpc-sharing-key-considerations-and-best-practices/
[LZA for Healthcare]: https://aws.amazon.com/blogs/industries/introducing-landing-zone-accelerator-for-healthcare/
[LZA Immersion Day]: https://catalog.workshops.aws/landing-zone-accelerator

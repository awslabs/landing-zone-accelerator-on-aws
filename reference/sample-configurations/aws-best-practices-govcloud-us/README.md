# Landing Zone Accelerator on AWS for United States (US) Federal and Department of Defense (DoD)

## Overview

This config is an industry specific deployment of the [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) solution. This solution helps automate the setup of a cloud environment and establishes platform readiness with security, compliance, and operational capabilities in AWS GovCloud (US).

The solution is architected to follow the Federal Risk and Authorization Management Program (FedRAMP), National Institute of Standards and Technology (NIST) 800-53(5), NIST 800-171 Rev.2, and Cybersecurity Maturity Model Certification (CMMC) Level 2 compliance framework control requirements. Through the use of LZA, preventative and detective guardrails are applied to vended accounts that helps customers to align their cloud-based workloads with their compliance requirements.

The LZA is not meant to be feature complete for full compliance, but rather is intended to help accelerate new cloud deployments, cloud migrations, and cloud refactoring efforts. The LZA reduces the effort required to manually build a production-ready infrastructure. It is important to note that the LZA solution will not, by itself, make you compliant. It provides the foundational infrastructure from which additional complementary solutions can be integrated, but you will still need to tailor it to your unique business needs.


## Security Controls

The LZA aims to be prescriptive in applying best practices for space customers, it intentionally avoids being overly prescriptive out of deference to the unique realities for each individual organization. Consider the baseline as a foundational starting point.

The config deploys security controls that provide detective or preventative guardrails in the AWS environment.  Collectively, the applied security controls help to accelerate your path to compliance. Configuration of the LZA is done through multiple configuration files.  Through the LZA, security controls are applied to accounts to drive conformance with compliance framework requirements.

All of the LZA configuration files align with LZA best practices sample configuration.  The following is an overview of the LZA configuration files.  You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.

### global-config.yaml

The global-config.yaml file contains the settings that enable centralized logging using AWS CloudTrail and Amazon CloudWatch Logs.  The configuration establishes the retention period for those logs to help you meet your specific auditing and monitoring needs.

You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.

### organization-config.yaml

Within the organization-config.yaml file there are sections for declaring Service Control Policies (SCPs). SCPs are a type of organization policy that you can use to manage permissions in your organization. SCPs offer central control over the maximum available permissions for all accounts in your organization.

SCPs can be highly specific to an organization and its workloads.  The SCPs should be reviewed and modified to meet your specific requirements. The following sample policies have been provided within the configuration.

-   guardrails-1.json: This SCP restricts permissions to manipulate or delete AWS Config rules and Lambda functions.  It also prevents disabling of Amazon EBS encryption.

-   guardrails-2.json: This SCP restricts the ability to delete or manipulate the password policy, manipulate AWS IAM roles, or make changes to security services such as Amazon GuardDuty and AWS Security Hub.

-   Quarantine: This SCP is used to prevent changes to new accounts until the LZA has been executed successfully and control applied.

It is important to note that SCPs are not automatically updated and that changes to the eligible service list may require the SCP to be updated. However, these sample SCPs are an example of how your organization can ensure that a select list of AWS services are used for specific use cases.

### security-config.yaml

The config is designed to deploy a number of preventative and detective measures that align with the Federal Risk and Authorization Management Program (FedRAMP), National Institute of Standards and Technology (NIST) 800-53(5), NIST 800-171 Rev.2, and Cybersecurity Maturity Model Certification (CMMC) Level 2 compliance framework control requirements.  The security-config.yaml establishes the use of multiple security services and configurations such as AWS Config, Amazon GuardDuty, and AWS Security Hub.

It establishes minimum AWS Identity and Access Management password requirements that are aligned with AWS best practices to set a password length of 14.  This exceeds NIST’s 800-63B latest password guidance that establishes a minimum password length of 8.  If you need to comply with this please change the IAM Password Policy appropriately as noted in the security-config.yaml file.  Consider reviewing the configuration details to determine conformance with your organization’s compliance requirements if they extend beyond the control frameworks’ prescribed guidance

The LZA provides the capability to easily enable additional security services. Detective guardrails are established through the use of Security Hub and Config, which deploy managed Config rules.  These rules evaluate whether the configuration settings of your AWS resources comply with common best practices. By default the config rules are aligned to be deployed to both GovCloud East/West. The LZA enables the security standards in the Security Hub which includes [AWS Foundational Security Best Practices (FSBP)](https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html), [Center for Internet Security (CIS) AWS Foundations Benchmark v1.4.0](https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html#cis1v4-standard), and [NIST SP 800-53 Rev. 5](https://docs.aws.amazon.com/securityhub/latest/userguide/nist-standard.html).

A sample mapping between FedRAMP control requirements and LZA implementation is provided within The AWS Landing Zone Accelerator Verified Reference Architecture Whitepaper for FedRAMP package. The package is available for customer download in AWS Artifact in both the AWS Standard and the AWS GovCloud (US) regions. Many compliance frameworks are similar and have overlapping requirements. Often times, the same managed Config rules can be categorically applied to other compliance frameworks, such as CMMC.

## Organizational Structure

An overview of the LZA organizational structure is shown in the following image.  However, you are free to change the organizational structure, Organizational Units (OUs), and accounts to meet your specific needs.

For additional information about how to best organize your AWS OU and account structure, please reference the Recommended OUs and accounts in the For Further Consideration section below as you begin to experiment.

![](./images/image1.png)

By default, the config builds the above organizational structure, with the exception of the Infrastructure and Security OU, which are predefined by you prior to launching the LZA. The following provides an overview of the network infrastructure.

The SharedServices OU provides the following specialized functions:
-   The GovCloudNetwork account contains a network inspection VPC for inspecting AWS traffic as well as routing traffic to and from the Internet. Traffic will flow through the Network-Main Transit Gateway, where it can be inspected by AWS Network Firewall before being blocked or continuing to the internet or its final destination.

-   The GovCloudSharedServices VPC is intended to house centrally shared services that are accessible to all of the accounts in the infrastructure. For example, you might deploy central security services such as Endpoint Detection and Response (EDR) or a central directory service such as LDAP. This central location and corresponding route tables allow you to efficiently design your network and compartmentalize access control accordingly

## Architecture Diagram

The default configuration will deploy an AWS Virtual Private Cloud (VPC) with a primary Classless Inter-Domain Routing (CIDR) block of 10.0.0.0/16.

The LZA solution provides the flexibility to easily deploy additional services to suit your cloud computing needs. The default deployment does not include enablement of select services, such as a NAT gateway, AWS Network Firewall, or AWS Transit Gateway.  You should evaluate the configuration options to configure the network architecture in accordance with your infrastructure needs.

The following network diagram is an example foundational network topology.  The diagram identifies the use of an inspection VPC for where traffic can be inspected and filtered, such as through the use of a web application firewall and intrusion detection/intrusion prevention system.  Network communications among VPCs are facilitated through the use of Transit Gateways.

![Landing Zone Accelerator on AWS architecture -- networking
resources.](./images/image2.png)

## For Further Consideration

AWS provides resources that you should consult as you begin customizing your deployment:

1.  Refer to the [Best Practices](https://aws.amazon.com/blogs/mt/best-practices-for-organizational-units-with-aws-organizations/) for Organizational Units with AWS Organizations blog post for an overview.

2.  [Recommended OUs and accounts](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/recommended-ous-and-accounts.html). This section of the Organizing your AWS Environment Using Multiple Accounts paper discusses the deployment of specific-purpose OUs in addition to the foundational ones established by the LZA. For example, you may wish to establish a Sandbox OU for Experimentation, a Policy Staging OU to safely test policy changes before deploying them more broadly, or a Suspended OU to hold, constrain, and eventually retire accounts that you no longer need.

3.  [AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html) (SRA). The SRA \"is a holistic set of guidelines for deploying the full complement of AWS security services in a multi-account environment.\" This document is aimed at helping you to explore the \"big picture\" of AWS security and security-related services in order to determine the architectures most suited to your organization\'s unique security requirements.

## References

-   LZA on AWS [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/landing-zone-accelerator-on-aws.pdf). This is the official documentation of the Landing Zone Accelerator Project and serves as your starting point. Use the instructions in the implementation guide to stand up your environment.

-   AWS Labs [LZA Accelerator](https://github.com/awslabs/landing-zone-accelerator-on-aws) GitHub Repository. The official codebase of the Landing Zone Accelerator Project.

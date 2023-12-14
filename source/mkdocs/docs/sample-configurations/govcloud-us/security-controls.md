# Security Controls

The LZA aims to be prescriptive in applying best practices for space customers, it intentionally avoids being overly prescriptive out of deference to the unique realities for each individual organization. Consider the baseline as a foundational starting point.

The config deploys security controls that provide detective or preventative guardrails in the AWS environment. Collectively, the applied security controls help to accelerate your path to compliance. Configuration of the LZA is done through multiple configuration files. Through the LZA, security controls are applied to accounts to drive conformance with compliance framework requirements.

All of the LZA configuration files align with LZA sample configuration. The following is an overview of the LZA configuration files. You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.

## global-config.yaml

The [global-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config-govcloud-us/govcloud-us-config/global-config.yaml) file contains the settings that enable centralized logging using AWS CloudTrail and Amazon CloudWatch Logs. The configuration establishes the retention period for those logs to help you meet your specific auditing and monitoring needs.

You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.

## organization-config.yaml

Within the [organization-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config-govcloud-us/govcloud-us-config/organization-config.yaml) file there are sections for declaring Service Control Policies (SCPs). SCPs are a type of organization policy that you can use to manage permissions in your organization. SCPs offer central control over the maximum available permissions for all accounts in your organization.

SCPs can be highly specific to an organization and its workloads. The SCPs should be reviewed and modified to meet your specific requirements. The following sample policies have been provided within the configuration.

- guardrails-1.json: This SCP restricts permissions to manipulate or delete AWS Config rules and Lambda functions. It also prevents disabling of Amazon EBS encryption.

- guardrails-2.json: This SCP restricts the ability to delete or manipulate the password policy, manipulate AWS IAM roles, or make changes to security services such as Amazon GuardDuty and AWS Security Hub.

- Quarantine: This SCP is used to prevent changes to new accounts until the LZA has been executed successfully and control applied.

It is important to note that SCPs are not automatically updated and that changes to the eligible service list may require the SCP to be updated. However, these sample SCPs are an example of how your organization can ensure that a select list of AWS services are used for specific use cases.

## security-config.yaml

The [security-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config-govcloud-us/govcloud-us-config/security-config.yaml) is designed to deploy a number of preventative and detective measures that align with the Federal Risk and Authorization Management Program (FedRAMP), National Institute of Standards and Technology (NIST) 800-53(5), NIST 800-171 Rev.2, and Cybersecurity Maturity Model Certification (CMMC) Level 2 compliance framework control requirements. The security-config.yaml establishes the use of multiple security services and configurations such as AWS Config, Amazon GuardDuty, and AWS Security Hub.

It establishes minimum AWS Identity and Access Management password requirements that are aligned with AWS best practices to set a password length of 14. This exceeds NIST’s 800-63B latest password guidance that establishes a minimum password length of 8. If you need to comply with this please change the IAM Password Policy appropriately as noted in the security-config.yaml file. Consider reviewing the configuration details to determine conformance with your organization’s compliance requirements if they extend beyond the control frameworks’ prescribed guidance

The LZA provides the capability to easily enable additional security services. Detective guardrails are established through the use of Security Hub and Config, which deploy managed Config rules. These rules evaluate whether the configuration settings of your AWS resources comply with common best practices. By default the config rules are aligned to be deployed to both GovCloud East/West. The LZA enables the security standards in the Security Hub which includes [AWS Foundational Security Best Practices (FSBP)](https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html), [Center for Internet Security (CIS) AWS Foundations Benchmark v1.4.0](https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html#cis1v4-standard), and [NIST SP 800-53 Rev. 5](https://docs.aws.amazon.com/securityhub/latest/userguide/nist-standard.html).

A sample mapping between FedRAMP control requirements and LZA implementation is provided within The AWS Landing Zone Accelerator Verified Reference Architecture Whitepaper for FedRAMP package. The package is available for customer download in AWS Artifact in both the AWS Standard and the AWS GovCloud (US) regions. Many compliance frameworks are similar and have overlapping requirements. Often times, the same managed Config rules can be categorically applied to other compliance frameworks, such as CMMC.
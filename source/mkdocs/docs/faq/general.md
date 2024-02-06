# General FAQ

## What is Landing Zone Accelerator on AWS?

The Landing Zone Accelerator on AWS is an open-source solution that will help customers quickly deploy a secure, scalable, and fully-automated cloud foundation. The Landing Zone Accelerator is architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. When used in coordination with services such as AWS Control Tower, it provides a simplified no-code solution to manage and govern a multi-account environment built to support customers with complex compliance requirements. Additionally, the Landing Zone Accelerator on AWS supports non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and Top Secret regions.

The Landing Zone Accelerator is built using the AWS Cloud Development Kit (CDK), and installs directly into a customers environment, where they have full access to the infrastructure as code (IaC) solution. Through a simplified set of configuration files, customers are able to enable additional functionality, guardrails (eg. AWS Managed Config Rules), and manage their foundational networking topology (eg. Transit Gateways and Network Firewall).

## Why should I use this solution?

Landing Zone Accelerator is ideal for customers that don’t have the expertise or don’t want to design an enterprise platform and governance tool chain. Any customer who is looking to build on AWS and wants to do so in a compliant way can use this solution to quickly improve their cloud security posture.

## How does it work?

Landing Zone Accelerator is installed into your AWS Organizations Management account through AWS CloudFormation. You can utilize a provided default configuration to initialize your environment with technical security controls and foundational infrastructure on AWS that aligns with best practices and conforms with several compliance frameworks. Customers are able to make additional modifications to configuration files, such as adding additional AWS accounts or VPCs.

## Is this solution only applicable to government customers?

No, Landing Zone Accelerator is applicable for all customers that need to implement an architecture based on best practice security. Deployment is supported in any of the regions where Control Tower is available, as well as AWS GovCloud (US).

Landing Zone Accelerator is delivered with [sample configuration files](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations) which deploy opinionated and prescriptive architectures designed to meet the security and operational requirements of many customers around the world. While installation of the provided prescriptive architectures are reasonably simple, deploying a customized architecture does require extensive understanding of the AWS platform.

## Will AWS have access to customer’s data if they use this solution?

No, Landing Zone Accelerator resides within your Management account and is controlled by you. The Landing Zone Accelerator on AWS does not change any of the responsibilities in the [Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/). Another benefit to having the code available as open source is the transparency it brings so customers can be certain of what is being done in their accounts.

## Where can I get additional technical assistance for Landing Zone Accelerator?

Customers are able use the [AWS Support console](https://support.console.aws.amazon.com/support/home) to file issues directly against Landing Zone Accelerator. Please use **_Service: Control Tower → Category: Landing Zone Accelerator_** when filing support tickets.

### Where can I find a software bill of materials (SBOM) for the Landing Zone Accelerator?

A software bill of materials can be generated from the Landing Zone Accelerator repository hosted on [GitHub](https://github.com/awslabs/landing-zone-accelerator-on-aws). For instructions on how to generate the SBOM, please see [Exporting a software bill of materials for your repository](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/exporting-a-software-bill-of-materials-for-your-repository).

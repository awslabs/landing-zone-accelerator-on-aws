# Standard Configuration Overview

The [Landing Zone Accelerator on AWS (LZA)](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) is architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. We recommend customers deploy [AWS Control Tower](https://aws.amazon.com/controltower) as the foundational landing zone and enhance their landing zone capabilities with Landing Zone Accelerator. These complementary capabilities provides a comprehensive low-code solution across 35+ AWS services to manage and govern a multi-account environment built to support customers with highly-regulated workloads and complex compliance requirements. AWS Control Tower and Landing Zone Accelerator help you establish platform readiness with security, compliance, and operational capabilities.

The configuration of LZA is managed through _configuration files_. Configuration files are written in [YAML](https://yaml.org/) and define the AWS account and service configurations that meet specific compliance objectives. Using the configuration files, the solution helps users manage the lifecycle of their landing zone by setting up a baseline security architecture and automating common administrative and operational activities. This reduces the undifferentiated heavy lifting associated with building regulated environments on AWS, allowing organizations to focus on other high value concerns such as operating models, developer agility, and reducing costs.

After deploying LZA and implementing these configuration files, you can:

- Configure additional functionality, guardrails, and security services such as [AWS Config](http://aws.amazon.com/config/) Managed Rules and [AWS Security Hub](http://aws.amazon.com/security-hub/)
- Manage your foundational networking topology such as [Amazon Virtual Private Cloud](http://aws.amazon.com/vpc/) (Amazon VPC), [AWS Transit Gateway](http://aws.amazon.com/transit-gateway/), and [AWS Network Firewall](http://aws.amazon.com/network-firewall/)
- Generate additional workload accounts using the [AWS Control Tower Account Factory](https://docs.aws.amazon.com/controltower/latest/userguide/account-factory.html) or [AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html)

This guide describes architectural considerations, design, and configuration steps for deploying the LZA sample configuration files.

We recommend you familiarize yourself with the [best practices for for managing your configuration files](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-file-best-practices.html) before making any chances to your environment.

**Note:** This README is focused on the [general sample configuration](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/lza-sample-config), not the industry specific configuration files which can be found [here](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations).

## Design Principles

1. Help customers implement a secure by design multi-account architecture aligned to AWS best practices
2. Maximize agility, scalability, and availability while minimizing cost
3. Enable the full capabilities of the AWS cloud
4. Remove burden from customers by maintaining the deployment engine and configuration files to make use of the latest AWS innovations
5. Offer customers flexibility to add capabilities and reconfigure the environment in an automated manner
6. Reduce scope of impact by implementing logical separation between functions e.g. organizational networking, security, and workloads

## Architecture Summary

The architecture and best practices defined in these configuration files are heavily influenced by the AWS whitepaper [Organizing Your AWS Environment Using Multiple Accounts](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html) and the [AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html). We highly recommend you read this guidance to understand the detail behind the architecture and its application in context of your organization's unique objectives.

## Document Conventions

The following conventions are used throughout this document.

### AWS Account Numbers

AWS account numbers are decimal-digit pseudorandom identifiers with 12 digits (e.g. `111122223333`). This document will use the convention that an AWS Organization Management (root) account has the account ID `123456789012`, and child accounts are represented by `111122223333`, `444455556666`, etc.
For example the following ARN would refer to a VPC subnet in the `us-east-1` region in the Organization Management (root) account:

```
arn:aws:ec2:us-east-1:123456789012:subnet/subnet-0e9801d129EXAMPLE
```

### JSON Annotation

Throughout the document, JSON snippets may be annotated with comments (starting with `//`). The JSON language itself does not define comments as part of the specification; these must be removed prior to use in most situations, including the AWS Console and APIs.
For example:

```json
{
    "Effect": "Allow",
    "Principal": {
    "AWS": "arn:aws:iam::123456789012:root" // Trust the Organization Management account
    },
    "Action": "sts:AssumeRole"
}
```

The above is not valid JSON without first removing the comment on the fourth line.

### IP Addresses

The sample [network configuration file](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/network-config.yaml) may make use of [RFC1918](https://tools.ietf.org/html/rfc1918) addresses (e.g. `10.1.0.0/16`) and [RFC6598](https://tools.ietf.org/html/rfc6598) (e.g. `100.96.250.0/23`) for various networks; these will be labeled accordingly. Any specific range or IP shown is purely for illustration purposes only.

### Preventative Controls

This sample configuration leverages Service Control Policies (SCPs), a feature of AWS Organizations, to implement scalable preventative controls across multi-account environments. The current design assumes that AWS Control Tower is deployed without its built-in [region deny capabilities](https://docs.aws.amazon.com/controltower/latest/userguide/region-deny.html). For organizations requiring the ability to restrict operations in governed regions, we recommend creating a custom [region deny policy](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_examples_general.html#example-scp-deny-region) and incorporating it into one of the existing Service Control Policies.

This approach offers greater flexibility and granular control over regional access, while maintaining the robust governance framework provided by AWS Organizations. By tailoring the region deny policy to your specific needs, you can effectively manage access across your multi-account structure, ensuring compliance with your organization's security and operational requirements.

### Customer Naming

This document will make no reference to specific AWS customers. Where naming is required (e.g. in domain names), this document will use a placeholder name as needed; e.g. `example.com`.
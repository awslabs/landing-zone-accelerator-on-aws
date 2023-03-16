# NCSC - LZA Documentation

# 1. Table of Contents

TBC

# 2. Overview

The Landing Zone Accelerator on AWS solution helps you quickly deploy a secure, resilient, scalable, and fully automat cloud foundation that accelerates your readiness for your cloud compliance program.

Many organizations must adhere to complex compliance and security standards to protect their sensitive data. We architected this solution to align with AWS best practices and in conformance with multiple global compliance frameworks, with these organizations in mind. When used in coordination with services such as [AWS Control Tower](http://aws.amazon.com/controltower), this solution provides a comprehensive low-code solution across 35+ AWS services and features. Specifically, this solution allows you to manage and govern a multi-account environment that is built to support highly-regulated workloads and complex compliance requirements. Landing Zone Accelerator on AWS helps you establish platform readiness with security, compliance, and operational capabilities.

We provide this solution as an open-source project that we built using the [AWS Cloud Development Kit](http://aws.amazon.com/cdk/) (AWS CDK). You can install it directly into your environment, giving you full access to the infrastructure as code (IaC) solution. Through a simplified set of configuration files, you can:

- Configure additional functionality, guardrails, and security services such as [AWS Config](http://aws.amazon.com/config/) Managed Rules and [AWS Security Hub](http://aws.amazon.com/security-hub/)
- Manage your foundational networking topology such as [Amazon Virtual Private Cloud](http://aws.amazon.com/vpc/) (Amazon VPC), [AWS Transit Gateway](http://aws.amazon.com/transit-gateway/), and [AWS Network Firewall](http://aws.amazon.com/network-firewall/)
- Generate additional workload accounts using the AWS Control Tower Account Factory

There are no additional charges or upfront commitments required to use Landing Zone Accelerator on AWS. You pay only for AWS services turned on to set up your platform and operate your guardrails. This solution can also support non-standard AWS partitions, including the AWS GovCloud (US), AWS Secret, and AWS Top Secret Regions.

This implementation guide describes architectural considerations and configuration steps for deploying the Landing Zone Accelerator on AWS. It includes links to an [AWS CloudFormation](http://aws.amazon.com/cloudformation/) template synthesized from AWS CDK that launches and configures the AWS services required to deploy this solution using AWS best practices for security and availability.

## 2.1. Design Principles

1. Help customers implement a secure by design multi-account architecture aligned to AWS best practices
2. Maximise agility, scalability, and availability whilst minimising cost
3. Enable the full capabilities of the AWS cloud
4. Remove burden from customers by maintaining the deployment engine and templates to make use of the latest AWS innovations
5. Offer customers flexibility to add capabilities and reconfigure the environment easily in an automated manor
6. Reduce scope of impact by ring fencing specific functions e.g. organisational networking, security and workloads

## 2.2. Architecture Summary

Landing Zone Accelerator on AWS comes with example [best practices configurations](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations) that allow you to quickly deploy accounts, infrastructure, and security guardrails across your multi-account environment. The repository includes sample configurations for each of the [six customizable YAML files](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-files.html) across both standard and AWS GovCloud (US) Regions. When used with this solution, the best practices configurations deploy a baseline security and network architecture. Additional customization of the baselines will likely be required to suit the compliance needs of your business.

We built the best practices configurations based on the authorized patterns and guidelines provided in the AWS Prescriptive Guidance [Security Reference Architecture (SRA)](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/architecture.html). This solution is a fully-automated implementation of the AWS SRA and additionally provides you flexibility to customize your landing zone to suit your organizational security, networking, and compliance requirements.

This document focuses on the [general best practices configuration](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/aws-best-practices), not the industry specific solutions, can be considered as a platform to remove undifferentiated heavy lifting across an org when building compliant infrastructure on AWS.

The following diagram shows the best practices network configuration, and is intended to set up various centralised networking constructs that you can use to customise and build additional infrastructure.
[Image: Image.jpg]
https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/best-practices-configuration.html

## 2.4. Document Conventions

The following conventions are used throughout this documen

#### 2.4.0.1. AWS Account Numbers

AWS account numbers are decimal-digit pseudorandom identifiers with 12 digits (e.g. `651278770121`). This document will use the convention that an AWS Organization Management (root) account has the account ID `123456789012`, and child accounts are represented by `111111111111`, `222222222222`, etc.
For example the following ARN would refer to a VPC subnet in the `ca-central-1` region in the Organization Management (root) account:

```
arn:aws:ec2:ca-central-1:123456789012:subnet/subnet-024759b61fc305ea3
```

#### 2.4.0.2. JSON Annotation

Throughout the document, JSON snippets may be annotated with comments (starting with `//`). The JSON language itself does not define comments as part of the specification; these must be removed prior to use in most situations, including the AWS Console and APIs.
For example:

```
{
    "Effect": "Allow",
    "Principal": {
    "AWS": "arn:aws:iam::123456789012:root" // Trust the Organization Management account
    },
    "Action": "sts:AssumeRole"
}
```

The above is not valid JSON without first removing the comment on the fourth line.

#### 2.4.0.3. IP Addresses

The sample [template](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/aws-best-practices/network-config.yaml) makes use of [RFC1918](https://tools.ietf.org/html/rfc1918) addresses (e.g. `10.1.0.0/16`) and [RFC6598](https://tools.ietf.org/html/rfc6598) (e.g. `100.96.250.0/23`) for various networks; these will be labeled accordingly. Any specific range or IP shown is purely for illustration purposes only.

#### 2.4.0.4. Customer Naming

This document will make no reference to specific AWS customers. Where naming is required (e.g. in domain names), this document will use a placeholder name as needed; e.g. `example.ca`.

# 3. Account Structure

## 3.1. Overview

AWS accounts are a strong isolation boundary; by default there is no control plane or data plane access from one A account to another. AWS accounts provide different AWS customers an isolated private cloud tenancy inside the AWS commercial cloud. It is worth noting that users and roles reside within AWS accounts, and are the constructs used to grant permissions within an AWS account to people, services and applications. AWS Organizations is a service that provides centralized billing across a fleet of accounts, and optionally, some integration-points for cross-account guardrails and cross-account resource sharing. The _Landing Zone Accelerator_ uses these features of AWS Organizations to realize its outcomes.

## 3.2. Organization structure

The _Landing Zone Accelerator_ includes the following default AWS organization and account structure.

Note that the AWS account structure is strictly a control plane concept - nothing about this structure implies anything about the network architecture or network flows.
[Image: Image.jpg]
[Image: Image.jpg]

### 3.2.1. Organization Management (root) AWS Account

The AWS Organization resides in the Organization Management (root) AWS account and is traditionally an organization's first AWS account. This account is not used for workloads - it functions primarily as a billing aggregator, and a gateway to the entire cloud footprint for high-trust principals. Access to the Management account must be strictly controlled to a small set of highly trusted individuals from the organization. Additionally, the Organization Management account is where the automation engine or tooling is installed to automate the deployment of the LZA architecture and its security guardrails. There exists a trust relationship which is used by the automation engine between child AWS accounts in the organization and the Organization Management (root) account; from the Management account, users and roles can assume a role of the following form in child accounts:

```
{
  "Role": {
    "Path": "/",
    "RoleName": "OrganizationAccountAccessRole",
    "Arn": "arn:aws:iam::111111111111:role/OrganizationAccountAccessRole", // Child account
"AssumeRolePolicyDocument": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "AWS": "arn:aws:iam::123456789012:root" // Organization Management account may assume this role
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }
  }
}
```

**Note**: this is the default role installed by AWS Organizations (`OrganizationAccountAccessRole`) when new AWS accounts are created using AWS organizations. This role changes to `AWSControlTowerExecution` when Control Tower is being leveraged.

### 3.2.2. AWS IAM Identity Center (successor to AWS Single Sign-On)

AWS IAM Identity Center (AWS IIC) resides in the Organization Management account. Once deployed from the Organization Management account it is recommended that AWS IIC administration is delegated to the Operations account (sometimes referred to as the Shared Services account). AWS IIC is where you create, or connect, your workforce identities in AWS, once, and manage access centrally across your AWS organization. You can create user identities directly in AWS IIC, or you can bring them from your Microsoft Active Directory or a standards-based identity provider, such as Okta Universal Directory or Azure AD. AWS IIC provides a unified administration experience to define, customize, and assign fine-grained access. Your workforce users get a user portal to access all of their assigned AWS accounts. The AWS IIC service deploys IAM roles into accounts in the organization and associates them with the designated workforce identities . More details on IIC are available in the **Authorization and Authentication** section of this document.

## 3.3. Organizational Units

Underneath the root of the organization, Organizational Units (OUs) provide a mechanism for grouping accounts into logical collections. Aside from the benefit of the grouping itself, these collections serve as the attachment points for SCPs (preventative API-blocking controls), and Resource Access Manager sharing (cross-account resource sharing).

The OU an AWS account is placed in determines the account's purpose, its security posture and the applicable guardrails. An account placed in the Testing OU would have the least restrictive, most agile, and most cloud native functionality, whereas an account placed in the Prod OU would have the most restrictive set of guardrails applied.

OUs are NOT designed to reflect an organization's structure, and should instead reflect major shifts in permissions. OUs should not be created for every stage in the SDLC, but those that represent a major permissions shift. For example, organizations that have multiple test stages would often locate the Test and QA Test instances of a workload within the same AWS test account. Customers with a Pre-Prod requirement would often either place their Pre-Prod workloads into their Prod account (alongside the Prod workloads), or in cases requiring more extensive isolation, in a second AWS account located in the Prod OU.

The Default OU structure is shown below:
[Image: Image.jpg]
Example use cases are as follows:

- An SCP is attached to the Infrastructure OU to prevent the deletion of Transit Gateway resources in the associated accounts.
- The Shared Network account uses RAM sharing to share the development line-of-business VPC with accounts in a development OU. This makes the VPC available to a functional account in that OU used by developers, despite residing logically in the shared network account.

OUs may be nested (to a total depth of five), with SCPs and RAM sharing being controlled at the top level by the automation tooling. A typical LZA environment will have the following OUs:

### 3.3.1. Security OU

The accounts in this OU are considered administrative in nature with access often restricted to _IT security personnel_.

The Security OU is used to hold AWS accounts containing AWS security resources shared or utilized by the rest of the organization. The accounts in the security OU (Log Archive and Security Tooling) often represent the core or minimum viable set of accounts for organizations wishing to slim the architecture down. No application accounts or application workloads are intended to exist within this OU.

### 3.3.2. Infrastructure OU

The accounts in this OU are also considered administrative in nature with access often restricted to _IT operations personnel_.

The Infrastructure OU is used to hold AWS accounts containing AWS infrastructure resources shared or utilized by the rest of the organization. The accounts in the Infrastructure OU are also considered core accounts, including accounts like the centralized Network account. No application accounts or application workloads are intended to exist within this OU.

## 3.4. Mandatory Accounts

https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/mandatory-accounts.html
[Image: Image.jpg]

### 3.4.1. Management (root) Account

This is the Management or root AWS account, access to this account must be highly restricted and should not contain customer resources.

As discussed above, the Management (root) account functions as the root of the AWS Organization, the billing aggregator, and attachment point for SCPs. Workloads are not intended to run in this account. The [LZA automation engine](https://github.com/awslabs/landing-zone-accelerator-on-aws)will deploy into this account.

### 3.4.3. Network Account (Transit)

This account is used for centralized or shared networking resources. The shared network account hosts the vast majority of the AWS-side of the networking resources throughout LZA. This account used various AWS services to facilitate “east/west” traffic between workloads and north/south traffic from workloads to the internet.

### 3.4.4. Shared Services

This account is used for centralized IT Operational resources (Active Directory, traditional syslog tooling, ITSM, etc.). The operations account provides a central location for the cloud team to provide cloud operation services to other AWS accounts across the organization and is where an organizations cloud operations team "hangs out" or delivers tooling applicable across all accounts in the organization.

### 3.4.5. Log Archive

The Log archive account is used to centralize and store immutable logs for the organization. The Log Archive account provides a central aggregation and secure storage point for all audit logs created within the AWS Organization. This account contains a centralized storage location for copies of every account’s audit, configuration compliance, and operational logs.

### 3.4.6. **Audit/**Security Tooling

This account is used to centralize access to AWS security tooling and consoles, as well as provide View-Only access for investigative purposes into all accounts in the organization. The security account is restricted to authorized security and compliance personnel, and related security or audit tools. This is an aggregation point for security services, including AWS Security Hub, GuardDuty, Macie, Config, Firewall Manager, Detective, Inspector, and IAM Access Analyzer.

## 3.5. Functional Accounts

Functional accounts are created on demand, and placed into an appropriate OU in the organization structure. The purpose of functional accounts is to provide a secure and managed environment where project teams can use AWS resources. They provide an isolated control plane so that the actions of one team in one account cannot inadvertently affect the work of other teams in other accounts.

Data plane isolation within the same VPC is achieved by default, by using appropriate security groups whenever ingress is warranted. For example, the app tier of `systemA` should only permit ingress from the `systemA-web` security group, not an overly broad range such as `0.0.0.0/0`, or even the entire VPCs address range.

## 3.6. Account Level Security Settings

LZA enables certain account-wide features on account creation. Namely, these include:

1. [S3 Public Access Block](https://docs.aws.amazon.com/AmazonS3/latest/dev/access-control-block-public-access.html#access-control-block-public-access-options)
2. [Default encryption of EBS volumes](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html#encryption-by-default) using a customer managed local account KMS key
3. [Tagging policy](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/organization-config.yaml#L39) applied to the root OU
4. [Backup Policy](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/organization-config.yaml#L50) applied to the root OU

# 4. Authorization and Authentication

## 4.1. Overview

The Landing Zone Accelerator makes extensive use of AWS authorization and authentication primitives from the Identity and Access Management (IAM) service as a means to enforce the guardrail objectives of the Landing Zone Accelerator, and govern access to the set of accounts that makes up the organization.

## 4.2. Relationship to the Management (root) AWS Account

AWS accounts, as a default position, are entirely self-contained with respect to IAM principals - their Users, Roles, Groups are independent and scoped only to themselves. Accounts created by AWS Organizations deploy a default role with a trust policy back to the Organization Management account. While it can be customized, by default this role is named the `OrganizationAccountAccessRole` (or `AWSControlTowerExecution` when Control Tower is deployed).

As discussed, the AWS Organization resides in the Management (root) account. This account is not used for workloads and is primarily a gateway to the entire cloud footprint for a high-trust principal. It is therefore crucial that all Management account credentials be handled with extreme diligence, and with a U2F hardware key enabled as a second-factor (and stored in a secure location such as a safe) for all users created within this account, including the root user, regardless of privilege level assigned directly within the Management account.

## 4.3. Break Glass Accounts

The Management account is used to provide break glass access to AWS accounts within the organization. Break glass (which draws its name from breaking the glass to pull a fire alarm) refers to a quick means for a person who does not have access privileges to certain AWS accounts to gain access in exceptional circumstances, using an approved process. Access to AWS accounts within the organization is provided through AWS IIC. The use and creation of IAM users is highly discouraged, with one exception, break glass users. It is generally recommended that organizations create between 2 to 4 IAM break glass users within the Organization Management account. These users would have hardware based MFA enabled and would be leveraged in exceptional circumstances to gain access to the Organization Management account or sub-accounts within the organization by assuming a role. Use cases for break glass access include failure of the organizations IdP, an incident involving the organizations IdP, a failure of AWS IIC, or a disaster involving the loss of an organization’s entire cloud or IdP teams.

To re-iterate, access to the Management account grants ‘super admin’ status, given the organizational-wide trust relationship to the management account. Therefore access to the 2 break glass IAM users must be tightly controlled, yet accessible via a predefined and strict process. This process often involves one trusted individual having access to a safe containing the password and a different trusted individual having access to a safe with the hardware MFA key – requiring 2 people to access the break glass credentials.

It is worth noting that AWS SCPs are not applicable to the Organization Management account. It is also worth noting that from within the Organization Management account, roles can be assumed in any account within the organization which include broad exclusions from the SCPs (discussed below). These roles are needed to allow the automation tooling to apply and update the guardrails as required, to troubleshoot and resolve issues with the automation tooling, and to bypass the guardrails under approved exception scenarios.

Several roles are available for access across the organization from the Management account: the LZA tooling roles which are excluded from the majority of the SCPs to enable the automation tooling to deploy, manage and update the guardrails and provide access to troubleshoot and resolve issues with the automation tooling; and the standard OrganizationAccountAccessRole which has been only been excluded from SCPs which strictly deliver preventative security controls. The OrganizationAccountAccessRole is within the bounds of the SCPs which protect automation tooling deployed guardrails and functionality. Access to these roles is available to any IAM user or role in the Organization Management account.

## 4.4. Multi-Factor Authentication

The following are commonly used MFA mechanisms, supported by AWS:

- RSA tokens are a strong form of hardware based MFA authentication but can only be assigned on a 1:1 basis. A unique token is required for every user in every account. You cannot utilize the same token for multiple users or across AWS accounts.
- Yubikeys are U2F compliant devices and also a strong form of hardware based MFA authentication. Yubikeys have the advantage of allowing many:1 assignment, with multiple users and accounts able to use a single Yubikey.
- Virtual MFA like Google Authenticator on a mobile device is generally considered a good hardware based MFA mechanism, but is not considered as strong as tokens or Yubikeys. Virtual MFA also adds considerations around device charge and is not suitable for break glass type scenarios.
- SMS text messages and email based one time tokens are generally considered a weak form of MFA based authentication, but still highly desirable over no MFA.

MFA should be used by all users regardless of privilege level with some general guidelines:

- Yubikeys provide the strongest form of MFA protection and are strongly encouraged for all account root users and all IAM users in the Organization Management (root) account;
- the Organization Management (root) account requires a dedicated Yubikey, such that when access is required to a sub-account root user, you do not expose the Organization Management account’s Yubikey;
- every ~50 sub-accounts requires a dedicated Yubikey to protect the root user, minimizing the required number of Yubikeys and the scope of impact should a Yubikey be lost or compromised;
- each IAM break glass user requires a dedicated Yubikey, as do any additional IAM users in the Organization Management (root) account. While some CSPs do not recommend MFA on the break glass users, it is strongly encouraged in AWS;
- the MFA devices for all account root users including the management account and the IAM break glass users should be securely stored, with well defined access policies and procedures;
- all other AWS users (AWS IIC, IAM in sub-accounts, etc.) regardless of privilege level should leverage virtual MFA devices (like Google Authenticator on a mobile device).

## 4.5. Control Plane Access via AWS IIC

The vast majority of end-users of the AWS cloud within the organization will never use or interact with the Management account, or the root users of any child account in the organization. The LZA recommends that AWS IIC be provisioned in the Organization Management account (a rare case where Organization Management account deployment is mandated).

Users will login to AWS via the web-based endpoint for the AWS IIC service; AWS IIC then authenticates the user based on the Identity Center directory hosted by AWS IIC. \*\* \*\* Based on group membership, the user will be presented with a set of roles to assume into assigned accounts. For example, a developer may be placed into groups that permit Administrative access in a specific developer account and Read-Only access in a test account; meanwhile an IT Cloud Administrator may have high-privilege access to most, or all, accounts. Examples of how configure these permissions can be found [here](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IdentityCenterConfig.html), [here](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IdentityCenterPermissionSetConfig.html) and [here](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IdentityCenterAssignmentConfig.html).

Is recommended that you integrate AWS IIC with a Managed Active Directory that you deploy in an account (e.g. the Shared Services Account) or you can integrate with an external IDP such as OKTA or Azure AD via SAML, to simplify your user management processes.

### 4.5.1. IIC User Roles

AWS IIC uses the Identity Center Directory hosted by AWS IIC as an identity provider (IdP) and associated roles in each account in the organization. The roles used by end users have a trust policy to this IdP. When a user authenticates to AWS IIC and selects a role to assume based on their group membership, the IIC service provides the user with temporary security credentials unique to the role session. In such a scenario, the user has no long-term credentials (e.g. password, or access keys) and instead uses their temporary security credentials.

Users, via their Identity Center Directory group membership, are ultimately assigned to IIC user roles via the use of AWS IIC permission sets. A permission set is an assignment of a particular permission policy to an AWS account. For example:
An organization might decide to use **AWS Managed Policies for Job Functions** that are located within the IIC service as the baseline for role-based-access-control (RBAC) separation within an AWS account. This enables job function policies such as:

- **Administrator** - This policy provides full access to all AWS services and resources in the account;
- **Power User** - Provides full access to AWS services and resources, but does not allow management of users, groups and policies;
- **Database Administrator** - Grants full access permissions to AWS services and actions required to set up and configure AWS database services;
- **View-Only User** - This policy grants permissions to view resources and basic metadata across all AWS services. It does not provide access to get or read workload data.

### 4.5.2. Principal Authorization

Having assumed a role, a user’s permission level within an AWS account with respect to any API operation is governed by the IAM policy evaluation logic flow ([detailed here](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)):
Having an `allow` to a particular API operation on the role (i.e. session policy) does not necessarily imply that API operation will succeed. As depicted above, a **deny** at any level in the evaluation logic will block access to the API call; for example a restrictive permission boundary or an explicit `deny` at the resource or SCP level will block the call. SCPs can be used to help enforce best practices guardrails for users.

## 4.6. Root Authorization

Every AWS account has a set of root credentials. These root credentials are generated on account creation with a random 64-character password. It is important that the root credentials for each account be recovered and MFA enabled via the AWS root credential password reset process using the account’s unique email address.

Root credentials authorize all actions for all AWS services and for all resources in the account (except anything denied by SCPs). There are some actions which only root has the capability to perform which are found within the [AWS documentation](https://docs.aws.amazon.com/general/latest/gr/aws_tasks-that-require-root.html). These are typically rare operations (e.g. creation of X.509 keys), and should not be required in the normal course of business. Root credentials should be handled with extreme diligence, with MFA enabled per the guidance in the previous section.

## 4.7. Service Roles

A service role is an IAM role that a service assumes to perform actions in an account on the user’s behalf. When a user sets up an AWS service, the user must define an IAM role for the service to assume. This service role must include all the permissions that are required for the service to access the AWS resources that it needs. Service roles provide access only within a single account and cannot be used to grant access to services in other accounts. Users can create, modify, and delete a service role from within the IAM service. For example, a user can create a role that allows Amazon Redshift to access an Amazon S3 bucket on the user’s behalf and then load data from that bucket into an Amazon Redshift cluster. In the case of SSO, during the process in which AWS IIC is enabled, the AWS Organizations service grants AWS IIC the necessary permissions to create subsequent IAM roles.

## 4.8. Service Control Policies

Service Control Policies are a key preventative control used by the LZA. It is crucial to note that SCPs, by themselves, never _grant_ permissions. They are most often used to `Deny`certain actions at an OU, or account level within an AWS Organization. Since `deny` always overrides `allow` in the IAM policy evaluation logic, SCPs can have a powerful effect on all principals in any account, and can wholesale deny entire categories of actions irrespective of the permission policy attached to the principal itself - even the root user of the account.

SCPs follow an inheritance pattern from all levels of the hierarchy down to the account of the organization:
[Image: Image.jpg]
In order for any principal to be able to perform an action A, it is necessary (but not sufficient) that there is an `Allow` on action A from all levels of the hierarchy down to the account, and no explicit `Deny` anywhere. This is discussed in further detail in [How SCPs Work](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps-about.html).

The LZA leverages the following SCPs in the organization:

### 4.8.1 Guardrails 1 and 2

These guardrails apply across the organization and protect the guardrails and infrastructure deployed by the automation tooling. Note that this policy is split into two parts due to a current limitation of SCP sizing, but logically it should be considered a single policy: [part 1](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/aws-best-practices/service-control-policies/guardrails-1.json) and [part 2](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/aws-best-practices/service-control-policies/guardrails-2.json).

| Policy Statement ID (SID)              | Description                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CloudFormationStatement                | Prevents deletion of any CloudFormation stacks deployed by the automation tooling                           |
| ---                                    | ---                                                                                                         |
| IamRolesStatement                      | Prevents any IAM operation on protected IAM resources                                                       |
| PreventSSMModification                 | Prevents deletion of any SSM Parameter deployed by the automation tooling                                   |
| PreventCloudWatchLogsModification      | Prevents the deletion and modification of any CloudWatch Log groups                                         |
| PreventCloudWatchLogStreamModification | Prevents deleteion of CloudWatch Log Streams                                                                |
| LambdaStatement                        | Prevents the creation, deletion and modification of any Lambda functions deployed by the automation tooling |
| PreventCloudTrailModification          | Prevents deletion and modification of protected Cloud Trails                                                |
| ConfigRulesStatement                   | Protects AWS Config configuration from modification or deletion                                             |
| IamSettingsStatement                   | Protects creation, deletion, and modification of protected IAM policies                                     |
| GDSecHubServicesStatement              | Prevents the deletion and modification to AWS security services GuardDuty, Security Hub                     |
| SnsStatement                           | Prevents creation, deletion and modification of a protected SNS topics                                      |
| EbsEncryptionStatement                 | Prevents disabling of EBS Encryption                                                                        |
| MacieServiceStatement                  | Prevents the deletion and modification to AWS security services Macie                                       |

### 4.8.2 Quarantine

[This policy](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/aws-best-practices/service-control-policies/quarantine.json) is attached to an account to ‘quarantine’ it - to prevent any AWS operation from taking place. This is useful in the case of an account with credentials which are believed to have been compromised. This policy is also applied to new accounts upon creation. After the installation of guardrails, it is removed. In the meantime, it prevents all AWS control plane operations except by principals required to deploy guardrails.

| Policy Statement ID (SID)               | Description                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| DenyAllAWSServicesExceptBreakglassRoles | Blanket denial on all AWS control plane operations for all non-break-glass roles |

### 4.9 SCP Protection

SCPs are protected from change by enabling the [scpRevertChangesConfig](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/security-config.yaml#L10) [setting](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ScpRevertChangesConfig.html), which will monitor for manual changes to SCP and revert them. This is enabled by default in the best practices configuration.

# 5. Logging and Monitoring

## 5.1. Overview

TBC

## 5.2. CloudTrail

The AWS CloudTrail service provides a comprehensive log of control plane and data plane operations (audit history) of all actions taken against most AWS services, including users logging into accounts. This is [disabled by default](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/global-config.yaml#L22), but it is strongly recommended that you enabled this feature.

## 5.3. VPC Flow Logs

VPC Flow Logs capture information about the IP traffic going to and from network interfaces in an AWS Account VPC such as source and destination IPs, protocol, ports, and success/failure of the flow. LZA best practices [enables](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/network-config.yaml#L768) ALL (i.e. both accepted and rejected traffic) logs for all VPCs in all accounts to a local CloudWatch log group. It is important to use custom flow log formats to ensure all fields are captured as important fields are not part of the basic format. More details about VPC Flow Logs are [available here](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).
It should be noted that certain categories of network flows are not captured, including traffic to and from the instance metadata service (`169.254.169.254`), and DNS traffic with an Amazon VPC resolver (available in DNS resolver logs).

## 5.4. GuardDuty

Amazon GuardDuty is [enabled for best practices](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/security-config.yaml#L18) and is a cloud native threat detection and Intrusion Detection Service (IDS) that continuously monitors for malicious activity and unauthorized behavior to protect your AWS accounts and workloads. The service uses machine learning, anomaly detection, and integrated threat intelligence to identify and prioritize potential threats. GuardDuty uses a number of data sources including VPC Flow Logs, DNS logs, CloudTrail logs and several threat feeds.

## 5.5. Config

[AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html) provides a detailed view of the resources associated with each account in the AWS Organization, including how they are configured, how they are related to one another, and how the configurations have changed on a recurring basis. Resources can be evaluated on the basis of their compliance with Config Rules - for example, a Config Rule might continually examine EBS volumes and check that they are encrypted.
Config may is [enabled at the organisation level](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/security-config.yaml#L104) - this provides an overall view of the compliance status of all resources across the organisation. The AWS Config multi-account multi-region data aggregation capability has been located in both the Organization Management account and the Security account.

## 5.6. CloudWatch Logs

CloudWatch Logs is AWS’ log aggregator service, used to monitor, store, and access log files from EC2 instances, AWS CloudTrail, Route 53, and other sources.
[Image: Image.jpg]

1. A CloudWatch log group update workflow runs during the **Logging** stage of the pipeline. A CloudFormation custom resource invokes a Lambda function that updates existing log groups to the increase log retention if it's less than the solution log retention period, CloudWatch AWS KMS key, and subscription filter. The destination for the subscription filter is an Amazon Kinesis Data Stream deployed to the **Log Archive** account.
2. An EventBridge rule monitors for new CloudWatch log groups created in core and workload accounts.
3. When new log groups are created, the EventBridge rule invokes a Lambda function that updates the log group with the configured log retention period, CloudWatch AWS KMS key, and subscription filter. The destination for the subscription filter is the Kinesis Data Stream deployed to the **Log Archive** account.
4. Log groups stream their logs to the Kinesis Data Stream. The data stream is encrypted at rest with the replication AWS KMS key.
5. A delivery stream is configured with the Kinesis Data Stream and Kinesis Data Firehose, allowing the logs to be transformed and replicated to Amazon S3.
6. The destination of the Kinesis Data Firehose delivery stream is the `aws-accelerator-central-logs` Amazon S3 bucket. This bucket is encrypted at rest with the central logging AWS KMS key. In addition, the `aws-accelerator-s3-access-logs` and `aws-accelerator-elb-access-logs` buckets are encrypted at rest with Amazon S3-managed server-side encryption (SSE-S3) because these services don't support customer-managed AWS KMS keys. Logs delivered to the `aws-accelerator-elb-access-logs` bucket replicate to the central logs bucket with Amazon S3 replication.

## 5.7. SecurityHub

The primary dashboard for Operators to assess the security posture of the AWS footprint is the centralized AWS Security Hub service and is [enabled by best practices](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/security-config.yaml#L43). Security Hub needs to be configured to aggregate findings from Amazon GuardDuty, Amazon Macie, AWS Config, Systems Manager, Firewall Manager, Amazon Detective, Amazon Inspector and IAM Access Analyzers. Events from security integrations are correlated and displayed on the Security Hub dashboard as ‘findings’ with a severity level (informational, low, medium, high, critical).

## 5.8. Systems Manager Session Manager and Fleet Manager

Session Manager is a fully managed AWS Systems Manager capability that lets you manage your Amazon Elastic Compute Cloud (Amazon EC2) instances, on-premises instances, and virtual machines (VMs) through an interactive one-click browser-based shell, through the AWS Command Line Interface (AWS CLI), or using a native RDP or SSH client. Session Manager provides secure and auditable instance management without the need to open inbound ports, maintain bastion hosts, or manage SSH keys. Session Manager also makes it easy to comply with corporate policies that require controlled access to instances, strict security practices, and fully auditable logs with instance access details, while still providing end users with simple one-click cross-platform access to your managed instances.[1](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)

With Session Manager customers can gain quick access to Windows and Linux instances through the AWS console, or using their preferred clients. System Manager Fleet Manager additionally allows connecting graphically to Windows desktops directly from the AWS console without the need for any command line access or tools, and without any requirement for an RDSH/RDP client.

The LZA stores encrypted session log data in the centralized S3 bucket for auditing purposes, this is [enabled by best practices](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/899cb4fb82efefd775e3c481b4dc0207121f8d0d/reference/sample-configurations/aws-best-practices/global-config.yaml#L50); optionally logging can be enabled to CloudWatch Logs.

## 5.10. Other Services

The following additional services are configured with their organization-wide administrative and visibility capabilities centralized to the Security account: Macie, Audit Manager, Access Analyzer. The following additional logging and reporting services are configured: CloudWatch Alarms, Cost and Usage Reports, ELB.

# 6. Networking

## 6.1. Overview

### TBC

# 7. LZA Sample Architecture

## 7.1 Networking best practice

The `network-config.yaml` best practices configuration is intended to set up various centralized networking constructs that you can use to customize and build additional infrastructure. Specific IP address ranges; [AWS Transit Gateway](http://aws.amazon.com/transit-gateway) routing configurations; and advanced capabilities such as [Amazon Route 53](http://aws.amazon.com/route53/) Resolver, Amazon VPC IP Address Manager, and [AWS Network Firewall](http://aws.amazon.com/network-firewall/) likely require additional customization. The solution doesn't deploy these configuration items as default. As a resource, we provide examples of these configuration items as comments in the best practices configurations files so that you can customize to suit your organization’s needs.
[Image: Image.jpg]

1. This solution offers optional hybrid connectivity with [AWS Direct Connect](http://aws.amazon.com/directconnect/) to an on-premises data center. AWS Site-to-Site VPN (not depicted) is another option for hybrid connectivity. You can choose to deploy this infrastructure for hybrid connectivity to your AWS environment. The Direct Connect Gateway (or AWS VPN connection) is associated with a central AWS Transit Gateway, which allows communication between your on-premises network and cloud network.
2. The **Inspection VPC** provides a central point for deep packet inspection. Optionally, you can use this VPC to centrally manage Network Firewall or third-party intrusion detection system/intrusion prevention system(IDS/IPS) appliances. You can also use a [Gateway Load Balancer](http://aws.amazon.com/elasticloadbalancing/gateway-load-balancer/) for scalability and high availability of your third-party appliances. The Gateway Load Balancer isn't required for AWS Network Firewall deployments.
   1. We designed the **Inspection VPC** generically, and you might require additional configuration if using third-party appliances. For example, a best practice when using Gateway Load Balancer is to separate the load balancer subnet and endpoint subnet so that you can manage network access control lists (ACLs) independently from one another. For similar reasons, you might also want to separate your appliances’ management and data network interfaces into separate subnets.
      For more information on centralized inspection patterns, see the AWS Whitepaper [Building a Scalable and Secure Multi-VPC AWS Network Infrastructure](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/welcome.html).
3. When you design VPC endpoints in a centralized pattern, you can access multiple VPC endpoints in your environment from a central **Endpoints VPC**. This can help you save on your cost and management overhead of deploying interface endpoints to multiple workload VPCs. This solution deploys constructs for managing the centralization of these endpoints and their dependencies (for example, Route 53 private hosted zones). We provide more information about this pattern in [Centralized access to VPC private endpoints](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html).
   1. Centralized endpoints aren't available in the GovCloud (US) Regions.
4. A central Transit Gateway provides a virtual router that allows you to attach multiple Amazon VPCs and hybrid network connections in a single place. You can use this in combination with routing patterns through Transit Gateway route tables to achieve network isolation, centralized inspection, and other strategies required for your compliance needs.
5. Optionally, you can use [AWS Resource Access Manager](http://aws.amazon.com/ram/)(AWS RAM) to share networking resources to other core and workload OUs or accounts. For example, you can share Network Firewall policies created in the **Network** account with workload accounts that require fine-grained network access control and deep packet inspection within application VPCs.
6. The **Shared Services** account and VPC provide commonly used patterns for organizations that have resources other than core network infrastructure that the organization needs to be share. Some examples include [AWS Directory Service for Microsoft Active Directory](http://aws.amazon.com/directoryservice/)(AWS Managed Microsoft AD), agile collaboration applications, and package or container repositories.
7. An optional **External Access** VPC for shared applications, remote access (RDP/SSH) bastion hosts, or other resources that require public internet access is not included in the best practices configuration and is depicted for illustration purposes only.
8. Additional workload accounts can have application VPCs and Transit Gateway attachments deployed when provisioned by the solution. Deployment of network infrastructure in these workload accounts is dependent on your input to the`network-config.yaml` file.

# 8. [Pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deployment-pipelines.html)

The AWS CloudFormation template deploys two AWS CodePipeline pipelines, an installer and the core deployment pipeline, along with associated dependencies. This solution uses AWS CodeBuild to build and deploy a series of CDK-based CloudFormation stacks that are responsible for deploying supported resources in the multi-account, multi-Region environment.

## Installer (`AWSAccelerator-InstallerStack`)

This CloudFormation template deploys the following resources:

- A CodePipeline (`AWSAccelerator-Installer`) that's used to orchestrate the build and deployment of the `AWSAccelerator-PipelineStack` AWS CloudFormation template.
- An AWS CodeBuild project is used as an orchestration engine within the pipeline to build the Landing Zone Accelerator on AWS source code and then synthesize and deploy the `AWSAccelerator-PipelineStack`CloudFormation template.
- An Amazon S3 bucket that's used for pipeline artifact storage.
- An AWS KMS key that's used to activate encryption at-rest for applicable resources deployed in `AWSAccelerator-InstallerStack` and `AWSAccelerator-PipelineStack`.
- Supporting [AWS Identity and Access Management (IAM)](http://aws.amazon.com/iam/) roles for CodePipeline and CodeBuild to perform their actions.

## Core (`AWSAccelerator-PipelineStack`)

This AWS CloudFormation stack is deployed by the AWS CDK with the following resources:

- A CodePipeline (`AWSAccelerator-Pipeline`) that's used for input validation, synthesis, and deployment of additional CloudFormation stacks by using the AWS CDK. The pipeline contains several stages that are discussed in [Architecture details](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-details.html).
- Two CodeBuild projects. The projects are used in the pipeline stages to:
  - Build the Landing Zone Accelerator on AWS source code.
  - Run AWS CDK toolkit commands across the pipeline stages.
- An AWS CodeCommit repository (`aws-accelerator-config`) that's used to store the configuration files that are used by the `AWSAccelerator-Pipeline`. These configuration files are your primary mechanism for configuration and management of the entire Landing Zone Accelerator on AWS solution.
- Two Amazon SNS topics are created and can be optionally subscribed to for AWS CodePipeline run notifications. No topic subscriptions are created by default. One Amazon SNS will notifies for all pipeline run events. The other notifies only on pipeline failure events.
- An optional third SNS topic is created if the **EnableApprovalStage** is set to `Yes` in **AWSAccelerator-InstallerStack**. Email address(es) listed in the **ApprovalStageNotifyEmailList** will be automatically subscribed to this topic.
- An AWS IAM service-linked role is created to allow [AWS CodeStar](http://aws.amazon.com/codestar/)
- notifications to publish AWS CodePipeline pipeline run events to the Amazon SNS topics.
- A CloudWatch alarm is created to alarm on pipeline processing failures.
- An Amazon S3 bucket that's used for pipeline artifact storage.

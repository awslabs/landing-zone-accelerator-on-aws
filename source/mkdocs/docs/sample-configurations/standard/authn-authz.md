# Authentication and Authorization

## Overview

The Landing Zone Accelerator makes extensive use of AWS authorization and authentication primitives from the Identity and Access Management (IAM) service as a means to enforce the guardrail objectives of the Landing Zone Accelerator and govern access to the set of accounts that makes up the organization.

## Relationship to the Management (root) AWS Account

By default, AWS accounts are entirely self-contained with respect to IAM principals - their Users, Roles, Groups are independent and scoped only to themselves. Accounts created by AWS Organizations deploy a default role with a trust policy back to the Organization Management account. While it can be customized, by default this role is named the `AWSControlTowerExecution` (or `OrganizationAccountAccessRole` when AWS Organizations is used without Control Tower).

### AWS IAM Identity Center (successor to AWS Single Sign-On)

The vast majority of end-users of the AWS cloud within the organization will never use or interact with the Management account or the root users of any child account in the organization.

[AWS IAM Identity Center](https://aws.amazon.com/iam/identity-center/) (AWS IIC) resides in the Organization Management account. Once deployed from the Organization Management account, it is recommended that AWS IIC administration is [delegated to the Shared Services account](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/dedicated-accounts.html). AWS IIC lets you create user, group, and role-based identities directly using a default local identity provider (IdP). Alternatively, if your organization has an existing IdP such as Microsoft Active Directory or Okta Universal Directory, it is recommended to [set up federation](https://docs.aws.amazon.com/whitepapers/latest/establishing-your-cloud-foundation-on-aws/federated-access.html) with that identity provider. This allows you take advantage of your existing identity and access management processes for identities accessing your AWS environment.

## Break Glass Accounts

The Management account is used to provide [break glass access](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/break-glass-access.html) to AWS accounts within the organization. The details of the break glass usernames can be found within [iam-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/iam-config.yaml). The password details can be found in the Management account AWS Secrets Manager in the region LZA was deployed to. After the deployment of the sample configuration files is complete, multi-factor authentication (MFA) should be enabled on these accounts (please see the next section for more details).

## Multi-Factor Authentication (MFA)

MFA should be used by all users regardless of privilege level with some [general guidelines](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/acct-05.html). A number of commonly popular MFA mechanisms [are supported by AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html) to help customers enable MFA on their accounts.

## Root Authorization

Every AWS account has a set of root user credentials. These root credentials are generated on account creation with a random 64-character password. It is important that the root credentials for each account are recovered and MFA enabled using the AWS root credential password reset process for the account’s unique email address.

Root credentials authorize all actions for all AWS services and for all resources in the account (except anything denied by service control policies (SCPs)). There are some actions which only root has the capability to perform which are documented within the [AWS documentation](https://docs.aws.amazon.com/general/latest/gr/aws_tasks-that-require-root.html). These are typically rare operations (e.g. creation of X.509 keys), and should not be required in the normal course of business. Root credentials should be handled with extreme diligence and have MFA enabled per the guidance in the previous section.

## Service Control Policies (SCPs)

Service Control Policies are a key preventative control used by the LZA. It is crucial to note that SCPs, by themselves, never _grant_ permissions. They are most often used to `Deny` certain actions at an OU or account level within an AWS Organization. Since `Deny` always overrides `Allow` in the IAM policy evaluation logic, SCPs can have a powerful effect on all principals in any account, and can deny entire categories of actions irrespective of the permission policy attached to the principal itself - even the root user of the account.

SCPs follow an inheritance pattern from all levels of the hierarchy down to the account of the organization:

![SCP Inheritance](./images/scp_inheritance.jpg "SCP Inheritance")

In order for any principal to be able to perform an action A, it is necessary (but not sufficient) that there is an `Allow` on action A from all levels of the hierarchy down to the account, and no explicit `Deny` anywhere. This is discussed in further detail in [How SCPs Work](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps-about.html).

The LZA leverages the following SCPs in the organization:

### Guardrails 1 and 2

These guardrails apply across the organization and protect the resources deployed by the automation tooling. Note that this policy is split into two parts due to a current quota of SCP document sizing, but logically it should be considered a single policy: [part 1](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/service-control-policies/guardrails-1.json) and [part 2](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/service-control-policies/guardrails-2.json).

| Policy Statement ID (SID)              | Description                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CloudFormationStatement                | Prevents deletion of any CloudFormation stacks deployed by the automation tooling                           |
| ---                                    | ---                                                                                                         |
| IamRolesStatement                      | Prevents any IAM operation on protected IAM resources                                                       |
| PreventSSMModification                 | Prevents deletion of any SSM Parameter deployed by the automation tooling                                   |
| PreventCloudWatchLogsModification      | Prevents the deletion and modification of any CloudWatch Log groups                                         |
| PreventCloudWatchLogStreamModification | Prevents deletion of CloudWatch Log Streams                                                                 |
| LambdaStatement                        | Prevents the creation, deletion and modification of any Lambda functions deployed by the automation tooling |
| PreventCloudTrailModification          | Prevents deletion and modification of protected Cloud Trails                                                |
| ConfigRulesStatement                   | Protects AWS Config configuration from modification or deletion                                             |
| IamSettingsStatement                   | Protects creation, deletion, and modification of protected IAM policies                                     |
| GDSecHubServicesStatement              | Prevents the deletion and modification to AWS security services GuardDuty, Security Hub                     |
| SnsStatement                           | Prevents creation, deletion and modification of a protected SNS topics                                      |
| EbsEncryptionStatement                 | Prevents disabling of EBS Encryption                                                                        |
| MacieServiceStatement                  | Prevents the deletion and modification to AWS security services Macie                                       |

### Quarantine

[The quarantine policy](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/service-control-policies/quarantine.json) is attached to an account to ‘quarantine’ it - to prevent any AWS operation from taking place. This is useful in the case of an account with credentials which are believed to have been compromised. This policy is also applied to new accounts upon creation. After the installation of guardrails by LZA, it is removed. In the meantime, it prevents all AWS control plane operations except by principals required to deploy guardrails.

| Policy Statement ID (SID)               | Description                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| DenyAllAWSServicesExceptBreakglassRoles | Blanket denial on all AWS control plane operations for all non-breakglass roles |

### SCP Protection

SCPs are protected from changes by enabling the **scpRevertChangesConfig** key in the [security-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/security-config.yaml) configuration file. [This configuration property](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.ScpRevertChangesConfig.html) will monitor for manual changes to SCPs and revert them. This is enabled by default in the sample configuration.
# Education Landing Zone Accelerator

## Overview

**The Landing Zone Accelerator (LZA)** for Education is an industry specific deployment of the [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) solution architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. Built on top of the standard AWS Control Tower accounts, namely `Management`, `Audit`, and `LogArchive`, the LZA for Education deploys additional resources that helps establish platform readiness with security, compliance, and operational capabilities. It is important to note that the Landing Zone Accelerator solution will not, by itself, make you compliant. It provides the foundational infrastructure from which additional complementary solutions can be integrated. You must review, evaluate, assess, and approve the solution in compliance with your organization’s particular security features, tools, and configurations.

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
* Copy the contents from the `aws-best-practices-education` folder under `reference/sample-configurations` to your local `aws-accelerator-config` repo.  You may be prompted to over-write duplicate configs, such as `accounts-config.yaml`.

Step 4. Update the configuration files and release a change.

* Using the IDE of your choice.  Update the `homeRegion` variable at the top of each config to match the region you deployed the solution to.
* Update the configuration files to match the desired state of your environment. Look for the `UPDATE` comments for areas requiring updates, such as e-mail addresses in your `accounts-config.yaml`
* Review the contents in the `Security Controls` section below to understand included controls specific to Education customers, and if any changes need to be made to meet organizational requirements.
* Commit and push all your change to the `aws-accelerator-config` AWS CodeCommit repository.
* Release a change manually to the AWSAccelerator-Pipeline pipeline.

## Security Frameworks

The education industry is highly regulated. The LZA for Education provides additional guardrails to help mitigate against the threats faced by education customers. The LZA for Education is not meant to be feature complete for fully compliant, but rather is intended to help accelerate cloud migrations and cloud refactoring efforts by organizations serving the education industry. While much effort has been made to reduce the effort required to manually build a production-ready infrastructure, you will still need to tailor it to your unique business needs.

This solution includes controls from frameworks in various geographies, including `NIST 800-53`, `NIST 800-171`, `ITAR`, `ACSC Essential 8`, `ACSC ISM`, and `CMMC`. If you are deploying the Landing Zone Accelerator on AWS for Education solution, please consult with your AWS team to understand controls to meet your requirements.

>**Note**: Some compliance requirements may need to be met using AWS GovCloud Regions, such as ITAR.

## Organizational Structure

Education LZA accounts are generated and organized as follows:

![Education LZA Org Structure](./images/LZA_Organizational_Structure.png)

In the Education LZA Organization Structure, the Education Organization Unit(OU) represents the logical construct where workloads for the institution will reside. It contains accounts for various workloads such as Sofwatre Information System (SIS) and Learning Management System (LMS). This OU structure is provided to you. However, you are free to change the organizational structure, organizational units (OUs), and accounts to meet your specific needs. For additional information about how to best organize your AWS OU and account structure, please reference the recommended OUs and accounts in the [For further consideration](#for-further-consideration) section below as you begin to experiment with the LZA for Education.

> **Compliance Use Case:** The Education OU can be used for compliance needs such as 800-171/800-53/CMMC.

## Architecture Diagrams
AWS LZA for Education Organizational Structure

By default, the LZA for Education builds the above organizational structure, with the exception of the `Management` and `Security` OU, which are predefined by you prior to launching the LZA. The below architecture diagram highlights the key deployments:

* **A Education OU**
    * Contains development and production accounts for both `LMS` and `SIS` workloads
    * Refer to the network-config.yaml file for examples to customize your VPCs and networks.
    * No VPCs are configured in this OU by default; you will need to define them based on your requirements.


* **An Infrastructure OU**
    * Contains one `Network` and one `SharedServices` Account
    * The `Network` account also contains a Transit Gateway for infrastructure routing

Below is a reference architecture diagram from the LZA [Architecture overview] documentation which discusses organizational account structure best practices:


![Education LZA Architecture Diagram](./images/LZA_Education_Architecture.png)

The accounts in the `Education` OU represent a standard infrastructure for development or production deployment of your workloads.  The Infrastructure OU provides the following specialized functions:

* The Network account provides an AWS Transit Gateway for routing traffic between accounts and, potentially, to and from the Internet.  It also includes a Network Inspection VPC for permiter defenses, such as firewalls or third-party IPS/IDS solutions.
* The Shared Services account is intended to house centrally-shared services that are accessible to all of the accounts in your infrastructure.  For example, you might deploy an Internet Gateway here for external access, or a central directory service such as LDAP or Active Directory.

Please additionally review the `network-config.yaml`. It contains several commented-out examples which you may wish to customize to meet your orgnization's requirements.

## Security Controls
Security controls are set in place as protection against human error and safe guards from inadvertent actions within the AWS environment. These controls take the form of AWS Config rules and Service Control Policies (SCPs). The file `organization-config.yaml` provides detailed information surrounding the declaration of SCPs, Tagging Policies, and Backup Policies. SCPs can be as general or as specific as needed. Each SCP workload is able to be customized to meet organization requirements. Below are sample policies provided for a few specific use cases:

* **Service Control Policies**: Service control policies have been provided in `service-control-policies/guardrails-1.json` and `service-control-policies/guardrails-2.json`, that prevent changes to and deletion of policies which control IAM policy creation, Lambda permissions, mapping, CloudWatch Logs retention policy and KMS key disassociation to name a few. These services and their correct configuration are vital for OUs such as that of the Department Information System, where user access and IAM policies have strict requirements. LZA for Education also includes two additional SCP, `service-control-policies/education-scp.json` and `service-control-policies/education-scp-2.json` that accounts for additional guardrails relevant to many Education customers. `service-control-policies/education-scp-2.json` is disabled by default. Details on these controls can be viewed in [Appendix A](#appendix-a-education-personalized-controls).
* **Tagging Policies**: A sample tagging policy has been provided in `tagging-policies/org-tag-policy.json` showing how you can further extend these policies to define `Environment Type` for `Prod`, `QA`, `Dev` workloads, and `Data Classification` to track sensitive and non-sensitive workloads, as well as how to enforce them to specific AWS services. The sample policy can be edited to reflect your organizations departments and their unique needs, such that resources provisioned by the LZA are automatically tagged in accordance with your business requirements.
* **Backup Policies**: A sample backup policy has been provided in `backup-policies/org-backup-plan.json` as an example for how backups can be scheduled along with lifecycle and retention management settings. This policy can directly enable OUs, such as those responsible for Student Financial Aid and that of the Bursar, to specify data retention policies and the frequency of backups, in order to comply with **Federal Student Aid (FSA)** third party auditing requirements, for example.

The `security-config.yaml` file can be used to configure AWS services such as AWS Config, AWS Security Hub, and to enable storage encryption. Additional alarms and metrics have been provided to inform you of actions within your AWS Cloud environment. For a list of all of the services and settings that can be configured, see the [references](#references) section below. For a list of included controls for Education customers, review [Appendix A](#appendix-a-education-personalized-controls).  

The `global-config.yaml` file contains settings that enable regions, centralized logging using AWS CloudTrail and Amazon CloudWatch Logs and the retention period for those logs to help you meet your monitoring needs.
 
You are encouraged to review these settings to better understand what has already been configured and what needs to be altered for your specific requirements.

## For further consideration

This is a baseline for Education Landing Zone Accelerate consisting of best practices. It is a *starting point* for you to use, as you align your organization objectives and tailor to your specific business requirements. AWS provides resources for you to consult with, as you begin customizing your deployment of Education LZA: 


1. This set of configuration files was tested with AWS Control Tower versions 3.0. AWS Control Tower 3.0 supports the use of an AWS CloudTrail Organization Trail. The global-config.yaml file shows organizationTail set to false because it is enabled through the AWS Control Tower setup.
1. Refer to the [Best Practices](https://aws.amazon.com/blogs/mt/best-practices-for-organizational-units-with-aws-organizations/) for Organizational Units with AWS Organizations blog post for an overview.
1. Review [AWS Organizations in AWS GovCloud](https://aws.amazon.com/blogs/security/aws-organizations-available-govcloud-regions-central-governance-management-accounts/) blog for guidance on central governance and management of AWS accounts in GovCloud.
1. LZA on AWS is architected to support and accelerate DoD [CMMC ](https://aws.amazon.com/compliance/cmmc/)(Cybersecurity Maturity Model Certification) readiness.
1. [Recommended OUs and accounts](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/recommended-ous-and-accounts.html). This section of the `Organizing your AWS Environment Using Multiple` Accounts Whitepaper discusses the deployment of specific-purpose OUs in addition to the foundational ones established by the LZA. For example, you may wish to establish a `Sandbox` OU for experimentation, a `Policy Staging` OU to safely test policy changes before deploying them more broadly, or a `Suspended` OU to hold, constrain, and eventually retire accounts that you no longer need.
1. [AWS Security Reference Architecture (SRA) ](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html). The SRA "is a holistic set of guidelines for deploying the full complement of AWS security services in a multi-account environment." This document helps you to explore the "big picture" of AWS security and security-related services in order to determine the architectures most suited to your organization's unique security requirements.
1. Transit Gateway Flow logs are not enabled by default, you will need to work with AWS teams to determine if enabling TGW Flow logs helps you to meet your regulatory and organizational requirements.


## References
* LZA on AWS [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/landing-zone-accelerator-on-aws.pdf). This is the official documentation of the Landing Zone Accelerator Project and serves as your starting point. Use the instructions in the implementation guide to stand up your environment and then return to this project for Education-specific customization.
* AWS Labs [LZA Accelerator](https://github.com/awslabs/landing-zone-accelerator-on-aws) GitHub Repository. This is the official codebase of the Landing Zone Accelerator Project. 


## Appendix A: Education Personalized Controls

* #### This table provides a list of additional security controls included in LZA for Education, in addition to Best-Practices. Controls can be removed, if not pertinent to your use-case.
> **_Note_:** Additional security controls are in development. Please open a [GitHub feature request or bug report ](https://github.com/awslabs/landing-zone-accelerator-on-aws/issues/new/choose) to request a new control or report issues.

| Control Description | Control Service | Service Detail | Reference File |
| --------------------|--------------|----------------|----------------------|
| Block ElastiCache Unencrypted At-Rest | AWS Organizations SCP | ElastiCacheRedisEncryptionAtRest | service-control-policies/education-scp.json |
| Block ElastiCache Unencrypted In-Transit | AWS Organizations SCP | ElastiCacheRedisEncryptionInTransit | service-control-policies/education-scp.json |
| ElastiCache Redis command AUTH required | AWS Organizations SCP | ElasticacheRedisAUTHEnabled | service-control-policies/education-scp.json |
| Deny ElastiCache Memcached (No At-Rest Encryption) | AWS Organizations SCP | MemcachedBlockNoAtRestEncryption | service-control-policies/education-scp.json |
| Regionally Block Bucket Creation (Disabled by Default) | AWS Organizations SCP | BlockS3BucketRegions | service-control-policies/education-scp-2.json |
| Block RDS SQL Express Edition (No At-Rest Encryption) |  AWS Organizations SCP | BlockRDSMsSQLExpressNoEncryption | service-control-policies/education-scp.json |  
| Detect SSM Parameters Not Encrypted | AWS Config Custom Rule | accelerator-ssm-unencrypted-parameter | security-config.yaml |
| Detect RDS MySQL/MariaDB Instances Not Enforcing In-transit Encryption | AWS Config Custom Rule | accelerator-rds-mysql-mariadb-unencrypted-transport | security-config.yaml |
| Detect RDS MSSQL/PostgreSQL Instances Not Enforcing In-transit Encryption | AWS Config Custom Rule | accelerator-rds-mssql-postgres-unencrypted-transport | security-config.yaml |
| Detect RDS Oracle Instances Not Enforcing In-transit Encryption | AWS Config Custom Rule | accelerator-rds-oracle-unencrypted-transport | security-config.yaml |
| Detect WorkDocs User Domains Not Allowed | AWS Config Custom Rule | accelerator-workdocs-user-domain-detector | security-config.yaml |
| Detect Cognito User Pools With Weak Password Policy | AWS Config Custom Rule | accelerator-cognito-password-complexity | security-config.yaml |
| Detect EMR Clusters Not Enforcing In-transit Encryption | AWS Config Custom Rule | accelerator-emr-cluster-unencrypted-transport | security-config.yaml |
| Detect Security Groups Not Restricting Ingress Traffic | AWS Config Managed Rule | accelerator-restricted-common-ports | security-config.yaml |
| Detect AWS Backup Plan Not Meeting Required Frequency and Retention | AWS Config Managed Rule | accelerator-backup-plan-min-frequency-and-min-retention-check | security-config.yaml |
| Detect AWS Backup Recovery Point Not Encrypted | AWS Config Managed Rule | accelerator-backup-recovery-point-encrypted | security-config.yaml |
| Detect AWS Backup Recovery Point Retention Less Than Required | AWS Config Managed Rule | accelerator-backup-recovery-point-minimum-retention-check | security-config.yaml |
| Detect AWS Backup Vault Allowing Manual Recovery Point Deletion | AWS Config Managed Rule | accelerator-backup-recovery-point-manual-deletion-disabled | security-config.yaml |
| Detects Running EC2 Instances Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-ec2-resources-protected-by-backup-plan | security-config.yaml |
| Detects RDS Aurora DB Cluster Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-aurora-resources-protected-by-backup-plan | security-config.yaml |
| Detects RDS DB Instances Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-rds-resources-protected-by-backup-plan | security-config.yaml |
| Detects Amazon DynamoDB Tables Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-dynamodb-resources-protected-by-backup-plan | security-config.yaml |
| Detects Amazon EFS File Systems Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-efs-resources-protected-by-backup-plan | security-config.yaml |
| Detects Amazon FSx File Systems Not Protected by AWS Backup Plan | AWS Config Managed Rule | accelerator-fsx-resources-protected-by-backup-plan | security-config.yaml |

* #### This table details the intent of the above additional controls with references.

| Control | Reference | Intent |
|-------------|--------|-----------|
| ElastiCacheEncryptionAtRest | [At-Rest Encryption in ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/at-rest-encryption.html) | Ensure increased data security protection by encrypting on-disk data.|
| ElastiCacheEncryptionInTransit | [ElastiCache in-transit Encrpytion](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/in-transit-encryption.html) | Ensure increased data security protection by encrypting data in-transit.|
| ElasticacheRedisAUTHEnabled | [Redis AUTH command](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/auth.html) | Redis authentication tokens enable Redis to require password before allowing command execution, thereby improving data security. |
| MemcachedBlockNoAtRestEncryption | [At-Rest Encryption in ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/at-rest-encryption.html) | Elasticache Memcached does not support encryption at-rest. |
| BlockS3BucketRegions | [AWS Data Residency](https://d1.awsstatic.com/whitepapers/compliance/Data_Residency_Whitepaper.pdf) | Help meet data residency requirements by blocking s3 buckets in specific regions. |
| BlockRDSMsSQLExpressNoEncryption | [Availability of Amazon RDS Encryption](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html#Overview.Encryption.Availability) | Amazon RDS encryption is currently available for all database engines and storage types, except for SQL Server Express Edition. |
| accelerator-ssm-unencrypted-parameter | [What is a Parameter?](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html#what-is-a-parameter) | Don't store sensitive data in a String or StringList parameter. |
| accelerator-rds-mysql-mariadb-unencrypted-transport | [Require SSL/TLS for RDS MySQL/MariaDB Connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/mysql-ssl-connections.html#mysql-ssl-connections.require-ssl) | Secure database network connections between client and server. |
| accelerator-rds-mssql-postgres-unencrypted-transport | [SSL With MS SQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/SQLServer.Concepts.General.SSL.Using.html) | Secure database network connections between client and server. |
| accelerator-rds-oracle-unencrypted-transport | [RDS Oracle Encryption Options](https://aws.amazon.com/blogs/apn/oracle-database-encryption-options-on-amazon-rds/) | Secure database network connections between client and server. |
| accelerator-workdocs-user-domain-detector | [Manage WorkDocs Sites](https://docs.aws.amazon.com/workdocs/latest/adminguide/manage-sites.html#invitation-settings) | Monitor user invites outside allowed domain. |
| accelerator-cognito-password-complexity | [Adding User Pool Password Requirements](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-policies.html) | Enforce strong passwords for your app users. |
| accelerator-emr-cluster-unencrypted-transport | [EMR Encryption Options](https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-data-encryption-options.html) | Utilize in-transit encryption with EMR. |
| accelerator-restricted-common-ports | [Control Traffic to Resources](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html) | Use least-permissive security groups to control traffic to resources. |
| accelerator-backup-plan-min-frequency-and-min-retention-check | [Managing Backups Using Backup Plans](https://docs.aws.amazon.com/aws-backup/latest/devguide/about-backup-plans.html) | Ensure AWS Backup Plans meet organizational requirements. |
| accelerator-backup-recovery-point-encrypted | [Working with Backups](https://docs.aws.amazon.com/aws-backup/latest/devguide/recovery-points.html) | Ensure AWS Backup recovery points meet encryption requirements. |
| accelerator-backup-recovery-point-minimum-retention-check | [Minimum Retention for Recovery Point](https://docs.aws.amazon.com/aws-backup/latest/devguide/controls-and-remediation.html#backup-recovery-point-minimum-retention) | Ensure AWS Backup recovery points meet retention requirements. |
| accelerator-backup-recovery-point-manual-deletion-disabled | [Vaults Prevent Manual Deletion](https://docs.aws.amazon.com/aws-backup/latest/devguide/controls-and-remediation.html#backup-prevent-recovery-point-manual-deletion) | Ensure AWS Backup Vaults prevent manual deletion of backups. |
| accelerator-ec2-resources-protected-by-backup-plan | [EC2 Backup Plan](https://docs.aws.amazon.com/config/latest/developerguide/ec2-resources-protected-by-backup-plan.html) | Ensure running EC2 resources are backed up and meet requirements. |
| accelerator-aurora-resources-protected-by-backup-plan | [Using AWS Backup with RDS Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Managing.Backups.html) | Ensure RDS Aurora resources have backups that meet requirements. |
| accelerator-rds-resources-protected-by-backup-plan | [Using AWS Backup with RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html#AutomatedBackups.AWSBackup) | Ensure RDS resources have backups that meet requirements. |
| accelerator-dynamodb-resources-protected-by-backup-plan | [Using AWS Backup with DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/backuprestore_HowItWorksAWS.html) | Ensure DynamoDB Tables have backups that meet requirements. |
| accelerator-efs-resources-protected-by-backup-plan | [Using AWS Backup with EFS](https://docs.aws.amazon.com/efs/latest/ug/awsbackup.html) | Ensure EFS File Systems have backups that meet requirements. |
| accelerator-fsx-resources-protected-by-backup-plan | [Using AWS Backup with FSx](https://docs.aws.amazon.com/fsx/latest/WindowsGuide/using-backups.html) | Ensure FSx File Systems have backups that meet requirements. |

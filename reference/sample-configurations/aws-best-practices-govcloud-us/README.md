# Landing Zone Accelerator on AWS for United States (US) Federal and Department of Defense (DoD)

## Overview

This config is an industry specific deployment of the [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) solution. This solution helps automate the setup of a cloud environment and establishes platform readiness with security, compliance, and operational capabilities in AWS GovCloud (US).

The solution is architected to follow the Federal Risk and Authorization Management Program (FedRAMP), National Institute of Standards and Technology (NIST) 800-53(5), NIST 800-171 Rev.2, and Cybersecurity Maturity Model Certification (CMMC) Level 2 compliance framework control requirements. Through the use of LZA, preventative and detective guardrails are applied to vended accounts that helps customers to align their cloud-based workloads with their compliance requirements.

The LZA is not meant to be feature complete for full compliance, but rather is intended to help accelerate new cloud deployments, cloud migrations, and cloud refactoring efforts. The LZA reduces the effort required to manually build a production-ready infrastructure.  It is important to note that the LZA solution will not, by itself, make you compliant. It provides the foundational infrastructure from which additional complementary solutions can be integrated, but you will still need to tailor it to your unique business needs. 


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

The LZA provides the capability to easily enable additional security services.  Detective guardrails are established through the use of Security Hub and Config, which deploy managed Config rules.  These rules evaluate whether the configuration settings of your AWS resources comply with common best practices.  By default the config rules are aligned to be deployed to both GovCloud East/West.  Some services are currently only available in GovCloud West and the config rules that align with those services have been commented out.  If you are only deploying to this region it is recomended to uncomment the rules so they are deployed.

A sample mapping between FedRAMP control requirements and AWS managed Config rules is provided within Appendix A: AWS Config Rule to Control ID Mapping.  It is based on the available managed Config rules within GovCloud West at the time of publication.  Many compliance frameworks are similar and have overlapping requirements.  Often times, the same managed Config rules can be categorically applied to other compliance frameworks, such as CMMC.

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

## Appendix A: AWS Config Rule to Control Category Mapping

This following table provides a sample mapping between FedRAMP control categories and AWS managed Config rules. Each Config rule applies to a specific AWS resource and relates to one or more FedRAMP controls. A FedRAMP control can also be related to multiple Config rules.


| Control Description | Control ID | AWS Config                       |
| ---          | ---   | ---                                          |
| Access Control |  AC |   access-keys-rotated
|              |       |   acm-certificate-expiration-check           |
|              |       |   alb-http-to-https-redirection-check        |
|              |       |   api-gw-execution-logging-enabled           |
|              |       |   cloud-trail-cloud-watch-logs-enabled       |
|              |       |   cloudtrail-enabled                         |
|              |       |   cloudtrail-s3-dataevents-enabled           |
|              |       |   cloudwatch-alarm-action-check              |
|              |       |   codebuild-project-envvar-awscred-check     |
|              |       |   dms-replication-not-public                 |
|              |       |   ebs-snapshot-public-restorable-check       |
|              |       |   ec2-imdsv2-check                           |
|              |       |   ec2-instance-no-public-ip                  |
|              |       |   ec2-instances-in-vpc                       |
|              |       |   elasticsearch-in-vpc-only                  |
|              |       |   elb-acm-certificate-required               |
|              |       |   elb-tls-https-listeners-only               |
|              |       |   emr-master-no-public-ip                    |
|              |       |   guardduty-enabled-centralized              |
|              |       |   iam-customer-policy-blocked-kms-actions    |
|              |       |   iam-group-has-users-check                  |
|              |       |   iam-inline-policy-blocked-kms-actions      |
|              |       |   iam-no-inline-policy-check                 |
|              |       |   iam-password-policy                        |
|              |       |   iam-root-access-key-check                  |
|              |       |   iam-user-group-membership-check            |
|              |       |   iam-user-mfa-enabled                       |
|              |       |   iam-user-no-policies-check                 |
|              |       |   iam-user-unused-credentials-check          |
|              |       |   lambda-function-public-access-prohibited   |
|              |       |   lambda-inside-vpc                          |
|              |       |   mfa-enabled-for-iam-console-access         |
|              |       |   rds-instance-public-access-check           |
|              |       |   rds-logging-enabled                        |
|              |       |   rds-snapshots-public-prohibited            |
|              |       |   redshift-cluster-configuration-check       |
|              |       |   redshift-cluster-public-access-check       |
|              |       |   redshift-require-tls-ssl                   |
|              |       |   restricted-ssh                             |
|              |       |   s3-bucket-logging-enabled                  |
|              |       |   s3-bucket-public-read-prohibited           |
|              |       |   s3-bucket-public-write-prohibited          |
|              |       |   s3-bucket-ssl-requests-only                |
|              |       | sagemaker-notebook-no-direct-internet-access |
|              |       |   securityhub-enabled                        |
|              |       |   ssm-document-not-public                    |
|              |       |   vpc-default-security-group-closed          |
|              |       |   vpc-sg-open-only-to-authorized-ports       |
|              |       |   rds-deployed-in-vpc                        |
|              |       |   s3-account-level-public-access-blocks      |
|              |       |   account-part-of-organizations              |
|              |       |   s3-bucket-policy-grantee-check             |
|              |       |   eip-attached                               |
| Audit and Accountability | AU  |                                    | 
|              |       |   api-gw-execution-logging-enabled           |
|              |       |   cloud-trail-cloud-watch-logs-enabled       |
|              |       |   cloud-trail-encryption-enabled             |
|              |       |   cloud-trail-log-file-validation-enabled    |
|              |       |   cloudtrail-enabled                         |
|              |       |   cloudtrail-s3-dataevents-enabled           |
|              |       |   cloudwatch-alarm-action-check              |
|              |       |   cloudwatch-log-group-encrypted             |
|              |       |   cw-loggroup-retention-period-check         |
|              |       |   elb-logging-enabled                        |
|              |       |   guardduty-enabled-centralized              |
|              |       |   rds-logging-enabled                        |
|              |       |   redshift-cluster-configuration-check       |
|              |       |   s3-bucket-logging-enabled                  |
|              |       |   s3-bucket-replication-enabled              |
|              |       |   s3-bucket-versioning-enabled               |
|              |       |   securityhub-enabled                        |
|              |       |   vpc-flow-logs-enabled                      |
|              |       |   rds-pg-event-notifications-configured      |
|              |       |   rds-sg-event-notifications-configured      |
|              |       |   cloudtrail-security-trail-enabled          |
|              |       |   multi-region-cloud-trail-enabled           |
|              |       |   elasticsearch-audit-logging-enabled        |
|              |       |   redshift-cluster-audit-logging-enabled     |
|              |       |  rds-instance-event-notifications-configured |
|              |       |   rds-cluster-event-notifications-configured |
| Security Assessment and Authorization | CA    |                     |
|              |       |   autoscaling-group-elb-healthcheck-required |
|              |       |   cloudtrail-enabled                         |
|              |       |   cloudtrail-s3-dataevents-enabled           |
|              |       |   cloudwatch-alarm-action-check              |
|              |       |   ec2-instance-detailed-monitoring-enabled   |
|              |       |   guardduty-enabled-centralized              |
|              |       |   rds-enhanced-monitoring-enabled            |
|              |       |   redshift-cluster-configuration-check       |
|              |       |   securityhub-enabled                        |
| Contingency Planning | CP    |                                      |
|              |       |   db-instance-backup-enabled                 |
|              |       |   dynamodb-pitr-enabled                      |
|              |       |   elasticache-redis-cluster-automatic-backup-check |
|              |       |   elb-cross-zone-load-balancing-enabled      |
|              |       |   elb-deletion-protection-enabled            |
|              |       |   rds-multi-az-support                       |
|              |       |   redshift-backup-enabled                    |
|              |       |   s3-bucket-replication-enabled              |
|              |       |   s3-bucket-versioning-enabled               |
|              |       |   vpc-vpn-2-tunnels-up                       |
|              |       |   elasticsearch-data-node-fault-tolerance    |
|              |       |   elb-connection-draining-enabled            |
|              |       |   elasticsearch-primary-node-fault-tolerance |
| Identification and Authentication | IA    |                         |
|              |       |   codebuild-project-envvar-awscred-check     |
|              |       |   iam-password-policy                        |
|              |       |   iam-root-access-key-check                  |
|              |       |   iam-user-mfa-enabled                       |
|              |       |   mfa-enabled-for-iam-console-access         |
|              |       |   rds-instance-iam-authentication-enabled    |
|              |       |   iam-password-policy-recommended-defaults   |
| Incident Response | IR    |                                         |
|              |       |   autoscaling-group-elb-healthcheck-required |
|              |       |   cloudwatch-alarm-action-check              |
|              |       |   guardduty-enabled-centralized              |
|              |       |   guardduty-non-archived-findings            |
|              |       |   securityhub-enabled                        |
| Risk Assesment | RA   |                                             |
|              |       |   guardduty-enabled-centralized              |
|              |       |   guardduty-non-archived-findings            |
| System and Services Acquisition  | SA    |                          |
|              |       |   codebuild-project-envvar-awscred-check     |
|              |       |   codebuild-project-source-repo-url-check    |
|              |       |   guardduty-enabled-centralized              |
|              |       |   guardduty-non-archived-findings            |
|              |       |   securityhub-enabled                        |
| System and Communications Protection  | SC    |                     |
|              |       |   acm-certificate-expiration-check           |
|              |       |   alb-http-to-https-redirection-check        |
|              |       |   api-gw-cache-enabled-and-encrypted         |
|              |       |   autoscaling-group-elb-healthcheck-required |
|              |       |   cloud-trail-encryption-enabled             |
|              |       |   cloudwatch-log-group-encrypted             |
|              |       |   cmk-backing-key-rotation-enabled           |
|              |       |   dms-replication-not-public                 |
|              |       |   dynamodb-pitr-enabled                      |
|              |       |   ebs-snapshot-public-restorable-check       |
|              |       |   ec2-ebs-encryption-by-default              |
|              |       |   ec2-instance-no-public-ip                  |
|              |       |   ec2-instances-in-vpc                       |
|              |       |   ec2-volume-inuse-check                     |
|              |       |   efs-encrypted-check                        |
|              |       |   elasticache-redis-cluster-automatic-backup-check |
|              |       |   elasticsearch-encrypted-at-rest            |
|              |       |   elasticsearch-in-vpc-only                  |
|              |       |  elasticsearch-node-to-node-encryption-check |
|              |       |   elb-acm-certificate-required               |
|              |       |   elb-cross-zone-load-balancing-enabled      |
|              |       |   elb-deletion-protection-enabled            |
|              |       |   elb-tls-https-listeners-only               |
|              |       |   emr-master-no-public-ip                    |
|              |       |   encrypted-volumes                          |
|              |       |   guardduty-enabled-centralized              |
|              |       |   iam-group-has-users-check                  |
|              |       |   iam-no-inline-policy-check                 |
|              |       |   iam-user-group-membership-check            |
|              |       |   iam-user-no-policies-check                 |
|              |       |   kms-cmk-not-scheduled-for-deletion         |
|              |       |   lambda-function-public-access-prohibited   |
|              |       |   lambda-inside-vpc                          |
|              |       |   rds-instance-deletion-protection-enabled   |
|              |       |   rds-instance-public-access-check           |
|              |       |   rds-multi-az-support                       |
|              |       |   rds-snapshot-encrypted                     |
|              |       |   rds-snapshots-public-prohibited            |
|              |       |   rds-storage-encrypted                      |
|              |       |   redshift-cluster-configuration-check       |
|              |       |   redshift-cluster-public-access-check       |
|              |       |   redshift-require-tls-ssl                   |
|              |       |   restricted-ssh                             |
|              |       |   s3-bucket-default-lock-enabled             |
|              |       |   s3-bucket-public-read-prohibited           |
|              |       |   s3-bucket-public-write-prohibited          |
|              |       |   s3-bucket-replication-enabled              |
|              |       |   s3-bucket-server-side-encryption-enabled   |
|              |       |   s3-bucket-ssl-requests-only                |
|              |       |   s3-bucket-versioning-enabled               |
|              |       |   sagemaker-endpoint-configuration-kms-key-configured |
|              |       |   sagemaker-notebook-instance-kms-key-configured |
|              |       |   sagemaker-notebook-no-direct-internet-access |
|              |       |   sns-encrypted-kms                          |
|              |       |   ssm-document-not-public                    |
|              |       |   vpc-default-security-group-closed          |
|              |       |   vpc-sg-open-only-to-authorized-ports       |
|              |       |   vpc-vpn-2-tunnels-up                       |
|              |       |   api-gw-cache-encrypted                     |
|              |       |   secretsmanager-rotation-enabled-check      |
|              |       |   secretsmanager-scheduled-rotation-success-check |
|              |       |   sqs-queue-encrypted                        |
|              |       |   kms-cmk-not-scheduled-for-deletion-2       |
|              |       |   ecs-service-assign-public-ip-disabled      |
|              |       |   ec2-security-group-attached-to-eni         |
|              |       |   vpc-sg-restricted-common-ports             |
|              |       |   alb-http-drop-invalid-header-enabled       |
|              |       |   dynamodb-table-encrypted-kms               |
|              |       |   dynamodb-table-encryption-enabled          |
|              |       |   emr-kerberos-enabled                       |
|              |       |   elasticsearch-https-required               |
|              |       |   elb-predefined-security-policy-ssl-check   |
|              |       |   eks-secrets-encrypted                      |
| System and Information Integrity  | SI   |                          |
|              |       |   cloud-trail-cloud-watch-logs-enabled       |
|              |       |   cloud-trail-log-file-validation-enabled    |
|              |       |   cloudtrail-enabled                         |
|              |       |   cloudtrail-s3-dataevents-enabled           |
|              |       |   cloudwatch-alarm-action-check              |
|              |       |   cw-loggroup-retention-period-check         |
|              |       |   db-instance-backup-enabled                 |
|              |       |   dynamodb-pitr-enabled                      |
|              |       |   ec2-instance-detailed-monitoring-enabled   |
|              |       |   ec2-managedinstance-association-compliance-status-check |
|              |       |   ec2-managedinstance-patch-compliance-status-check |
|              |       |   elasticache-redis-cluster-automatic-backup-check |
|              |       |   guardduty-enabled-centralized              |
|              |       |   guardduty-non-archived-findings            |
|              |       |   redshift-backup-enabled                    |
|              |       |   redshift-cluster-configuration-check       |
|              |       |   s3-bucket-versioning-enabled               |
|              |       |   securityhub-enabled                        |
|              |       |   internet-gateway-authorized-vpc-only       |
|              |       |   rds-no-default-ports                       |
|              |       |   attach-ec2-instance-profile                |
|              |       |   redshift-cluster-maintenancesettings-check |
|              |       |   rds-cluster-copy-tags-to-snapshots-enabled |
|              |       |   ec2-instance-profile-permission            |
|              |       |   lambda-function-settings-check             |
|              |       |   s3-bucket-blacklisted-actions-prohibited   |
|              |       |  rds-instance-copy-tags-to-snapshots-enabled |
|              |       |   ec2-instance-managed-by-ssm                |
|              |       |   rds-cluster-deletion-protection-enabled    |
|              |       |   ec2-managedinstance-patch-compliance       |
|              |       |                                              |
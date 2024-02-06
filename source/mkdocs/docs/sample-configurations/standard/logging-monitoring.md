# Logging and Monitoring

## Overview

The sample configuration files for LZA introduce a centralized logging pattern to capture cloud audit logs, security logs, and CloudWatch logs (which can be used to capture and centralize system and application logs).

![Centralized Logging](./images/lza-centralized-logging.png "Centralized Logging")

## CloudTrail

The AWS CloudTrail service provides a comprehensive log of control plane and data plane operations (audit history) of all actions taken against most AWS services, including users logging into accounts. As discussed previously, the recommendation is to deploy LZA with Control Tower. In this case Control Tower enables and enforces organization-wide CloudTrail to capture and centralize all cloud audit logs.

## VPC Flow Logs

VPC Flow Logs capture information about the IP traffic going to and from network interfaces in a VPC such as source and destination IPs, protocol, ports, and success/failure of the flow. The [network-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/network-config.yaml) configuration file enables ALL (i.e. both accepted and rejected traffic) logs for all VPCs in all accounts to a local CloudWatch log group. It is important to use custom flow log formats to ensure all fields are captured as important fields are not part of the basic format. More details about VPC Flow Logs are [available here](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).
It should be noted that certain categories of network flows are not captured, including traffic to and from the instance metadata service (`169.254.169.254`), and DNS traffic with an Amazon VPC DNS resolver. DNS logs are available by configuring [Route 53 Resolver query logs](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.ResolverConfig.html#queryLogs).

## GuardDuty

Amazon GuardDuty is a cloud native threat detection and Intrusion Detection Service (IDS) that continuously monitors for malicious activity and unauthorized behavior to protect your AWS accounts and workloads. The service uses machine learning, anomaly detection, and integrated threat intelligence to identify and prioritize potential threats. GuardDuty uses a number of data sources including VPC Flow Logs, DNS logs, CloudTrail logs and several threat feeds. [Amazon GuardDuty](https://aws.amazon.com/guardduty/) is enabled in the [security-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/security-config.yaml) sample configuration file.

## Config

[AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html) provides a detailed view of the resources associated with each account in the AWS Organization, including how they are configured, how they are related to one another, and how the configurations have changed over time. Resources can be evaluated on the basis of their compliance with Config Rules - for example, a Config Rule might continually examine EBS volumes and check that they are encrypted.
Config is enabled at the organization level in the [security-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/security-config.yaml) configuration file - this provides an overall view of the compliance status of all resources across the organization. The AWS Config multi-account multi-region data aggregation capability has been located in both the Organization Management account and the Security account.

## CloudWatch Logs

[CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html) is the AWS-managed log aggregation service. It is used to monitor, store, and access log files from EC2 instances, AWS CloudTrail, Route 53, and other sources. LZA has a log replication job that stores your CloudWatch Logs in a centralized S3 bucket in the Log Archive account. This workflow is explained in more detail below:

![Cloudwatch Logs](./images/cloudwatch_logs.jpg "Cloudwatch Logs")

1. A CloudWatch log group update workflow runs during the **Logging** stage of the pipeline. A CloudFormation custom resource invokes a Lambda function that updates existing log groups to enable encryption using the account-level CloudWatch AWS KMS key, apply a subscription filter, and increase log retention if it's less than the solution's configured log retention period. The destination for the subscription filter is an Amazon Kinesis Data Stream deployed to the **Log Archive** account.
2. An EventBridge rule monitors for new CloudWatch log groups created in core and workload accounts.
3. When new log groups are created, the EventBridge rule invokes a Lambda function that updates the log group with the CloudWatch AWS KMS key, subscription filter, and configured log retention period. The destination for the subscription filter is the Kinesis Data Stream deployed to the **Log Archive** account.
4. Log groups stream their logs to the Kinesis Data Stream. The data stream is encrypted at rest with the replication AWS KMS key.
5. A delivery stream is configured with the Kinesis Data Stream and Kinesis Data Firehose, allowing the logs to be transformed and replicated to Amazon S3.
6. The destination of the Kinesis Data Firehose delivery stream is the `aws-accelerator-central-logs` Amazon S3 bucket. This bucket is encrypted at rest with the central logging AWS KMS key. In addition, the `aws-accelerator-s3-access-logs` and `aws-accelerator-elb-access-logs` buckets are encrypted at rest with Amazon S3-managed server-side encryption (SSE-S3) because these services don't support customer-managed AWS KMS keys. Logs delivered to the `aws-accelerator-elb-access-logs` bucket replicate to the central logs bucket with Amazon S3 replication.

## Security Hub

The primary dashboard for Operators to assess the security posture of the AWS footprint is the centralized [AWS Security Hub](https://aws.amazon.com/security-hub/) service. This is enabled in the [security-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/security-config.yaml) configuration file. Security Hub needs to be configured to aggregate findings from Amazon GuardDuty, Amazon Macie, AWS Config, Systems Manager, Firewall Manager, Amazon Detective, Amazon Inspector and IAM Access Analyzers. Events from security integrations are correlated and displayed on the Security Hub dashboard as ‘findings’ with a severity level (informational, low, medium, high, critical).

## Systems Manager Session Manager and Fleet Manager

[AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) is a fully managed AWS Systems Manager capability that lets you manage your [Amazon Elastic Compute Cloud (EC2)](https://aws.amazon.com/ec2/) instances, on-premises instances, and virtual machines (VMs) through an interactive one-click browser-based shell, AWS Command Line Interface (AWS CLI), or using a native RDP or SSH client. Session Manager provides secure and auditable instance management without the need to open inbound ports, maintain bastion hosts, or manage SSH keys. It makes it easy to comply with corporate policies that require controlled access to instances while providing end users with one-click cross-platform access to your managed instances.

With Session Manager, customers can gain quick access to Windows and Linux instances through the AWS console or using their preferred clients. [AWS Systems Manager Fleet Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/fleet.html) additionally allows connecting graphically to Windows desktops directly from the AWS console without the need for command line tools or RDSH/RDP clients.

The LZA enforces session encryption and stores encrypted session log data in the centralized S3 bucket for auditing purposes. This is enabled in the [global-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config/global-config.yaml) configuration file; optionally, session logging can also be enabled for CloudWatch Logs.

## Other Services

The following additional services are configured with their organization-wide administrative and visibility capabilities centralized to the Security Tooling account: Macie, Audit Manager, Access Analyzer. The following additional logging and reporting services are configured: CloudWatch Alarms, Cost and Usage Reports, ELB Access Logs.

Amazon Detective can optionally be enabled 48 hours after an account is deployed. This is due to an underlying [dependency on GuardDuty](https://docs.aws.amazon.com/detective/latest/adminguide/detective-prerequisites.html).
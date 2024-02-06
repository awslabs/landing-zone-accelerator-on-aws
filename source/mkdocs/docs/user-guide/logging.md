# Centralized Logging

The Landing Zone Accelerator Centralized Logging solution provides the ability to consolidate and manage log files from various sources into a Centralized Logging Account. This enables users to consolidate logs such as audit logs for access, configuration changes, and billing events. You can also collect Amazon CloudWatch Logs from multiple accounts and AWS Regions. The following sections discuss the types of logs that are centralized and the mechanisms used by the accelerator to centralize them.

## Supported Log Types

- ELB Access Logs
- VPC Flow Logs
- Macie Reports
- Cost and Usage Reports
- Config History
- Config Snapshots
- GuardDuty Findings
- CloudWatch Logs
- CloudTrail Digest
- CloudTrail Insights
- CloudTrail Logs
- S3 Server Access Logs
- SSM Inventory
- SSM Session Manager
- Security Hub Findings

## Log Centralization Methods

- **S3 Replication** - Log types that do not support service-native central logging methods or logging to CloudWatch Logs are stored in account-specific S3 buckets. These buckets are configured with an S3 replication rule to replicate logs to centralized logging S3 bucket in the central logging account.
- **Service-Native** - The AWS Service writes directly to the centralized logging bucket in the central logging account.
- **Log Streaming** - Some services do not support native centralized logging capability and do not allow writing directly to S3 in a centralized account. In order to enable this functionality, the accelerator utilizes CloudWatch and native log forwarding capabilities via the following workflow:
  - Log Group is created in CloudWatch.
  - A subscription filter is added to the CloudWatch Log Group.
  - The subscription filter points to a Log Destination.
  - The Log Destination is a region specific Kinesis Stream in the Central Logging Account.
    - Each enabled region has its own Kinesis Stream in the Central Logging Account.
  - The Kinesis Streams are forwarded into a Kinesis Firehose in the same specific region.
  - The logs are processed by a Lambda function and written to the Central Logging S3 Bucket in the Home Region.
- **Not Replicated** - Log types that are not replicated to the centralized logging S3 bucket.

| Bucket Type                |                     Bucket Name                     |                                                                                                                                                                                                    Purpose |
| :------------------------- | :-------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Centralized Logging Bucket |  aws-accelerator-central-logs-{account#}-{region}   | Stores all Landing Zone Accelerator centralized logs that have been enabled via the accelerator. This mechanism allows the solution to store a combined set of logs in a single account and single region. |
| ELB Access Logs            | aws-accelerator-elb-access-logs-{account#}-{region} |                                                                                                                           Stores ELB Access logs in the centralized logging account on a per region basis. |
| S3 Access Logs             | aws-accelerator-s3-access-logs-{account#}-{region}  |                                                                                                                                                       Stores S3 Access logs on a per account/region basis. |

| Log Type                         |                                                    S3 Path                                                     |                                                                                      Example                                                                                       | Supported Centralization Methods |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | -------------------------------: |
| ELB                              |                                             {account#}/{region}/\*                                             |                                             s3://aws-accelerator-elb-access-logs-123456789016-us-east-1/{account#}/{region}/\*.log.gz                                              |                   S3 Replication |
| VPC Flow Logs[^1]                   |                 vpc-flow-logs/AWSLogs/{account#}/vpcflowlogs/{region}/{year}/{month}/{day}/\*                  |                       s3://aws-accelerator-central-logs-123456789016-us-east-1/vpc-flow-logs/AWSLogs/123456789016/vpcflowlogs/us-east-1/2023/04/14/\*.log.gz                       |   Log Streaming / S3 Replication |
| Macie Reports                    |                             macie/{account#}/AWSLogs/{account#}/Macie/{region}/\*                              |                            s3://aws-accelerator-central-logs-123456789016-us-east-1/macie/123456789016/AWSLogs/123456789016/Macie/us-east-1/\*.jsonl.gz                            |                   Service-Native |
| Cost and Usage Reports           |                                       cur/{account#}/accelerator-cur/\*                                        |                           s3://aws-accelerator-central-logs-123456789016-us-east-1/cur/123456789016/accelerator-cur/20220901-20221001/\*.snappy.parquet                            |                   S3 Replication |
| Config History                   |                config/AWSLogs/{account#}/Config/{region}/{year}/{month}/{day}/ConfigHistory/\*                 |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/AWSLogs/123456789016/Config/us-east-1/2023/4/10/ConfigHistory/\*.json.gz                          |                   Service-Native |
| Config Snapshots                 |                config/AWSLogs/{account#}/Config/{region}/{year}/{month}/{day}/ConfigSnapshot/\*                |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/AWSLogs/123456789016/Config/us-east-1/2023/4/10/ConfigSnapshot/\*.json.gz                         |                   Service-Native |
| GuardDuty                        |                     guardduty/AWSLogs/{account#}/GuardDuty/region/{year}/{month}/{day}/\*                      |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/guardduty/AWSLogs/123456789016/GuardDuty/us-east-1/2023/04/08/\*.jsonl.gz                         |                   Service-Native |
| CloudWatch Logs                  |                                 CloudWatchLogs/{year}/{month}/{day}/{hour}/\*                                  |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/17/14/\*.parquet                                          |                    Log Streaming |
| CloudTrail Organization Digest   | cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail-Digest/{region}/{year}/{month}/{day}/\* |        s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Digest/us-east-1/2023/04/14/\*.json.gz        |                   Service-Native |
| CloudTrail Organization Insights |               cloudtrail-organization/AWSLogs/{organizationID}/{account#}/CloudTrail-Insight/\*                |                  s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Insight/\*.json.gz                  |                   Service-Native |
| CloudTrail Organization Logs[^1]    |    cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail/{region}/{year}/{month}/{day}/\*     |           s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg//123456789016/CloudTrail/us-east-1/2023/04/14/\*.json.gz           |   Log Streaming / Service-Native |
| S3 Access Logs                   |                             aws-accelerator-s3-access-logs-{account#}-{region}/\*                              |                                                           s3://aws-accelerator-s3-access-logs-123456789016-us-east-1/\*                                                            |                   Not Replicated |
| SSM Inventory                    |                                                ssm-inventory/\*                                                | s3://aws-accelerator-central-logs-123456789016-us-east-1/ssm-inventory/AWS:ComplianceSummary/accountid=123456789016/region=us-east-1/resourcetype=ManagedInstanceInventory/\*.json |                   Service-Native |
| SSM Sessions Manager*            |                                         session/{account#}/{region}/\*                                         |                                           s3://aws-accelerator-central-logs-123456789016-us-east-1/session/123456789016/us-east-1/\*.log                                           |   Log Streaming / Service-Native |
| Security Hub                     |                                     CloudWatchLogs/{year}/{month}/{day}/\*                                     |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/21/00/\*.parquet                                          |                    Log Streaming |

[^1]: These log types are only written to the documented S3 path when configured to store their logs in S3, otherwise they are stored in the CloudWatch Logs S3 path. You may configure [dynamic partitioning](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.CloudWatchLogsConfig.html#dynamicPartitioning) of CloudWatch Logs if you would like these logs to be delivered to a custom S3 path.
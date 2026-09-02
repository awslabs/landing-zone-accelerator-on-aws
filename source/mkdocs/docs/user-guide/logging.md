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
| CloudWatch Logs                  |                                 CloudWatchLogs/{year}/{month}/{day}/{hour}/\*                                  |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/17/14/\*                                          |                    Log Streaming |
| CloudTrail Organization Digest   | cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail-Digest/{region}/{year}/{month}/{day}/\* |        s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Digest/us-east-1/2023/04/14/\*.json.gz        |                   Service-Native |
| CloudTrail Organization Insights |               cloudtrail-organization/AWSLogs/{organizationID}/{account#}/CloudTrail-Insight/\*                |                  s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Insight/\*.json.gz                  |                   Service-Native |
| CloudTrail Organization Logs[^1]    |    cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail/{region}/{year}/{month}/{day}/\*     |           s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg//123456789016/CloudTrail/us-east-1/2023/04/14/\*.json.gz           |   Log Streaming / Service-Native |
| S3 Access Logs                   |                             aws-accelerator-s3-access-logs-{account#}-{region}/\*                              |                                                           s3://aws-accelerator-s3-access-logs-123456789016-us-east-1/\*                                                            |                   Not Replicated |
| SSM Inventory                    |                                                ssm-inventory/\*                                                | s3://aws-accelerator-central-logs-123456789016-us-east-1/ssm-inventory/AWS:ComplianceSummary/accountid=123456789016/region=us-east-1/resourcetype=ManagedInstanceInventory/\*.json |                   Service-Native |
| SSM Session Manager[^2]          |                                         session/{account#}/{region}/\*                                         |                                           s3://aws-accelerator-central-logs-123456789016-us-east-1/session/123456789016/us-east-1/\*.log                                           |   Log Streaming / Service-Native |
| Security Hub                     |                                     CloudWatchLogs/{year}/{month}/{day}/\*                                     |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/21/00/\*                                          |                    Log Streaming |

[^1]: These log types are only written to the documented S3 path when configured to store their logs in S3, otherwise they are stored in the CloudWatch Logs S3 path. You may configure [dynamic partitioning](../typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.ICloudWatchLogsConfig.html#dynamicPartitioning) of CloudWatch Logs if you would like these logs to be delivered to a custom S3 path.

[^2]: When `sessionManager.sendToS3` is enabled, the instance writes session logs directly to the single central logs bucket in the centralized logging Region. Instances in other Regions write to it cross-Region, which a Region-scoped S3 gateway endpoint cannot reach. See [Session Manager logging in multi-Region deployments](#session-manager-logging-in-multi-region-deployments) below.

## Session Manager logging in multi-Region deployments

Session Manager logging is configured under [`globalConfig.logging.sessionManager`](../typedocs/interfaces/packages__aws-accelerator_config_lib_models_global-config.ISessionManagerConfig.html) with two independent destinations, `sendToS3` and `sendToCloudWatchLogs` (either or both may be enabled). The accelerator configures the `SSM-SessionManagerRunShell` document, the KMS session key, and the Session Manager IAM policy in **every enabled Region** of every in-scope account (subject to `excludeRegions` / `excludeAccounts`).

### How `sendToS3` behaves

When `sendToS3` is enabled, every Region's `SSM-SessionManagerRunShell` document points at the **same destination**: the central logs bucket in the LogArchive account, which lives in the centralized logging Region (`logging.centralizedLoggingRegion`, the home Region by default). Logs are separated per Region only by the `session/{account#}/{region}/` key prefix, and each instance's EC2 role is granted `s3:PutObject` and the corresponding KMS permissions directly on that bucket. This is the **Service-Native** centralization method: the instance writes to S3 itself.

Because that bucket is single-Region, an instance in **any enabled Region other than the centralized logging Region** must write its session logs **cross-Region**. Amazon S3 gateway VPC endpoints are Region-scoped and [cannot reach a bucket in another Region](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html) (an interface endpoint for S3 is Region-scoped as well). The instance can therefore reach the central bucket only when one of the following is true:

- It runs **in** the centralized logging Region, so the local S3 gateway endpoint reaches the same-Region bucket, **or**
- It has an **internet egress path** (NAT gateway or internet gateway) to the public `s3.{centralizedLoggingRegion}.amazonaws.com` endpoint.

!!! warning "Symptom: blank screen in a private, non-central Region"
    In a fully private Region (VPC endpoints only, no internet egress) that is **not** the centralized logging Region, a Session Manager connection opens a blank screen and never establishes. Session Manager treats the configured S3 destination as required, and the cross-Region `PutObject` to the central bucket fails because the Region-local S3 gateway endpoint cannot route to it. This is the scenario reported in [GitHub issue #896](https://github.com/awslabs/landing-zone-accelerator-on-aws/issues/896).

### What works in private, non-central Regions

| Option | Configuration | Result |
| :----- | :------------ | :----- |
| Use CloudWatch Logs instead of S3 **(recommended)** | `sendToS3: false`, `sendToCloudWatchLogs: true` | Each Region writes to a Region-local CloudWatch log group (`{prefix}-sessionmanager-logs`) reached through that Region's `logs` interface endpoint. The accelerator then forwards those logs to the central logs bucket server-side via the **Log Streaming** pipeline (Kinesis → Firehose → Lambda). No cross-Region call is made from the instance, and centralized session logs are retained. |
| Exclude the affected Region | add the Region to `sessionManager.excludeRegions` | The accelerator stops managing the `SSM-SessionManagerRunShell` document (and log group) in that Region, which disables **all** accelerator-managed session logging there. A Region that never had it enabled uses the AWS default of no forced log destination and connections succeed. If S3 logging was already enabled there, you must also turn it off in that Region's Session Manager preferences yourself, because excluding the Region does not reset the existing document and connections keep failing until you do. |
| Provide internet egress | NAT gateway / internet gateway route to public S3 | The instance reaches the central bucket's public Region endpoint cross-Region. Not compatible with a fully private posture. |

Instances in the centralized logging Region are unaffected by this constraint and can use `sendToS3` directly. For deployments that include private Regions other than the centralized logging Region, enable `sendToCloudWatchLogs` so those Regions retain centralized session logging.
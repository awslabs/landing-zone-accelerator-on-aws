# AWS CloudWatch Log FAQ

## Can I configure CloudWatch Log group data protection policy?
Yes. The Landing Zone Accelerator solution supports CloudWatch Log group data protection policies to safeguard sensitive data that is ingested by CloudWatch Logs.
Currently, the Landing Zone Accelerator supports only `Credentials` CloudWatch Logs managed data identifiers for configuring log group data protection policies.
The CloudWatch Logs managed data identifiers for Credentials category can be found [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-credentials.html).

The Landing Zone Accelerator solution will need the following `dataProtection` configuration to configure CloudWatch Log group data protection policy. It is possible to restrict the functionality to specific target environments (AWS Accounts and Regions) using the `deploymentTargets` property.

```
dataProtection: 
  managedDataIdentifiers:
    category:
      - Credentials
```

In existing Landing Zone Accelerator environments, if you wish to configure CloudWatch Log group data protection policies, you can add the above [dataProtection](../../../typedocs/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_global_config.ICloudWatchDataProtectionConfig.html) configuration and deploy the Landing Zone Accelerator pipeline.

The Landing Zone Accelerator solution configures CloudWatch Logs data protection audit policies to write audit reports to `centralLogBucket` Amazon S3 bucket defined in the [CentralLogBucketConfig](../../../typedocs/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_global_config.ICentralLogBucketConfig.html).

!!! note
    Please note that this feature is only available for AWS Commercial Regions.
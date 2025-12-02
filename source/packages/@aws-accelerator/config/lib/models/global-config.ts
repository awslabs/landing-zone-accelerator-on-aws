/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as t from '../common/types';
import { StreamMode } from '@aws-sdk/client-kinesis';

/**
 * ## Global Configuration Interface
 *
 * The global configuration defines foundational settings that apply across your entire Landing Zone Accelerator deployment.
 * This configuration establishes core operational parameters, security baselines, and service integrations.
 *
 * ### Overview
 *
 * The global configuration serves as the central control plane for:
 * - **Regional Deployment**: Define home region and enabled regions for multi-region deployments
 * - **Security & Compliance**: Configure logging, encryption, and governance controls
 * - **Service Integration**: Enable AWS Control Tower, centralized logging, and monitoring
 * - **Resource Management**: Set quotas, budgets, and operational parameters
 *
 * ### Key Features
 *
 * - **Multi-Region Support**: Deploy across multiple AWS regions with centralized management
 * - **Control Tower Integration**: Seamless integration with AWS Control Tower for governance
 * - **Centralized Logging**: Comprehensive logging strategy with CloudTrail, CloudWatch, and S3
 * - **Security Baseline**: Encryption, access controls, and compliance monitoring
 * - **Cost Management**: Budgets, cost reports, and service quota management
 * - **Operational Excellence**: Backup strategies, SNS notifications, and metadata collection
 *
 * ### Usage Example
 *
 * ```yaml
 * homeRegion: &HOME_REGION us-east-1
 * enabledRegions:
 *   - us-east-1
 *   - us-west-2
 *
 * managementAccountAccessRole: AWSControlTowerExecution
 * cloudwatchLogRetentionInDays: 365
 *
 * controlTower:
 *   enable: true
 *   landingZone:
 *     version: '3.3'
 *     logging:
 *       loggingBucketRetentionDays: 365
 *       organizationTrail: true
 *     security:
 *       enableIdentityCenterAccess: true
 *
 * logging:
 *   account: LogArchive
 *   centralizedLoggingRegion: us-east-1
 *   cloudtrail:
 *     enable: true
 *     organizationTrail: true
 *   sessionManager:
 *     sendToCloudWatchLogs: true
 *     sendToS3: true
 *   cloudwatchLogs:
 *     enable: true
 *     encryption:
 *       useCMK: true
 *
 * reports:
 *   costAndUsageReport:
 *     compression: Parquet
 *     format: Parquet
 *     reportName: accelerator-cur
 *     timeUnit: DAILY
 *   budgets:
 *     - name: monthly-budget
 *       type: COST
 *       amount: 1000
 *       timeUnit: MONTHLY
 *
 * snsTopics:
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   topics:
 *     - name: SecurityAlerts
 *       emailAddresses:
 *         - security@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface IGlobalConfig {
  /**
   * **Accelerator Home Region Name** *(Required)*
   *
   * The region where the accelerator pipeline will be deployed
   *
   * **Example**
   *
   * ```yaml
   * homeRegion: us-east-1
   * ```
   */
  readonly homeRegion: t.NonEmptyString;
  /**
   *
   * **V2 Stacks** *(Optional)*
   *
   * Whether or not V2 Stacks should be enabled.
   *
   * When enabled, LZA will place newly defined resources in separate CloudFormation stacks to prevent exceeding the 500 resource per stack limit.
   * Pre-existing resources will be preserved in their original stacks.
   *
   * @default false
   */
  readonly useV2Stacks?: boolean;
  /**
   *
   * **Enabled Regions** *(Required)*
   *
   * List of AWS Regions where accelerator will be deployed. {@link IGlobalConfig.homeRegion | Home region} must be part of this list.
   *
   * **Example**
   *
   * ```yaml
   * enabledRegions:
   *   - us-east-1
   *   - us-west-2
   * ```
   */
  readonly enabledRegions: string[];
  /**
   *
   * **Management Account Access Role** *(Required)*
   *
   * Name of the management account access role created in member accounts.
   *
   * **Example**
   * ```yaml
   * managementAccountAccessRole: AWSControlTowerExecution
   * ```
   */
  readonly managementAccountAccessRole: t.NonEmptyString;
  /**
   *
   * **CloudWatch Log Retention** *(Required)*
   *
   * The retention period, specified in days, is applied to all CloudWatch log groups created by the LZA.
   * Additionally, this retention period will be applied to any pre-existing CloudWatch log group with a shorter retention period.
   *
   * **Example Scenarios**
   *
   * Scenario 1: If `cloudWatchRetentionInDays` is set to 365, and create a new CloudWatch log group with a 730-day retention period, the LZA will update the log group to have a 365-day retention period.
   *
   * Scenario 2: If `cloudWatchRetentionInDays` is set to 365, and there is an existing CloudWatch log group with a 730-day retention period, the log group will not be updated by the LZA.
   *
   * Scenario 3: If `cloudWatchRetentionInDays` is set to 365, and there is an existing CloudWatch log group with a 30-day retention period, the LZA will update the log group to have a 365-day retention period.
   *
   */
  readonly cloudwatchLogRetentionInDays: number;
  /**
   * @deprecated Use {@link IGlobalConfig.cdkOptions}
   *
   * NOTICE: The configuration of CDK buckets is being moved
   * to cdkOptions in the Global Config. This block is deprecated and
   * will be removed in a future release
   *
   * Indicates whether workload accounts should utilize the cdk-assets S3 buckets in the management account
   *
   * **Example**
   *
   * ```yaml
   * centralizeCdkBuckets:
   *   enable: true
   * ```
   */
  readonly centralizeCdkBuckets?: ICentralizeCdkBucketsConfig;
  /**
   *
   * **AWS CDK Options Configuration**
   *
   * Enables the customization of the operation of the CDK within LZA
   *
   * @see {@link ICdkOptionsConfig} for CDK options configuration
   */
  readonly cdkOptions?: ICdkOptionsConfig;
  /**
   *
   * **Termination Protection** *(Optional)*
   *
   * Whether or not termination protection should be enabled for this stack
   *
   */
  readonly terminationProtection?: boolean;
  /**
   * **AWS Control Tower Configuration** *(Required)*
   *
   * Configure Control Tower for the LZA deployment.
   *
   * **Key Features**
   * - Enable/Disable Control Tower
   * - Set Control Tower controls
   * - Configure Control Tower Landing Zone
   *
   */
  readonly controlTower: IControlTowerConfig;
  /**
   * **External Landing Zone Resources Configuration** *(Optional)*
   *
   * Used when importing resources from an existing Amazon Secure Environment Accelerator (ASEA) environment.
   *
   * **Example**
   * ```yaml
   * externalLandingZoneResources:
   *   importExternalLandingZoneResources: false
   * ```
   */
  readonly externalLandingZoneResources?: IExternalLandingZoneResourcesConfig;
  /**
   * **Logging Configuration** *(Required)*
   *
   * Used to configure logging for the LZA deployment. Enables the configuration of logging for Session Manager, CloudTrail, and CloudWatch.
   *
   * @see {@link ILoggingConfig} for logging configuration options
   *
   */
  readonly logging: ILoggingConfig;
  /**
   * **Report Configuration** *(Optional)*
   *
   * Configuration for cost and usage reports as well as budgets.
   *
   * @see {@link IReportConfig} for report configuration options
   */
  readonly reports?: IReportConfig;
  /**
   * **AWS Service Quota Limit Configuration**
   *
   * Enables the creation of service quota increases for accounts within the LZA deployment.
   *
   * **Considerations**
   * Service quotas define the maximum number of service resources or operations for your AWS account.
   * Service quota increases are processed asynchronously and may require approval.
   * Some quotas require AWS Support cases for increases beyond certain thresholds.
   * Quotas are account-specific and region-specific (where applicable).
   * You can find service and quota codes in the AWS Service Quotas console.
   *
   * For more information, see:
   * - [AWS Service Quotas User Guide](https://docs.aws.amazon.com/servicequotas/latest/userguide/intro.html)
   * - [Requesting a quota increase](https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html)
   *
   * **Example**
   * ```yaml
   * limits:
   *   # Increase Lambda concurrent executions
   *   - serviceCode: lambda
   *     quotaCode: L-B99A9384
   *     desiredValue: 1000
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Root
   *     regions:
   *       - us-west-2
   *
   *   # Increase IAM roles per account (global quota - no regions needed)
   *   - serviceCode: iam
   *     quotaCode: L-4019AD8B
   *     desiredValue: 15
   *     deploymentTargets:
   *       accounts:
   *         - SharedServices
   *
   *   # Increase VPCs per region
   *   - serviceCode: vpc
   *     quotaCode: L-F678F1CE
   *     desiredValue: 20
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Security
   *         - Infrastructure
   *     regions:
   *       - us-east-1
   *       - us-west-2
   *
   *   # Increase Route 53 Resolver rules per region
   *   - serviceCode: route53resolver
   *     quotaCode: L-4A669CC0
   *     desiredValue: 10
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Infrastructure
   * ```
   *
   * @see {@link IServiceQuotaLimitsConfig} for service quota limit configuration options
   */
  readonly limits?: IServiceQuotaLimitsConfig[];
  /**
   * **Backup Vaults Configuration** *(Optional)*
   *
   * Used to generate Backup Vaults
   *
   * **Example**
   * ```yaml
   * backup:
   *   vaults:
   *     - name: MyBackUpVault
   *       deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   *
   * @see {@link IBackupConfig} for backup configuration options
   */
  readonly backup?: IBackupConfig;
  /**
   * **SNS Topics Configuration** *(Optional)*
   *
   * Define SNS topics to be deployed throughout the LZA environment.
   *
   * To send CloudWatch Alarms and SecurityHub notifications, you will need to configure at least one SNS Topic.
   * For SecurityHub notifications, you will need to set the deployment target OU to Root in order to receive notifications from all accounts.
   *
   * **Example**
   * ```yaml
   * snsTopics:
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   *   topics:
   *     - name: Security
   *       emailAddresses:
   *         - SecurityNotifications@example.com
   * ```
   *
   * @see {@link ISnsConfig} for SNS configuration options
   */
  readonly snsTopics?: ISnsConfig;
  /**
   * **SSM Inventory Configuration** *(Optional)*
   *
   * Allows enabling of SSM Inventory in member accounts
   *
   * @see {@link ISsmInventoryConfig} for SSM Inventory configuration options}
   *
   * **Example**
   * ```yaml
   * ssmInventory:
   *   enable: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Infrastructure
   * ```
   *
   */
  readonly ssmInventory?: ISsmInventoryConfig;
  /**
   * **Tags** *(Optional)*
   *
   * Global tags to be applied to all resources created by the solution.
   *
   * **Note**
   * LZA will not apply the tags to all resource types.
   * Excluded types include Transit Gateway Route Tables and Route53 Resolver Endpoints.
   *
   * **Example**
   * ```yaml
   * tags:
   *   - key: Environment
   *     value: Dev
   *   - key: ResourceOwner
   *     value: AcmeApp
   *   - key: CostCenter
   *     value: '123'
   * ```
   *
   * @see {@link https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/acb6f296bf996993945a54ca2907badfd9ee2020/source/packages/%40aws-accelerator/accelerator/utils/stack-utils.ts#L174 | stack-utils.ts} for a list of excluded resources.
   **/
  readonly tags?: t.ITag[];
  /**
   * **SSM parameter configurations** *(Optional)*
   *
   * Create SSM parameters through the LZA. Parameters can be deployed to Organizational Units or Accounts through the use of deployment targets.
   *
   * **Example**
   * ```yaml
   * ssmParameters:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Workloads
   *     parameters:
   *       - name: WorkloadParameter
   *         path: /my/custom/path/variable
   *         value: 'MySSMParameterValue'
   * ```
   * @see {@link ISsmParameterConfig} for SSM parameter configuration options
   */
  readonly ssmParameters?: ISsmParametersConfig[];
  /**
   * **Accelerator Metadata Configuration** *(Optional)*
   *
   * Enable and customize the collection of LZA metadata in your environment.
   *
   * **Key Features**
   * - Enable the collection of LZA metadata
   * - Specify an account to store the metadata
   * - Provision access to IAM roles for the metadata
   *
   * **Example**
   * ```yaml
   * acceleratorMetadata:
   *   enable: true
   *   account: Logging
   *   readOnlyAccessRoleArns:
   *     - arn:aws:iam::111111111111:role/test-access-role
   * ```
   *
   * @see {@link IAcceleratorMetadataConfig} for accelerator metadata configuration options}
   */
  readonly acceleratorMetadata?: IAcceleratorMetadataConfig;
  /**
   * **Accelerator Settings Configuration** *(Optional)*
   *
   * Enables the modification of additional LZA properties
   *
   * **Example**
   * ```yaml
   * acceleratorSettings:
   *  maxConcurrentStacks: 250
   * ```
   *
   * @see {@link IAcceleratorSettingsConfig} for accelerator settings configuration options
   *
   */
  readonly acceleratorSettings?: IAcceleratorSettingsConfig;

  /**
   * **Lambda Configuration** *(Optional)*
   *
   * Used to configure encryption for Lambda function environment variables across the LZA environment.
   *
   *
   * **Example**
   * ```yaml
   * lambda:
   *   encryption:
   *    useCMK: true
   *    deploymentTargets:
   *      organizationalUnits:
   *        - Root
   * ```
   *
   * @see {@link ILambdaConfig} for Lambda configuration options
   * @see {@link https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html | Securing Lambda environment variables} for more information on lambda encryption
   */
  readonly lambda?: ILambdaConfig;
  /**
   * **AWS S3 Global Configuration** *(Optional)*
   *
   * Used to configure AWS S3 server side encryption for S3 buckets across the LZA environment.
   * The configuration is able to target OUs, regions, or accounts. When left undefined, the solution will utilize AWS KMS CMK to encrypt the AWS S3 buckets.
   *
   * **Notes**
   * This configuration is not applicable to LogArchive's central logging region, because the solution deployed CentralLogs bucket always encrypted with AWS KMS CMK.
   * This configuration is not applicable to the Management account Asset bucket in the home region. This bucket will always have a key generated and applied to the bucket if it is created.
   * This configuration is not applicable to the assets S3 bucket if the bucket is created. This bucket will always have a key generated and applied.
   *
   *  For more information please see [here](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
   *
   * **Example**
   * ```yaml
   * s3:
   *   createCMK: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   * ```
   *
   * @see {@link IS3GlobalConfig} for S3 configuration options
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html | Protecting data with encryption } for more information on S3 encryption
   */
  readonly s3?: IS3GlobalConfig;
  /**
   *
   * **Enable opt-in Regions** *(Optional)*
   *
   * Whether or not to automatically enable opt-in regions configured for all LZA managed accounts
   *
   * When enableOptInRegions is set to true, it will only enable the opt-in regions that are also listed in the {@link IGlobalConfig.enabledRegions | enabledRegions} configuration.
   *
   * @default false
   */
  readonly enableOptInRegions?: boolean;
  /**
   * **Default Event Bus Configuration** *(Optional)*
   *
   * Define a custom policy which the solution will automatically apply to the default event bus within targeted accounts.
   *
   *
   * **Example**
   * ```
   * defaultEventBus:
   *   policy: path-to-my-policy.json
   *   deploymentTargets:
   *     accounts:
   *       - Management
   * }
   * ```
   *
   * @see {@link IDefaultEventBusConfig} for default event bus configuration options
   */
  readonly defaultEventBus?: IDefaultEventBusConfig;

  /**
   * **Central Root User Configuration** *(Optional)*
   *
   * Centrally managing root enables the removal of root user credentials from the organization's member accounts.
   * Tasks requiring root access can then be performed by the organization's management account.
   * This configuration dictates whether or not root user management is centralized for the organization.
   *
   * **Example**
   * ```yaml
   * centralRootUserManagement:
   *   enable: true
   *   capabilities:
   *     rootCredentialsManagement: true
   *     allowRootSessions: true
   * ```
   *
   * @see {@link ICentralRootUserManagementConfig} for central root user management configuration options
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html | AWS account root user} for more information on root user management
   */
  readonly centralRootUserManagement?: ICentralRootUserManagementConfig;

  /**
   * **Stack Policy Configuration** *(Optional)*
   *
   * Define which resource types should be protected. Defined resource types will be protected for Update:Replace and Update:Delete operation.
   * Protected types need to be AWS:: resource types e.g. AWS::EC2::InternetGateway.
   *
   *
   * **Example**
   * ```yaml
   * stackPolicy:
   *   enable: true
   *   protectedTypes: ['AWS::EC2::InternetGateway']
   * ```
   *
   * @see {@link IStackPolicyConfig} for stack policy configuration options
   */

  readonly stackPolicy?: IStackPolicyConfig;

  /**
   * **SQS Queue Configuration** *(Optional)*
   *
   * Used to configure encryption for SQS queues throughout the LZA environment.
   * The configuration is able to target OUs, regions, or accounts. When left undefined, the solution will utilize AWS KMS CMK to encrypt SQS queues.
   *
   * **Example**
   * ```yaml
   * sqs:
   *   encryption:
   *    useCMK: true
   *    deploymentTargets:
   *      organizationalUnits:
   *        - Root
   * ```
   *
   * @see {@link ISqsConfig} for more information.
   */
  readonly sqs?: ISqsConfig;
}

/**
 * ## AWS Control Tower Configuration
 *
 * AWS Control Tower provides a prescriptive way to set up and govern a secure, multi-account AWS environment
 * based on best practices. This configuration enables and manages Control Tower Landing Zone deployment
 * alongside the Landing Zone Accelerator.
 *
 * ### Key Features
 *
 * - **Landing Zone Management**: Configure and manage Control Tower Landing Zone settings
 * - **Guardrail Controls**: Enable additional strongly recommended and elective controls
 * - **Identity Center Integration**: Seamless integration with AWS IAM Identity Center
 * - **Logging Configuration**: Centralized logging with configurable retention policies
 *
 * ### Configuration Structure
 *
 * ```yaml
 * # global-config.yaml
 * controlTower:
 *   enable: true
 *   landingZone:
 *     version: '3.3'
 *     logging:
 *       loggingBucketRetentionDays: 365
 *       accessLoggingBucketRetentionDays: 365
 *       organizationTrail: true
 *     security:
 *       enableIdentityCenterAccess: true
 *   controls:
 *     - identifier: AWS-GR_RDS_INSTANCE_PUBLIC_ACCESS_CHECK
 *       enable: true
 *       deploymentTargets:
 *         organizationalUnits:
 *           - SecureWorkloads
 *     - identifier: AWS-GR_EC2_INSTANCE_IMDSv2_CHECK
 *       enable: true
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Workloads
 * ```
 *
 * ### Best Practices
 *
 * 1. **Version Management**: Always specify the latest available Landing Zone version
 * 2. **Control Deployment**: Enable controls in batches of 10 or fewer to avoid throttling
 * 3. **Organizational Units**: Align control deployment with your OU structure
 * 4. **Logging Retention**: Set appropriate retention periods based on compliance requirements
 * 5. **Identity Center**: Enable Identity Center access for centralized user management
 *
 * ### Important Considerations
 *
 * - Control Tower requires the three mandatory accounts: Management, Audit, and Log Archive
 * - Some controls cannot be deployed to the Security OU
 * - Control Tower operations are limited to 10 concurrent operations
 * - Landing Zone updates require the latest available version
 *
 * @category Global Configuration
 */
export interface IControlTowerConfig {
  /**
   * **Enable Control Tower** *(Required)*
   *
   * Controls whether AWS Control Tower Landing Zone is enabled for the deployment.
   * When enabled, the accelerator ensures the account configuration includes the three
   * mandatory Control Tower accounts.
   *
   * **Required Accounts**
   *
   * When Control Tower is enabled, these accounts must be defined in accounts-config.yaml:
   * - **Management Account**: Primary account for organizational management and billing
   * - **Log Archive Account**: Centralized logging and log retention
   * - **Audit Account**: Security auditing and compliance monitoring
   *
   * **Prerequisites**
   *
   * - AWS Organizations must be enabled in the management account
   * - All features must be enabled in AWS Organizations
   * - The management account must have appropriate permissions
   * - Required service-linked roles must be created
   *
   * ```yaml
   * # Enable Control Tower integration
   * enable: true
   *
   * # Disable Control Tower (standalone LZA deployment)
   * enable: false
   * ```
   */
  readonly enable: boolean;

  /**
   * **Control Tower Guardrails** *(Optional)*
   *
   * Configuration for additional Control Tower guardrails (controls) beyond the mandatory ones.
   * Allows enablement of strongly recommended and elective controls across organizational units.
   *
   * **Control Types**
   *
   * - **Mandatory**: Automatically enabled by Control Tower (cannot be disabled)
   * - **Strongly Recommended**: Best practice controls that should be enabled
   * - **Elective**: Additional controls for specific compliance requirements
   *
   * **Deployment Considerations**
   *
   * - **Concurrency Limit**: Maximum 10 concurrent control operations
   * - **Batch Processing**: Deploy controls in batches to avoid throttling
   * - **OU Restrictions**: Some controls cannot be deployed to Security OU
   * - **Regional Scope**: Controls can be region-specific or global
   *
   * **Usage Examples**
   *
   * ```yaml
   * controls:
   *   # Strongly recommended control
   *   - identifier: AWS-GR_RDS_INSTANCE_PUBLIC_ACCESS_CHECK
   *     enable: true
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Workloads
   *         - Sandbox
   *
   *   # Elective control with regional scope
   *   - identifier: AWS-GR_EC2_INSTANCE_IMDSv2_CHECK
   *     enable: true
   *     regions:
   *       - us-east-1
   *       - us-west-2
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Production
   *
   *   # Global control using opaque identifier
   *   - identifier: m7a5gbdf08wg2o0en010mkng
   *     enable: true
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Infrastructure
   * ```
   *
   * **Best Practices**
   *
   * - Enable controls gradually in batches of 10 or fewer
   * - Test controls in non-production OUs first
   * - Review control documentation for OU compatibility
   * - Monitor control status and compliance in Control Tower console
   *
   * @see {@link IControlTowerControlConfig} for individual control configuration
   * @see [Optional Controls Reference](https://docs.aws.amazon.com/controltower/latest/controlreference/optional-controls.html)
   * @see [Control Tower Guardrails](https://docs.aws.amazon.com/controltower/latest/userguide/guardrails.html)
   */
  readonly controls?: IControlTowerControlConfig[];

  /**
   * **Control Tower Landing Zone Configuration** *(Optional)*
   *
   * Advanced configuration options for the Control Tower Landing Zone, including
   * version management, logging settings, and security configurations.
   *
   * **Key Configuration Areas**
   *
   * - **Version Management**: Specify Landing Zone version for updates and resets
   * - **Logging Configuration**: Control log retention and CloudTrail settings
   * - **Security Settings**: Configure Identity Center access and authentication
   *
   *
   * **Usage Example**
   *
   * ```yaml
   * landingZone:
   *   version: '3.3'  # Must be latest available version
   *   logging:
   *     loggingBucketRetentionDays: 365      # 1 year retention
   *     accessLoggingBucketRetentionDays: 90  # 90 day access logs
   *     organizationTrail: true               # Enable org-wide CloudTrail
   *   security:
   *     enableIdentityCenterAccess: true      # Enable centralized access
   * ```
   *
   * **Update Considerations**
   *
   * - Landing Zone updates require the latest version number
   * - Configuration changes trigger Landing Zone reset/update
   * - Updates may take 60-90 minutes to complete
   * - Existing resources and configurations are preserved
   *
   * @see {@link IControlTowerLandingZoneConfig} for detailed configuration options
   * @see [Control Tower Landing Zone](https://docs.aws.amazon.com/controltower/latest/userguide/landing-zone.html)
   */
  readonly landingZone?: IControlTowerLandingZoneConfig;
}

/**
 * ## Control Tower Guardrail Configuration
 *
 * Individual Control Tower guardrail (control) configuration for enabling additional
 * security and compliance controls beyond the mandatory ones automatically enabled by Control Tower.
 *
 * ### Overview
 *
 * Control Tower guardrails provide governance controls that help ensure your AWS environment
 * remains compliant with security and operational best practices. This configuration allows
 * you to enable additional controls across your organizational structure.
 *
 * ### Deployment Constraints
 *
 * - **Concurrency Limit**: Maximum 10 concurrent control operations per region
 * - **OU Restrictions**: Some controls cannot be deployed to the Security OU
 * - **Regional Scope**: Controls can be global or region-specific
 * - **Batch Processing**: Deploy in small batches to avoid throttling
 *
 * ### Usage Examples
 *
 * ```yaml
 * - identifier: AWS-GR_RDS_INSTANCE_PUBLIC_ACCESS_CHECK
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Workloads
 *       - Production
 *
 * - identifier: AWS-GR_EC2_INSTANCE_IMDSv2_CHECK
 *   enable: true
 *   regions:
 *     - us-east-1
 *     - us-west-2
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 *
 * - identifier: m7a5gbdf08wg2o0en010mkng
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 * ```
 *
 * ### Important Considerations
 *
 * - LZA only supports highly recommended and elective controls
 * - Control Tower operations count against the 10 concurrent operation limit
 * - Enabling a control for one OU counts as one Control Tower operation
 * - Control deployment is asynchronous and may take several minutes
 * - Some controls have dependencies on other AWS services
 *
 * @category Global Configuration
 * @see [Controls Reference](https://docs.aws.amazon.com/controltower/latest/controlreference/controls-reference.html)
 * @see [Security OU Exceptions](https://docs.aws.amazon.com/controltower/latest/controlreference/exception-to-controls-security-ou.html)
 */
export interface IControlTowerControlConfig {
  /**
   * **Control Identifier** *(Required)*
   *
   * Unique identifier for the Control Tower guardrail to be enabled.
   * The identifier format depends on the control type and determines how the control is referenced.
   *
   * ### Identifier Formats
   *
   * **Standard Controls (AWS-GR_*):**
   * - Format: `AWS-GR_<CONTROL_NAME>`
   * - Used for strongly recommended and elective controls
   * - Human-readable and descriptive of the control's purpose
   *
   * **Global Controls (Opaque IDs):**
   * - Format: Alphanumeric string (e.g., `m7a5gbdf08wg2o0en010mkng`)
   * - Used for global controls that span multiple services
   * - Requires reference to AWS documentation for mapping
   *
   * @see [Global Control Identifiers](https://docs.aws.amazon.com/controltower/latest/controlreference/all-global-identifiers.html)
   */
  readonly identifier: t.NonEmptyString;

  /**
   * **Enable Control** *(Required)*
   *
   * Controls whether this guardrail should be enabled or disabled for the specified
   * organizational units.
   *
   * ### Control States
   *
   * **Enabled (`true`):**
   * - Control is active and enforcing its policy
   * - Resources are monitored for compliance
   * - Non-compliant resources are flagged or remediated
   * - Control appears as "Enabled" in Control Tower console
   *
   * **Disabled (`false`):**
   * - Control is inactive and not enforcing policy
   * - No compliance monitoring occurs
   * - Existing violations are not flagged
   * - Control appears as "Disabled" in Control Tower console
   *
   * ### Usage Examples
   *
   * ```yaml
   * # Enable a security control
   * - identifier: AWS-GR_RDS_INSTANCE_PUBLIC_ACCESS_CHECK
   *   enable: true    # Control will be enabled
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Production
   *
   * # Disable a control (useful for temporary exceptions)
   * - identifier: AWS-GR_EC2_INSTANCE_IMDSv2_CHECK
   *   enable: false   # Control will be disabled
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Development
   * ```
   *
   */
  readonly enable: boolean;

  /**
   * **Deployment Targets** *(Required)*
   *
   * Specifies the organizational units where this control should be applied.
   * Controls can only be deployed to OUs, not individual accounts.
   *
   * ### Organizational Unit Targeting
   *
   * Controls are applied at the OU level and automatically affect:
   * - All current accounts in the target OU
   * - All future accounts added to the target OU
   * - Child OUs and their accounts (inheritance)
   *
   * ### Usage Examples
   *
   * ```yaml
   * deploymentTargets:
   *   organizationalUnits:
   *     - Production
   *     - Staging
   *     - Development
   *
   * # Root OU deployment (affects all accounts)
   * deploymentTargets:
   *   organizationalUnits:
   *     - Root
   * ```
   *
   * ### OU Restrictions
   *
   * **Security OU Limitations:**
   * - Some controls cannot be deployed to the Security OU
   * - Check AWS documentation for specific control compatibility
   * - Alternative controls may be available for Security OU
   *
   * ### Validation Requirements
   *
   * - OU names must exactly match those defined in organization-config.yaml
   * - OUs must exist before control deployment
   * - Invalid OU names will cause deployment failures
   *
   * @see {@link t.IDeploymentTargets} for deployment target configuration
   * @see [Security OU Exceptions](https://docs.aws.amazon.com/controltower/latest/controlreference/exception-to-controls-security-ou.html)
   */
  readonly deploymentTargets: t.IDeploymentTargets;

  /**
   * **Regional Scope** *(Optional)*
   *
   * Specifies the AWS regions where this control should be enabled.
   * If not specified, the control is enabled in the home region only.
   *
   * ### Regional Deployment
   *
   * **Global Controls:**
   * - Some controls are inherently global (e.g., IAM-related controls)
   * - Regional specification is ignored for global controls
   * - Applied once per account regardless of region list
   *
   * **Regional Controls:**
   * - Most controls are region-specific (e.g., EC2, VPC controls)
   * - Must be explicitly enabled in each target region
   * - Each region deployment counts as a separate operation
   *
   * ### Usage Examples
   *
   * ```yaml
   * regions:
   *   - us-east-1
   *   - us-west-2
   *   - eu-west-1
   * ```
   *
   * ### Important Considerations
   *
   * - Each region deployment counts toward the 10 concurrent operation limit
   * - Regions must be listed in the `enabledRegions` section of global-config.yaml
   * - Invalid regions will cause deployment failures
   *
   * @default Home region only
   */
  readonly regions?: string[];
}

/**
 *
 * ## Control Tower Landing Zone Configuration
 *
 * Configure the Control Tower Landing Zone's settings.
 *
 * **Key Features**
 * - Specify the Landing Zone Version
 * - Customize log retention to meet regulatory compliance
 * - Manage Identity Center Access for Control Tower Landing Zone
 *
 * ## Example
 * ```yaml
 * landingZone:
 *   version: '3.3'
 *   logging:
 *     loggingBucketRetentionDays: 365
 *     accessLoggingBucketRetentionDays: 365
 *     organizationTrail: true
 *   security:
 *     enableIdentityCenterAccess: true
 * ```
 *
 * @category Global Configuration
 */
export interface IControlTowerLandingZoneConfig {
  /**
   * **Landing Zone Version** *(Required)*
   *
   * **Considerations**
   *
   * - Most recent version required for landing zone updates or resets
   * - Updates or resets will occur when drift is detected or any configuration change
   * - If the solution needs to perform an update or reset and the version is not the most recent, the solution will fail
   *
   */
  readonly version: string;

  /**
   * **Logging Configuration** *(Required)*
   *
   *
   * - **Retention Policies**: Configure log retention periods for compliance
   * - **Organization Trail**: Enable organization-wide CloudTrail logging
   * - **Access Logging**: Configure access log retention for audit trails
   *
   * @see {@link IControlTowerLandingZoneLoggingConfig} for more information.
   */
  readonly logging: IControlTowerLandingZoneLoggingConfig;
  /**
   * **Security Configuration** *(Required)*
   *
   * Manage Identity Center Acess for Control Tower Landing Zone.
   *
   * @see {@link IControlTowerLandingZoneSecurityConfig} for more information.
   */
  readonly security: IControlTowerLandingZoneSecurityConfig;
}

/**
 * ## AWS Control Tower Landing Zone Logging Configuration
 *
 * Logging configuration for the landing zone.
 *
 * ### Key Features
 *
 * - **Log Retention**: Configure log retention time
 * - **Organization-Level CloudTrail**: Enable/Disable organization-level CloudTrail
 *
 * ### Usage Example
 *
 * ```yaml
 * logging:
 *   loggingBucketRetentionDays: 365
 *   accessLoggingBucketRetentionDays: 365
 *   organizationTrail: true
 * ```
 *
 * @category Global Configuration
 * @see {https://docs.aws.amazon.com/awscloudtrail/latest/userguide/creating-trail-organization.html | Creating a trail for an organization} for more information
 */
export interface IControlTowerLandingZoneLoggingConfig {
  /**
   * **Bucket Retention Configuration** *(Required)*
   *
   * Retention time, in days, of the Amazon S3 log archive bucket
   *
   * @default 365
   */
  readonly loggingBucketRetentionDays: number;
  /**
   *
   * **Access Logs Retention Time** *(Required)*
   *
   * Retention time, in days, of the bucket access logs
   *
   * @default 365
   */
  readonly accessLoggingBucketRetentionDays: number;
  /**
   *
   * **Organization-Level CloudTrail** *(Required)*
   *
   * Whether or not to enable organization-level CloudTrail.
   *
   * **Important Considerations**
   *
   * - Organization-level CloudTrail is different than the CloudTrail deployed by the solution
   * - If both organization-level CloudTrail and solution defined CloudTrail are enabled, multiple trails will be created
   *
   * @default true
   */
  readonly organizationTrail: boolean;
}

/**
 * ## Control Tower Landing Zone Security Configuration
 *
 * Configure security settings and access controls for the AWS Control Tower Landing Zone deployment.
 * This configuration manages identity and access management integration with AWS services.
 * ### Important Considerations
 *
 * - Identity Center access affects how users authenticate to AWS accounts in the organization
 * - When enabled, Control Tower automatically configures permission sets and account assignments
 * - Disabling may impact existing user access patterns and require manual IAM configuration
 * - Changes to this configuration may trigger a Control Tower Landing Zone update
 *
 * ### Usage Example
 *
 * ```yaml
 * security:
 *   enableIdentityCenterAccess: true
 * ```
 *
 * @category Global Configuration
 * @see {@link https://docs.aws.amazon.com/controltower/latest/userguide/sso.html | Control Tower and IAM Identity Center} for more information
 */
export interface IControlTowerLandingZoneSecurityConfig {
  /**
   * **Identity Center Access** *(Required)*
   *
   * When enabled, AWS Control Tower sets up AWS account access with IAM Identity Center.
   *
   * @default
   * true
   */
  readonly enableIdentityCenterAccess: boolean;
}

/**
 *
 * ## S3 Global Configuration
 *
 * Manage S3 settings for accounts managed by the LZA deployment.
 * Configure the encryption settings for S3 buckets used throughout the deployment.
 *
 * ### Example
 * ```yaml
 * s3:
 *  encryption:
 *    createCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 *
 * @category Global Configuration
 */
export interface IS3GlobalConfig {
  /**
   * **S3 Encryption Configuration** *(Optional)*
   *
   * Allows for the configuration of the encryption method for S3 buckets.
   *
   * **Important Considerations**
   * - In the absence of this property, the solution will use AWS KMS CMK in every environment
   * - The solution will disregard this property and create CMKs for the installer bucket, pipeline bucket, and solution deployed CentralLogs bucket as AWS KMS CMK is always used for these buckets
   *
   * **Example**
   * ```yaml
   * encryption:
   *   createCMK: false
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   * ```
   * @default undefined
   */
  readonly encryption?: IS3EncryptionConfig;
}

/**
 * ## S3 Encryption Configuration
 *
 * Configure encryption settings for S3 buckets deployed by the Landing Zone Accelerator.
 * This configuration allows you to control whether AWS KMS Customer Managed Keys (CMKs)
 * are used for S3 server-side encryption across your organization.
 *
 * ### Key Features
 *
 * - **Flexible Encryption**: Choose between AWS KMS CMK or default S3 encryption
 * - **Targeted Deployment**: Apply encryption settings to specific organizational units or accounts
 * - **Compliance Support**: Helps meet regulatory requirements for data encryption at rest
 *
 * ### Important Considerations
 *
 * - **Always Encrypted Buckets**: The following buckets always use CMK regardless of this setting:
 *   - LZA Installer bucket
 *   - CodePipeline artifact bucket
 *   - Solution-deployed CentralLogs bucket
 *
 * ### Example
 * ```yaml
 * encryption:
 *   createCMK: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Security
 *       - Production
 *     excludedAccounts:
 *       - Development
 * ```
 *
 * @category Global Configuration
 * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/serv-side-encryption.html | Protecting data with server-side encryption} for more information
 */
export interface IS3EncryptionConfig {
  /**
   *
   * **Create CMK** *(Required)*
   *
   * When enabled, the solution will create use AWS KMS CMK for S3 server-side encryption.
   * The following buckets always use CMK regardless of this settings:
   *
   * - Installer bucket
   * - Pipeline bucket
   * - Solution-deployed CentralLogs bucket
   *
   * @default true
   */
  readonly createCMK: boolean;
  /**
   *
   * **Deployment Targets** *(Optional)*
   *
   * Enables the control of which environments will use AWS KMS CMK for S# encryption.
   * Leaving `deploymentTargets` undefined will apply `createCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 *
 * ## Centralized CDK Buckets Configuration**
 *
 * @deprecated Use {@link cdkOptionsConfig}
 *
 * ### Example
 * ```yaml
 * centralizeCdkBuckets:
 *   enable: true
 * ```
 *
 * @category Global Configuration
 */
export interface ICentralizeCdkBucketsConfig {
  /**
   * @deprecated Use {@link cdkOptionsConfig}
   *
   * **Enable** *(Required)*
   *
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly enable: boolean;
}

/**
 *
 * ## CDK Options
 *
 * Manage the behavior of CDK within LZA.
 *
 * ### Key Features
 * - **Centralize Buckets**: Determines whether CDK will use a single, centralized S3 bucket per region
 * - **Deployment Role Management**: Determines whether CDK will use a custom execution role for CDK operations
 *
 * ### Example
 * ```yaml
 * cdkOptions:
 *   centralizeBuckets: true
 *   useManagementAccessRole: true
 *   deploymentMethod: 'direct'
 * ```
 *
 * @category Global Configuration
 */
export interface ICdkOptionsConfig {
  /**
   *
   * **Centralize Buckets** *(Required)*
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account. Enabling this feature will utilize an S3 bucket within the management account instead.
   */
  readonly centralizeBuckets: boolean;
  /**
   * **Use Management Access Role** *(Required)*
   *
   * Indicates whether CDK operations use the IAM role specified in the {@link IGlobalConfig.managementAccountAccessRole | `managementAccountAccessRole` option in the global config} rather than the default roles created by CDK.
   *
   * @see {@link  | https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract | CDK Bootstrapping} for more information on default IAM roles created by the CDK
   */
  readonly useManagementAccessRole: boolean;
  /**
   *
   * **Custom Deployment Role** *(Optional)*
   *
   * Create a deployment role in all accounts in the home region with the specified name. This role is used by the LZA for all CDK deployment tasks.
   *
   */
  readonly customDeploymentRole?: string;
  /**
   * **Force Bootstrap** *(Optional)*
   *
   * Forces the Accelerator to deploy the bootstrapping stack and circumvent the SSM parameter check. This option is needed when adding or removing a custom deployment role
   *
   * @default false
   */
  readonly forceBootstrap?: boolean;
  /**
   * **Deployment Method** *(Optional)*
   *
   * Manage the CDK deployment method for the LZA
   *
   * **Options**
   * - **'direct'**: Default used by the LZA
   * - **'change-set'**: Provides additional progress information, can increase deployment time
   *
   *
   * @default 'direct'
   */
  readonly deploymentMethod?: 'change-set' | 'direct';
  /**
   * ** Skip Static Validation** *(Optional)*
   *
   * When enabled, the LZA pipeline will skip the static config validation step during the build phase.
   * Helpful in cases where the config validator incorrectly throws errors for a valid configuration.
   *
   */
  readonly skipStaticValidation?: boolean | undefined;
}

/**
 * ## External Landing Zone Resources Configuration
 *
 * Used for importing resources from an Amazon Secure Environment Accelerator (ASEA) environment into the LZA.
 *
 * ### Example
 * ```yaml
 * externalLandingZoneResourcesConfig:
 *   importExternalLandingZoneResources: true
 * ```
 *
 * @category Global Configuration
 * @see {https://aws-samples.github.io/aws-secure-environment-accelerator/v1.6.5/lza-upgrade/preparation/prereq-config/#confirm-outputs | LZA upgrade documentation} for more information on migrating ASEA to LZA
 */
export interface IExternalLandingZoneResourcesConfig {
  /**
   * **Import External Landing Zone Resources** *(Required)*
   *
   * Setting this flag indicates that this is an Amazon Secure Environment Accelerator (ASEA) environment and imports ASEA resources to the LZA.
   *
   */
  readonly importExternalLandingZoneResources: boolean;
  /**
   * **Mapping File Bucket** *(Optional)*
   *
   * The name of the bucket that contains the mapping file.
   *
   * @see {https://aws-samples.github.io/aws-secure-environment-accelerator/v1.6.5/lza-upgrade/preparation/prereq-config/#confirm-outputs | LZA upgrade documentation} for more information on migrating ASEA to LZA
   *
   */
  readonly mappingFileBucket?: string;
  /**
   * **Accelerator Prefix** *(Required)*
   *
   * Accelerator Prefix used in the ASEA deployment
   */
  readonly acceleratorPrefix: t.NonEmptyString;
  /**
   * **Accelerator Name** *(Required)*
   *
   * Accelerator Name used in the ASEA deployment
   */
  readonly acceleratorName: t.NonEmptyString;
}

/**
 *
 * ## Global Logging Configuration
 *
 * ### Example
 * ```yaml
 * logging:
 *   account: LogArchive
 *   centralizedLoggingRegion: us-east-1
 *   cloudtrail:
 *     enable: false
 *     organizationTrail: false
 *   sessionManager:
 *     sendToCloudWatchLogs: false
 *     sendToS3: true
 * ```
 *
 * @category Global Configuration
 */
export interface ILoggingConfig {
  /**
   * **Account Name** *(Required)*
   *
   * The name of the account used to store the logs.
   *
   * **Example
   * ```yaml
   * account: LogArchive
   * ```
   */
  readonly account: t.NonEmptyString;
  /**
   * **Centralized Logging Region** *(Optional)*
   *
   * The region used to store the logs. When not provided, the log bucket will be created in the home region.
   *
   */
  readonly centralizedLoggingRegion?: t.NonEmptyString;
  /**
   * **CloudTrail Configuration** *(Required)*
   *
   * Main configuration for CloudTrail
   *
   * **Key Features**
   * - Enable/Disable CloudTrail
   * - Setup organization-level trails
   * - Setup account-level trails
   *
   * @see {@link ICloudTrailConfig} for detailed parameter information
   */
  readonly cloudtrail: ICloudTrailConfig;
  /**
   * **SessionManager Configuration** *(Required)*
   *
   * Allows for the customization of SessionManager in the environment allowing the modifications such as where to save logs and what accounts to manage.
   *
   * @see {@link ISessionManagerConfig} for detailed parameter information
   */
  readonly sessionManager: ISessionManagerConfig;
  /**
   * **Access Logs Bucket** *(Optional)*
   *
   * Used to define and configure the access logs bucket for the solution.
   *
   * @see {@link IAccessLogBucketConfig} for detailed parameter information
   */
  readonly accessLogBucket?: IAccessLogBucketConfig;
  /**
   * **Asset Bucket** *(Optional)*
   *
   * Used to define and configure the asset bucket for the solution.
   *
   * @see {@link IAssetBucketConfig} for detailed parameter information
   */
  readonly assetBucket?: IAssetBucketConfig;
  /**
   * **Central Log Bucket** *(Optional)*
   *
   * Used to define and configure the central logs bucket for the solution
   *
   * @see {@link ICentralLogBucketConfig} for detailed parameter information
   */
  readonly centralLogBucket?: ICentralLogBucketConfig;
  /**
   * **ELB Log Bucket** *(Optional)*
   *
   * Used to define and configure the ELB logs bucket for the solution
   *
   * @see {@link IElbLogBucketConfig}
   * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html | Access Logs for you Application Load Balancer} for more information
   */
  readonly elbLogBucket?: IElbLogBucketConfig;
  /**
   * **CloudWatch Logs Configuration** *(Optional)*
   *
   * Configure CloudWatch logs for the solution.
   *
   * **Key Features**
   * - Configure encryption at rest
   * - Enable replication
   * - Configure CloudWatch logs subscriptions
   *
   * @see {@link ICloudWatchLogsConfig}
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html | CloudWatch user guide} for more information on CloudWatch Logs.
   */
  readonly cloudwatchLogs?: ICloudWatchLogsConfig;
}

/**
 *
 * ## Cloudtrail Configuration
 *
 * Used to enable and configure CloudTrail for the LZA deployment.
 *
 * ### Example
 * ```yaml
 * cloudtrail:
 *   enable: true
 *   organizationTrail: true
 *   organizationTrailSettings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 *   accountTrails: []
 *   lifecycleRules: []
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudTrailConfig {
  /**
   * **Enable** *(Required)*
   *
   * Whether or not to enable CloudTrail. This setting alone does not create any trails.
   * Enabling {@link ICloudTrailConfig.organizationTrail} will create an organization-level trail.
   * Additionally, you can setup account-level trails.
   */
  readonly enable: boolean;
  /**
   * **Organization Trail** *(Required)*
   *
   * When enabled alongside {@link ICloudTrailConfig.enable}, LZA will create an organization-level trail.
   */
  readonly organizationTrail: boolean;
  /**
   * **Organization Trail Settings** *(Optional)*
   *
   * Contains optional settings for the organization-level trail.
   */
  readonly organizationTrailSettings?: ICloudTrailSettingsConfig;
  /**
   * **Account Trails** *(Optional)*
   *
   * Configurations for account-level trails to be created by the LZA deployment.
   */
  readonly accountTrails?: IAccountCloudTrailConfig[];
  /**
   * **S3 Log Bucket Lifecycle Rules** *(Optional)*
   *
   * Optional lifecycle rules for the S3 log bucket
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 *
 * ## Cloud Trail Settings Configuration
 *
 * Additional settings used to configure an organization-level trail.
 *
 * ### Example
 * ```yaml
 * multiRegionTrail: true
 * globalServiceEvents: true
 * managementEvents: true
 * s3DataEvents: true
 * lambdaDataEvents: true
 * sendToCloudWatchLogs: true
 * apiErrorRateInsight: false
 * apiCallRateInsight: false
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudTrailSettingsConfig {
  /**
   * **Multi-Region Trail** *(Required)*
   *
   * Determines whether or not this trail delivers log files from all regions to the account.
   */
  multiRegionTrail: boolean;
  /**
   * **Global Service Events** *(Required)*
   *
   * For global services, events are delivered to any trail that includes global services and are logged in the us-east-1 region.
   */
  globalServiceEvents: boolean;
  /**
   * **Management Events** *(Required)*
   *
   * Whether or not to log management events, or control plane operations.
   * Management events can also include non-API events that occur in your account, such as a user logging in to the account.
   * Enabling sets ReadWriteType.ALL.
   *
   */
  managementEvents: boolean;
  /**
   * **S3 Data Events** *(Required)*
   *
   * Adds an S3 Data Event Selector for filtering events that match S3 operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   *
   * **Considerations**
   * By default, this feature is enabled and will incur additional costs if enabled for your CloudTrail.
   *
   * @default true
   *
   * @see {@link https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html | Logging data events with CloudTrail} for more information about data events
   * @see {@link  https://aws.amazon.com/cloudtrail/pricing/ | CloudTrail pricing} for additional information about pricing
   */
  s3DataEvents: boolean;
  /**
   * **Lambda Data Events** *(Required)*
   *
   *
   *
   * Adds an Lambda Data Event Selector for filtering events that match Lambda operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   *
   * **Considerations**
   * By default, this feature is enabled and will incur additional costs if enabled for your CloudTrail.
   *
   * @default true
   *
   * @see {@link https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html | Logging data events with CloudTrail} for more information about data events
   * @see {@link  https://aws.amazon.com/cloudtrail/pricing/ | CloudTrail pricing} for additional information about pricing
   */
  lambdaDataEvents: boolean;
  /**
   *
   * **Send to CloudWatch Logs** *(Required)*
   *
   * Determines whether CloudTrail pushes logs to CloudWatch logs in addition to S3.
   *
   */
  sendToCloudWatchLogs: boolean;
  /**
   * **API Error Rate Insight** *(Required)*
   *
   * Will enable CloudTrail insights and enable the API Error Rate Insight
   *
   * @see {@link https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-insights-events-with-cloudtrail.html | Working with CloudTrail Insights} for more information
   */
  readonly apiErrorRateInsight: boolean;
  /**
   * **API Call Rate Insight** *(Required)*
   *
   * Will enable CloudTrail Insights and enable the API Call Rate Insight
   *
   * @see {@link https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-insights-events-with-cloudtrail.html | Working with CloudTrail Insights} for more information
   */
  readonly apiCallRateInsight: boolean;
}

/**
 * ## Account Cloud Trail Configuration
 *
 * Configuration options for account-level trails.
 *
 * ### Example
 * ```yaml
 * - name: AWSAccelerator-Account-CloudTrail
 *   regions:
 *     - us-east-1
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   settings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 * ```
 *
 * @category Global Configuration
 */
export interface IAccountCloudTrailConfig {
  /**
   * **Name** *(Required)*
   *
   * The name that will be used to create the trail.
   */
  readonly name: string;
  /**
   * **Regions** *(Required)*
   *
   * Determines which region(s) that this account trail will be deployed in.
   */
  readonly regions: t.NonEmptyString[];
  /**
   * **Deployment Targets** *(Required)*
   *
   * Determines which OU's or Accounts the trail will be deployed to
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * **Settings** *(Required)*
   *
   * Additional settings for the trail
   * @see {@link ICloudTrailSettingsConfig} for more information
   */
  readonly settings: ICloudTrailSettingsConfig;
}

/**
 *
 * ## AWS Service Quotas Configuration
 *
 * Used request increases to AWS service quotas (formerly known as service limits).
 * Service quotas are the maximum number of service resources or operations for your AWS account.
 * Service quota increases are requested asynchronously and may take time to be approved.
 * Some quotas require AWS Support cases and cannot be increased automatically.
 * You can find service codes and quota codes in the AWS Service Quotas console.
 *
 *
 * ### Example
 * ```yaml
 * # Increase Lambda concurrent executions
 * - serviceCode: lambda
 *   quotaCode: L-B99A9384
 *   desiredValue: 1000
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   regions:
 *     - us-west-2
 *
 * # Increase IAM roles per account (global quota - no regions needed)
 * - serviceCode: iam
 *   quotaCode: L-4019AD8B
 *   desiredValue: 15
 *   deploymentTargets:
 *     accounts:
 *       - SharedServices
 *
 * # Increase VPCs per region
 * - serviceCode: vpc
 *   quotaCode: L-F678F1CE
 *   desiredValue: 20
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Security
 *       - Infrastructure
 *   regions:
 *     - us-east-1
 *     - us-west-2
 *
 * # Increase Route 53 Resolver rules per region
 * - serviceCode: route53resolver
 *   quotaCode: L-4A669CC0
 *   desiredValue: 10
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/servicequotas/latest/userguide/intro.html | What is service quotas} for more information on service quotas.
 * @see {@link https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html | Requesting a quota increase} for additional information on the request process.
 *
 * @category Global Configuration
 */
export interface IServiceQuotaLimitsConfig {
  /**
   * **Service Code** *(Required)*
   *
   * Indicates which service Service Quota we are requesting a change for.
   * You can find service codes the console or using the AWS CLI command: `aws service-quotas list-services`.
   *
   * Example service codes (verify current codes in AWS console):
   * - lambda (AWS Lambda)
   * - iam (AWS Identity and Access Management)
   * - vpc (Amazon Virtual Private Cloud)
   * - route53resolver (Amazon Route 53 Resolver)
   */
  readonly serviceCode: string;
  /**
   * **Quota Code** *(Required)*
   *
   * Indicates the specific quota we are requesting a change for within the given service.
   * You can find the quota codes in the console or using the AWS CLI command: `aws service-quotas list-service-quotas --service-code <service-code>`.
   *
   * Example quota codes (verify current codes in AWS console):
   * - L-B99A9384 (Lambda concurrent executions)
   * - L-4019AD8B (IAM roles per account)
   * - L-F678F1CE (VPCs per region)
   * - L-4A669CC0 (Route 53 Resolver rules per region)
   */
  readonly quotaCode: string;
  /**
   * **Desired Value** *(Required)*
   *
   * The new limit you want to request for. The value must be higher than the current quota value.
   * Some quotas have maximum values that cannot be exceeded.
   *
   */
  readonly desiredValue: number;
  /**
   * **Deployment Targets** *(Required)*
   *
   * Used to specify the accounts that should be included in the Service Quota changes.
   * Additionally, you can target specific accounts or entire organizational units.
   *
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * **Regions** *(Optional)*
   *
   * Regions where this service quota increase will be requested. If undefined, the increase will only be requested in the home region.
   * Specified regions must also be listed in the enabledRegions section. Some quotas are global (like IAM) and don't require region specification.
   *
   */
  readonly regions?: string[];
}

/**
 *
 * ## SessionManager Configuration
 *
 * ### Example
 * ```yaml
 * sessionManager:
 *   sendToCloudWatchLogs: true
 *   sendToS3: true
 *   excludeRegions: []
 *   excludeAccounts: []
 *   lifecycleRules: []
 *   attachPolicyToIamRoles:
 *     - EC2-Default-SSM-AD-Role
 * ```
 *
 * @category Global Configuration
 *
 * @see {@link https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html | Session Manager guide} for more information on Session Manager
 */
export interface ISessionManagerConfig {
  /**
   * **Send to CloudWatch Logs** *(Required)*
   *
   * Determines whether sending SessionManager logs to CloudWatch logs is enabled.
   */
  readonly sendToCloudWatchLogs: boolean;
  /**
   * **Send to S3** *(Required)*
   *
   * Determines whether sending SessionManager logs to S3 is enabled.
   * When enabled, the accelerator will send the session manager logs to the central log bucket in the LogArchive account.
   *
   */
  readonly sendToS3: boolean;
  /**
   * **Excluded Regions** *(Optional)*
   *
   * List of AWS Region names to be excluded from this SessionManager configuration
   */
  readonly excludeRegions?: string[];
  /**
   * **Excluded Accounts** *(Optional)*
   *
   * List of AWS Account names to be excluded from this SessionManager configuration
   */
  readonly excludeAccounts?: string[];
  /**
   * **S3 Lifecycle Rules** *(Optional)*
   *
   * Defines the lifecycle rules for the S3 bucket containing the logs.
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   *
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * **Attach Policy to IAM Roles** *(Optional)*
   *
   * A list of IAM Ec2 roles that the Session Manager access policy should be attached to.
   *
   */
  readonly attachPolicyToIamRoles?: string[];
}

/**
 *
 * ## Asset Bucket Configuration
 *
 * Configuration for the asset bucket.
 *
 * ### Key Features
 * - **Resource Policies**: Attach resource policies to the bucket
 * - **KMS Policy**: Apply KMS policy to the bucket encryption key
 * - **Imported Bucket**: Import existing bucket and apply resource policies and encryption key policies
 *
 * ### Example
 * ```yaml
 * assetBucket:
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: aws-accelerator-assets
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 *
 * @category Global Configuration
 */
export interface IAssetBucketConfig {
  /**
   * **S3 Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket resource policy.
   * This property cannot be used when customPolicyOverrides.s3Policy property has value.
   *
   * **Note**: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   *
   * **Example
   * ```yaml
   * s3ResourcePolicyAttachments:
   *   - policy: s3-policies/policy1.json
   *   - policy: s3-policies/policy2.json
   * ```
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **KMS Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket resource policy.
   *
   * **Notes**
   * - Cannot be used when customPolicyOverrides.kmsPolicy property has value.
   * - When importing an assets bucket with createAcceleratorManagedKey set to false, this property must be undefined
   * - The Assets Bucket will allow customers to have SSE-S3 (Amazon S3 managed keys) or SSE-KMS keys. Only SSE-KMS keys can adopt the KMS resource policy files.
   *
   */
  readonly kmsResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **Imported Bucket Configuration** *(Optional)*
   *
   * When set, the accelerator will import an existing assets bucket.
   *
   * Use the following configuration to imported Assets bucket, manage bucket resource policy and apply bucket encryption through the solution.
   *
   * **Note**: When importing your own Assets S3 Bucket, be sure to create it in the `Management` account in the `home` region.
   *
   * **Example
   * ```yaml
   * importedBucket:
   *    name: aws-assets
   *    applyAcceleratorManagedBucketPolicy: true
   *    createAcceleratorManagedKey: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedCustomerManagedEncryptionKeyBucketConfig;
  /**
   * **Custom Policy Overrides Configuration** *(Optional)*
   *
   * Provide policy overrides. Policy files must contain a complete policy document.
   *
   * **Conflicts**
   * - When s3Policy is defined, importedBucket.applyAcceleratorManagedBucketPolicy cannot be true
   * - When s3Policy is defined, seResourcePolicyAttachments cannot be defined
   * - When kmsPolicy is defined, importedBucket.createAcceleratorManagedKey cannot be true
   * - When kmsPolicy is defined, kmsResourcePolicyAttachments cannot be defined
   *
   * **Example**
   * ```yaml
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.CustomS3ResourceAndKmsPolicyOverridesConfig;
}

/**
 *
 * ## Access Log Bucket Configuration
 *
 * Configuration for the access log bucket used to store S3 server access logs.
 *
 * ### Key Features
 * - **Resource Policies**: Attach resource policies to the bucket
 * - **Lifecycle Management**: Configure lifecycle rules for log retention and cost optimization
 * - **Imported Bucket**: Import existing bucket and apply resource policies
 * - **Deployment Targeting**: Control which accounts and regions receive the configuration
 *
 * ### Example
 * ```yaml
 * accessLogBucket:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   lifecycleRules:
 *     - enabled: true
 *       id: AccessLifecycle-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   importedBucket:
 *     name: existing-access-log-bucket-${ACCOUNT_ID}-${REGION}
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 *
 * @category Global Configuration
 */
export interface IAccessLogBucketConfig {
  /**
   * **S3 Lifecycle Rules** *(Optional)*
   *
   * Configure lifecycle rules for the access log bucket to manage log retention and storage costs.
   * Rules can transition logs to different storage classes and set expiration policies.
   *
   * **Example**
   * ```yaml
   * lifecycleRules:
   *   - enabled: true
   *     id: AccessLifecycle-01
   *     expiration: 365
   *     transitions:
   *       - storageClass: GLACIER
   *         transitionAfter: 30
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   *
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * **Enable Access Log Bucket** *(Optional)*
   *
   * Controls whether the S3 access logging bucket is created by the solution.
   * When undefined, the solution will create access log buckets automatically.
   *
   * **Important Notes**
   * - Access log buckets are always created for critical solution buckets (installer, pipeline, central logs, assets)
   * - Use deploymentTargets to control which accounts and regions receive this configuration
   * - This setting primarily affects additional access log buckets beyond the core solution buckets
   *
   * @default true
   */
  readonly enable?: boolean;
  /**
   * **Deployment Targets** *(Optional)*
   *
   * Specifies which accounts and regions should receive the access log bucket configuration.
   * When undefined, the configuration applies to all accounts and enabled regions.
   *
   * **Example**
   * ```yaml
   * deploymentTargets:
   *   organizationalUnits:
   *     - Root
   *   excludedRegions:
   *     - us-west-1
   * ```
   *
   * @default All accounts and enabled regions
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * **S3 Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket resource policy.
   * This property cannot be used when customPolicyOverrides.s3Policy property has value.
   *
   * **Note**: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   *
   * **Example**
   * ```yaml
   * s3ResourcePolicyAttachments:
   *   - policy: s3-policies/access-log-policy.json
   *   - policy: s3-policies/cross-account-access.json
   * ```
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **Imported Bucket Configuration** *(Optional)*
   *
   * When set, the accelerator will import an existing access logs bucket.
   *
   * Use this configuration to import an existing access logs bucket and manage its resource policy through the solution.
   *
   * **Important Requirements**
   * - Both source and destination buckets must be in the same AWS Region and owned by the same account
   * - The bucket must be pre-created in each target account and region using a repeatable naming pattern
   * - Include ${ACCOUNT_ID} and ${REGION} parameters in your naming pattern for automatic population
   *
   * **Example**
   * ```yaml
   * importedBucket:
   *   name: existing-access-log-bucket-${ACCOUNT_ID}-${REGION}
   *   applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * **Custom Policy Overrides Configuration** *(Optional)*
   *
   * Provide policy overrides. Policy files must contain a complete policy document.
   *
   * **Conflicts**
   * - When s3Policy is defined, importedBucket.applyAcceleratorManagedBucketPolicy cannot be true
   * - When s3Policy is defined, s3ResourcePolicyAttachments cannot be defined
   *
   * **Example**
   * ```yaml
   * customPolicyOverrides:
   *   s3Policy: path/to/access-log-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourcePolicyOverridesConfig;
}

/**
 *
 * ## Central Log Bucket Configuration
 *
 * Configuration for the central log bucket used to store centralized logs from across the organization.
 *
 * ### Key Features
 * - **Resource Policies**: Attach resource policies to the bucket
 * - **KMS Policy**: Apply KMS policy to the bucket encryption key
 * - **Lifecycle Management**: Configure lifecycle rules for log retention and cost optimization
 * - **Imported Bucket**: Import existing bucket and apply resource policies and encryption key policies
 *
 * ### Example
 * ```yaml
 * centralLogBucket:
 *   lifecycleRules:
 *     - enabled: true
 *       id: CentralLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   kmsResourcePolicyAttachments:
 *     - policy: kms-policies/policy1.json
 *   importedBucket:
 *     name: central-log-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 *     createAcceleratorManagedKey: false
 * ```
 *
 * @category Global Configuration
 */
export interface ICentralLogBucketConfig {
  /**
   * **S3 Lifecycle Rules** *(Optional)*
   *
   * Configure lifecycle rules for the central log bucket to manage log retention and storage costs.
   * Rules can transition logs to different storage classes and set expiration policies.
   *
   * **Example**
   * ```yaml
   * lifecycleRules:
   *   - enabled: true
   *     id: CentralLifecycleRule-01
   *     expiration: 365
   *     transitions:
   *       - storageClass: GLACIER
   *         transitionAfter: 30
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   *
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * **S3 Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket resource policy.
   * This property cannot be used when customPolicyOverrides.s3Policy property has value.
   *
   * **Note**: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   *
   * **Example**
   * ```yaml
   * s3ResourcePolicyAttachments:
   *   - policy: s3-policies/central-log-policy.json
   *   - policy: s3-policies/cross-account-access.json
   * ```
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **KMS Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket encryption key policy.
   *
   * **Notes**
   * - Cannot be used when customPolicyOverrides.kmsPolicy property has value
   * - When importing a central logs bucket with createAcceleratorManagedKey set to false, this property must be undefined
   * - The Central Logs Bucket will allow customers to have SSE-S3 (Amazon S3 managed keys) or SSE-KMS keys. Only SSE-KMS keys can adopt the KMS resource policy files.
   *
   * **Example**
   * ```yaml
   * kmsResourcePolicyAttachments:
   *   - policy: kms-policies/central-log-key-policy.json
   * ```
   */
  readonly kmsResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **Imported Bucket Configuration** *(Optional)*
   *
   * When set, the accelerator will import an existing central logs bucket.
   *
   * Use this configuration to import an existing central logs bucket, manage bucket resource policy and KMS policy through the solution.
   *
   * **Example**
   * ```yaml
   * importedBucket:
   *   name: existing-central-log-bucket
   *   applyAcceleratorManagedBucketPolicy: true
   *   createAcceleratorManagedKey: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * **Custom Policy Overrides Configuration** *(Optional)*
   *
   * Provide policy overrides. Policy files must contain a complete policy document.
   *
   * **Conflicts**
   * - When s3Policy is defined, importedBucket.applyAcceleratorManagedBucketPolicy cannot be true
   * - When s3Policy is defined, s3ResourcePolicyAttachments cannot be defined
   * - When kmsPolicy is defined, importedBucket.createAcceleratorManagedKey cannot be true
   * - When kmsPolicy is defined, kmsResourcePolicyAttachments cannot be defined
   *
   * **Example**
   * ```yaml
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourceAndKmsPolicyOverridesConfig;
}

/**
 *
 * ## ELB Log Bucket Configuration
 *
 * Configuration for the ELB log bucket used to store Elastic Load Balancer access logs.
 *
 * ### Key Features
 * - **Resource Policies**: Attach resource policies to the bucket
 * - **Lifecycle Management**: Configure lifecycle rules for log retention and cost optimization
 * - **Imported Bucket**: Import existing bucket and apply resource policies
 * - **Regional Deployment**: Deploy buckets in each operating region
 *
 * ### Example
 * ```yaml
 * elbLogBucket:
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: elb-logs-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 *
 * @category Global Configuration
 */
export interface IElbLogBucketConfig {
  /**
   * **S3 Lifecycle Rules** *(Optional)*
   *
   * Configure lifecycle rules for the ELB log bucket to manage log retention and storage costs.
   * Rules can transition logs to different storage classes and set expiration policies.
   *
   * **Example**
   * ```yaml
   * lifecycleRules:
   *   - enabled: true
   *     id: ElbLifecycleRule-01
   *     expiration: 365
   *     transitions:
   *       - storageClass: GLACIER
   *         transitionAfter: 30
   * ```
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   *
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * **S3 Resource Policy Attachments** *(Optional)*
   *
   * Policy statements from the listed files will be added to the bucket resource policy.
   * This property cannot be used when customPolicyOverrides.s3Policy property has value.
   *
   * **Note**: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   *
   * **Example**
   * ```yaml
   * s3ResourcePolicyAttachments:
   *   - policy: s3-policies/elb-log-policy.json
   *   - policy: s3-policies/cross-account-access.json
   * ```
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * **Imported Bucket Configuration** *(Optional)*
   *
   * When set, the accelerator will import an existing ELB logs bucket.
   *
   * Use this configuration to import an existing ELB logs bucket and manage its resource policy through the solution.
   *
   * **Important Note**: If importing your own ELB Log buckets, be sure to create the buckets in the LogArchive account and a bucket within each operating region that LZA is configured in.
   *
   * **Example**
   * ```yaml
   * importedBucket:
   *   name: existing-elb-log-bucket
   *   applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * **Custom Policy Overrides Configuration** *(Optional)*
   *
   * Provide policy overrides. Policy files must contain a complete policy document.
   * Custom policy overrides can ONLY be applied to imported buckets.
   *
   * **Conflicts**
   * - When s3Policy is defined, importedBucket.applyAcceleratorManagedBucketPolicy cannot be true
   * - When s3Policy is defined, s3ResourcePolicyAttachments cannot be defined
   *
   * **Example**
   * ```yaml
   * customPolicyOverrides:
   *   s3Policy: path/to/elb-log-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourcePolicyOverridesConfig;
}

/**
 *
 * ## CloudWatch Logs Configuration
 *
 * ### Key Features
 * - Configure logs encryption
 * - Manage Subscriptions for CloudWatch Logs
 * - Enable CloudWatch Logs replication
 *
 * ### Example
 * ```yaml
 * cloudwatchLogs:
 *   dynamicPartitioning: path/to/filter.json
 *   # default is true, if undefined this is set to true
 *   # if set to false, no replication is performed which is useful in test or temporary environments
 *   enable: true
 *   encryption:
 *     useCMK: true
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *   replaceLogDestinationArn: arn:aws:logs:us-east-1:111111111111:destination:ReplaceDestination
 *   exclusions:
 *    # in these OUs do not do log replication
 *    - organizationalUnits:
 *        - Research
 *        - ProofOfConcept
 *      excludeAll: true
 *    # in these accounts exclude pattern testApp
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      logGroupNames:
 *        - testApp*
 *    # in these accounts exclude logs in specific regions
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      regions:
 *        - us-west-2
 *        - eu-west-1
 *      logGroupNames:
 *        - pattern1*
 *   dataProtection:
 *     managedDataIdentifiers:
 *       categories:
 *         - Credentials
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 * ```
 *
 * @category Global Configuration
 * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html | CloudWatch Logs user guide} for more information on CloudWatch Logs
 */
export interface ICloudWatchLogsConfig {
  /**
   * **Dynamic Partitioning for Kinesis Firehose** *(Optional)*
   *
   * Configure the prefixes log groups are archived under. The input should be the path to a JSON file containing an array of the log filters.
   *
   * **Example JSON format**
   * Each item should be of the format:
   * ```
   * { "logGroupPattern": string, "s3Prefix": string }
   * ```
   *
   * The following example will stream any log group with the name "LogGroupName" to `s3://<central-logs-bucket>/CloudWatchLogs/s3-prefix/`.
   * ```
   * { "logGroupPattern": "LogGroupName", "s3Prefix": "s3-prefix" }
   * ```
   *
   * You may use `*` for grouping log groups to the same prefix. In the following example, all log groups with a name starting with "Application" will be streamed to `s3://<central-logs-bucket>/CloudWatchLogs/app/`.
   * ```
   * [{ "logGroupPattern": "Application*", "s3Prefix": "app" }]
   * ```
   *
   * **Overlapping Patterns**
   *
   * Please ensure that patterns do not overlap. Logs are streamed only to one destination, so logs will not be replicated in the event that the log group name matches multiple patterns.
   *
   *
   * @see {@link | Centralized Logging} for more information on the LZA's logging architecture
   */
  readonly dynamicPartitioning?: t.NonEmptyString;
  /**
   * **Dynamic Partitioning by Account ID** *(Optional)*
   *
   * Whether or not the ID of the account that produced the CloudWatch Logs should be used in the partitioning strategy of the logs.
   * For example: `s3://<central-logs-bucket>/CloudWatchLogs/<account id>/`.
   *
   * **Use With Dynamic Partitioning**
   * If dynamicPartitioning is also being used, the Account ID will come before the supplied s3 prefix. For example the following would result in `s3://<central-logs-bucket>/CloudWatchLogs/<account id>/s3-prefix/` being used as the partition.
   *
   * ```
   * { "logGroupPattern": "LogGroupName", "s3Prefix": "s3-prefix" }
   * ```
   *
   */
  readonly dynamicPartitioningByAccountId?: boolean;
  /**
   * **Enable Replication** *(Optional)*
   *
   * Whether or not to enable CloudWatch Logs replication.
   *
   * @default true
   *
   */
  readonly enable?: boolean;
  /**
   * **Encryption** *(Optional)*
   *
   * Configure encryption for the CloudWatch Logs. If left undefined, an AWS KMS CMK will be used to encrypt the logs.
   *
   * @see {@link IServiceEncryptionConfig} for detailed parameter information
   */
  readonly encryption?: IServiceEncryptionConfig;
  /**
   * **Exclusions** *(Optional)*
   *
   * Configure log groups to exclude from replication.
   *
   * @see {@link ICloudWatchLogsExclusionConfig} for detailed parameter information
   *
   */
  readonly exclusions?: ICloudWatchLogsExclusionConfig[];
  /**
   * **Replace Log Destination** *(Optional)*
   *
   * The ARN of the current log subscription filter destination. LZA needs to disassociate this destination before configuring the LZA defined subscription filter destination.
   *
   * **Notes**
   * - When no value is provided, the solution will not attempt to remove the existing subscription filter destination
   * - When existing log group(s) have two subscription filter destinations defined, and none are LZA configured, the solution will fail to configure log replication and the pipeline will fail
   *
   * @default
   * undefined
   */
  readonly replaceLogDestinationArn?: t.NonEmptyString;
  /**
   * **Data Protection** *(Optional)*
   *
   * Configuration for CloudWatch Logs data protection
   *
   * @see {@link ICloudWatchDataProtectionConfig} for detailed parameter information
   */
  readonly dataProtection?: ICloudWatchDataProtectionConfig;
  /**
   * **Organization ID Condition** *(Optional)*
   *
   * Whether or not a list of account IDs is used instead of a principal organization condition in the CloudWatch Logs destination access policy.
   * Useful in partitions where the principal organization condition is not supported.
   *
   */
  readonly organizationIdConditionSupported?: boolean;

  /**
   * **Skip Bulk Update** *(Optional)*
   *
   * Whether or not the LZA pipeline should skip the bulk update of CloudWatch log groups.
   *
   * **Warning**: This configuration option could cause CloudWatch log group configurations to become out of sync with the global configuration. Only enable if you fully understand the implications.
   *
   * @see {@link ICloudWatchLogSkipBulkUpdateConfig} for detailed parameter information
   */
  readonly skipBulkUpdate?: ICloudWatchLogSkipBulkUpdateConfig;

  /**
   * **Subscription** *(Optional)*
   *
   * Configuration for the CloudWatch logs subscription.
   *
   * @see {@link ICloudWatchSubscriptionConfig}
   */
  readonly subscription?: ICloudWatchSubscriptionConfig;

  /**
   * **Firehose** *(Optional)*
   *
   * Configuration for the CloudWatch logs Firehose.
   *
   * @see {@link ICloudWatchFirehoseConfig} for detailed parameter information
   */
  readonly firehose?: ICloudWatchFirehoseConfig;

  /**
   * **Kinesis** *(Optional)*
   *
   * Configuration for the CloudWatch logs Kinesis.
   *
   * @see {@link ICloudWatchKinesisConfig} for detailed parameter information.
   */
  readonly kinesis?: ICloudWatchKinesisConfig;
}

/**
 *
 * ## CloudWatch Logs Exclusions Config
 *
 * Used to define which CloudWatch Logs Groups should be excluded.
 * Select groups based on accounts, regions, OUs, and log group names.
 *
 * ### Example
 * ```yaml
 * organizationalUnits:
 *  - Sandbox
 * regions:
 *  - us-west-1
 *  - us-west-2
 * accounts:
 *  - WorkloadAccount1
 * excludeAll: true
 * logGroupNames:
 *  - 'test/*'
 *  - '/appA/*'
 *
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchLogsExclusionConfig {
  /**
   * **Organizational Units** *(Optional)*
   *
   * List of OUs to exclude.
   */
  readonly organizationalUnits?: t.NonEmptyString[];
  /**
   * **Regions** *(Optional)*
   *
   * List of regions to exclude. If left undefined, exclusions will apply to all enabled regions.
   *
   */
  readonly regions?: string[];
  /**
   * **Accounts** *(Optional)*
   *
   * List of accounts where the exclusions will apply.
   *
   */
  readonly accounts?: t.NonEmptyString[];
  /**
   * **Exclude All** *(Optional)*
   *
   * Whether or not to exclude all logs.
   *
   * When true, all replication for the listed accounts/OUs will be disabled.
   * Setting the OU to `Root` with no region specified and having this true, will fail validation as this would be redundant.
   * Instead use {@link ICloudWatchLogsConfig.enable} to disable replication for the entire environment
   *
   * @default false
   */
  readonly excludeAll?: boolean;
  /**
   * **Log Group Names** *(Optional)*
   *
   * List of log group names to be excluded
   *
   * Wild cards are supported. If {@link ICloudWatchLogsExclusionConfig.excludeAll} is enabled, then this parameter is ignored.
   *
   */
  readonly logGroupNames?: t.NonEmptyString[];
}

/**
 *
 * ## Skip Bulk Update Configuration
 *
 * Configuration to skip the bulk update of CloudWatch Logs.
 * **Warning**: This configuration option could cause CloudWatch log group configurations to become out of sync with the global configuration. Only enable this option if you fully understand the implications.
 *
 * @example
 * ```
 * skipBulkUpdate:
 *   enable: true
 *   skipBulkUpdateTargets:
 *     organizationalUnits:
 *      - Sandbox
 *     regions:
 *      - us-west-1
 *      - us-west-2
 *     accounts:
 *      - WorkloadAccount1
 *
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchLogSkipBulkUpdateConfig {
  /**
   * **Enable** *(Required)*
   *
   * Whether or not to enable the skip bulk updates
   *
   */
  readonly enable: boolean;
  /**
   * **Skip Bulk Update Targets** *(Required)*
   *
   * Which target's log groups to skip the bulk updates of.
   *
   */
  readonly skipBulkUpdateTargets: t.IDeploymentTargets | undefined;
}

/**
 *
 * ## CloudWatch Firehose Configuration
 *
 * Configuration for the CloudWatch Logs Firehose.
 *
 * ### Example
 * ```yaml
 * logging:
 *  cloudwatchLogs:
 *    firehose:
 *      fileExtension: json.gz
 *      lambdaProcessor:
 *        retries: 3
 *        bufferSize: 0.2
 *        bufferInterval: 60
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchFirehoseConfig {
  /**
   * **File Extension** *(Optional)*
   *
   * Determines what format firehose will deliver the logs in. If left undefined, firehose will delivery the logs in MimeType as application/octet-stream.
   *
   * **Example**
   * ```yaml
   * - fileExtension: 'json.gz'
   * ```
   *
   */
  readonly fileExtension?: t.NonEmptyString;
  /**
   * **Lambda Processor** *(Optional)*
   *
   * Configure the lambda that process the incoming data from firehose. Firehose invokes the lambda to take the source data and deliver it to the configured dynamic partition.
   *
   * @see {@link ICloudWatchFirehoseLambdaProcessorConfig} for detailed parameter information
   */
  readonly lambdaProcessor?: ICloudWatchFirehoseLambdaProcessorConfig;
}

/**
 *
 * ## CloudWatch Firehose Lambda Configuration
 *
 * Enables the configuration of the lambda processor used to process incoming logs to the LogArchive account.
 *
 * @remarks
 * Lambda processor parameters for Amazon Kinesis DataFirehose
 * Ref: https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html
 *
 * ### Example
 * ```yaml
 * lambdaProcessor:
 *   retries: 3
 *   bufferSize: 0.2
 *   bufferInterval: 60
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html | Transform source data in Amazon Data Firehose} for more information on the Firehose/Lambda integration.
 *
 * @category Global Configuration
 */
export interface ICloudWatchFirehoseLambdaProcessorConfig {
  /**
   * **Retries** *(Optional)*
   *
   * How many times Firehose will retry the Lambda invocation.
   *
   * @default 3
   */
  readonly retries?: number;
  /**
   * **Buffer Size** *(Optional)*
   *
   * The AWS Lambda function has a 6 MB invocation payload quota. Your data can expand in size after it's processed. A smaller buffer size allows for more room should the data expand after processing.
   *
   * Valid values range from 0.2 - 3 MB.
   * @default 0.2
   */
  readonly bufferSize?: number;
  /**
   * **Buffer Interval** *(Optional)*
   *
   * The period of time in seconds which Amazon Data Firehose buffers incoming data before invoking the Lambda function.
   * The AWS lambda function is invoked once the value of the buffer size, or the buffer interval is reached.
   *
   * Valid values range from 60 - 900s.
   *
   * @default 60
   */
  readonly bufferInterval?: number;
}

/**
 *
 * ## CloudWatch Subscription Configuration
 *
 * Configuration for the CloudWatch logs subscription
 *
 * ### Example
 * ```yaml
 *  logging:
 *    cloudwatchLogs:
 *      subscription:
 *        type: ACCOUNT
 *        selectionCriteria: 'LogGroupName NOT IN [ /aws/lambda/AWSAccelerator-FirehoseRecordsProcessor development AppA]'
 *        overrideExisting: true
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchSubscriptionConfig {
  /**
   * **Type** *(Required)*
   *
   * Determines whether an account-wide subscription is applied, or if a Lambda function will be invoked to apply each log group.
   *
   * **Example**
   * ```
   * type: ACCOUNT
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters-AccountLevel.html | Account-level subscription filters} for more information
   */
  readonly type: 'ACCOUNT' | 'LOG_GROUP';
  /**
   *
   * **Selection Criteria** *(Optional)*
   *
   * Selection criteria for the account-wide subscription. Only used when {@link ICloudWatchSubscriptionConfig.type} is 'ACCOUNT'. This should be used to {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions-recursion-prevention.html | Prevent log recursion}.
   *
   * In the following example, log groups with the names /aws/lambda/AWSAccelerator-FirehoseRecordsProcessor, development, or AppA will not have a subscription filter.
   *
   * **Example**
   * ```yaml
   * selectionCriteria: 'LogGroupName NOT IN ["/aws/lambda/AWSAccelerator-FirehoseRecordsProcessor", "development", "AppA"]'
   * ```
   *
   *
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutAccountPolicy.html | PutAccountPolicy} for more information on the expected format of selectionCriteria
   *
   */
  readonly selectionCriteria?: t.NonEmptyString;
  /**
   * **Override Existing** *(Optional)*
   *
   * Indicates whether the existing CloudWatch Log subscription configuration can be overwritten.
   * If enabled, any existing policy will be updated and renamed to 'ACCELERATOR_ACCOUNT_SUBSCRIPTION_POLICY'.
   * Upon deleting the solution or disabling logging for cloudwatch in global config, this policy will be removed.
   * If type is set to 'LOG_GROUP' this parameter will not be used.
   *
   * @default false
   */
  readonly overrideExisting?: boolean;
  /**
   * **Filter Pattern** *(Optional)*
   *
   * The specific filter pattern to apply to the subscription.
   * If no value is provided all logs events will match filter criteria.
   * Only applicable when {@link ICloudWatchSubscriptionConfig.type} is 'LOG_GROUP'
   *
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CreateSubscriptionFilter-Account.html | Create an account-level subscription filter policy} for more information
   */
  readonly filterPattern?: t.NonEmptyString;
}

/**
 *
 * ## CloudWatch Kinesis Configuration
 *
 * Configuration for CloudWatch Log's Kinesis.
 *
 *  ### Key Features
 *
 * - **Real-time Processing**: Stream CloudWatch Logs data in real-time for immediate analysis
 * - **Scalable Throughput**: Configure capacity based on your data volume requirements
 * - **Flexible Retention**: Store data for 24 hours to 365 days for replay and reprocessing
 * - **Cost Optimization**: Choose between on-demand and provisioned capacity modes
 * - **Integration Ready**: Seamlessly integrates with AWS analytics and processing services
 *
 * ### Example
 * ```yaml
 *  logging:
 *    cloudwatchLogs:
 *      kinesis:
 *        streamingMode: PROVISIONED
 *        shardCount: 5
 *        retention: 240
 * ```
 *
 * @category Global Configuration
 *
 * @see {@link https://docs.aws.amazon.com/streams/latest/dev/using-other-services-cw-logs.html | Write to Kinesis Data Streams using Amazon CloudWatch Logs} for more information
 */
export interface ICloudWatchKinesisConfig {
  /**
   * **Streaming Mode** *(Required)*
   *
   * Specifies the capacity mode for the Kinesis Data Stream. Currently, you can choose between on-demand or provisioned capacity.
   * The service might limit how many times you can toggle between the two modes as mentioned on [this page](https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html#switchingmodes)
   *
   * @default PROVISIONED
   */
  readonly streamingMode: StreamMode;
  /**
   * **Shard Count** *(Optional)*
   *
   * The number of shared the stream uses. For greater throughput, increase the number of shards.
   * Only applicable if {@link ICloudWatchKinesisConfig.streamingMode} is 'Provisioned', otherwise this is ignored.
   * Shards cannot be increased to more than double their capacity. For example, you cannot go from 1 shard to 4.
   *
   * @default 1
   *
   * @see {@link https://docs.aws.amazon.com/kinesis/latest/APIReference/API_UpdateShardCount.html | UpdateShardCount} for more information on update limits
   *
   */
  readonly shardCount?: number;
  /**
   * **Retention** *(Optional)*
   *
   * The number of hours the data records are stored in shards and remain accessible.
   *
   * The value should be between 24 and 8760
   *
   *
   * @default 24
   *
   * @see {@link https://docs.aws.amazon.com/streams/latest/dev/kinesis-extended-retention.html | Change the data retention period} for more information
   */
  readonly retention?: number;
}

/**
 *
 * ## Reports Configuration
 *
 * Used to configure reports for the LZA deployment.
 *
 * ### Key Features
 * - Configure cost and usage reports
 * - Configure budget reports
 *
 * ### Example
 * ```yaml
 * costAndUsageReport:
 *     compression: Parquet
 *     format: Parquet
 *     reportName: accelerator-cur
 *     s3Prefix: cur
 *     timeUnit: DAILY
 *     refreshClosedReports: true
 *     reportVersioning: CREATE_NEW_REPORT
 *     lifecycleRules:
 *       storageClass: DEEP_ARCHIVE
 *       enabled: true
 *       multiPart: 1
 *       expiration: 1825
 *       deleteMarker: false
 *       nonCurrentExpiration: 366
 *       transitionAfter: 365
 * budgets:
 *     - name: accel-budget
 *       timeUnit: MONTHLY
 *       type: COST
 *       amount: 2000
 *       includeUpfront: true
 *       includeTax: true
 *       includeSupport: true
 *       includeSubscription: true
 *       includeRecurring: true
 *       includeOtherSubscription: true
 *       includeDiscount: true
 *       includeCredit: false
 *       includeRefund: false
 *       useBlended: false
 *       useAmortized: false
 *       unit: USD
 *       notifications:
 *       - type: ACTUAL
 *         thresholdType: PERCENTAGE
 *         threshold: 90
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         address: myemail+pa-budg@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface IReportConfig {
  /**
   * **Cost and Usage Report** *(Optional)*
   *
   * Configuration for a cost and usage report.
   *
   *
   * **Example**
   * ```yaml
   * costAndUsageReport:
   *     compression: Parquet
   *     format: Parquet
   *     reportName: accelerator-cur
   *     s3Prefix: cur
   *     timeUnit: DAILY
   *     refreshClosedReports: true
   *     reportVersioning: CREATE_NEW_REPORT
   *     lifecycleRules:
   *       storageClass: DEEP_ARCHIVE
   *       enabled: true
   *       multiPart: 1
   *       expiration: 1825
   *       deleteMarker: false
   *       nonCurrentExpiration: 366
   *       transitionAfter: 365
   * ```
   *
   * @see {@link ICostAndUsageReportConfig} for detailed parameter information.
   */
  readonly costAndUsageReport?: ICostAndUsageReportConfig;
  /**
   * **Budget Reports** *(Optional)*
   *
   * Configuration for budget reports.
   *
   * **Example**
   * ```yaml
   * budgets:
   *     - name: accel-budget
   *       timeUnit: MONTHLY
   *       type: COST
   *       amount: 2000
   *       includeUpfront: true
   *       includeTax: true
   *       includeSupport: true
   *       includeSubscription: true
   *       includeRecurring: true
   *       includeOtherSubscription: true
   *       includeDiscount: true
   *       includeCredit: false
   *       includeRefund: false
   *       useBlended: false
   *       useAmortized: false
   *       unit: USD
   *       notifications:
   *       - type: ACTUAL
   *         thresholdType: PERCENTAGE
   *         threshold: 90
   *         comparisonOperator: GREATER_THAN
   *         subscriptionType: EMAIL
   *         address: myemail+pa-budg@example.com
   * ```
   *
   * @see {@link IBudgetReportConfig} for detail parameter information
   */
  readonly budgets?: IBudgetReportConfig[];
}

/**
 * ## Cost and Usage Report Configuration
 *
 * Configuration for AWS Cost and Usage Reports (CUR) that provides comprehensive cost and usage data
 * for your AWS account. These reports are delivered to an S3 bucket and can be used for detailed
 * cost analysis and billing insights.
 *
 * ### Key Features
 *
 * - **Flexible Reporting**: Configure time granularity from hourly to monthly
 * - **Multiple Formats**: Support for CSV, text, and Parquet formats with various compression options
 * - **Data Integration**: Generate manifests for integration with Amazon Redshift, QuickSight, and Athena
 * - **Lifecycle Management**: Configure S3 lifecycle rules for cost optimization
 * - **Version Control**: Choose between creating new reports or overwriting existing ones
 *
 * ### Usage Example
 *
 * ```yaml
 * costAndUsageReport:
 *   compression: Parquet
 *   format: Parquet
 *   reportName: accelerator-cur
 *   s3Prefix: cur
 *   timeUnit: DAILY
 *   refreshClosedReports: true
 *   reportVersioning: CREATE_NEW_REPORT
 *   lifecycleRules:
 *     - enabled: true
 *       id: CostAndUsageBucketLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 * ```
 *
 * @category Global Configuration
 */
export interface ICostAndUsageReportConfig {
  /**
   * **Additional Schema Elements** *(Optional)*
   *
   * Additional content that AWS includes in the report, such as individual resource IDs.
   * These elements provide more granular data for detailed cost analysis.
   */
  readonly additionalSchemaElements?: t.NonEmptyString[];

  /**
   * **Compression Format** *(Required)*
   *
   * The compression format that AWS uses for the report files.
   *
   * **Example**
   * ```yaml
   * compression: Parquet
   * ```
   */
  readonly compression: string;

  /**
   * **Report Format** *(Required)*
   *
   * The format that AWS saves the report in.
   *
   * **Example**
   * ```yaml
   * format: Parquet
   * ```
   */
  readonly format: string;

  /**
   * **Report Name** *(Required)*
   *
   * The name of the report that you want to create
   *
   * **Naming Requirements**
   * - Must be unique within the AWS account
   * - Case sensitive
   * - Cannot contain spaces
   *
   * **Example**
   * ```yaml
   * reportName: accelerator-cur
   * ```
   */
  readonly reportName: t.NonEmptyString;

  /**
   * **S3 Prefix** *(Required)*
   *
   * The prefix that AWS adds to the report name when delivering the report to S3.
   * This helps organize reports within the S3 bucket structure.
   *
   * **Notes**
   * - Cannot include spaces
   * - Used to organize reports in S3 bucket
   * - Helps with lifecycle management and access control
   *
   * **Example**
   * ```yaml
   * s3Prefix: cur
   * ```
   */
  readonly s3Prefix: t.NonEmptyString;

  /**
   * **Time Unit** *(Required)*
   *
   * The granularity of the line items in the report. This determines how frequently
   * the report data is aggregated.
   *
   * **Available Options**
   * - `HOURLY`: Hourly granularity (most detailed, higher costs)
   * - `DAILY`: Daily granularity (recommended for most use cases)
   * - `MONTHLY`: Monthly granularity (least detailed, lower costs)
   *
   * **Cost Considerations**
   * - Hourly reports are more expensive but provide the most detail
   * - Daily reports offer a good balance of detail and cost
   * - Monthly reports are the most cost-effective but least granular
   *
   * **Example**
   * ```yaml
   * timeUnit: DAILY
   * ```
   */
  readonly timeUnit: 'HOURLY' | 'DAILY' | 'MONTHLY' | string;

  /**
   * **Additional Artifacts** *(Optional)*
   *
   * A list of manifests that AWS creates for this report to enable integration
   * with other AWS analytics services.
   *
   * **Available Artifacts**
   * - `REDSHIFT`: Creates manifest files for Amazon Redshift integration
   * - `QUICKSIGHT`: Creates manifest files for Amazon QuickSight integration
   * - `ATHENA`: Creates manifest files for Amazon Athena integration
   *
   * **Example**
   * ```yaml
   * additionalArtifacts:
   *   - ATHENA
   *   - QUICKSIGHT
   * ```
   */
  readonly additionalArtifacts?: ('REDSHIFT' | 'QUICKSIGHT' | 'ATHENA' | string)[];

  /**
   * **Refresh Closed Reports** *(Required)*
   *
   * Whether AWS should update your reports after they have been finalized if AWS detects
   * charges related to previous months. These charges can include refunds, credits, or support fees.
   *
   * **When to Enable**
   * - Enable if you need the most accurate historical data
   * - Enable if you frequently receive refunds or credits
   * - Enable for compliance and auditing requirements
   *
   * **When to Disable**
   * - Disable if you prefer immutable historical reports
   * - Disable to reduce processing overhead
   *
   * **Example**
   * ```yaml
   * refreshClosedReports: true
   * ```
   */
  readonly refreshClosedReports: boolean;

  /**
   * **Report Versioning** *(Required)*
   *
   * Whether AWS should overwrite the previous version of each report or deliver
   * the report in addition to the previous versions.
   *
   * **Available Options**
   * - `CREATE_NEW_REPORT`: Creates a new report file for each delivery (recommended)
   * - `OVERWRITE_REPORT`: Overwrites the previous report file
   *
   * **Considerations**
   * - `CREATE_NEW_REPORT` provides better audit trail and version history
   * - `OVERWRITE_REPORT` uses less storage but loses historical versions
   *
   * **Example**
   * ```yaml
   * reportVersioning: CREATE_NEW_REPORT
   * ```
   */
  readonly reportVersioning: 'CREATE_NEW_REPORT' | 'OVERWRITE_REPORT' | string;

  /**
   * **S3 Lifecycle Rules** *(Optional)*
   *
   * Configuration for S3 bucket lifecycle rules to manage the cost and storage
   * of your Cost and Usage Reports over time.
   *
   * **Key Benefits**
   * - Automatically transition older reports to cheaper storage classes
   * - Set expiration policies to delete old reports
   * - Optimize storage costs for long-term report retention
   *
   * **Example**
   * ```yaml
   * lifecycleRules:
   *   - enabled: true
   *     id: CostAndUsageBucketLifecycleRule-01
   *     expiration: 2555  # 7 years
   *     transitions:
   *       - storageClass: STANDARD_IA
   *         transitionAfter: 30
   *       - storageClass: GLACIER
   *         transitionAfter: 365
   *       - storageClass: DEEP_ARCHIVE
   *         transitionAfter: 1095  # 3 years
   * ```
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html | Managing the lifecycle of objects} for more information on S3 Lifecylce rules
   *
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * ## Budget Report Configuration
 *
 * Defines AWS Budgets for cost monitoring, usage tracking, and automated alerting.
 * Budgets help you monitor your AWS costs and usage, and receive alerts when you exceed
 * or are forecasted to exceed your defined thresholds.
 *
 * ### Key Features
 *
 * - **Cost and Usage Monitoring**: Track spending across accounts, services, and resources
 * - **Automated Alerting**: Email and SNS notifications when thresholds are exceeded
 * - **Multiple Budget Types**: Support for cost, usage, RI utilization, and Savings Plans
 * - **Flexible Thresholds**: Percentage or absolute value threshold configurations
 * - **Multi-Account Deployment**: Deploy budgets across organizational units and accounts
 *
 * ### Budget Types Supported
 *
 * - **COST**: Monitor spending in your preferred currency
 * - **USAGE**: Track service usage hours or quantities
 * - **RI_UTILIZATION**: Monitor Reserved Instance utilization rates
 * - **RI_COVERAGE**: Track Reserved Instance coverage percentages
 * - **SAVINGS_PLANS_UTILIZATION**: Monitor Savings Plans utilization
 * - **SAVINGS_PLANS_COVERAGE**: Track Savings Plans coverage
 *
 * ### Usage Example
 *
 * ```yaml
 * budgets:
 *   # Monthly cost budget with email alerts
 *   - name: monthly-cost-budget
 *     timeUnit: MONTHLY
 *     type: COST
 *     amount: 5000
 *     unit: USD
 *     includeUpfront: true
 *     includeTax: true
 *     includeSupport: true
 *     notifications:
 *       - type: ACTUAL
 *         thresholdType: PERCENTAGE
 *         threshold: 80
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         recipients:
 *           - finance-team@example.com
 *           - platform-team@example.com
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *
 *   # Daily usage budget for EC2 hours
 *   - name: ec2-usage-budget
 *     timeUnit: DAILY
 *     type: USAGE
 *     amount: 1000
 *     unit: Hrs
 *     notifications:
 *       - type: FORECASTED
 *         thresholdType: ABSOLUTE_VALUE
 *         threshold: 800
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         recipients:
 *           - ops-team@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface IBudgetReportConfig {
  /**
   * **Budget Amount** *(Required)*
   *
   * The cost or usage amount that defines the budget threshold. This value represents
   * the maximum amount you want to spend (for COST budgets) or consume (for USAGE budgets)
   * within the specified time period.
   *
   * ### Amount Guidelines
   *
   * - **Cost Budgets**: Specify amount in your preferred currency unit
   * - **Usage Budgets**: Specify amount in service-specific units (hours, GB, requests)
   * - **RI/Savings Plans**: Specify percentage values (0-100) for utilization/coverage
   *
   * ### Examples
   *
   * ```yaml
   * # Monthly cost budget of $5,000
   * amount: 5000
   * type: COST
   * unit: USD
   *
   * # Daily EC2 usage budget of 1,000 hours
   * amount: 1000
   * type: USAGE
   * unit: Hrs
   *
   * # RI utilization target of 80%
   * amount: 80
   * type: RI_UTILIZATION
   * ```
   *
   * @default 2000
   */
  readonly amount: number;

  /**
   * **Budget Name** *(Required)*
   *
   * Unique identifier for the budget within the AWS account. The name appears in
   * the AWS Billing and Cost Management console and in budget notifications.
   *
   * ### Naming Requirements
   *
   * - Must be unique within the AWS account
   * - Cannot contain colon (:) or backslash (\\) characters
   * - Should be descriptive and indicate the budget's purpose
   * - Recommended to include time period and budget type
   *
   * ### Naming Best Practices
   *
   * ```yaml
   * # Environment-based naming
   * name: prod-monthly-cost-budget
   * name: dev-daily-usage-budget
   *
   * # Service-specific naming
   * name: ec2-monthly-cost-limit
   * name: s3-storage-usage-budget
   *
   * # Team-based naming
   * name: platform-team-quarterly-budget
   * name: data-team-monthly-spend
   * ```
   */
  readonly name: t.NonEmptyString;

  /**
   * **Time Unit** *(Required)*
   *
   * The time period over which the budget amount is measured and reset.
   * Determines how frequently the budget resets and when notifications are evaluated.
   *
   * ### Available Time Units
   *
   * - **DAILY**: Budget resets every day (available for all budget types)
   * - **MONTHLY**: Budget resets monthly (most common, recommended)
   * - **QUARTERLY**: Budget resets every 3 months
   * - **ANNUALLY**: Budget resets yearly (good for annual planning)
   *
   * ### Usage Guidelines
   *
   * ```yaml
   * # Most common - monthly cost monitoring
   * timeUnit: MONTHLY
   * type: COST
   *
   * # Daily monitoring for high-usage services
   * timeUnit: DAILY
   * type: USAGE
   *
   * # Annual budgets for long-term planning
   * timeUnit: ANNUALLY
   * type: COST
   * ```
   *
   * ### Special Considerations
   *
   * - **RI_UTILIZATION** and **RI_COVERAGE** budgets support DAILY time units
   * - DAILY budgets provide more granular monitoring but may generate more alerts
   * - MONTHLY is recommended for most cost management use cases
   */
  readonly timeUnit: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | string;

  /**
   * **Budget Type** *(Required)*
   *
   * Specifies what the budget monitors - costs, usage, or Reserved Instance metrics.
   * The budget type determines how the amount is interpreted and what data is tracked.
   *
   * ### Budget Types
   *
   * - **COST**: Monitors spending in your specified currency
   * - **USAGE**: Tracks service usage quantities (hours, GB, requests)
   * - **RI_UTILIZATION**: Monitors Reserved Instance utilization percentage
   * - **RI_COVERAGE**: Tracks Reserved Instance coverage percentage
   * - **SAVINGS_PLANS_UTILIZATION**: Monitors Savings Plans utilization
   * - **SAVINGS_PLANS_COVERAGE**: Tracks Savings Plans coverage
   *
   * ### Type-Specific Considerations
   *
   * ```yaml
   * # Cost monitoring (most common)
   * type: COST
   * amount: 5000
   * unit: USD
   *
   * # Usage monitoring
   * type: USAGE
   * amount: 1000
   * unit: Hrs
   *
   * # Reserved Instance optimization
   * type: RI_UTILIZATION
   * amount: 80  # Target 80% utilization
   *
   * # Savings Plans monitoring
   * type: SAVINGS_PLANS_COVERAGE
   * amount: 70  # Target 70% coverage
   * ```
   */
  readonly type:
    | 'USAGE'
    | 'COST'
    | 'RI_UTILIZATION'
    | 'RI_COVERAGE'
    | 'SAVINGS_PLANS_UTILIZATION'
    | 'SAVINGS_PLANS_COVERAGE'
    | string;
  /**
   * **Include Upfront Costs** *(Optional)*
   *
   * Whether to include upfront Reserved Instance costs in the budget calculation.
   * Upfront costs are one-time payments made when purchasing Reserved Instances.
   *
   * ### When to Include
   *
   * - **Enable** for comprehensive cost tracking that includes RI purchases
   * - **Enable** when budgeting for periods that include RI purchases
   * - **Disable** for operational cost budgets that exclude capital expenditures
   *
   * @default true
   */
  readonly includeUpfront?: boolean;

  /**
   * **Include Tax** *(Optional)*
   *
   * Whether to include taxes in the budget calculation. This includes all applicable
   * taxes such as VAT, sales tax, and other regional taxes.
   *
   * ### Considerations
   *
   * - **Enable** for total cost visibility including all charges
   * - **Disable** for pre-tax budget management
   * - Consider regional tax implications for multi-region deployments
   *
   * @default true
   */
  readonly includeTax?: boolean;

  /**
   * **Include Support Costs** *(Optional)*
   *
   * Whether to include AWS Support subscription fees in the budget calculation.
   * This includes Business, Enterprise, and other support plan charges.
   *
   * ### When to Include
   *
   * - **Enable** for complete operational cost visibility
   * - **Disable** when support costs are managed separately
   * - Consider if support costs should be allocated to specific teams/projects
   *
   * @default true
   */
  readonly includeSupport?: boolean;

  /**
   * **Include Other Subscriptions** *(Optional)*
   *
   * Whether to include non-Reserved Instance subscription costs such as
   * Savings Plans, software subscriptions, and marketplace subscriptions.
   *
   * ### Subscription Types Included
   *
   * - AWS Marketplace software subscriptions
   * - Third-party software licenses
   * - Other recurring subscription charges
   *
   * @default true
   */
  readonly includeOtherSubscription?: boolean;

  /**
   * **Include Subscriptions** *(Optional)*
   *
   * Whether to include general subscription costs in the budget calculation.
   * This is a broader category that encompasses various subscription-based charges.
   *
   * ### When to Include
   *
   * - **Enable** for comprehensive subscription cost tracking
   * - **Disable** when focusing only on usage-based costs
   *
   * @default true
   */
  readonly includeSubscription?: boolean;

  /**
   * **Include Recurring Costs** *(Optional)*
   *
   * Whether to include recurring fees such as monthly Reserved Instance charges,
   * data transfer fees, and other predictable recurring costs.
   *
   * ### Recurring Cost Types
   *
   * - Monthly RI fees (after upfront payment)
   * - Data transfer charges
   * - Storage fees
   * - Other predictable monthly charges
   *
   * @default true
   */
  readonly includeRecurring?: boolean;

  /**
   * **Include Discounts** *(Optional)*
   *
   * Whether to include discounts in the budget calculation. When enabled,
   * discounts reduce the total amount counted against the budget.
   *
   * ### Discount Types
   *
   * - Volume discounts
   * - Reserved Instance discounts
   * - Savings Plans discounts
   * - Promotional credits
   *
   * ### Considerations
   *
   * - **Enable** to see net costs after discounts
   * - **Disable** to track gross costs before discounts
   *
   * @default true
   */
  readonly includeDiscount?: boolean;

  /**
   * **Include Refunds** *(Optional)*
   *
   * Whether to include refunds in the budget calculation. When enabled,
   * refunds reduce the total amount counted against the budget.
   *
   * ### When to Include
   *
   * - **Enable** for net cost tracking that accounts for refunds
   * - **Disable** for gross cost tracking without refund adjustments
   * - Consider impact on budget accuracy if refunds are frequent
   *
   * @default true
   */
  readonly includeRefund?: boolean;

  /**
   * **Include Credits** *(Optional)*
   *
   * Whether to include AWS credits in the budget calculation. When enabled,
   * credits reduce the total amount counted against the budget.
   *
   * ### Credit Types
   *
   * - AWS promotional credits
   * - Service credits for SLA violations
   * - Partner-provided credits
   * - Migration incentive credits
   *
   * ### Best Practices
   *
   * - **Enable** for net cost visibility after credits
   * - **Disable** for tracking actual resource consumption costs
   *
   * @default true
   */
  readonly includeCredit?: boolean;

  /**
   * **Use Amortized Costs** *(Optional)*
   *
   * Whether to use amortized costs for Reserved Instances and Savings Plans.
   * Amortized costs spread upfront payments across the term of the commitment.
   *
   * ### Amortized vs. Unblended
   *
   * - **Amortized**: Spreads upfront RI costs across the RI term
   * - **Unblended**: Shows actual charges as they occur
   *
   * ### When to Use
   *
   * - **Enable** for consistent monthly cost allocation
   * - **Disable** for cash flow and actual billing tracking
   * - Useful for chargeback and cost allocation scenarios
   *
   * @default false
   */
  readonly useAmortized?: boolean;

  /**
   * **Use Blended Rates** *(Optional)*
   *
   * Whether to use blended rates that average costs across different pricing tiers.
   * Blended rates provide a simplified view by averaging tiered pricing.
   *
   * ### Blended vs. Unblended
   *
   * - **Blended**: Averages costs across pricing tiers
   * - **Unblended**: Shows actual per-unit costs for each tier
   *
   * ### When to Use
   *
   * - **Enable** for simplified cost analysis and reporting
   * - **Disable** for detailed cost optimization and tier analysis
   * - Consider organizational reporting requirements
   *
   * @default false
   */
  readonly useBlended?: boolean;
  /**
   * **Subscription Type** *(Optional)*
   *
   * Default notification delivery method for budget alerts. This can be overridden
   * in individual notification configurations.
   *
   * ### Available Types
   *
   * - **EMAIL**: Send notifications via email (most common)
   * - **SNS**: Send notifications via Amazon SNS topic
   *
   * ### Usage Guidelines
   *
   * ```yaml
   * # Email notifications (recommended for most use cases)
   * subscriptionType: EMAIL
   *
   * # SNS for integration with other systems
   * subscriptionType: SNS
   * ```
   *
   * **Note:** Individual notifications can override this default setting.
   */
  readonly subscriptionType?: t.SubscriptionType | string;

  /**
   * **Budget Unit** *(Optional)*
   *
   * Unit of measurement for the budget amount. The unit depends on the budget type
   * and determines how the amount value is interpreted.
   *
   * ### Common Units by Budget Type
   *
   * **Cost Budgets:**
   * - `USD`, `EUR`, `GBP`, `JPY` (currency codes)
   *
   * **Usage Budgets:**
   * - `Hrs` (hours for compute services)
   * - `GB` (gigabytes for storage)
   * - `Requests` (for API calls)
   * - Service-specific units
   *
   * **RI/Savings Plans Budgets:**
   * - Percentage values (no unit specified)
   *
   * ### Examples
   *
   * ```yaml
   * # Cost budget in US Dollars
   * type: COST
   * amount: 5000
   * unit: USD
   *
   * # Usage budget in hours
   * type: USAGE
   * amount: 1000
   * unit: Hrs
   *
   * # RI utilization (no unit needed)
   * type: RI_UTILIZATION
   * amount: 80
   * ```
   */
  readonly unit?: t.NonEmptyString;

  /**
   * **Budget Notifications** *(Optional)*
   *
   * List of notification configurations that define when and how alerts are sent
   * when budget thresholds are exceeded or forecasted to be exceeded.
   *
   * ### Notification Types
   *
   * - **ACTUAL**: Alert when actual spending/usage exceeds threshold
   * - **FORECASTED**: Alert when forecasted spending/usage will exceed threshold
   *
   * ### Threshold Types
   *
   * - **PERCENTAGE**: Threshold as percentage of budget amount
   * - **ABSOLUTE_VALUE**: Threshold as absolute value in budget units
   *
   * ### Best Practices
   *
   * ```yaml
   * notifications:
   *   # Early warning at 75% of budget
   *   - type: FORECASTED
   *     thresholdType: PERCENTAGE
   *     threshold: 75
   *     comparisonOperator: GREATER_THAN
   *     subscriptionType: EMAIL
   *     recipients:
   *       - team-lead@example.com
   *
   *   # Critical alert at 90% actual spend
   *   - type: ACTUAL
   *     thresholdType: PERCENTAGE
   *     threshold: 90
   *     comparisonOperator: GREATER_THAN
   *     subscriptionType: EMAIL
   *     recipients:
   *       - finance-team@example.com
   *       - platform-team@example.com
   * ```
   *
   * @see {@link INotificationConfig} for detailed notification configuration
   */
  readonly notifications?: INotificationConfig[];

  /**
   * **Deployment Targets** *(Optional)*
   *
   * Specifies which organizational units and accounts should have this budget deployed.
   * When not specified, the budget is deployed only to the management account.
   *
   * ### Deployment Scope
   *
   * - **Organizational Units**: Deploy to all accounts within specified OUs
   * - **Specific Accounts**: Deploy to individually named accounts
   * - **Account Exclusions**: Exclude specific accounts from OU-wide deployments
   *
   * ### Usage Examples
   *
   * ```yaml
   * # Deploy to all accounts in Workloads OU
   * deploymentTargets:
   *   organizationalUnits:
   *     - Workloads
   *
   * # Deploy to specific accounts only
   * deploymentTargets:
   *   accounts:
   *     - Production
   *     - Staging
   *
   * # Deploy to OU but exclude specific accounts
   * deploymentTargets:
   *   organizationalUnits:
   *     - Workloads
   *   excludedAccounts:
   *     - Development
   * ```
   *
   * ### Best Practices
   *
   * - Use OU-based deployment for consistent budget policies
   * - Deploy cost budgets to production accounts
   * - Consider separate budgets for different environments
   * - Exclude sandbox accounts from strict budget controls
   *
   * @see {@link t.IDeploymentTargets} for deployment target configuration
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 *
 * ## Notification Configuration
 *
 * Used to configure notifications for budget reports
 *
 * ### Key Features
 * - **Recipients**: Configure multiple recipients for the notification
 * - **Threshold**: Define the threshold to trigger the notification
 * - **Subscription Type**: Choose the subscription type (e.g., email, SNS) for delivery
 *
 *
 * ### Example
 * ```yaml
 * notifications:
 *  - type: ACTUAL
 *    thresholdType: PERCENTAGE
 *    threshold: 90
 *    comparisonOperator: GREATER_THAN
 *    subscriptionType: EMAIL
 *    recipients:
 *     - myemail+pa1-budg@example.com
 *     - myemail+pa2-budg@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface INotificationConfig {
  /**
   * **Notification Type** *(Required)*
   *
   * Determines whether the notification should be sent based on actual or forecasted usage.
   *
   * Values must either be `ACTUAL` or `FORECASTED`
   *
   */
  readonly type: t.NotificationType | string;
  /**
   * **Threshold Type** *(Required)*
   *
   * The type of threshold for a notification.
   *
   * **Types**
   * - `ABSOLUTE_VALUE`: AWS sends the notification when you go over, or are forecasted to go over, the total cost of the threshold.
   * - `PERCENTAGE`: AWS sends the notification when you go over, or are forecasted to go over, a certain percentage of your forecasted spend.
   */
  readonly thresholdType: t.ThresholdType | string;
  /**
   * **Comparison Operator** *(Required)*
   *
   * The comparison that's used for this notification.
   *
   * Valid values are `GREATER_THAN`, `LESS_THAN`, and `EQUAL_TO`
   */
  readonly comparisonOperator: t.ComparisonOperator | string;
  /**
   * **Threshold** *(Optional)*
   *
   * The value that, when usage exceeds, will trigger the notification.
   */
  readonly threshold?: number;
  /**
   * **Address** *(Optional)*
   *
   * @deprecated Please use recipients property to specify recipients of the notification
   *
   * The address that AWS sends budget notifications to, either an SNS topic or an email.
   *
   */
  readonly address?: t.NonEmptyString;
  /**
   * **Recipients** *(Optional)*
   *
   * A list of recipients that the notification will be sent to. Must be either an SNS topic or an email.
   *
   */
  readonly recipients?: t.NonEmptyString[];
  /**
   * **Subscription Type** *(Required)*
   *
   * The type of notification that AWS will send to the subscribers. Must either be `SNS` or `EMAIL`
   *
   */
  readonly subscriptionType: t.SubscriptionType | string;
}

/**
 *
 * ## Backup Configuration
 *
 * Enables the setup of Backups.
 *
 *
 * ### Examples
 * ```yaml
 * backup:
 *   vaults:
 *     - name: BackupVault
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 *
 * @category Global Configuration
 */
export interface IBackupConfig {
  /**
   * **Vaults** *(Required)*
   *
   * Configuration for Backup Vaults.
   *
   * @see {@link IVaultConfig} for configuration details
   */
  readonly vaults: IVaultConfig[];
}

/**
 *
 * ## Vault Configuration
 *
 * Enables the configuration of Backup Vaults' names, policies, and deployment targets.
 *
 * ### Example
 * ```
 * - name: BackupVault
 *   deploymentTargets:
 *     organizationalUnits:
 *      - Root
 *   policy: policies/backup-vault-policy.json
 * ```
 *
 * @category Global Configuration
 */
export interface IVaultConfig {
  /**
   * **Name** *(Required)*
   *
   * The name of the vault to be created.
   *
   */
  readonly name: t.NonEmptyString;

  /**
   * **Deployment Targets** *(Required)*
   *
   * The accounts and OUs that the vault should be deployed in.
   *
   */
  readonly deploymentTargets: t.IDeploymentTargets;

  /**
   * **Policy** *(Optional)*
   *
   * The path to a JSON file defining Backup Vault access policy
   */
  readonly policy?: t.NonEmptyString;
}

/**
 * ## SNS Configuration
 *
 * Used to setup and configure SNS Topics within the LZA environment.
 *
 * ### Example
 * ```yaml
 * snsTopics:
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   topics:
 *     - name: Security
 *       emailAddresses:
 *         - SecurityNotifications@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface ISnsConfig {
  /**
   * **Deployment Targets** *(Required)*
   *
   * Determines which accounts the SNS topic will be deployed to.
   *
   * **Note**
   * SNS topics will always be deployed to the Log Archive Account.
   * All email subscriptions will be created in the Log Archive Account.
   * Member accounts will forward their notifications through the Log Archive Account.
   *
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * **SNS Topic Configuration** *(Required)*
   *
   * List of SNS Topics to be created by the solution.
   *
   * @see {@link ISnsTopicConfig} for configuration details
   */
  readonly topics: ISnsTopicConfig[];
}

/**
 * ## SNS Topic Configuration
 *
 * Individual SNS topic configuration for notifications and alerts within the Landing Zone Accelerator.
 * Topics are used to distribute notifications from CloudWatch Alarms, Security Hub findings, and other
 * AWS services to designated email recipients.
 *
 * ### Example
 *
 * ```yaml
 * topics:
 *   # Security notifications topic
 *   - name: Security
 *     emailAddresses:
 *       - security-team@example.com
 *       - compliance@example.com
 *
 *   # Operations alerts topic
 *   - name: Operations
 *     emailAddresses:
 *       - ops-team@example.com
 *       - on-call@example.com
 *
 *   # Executive notifications
 *   - name: Executive
 *     emailAddresses:
 *       - ciso@example.com
 *       - cto@example.com
 * ```
 *
 * @category Global Configuration
 */
export interface ISnsTopicConfig {
  /**
   * **Topic Name** *(Required)*
   *
   * Unique identifier for the SNS topic within the deployment scope.
   * This name is used to create the SNS topic and reference it in other configurations.
   */
  readonly name: t.NonEmptyString;

  /**
   * **Email Addresses** *(Required)*
   *
   * List of email addresses that will receive notifications from this SNS topic.
   * Each email address will receive a subscription confirmation email that must be confirmed
   * before notifications can be delivered.
   *
   * ### Subscription Management
   *
   * - Subscriptions are created automatically during deployment
   * - Each email address receives a confirmation email from AWS
   * - Unconfirmed subscriptions appear as "PendingConfirmation" in the AWS console
   * - Confirmed subscriptions will receive all topic notifications
   *
   */
  readonly emailAddresses: t.EmailAddress[];
}

/**
 * ## Accelerator Metadata Configuration
 *
 * Used to enable accelerator metadata logs.
 *
 * ### Example
 * ```yaml
 * acceleratorMetadata:
 *   enable: true
 *   account: Logging
 *   readOnlyAccessRoleArns:
 *     - arn:aws:iam::111111111111:role/test-access-role
 * ```
 *
 * @category Global Configuration
 */
export interface IAcceleratorMetadataConfig {
  /**
   * **Enable** *(Required)*
   *
   * Determines whether or not accelerator metadata is captured
   *
   */
  readonly enable: boolean;
  /**
   * **Account** *(Required)*
   *
   * The account to save the logs in. A new S3 Bucket will be created for this purpose.
   *
   */
  readonly account: string;
  /**
   * **Read-Only Access Role ARNs** *(Required)*
   *
   * List of role arns that should have read-only access to the logs.
   */
  readonly readOnlyAccessRoleArns: string[];
}

/**
 * ## Accelerator Settings Configuration
 *
 * Contains additional configuration settings for the Accelerator.
 * Allows for the configuration of the maximum concurrent stacks that can be processed at a given time.
 *
 * ### Example
 * ```yaml
 * acceleratorSettings:
 *  maxConcurrentStacks: 250
 * ```
 *
 * @category Global Configuration
 */
export interface IAcceleratorSettingsConfig {
  /**
   * **Max Concurrent Stacks** *(Optional)*
   *
   * Set the maximum number of concurrent stacks that can be processed at a time while transpiling the application.
   *
   * @default 250
   */
  readonly maxConcurrentStacks?: number;
}

/**
 *
 * ## Encryption Configuration
 *
 * Enable/Disable the use of AWS KMS CMK for encryption.
 * Can specify which accounts/OUs to use this configuration in.
 *
 * ### Example
 * ```yaml
 *  encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 *
 * @category Global Configuration
 */
export interface IServiceEncryptionConfig {
  /**
   * **Use CMK** *(Required)*
   *
   * Determines whether or not AWS KMS CMK will be used for encryption.
   * When set to `true`, AWS CMK KMS will be used.
   * When set to `false`, service managed KMS will be used.
   *
   * @default false
   */
  readonly useCMK: boolean;
  /**
   * **Deployment Targets** *(Optional)*
   *
   * Configure which environments the given configuration will be used for.
   * When left undefined, the configuration is applied to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 * ## Managed Data Protection Identifier Configuration
 *
 * Allows the protection of CloudWatch Log Data. Currently, only Credentials category is supported.
 *
 * @example
 * ```
 *   categories:
 *     - Credentials
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchManagedDataProtectionIdentifierConfig {
  /**
   * **Categories** *(Required)*
   *
   * List of categories to protect.
   *
   *
   * @default Credentials
   *
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types.html | Type of data the you can protect} for more information on CloudWatch Logs data protection.
   */
  readonly categories: `${t.CloudWatchLogDataProtectionCategories}`[];
}

/**
 * ## CloudWatch Log Data Protection Configuration
 *
 * Allows the enablement of CloudWatch Logs data protection.
 *
 * ### Example
 * ```yaml
 *  dataProtection:
 *    managedDataIdentifiers:
 *      categories:
 *        - Credentials
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 *
 * @category Global Configuration
 */
export interface ICloudWatchDataProtectionConfig {
  /**
   * **Managed Data Identifiers** *(Required)*
   *
   * Provides the selection of data identifiers to be protected.
   * Currently only `Credentials` is supported.
   *
   * @see {@link ICloudWatchManagedDataProtectionIdentifierConfig} for configuration details
   */
  readonly managedDataIdentifiers: ICloudWatchManagedDataProtectionIdentifierConfig;
  /**
   * **Deployment Targets** *(Optional)*
   *
   * Enables control over which accounts the configuration applies to.
   * When left undefined, the configuration will be applied to all accounts and enabled regions.
   *
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * **Override Existing** *(Optional)*
   *
   * Indicates whether any existing CloudWatch Log data protection configurations can be overwritten.
   *
   * @default false
   */
  readonly overrideExisting?: boolean;
}

/**
 *
 * ## Lambda Configuration
 *
 * Customize the encryption used for lambda environment variables.
 *
 * ### Example
 * ```yaml
 *   encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 *
 * @category Global Configuration
 */
export interface ILambdaConfig {
  /**
   * **Encryption** *(Optional)*
   *
   * Determine what methods should be used to encrypt lambda environment variables.
   *
   * @see {@link IServiceEncryptionConfig} for detailed configuration information.
   */
  readonly encryption?: IServiceEncryptionConfig;
}

/**
 *
 * ## SQS Configuration
 *
 * Configure SQS encryption for the solution.
 *
 *
 * ### Example
 * ```yaml
 *   encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 *
 * @category Global Configuration
 */
export interface ISqsConfig {
  /**
   * **Encryption** *(Optional)*
   *
   * Configure the encryption used for SQS queues.
   *
   * @see {@link IServiceEncryptionConfig} for detailed configuration information.
   */
  readonly encryption?: IServiceEncryptionConfig;
}

/**
 * ## SSM Inventory Configuration
 *
 * Enable SSM Inventory within the deployment.
 *
 * ### Example
 * ```yaml
 * ssmInventoryConfig:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 * ```
 *
 * @category Global Configuration
 */
export interface ISsmInventoryConfig {
  /**
   * **Enable** *(Required)*
   *
   * Whether or not to enable SSM Inventory.
   */
  readonly enable: boolean;
  /**
   * **Deployment Targets** *(Required)*
   *
   * Which accounts should the current configuration apply to.
   * Can be specified at the account or OU level.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * ## SSM Parameters Configuration
 *
 * Enables the creation of standard SSM parameters throughout managed accounts.
 *
 * ### Example
 * ```yaml
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: MyWorkloadParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 * @category Global Configuration
 */
export interface ISsmParametersConfig {
  /**
   * **Parameters** *(Required)*
   *
   * A list of parameters to be created.
   *
   * @see {@link ISsmParameterConfig} for configuration details
   */
  readonly parameters: ISsmParameterConfig[];
  /**
   * **Deployment Targets** *(Required)*
   *
   * Control which environments the SSM parameters are deployed to.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 *
 *
 * ## SSM Parameter Configuration
 *
 * The definition of an SSM parameter.
 *
 * ### Example
 * ```yaml
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: WorkloadsSsmParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 * @category Global Configuration
 */
export interface ISsmParameterConfig {
  /**
   *
   * **Name** *(Required)*
   *
   * The user friendly name of the SSM parameter.
   * This is used to create the CloudFormation Logical ID.
   *
   * @example
   * ```
   * name: MyParameterName
   * ```
   */
  readonly name: t.NonEmptyString;
  /**
   * **Path** *(Required)*
   *
   * The path or name used when creating the SSM parameter.
   *
   */
  readonly path: t.NonEmptyString;
  /**
   * **Value** *(Required)*
   *
   * The value of the SSM Parameter
   */
  readonly value: t.NonEmptyString;
}

/**
 * ## Default Event Bus Configuration
 *
 * Define policies for the default event bus.
 *
 * ### Example
 * ```yaml
 * defaultEventBus:
 *   policy: path-to-my-policy
 * ```
 *
 * @category Global Configuration
 */
export interface IDefaultEventBusConfig {
  /**
   * **Policy** *(Required)*
   *
   * JSON file path containing a resource-based policy definition. The file must be present in the config repository.
   *
   * Resource-based policy definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;

  /**
   * **Deployment Targets** *(Required)*
   *
   * Determine which accounts the configuration applies to.
   * LZA will deploy the LZA managed, or custom policy provided in {@link IDefaultEventBusConfig.policy} property,
   * to the default Event Bus resource-based policy for the respective account(s).
   *
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * ## CloudFormation Stack Policy Configuration
 *
 * The CloudFormation Stack Policy configuration determines how stack resources can be updated or modified during stack operations.
 * When this value is not specified, any existing stack policies will remain in effect and unchanged.
 * The behavior intentionally differs from typical LZA behavior, which assumes false,
 * enabling organizations to manage and maintain stack policies independently through other mechanisms outside of LZA if preferred.
 *
 * ### Example
 * ```yaml
 * stackPolicy:
 *   enable: true
 *   protectedTypes:
 *     - "AWS::EC2::InternetGateway"
 *     - "AWS::EC2::NatGateway"
 *     - "AWS::EC2::PrefixList"
 *     - "AWS::EC2::Route"
 *     - "AWS::EC2::RouteTable"
 *     - "AWS::EC2::SubnetRouteTableAssociation"
 *     - "AWS::EC2::TransitGateway"
 *     - "AWS::EC2::TransitGatewayPeeringAttachment"
 *     - "AWS::EC2::TransitGatewayRoute"
 *     - "AWS::EC2::TransitGatewayRouteTable"
 *     - "AWS::EC2::TransitGatewayRouteTableAssociation"
 *     - "AWS::EC2::TransitGatewayRouteTablePropagation"
 *     - "AWS::EC2::TransitGatewayVpcAttachment"
 *     - "AWS::EC2::VPC"
 *     - "AWS::EC2::VPCCidrBlock"
 *     - "AWS::EC2::VPCEndpoint"
 *     - "AWS::EC2::VPCGatewayAttachment"
 *     - "AWS::NetworkFirewall::Firewall"
 *     - "AWS::NetworkFirewall::LoggingConfiguration"
 *     - "AWS::RAM::ResourceShare"
 * ```
 *
 * @category Global Configuration
 */
export interface IStackPolicyConfig {
  /**
   * **Enable** *(Required)*
   *
   * Indicates whether stack policies are enabled for the organization.
   * When enabled, specified resource types will be protected for Update:Replace and Update:Delete operations.
   *
   */
  readonly enable: boolean;

  /**
   * **Protected Types** *(Required)*
   *
   * A list of CloudFormation resource types that should be protected for Update:Replace and Update:Delete operations.
   *
   * **Example**:
   * ```yaml
   * protectedTypes:
   *   - "AWS::EC2::InternetGateway"
   *   - "AWS::EC2::NatGateway"
   * ```
   */
  readonly protectedTypes: string[];
}

/**
 *
 * ## Root User Management Capabilities Configuration
 *
 * Determines how root user management is controlled within the organization.
 *
 * @example
 * ```
 *   capabilities:
 *    rootCredentialsManagement: true
 *    allowRootSessions: true
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html | AWS Account Root User} for more information
 *
 * @category Global Configuration
 */
export interface IRootUserManagementCapabiltiesConfig {
  /**
   * **Root Credentials Management** *(Required)*
   *
   * Determines whether root user credentials are managed by the organization.
   */
  readonly rootCredentialsManagement: boolean;
  /**
   * **Allow Root Sessions** *(Required)*
   *
   * Determines whether root user sessions are allowed.
   */
  readonly allowRootSessions: boolean;
}

/**
 * ## Central Root User Management Configuration
 *
 * Configure how root management is controlled within the organization.
 *
 * ### Example
 * ```yaml
 * centralRootUserManagement:
 *   enable: true
 *   capabilities:
 *    rootCredentialsManagement: true
 *    allowRootSessions: true
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html | AWS account root user} for more information
 *
 * @category Global Configuration
 */
export interface ICentralRootUserManagementConfig {
  /**
   * **Enable** *(Required)*
   *
   * Determines whether root user management is enabled for the organization.
   */
  readonly enable: boolean;
  /**
   * **Capabilities** *(Required)*
   *
   * Determines how root user management is controlled within the organization.
   *
   * @see {@link IRootUserManagementCapabiltiesConfig} for configuration details
   */
  readonly capabilities: IRootUserManagementCapabiltiesConfig;
}

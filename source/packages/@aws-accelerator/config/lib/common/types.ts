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

/**
 * ## Deployment Targets Interface
 *
 * Defines where AWS resources should be deployed within your AWS organization.
 * This interface provides flexible targeting options for resource deployment across
 * accounts, organizational units, and regions.
 *
 * ### Key Features
 *
 * - **Account-level targeting**: Deploy to specific AWS accounts
 * - **OU-level targeting**: Deploy to all accounts within organizational units
 * - **Regional exclusions**: Skip specific AWS regions for compliance or cost optimization
 * - **Account exclusions**: Exclude specific accounts from broader deployments
 *
 * ### Example
 *
 * ```yaml
 * deploymentTargets:
 *   organizationalUnits:
 *     - Production
 *     - Development
 *   excludedAccounts:
 *     - Management
 *   excludedRegions:
 *     - us-west-1
 * ```
 *
 * @category Common Types
 */
export interface IDeploymentTargets {
  /**
   * **Organizational Units** *(Optional)*
   *
   * List of organizational unit names where resources should be deployed.
   * When specified, resources will be created in all accounts within these OUs.
   *
   * @see {@link DeploymentTargets.organizationalUnits} for detailed documentation
   */
  organizationalUnits?: string[];

  /**
   * **Target Accounts** *(Optional)*
   *
   * List of specific account names where resources should be deployed.
   * Use for precise account-level targeting.
   *
   * @see {@link DeploymentTargets.accounts} for detailed documentation
   */
  accounts?: string[];

  /**
   * **Excluded Regions** *(Optional)*
   *
   * List of AWS regions to exclude from deployment.
   * Useful for compliance requirements or cost optimization.
   *
   * @see {@link DeploymentTargets.excludedRegions} for detailed documentation
   */
  excludedRegions?: string[];

  /**
   * **Excluded Accounts** *(Optional)*
   *
   * List of account names to exclude from deployment.
   * Takes precedence over organizational unit and account inclusions.
   *
   * @see {@link DeploymentTargets.excludedAccounts} for detailed documentation
   */
  excludedAccounts?: string[];
}

/**
 * ## Imported S3 Bucket Configuration (S3 Managed Encryption)
 *
 * Configuration for importing existing S3 buckets that use S3-managed encryption (SSE-S3).
 * Use this interface when you want the Landing Zone Accelerator to manage an existing
 * bucket that was created outside of the accelerator solution.
 *
 * ### Key Features
 *
 * - **Existing Bucket Integration**: Import buckets created outside the accelerator
 * - **Policy Management**: Optional application of accelerator-managed policies
 * - **S3-Managed Encryption**: Designed for buckets using SSE-S3 encryption
 * - **Service Integration**: Automatic policy generation for enabled security services
 *
 * ### Usage Example
 *
 * ```yaml
 * importedBucket:
 *   name: existing-logs-bucket
 *   applyAcceleratorManagedBucketPolicy: true
 * ```
 *
 * @category S3 Configuration
 */
export interface IImportedS3ManagedEncryptionKeyBucketConfig {
  /**
   * **Bucket Name** *(Required)*
   *
   * Name of the existing S3 bucket to be imported and managed by the accelerator.
   * The bucket must already exist in the target AWS account.
   *
   * ### Example
   *
   * ```yaml
   * name: company-existing-logs
   * ```
   */
  name: NonEmptyString;

  /**
   * **Apply Accelerator Managed Bucket Policy** *(Optional)*
   *
   * Controls whether the accelerator should apply its generated resource policies
   * to the imported bucket. When enabled, the accelerator will manage the bucket's
   * resource policy based on enabled security services and configurations.
   *
   * ### Policy Generation
   *
   * The accelerator automatically generates bucket policies based on:
   * - **Security Services**: Macie, GuardDuty, Security Hub access requirements
   * - **Logging Services**: CloudTrail, VPC Flow Logs, Config access needs
   * - **Cross-Account Access**: Organization-wide service access patterns
   * - **External Policies**: Additional policies from s3ResourcePolicyAttachments
   *
   * ### Behavior Options
   *
   * ```yaml
   * # Let accelerator manage policies (recommended for new imports)
   * applyAcceleratorManagedBucketPolicy: true
   *
   * # Preserve existing policies (use for buckets with custom policies)
   * applyAcceleratorManagedBucketPolicy: false
   * ```
   *
   * ### Important Considerations
   *
   * **When `true`:**
   * - Accelerator **REPLACES** existing bucket resource policy
   * - Combines accelerator-generated policies with external policy files
   * - Ensures compatibility with enabled security services
   * - **WARNING**: Removes any existing custom S3 policies on the bucket
   *
   * **When `false` (default):**
   * - Preserves existing bucket resource policy
   * - Only adds policies from external s3ResourcePolicyAttachments files
   * - No changes if no external policy files are provided
   * - Existing policies remain intact
   *
   * ### Best Practices
   *
   * - Set to `true` for buckets that need full accelerator integration
   * - Set to `false` for buckets with critical existing policies
   * - Review existing policies before enabling accelerator management
   * - Test policy changes in non-production environments first
   *
   * @default false
   */
  applyAcceleratorManagedBucketPolicy?: boolean;
}

/**
 * ## Imported S3 Bucket Configuration Implementation (S3 Managed Encryption)
 *
 * Implementation class for importing existing S3 buckets that use S3-managed encryption (SSE-S3).
 * Provides default values and structure for bucket import configuration with optional
 * accelerator-managed policy application.
 *
 * ### Key Features
 *
 * - **Existing Bucket Integration**: Import buckets created outside the accelerator
 * - **Policy Management**: Optional application of accelerator-managed policies
 * - **S3-Managed Encryption**: Designed for buckets using SSE-S3 encryption
 * - **Service Integration**: Automatic policy generation for enabled security services
 *
 * ### Default Configuration
 *
 * - **Empty Name**: Must be populated with actual bucket name
 * - **Policy Management**: Undefined by default, preserves existing policies
 * - **Backward Compatibility**: Safe defaults that don't modify existing buckets
 *
 * @category S3 Configuration
 */
export class ImportedS3ManagedEncryptionKeyBucketConfig implements IImportedS3ManagedEncryptionKeyBucketConfig {
  /**
   * **Bucket Name**
   *
   * Default empty string - must be populated with the actual name of the
   * existing S3 bucket to be imported and managed by the accelerator.
   */
  readonly name: string = '';

  /**
   * **Apply Accelerator Managed Bucket Policy**
   *
   * Default undefined - preserves existing bucket policies when not specified.
   * Set to true to enable accelerator policy management, false to preserve existing policies.
   */
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
}

/**
 * ## Custom S3 Resource Policy Overrides Configuration
 *
 * Configuration for providing custom S3 bucket resource policy files that override
 * the default accelerator-generated policies. Use this interface when you need
 * specific bucket policy statements that differ from the standard accelerator policies.
 *
 * ### Usage Example
 *
 * ```yaml
 * customPolicyOverrides:
 *   policy: path/to/custom-bucket-policy.json
 * ```
 *
 * @category S3 Configuration
 */
export interface ICustomS3ResourcePolicyOverridesConfig {
  /**
   * **S3 Resource Policy File** *(Optional)*
   *
   * Path to a JSON file containing custom S3 bucket resource policy statements.
   * When provided, the accelerator will use this policy instead of generating
   * its own bucket resource policy.
   *
   * ### Behavior
   *
   * - **Complete Replacement**: Overrides all accelerator-generated policies
   * - **No Merging**: Does not combine with default accelerator policies
   * - **Full Control**: Provides complete control over bucket access permissions
   * - **Responsibility**: You are responsible for all required service access
   *
   * ### Example
   *
   * ```yaml
   * policy: compliance/restricted-access-policy.json
   * ```
   */
  policy?: NonEmptyString;
}

export class CustomS3ResourcePolicyOverridesConfig implements ICustomS3ResourcePolicyOverridesConfig {
  readonly policy: string | undefined = undefined;
}

/**
 * ## Imported S3 Bucket Configuration (Customer Managed Encryption)
 *
 * Configuration for importing existing S3 buckets with customer-managed KMS encryption (SSE-KMS).
 * Use this interface when you want the Landing Zone Accelerator to manage an existing
 * bucket that uses or should use customer-managed KMS keys for encryption.
 *
 * ### Key Features
 *
 * - **Existing Bucket Integration**: Import buckets created outside the accelerator
 * - **KMS Key Management**: Option to create and manage KMS keys for the bucket
 * - **Policy Management**: Optional application of accelerator-managed policies
 * - **Encryption Enhancement**: Upgrade existing buckets to use customer-managed keys
 *
 * ### Usage Example
 *
 * ```yaml
 * importedBucket:
 *   name: existing-sensitive-data-bucket
 *   applyAcceleratorManagedBucketPolicy: true
 *   createAcceleratorManagedKey: true
 * ```
 *
 * @category S3 Configuration
 */
export interface IImportedCustomerManagedEncryptionKeyBucketConfig {
  /**
   * **Bucket Name** *(Required)*
   *
   * Name of the existing S3 bucket to be imported and managed by the accelerator.
   * The bucket must already exist in the target AWS account.
   *
   * ### Examples
   *
   * ```yaml
   * name: company-sensitive-logs
   * name: legacy-encrypted-bucket
   * name: imported-compliance-data
   * ```
   */
  name: NonEmptyString;

  /**
   * **Apply Accelerator Managed Bucket Policy** *(Optional)*
   *
   * Controls whether the accelerator should apply its generated resource policies
   * to the imported bucket. When enabled, the accelerator will manage the bucket's
   * resource policy based on enabled security services and configurations.
   *
   * @default false
   */
  applyAcceleratorManagedBucketPolicy?: boolean;

  /**
   * **Create Accelerator Managed KMS Key** *(Optional)*
   *
   * Controls whether the accelerator should create a new customer-managed KMS key
   * and apply it to the imported bucket for encryption. When enabled, enhances
   * bucket security with dedicated encryption key management.
   *
   * ### Key Creation Process
   *
   * **When `true`:**
   * - Creates a new customer-managed KMS key specifically for this bucket
   * - Applies accelerator-managed key policy with appropriate service permissions
   * - Configures bucket to use the new key for server-side encryption
   * - Integrates key permissions with enabled security and logging services
   *
   * **When `false` (default):**
   * - Preserves existing bucket encryption configuration
   * - Uses current encryption method (S3-managed, existing KMS key, or none)
   * - No new KMS key creation or encryption changes
   * - Existing encryption settings remain unchanged
   *
   * ### Important Warnings
   *
   * **Irreversible Change**: Once the accelerator pipeline executes with this value
   * set to `true`, changing it back to `false` will cause CloudFormation stack failures.
   * The KMS key becomes a permanent part of the infrastructure.
   *
   * @default false
   */
  createAcceleratorManagedKey?: boolean;
}

export class ImportedCustomerManagedEncryptionKeyBucketConfig
  implements IImportedCustomerManagedEncryptionKeyBucketConfig
{
  readonly name: string = '';
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
  readonly createAcceleratorManagedKey: boolean | undefined = undefined;
}

/**
 * ## Custom S3 Resource and KMS Policy Overrides Configuration
 *
 * Configuration for providing custom policy files that override both S3 bucket resource
 * policies and KMS key policies. Use this interface when you need specific policy
 * statements for both the bucket and its encryption key that differ from the
 * standard accelerator-generated policies.
 *
 * ### Key Features
 *
 * - **Dual Policy Management**: Override both S3 and KMS policies simultaneously
 * - **Policy File Integration**: Load policies from external JSON files
 * - **Complete Override**: Replaces accelerator-generated policies entirely
 * - **Coordinated Access**: Ensure consistent permissions across bucket and key
 *
 * ### Usage Example
 *
 * ```yaml
 * customPolicyOverrides:
 *   s3Policy: policies/custom-bucket-policy.json
 *   kmsPolicy: policies/custom-key-policy.json
 * ```
 *
 * @category S3 Configuration
 */
export interface ICustomS3ResourceAndKmsPolicyOverridesConfig {
  /**
   * **S3 Resource Policy File** *(Optional)*
   *
   * Path to a JSON file containing custom S3 bucket resource policy statements.
   * When provided, the accelerator will use this policy instead of generating
   * its own bucket resource policy.
   */
  s3Policy?: NonEmptyString;

  /**
   * **KMS Key Policy File** *(Optional)*
   *
   * Path to a JSON file containing custom KMS key policy statements for the
   * bucket's encryption key. When provided, the accelerator will use this policy
   * instead of generating its own key policy.
   */
  kmsPolicy?: NonEmptyString;
}

/**
 * ## Custom S3 Resource and KMS Policy Overrides Implementation
 *
 * Implementation class for custom S3 and KMS policy overrides configuration.
 * Provides default values and structure for policy file specifications.
 *
 * ### Usage
 *
 * Use this configuration when you need to provide custom policy files that override
 * both the S3 bucket resource policy and the KMS key policy. This ensures coordinated
 * access control across both the storage and encryption layers.
 *
 * ### Best Practices
 *
 * - **Policy Coordination**: Ensure S3 and KMS policies work together seamlessly
 * - **Service Integration**: Include permissions for all enabled AWS services
 * - **Testing**: Validate policies in non-production environments first
 * - **Documentation**: Document custom policy requirements and rationale
 *
 * @category S3 Configuration
 */
export class CustomS3ResourceAndKmsPolicyOverridesConfig implements ICustomS3ResourceAndKmsPolicyOverridesConfig {
  readonly s3Policy: string | undefined = undefined;
  readonly kmsPolicy: string | undefined = undefined;
}

/**
 * ## Deployment Targets Configuration
 *
 * Defines where AWS resources should be created within your AWS organization.
 * This configuration provides flexible targeting options that allow you to specify
 * which AWS accounts, organizational units (OUs), and regions should receive
 * the resources being deployed by the Landing Zone Accelerator.
 *
 * ### Key Features
 *
 * - **Flexible Targeting**: Deploy to specific accounts, entire OUs, or combinations
 * - **Exclusion Support**: Exclude specific accounts or regions from broader deployments
 * - **Regional Control**: Skip deployment in specific AWS regions
 * - **Hierarchical Logic**: OU-based deployment with account-level exceptions
 *
 *
 * ### Usage Examples
 *
 * ```yaml
 * # Deploy to all accounts in organization except Management
 * deploymentTargets:
 *   organizationalUnits:
 *     - Root
 *   excludedAccounts:
 *     - Management
 *
 * # Deploy only to production accounts in specific regions
 * deploymentTargets:
 *   organizationalUnits:
 *     - Production
 *   excludedRegions:
 *     - us-west-1
 *     - ap-south-1
 *
 * # Deploy to specific accounts only
 * deploymentTargets:
 *   accounts:
 *     - Production-Account-1
 *     - Production-Account-2
 * ```
 *
 * Learn more about [AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html).
 *
 * @category Common Types
 */
export class DeploymentTargets implements IDeploymentTargets {
  /**
   * List of organizational units (OUs) where resources should be deployed.
   *
   * When you specify an OU, the resource will be created in every AWS account
   * that belongs to that OU. This is useful for deploying resources across
   * multiple accounts at once.
   *
   * Organizational Units are like folders that contain AWS accounts. For example,
   * you might have a "Production" OU containing all your production accounts,
   * and a "Development" OU containing all your development accounts.
   *
   * **Important**: If an OU contains other OUs (nested structure), you must
   * explicitly list each nested OU if you want resources deployed there.
   *
   * Learn more about [Organizational Units](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html).
   *
   * **Example**
   * ```
   * organizationalUnits:
   *   - Production
   *   - Development
   *   - Sandbox
   *   - Sandbox/AppA
   * ```
   */
  readonly organizationalUnits: string[] = [];
  /**
   * List of specific AWS account names where resources should be deployed.
   *
   * Use this when you want to target specific accounts rather than entire
   * organizational units. Account names should match the names defined in
   * your accelerator configuration.
   *
   * Each AWS account has a unique name that you define when setting up the
   * Landing Zone Accelerator. Use those exact names here.
   *
   * **Example**
   * ```
   * accounts:
   *   - Production-Account-1
   *   - Development-Account-2
   *   - Security-Tooling
   * ```
   */
  readonly accounts: string[] = [];
  /**
   * List of AWS regions where resources should NOT be deployed.
   *
   * By default, resources are deployed to all regions you've enabled in your
   * Landing Zone Accelerator configuration. Use this property to skip specific
   * regions for this particular resource.
   *
   * AWS regions are geographic locations where AWS has data centers. Examples
   * include us-east-1 (N. Virginia), eu-west-1 (Ireland), ap-southeast-1 (Singapore).
   *
   * This is useful when certain resources aren't available in all regions, or when
   * you have compliance requirements that restrict where data can be stored.
   *
   * See {@link GlobalConfig} for the complete list of enabled regions.
   * Learn more about [AWS Regions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html).
   *
   * **Example**
   * ```
   * excludedRegions:
   *   - us-west-1
   *   - ap-south-1
   * ```
   */
  readonly excludedRegions: string[] = [];
  /**
   * List of AWS account names that should be excluded from deployment.
   *
   * This is useful when you want to deploy to an entire organizational unit
   * but skip specific accounts within that OU. For example, you might want
   * to deploy to all production accounts except one that's being decommissioned.
   *
   * Account names should match exactly with the names defined in your accelerator
   * configuration. These are the same names you would use in the `accounts` property.
   *
   * This exclusion takes precedence over inclusions - if an account is listed here,
   * it will be excluded even if it's part of an OU or explicitly listed in `accounts`.
   *
   * See {@link IAccountConfig} or {@link IGovCloudAccountConfig} for account configuration details.
   *
   * **Example**
   * ```
   * excludedAccounts:
   *   - Management
   *   - Legacy-Account
   *   - Decommissioned-Prod
   * ```
   */
  readonly excludedAccounts: string[] = [];
}

/**
 * ## S3 Storage Class Type
 *
 * Defines the available Amazon S3 storage classes for lifecycle transitions.
 * Each storage class is optimized for different access patterns, durability
 * requirements, and cost considerations.
 *
 * @see {@link https://aws.amazon.com/s3/storage-classes/ | Amazon S3 Storage Classes} for more information
 *
 * @category S3 Configuration
 */
export type StorageClass =
  | 'DEEP_ARCHIVE'
  | 'GLACIER'
  | 'GLACIER_IR'
  | 'STANDARD_IA'
  | 'INTELLIGENT_TIERING'
  | 'ONEZONE_IA';

/**
 * ## Email Address Type
 *
 * Represents a valid email address with AWS-compatible formatting requirements.
 * Used throughout the Landing Zone Accelerator for account creation, notifications,
 * and contact information.
 *
 * ### Format Requirements
 *
 * - **Length**: 6-64 characters
 * - **Pattern**: Must match standard email format
 * - **Domain**: Must contain at least one dot in the domain portion
 *
 * ### Examples
 *
 * ```typescript
 * const email1: EmailAddress = "admin@example.com";
 * ```
 *
 * @minLength 6
 * @maxLength 64
 * @pattern ['^\S+@\S+\.\S+$', '^\w+$']
 * @category Common Types
 */
export type EmailAddress = string;

/**
 * ## Non-Empty String Type
 *
 * Represents a string that must contain at least one character.
 * Used for required text fields throughout the Landing Zone Accelerator
 * configuration where empty values are not permitted.
 *
 * ```
 *
 * @minLength 1
 * @category Common Types
 */
export type NonEmptyString = string;

/**
 * ## Non-Empty No-Space String Type
 *
 * Represents a string that must contain at least one character and cannot
 * contain any whitespace characters.
 *
 * ### Common Use Cases
 *
 * - AWS account names
 * - Account aliases
 * - Resource identifiers
 * - Configuration keys
 * - File names and paths
 *
 * @pattern ^[^\s]*$
 * @minLength 1
 * @category Common Types
 */
export type NonEmptyNoSpaceString = string;

/**
 * ## S3 Storage Class Transition Configuration
 *
 * Defines when and how objects should transition from their current storage class
 * to a different storage class. Used in S3 lifecycle rules to optimize storage
 * costs based on data access patterns and retention requirements.
 *
 * ### Key Components
 *
 * - **Storage Class**: Target storage class for the transition
 * - **Transition Timing**: Number of days after object creation or version change
 *
 * ### Example
 *
 * ```yaml
 * transitions:
 *   - storageClass: STANDARD_IA
 *     transitionAfter: 30
 *   - storageClass: GLACIER
 *     transitionAfter: 365
 *   - storageClass: DEEP_ARCHIVE
 *     transitionAfter: 2555
 * ```
 *
 * @category S3 Configuration
 */
export interface ITransition {
  /**
   * **Target Storage Class** *(Required)*
   *
   * The S3 storage class that objects should transition to after the specified time period.
   *
   * @see {@link StorageClass} for available storage class options and characteristics
   */
  storageClass: StorageClass;

  /**
   * **Transition After (Days)** *(Required)*
   *
   * Number of days after object creation (for current versions) or after becoming
   * non-current (for non-current versions) when the transition should occur.
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html | Transitioning Objects using Amazon S3 Lifecycle} for more information
   *
   */
  transitionAfter: number;
}

/**
 * ## Resource Policy Statement Configuration
 *
 * Defines a custom resource policy statement that can be applied to AWS resources.
 * Used for providing additional or override policy statements beyond the default
 * accelerator-generated policies.
 *
 * ### Usage Context
 *
 * - **Custom Access Patterns**: Define specific access requirements
 * - **Policy Attachments**: Add policies to existing resources
 * - **Compliance Requirements**: Meet specific regulatory or security needs
 * - **Service Integration**: Enable access for additional AWS services
 *
 * @category Policy Configuration
 */
export interface IResourcePolicyStatement {
  /**
   * **Policy Document** *(Required)*
   *
   * Path to a JSON file containing a valid AWS IAM policy document, or the
   * policy document content as a JSON string.
   *
   */
  policy: string;
}

/**
 * ## S3 Bucket Lifecycle Rule Configuration
 *
 * Defines lifecycle management rules for S3 buckets to automatically transition
 * objects between storage classes and manage object expiration. Lifecycle rules
 * help optimize storage costs and manage data retention policies.
 *
 * ### Key Features
 *
 * - **Cost Optimization**: Automatically transition objects to cheaper storage classes
 * - **Data Management**: Set expiration policies for automatic cleanup
 * - **Version Control**: Manage current and non-current object versions separately
 * - **Prefix Filtering**: Apply rules to specific object prefixes or entire buckets
 *
 * ### Usage Example
 *
 * ```yaml
 * lifecycleRules:
 *   - enabled: true
 *     id: LogsLifecycle
 *     abortIncompleteMultipartUpload: 7
 *     expiration: 2555  # ~7 years
 *     expiredObjectDeleteMarker: false
 *     noncurrentVersionExpiration: 365
 *     transitions:
 *       - storageClass: STANDARD_IA
 *         transitionAfter: 30
 *       - storageClass: GLACIER
 *         transitionAfter: 365
 *     prefix: logs/
 *
 *   - enabled: true
 *     id: ArchiveLifecycle
 *     expiredObjectDeleteMarker: true
 *     noncurrentVersionExpiration: 90
 *     transitions:
 *       - storageClass: DEEP_ARCHIVE
 *         transitionAfter: 180
 * ```
 *
 * @category S3 Configuration
 */
export interface ILifecycleRule {
  /**
   * **Abort Incomplete Multipart Uploads** *(Optional)*
   *
   * Number of days after which incomplete multipart uploads are automatically
   * aborted and cleaned up. This helps prevent storage costs from abandoned
   * multipart uploads.
   *
   * ### Benefits
   *
   * - **Cost Control**: Prevents charges for incomplete upload parts
   * - **Storage Cleanup**: Automatically removes orphaned multipart data
   * - **Operational Hygiene**: Maintains clean bucket state
   *
   * ### Considerations
   *
   * - Set based on your typical upload patterns and file sizes
   * - Consider network reliability and upload duration requirements
   * - Balance between cost control and operational flexibility
   */
  readonly abortIncompleteMultipartUpload?: number;

  /**
   * **Rule Enabled** *(Optional)*
   *
   * Controls whether this lifecycle rule is active and enforced.
   * Allows you to temporarily disable rules without removing them
   * from the configuration.
   *
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * **Object Expiration** *(Optional)*
   *
   * Number of days after object creation when objects are permanently deleted
   * from the bucket. This implements automatic data retention policies and
   * helps manage storage costs for time-sensitive data.
   *
   * ### Use Cases
   *
   * - **Log Retention**: Automatically delete old log files
   * - **Compliance**: Enforce data retention policies
   * - **Cost Management**: Remove data that's no longer needed
   * - **Regulatory Requirements**: Meet data disposal requirements
   *
   * ### Important Considerations
   *
   * - **Irreversible**: Expired objects are permanently deleted
   * - **Compliance**: Ensure retention periods meet regulatory requirements
   * - **Business Needs**: Consider future data access requirements
   * - **Backup Strategy**: Ensure critical data is backed up before expiration
   */
  readonly expiration?: number;

  /**
   * **Expired Object Delete Marker Cleanup** *(Optional)*
   *
   * Controls whether S3 automatically removes delete markers that have no
   * non-current versions. This helps clean up versioned buckets and reduce
   * storage costs from orphaned delete markers.
   *
   * ### Benefits When Enabled
   *
   * - **Cost Reduction**: Eliminates charges for orphaned delete markers
   * - **Storage Optimization**: Keeps bucket metadata clean
   * - **Operational Efficiency**: Reduces clutter in versioned buckets
   *
   * @default false
   */
  readonly expiredObjectDeleteMarker?: boolean;

  /**
   * **Rule Identifier** *(Optional)*
   *
   * Unique, human-readable name for the lifecycle rule within the bucket.
   * Used for rule identification, management, and troubleshooting.
   *
   */
  readonly id?: string;

  /**
   * **Non-Current Version Expiration** *(Optional)*
   *
   * Number of days after an object version becomes non-current when it should
   * be permanently deleted. This manages storage costs for versioned buckets
   * by cleaning up old object versions.
   *
   * ### Considerations
   *
   * - **Recovery Needs**: Balance cost vs. ability to recover old versions
   * - **Compliance**: Some regulations require version retention
   * - **Storage Costs**: Non-current versions incur full storage charges
   * - **Access Patterns**: Consider how often old versions are accessed
   */
  readonly noncurrentVersionExpiration?: number;

  /**
   * **Non-Current Version Transitions** *(Optional)*
   *
   * Array of transition rules that specify when non-current object versions
   * should move to different storage classes. This optimizes costs for
   * versioned buckets by moving old versions to cheaper storage.
   *
   * ### Storage Class Optimization
   *
   * Non-current versions are typically accessed less frequently than current
   * versions, making them ideal candidates for cheaper storage classes.
   *
   * @see {@link ITransition} for transition rule configuration
   */
  readonly noncurrentVersionTransitions?: ITransition[];

  /**
   * **Current Version Transitions** *(Optional)*
   *
   * Array of transition rules that specify when current objects should move
   * to different storage classes. This implements cost optimization strategies
   * based on data access patterns and age.
   *
   * ### Cost Optimization Strategy
   *
   * Design transitions based on your data access patterns:
   * - **Frequently Accessed**: Keep in Standard storage
   * - **Infrequently Accessed**: Transition to Standard-IA
   * - **Archive Data**: Move to Glacier or Deep Archive
   * - **Long-term Retention**: Use Deep Archive for lowest cost
   *
   * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html | Transitioning objects using Amazon S3 Lifecycle} for more information
   * @see {@link ITransition} for transition rule configuration
   */
  readonly transitions?: ITransition[];

  /**
   * **Object Key Prefix Filter** *(Optional)*
   *
   * Object key prefix that identifies which objects this lifecycle rule applies to.
   * When specified, the rule only affects objects whose keys start with this prefix.
   * When omitted, the rule applies to all objects in the bucket.

   *
   * ### Best Practices
   *
   * - Use consistent prefix naming conventions
   * - Design prefixes to support different lifecycle needs
   * - Consider future organizational changes
   * - Document prefix meanings and purposes
   *
   * @default undefined (applies to all objects in the bucket)
   */
  readonly prefix?: NonEmptyString;
}

export class LifeCycleRule implements ILifecycleRule {
  readonly abortIncompleteMultipartUpload: number = 1;
  readonly enabled: boolean = true;
  readonly expiration: number = 1825;
  readonly expiredObjectDeleteMarker: boolean = false;
  readonly id: string = '';
  readonly noncurrentVersionExpiration: number = 366;
  readonly noncurrentVersionTransitions: ITransition[] = [];
  readonly transitions: ITransition[] = [];
  readonly prefix: string | undefined = undefined;
}

/**
 * ## Resource Access Manager (RAM) Share Targets Interface
 *
 * Interface for AWS Resource Access Manager (RAM) share targets, which defines
 * where shared resources should be made available within your AWS organization.
 * RAM enables secure sharing of resources between AWS accounts and organizational
 * units without duplicating resources or compromising security.
 *
 * ### Key Features
 *
 * - **Cross-Account Sharing**: Share resources across multiple AWS accounts
 * - **OU-Level Sharing**: Share with entire organizational units at once
 * - **Centralized Management**: Manage shared resources from a central account
 * - **Cost Optimization**: Avoid resource duplication across accounts
 * - **Security**: Maintain resource ownership while enabling controlled access
 *
 * ### Example
 *
 * ```yaml
 * shareTargets:
 *   organizationalUnits:
 *     - Root
 * ```
 *
 * Learn more about [AWS Resource Access Manager](https://docs.aws.amazon.com/ram/latest/userguide/what-is.html).
 *
 * @category Common Types
 */
export interface IShareTargets {
  /**
   * **Organizational Units** *(Optional)*
   *
   * List of organizational unit names that should receive access to the shared resource.
   * When specified, all accounts within these OUs will be able to consume the shared resource.
   */
  organizationalUnits?: string[];

  /**
   * **Target Accounts** *(Optional)*
   *
   * List of specific account names that should receive access to the shared resource.
   * Use this for precise, account-level control over resource sharing.
   */
  accounts?: string[];
}

/**
 * ## Resource Access Manager (RAM) Share Targets Configuration
 *
 * Configuration for AWS Resource Access Manager (RAM) share targets, which defines
 * where shared resources should be made available within your AWS organization.
 * RAM enables secure sharing of resources between AWS accounts and organizational
 * units without duplicating resources or compromising security.
 *
 * ### Key Features
 *
 * - **Cross-Account Sharing**: Share resources across multiple AWS accounts
 * - **OU-Level Sharing**: Share with entire organizational units at once
 * - **Centralized Management**: Manage shared resources from a central account
 * - **Cost Optimization**: Avoid resource duplication across accounts
 * - **Security**: Maintain resource ownership while enabling controlled access
 *
 * ### Example
 *
 * ```yaml
 * shareTargets:
 *   organizationalUnits:
 *     - Root
 * ```
 *
 * Learn more about [AWS Resource Access Manager](https://docs.aws.amazon.com/ram/latest/userguide/what-is.html).
 *
 * @category Common Types
 */
export class ShareTargets implements IShareTargets {
  /**
   * **Organizational Units** *(Optional)*
   *
   * List of organizational unit names that should receive access to the shared resource.
   * When specified, all accounts within these OUs will be able to consume the shared resource.
   *
   * ### Sharing Behavior
   *
   * - **Account Inclusion**: All accounts within the specified OU receive access
   * - **Nested OUs**: Must be explicitly listed - sharing doesn't automatically cascade
   * - **Dynamic Membership**: New accounts added to the OU automatically gain access
   * - **Permission Inheritance**: Accounts inherit the sharing permissions
   *
   * ### Example
   *
   * ```yaml
   * # To share with nested OUs, list them explicitly
   * organizationalUnits:
   *   - Production          # Parent OU
   *   - Production/WebTier  # Nested OU must be explicit
   *   - Production/DataTier # Another nested OU
   * ```
   *
   */
  readonly organizationalUnits: string[] = [];

  /**
   * **Target Accounts** *(Optional)*
   *
   * List of specific account names that should receive access to the shared resource.
   * Use this for precise, account-level control over resource sharing.
   *
   * ### When to Use Account-Level Sharing
   *
   * - **Selective Access**: When only specific accounts need the resource
   * - **Cross-OU Sharing**: When accounts in different OUs need access
   * - **Pilot Programs**: When testing resource sharing with limited accounts
   * - **Special Cases**: When OU-level sharing is too broad
   *
   * ### Management Considerations
   *
   * - Account names must match those defined in accounts-config.yaml
   * - Changes to account sharing require configuration updates
   * - Consider using OU-level sharing for easier management at scale
   * - Document the rationale for account-specific sharing decisions
   */
  readonly accounts: string[] = [];
}

/**
 * ## Allow/Deny Type
 *
 * Represents permission states for access control and policy configurations.
 * Used throughout the Landing Zone Accelerator for defining access permissions.
 *
 * ### Values
 * - **allow**: Grant permission or enable access
 * - **deny**: Deny permission or block access
 *
 * @category Common Types
 */
export type AllowDeny = 'allow' | 'deny';

/**
 * ## Enable/Disable Type
 *
 * Represents activation states for features and services throughout the
 * Landing Zone Accelerator configuration.
 *
 * ### Values
 * - **enable**: Activate the feature or service
 * - **disable**: Deactivate the feature or service
 *
 * @category Common Types
 */
export type EnableDisable = 'enable' | 'disable';

/**
 * ## Availability Zone Suffix Type
 *
 * Represents the single-letter suffix used to identify AWS Availability Zones
 * within a region. Combined with region names to form complete AZ identifiers.
 *
 * ### Values
 * - **a, b, c, d, e, f**: Standard AZ suffixes used across AWS regions
 *
 * ### Usage Examples
 * - us-east-1a, us-east-1b, us-east-1c
 * - eu-west-1a, eu-west-1b, eu-west-1c
 *
 * ### Considerations
 * - Not all regions have all six availability zones
 * - AZ availability varies by region and AWS service
 * - Some regions may have additional AZs beyond 'f'
 *
 * @category Common Types
 */
export type AvailabilityZone = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

/**
 * ## Threshold Type
 *
 * Defines how threshold values should be interpreted in monitoring and
 * alerting configurations, particularly for AWS Budgets and CloudWatch alarms.
 *
 * ### Values
 * - **PERCENTAGE**: Threshold as a percentage of the total/baseline value
 * - **ABSOLUTE_VALUE**: Threshold as an absolute numeric value
 *
 * @category Monitoring Configuration
 */
export type ThresholdType = 'PERCENTAGE' | 'ABSOLUTE_VALUE';

/**
 * ## Comparison Operator Type
 *
 * Defines comparison operations used in monitoring, alerting, and conditional
 * logic throughout the Landing Zone Accelerator configuration.
 *
 * ### Values
 * - **GREATER_THAN**: Trigger when value exceeds threshold
 * - **LESS_THAN**: Trigger when value falls below threshold
 * - **EQUAL_TO**: Trigger when value equals threshold
 *
 * @category Monitoring Configuration
 */
export type ComparisonOperator = 'GREATER_THAN' | 'LESS_THAN' | 'EQUAL_TO';

/**
 * ## Subscription Type
 *
 * Defines the delivery mechanism for notifications and alerts from AWS services
 * like Budgets, CloudWatch, and other monitoring services.
 *
 * ### Values
 * - **EMAIL**: Send notifications via email to specified addresses
 * - **SNS**: Send notifications via Amazon SNS topic
 *
 * ### Considerations
 * - **EMAIL**: Simple setup, direct delivery, limited to email addresses
 * - **SNS**: More flexible, supports multiple endpoints, requires SNS topic setup
 *
 * @category Notification Configuration
 */
export type SubscriptionType = 'EMAIL' | 'SNS';

/**
 * ## Notification Type
 *
 * Defines when budget notifications should be triggered based on spending
 * patterns and forecasting data from AWS Budgets.
 *
 * ### Values
 * - **ACTUAL**: Trigger notifications based on actual incurred costs
 * - **FORECASTED**: Trigger notifications based on projected/forecasted costs
 *
 * @category Budget Configuration
 */
export type NotificationType = 'ACTUAL' | 'FORECASTED';

/**
 * ## Security Hub Severity Level Type
 *
 * Defines the severity levels used by AWS Security Hub for categorizing
 * security findings and compliance issues.
 *
 * ### Values (Highest to Lowest Severity)
 * - **CRITICAL**: Immediate action required, severe security risk
 * - **HIGH**: Urgent attention needed, significant security concern
 * - **MEDIUM**: Important but not urgent, moderate security risk
 * - **LOW**: Minor security concern, low priority
 * - **INFORMATIONAL**: Informational findings, no immediate action needed
 *
 * @category Security Configuration
 */
export type SecurityHubSeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

/**
 * ## AWS Resource Tag Configuration
 *
 * Defines key-value pairs used for tagging AWS resources. Tags provide metadata
 * for resource organization, cost allocation, access control, and automation.
 *
 * ### Key Features
 *
 * - **Resource Organization**: Group and categorize resources logically
 * - **Cost Allocation**: Track costs by project, department, or environment
 * - **Access Control**: Use tags in IAM policies for conditional access
 * - **Automation**: Trigger automated actions based on tag values
 * - **Compliance**: Meet organizational and regulatory tagging requirements
 *
 * ### Example
 *
 * ```yaml
 * tags:
 *   - key: Environment
 *     value: Production
 *   - key: Project
 *     value: WebApplication
 *   - key: Owner
 *     value: Platform-Team
 *   - key: CostCenter
 *     value: Engineering
 *   - key: Backup
 *     value: Daily
 * ```
 *
 * @category Common Types
 */
export interface ITag {
  /**
   * **Tag Key** *(Required)*
   *
   * The tag key name that identifies the type of metadata being stored.
   * Tag keys should follow consistent naming conventions across your organization.
   *
   *
   */
  key: string;

  /**
   * **Tag Value** *(Required)*
   *
   * The tag value that provides the actual metadata content for the tag key.
   * Values should be meaningful and follow organizational standards.
   *
   */
  value: string;
}

/**
 * ## AWS Resource Tag Implementation
 *
 * Implementation class for AWS resource tags with default empty values.
 * Provides a concrete implementation of the ITag interface for use in
 * configuration classes and resource definitions.
 *
 * ### Usage
 *
 * This class is typically used as a default implementation in configuration
 * classes where tags are optional but need to be initialized.
 *
 * @category Common Types
 */
export class Tag implements ITag {
  /**
   * **Tag Key**
   *
   * Default empty tag key. Should be populated with meaningful key names
   * when creating tag instances.
   *
   */
  readonly key: string = '';

  /**
   * **Tag Value**
   *
   * Default empty tag value. Should be populated with meaningful values
   * when creating tag instances.
   */
  readonly value: string = '';
}

/**
 * ## CloudFormation StackSet Operation Preferences Interface
 *
 * Configuration interface for AWS CloudFormation StackSet operation preferences.
 * These preferences control how StackSet operations are executed across multiple
 * accounts and regions, including failure tolerance and concurrency settings.
 *
 * ### Key Features
 *
 * - **Failure Tolerance**: Control how many failures are acceptable during deployment
 * - **Concurrency Control**: Manage how many operations run simultaneously
 * - **Regional Ordering**: Specify the order of region deployments
 * - **Parallel Execution**: Configure parallel vs sequential deployment patterns
 *
 * ### Example
 *
 * ```yaml
 * operationPreferences:
 *   failureTolerancePercentage: 10
 *   maxConcurrentPercentage: 50
 *   regionConcurrencyType: PARALLEL
 *   regionOrder:
 *     - us-east-1
 *     - us-west-2
 * ```
 *
 * Learn more about [StackSet Operation Preferences](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacksets-concepts.html#stacksets-concepts-ops).
 *
 * @category CloudFormation Configuration
 */
export interface IOperationPreferences {
  /**
   * **Failure Tolerance Count** *(Optional)*
   *
   * The absolute number of accounts in which stack operations can fail
   * before the operation is stopped. Cannot be used with failureTolerancePercentage.
   */
  failureToleranceCount?: number;

  /**
   * **Failure Tolerance Percentage** *(Optional)*
   *
   * The percentage of accounts in which stack operations can fail
   * before the operation is stopped. Cannot be used with failureToleranceCount.
   */
  failureTolerancePercentage?: number;

  /**
   * **Maximum Concurrent Count** *(Optional)*
   *
   * The absolute maximum number of accounts in which stack operations
   * can be performed concurrently. Cannot be used with maxConcurrentPercentage.
   */
  maxConcurrentCount?: number;

  /**
   * **Maximum Concurrent Percentage** *(Optional)*
   *
   * The maximum percentage of accounts in which stack operations can be
   * performed concurrently. Cannot be used with maxConcurrentCount.
   */
  maxConcurrentPercentage?: number;

  /**
   * **Region Concurrency Type** *(Optional)*
   *
   * The concurrency type of deploying StackSets operations in regions.
   * Valid values are SEQUENTIAL and PARALLEL.
   *
   * @default 'PARALLEL'
   */
  regionConcurrencyType?: string;

  /**
   * **Region Order** *(Optional)*
   *
   * The order of the regions where you want to perform the stack operation.
   * Only applies when regionConcurrencyType is SEQUENTIAL.
   */
  regionOrder?: string[];
}

/**
 * ## CloudFormation StackSet Operation Preferences Implementation
 *
 * Implementation class for AWS CloudFormation StackSet operation preferences
 * with sensible default values for deployment control and failure tolerance.
 *
 * ### Default Configuration
 *
 * - **Failure Tolerance**: 25% of accounts can fail before stopping
 * - **Concurrency**: Up to 35% of accounts can be deployed to simultaneously
 * - **Region Strategy**: Parallel deployment across regions for faster execution
 *
 * @category CloudFormation Configuration
 */
export class OperationPreferences implements IOperationPreferences {
  /**
   * **Failure Tolerance Count**
   *
   * Default undefined - uses percentage-based failure tolerance instead.
   */
  readonly failureToleranceCount: number | undefined = undefined;

  /**
   * **Failure Tolerance Percentage**
   *
   * Default 25% - allows up to 25% of target accounts to fail before stopping the operation.
   */
  readonly failureTolerancePercentage: number = 25;

  /**
   * **Maximum Concurrent Count**
   *
   * Default undefined - uses percentage-based concurrency control instead.
   */
  readonly maxConcurrentCount: number | undefined = undefined;

  /**
   * **Maximum Concurrent Percentage**
   *
   * Default 35% - allows up to 35% of target accounts to be deployed to simultaneously.
   */
  readonly maxConcurrentPercentage: number = 35;

  /**
   * **Region Concurrency Type**
   *
   * Default 'PARALLEL' - deploys to all regions simultaneously for faster execution.
   */
  readonly regionConcurrencyType: string = 'PARALLEL';

  /**
   * **Region Order**
   *
   * Default undefined - no specific region ordering when using parallel deployment.
   */
  readonly regionOrder: string[] | undefined = undefined;
}

/**
 * ## CloudFormation Parameter Interface
 *
 * Interface for AWS CloudFormation template parameters that can be passed
 * to CloudFormation stacks during deployment. Parameters allow customization
 * of stack resources without modifying the template.
 *
 * ### Key Features
 *
 * - **Template Customization**: Modify stack behavior without changing templates
 * - **Environment Flexibility**: Use different values across environments
 * - **Reusability**: Make templates reusable across different contexts
 * - **Security**: Pass sensitive values securely to stacks
 *
 * ### Example
 *
 * ```yaml
 * parameters:
 *   - name: InstanceType
 *     value: t3.micro
 *   - name: Environment
 *     value: Production
 * ```
 *
 * Learn more about [CloudFormation Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html).
 *
 * @category CloudFormation Configuration
 */
export interface ICfnParameter {
  /**
   * **Parameter Name** *(Required)*
   *
   * The name of the CloudFormation parameter as defined in the template.
   * Must match exactly with the parameter name in the CloudFormation template.
   */
  name: string;

  /**
   * **Parameter Value** *(Required)*
   *
   * The value to pass to the CloudFormation parameter during stack deployment.
   * The value must be compatible with the parameter type defined in the template.
   */
  value: string;
}

/**
 * ## CloudFormation Parameter Implementation
 *
 * Implementation class for CloudFormation parameters with default empty values.
 * Used to provide concrete instances of parameter configurations for stack deployments.
 *
 * ### Usage
 *
 * This class is typically used in configuration classes where CloudFormation
 * parameters need to be defined and passed to stack deployments.
 *
 * @category CloudFormation Configuration
 */
export class CfnParameter implements ICfnParameter {
  /**
   * **Parameter Name**
   *
   * Default empty parameter name. Should be populated with the actual
   * CloudFormation parameter name from the template.
   */
  readonly name: string = '';

  /**
   * **Parameter Value**
   *
   * Default empty parameter value. Should be populated with the actual
   * value to pass to the CloudFormation parameter.
   */
  readonly value: string = '';
}

/**
 * ## VPC Flow Logs Traffic Type
 *
 * Defines which types of network traffic should be captured in VPC Flow Logs.
 * This determines the scope of network visibility and the volume of log data generated.
 *
 * ### Values
 * - **ALL**: Capture all network traffic (both accepted and rejected)
 * - **ACCEPT**: Capture only traffic that was allowed by security groups/NACLs
 * - **REJECT**: Capture only traffic that was blocked by security groups/NACLs
 *
 * @category Network Configuration
 */
export type TrafficType = 'ALL' | 'ACCEPT' | 'REJECT';

/**
 * ## Log Destination Type
 *
 * Defines the supported destinations for storing and processing log data
 * from various AWS services like VPC Flow Logs, CloudTrail, and other logging services.
 *
 * ### Values
 * - **s3**: Amazon S3 for cost-effective long-term storage and batch analysis
 * - **cloud-watch-logs**: CloudWatch Logs for real-time monitoring and alerting
 *
 * @category Logging Configuration
 */
export type LogDestinationType = 's3' | 'cloud-watch-logs';

/**
 * ## CloudWatch Logs Data Protection Categories
 *
 * Enumeration of data protection categories supported by the Landing Zone Accelerator
 * for CloudWatch Logs data protection policies. These categories help automatically
 * detect and protect sensitive information in log streams.
 *
 * ### Key Features
 *
 * - **Automatic Detection**: Scan log data for sensitive information patterns
 * - **Data Masking**: Automatically mask or redact detected sensitive data
 * - **Compliance**: Meet regulatory requirements for data protection
 * - **Audit Trail**: Track when sensitive data is detected and protected
 *
 * ### Supported Categories
 *
 * - **Credentials**: Detect and protect authentication credentials, API keys, passwords
 *
 * Learn more about [CloudWatch Logs Data Protection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types.html).
 *
 * @category Logging Configuration
 */
export enum CloudWatchLogDataProtectionCategories {
  /**
   * **Credentials Protection**
   *
   * Detects and protects various types of authentication credentials and secrets
   * that may appear in log data, including:
   *
   */
  Credentials = 'Credentials',
}

/**
 * ## VPC Flow Logs S3 Bucket Configuration Interface
 *
 * Configuration interface for S3 destination settings when VPC Flow Logs
 * are sent to Amazon S3. Provides control over lifecycle management and
 * custom log path configurations for cost optimization and organization.
 *
 * ### Key Features
 *
 * - **Lifecycle Management**: Automatic transition and expiration of log files
 * - **Custom Paths**: Override default S3 log path structure
 * - **Cost Optimization**: Reduce storage costs through intelligent tiering
 * - **Retention Control**: Manage log retention periods automatically
 *
 * @category Network Configuration
 */
export interface IVpcFlowLogsS3BucketConfig {
  /**
   * **Lifecycle Rules** *(Optional)*
   *
   * S3 lifecycle rules to manage flow log files automatically.
   * Controls when logs transition to cheaper storage classes and when they expire.
   */
  lifecycleRules?: ILifecycleRule[];

  /**
   * **Override S3 Log Path** *(Optional)*
   *
   * Custom S3 key prefix for organizing flow log files.
   * Overrides the default LZA path structure for flow logs.
   */
  overrideS3LogPath?: NonEmptyString;
}

/**
 * ## VPC Flow Logs CloudWatch Logs Configuration Interface
 *
 * Configuration interface for CloudWatch Logs destination settings when
 * VPC Flow Logs are sent to Amazon CloudWatch Logs. Provides control over
 * log retention and encryption for real-time monitoring capabilities.
 *
 * ### Key Features
 *
 * - **Retention Management**: Control how long logs are kept in CloudWatch
 * - **Encryption**: Secure logs with customer-managed KMS keys
 * - **Real-time Analysis**: Enable immediate log analysis and alerting
 * - **Cost Control**: Manage CloudWatch Logs storage costs through retention
 *
 * @category Network Configuration
 */
export interface IVpcFlowLogsCloudWatchLogsConfig {
  /**
   * **Retention in Days** *(Optional)*
   *
   * Number of days to retain flow logs in CloudWatch Logs.
   * After this period, logs are automatically deleted to control costs.
   *
   * @default 365
   */
  retentionInDays?: number;

  /**
   * **KMS Key** *(Optional)*
   *
   * Name of the KMS key to use for encrypting flow logs in CloudWatch Logs.
   * Provides additional security for sensitive network traffic data.
   */
  kms?: NonEmptyString;
}

/**
 * ## VPC Flow Logs Destination Configuration Interface
 *
 * Configuration interface for VPC Flow Logs destination settings, supporting
 * both S3 and CloudWatch Logs destinations. Allows fine-grained control over
 * how flow logs are stored, retained, and processed.
 *
 * ### Supported Destinations
 *
 * - **S3**: Cost-effective long-term storage with lifecycle management
 * - **CloudWatch Logs**: Real-time monitoring with immediate alerting capabilities
 * - **Dual Destination**: Send to both S3 and CloudWatch simultaneously
 *
 * ### Example
 *
 * ```yaml
 * destinationsConfig:
 *   s3:
 *     lifecycleRules:
 *       - enabled: true
 *         expiration: 2555
 *         transitions:
 *           - storageClass: GLACIER
 *             transitionAfter: 365
 *   cloudWatchLogs:
 *     retentionInDays: 365
 *     kms: flow-logs-key
 * ```
 *
 * @category Network Configuration
 */
export interface IVpcFlowLogsDestinationConfig {
  /**
   * **S3 Configuration** *(Optional)*
   *
   * Configuration for S3 destination including lifecycle rules and custom paths.
   * Used when flow logs are sent to Amazon S3 for long-term storage and analysis.
   */
  s3?: IVpcFlowLogsS3BucketConfig;

  /**
   * **CloudWatch Logs Configuration** *(Optional)*
   *
   * Configuration for CloudWatch Logs destination including retention and encryption.
   * Used when flow logs are sent to CloudWatch Logs for real-time monitoring.
   */
  cloudWatchLogs?: IVpcFlowLogsCloudWatchLogsConfig;
}

/**
 * ## VPC Flow Logs Configuration Interface
 *
 * Interface for AWS VPC Flow Logs configuration, which captures information about
 * IP traffic flowing to and from network interfaces in your VPCs. Flow logs provide
 * visibility into network traffic patterns, security analysis, and troubleshooting capabilities.
 *
 * ### Key Features
 *
 * - **Traffic Visibility**: Monitor all network traffic in your VPCs
 * - **Security Analysis**: Detect suspicious traffic patterns and potential threats
 * - **Compliance**: Meet regulatory requirements for network monitoring
 * - **Troubleshooting**: Diagnose connectivity and performance issues
 * - **Cost Optimization**: Analyze traffic patterns to optimize network costs
 *
 * ### Supported Destinations
 *
 * - **Amazon S3**: Cost-effective long-term storage and analysis
 * - **CloudWatch Logs**: Real-time monitoring and alerting capabilities
 * - **Dual Destination**: Send logs to both S3 and CloudWatch simultaneously
 *
 * Learn more about [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).
 *
 * @category Network Configuration
 */
export interface IVpcFlowLogsConfig {
  /**
   * **Traffic Type** *(Required)*
   *
   * Specifies the type of network traffic to capture in VPC flow logs.
   * This determines which traffic flows will be recorded and available for analysis.
   */
  trafficType: TrafficType;

  /**
   * **Maximum Aggregation Interval** *(Required)*
   *
   * The maximum interval in seconds for aggregating flow log records before
   * they are captured and delivered to the destination.
   */
  maxAggregationInterval: number;

  /**
   * **Log Destinations** *(Required)*
   *
   * Array of destination services where VPC flow logs should be delivered.
   * You can send logs to one or both supported destinations simultaneously.
   */
  destinations: LogDestinationType[];

  /**
   * **Destination Configuration** *(Optional)*
   *
   * Advanced configuration options for flow log destinations, including
   * S3 lifecycle policies and CloudWatch Logs retention settings.
   */
  destinationsConfig?: IVpcFlowLogsDestinationConfig;

  /**
   * **Use Default Format** *(Required)*
   *
   * Controls whether to use the AWS default flow log format or a custom format
   * with specific fields. When false, allows customization of logged fields.
   */
  defaultFormat: boolean;

  /**
   * **Custom Fields** *(Required when defaultFormat is false)*
   *
   * Array of specific fields to include in flow log records when using custom format.
   * This allows you to capture exactly the network information needed for your use cases.
   */
  customFields: NonEmptyString[];
}

/**
 * ## Centralized Logging Prefix Configuration Interface
 *
 * Configuration interface for customizing the S3 prefix structure used in
 * centralized logging buckets. Allows organizations to override the default
 * LZA logging path structure to meet specific organizational or compliance requirements.
 *
 * ### Key Features
 *
 * - **Custom Prefixes**: Override default LZA logging path structure
 * - **Organizational Alignment**: Align with existing logging conventions
 * - **Compliance**: Meet specific regulatory path requirements
 * - **Flexibility**: Maintain consistency across different log types
 *
 * ### Example
 *
 * ```yaml
 * prefixConfig:
 *   useCustomPrefix: true
 *   customOverride: compliance/audit-logs
 * ```
 *
 * @category Logging Configuration
 */
export interface IPrefixConfig {
  /**
   * **Use Custom Prefix** *(Required)*
   *
   * Indicates whether or not to add a custom prefix to LZA Default Centralized Logging location.
   * If useCustomPrefix is set to true, logs will be stored in the Centralized Logging Bucket prefix.
   *
   * @default false
   */
  useCustomPrefix: boolean;

  /**
   * **Custom Override** *(Optional)*
   *
   * Prefix to be used for Centralized Logging Path when useCustomPrefix is enabled.
   * This prefix will be prepended to the default LZA logging structure.
   */
  customOverride?: NonEmptyString;
}

/**
 * ## Centralized Logging Prefix Configuration Implementation
 *
 * Implementation class for centralized logging prefix configuration with
 * default values that preserve the standard LZA logging structure.
 *
 * ### Default Behavior
 *
 * - **Standard Prefixes**: Uses default LZA logging path structure
 * - **No Override**: Maintains existing logging organization
 * - **Backward Compatibility**: Preserves existing log locations
 *
 * @category Logging Configuration
 */
export class PrefixConfig implements IPrefixConfig {
  /**
   * **Use Custom Prefix**
   *
   * Default false - uses the standard LZA centralized logging bucket prefix structure.
   * Set to true to enable custom prefix override functionality.
   */
  readonly useCustomPrefix: boolean = false;

  /**
   * **Custom Override**
   *
   * Default undefined - no custom prefix override applied.
   * Specify a custom prefix when useCustomPrefix is enabled.
   */
  readonly customOverride = undefined;
}

/**
 * ## VPC Flow Logs S3 Bucket Configuration Implementation
 *
 * Implementation class for S3 destination configuration when VPC Flow Logs
 * are sent to Amazon S3. Provides default settings for lifecycle management
 * and log path organization.
 *
 * ### Default Configuration
 *
 * - **No Lifecycle Rules**: Empty array allows manual lifecycle management
 * - **Default Path**: Uses standard LZA S3 log path structure
 * - **Cost Optimization**: Ready for lifecycle rule configuration
 *
 * @category Network Configuration
 */
class VpcFlowLogsS3BucketConfig implements IVpcFlowLogsS3BucketConfig {
  /**
   * **Lifecycle Rules**
   *
   * Default empty array - no automatic lifecycle management applied.
   * Add lifecycle rules to optimize storage costs through automatic transitions.
   */
  readonly lifecycleRules: LifeCycleRule[] = [];

  /**
   * **Override S3 Log Path**
   *
   * Default empty string - uses standard LZA S3 log path structure.
   * Specify a custom path to override the default organization.
   */
  readonly overrideS3LogPath: string = '';
}

/**
 * ## VPC Flow Logs CloudWatch Logs Configuration Implementation
 *
 * Implementation class for CloudWatch Logs destination configuration when
 * VPC Flow Logs are sent to Amazon CloudWatch Logs. Provides sensible defaults
 * for log retention and encryption settings.
 *
 * ### Default Configuration
 *
 * - **365-Day Retention**: Balances visibility with cost control
 * - **No Encryption**: Uses CloudWatch Logs default encryption
 * - **Cost Awareness**: One-year retention prevents excessive charges
 *
 * @category Network Configuration
 */
class VpcFlowLogsCloudWatchLogsConfig implements IVpcFlowLogsCloudWatchLogsConfig {
  /**
   * **Retention in Days**
   *
   * Default 365 days - provides one year of flow log history while controlling costs.
   * Adjust based on compliance requirements and cost considerations.
   */
  readonly retentionInDays = 365;

  /**
   * **KMS Key**
   *
   * Default undefined - uses CloudWatch Logs default encryption.
   * Specify a KMS key name for customer-managed encryption.
   */
  readonly kms = undefined;
}

/**
 * ## VPC Flow Logs Destination Configuration Implementation
 *
 * Implementation class for VPC Flow Logs destination configuration with
 * default settings for both S3 and CloudWatch Logs destinations.
 *
 * ### Default Configuration
 *
 * - **S3 Ready**: Configured for S3 destination with lifecycle management
 * - **CloudWatch Ready**: Configured for CloudWatch Logs with retention control
 * - **Dual Destination**: Supports simultaneous delivery to both destinations
 *
 * ### Usage Example
 *
 * ```yaml
 * destinationsConfig:
 *   s3:
 *     lifecycleRules:
 *       - enabled: true
 *         expiration: 2555
 *   cloudWatchLogs:
 *     retentionInDays: 365
 *     kms: flow-logs-key
 * ```
 *
 * @category Network Configuration
 */
class VpcFlowLogsDestinationConfig implements IVpcFlowLogsDestinationConfig {
  /**
   * **S3 Configuration**
   *
   * Default S3 destination configuration with empty lifecycle rules and standard path.
   * Customize lifecycle rules and paths based on organizational requirements.
   */
  readonly s3: VpcFlowLogsS3BucketConfig = new VpcFlowLogsS3BucketConfig();

  /**
   * **CloudWatch Logs Configuration**
   *
   * Default CloudWatch Logs destination configuration with 365-day retention.
   * Customize retention period and encryption based on compliance needs.
   */
  readonly cloudWatchLogs: VpcFlowLogsCloudWatchLogsConfig = new VpcFlowLogsCloudWatchLogsConfig();
}

/**
 * ## VPC Flow Logs Configuration
 *
 * Configuration for AWS VPC Flow Logs, which capture information about IP traffic
 * flowing to and from network interfaces in your VPCs. Flow logs provide visibility
 * into network traffic patterns, security analysis, and troubleshooting capabilities.
 *
 * ### Key Features
 *
 * - **Traffic Visibility**: Monitor all network traffic in your VPCs
 * - **Security Analysis**: Detect suspicious traffic patterns and potential threats
 * - **Compliance**: Meet regulatory requirements for network monitoring
 * - **Troubleshooting**: Diagnose connectivity and performance issues
 * - **Cost Optimization**: Analyze traffic patterns to optimize network costs
 *
 * ### Supported Destinations
 *
 * - **Amazon S3**: Cost-effective long-term storage and analysis
 * - **CloudWatch Logs**: Real-time monitoring and alerting capabilities
 * - **Dual Destination**: Send logs to both S3 and CloudWatch simultaneously
 *
 * ### Example
 *
 * ```yaml
 * vpcFlowLogs:
 *   trafficType: ALL
 *   maxAggregationInterval: 600
 *   destinations:
 *     - s3
 *     - cloud-watch-logs
 *   defaultFormat: false
 *   customFields:
 *     - version
 *     - account-id
 *     - interface-id
 *     - srcaddr
 *     - dstaddr
 *     - srcport
 *     - dstport
 *     - protocol
 *     - packets
 *     - bytes
 *     - start
 *     - end
 *     - action
 *     - log-status
 *     - vpc-id
 *     - subnet-id
 *     - instance-id
 *     - tcp-flags
 *     - type
 *     - pkt-srcaddr
 *     - pkt-dstaddr
 *     - region
 *     - az-id
 *     - pkt-src-aws-service
 *     - pkt-dst-aws-service
 *     - flow-direction
 *     - traffic-path
 * ```
 *
 * Learn more about [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html).
 *
 * @category Network Configuration
 */
export class VpcFlowLogsConfig implements IVpcFlowLogsConfig {
  /**
   * **Traffic Type** *(Required)*
   *
   * Specifies the type of network traffic to capture in VPC flow logs.
   * This determines which traffic flows will be recorded and available for analysis.
   *
   * ### Traffic Type Options
   *
   * - **ALL**: Capture all traffic (accepted and rejected)
   * - **ACCEPT**: Capture only accepted traffic that was allowed by security groups/NACLs
   * - **REJECT**: Capture only rejected traffic that was blocked by security groups/NACLs
   *
   * @default 'ALL'
   */
  readonly trafficType = 'ALL';

  /**
   * **Maximum Aggregation Interval** *(Required)*
   *
   * The maximum interval in seconds for aggregating flow log records before
   * they are captured and delivered to the destination. This affects the
   * granularity and frequency of flow log data.
   *
   * @default 600
   */
  readonly maxAggregationInterval: number = 600;

  /**
   * **Log Destinations** *(Required)*
   *
   * Array of destination services where VPC flow logs should be delivered.
   * You can send logs to one or both supported destinations simultaneously.
   *
   * ### Supported Destinations
   *
   * - **s3**: Amazon S3 for cost-effective long-term storage and batch analysis
   * - **cloud-watch-logs**: CloudWatch Logs for real-time monitoring and alerting
   *
   * @default ['s3', 'cloud-watch-logs']
   */
  readonly destinations: LogDestinationType[] = ['s3', 'cloud-watch-logs'];

  /**
   * **Destination Configuration** *(Optional)*
   *
   * Advanced configuration options for flow log destinations, including
   * S3 lifecycle policies and CloudWatch Logs retention settings.
   *
   * ### Configuration Options
   *
   * - **S3 Configuration**: Lifecycle rules, custom log paths, retention policies
   * - **CloudWatch Configuration**: Log retention periods, encryption settings
   *
   * ### Example
   *
   * ```yaml
   * destinationsConfig:
   *   s3:
   *     lifecycleRules:
   *       - enabled: true
   *         expiration: 2555  # 7 years
   *         transitions:
   *           - storageClass: GLACIER
   *             transitionAfter: 365
   *   cloudWatchLogs:
   *     retentionInDays: 365
   *     kms: flow-logs-key
   * ```
   *
   * @see {@link VpcFlowLogsDestinationConfig} for detailed configuration options
   */
  readonly destinationsConfig: VpcFlowLogsDestinationConfig = new VpcFlowLogsDestinationConfig();

  /**
   * **Use Default Format** *(Required)*
   *
   * Controls whether to use the AWS default flow log format or a custom format
   * with specific fields. When false, allows customization of logged fields.
   *
   * ### Default vs Custom Format
   *
   * - **Default Format**: Standard AWS fields, simpler configuration, limited visibility
   * - **Custom Format**: Choose specific fields, enhanced analysis capabilities, flexible
   *
   * @default false
   */
  readonly defaultFormat = false;

  /**
   * **Custom Fields** *(Required when defaultFormat is false)*
   *
   * Array of specific fields to include in flow log records when using custom format.
   * This allows you to capture exactly the network information needed for your use cases.
   *
   * @see {@link https://docs.aws.amazon.com/vpc/latest/userguide/flow-log-records.html#flow-logs-custom | Flow logs custom format} for more information
   *
   * @default Comprehensive field set for security analysis
   */
  readonly customFields = [
    'version',
    'account-id',
    'interface-id',
    'srcaddr',
    'dstaddr',
    'srcport',
    'dstport',
    'protocol',
    'packets',
    'bytes',
    'start',
    'end',
    'action',
    'log-status',
    'vpc-id',
    'subnet-id',
    'instance-id',
    'tcp-flags',
    'type',
    'pkt-srcaddr',
    'pkt-dstaddr',
    'region',
    'az-id',
    'pkt-src-aws-service',
    'pkt-dst-aws-service',
    'flow-direction',
    'traffic-path',
  ];
}

/**
 * ## CloudFormation Resource Type
 *
 * Represents a CloudFormation resource with its metadata, identifiers, and state information.
 * Used for tracking and managing AWS resources created through CloudFormation stacks,
 * particularly during ASEA to LZA migration processes.
 *
 * ### Key Components
 *
 * - **Resource Identification**: Logical and physical resource identifiers
 * - **Type Information**: CloudFormation resource type classification
 * - **Metadata Storage**: Complete resource properties and configuration
 * - **State Tracking**: Deletion status and LZA integration markers
 *
 * ### Usage Context
 *
 * - **ASEA Migration**: Track resources during migration from ASEA to LZA
 * - **Resource Management**: Identify and manage CloudFormation resources
 * - **State Synchronization**: Maintain resource state across deployments
 * - **Cleanup Operations**: Track resources for deletion or modification
 *
 * @category CloudFormation Configuration
 */
export type CfnResourceType = {
  /**
   * **Logical Resource ID** *(Required)*
   *
   * LogicalId of a resource in Amazon CloudFormation Stack.
   * Unique within the template and used to reference the resource internally.
   */
  logicalResourceId: string;

  /**
   * **Physical Resource ID** *(Optional)*
   *
   * PhysicalId of a resource in Amazon CloudFormation Stack.
   * Use the physical IDs to identify resources outside of AWS CloudFormation templates.
   */
  physicalResourceId?: string;

  /**
   * **Resource Type** *(Required)*
   *
   * The resource type identifies the type of resource that you are declaring.
   * Examples: AWS::EC2::VPC, AWS::IAM::Role, AWS::S3::Bucket.
   */
  resourceType: string;

  /**
   * **LZA Resource Identifier** *(Optional)*
   *
   * The LZA resource identifier if available.
   * Used to correlate CloudFormation resources with LZA configuration elements.
   */
  resourceIdentifier?: string;

  /**
   * **Resource Metadata** *(Required)*
   *
   * The resourceMetadata holds all resources and properties.
   * Contains the complete CloudFormation resource definition and properties.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceMetadata: { [key: string]: any };

  /**
   * **Deletion Marker** *(Optional)*
   *
   * Deletion marker for imported resources.
   * Indicates whether the resource has been marked for deletion during migration.
   */
  isDeleted?: boolean;
};

/**
 * ## ASEA Stack Information Type
 *
 * Represents information about AWS Secure Environment Accelerator (ASEA) CloudFormation
 * stacks during the migration process to Landing Zone Accelerator (LZA). Contains
 * comprehensive stack metadata, resource information, and deployment context.
 *
 * ### Key Components
 *
 * - **Stack Identity**: Account, region, and stack identification
 * - **Deployment Context**: Phase and template information
 * - **Resource Inventory**: Complete list of stack resources
 * - **Nesting Support**: Handles nested CloudFormation stacks
 *
 * ### Usage Context
 *
 * - **ASEA Migration**: Track stacks during ASEA to LZA migration
 * - **Resource Discovery**: Inventory existing ASEA resources
 * - **Deployment Planning**: Understand current infrastructure state
 * - **Validation**: Verify migration completeness and accuracy
 *
 * @category ASEA Migration
 */
export type AseaStackInfo = {
  /**
   * **Account ID** *(Required)*
   *
   * The AWS account ID where the ASEA stack is deployed.
   * Used to identify the account context for resource migration.
   */
  accountId: string;

  /**
   * **Account Key** *(Required)*
   *
   * The logical account name or key used in ASEA configuration.
   * Maps to the account identifier used in ASEA account management.
   */
  accountKey: string;

  /**
   * **Region** *(Required)*
   *
   * The AWS region where the ASEA stack is deployed.
   * Identifies the geographic location of the stack resources.
   */
  region: string;

  /**
   * **Phase** *(Required)*
   *
   * The ASEA deployment phase identifier.
   * Indicates which phase of the ASEA deployment this stack belongs to.
   */
  phase: string;

  /**
   * **Stack Name** *(Required)*
   *
   * The CloudFormation stack name as deployed in AWS.
   * Used to identify and reference the specific stack instance.
   */
  stackName: string;

  /**
   * **Template Path** *(Required)*
   *
   * The file system path to the CloudFormation template used for this stack.
   * Points to the template file within the ASEA configuration structure.
   */
  templatePath: string;

  /**
   * **Resource Path** *(Required)*
   *
   * Array of CloudFormation resources contained within this stack.
   * Provides complete inventory of all resources for migration planning.
   */
  resourcePath: CfnResourceType[];

  /**
   * **Nested Stack** *(Optional)*
   *
   * Indicates whether this is a nested CloudFormation stack.
   * Used to handle parent-child stack relationships during migration.
   */
  nestedStack?: boolean;
};

/**
 * ## ASEA Resource Types Enumeration
 *
 * Enumeration of AWS resource types supported by the AWS Secure Environment Accelerator (ASEA)
 * to Landing Zone Accelerator (LZA) migration process. These resource types are used for
 * resource mapping, identification, and migration planning.
 *
 * @category ASEA Migration
 */
export enum AseaResourceType {
  /** IAM Policy resources */
  IAM_POLICY = 'IAM_POLICY',
  /** IAM Role resources */
  IAM_ROLE = 'IAM_ROLE',
  /** IAM Group resources */
  IAM_GROUP = 'IAM_GROUP',
  /** IAM User resources */
  IAM_USER = 'IAM_USER',

  /** EC2 VPC resources */
  EC2_VPC = 'EC2_VPC',
  /** EC2 VPC CIDR block associations */
  EC2_VPC_CIDR = 'EC2_VPC_CIDR',
  /** EC2 Subnet resources */
  EC2_SUBNET = 'EC2_SUBNET',
  /** EC2 Internet Gateway resources */
  EC2_IGW = 'EC2_VPC_IGW',
  /** EC2 VPN Gateway resources */
  EC2_VPN_GW = 'EC2_VPC_VPN_GW',

  /** EC2 Security Group resources */
  EC2_SECURITY_GROUP = 'EC2_SECURITY_GROUP',
  /** EC2 Security Group ingress rules */
  EC2_SECURITY_GROUP_INGRESS = 'EC2_SECURITY_GROUP_INGRESS',
  /** EC2 Security Group egress rules */
  EC2_SECURITY_GROUP_EGRESS = 'EC2_SECURITY_GROUP_EGRESS',
  /** EC2 Network ACL subnet associations */
  EC2_NACL_SUBNET_ASSOCIATION = 'EC2_NACL_SUBNET_ASSOCIATION',

  /** EC2 VPC Peering Connection resources */
  EC2_VPC_PEERING = 'EC2_VPC_PEERING_CONNECTION',
  /** VPC Endpoint resources */
  VPC_ENDPOINT = 'VPC_ENDPOINT',

  /** EC2 Target Group resources */
  EC2_TARGET_GROUP = 'EC2_TARGET_GROUP',
  /** Application Load Balancer resources */
  APPLICATION_LOAD_BALANCER = 'APPLICATION_LOAD_BALANCER',

  /** Route Table resources */
  ROUTE_TABLE = 'ROUTE_TABLE',
  /** NAT Gateway resources */
  NAT_GATEWAY = 'NAT_GATEWAY',

  /** Transit Gateway resources */
  TRANSIT_GATEWAY = 'TRANSIT_GATEWAY',
  /** Transit Gateway Route Table resources */
  TRANSIT_GATEWAY_ROUTE_TABLE = 'TRANSIT_GATEWAY_ROUTE_TABLE',
  /** Transit Gateway Route resources */
  TRANSIT_GATEWAY_ROUTE = 'TRANSIT_GATEWAY_ROUTE',
  /** Transit Gateway Attachment resources */
  TRANSIT_GATEWAY_ATTACHMENT = 'TRANSIT_GATEWAY_ATTACHMENT',
  /** Transit Gateway Route Propagation resources */
  TRANSIT_GATEWAY_PROPAGATION = 'TRANSIT_GATEWAY_PROPAGATION',
  /** Transit Gateway Route Association resources */
  TRANSIT_GATEWAY_ASSOCIATION = 'TRANSIT_GATEWAY_ASSOCIATION',
  /** Transit Gateway Peering Connection resources */
  TRANSIT_GATEWAY_PEERING_REQUESTER = 'TRANSIT_GATEWAY_PEERING',

  /** Network Firewall resources */
  NFW = 'NETWORK_FIREWALL',
  /** Network Firewall Policy resources */
  NFW_POLICY = 'NETWORK_FIREWALL_POLICY',
  /** Network Firewall Rule Group resources */
  NFW_RULE_GROUP = 'NETWORK_FIREWALL_RULE_GROUP',

  /** Route 53 Private Hosted Zone resources */
  ROUTE_53_PHZ_ID = 'ROUTE_53_PHZ',
  /** Route 53 Query Logging Configuration resources */
  ROUTE_53_QUERY_LOGGING = 'ROUTE_53_QUERY_LOGGING',
  /** Route 53 Query Logging Association resources */
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'ROUTE_53_QUERY_LOGGING_ASSOCIATION',
  /** Route 53 Record Set resources */
  ROUTE_53_RECORD_SET = 'ROUTE_53_RECORD_SET',
  /** Route 53 Resolver Endpoint resources */
  ROUTE_53_RESOLVER_ENDPOINT = 'ROUTE_53_RESOLVER_ENDPOINT',

  /** SSM Resource Data Sync resources */
  SSM_RESOURCE_DATA_SYNC = 'SSM_RESOURCE_DATA_SYNC',
  /** SSM Association resources */
  SSM_ASSOCIATION = 'SSM_ASSOCIATION',

  /** EC2 Instance resources (typically firewall instances) */
  FIREWALL_INSTANCE = 'EC2_INSTANCE',
  /** AWS Managed Microsoft AD resources */
  MANAGED_AD = 'MANAGED_AD',

  /** Resources not managed by ASEA or LZA */
  NOT_MANAGED = 'NOT_MANAGED',
}

/**
 * ## ASEA Resource Mapping Type
 *
 * Consolidated type for ASEA Resource mapping that provides a simplified view
 * of AWS resources for migration tracking and resource correlation between
 * ASEA and LZA deployments.
 *
 * ### Key Features
 *
 * - **Resource Location**: Account and region identification
 * - **Type Classification**: Resource type categorization
 * - **Unique Identification**: Resource identifier for correlation
 * - **State Tracking**: Deletion status for cleanup operations
 *
 * ### Usage Context
 *
 * - **Migration Planning**: Map existing ASEA resources to LZA equivalents
 * - **Resource Correlation**: Link resources across different deployment models
 * - **Cleanup Operations**: Track resources for deletion or modification
 * - **Validation**: Verify resource migration completeness
 *
 * @category ASEA Migration
 */
export type AseaResourceMapping = {
  /**
   * **Account ID** *(Required)*
   *
   * The AWS account ID where the resource is located.
   * Used for account-specific resource identification and migration planning.
   */
  accountId: string;

  /**
   * **Region** *(Required)*
   *
   * The AWS region where the resource is deployed.
   * Identifies the geographic location for regional resource management.
   */
  region: string;

  /**
   * **Resource Type** *(Required)*
   *
   * The type classification of the AWS resource.
   * Used to categorize resources for migration and management purposes.
   */
  resourceType: string;

  /**
   * **Resource Identifier** *(Required)*
   *
   * Unique identifier for the resource within its type and location.
   * Used to correlate resources between ASEA and LZA configurations.
   */
  resourceIdentifier: string;

  /**
   * **Deletion Status** *(Optional)*
   *
   * Indicates whether the resource has been marked for deletion.
   * Used during migration to track resources that should be removed.
   */
  isDeleted?: boolean;
};

/**
 * ## ASEA Mappings Collection Type
 *
 * Collection type for storing multiple ASEA mapping configurations indexed by
 * unique keys. Used to organize and access ASEA stack mappings during the
 * migration process from ASEA to LZA.
 *
 * ### Structure
 *
 * - **Key-Value Mapping**: String keys map to ASEAMapping objects
 * - **Flexible Indexing**: Keys can be stack names, identifiers, or composite keys
 * - **Batch Operations**: Enables processing multiple mappings simultaneously
 * - **Lookup Efficiency**: Fast access to specific mapping configurations
 *
 * @category ASEA Migration
 */
export type ASEAMappings = {
  [key: string]: ASEAMapping;
};

/**
 * ## CloudFormation Stack Resources Type
 *
 * Type definition for CloudFormation stack resources with their types and properties.
 * Used to represent the resource structure within CloudFormation templates during
 * ASEA migration and resource analysis.
 *
 * ### Structure
 *
 * - **Resource Identification**: String keys identify individual resources
 * - **Type Classification**: CloudFormation resource type specification
 * - **Property Storage**: Complete resource properties and configuration
 * - **Template Representation**: Mirrors CloudFormation template structure
 *
 * @category CloudFormation Configuration
 */
export type StackResources = {
  [key: string]: {
    /**
     * **Resource Type** *(Required)*
     *
     * The CloudFormation resource type (e.g., AWS::EC2::VPC, AWS::IAM::Role).
     * Identifies the AWS service and resource category.
     */
    Type: string;

    /**
     * **Resource Properties** *(Required)*
     *
     * The complete set of properties for the CloudFormation resource.
     * Contains all configuration parameters and settings for the resource.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Properties: { [key: string]: any };
  };
};

/**
 * ## ASEA Mapping Type
 *
 * Comprehensive mapping type for ASEA CloudFormation stacks that contains
 * complete stack information, resource inventory, and migration metadata.
 * Used as the primary data structure for tracking ASEA infrastructure during
 * the migration process to LZA.
 *
 * ### Key Components
 *
 * - **Stack Identity**: Complete stack identification and location information
 * - **Resource Inventory**: Detailed resource counts and verification status
 * - **Template Information**: Template paths and resource definitions
 * - **Nesting Support**: Handles nested stack relationships and hierarchies
 * - **Migration Tracking**: Verification status and resource correlation
 *
 * @category ASEA Migration
 */
export type ASEAMapping = {
  /**
   * **Stack Name** *(Required)*
   *
   * The CloudFormation stack name as deployed in AWS.
   * Used for stack identification and AWS API operations.
   */
  stackName: string;

  /**
   * **Account ID** *(Required)*
   *
   * The AWS account ID where the stack is deployed.
   * Identifies the account context for the stack resources.
   */
  accountId: string;

  /**
   * **Account Key** *(Required)*
   *
   * The logical account name or key used in ASEA configuration.
   * Maps to the account identifier in ASEA account management.
   */
  accountKey: string;

  /**
   * **Region** *(Required)*
   *
   * The AWS region where the stack is deployed.
   * Identifies the geographic location of the stack.
   */
  region: string;

  /**
   * **Phase** *(Optional)*
   *
   * The ASEA deployment phase identifier.
   * Indicates which phase of ASEA deployment this stack belongs to.
   */
  phase: string | undefined;

  /**
   * **Count Verified** *(Required)*
   *
   * Indicates whether the resource count has been verified against the template.
   * Used for migration validation and completeness checking.
   */
  countVerified: boolean;

  /**
   * **Number of Resources** *(Required)*
   *
   * The actual number of resources found in the deployed stack.
   * Used for verification against template resource counts.
   */
  numberOfResources: number;

  /**
   * **Number of Resources in Template** *(Required)*
   *
   * The number of resources defined in the CloudFormation template.
   * Used for comparison with actual deployed resource counts.
   */
  numberOfResourcesInTemplate: number;

  /**
   * **Template Path** *(Required)*
   *
   * The file system path to the CloudFormation template.
   * Points to the template file within the ASEA configuration structure.
   */
  templatePath: string;

  /**
   * **Resource Path** *(Required)*
   *
   * The path to the resource inventory file or data.
   * Contains detailed information about stack resources.
   */
  resourcePath: string;

  /**
   * **Nested Stacks** *(Optional)*
   *
   * Collection of nested CloudFormation stacks within this parent stack.
   * Indexed by nested stack identifiers for hierarchical management.
   */
  nestedStacks?: { [key: string]: NestedStack };

  /**
   * **Parent Stack** *(Optional)*
   *
   * Identifier of the parent stack if this is a nested stack.
   * Used to maintain parent-child relationships in stack hierarchies.
   */
  parentStack?: string;

  /**
   * **CloudFormation Resources** *(Required)*
   *
   * Array of CloudFormation resources contained within this stack.
   * Provides complete resource inventory for migration and analysis.
   */
  cfnResources: CfnResourceType[];

  /**
   * **Logical Resource ID** *(Optional)*
   *
   * The logical resource ID if this mapping represents a nested stack resource.
   * Used to identify the nested stack resource within its parent template.
   */
  logicalResourceId?: string;
};

/**
 * ## Nested Stack Type
 *
 * Type definition for nested CloudFormation stacks within ASEA deployments.
 * Represents child stacks that are created as resources within parent stacks,
 * maintaining the hierarchical relationship and complete resource inventory.
 *
 * ### Key Features
 *
 * - **Hierarchical Structure**: Maintains parent-child stack relationships
 * - **Complete Inventory**: Full resource tracking for nested stacks
 * - **Identity Management**: Unique identification within parent context
 * - **Migration Support**: Enables nested stack migration to LZA
 *
 * @category ASEA Migration
 */
export type NestedStack = {
  /**
   * **Stack Name** *(Required)*
   *
   * The CloudFormation nested stack name as deployed in AWS.
   * Unique identifier for the nested stack instance.
   */
  stackName: string;

  /**
   * **Account ID** *(Required)*
   *
   * The AWS account ID where the nested stack is deployed.
   * Inherits from parent stack but explicitly tracked for clarity.
   */
  accountId: string;

  /**
   * **Account Key** *(Required)*
   *
   * The logical account name or key used in ASEA configuration.
   * Matches the parent stack's account key for consistency.
   */
  accountKey: string;

  /**
   * **Region** *(Required)*
   *
   * The AWS region where the nested stack is deployed.
   * Inherits from parent stack but explicitly tracked for operations.
   */
  region: string;

  /**
   * **Phase** *(Optional)*
   *
   * The ASEA deployment phase identifier.
   * Inherits from parent stack deployment phase.
   */
  phase: string | undefined;

  /**
   * **Count Verified** *(Required)*
   *
   * Indicates whether the nested stack resource count has been verified.
   * Used for migration validation and completeness checking.
   */
  countVerified: boolean;

  /**
   * **Number of Resources** *(Required)*
   *
   * The actual number of resources in the deployed nested stack.
   * Used for verification against template resource counts.
   */
  numberOfResources: number;

  /**
   * **Number of Resources in Template** *(Required)*
   *
   * The number of resources defined in the nested stack template.
   * Used for comparison with actual deployed resource counts.
   */
  numberOfResourcesInTemplate: number;

  /**
   * **Template Path** *(Required)*
   *
   * The file system path to the nested stack CloudFormation template.
   * Points to the template file within the ASEA configuration structure.
   */
  templatePath: string;

  /**
   * **Resource Path** *(Required)*
   *
   * The path to the nested stack resource inventory file or data.
   * Contains detailed information about nested stack resources.
   */
  resourcePath: string;

  /**
   * **Logical Resource ID** *(Required)*
   *
   * The logical resource ID of the nested stack within its parent template.
   * Used to identify the nested stack resource in the parent stack.
   */
  logicalResourceId: string;

  /**
   * **Stack Key** *(Required)*
   *
   * Unique key identifier for the nested stack within the mapping system.
   * Used for indexing and referencing the nested stack in collections.
   */
  stackKey: string;

  /**
   * **CloudFormation Resources** *(Required)*
   *
   * Array of CloudFormation resources contained within this nested stack.
   * Provides complete resource inventory for migration and analysis.
   */
  cfnResources: CfnResourceType[];
};

/**
 * ## ASEA Resource Type Paths Enumeration
 *
 * Defines the configuration file paths used by ASEA for different resource types.
 * These paths are used during ASEA to LZA migration to locate and process
 * existing resource configurations.
 *
 * ### Path Structure
 *
 * Each path represents a directory structure within the ASEA configuration
 * where specific resource types are defined and managed.
 *
 * @category ASEA Migration
 */
export enum AseaResourceTypePaths {
  /** Identity and Access Management resources path */
  IAM = '/iam/',
  /** VPC and core networking resources path */
  VPC = '/network/vpc/',
  /** VPC Peering connection resources path */
  VPC_PEERING = '/network/vpcPeering/',
  /** Transit Gateway resources path */
  TRANSIT_GATEWAY = '/network/transitGateways/',
  /** Network Firewall resources path */
  NETWORK_FIREWALL = '/network/networkFirewall/',
}

/**
 * ## IAM Assumed By Type
 *
 * Defines the types of principals that can assume IAM roles. Used in IAM role
 * trust policies to specify who or what can assume the role.
 *
 * ### Values
 * - **service**: AWS services (e.g., ec2.amazonaws.com, lambda.amazonaws.com)
 * - **account**: AWS account IDs or root accounts
 * - **principalArn**: Specific IAM user, role, or federated user ARNs
 * - **provider**: Identity providers for federated access (SAML, OIDC)
 *
 * @category IAM Configuration
 */
export type AssumedByType = 'service' | 'account' | 'principalArn' | 'provider';

/**
 * ## IAM Principal Type
 *
 * Defines the types of IAM principals that can be referenced in policies
 * and access control configurations.
 *
 * ### Values
 * - **USER**: IAM users (individual identities)
 * - **GROUP**: IAM groups (collections of users)
 *
 * @category IAM Configuration
 */
export type PrincipalType = 'USER' | 'GROUP';

/**
 * ## Parameter Replacement Type
 *
 * Defines the types of parameter replacement mechanisms supported in
 * configuration templates and CloudFormation deployments.
 *
 * ### Values
 * - **SSM**: AWS Systems Manager Parameter Store values
 * - **String**: Simple string replacement
 * - **StringList**: Comma-separated list of strings
 * - **Number**: Numeric value replacement
 *
 * ### Use Cases
 * - **SSM**: Dynamic configuration values, secrets, cross-stack references
 * - **String**: Static configuration values, environment names
 * - **StringList**: Multiple values like subnet IDs, security group IDs
 * - **Number**: Port numbers, counts, numeric thresholds
 *
 * @category Configuration Management
 */
export type ParameterReplacementType = 'SSM' | 'String' | 'StringList' | 'Number';

/**
 * ## AWS VPC ID Type
 *
 * Represents a valid AWS Virtual Private Cloud (VPC) identifier.
 * VPC IDs are unique identifiers assigned by AWS when VPCs are created.
 *
 * @pattern ^vpc-.*|^$
 * @category Common Types
 */
export type AwsVpcId = string;

/**
 * ## AWS Account ID Type
 *
 * Represents a valid AWS account identifier. AWS account IDs are unique
 * 12-digit numbers assigned to each AWS account when it's created.
 *
 *
 * @minLength 12
 * @maxLength 12
 * @category Common Types
 */
export type AwsAccountId = string;

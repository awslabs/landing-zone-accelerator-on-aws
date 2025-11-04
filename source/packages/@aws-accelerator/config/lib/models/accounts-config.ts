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
 * # AWS Landing Zone Accelerator - Accounts Configuration
 *
 * The accounts configuration defines the AWS accounts that will be created and managed by the Landing Zone Accelerator.
 * This configuration is fundamental to establishing your multi-account AWS environment architecture.
 *
 * ## Overview
 *
 * The accounts configuration supports two main types of accounts:
 * - **Mandatory Accounts**: Required accounts for core functionality (Management, Audit, Log Archive)
 * - **Workload Accounts**: Application and workload-specific accounts
 *
 * ## Key Features
 *
 * - **Multi-Partition Support**: Supports both commercial and GovCloud partitions
 * - **Account Warming**: Pre-provision EC2 instances to prepare accounts for workloads
 * - **Organizational Unit Integration**: Accounts are automatically placed into specified OUs
 * - **Account Aliasing**: Human-readable aliases for account sign-in URLs
 * - **Email Validation**: Comprehensive email validation for account creation
 *
 * ## Configuration Structure
 *
 * ```yaml
 * # accounts-config.yaml
 * mandatoryAccounts:
 *   - name: Management
 *     description: The management (primary) account
 *     email: management@example.com
 *     organizationalUnit: Root
 *
 *   - name: LogArchive
 *     description: Centralized logging account
 *     email: logarchive@example.com
 *     organizationalUnit: Security
 *
 *   - name: Audit
 *     description: Security audit and compliance account
 *     email: audit@example.com
 *     organizationalUnit: Security
 *
 * workloadAccounts:
 *   - name: Production
 *     description: Production workload account
 *     email: production@example.com
 *     organizationalUnit: Workloads
 *     warm: true
 *     accountAlias: prod-workloads
 *
 *   - name: Development
 *     description: Development workload account
 *     email: development@example.com
 *     organizationalUnit: Workloads
 *     warm: false
 * ```
 *
 * ## Best Practices
 *
 * 1. **Email Management**: Use a consistent email naming pattern (e.g., `prefix+account-name@domain.com`)
 * 2. **Account Names**: Use descriptive, hyphen-separated names without spaces
 * 3. **Organizational Units**: Align account placement with your governance structure
 * 4. **Account Warming**: Enable for accounts that will immediately run EC2 workloads
 * 5. **Aliases**: Use meaningful aliases that reflect the account's purpose
 *
 * ## Validation Rules
 *
 * - Account names must be unique within the configuration
 * - Email addresses must be unique across all AWS accounts in the organization
 * - Account aliases must be globally unique within the AWS partition
 * - Organizational Units must exist in the organization-config.yaml
 *
 * @fileoverview Core account configuration interfaces for the AWS Landing Zone Accelerator
 * @category Accounts Configuration
 */

import * as t from '../common/types';

/**
 * ## Main Accounts Configuration Interface
 *
 * Root configuration interface that defines all accounts to be managed by the Landing Zone Accelerator.
 * This interface serves as the entry point for account configuration and supports both commercial and GovCloud partitions.
 *
 * ### Configuration Sections
 *
 * The accounts configuration is organized into three main sections:
 *
 * 1. **Mandatory Accounts** - Required core accounts (Management, Audit, Log Archive)
 * 2. **Workload Accounts** - Application and business-specific accounts
 * 3. **Account IDs** - Pre-existing account mappings (optional)
 *
 * ### Usage Example
 *
 * ```yaml
 * mandatoryAccounts:
 *   - name: Management
 *     email: management@example.com
 *     organizationalUnit: Root
 *   - name: LogArchive
 *     email: logs@example.com
 *     organizationalUnit: Security
 *   - name: Audit
 *     email: audit@example.com
 *     organizationalUnit: Security
 *
 * workloadAccounts:
 *   - name: Production
 *     email: prod@example.com
 *     organizationalUnit: Workloads
 *     warm: true
 *   - name: Staging
 *     email: staging@example.com
 *     organizationalUnit: Workloads
 *
 * accountIds:
 *   - email: existing@example.com
 *     accountId: "123456789012"
 * ```
 *
 * @category Accounts Configuration
 */
export interface IAccountsConfig {
  /**
   * **Mandatory Accounts Configuration**
   *
   * Required accounts that provide core Landing Zone Accelerator functionality.
   * These accounts are essential for security, compliance, and operational management.
   *
   * **Required Accounts:**
   * - `Management`: Primary account for organizational management and billing
   * - `LogArchive`: Centralized logging and log retention account
   * - `Audit`: Security auditing and compliance account
   *
   * @see {@link IAccountConfig} for standard account configuration
   * @see {@link IGovCloudAccountConfig} for GovCloud-specific configuration
   */
  mandatoryAccounts: IAccountConfig[] | IGovCloudAccountConfig[];

  /**
   * **Workload Accounts Configuration**
   *
   * Application-specific and business workload accounts. These accounts host your applications,
   * databases, and other business workloads, isolated by environment, business unit, or application.
   *
   * **Common Workload Account Types:**
   * - Production environments
   * - Development/testing environments
   * - Shared services (networking, monitoring)
   * - Business unit specific accounts
   * - Sandbox accounts for experimentation
   *
   * @see {@link IAccountConfig} for standard account configuration
   * @see {@link IGovCloudAccountConfig} for GovCloud-specific configuration
   */
  workloadAccounts: IAccountConfig[] | IGovCloudAccountConfig[];

  /**
   * **Pre-existing Account IDs (Optional)**
   *
   * Map existing AWS accounts IDs to email addresses to skip dynamic lookups by the Landing Zone Accelerator.
   * Use this section when you have existing accounts that need to be managed by the accelerator.
   *
   * **Use Cases:**
   * - Migrating existing AWS accounts into the Landing Zone Accelerator
   * - Integrating with accounts created outside the accelerator
   * - Mapping legacy account structures
   *
   * @see {@link IAccountIdConfig} for account ID mapping configuration
   */
  accountIds?: IAccountIdConfig[];
}

/**
 * ## Base Account Configuration
 *
 * Foundation interface containing common properties shared by all account types.
 * This interface defines the core attributes required for any AWS account managed by the Landing Zone Accelerator.
 *
 * ### Key Properties
 *
 * - **Name**: Unique identifier used throughout the accelerator configuration
 * - **Email**: AWS account owner email (must be unique across all AWS accounts)
 * - **Organizational Unit**: Controls governance, policies, and access patterns
 * - **Description**: Human-readable account purpose documentation
 * - **Account Alias**: User-friendly sign-in URL identifier
 *
 * ### Naming Conventions
 *
 * **Account Names:**
 * - Use descriptive, kebab-case names (e.g., `prod-workload`, `dev-sandbox`)
 * - No spaces or special characters
 * - Should reflect the account's business purpose
 *
 * **Email Patterns:**
 * - Recommended: `prefix+account-name@domain.com`
 * - Example: `aws+prod-workload@example.com`
 *
 * @category Accounts Configuration
 */
export interface IBaseAccountConfig {
  /**
   * **Account Name** *(Required)*
   *
   * Unique identifier for the account within the Landing Zone Accelerator configuration.
   * This name is used to reference the account across all configuration files and becomes
   * the AWS account name when creating new accounts.
   *
   * ### Naming Requirements
   *
   * - Must be unique within the accounts configuration
   * - No spaces or special characters allowed
   * - Use descriptive, kebab-case naming (e.g., `prod-workload`, `dev-sandbox`)
   * - Should reflect the account's business purpose
   *
   * ### Usage Examples
   *
   * ```yaml
   * # Good examples
   * name: prod-workload
   * name: dev-environment
   * name: shared-services
   * name: security-tooling
   *
   * # Avoid
   * name: "Account 1"        # Contains spaces
   * name: prod_workload      # Use hyphens, not underscores
   * name: account123         # Not descriptive
   * ```
   *
   * **Note:** For pre-existing accounts, this name doesn't need to match the current AWS account name.
   */
  name: t.NonEmptyNoSpaceString;

  /**
   * **Account Description** *(Optional)*
   *
   * Human-readable description explaining the account's purpose, ownership, and usage.
   * This field helps with documentation and governance but is not used during account creation.
   *
   * ### Best Practices
   *
   * - Include the account's primary purpose
   * - Mention the owning team or business unit
   * - Note any special compliance or security requirements
   * - Keep descriptions concise but informative
   *
   * ### Examples
   *
   * ```yaml
   * description: "Production workloads for customer-facing applications"
   * description: "Development and testing environment for Platform team"
   * description: "Shared networking services and connectivity hub"
   * description: "Security tooling and compliance monitoring (SOC2 compliant)"
   * ```
   */
  description?: t.NonEmptyString;

  /**
   * **Account Email Address** *(Required)*
   *
   * Primary email address for the AWS account owner. This email must be unique across
   * all AWS accounts and will receive account-related notifications, billing information,
   * and security alerts.
   *
   * ### Email Requirements (AWS Enforced)
   *
   * - **Length**: 6-64 characters
   * - **Format**: Valid RFC 5322 email format
   * - **Characters**: 7-bit ASCII only
   * - **Uniqueness**: Must not be associated with any existing AWS account
   * - **Domain**: Must contain at least one dot in the domain portion
   *
   * ### Character Restrictions
   *
   * **Local part (before @) cannot contain:**
   * - Whitespace characters
   * - Special characters: `" ' ( ) < > [ ] : ; , | % &`
   * - Cannot start with a dot (.)
   *
   * **Domain part (after @):**
   * - Only alphanumeric, hyphens (-), and dots (.)
   * - Cannot start or end with hyphen or dot
   * - Must contain at least one dot
   *
   * ### Recommended Patterns
   *
   * ```yaml
   * # Using plus addressing for organization
   * email: aws+prod-workload@example.com
   * email: aws+dev-environment@example.com
   * email: aws+shared-services@example.com
   *
   * # Department-based addressing
   * email: platform-team-prod@example.com
   * email: security-team-audit@example.com
   *
   * # Environment-based addressing
   * email: prod.workloads@example.com
   * email: dev.sandbox@example.com
   * ```
   */
  email: t.EmailAddress;

  /**
   * **Organizational Unit** *(Optional)*
   *
   * Name of the Organizational Unit (OU) where this account will be placed within
   * AWS Organizations. The OU determines which Service Control Policies (SCPs) and
   * governance controls apply to the account.
   *
   * ### Requirements
   *
   * - Must match an OU name defined in `organization-config.yaml`
   * - OU must exist or be created before account placement
   * - Affects policy inheritance and governance controls
   *
   * ### Common Organizational Unit Patterns
   *
   * ```yaml
   * # By environment
   * organizationalUnit: Production
   * organizationalUnit: Development
   * organizationalUnit: Sandbox
   *
   * # By function
   * organizationalUnit: Workloads
   * organizationalUnit: Security
   * organizationalUnit: Infrastructure
   * organizationalUnit: Shared-Services
   *
   * # By business unit
   * organizationalUnit: Engineering
   * organizationalUnit: Marketing
   * organizationalUnit: Finance
   * ```
   *
   * ### Security Considerations
   *
   * - Production accounts should be in OUs with restrictive SCPs
   * - Development accounts may have more permissive policies
   * - Security accounts often have specialized compliance policies
   * - Consider data classification and compliance requirements
   *
   * @see [AWS Organizations Best Practices](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices.html)
   */
  organizationalUnit?: t.NonEmptyString;

  /**
   * **Account Alias** *(Optional)*
   *
   * Human-readable identifier that replaces the 12-digit account ID in the AWS sign-in URL.
   * This creates a more user-friendly sign-in experience for console access.
   *
   * ### Format Requirements
   *
   * - **Length**: 3-63 characters
   * - **Characters**: Lowercase letters (a-z), digits (0-9), and hyphens (-)
   * - **Pattern**: Must match `^[a-z0-9]([a-z0-9]|-(?!-)){1,61}[a-z0-9]$`
   * - **Uniqueness**: Must be globally unique within the AWS partition
   * - **Cannot**: Start or end with hyphen, contain consecutive hyphens
   *
   * ### Sign-in URL Format
   *
   * Instead of: `https://123456789012.signin.aws.amazon.com/console`
   * Users get: `https://my-prod-account.signin.aws.amazon.com/console`
   *
   * ### Naming Best Practices
   *
   * ```yaml
   * # Environment-based aliases
   * accountAlias: company-prod-workloads
   * accountAlias: company-dev-sandbox
   * accountAlias: company-staging-env
   *
   * # Function-based aliases
   * accountAlias: company-shared-services
   * accountAlias: company-security-tools
   * accountAlias: company-log-archive
   *
   * # Team-based aliases
   * accountAlias: platform-team-prod
   * accountAlias: data-team-analytics
   * ```
   *
   * ### Considerations
   *
   * - Choose aliases that won't need to change as the organization evolves
   * - Include company/organization prefix to avoid global conflicts
   * - Keep aliases short but descriptive
   * - Document alias patterns for consistency across accounts
   *
   * **Note:** Account aliases cannot be changed after creation, so choose carefully.
   */
  accountAlias?: t.NonEmptyNoSpaceString;
}

/**
 * ## Standard Account Configuration
 *
 * Standard account configuration for commercial AWS partition accounts.
 * Extends the base account configuration with account warming capabilities.
 *
 * ### Key Features
 *
 * - **Account Warming**: Optional EC2 instance pre-provisioning for immediate workload readiness
 * - **Commercial Partition**: Designed for standard AWS commercial regions
 * - **Full Feature Support**: Supports all base account configuration options
 *
 * ### Usage Example
 *
 * ```yaml
 * # Production workload account
 * - name: Production
 *   description: Production environment for customer applications
 *   email: aws+production@example.com
 *   organizationalUnit: Workloads
 *   warm: true                    # Pre-warm for immediate EC2 usage
 *   accountAlias: company-prod
 *
 * # Development account
 * - name: Development
 *   description: Development and testing environment
 *   email: aws+development@example.com
 *   organizationalUnit: Workloads
 *   warm: false                   # No warming needed
 *   accountAlias: company-dev
 * ```
 *
 * @category Accounts Configuration
 */
export interface IAccountConfig extends IBaseAccountConfig {
  /**
   * **Account Warming** *(Optional)*
   *
   * Pre-provision the account by creating a temporary EC2 instance that runs for 15 minutes.
   * This prepares the account's EC2 service for immediate production workload deployment.
   *
   * ### When to Enable
   *
   * - **Enable** for accounts that will immediately deploy EC2-based workloads
   * - **Enable** for production accounts requiring rapid deployment capabilities
   * - **Disable** for accounts primarily using serverless or managed services
   * - **Disable** for cost-sensitive development/testing environments
   *
   * ### Process Details
   *
   * - Warming occurs during the operations stack deployment phase
   * - Creates a minimal EC2 instance in the default VPC
   * - Instance automatically terminates after 15 minutes
   * - No additional charges beyond the brief EC2 usage
   * - Can be safely removed from configuration after initial deployment
   *
   * ### Best Practices
   *
   * ```yaml
   * # Production accounts - enable warming
   * warm: true
   *
   * # Development/testing - typically disable
   * warm: false
   *
   * # Serverless-only accounts - disable
   * warm: false
   * ```
   *
   * @default false
   */
  warm?: boolean;
}

/**
 * ## GovCloud Account Configuration
 *
 * Specialized account configuration for AWS GovCloud partition accounts.
 * Used when deploying Landing Zone Accelerator in AWS GovCloud regions that require
 * compliance with government security and regulatory requirements.
 *
 * ### Key Features
 *
 * - **GovCloud Partition Support**: Creates accounts in the isolated AWS GovCloud partition
 * - **Linked Account Creation**: Automatically creates paired commercial partition accounts
 * - **Compliance Ready**: Designed for government and regulated workloads
 * - **Account Warming**: Optional EC2 pre-provisioning for immediate readiness
 *
 * ### Usage Example
 *
 * ```yaml
 * # GovCloud production workload account
 * - name: GovCloud-Production
 *   description: GovCloud production environment for regulated workloads
 *   email: aws+govcloud-prod@agency.gov
 *   organizationalUnit: GovCloud-Workloads
 *   enableGovCloud: true
 *   warm: true
 *   accountAlias: agency-govcloud-prod
 *
 * # GovCloud development account
 * - name: GovCloud-Development
 *   description: GovCloud development and testing environment
 *   email: aws+govcloud-dev@agency.gov
 *   organizationalUnit: GovCloud-Workloads
 *   enableGovCloud: true
 *   warm: false
 * ```
 *
 * ### GovCloud Considerations
 *
 * - GovCloud accounts require separate email addresses from commercial accounts
 * - Account creation process involves additional verification steps
 * - Some AWS services have different availability in GovCloud
 * - Enhanced logging and monitoring requirements typically apply
 *
 * @category Accounts Configuration
 */
export interface IGovCloudAccountConfig extends IBaseAccountConfig {
  /**
   * **Enable GovCloud Account Creation** *(Optional)*
   *
   * Controls whether a GovCloud partition account should be created alongside
   * the standard commercial partition account. When enabled, creates a linked
   * account pair across both AWS partitions.
   *
   * ### When to Enable
   *
   * - **Enable** for workloads requiring FedRAMP compliance
   * - **Enable** for government agency workloads
   * - **Enable** for regulated industries requiring GovCloud
   * - **Disable** for standard commercial workloads
   *
   * ### Account Linking
   *
   * - Creates paired accounts in both GovCloud and commercial partitions
   * - Maintains separate identity and access management per partition
   * - Requires separate email addresses for each partition account
   *
   * ### Compliance Benefits
   *
   * ```yaml
   * # Government agency deployment
   * enableGovCloud: true    # Creates GovCloud + commercial account pair
   *
   * # Commercial deployment only
   * enableGovCloud: false   # Creates only commercial partition account
   * ```
   *
   * @default false
   */
  enableGovCloud?: boolean;

  /**
   * **Account Warming** *(Optional)*
   *
   * Pre-provision the account by creating a temporary EC2 instance that runs for 15 minutes.
   * This prepares the account's EC2 service for immediate production workload deployment
   * in the GovCloud partition.
   *
   * ### GovCloud Warming Considerations
   *
   * - Warming occurs in the GovCloud partition specifically
   * - May take longer due to additional GovCloud provisioning requirements
   * - Helps establish baseline EC2 service readiness for compliance workloads
   * - Particularly beneficial for time-sensitive government deployments
   *
   * ### Best Practices
   *
   * ```yaml
   * # Critical government workloads - enable warming
   * warm: true
   *
   * # Development/testing in GovCloud - typically disable
   * warm: false
   *
   * # Serverless-only GovCloud accounts - disable
   * warm: false
   * ```
   *
   * @default false
   */
  warm?: boolean;
}

/**
 * ## Account ID Mapping Configuration
 *
 * Provides static account ID to email mappings to bypass AWS Organizations account lookups.
 * Used exclusively when LZA cannot or should not perform automatic account ID resolution.
 *
 * ### Use Cases
 *
 * - **AWS Organizations Unavailable**: When deploying in partitions without Organizations support
 * - **Restricted API Access**: When Organizations APIs are restricted or unavailable
 * - **Static Account References**: When dynamic lookups are not desired or possible
 * - **GovCloud Usage**: Adding account ids allows the LZA to add the account to the Organization in GovCloud automatically
 *
 * ### Usage Example
 *
 * ```yaml
 * accountIds:
 *   # GovCloud account reference in commercial partition deployment
 *   - email: govcloud-workload@example.com
 *     accountId: "111122223333"
 *
 *   # Account in partition without Organizations
 *   - email: isolated-account@example.com
 *     accountId: "444455556666"
 *
 *   # Static reference when API lookups are restricted
 *   - email: restricted-env@example.com
 *     accountId: "444455556666"
 * ```
 *
 * ### When to Use
 *
 * **Most customers will not need this section.** Only populate when:
 *
 * 1. **Organizations API Unavailable**: Deploying in partitions without AWS Organizations
 * 2. **API Restrictions**: When Organizations lookup APIs are blocked or restricted
 * 3. **Static Configuration**: When dynamic account resolution is not desired
 * 4. **GovCloud Usage**: Adding account ids allows the LZA to add the account to the Organization in GovCloud automatically
 *
 * ### Important Considerations
 *
 * - Only use when automatic account ID lookup is not possible
 * - Email addresses should match the account references in your configuration
 * - Account IDs must be valid 12-digit AWS account identifiers
 * - This bypasses automatic account discovery mechanisms
 *
 * @category Accounts Configuration
 */
export interface IAccountIdConfig {
  /**
   * **Account Owner Email** *(Required)*
   *
   * Email address of the existing AWS account owner. Must match the email
   * currently associated with the AWS account's root user.
   *
   * ### Requirements
   *
   * - Must exactly match the existing account's root email
   * - Will be used for account identification and management
   * - Should follow organization's email conventions for consistency
   * - Cannot be changed after mapping without account access issues
   *
   * ### Verification Process
   *
   * ```yaml
   * # Verify this matches the account's actual root email
   * email: production-workload@example.com
   * ```
   */
  email: t.EmailAddress;

  /**
   * **AWS Account ID** *(Required)*
   *
   * The 12-digit AWS account identifier for the existing account to be managed
   * by the Landing Zone Accelerator.
   *
   * ### Format Requirements
   *
   * - Must be exactly 12 digits
   * - No hyphens, spaces, or other formatting
   * - Must be a valid, existing AWS account ID
   * - Account must be accessible to the organization
   *
   * ### Validation Steps
   *
   * ```yaml
   * # Ensure this is a valid, accessible account ID
   * accountId: "123456789012"
   * ```
   *
   * ### Security Considerations
   *
   * - Verify account ownership before mapping
   * - Ensure account is not compromised or unauthorized
   * - Review existing account resources and configurations
   * - Consider impact of applying LZA policies to existing resources
   */
  accountId: t.AwsAccountId;
}

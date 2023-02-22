/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';

import {
  AccountsConfig,
  BlockDeviceMappingItem,
  CustomizationsConfig,
  DeploymentTargets,
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  EbsItemConfig,
  GlobalConfig,
  IamConfig,
  IpamPoolConfig,
  LifeCycleRule,
  NetworkAclSubnetSelection,
  NetworkConfig,
  NetworkConfigTypes,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  OrganizationConfig,
  ResolverRuleConfig,
  SecurityConfig,
  ShareTargets,
  SubnetConfig,
  TransitGatewayConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  IResourceShareItem,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  S3LifeCycleRule,
} from '@aws-accelerator/constructs';
import { createLogger, policyReplacements } from '@aws-accelerator/utils';

import { version } from '../../../../../package.json';

type ResourceShareType =
  | DnsFirewallRuleGroupConfig
  | DnsQueryLogsConfig
  | IpamPoolConfig
  | NfwRuleGroupConfig
  | NfwFirewallPolicyConfig
  | SubnetConfig
  | ResolverRuleConfig
  | TransitGatewayConfig;

export interface AcceleratorStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly partition: string;
  readonly configRepositoryName: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
  readonly globalRegion?: string;
  readonly centralizedLoggingRegion: string;
}

process.on('uncaughtException', err => {
  const logger = createLogger(['accelerator']);
  logger.error(err);
  throw new Error('Synthesis failed');
});

export abstract class AcceleratorStack extends cdk.Stack {
  protected logger: winston.Logger;
  protected props: AcceleratorStackProps;

  /**
   * Accelerator ELB logs bucket name prefix
   */
  public static readonly ACCELERATOR_ELB_LOGS_BUCKET_PREFIX = 'aws-accelerator-elb-access-logs';

  /**
   * Accelerator cost and usage report bucket name prefix
   */
  public static readonly ACCELERATOR_COST_USAGE_REPORT_BUCKET_PREFIX = 'aws-accelerator-cur';

  /**
   * Accelerator configuration repository name
   */
  public static readonly ACCELERATOR_CONFIGURATION_REPOSITORY_NAME = 'aws-accelerator-config';

  /**
   * Accelerator S3 access logs bucket name prefix
   */
  public static readonly ACCELERATOR_S3_ACCESS_LOGS_BUCKET_NAME_PREFIX = 'aws-accelerator-s3-access-logs';

  /**
   * Accelerator Audit Manager bucket name prefix
   */
  public static readonly ACCELERATOR_AUDIT_MANAGER_BUCKET_NAME_PREFIX = 'aws-accelerator-auditmgr';

  /**
   * Accelerator cloudtrail bucket name prefix
   */
  public static readonly ACCELERATOR_CLOUDTRAIL_BUCKET_NAME_PREFIX = 'aws-accelerator-cloudtrail';

  /**
   * Accelerator cloudtrail bucket name SSM parameter name
   */
  protected static readonly ACCELERATOR_CLOUDTRAIL_BUCKET_NAME_PARAMETER_NAME =
    '/accelerator/organization/security/cloudtrail/log/bucket-name';

  /**
   * Accelerator VPC flow log bucket name prefix
   */
  public static readonly ACCELERATOR_VPC_FLOW_LOGS_BUCKET_NAME_PREFIX = 'aws-accelerator-vpc';

  /**
   * Accelerator VPC flow log bucket arn SSM parameter name
   */
  protected static readonly ACCELERATOR_VPC_FLOW_LOGS_DESTINATION_S3_BUCKET_ARN_PARAMETER_NAME =
    '/accelerator/vpc/flow-logs/destination/bucket/arn';
  /**
   * Accelerator Metadata bucket prefix
   */
  public static readonly ACCELERATOR_METADATA_BUCKET_NAME_PREFIX = 'aws-accelerator-metadata';
  /**
   * Accelerator Metadata bucket arn SSM parameter name
   */
  public static readonly ACCELERATOR_METADATA_BUCKET_PARAMETER_NAME = '/accelerator/metadata/bucket/arn';

  /**
   * Accelerator Metadata KMS key alias
   */

  public static readonly ACCELERATOR_METADATA_KEY_ALIAS = '/alias/accelerator/kms/metadata/key';

  /**
   * Accelerator Metadata KMS key description
   */
  public static readonly ACCELERATOR_METADATA_KEY_DESCRIPTION = 'The s3 bucket key for accelerator metadata collection';

  /**
   * Accelerator Metadata KMS key arn
   */

  public static readonly ACCELERATOR_METADATA_KEY_ARN = '/accelerator/kms/metadata/key-arn';

  /**
   * Accelerator CentralLogs bucket name prefix
   */
  public static readonly ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX = 'aws-accelerator-central-logs';
  /**
   * Cross account IAM ROLE to read SSM parameter
   * IAM role to access SSM parameter from different account or different region
   * This role is created in Key stack
   */
  public static readonly ACCELERATOR_CROSS_ACCOUNT_ACCESS_ROLE_NAME = 'AWSAccelerator-CrossAccount-SsmParameter-Role';

  /**
   * Cross account IAM ROLE to read SSM parameter related to secrets manager kms arn
   * IAM role to access SSM parameter from different region
   * This role is created in logging stack where secrets manager kms keys were created
   * Managed AD needs access to secrets in different account, so this role is used to access secret's kms key arn
   */
  public static readonly ACCELERATOR_CROSS_ACCOUNT_SECRETS_KMS_ARN_PARAMETER_ROLE_NAME =
    'AWSAccelerator-CrossAccount-SecretsKms-Role';
  /**
   * Accelerator role to access account config table parameters
   */
  public static readonly ACCELERATOR_ACCOUNT_CONFIG_TABLE_PARAMETER_ACCESS_ROLE_NAME =
    'AWSAccelerator-MoveAccountConfigRule-Role';
  /**
   * Transit Gateway peering role name, which gives permission on TGW related ssm parameters to configure tgw peering
   */
  public static readonly ACCELERATOR_TGW_PEERING_ROLE_NAME = 'AWSAccelerator-TgwPeering-Role';

  /**
   * Managed active directory share accept role name
   */
  public static readonly ACCELERATOR_MAD_SHARE_ACCEPT_ROLE_NAME = 'AWSAccelerator-MadAccept-Role';
  /**
   * Accelerator generic KMS Key
   */
  public static readonly ACCELERATOR_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/key-arn';
  /**
   * Accelerator ELB default encryption key arn SSM parameter name
   */
  protected static readonly ACCELERATOR_EBS_DEFAULT_KEY_ARN_PARAMETER_NAME =
    '/accelerator/ebs/default-encryption/key-arn';
  /**
   * Accelerator ELB default encryption key alias, S3 CMK use to encrypt buckets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_EBS_DEFAULT_KEY_ALIAS = 'alias/accelerator/ebs/default-encryption/key';
  /**
   * Accelerator ELB default encryption key description, S3 CMK use to encrypt buckets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_EBS_DEFAULT_KEY_DESCRIPTION =
    'AWS Accelerator default EBS Volume Encryption key';
  /**
   * Accelerator S3 encryption key arn SSM parameter name
   */
  protected static readonly ACCELERATOR_S3_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/s3/key-arn';
  /**
   * Accelerator Secret manager encryption key alias, Secret CMK use to encrypt secrets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_SECRET_MANAGER_KEY_ALIAS = 'alias/accelerator/kms/secret-manager/key';
  /**
   * Accelerator Secret manager encryption key description, Secret manager CMK use to encrypt secrets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_SECRET_MANAGER_KEY_DESCRIPTION = 'AWS Accelerator Secret manager Kms Key';

  /**
   * Accelerator secrets manager encryption key arn SSM parameter name
   */
  protected static readonly ACCELERATOR_SECRET_MANAGER_KEY_ARN_PARAMETER_NAME =
    '/accelerator/kms/secret-manager/key-arn';
  /**
   * Accelerator S3 encryption key alias, S3 CMK use to encrypt buckets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_S3_KEY_ALIAS = 'alias/accelerator/kms/s3/key';
  /**
   * Accelerator S3 encryption key description, S3 CMK use to encrypt buckets
   * This key is created in logging stack
   */
  protected static readonly ACCELERATOR_S3_KEY_DESCRIPTION = 'AWS Accelerator S3 Kms Key';
  /**
   * Accelerator CloudWatch Log encryption key arn SSM parameter name
   */
  protected static readonly ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/cloudwatch/key-arn';
  /**
   * Accelerator CloudWatch Log encryption key alias used to encrypt cloudwatch log groups
   * This key is created in Prepare, Accounts and Logging stacks
   */
  protected static readonly ACCELERATOR_CLOUDWATCH_LOG_KEY_ALIAS = 'alias/accelerator/kms/cloudwatch/key';
  /**
   * Accelerator CloudWatch Log encryption key description used to encrypt cloudwatch log groups
   * This key is created in Prepare, Accounts and Logging stacks
   */
  protected static readonly ACCELERATOR_CLOUDWATCH_LOG_KEY_DESCRIPTION = 'AWS Accelerator CloudWatch Kms Key';

  /**
   * Accelerator CloudWatch Log replication encryption key alias used to encrypt kinesis data stream
   * This key is created in Logging stack
   */
  protected static readonly ACCELERATOR_CLOUDWATCH_LOG_REPLICATION_KEY_ALIAS =
    'alias/accelerator/kms/replication/cloudwatch/logs/key';
  /**
   * Accelerator CloudWatch Log encryption replication key description used to encrypt kinesis data stream
   * This key is created in Logging stack
   */
  protected static readonly ACCELERATOR_CLOUDWATCH_LOG_REPLICATION_KEY_DESCRIPTION =
    'AWS Accelerator CloudWatch Logs Replication Kms Key';
  /**
   * Accelerator Backup encryption key alias
   * Organization stack creates this key to encrypt AWS backup
   */
  protected static readonly ACCELERATOR_AWS_BACKUP_KEY_ALIAS = 'alias/accelerator/kms/backup/key';

  /**
   * Accelerator Backup encryption key description
   * Organization stack creates this key to encrypt AWS backup
   */
  protected static readonly ACCELERATOR_AWS_BACKUP_KEY_DESCRIPTION = 'AWS Accelerator Backup Kms Key';

  /**
   * Accelerator SNS encryption key alias
   * SecurityAudit stack creates this key to encrypt AWS SNS topics
   */
  protected static readonly ACCELERATOR_SNS_KEY_ALIAS = 'alias/accelerator/kms/sns/key';
  protected static readonly ACCELERATOR_SNS_TOPIC_KEY_ALIAS = 'alias/accelerator/kms/snstopic/key';
  /**
   * Accelerator SNS encryption key description
   * SecurityAudit stack creates this key to encrypt AWS SNS topics
   */
  protected static readonly ACCELERATOR_SNS_KEY_DESCRIPTION = 'AWS Accelerator SNS Kms Key';
  protected static readonly ACCELERATOR_SNS_TOPIC_KEY_DESCRIPTION = 'AWS Accelerator SNS Topic Kms Key';

  /**
   * Accelerator Secrets manager encryption key alias
   */
  protected static readonly ACCELERATOR_SECRETS_MANAGER_KEY_ALIAS = '/accelerator/kms/secrets-manager/key';
  /**
   * Accelerator Secrets manager encryption key description
   */
  protected static readonly ACCELERATOR_SECRETS_MANAGER_KEY_DESCRIPTION = 'AWS Accelerator Secrets Manager Kms Key';

  /**
   * Accelerator Central SNS Topic key arn
   */
  protected static readonly ACCELERATOR_SNS_TOPIC_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/snstopic/key-arn';
  protected static readonly ACCELERATOR_SSM_SNS_TOPIC_PARAMETER_ACCESS_ROLE_NAME =
    'AWSAccelerator-SnsTopic-KeyArnParam-Role';
  /**
   * Accelerator Lambda Log encryption key alias
   * Accounts stack creates this key to encrypt lambda environment variables
   */
  protected static readonly ACCELERATOR_LAMBDA_KEY_ALIAS = 'alias/accelerator/kms/lambda/key';

  /**
   * Accelerator Lambda Log encryption key description
   * Key stack creates this key to encrypt Accelerator Audit account S3 encryption.
   * Audit account S3 buckets are accessed by every accounts to publish security services data
   */
  protected static readonly ACCELERATOR_LAMBDA_KEY_DESCRIPTION = 'AWS Accelerator Lambda Kms Key';
  /**
   * Accelerator  Lambda Log encryption key arn SSM parameter name
   */
  protected static readonly ACCELERATOR_LAMBDA_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/lambda/key-arn';

  /**
   * @Deprecated
   * Accelerator encryption key alias, this key is no longer in use, it will be removed in future iteration
   */
  protected static readonly ACCELERATOR_KEY_ALIAS = 'alias/accelerator/kms/key';

  /**
   * @Deprecated
   * Accelerator encryption key alias, this key is no longer in use, it will be removed in future iteration
   */
  protected static readonly ACCELERATOR_KEY_DESCRIPTION = 'AWS Accelerator Kms Key';

  /**
   * Accelerator management encryption key alias
   * Prepare stack creates this key to encrypt DynamoDB and CT SNS notification
   */
  protected static readonly ACCELERATOR_MANAGEMENT_KEY_ALIAS = 'alias/accelerator/management/kms/key';

  /**
   * Accelerator management encryption key alias
   * Prepare stack creates this key to encrypt DynamoDB and CT SNS notification
   */
  protected static readonly ACCELERATOR_MANAGEMENT_KEY_DESCRIPTION = 'AWS Accelerator Management Account Kms Key';

  /**
   * Accelerator management encryption key alias
   * Prepare stack creates this key to encrypt DynamoDB and CT SNS notification
   */
  protected static readonly ACCELERATOR_MANAGEMENT_KEY_ARN_PARAMETER_NAME = '/accelerator/management/kms/key-arn';

  /**
   * Accelerator assets kms key alias
   */
  protected static readonly ACCELERATOR_ASSETS_KEY_ARN_PARAMETER_NAME = '/accelerator/assets/kms/key';

  /**
   * Accelerator assets kms key description
   */
  protected static readonly ACCELERATOR_ASSETS_KEY_DESCRIPTION = 'Key used to encrypt solution assets';

  /**
   * Accelerator assets kms key description
   */
  protected static readonly ACCELERATOR_ASSETS_CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME =
    'AWSAccelerator-AssetsBucket-KeyArnParam-Role';

  /**
   * Service Catalog Principal Association Propagation Role
   */
  public static readonly ACCELERATOR_SERVICE_CATALOG_PROPAGATION_ROLE_NAME =
    'AWSAccelerator-CrossAccount-ServiceCatalog-Role';

  /**
   * Accelerator SSM parameters
   * This array is used to store SSM parameters that are created per-stack.
   */
  protected ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger = createLogger([cdk.Stack.of(this).stackName]);
    this.props = props;
    this.ssmParameters = [];

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });
  }

  /**
   * This method creates SSM parameters stored in the `AcceleratorStack.ssmParameters` array.
   * If more than five parameters are defined, the method adds a `dependsOn` statement
   * to remaining parameters in order to avoid API throttling issues.
   */
  protected createSsmParameters(): void {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const parameterItem of this.ssmParameters) {
      // Create parameter
      const parameter = new cdk.aws_ssm.StringParameter(this, parameterItem.logicalId, {
        parameterName: parameterItem.parameterName,
        stringValue: parameterItem.stringValue,
      });
      parameterMap.set(index, parameter);

      // Add a dependency for every 5 parameters
      if (index > 5) {
        const dependsOnParam = parameterMap.get(index - (index % 5));
        if (!dependsOnParam) {
          this.logger.error(
            `Error creating SSM parameter ${parameterItem.parameterName}: previous SSM parameter undefined`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        parameter.node.addDependency(dependsOnParam);
      }
      // Increment index
      index += 1;
    }
  }

  protected isIncluded(deploymentTargets: DeploymentTargets): boolean {
    // Explicit Denies
    if (
      this.isRegionExcluded(deploymentTargets.excludedRegions) ||
      this.isAccountExcluded(deploymentTargets.excludedAccounts)
    ) {
      return false;
    }

    // Explicit Allows
    if (
      this.isAccountIncluded(deploymentTargets.accounts) ||
      this.isOrganizationalUnitIncluded(deploymentTargets.organizationalUnits)
    ) {
      return true;
    }

    // Implicit Deny
    return false;
  }
  protected getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountNames: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          accountNames.push(account.name);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            accountNames.push(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      accountNames.push(account);
    }

    return [...new Set(accountNames)];
  }

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  protected getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          this._addAccountId(accountIds, account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            this._addAccountId(accountIds, accountId);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      this._addAccountId(accountIds, accountId);
    }

    const excludedAccountIds = this.getExcludedAccountIds(deploymentTargets);
    const filteredAccountIds = accountIds.filter(item => !excludedAccountIds.includes(item));

    return filteredAccountIds;
  }

  protected getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account =>
        this._addAccountId(accountIds, this.props.accountsConfig.getAccountId(account)),
      );
    }

    return accountIds;
  }

  protected getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountIds: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountIds = [this.props.accountsConfig.getAccountId(vpcItem.account)];
    } else {
      const excludedAccountIds = this.getExcludedAccountIds(vpcItem.deploymentTargets);
      vpcAccountIds = this.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets).filter(
        item => !excludedAccountIds.includes(item),
      );
    }

    return vpcAccountIds;
  }

  protected getAccountIdsFromShareTarget(shareTargets: ShareTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of shareTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          this._addAccountId(accountIds, account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            this._addAccountId(accountIds, accountId);
          }
        }
      }
    }

    for (const account of shareTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      // debug: accountId
      this._addAccountId(accountIds, accountId);
    }

    return accountIds;
  }

  protected isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(cdk.Stack.of(this).region)) {
      this.logger.info(`${cdk.Stack.of(this).region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  protected isAccountExcluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        this.logger.info(`${account} account explicitly excluded`);
        return true;
      }
    }
    return false;
  }

  protected isAccountIncluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        const accountConfig = this.props.accountsConfig.getAccount(account);
        if (this.props.organizationConfig.isIgnored(accountConfig.organizationalUnit)) {
          this.logger.info(`Account ${account} was not included as it is a member of an ignored organizational unit.`);
          return false;
        }
        this.logger.info(`${account} account explicitly included`);
        return true;
      }
    }
    return false;
  }

  protected isOrganizationalUnitIncluded(organizationalUnits: string[]): boolean {
    if (organizationalUnits) {
      // Full list of all accounts
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      // Find the account with the matching ID
      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === cdk.Stack.of(this).account,
      );

      if (account) {
        if (organizationalUnits.indexOf(account.organizationalUnit) != -1 || organizationalUnits.includes('Root')) {
          const ignored = this.props.organizationConfig.isIgnored(account.organizationalUnit);
          if (ignored) {
            this.logger.info(`${account.organizationalUnit} is ignored and not included`);
          }
          this.logger.info(`${account.organizationalUnit} organizational unit included`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Function to get S3 life cycle rules
   * @param lifecycleRules
   * @returns
   */
  protected getS3LifeCycleRules(lifecycleRules: LifeCycleRule[] | undefined): S3LifeCycleRule[] {
    const rules: S3LifeCycleRule[] = [];
    for (const lifecycleRule of lifecycleRules ?? []) {
      const noncurrentVersionTransitions = [];
      for (const noncurrentVersionTransition of lifecycleRule.noncurrentVersionTransitions ?? []) {
        noncurrentVersionTransitions.push({
          storageClass: noncurrentVersionTransition.storageClass,
          transitionAfter: noncurrentVersionTransition.transitionAfter,
        });
      }
      const transitions = [];
      for (const transition of lifecycleRule.transitions ?? []) {
        transitions.push({
          storageClass: transition.storageClass,
          transitionAfter: transition.transitionAfter,
        });
      }
      const rule: S3LifeCycleRule = {
        abortIncompleteMultipartUploadAfter: lifecycleRule.abortIncompleteMultipartUpload,
        enabled: lifecycleRule.enabled,
        expiration: lifecycleRule.expiration,
        expiredObjectDeleteMarker: lifecycleRule.expiredObjectDeleteMarker,
        id: lifecycleRule.id,
        noncurrentVersionExpiration: lifecycleRule.noncurrentVersionExpiration,
        noncurrentVersionTransitions,
        transitions,
      };
      rules.push(rule);
    }
    return rules;
  }

  /**
   * Add RAM resource shares to the stack.
   *
   * @param item
   * @param resourceShareName
   * @param resourceArns
   */
  protected addResourceShare(item: ResourceShareType, resourceShareName: string, resourceArns: string[]) {
    // Build a list of principals to share to
    const principals: string[] = [];

    // Loop through all the defined OUs
    for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
      let ouArn = this.props.organizationConfig.getOrganizationalUnitArn(ouItem);
      // AWS::RAM::ResourceShare expects the organizations ARN if
      // sharing with the entire org (Root)
      if (ouItem === 'Root') {
        ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
      }
      this.logger.info(`Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
      principals.push(ouArn);
    }

    // Loop through all the defined accounts
    for (const account of item.shareTargets?.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      this.logger.info(`Share ${resourceShareName} with Account ${account}: ${accountId}`);
      principals.push(accountId);
    }

    // Create the Resource Share
    new ResourceShare(this, `${pascalCase(resourceShareName)}ResourceShare`, {
      name: resourceShareName,
      principals,
      resourceArns: resourceArns,
    });
  }

  /**
   * Get the resource ID from a RAM share.
   *
   * @param resourceShareName
   * @param itemType
   * @param owningAccountId
   */
  protected getResourceShare(
    resourceShareName: string,
    itemType: string,
    owningAccountId: string,
    kmsKey: cdk.aws_kms.Key,
    vpcName?: string,
  ): IResourceShareItem {
    // Generate a logical ID
    const resourceName = resourceShareName.split('_')[0];
    const logicalId = vpcName
      ? `${vpcName}${resourceName}${itemType.split(':')[1]}`
      : `${resourceName}${itemType.split(':')[1]}`;

    // Lookup resource share
    const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}Share`), {
      resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
      resourceShareName: resourceShareName,
      owningAccountId,
    });

    // Represents the item shared by RAM
    return ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    });
  }

  /**
   * Get the IAM condition context key for the organization.
   */
  protected getPrincipalOrgIdCondition(organizationId: string | undefined): { [key: string]: string | string[] } {
    if (this.props.partition === 'aws-cn' || !this.props.organizationConfig.enable) {
      const accountIds = this.props.accountsConfig.getAccountIds();
      if (accountIds) {
        return {
          'aws:PrincipalAccount': accountIds,
        };
      }
    }
    if (organizationId) {
      return {
        'aws:PrincipalOrgID': organizationId,
      };
    }
    this.logger.error('Organization ID not found or account IDs not found');
    throw new Error(`Configuration validation failed at runtime.`);
  }

  /**
   * Get the IAM principals for the organization.
   */
  protected getOrgPrincipals(organizationId: string | undefined): cdk.aws_iam.IPrincipal {
    if (this.props.partition === 'aws-cn' || !this.props.organizationConfig.enable) {
      const accountIds = this.props.accountsConfig.getAccountIds();
      if (accountIds) {
        const principals: cdk.aws_iam.PrincipalBase[] = [];
        accountIds.forEach(accountId => {
          principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
        });
        return new cdk.aws_iam.CompositePrincipal(...principals);
      }
    }
    if (organizationId) {
      return new cdk.aws_iam.OrganizationPrincipal(organizationId);
    }
    this.logger.error('Organization ID not found or account IDs not found');
    throw new Error(`Configuration validation failed at runtime.`);
  }

  /**
   * Generate policy replacements and optionally return a temp path
   * to the transformed document
   * @param policyPath
   * @param returnTempPath
   * @param organizationId
   * @returns
   */
  protected generatePolicyReplacements(policyPath: string, returnTempPath: boolean, organizationId?: string): string {
    // Transform policy document
    let policyContent: string = JSON.stringify(require(policyPath));
    const acceleratorPrefix = 'AWSAccelerator';
    const acceleratorPrefixNoDash = acceleratorPrefix.endsWith('-')
      ? acceleratorPrefix.slice(0, -1)
      : acceleratorPrefix;

    const additionalReplacements: { [key: string]: string | string[] } = {
      '\\${ACCELERATOR_DEFAULT_PREFIX_SHORTHAND}': acceleratorPrefix === 'AWSAccelerator' ? 'AWSA' : acceleratorPrefix,
      '\\${ACCELERATOR_PREFIX_ND}': acceleratorPrefixNoDash,
      '\\${ACCELERATOR_PREFIX_LND}': acceleratorPrefixNoDash.toLowerCase(),
      '\\${ACCOUNT_ID}': cdk.Stack.of(this).account,
      '\\${AUDIT_ACCOUNT_ID}': this.props.accountsConfig.getAuditAccountId(),
      '\\${HOME_REGION}': this.props.globalConfig.homeRegion,
      '\\${LOGARCHIVE_ACCOUNT_ID}': this.props.accountsConfig.getLogArchiveAccountId(),
      '\\${MANAGEMENT_ACCOUNT_ID}': this.props.accountsConfig.getManagementAccountId(),
      '\\${REGION}': cdk.Stack.of(this).region,
    };

    if (organizationId) {
      additionalReplacements['\\${ORG_ID}'] = organizationId;
    }

    policyContent = policyReplacements({
      content: policyContent,
      acceleratorPrefix,
      managementAccountAccessRole: this.props.globalConfig.managementAccountAccessRole,
      partition: this.props.partition,
      additionalReplacements,
    });

    if (returnTempPath) {
      return this.createTempFile(policyContent);
    } else {
      return policyContent;
    }
  }

  /**
   * Create a temp file of a transformed policy document
   * @param policyContent
   * @returns
   */
  private createTempFile(policyContent: string): string {
    // Generate unique file path in temporary directory
    let tempDir: string;
    if (process.platform === 'win32') {
      try {
        fs.accessSync(process.env['Temp']!, fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join(process.env['Temp']!, 'temp-accelerator-policies');
    } else {
      try {
        fs.accessSync('/tmp', fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join('/tmp', 'temp-accelerator-policies');
    }
    const tempPath = path.join(tempDir, `${uuidv4()}.json`);

    // Write transformed file
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    fs.writeFileSync(tempPath, policyContent, 'utf-8');

    return tempPath;
  }

  protected generateManagedPolicyReferences(customerManagedPolicyReferencesList: string[]) {
    let customerManagedPolicyReferences: cdk.aws_sso.CfnPermissionSet.CustomerManagedPolicyReferenceProperty[] = [];
    if (customerManagedPolicyReferencesList) {
      customerManagedPolicyReferences = customerManagedPolicyReferencesList.map(x => ({
        name: x,
      }));
    }
    return customerManagedPolicyReferences;
  }

  protected convertMinutesToIso8601(s: number) {
    const days = Math.floor(s / 1440);
    s = s - days * 1440;
    const hours = Math.floor(s / 60);
    s = s - hours * 60;

    let dur = 'PT';
    if (days > 0) {
      dur += days + 'D';
    }
    if (hours > 0) {
      dur += hours + 'H';
    }
    dur += s + 'M';

    return dur.toString();
  }

  protected processBlockDeviceReplacements(blockDeviceMappings: BlockDeviceMappingItem[], appName: string) {
    const mappings: BlockDeviceMappingItem[] = [];
    blockDeviceMappings.forEach(device =>
      mappings.push({
        deviceName: device.deviceName,
        ebs: device.ebs ? this.processKmsKeyReplacements(device, appName) : undefined,
      }),
    );

    return mappings;
  }

  protected processKmsKeyReplacements(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    if (device.ebs!.kmsKeyId) {
      return this.replaceKmsKeyIdProvided(device, appName);
    }
    if (device.ebs!.encrypted && this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable) {
      return this.replaceKmsKeyDefaultEncryption(device, appName);
    }

    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: device.ebs!.kmsKeyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceKmsKeyDefaultEncryption(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    let ebsEncryptionKey: cdk.aws_kms.Key;
    // user set encryption as true and has default ebs encryption enabled
    // user defined kms key is provided
    if (this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) {
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) +
          pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}`) +
          `-KmsKey`,
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/kms/${this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey}/key-arn`,
        ),
      ) as cdk.aws_kms.Key;
    } else {
      // user set encryption as true and has default ebs encryption enabled
      // no kms key is provided
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}-${device.ebs!.kmsKeyId}`),
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        ),
      ) as cdk.aws_kms.Key;
    }
    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: ebsEncryptionKey.keyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceKmsKeyIdProvided(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    const kmsKeyEntity = cdk.aws_kms.Key.fromKeyArn(
      this,
      pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}-${device.ebs!.kmsKeyId}`),
      cdk.aws_ssm.StringParameter.valueForStringParameter(this, `/accelerator/kms/${device.ebs!.kmsKeyId}/key-arn`),
    ) as cdk.aws_kms.Key;
    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: kmsKeyEntity.keyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceImageId(imageId: string) {
    if (imageId.match('\\${ACCEL_LOOKUP::ImageId:(.*)}')) {
      const imageIdMatch = imageId.match('\\${ACCEL_LOOKUP::ImageId:(.*)}');
      return cdk.aws_ssm.StringParameter.valueForStringParameter(this, imageIdMatch![1]);
    } else {
      return imageId;
    }
  }

  protected isCrossAccountNaclSource(naclItem: string | NetworkAclSubnetSelection): boolean {
    if (typeof naclItem === 'string') {
      return false;
    }
    const accountId = cdk.Stack.of(this).account;
    const naclAccount = this.props.accountsConfig.getAccountId(naclItem.account);
    const region = cdk.Stack.of(this).region;
    const naclRegion = naclItem.region;

    if (naclRegion && accountId === naclAccount && region === naclRegion) {
      return false;
    } else {
      return true;
    }
  }
}

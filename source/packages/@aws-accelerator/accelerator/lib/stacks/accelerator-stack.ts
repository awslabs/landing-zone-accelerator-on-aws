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
import { Construct } from 'constructs';

import {
  AccountsConfig,
  DeploymentTargets,
  GlobalConfig,
  IamConfig,
  LifeCycleRule,
  NetworkConfig,
  NetworkConfigTypes,
  OrganizationConfig,
  SecurityConfig,
  ShareTargets,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';

import { S3LifeCycleRule } from '@aws-accelerator/constructs';

import { version } from '../../../../../package.json';
import { Logger } from '../logger';

export interface AcceleratorStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly partition: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
  readonly globalRegion?: string;
}

export abstract class AcceleratorStack extends cdk.Stack {
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
   * Accelerator CentralLogs bucket name prefix
   */
  public static readonly ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX = 'aws-accelerator-central-logs';
  /**
   * Cross account IAM ROLE to read SSM parameter
   * IAM role to access SSM parameter from different or different region
   * This role is created in Key stack
   */
  public static readonly ACCELERATOR_CROSS_ACCOUNT_ACCESS_ROLE_NAME = 'AWSAccelerator-CrossAccount-SsmParameter-Role';
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

  /**
   * Accelerator SNS encryption key description
   * SecurityAudit stack creates this key to encrypt AWS SNS topics
   */
  protected static readonly ACCELERATOR_SNS_KEY_DESCRIPTION = 'AWS Accelerator SNS Kms Key';

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

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    this.props = props;

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });
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

    // Helper function to add an account to the list
    const addAccountName = (accountName: string) => {
      if (!accountNames.includes(accountName)) {
        accountNames.push(accountName);
      }
    };

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          addAccountName(account.name);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            addAccountName(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      addAccountName(account);
    }

    return accountNames;
  }

  protected getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          addAccountId(account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            addAccountId(accountId);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      addAccountId(accountId);
    }

    return accountIds;
  }

  protected getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account =>
        addAccountId(this.props.accountsConfig.getAccountId(account)),
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

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    for (const ou of shareTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          addAccountId(account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            addAccountId(accountId);
          }
        }
      }
    }

    for (const account of shareTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      // debug: accountId
      addAccountId(accountId);
    }

    return accountIds;
  }

  protected isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(cdk.Stack.of(this).region)) {
      Logger.info(`[accelerator-stack] ${cdk.Stack.of(this).region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  protected isAccountExcluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        Logger.info(`[accelerator-stack] ${account} account explicitly excluded`);
        return true;
      }
    }
    return false;
  }

  protected isAccountIncluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        Logger.info(`[accelerator-stack] ${account} account explicitly included`);
        return true;
      }
    }
    return false;
  }

  protected isOrganizationalUnitIncluded(organizationalUnits: string[]): boolean {
    if (organizationalUnits) {
      // If Root is specified, return right away
      if (organizationalUnits.includes('Root')) {
        return true;
      }

      // Full list of all accounts
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      // Find the account with the matching ID
      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === cdk.Stack.of(this).account,
      );

      if (account) {
        if (organizationalUnits.indexOf(account.organizationalUnit) != -1) {
          Logger.info(`[accelerator-stack] ${account.organizationalUnit} organizational unit explicitly included`);
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
}

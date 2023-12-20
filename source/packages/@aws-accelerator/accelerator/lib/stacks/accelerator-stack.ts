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
import { NagSuppressions } from 'cdk-nag';

import { PrincipalOrgIdConditionType } from '@aws-accelerator/utils';

import {
  AccountConfig,
  AccountsConfig,
  BlockDeviceMappingItem,
  CustomizationsConfig,
  DeploymentTargets,
  EbsItemConfig,
  GlobalConfig,
  GovCloudAccountConfig,
  IamConfig,
  LifeCycleRule,
  NetworkConfig,
  NetworkConfigTypes,
  OrganizationConfig,
  Region,
  ReplacementsConfig,
  S3EncryptionConfig,
  SecurityConfig,
  ServiceEncryptionConfig,
  ShareTargets,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { KeyLookup, S3LifeCycleRule, ServiceLinkedRole } from '@aws-accelerator/constructs';
import { createLogger, policyReplacements, SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils';

import { version } from '../../../../../package.json';
import { AcceleratorResourceNames } from '../accelerator-resource-names';
import { AcceleratorResourcePrefixes } from '../../utils/app-utils';

/**
 * Accelerator Key type enum
 */
export enum AcceleratorKeyType {
  /**
   * Central Log Bucket key
   */
  CENTRAL_LOG_BUCKET = 'central-log-bucket',
  /**
   * Cloudwatch key
   */
  CLOUDWATCH_KEY = 'cloudwatch-key',
  /**
   * Imported Central Log Bucket key
   */
  IMPORTED_CENTRAL_LOG_BUCKET = 'imported-central-log-bucket',
  /**
   * Lambda key
   */
  LAMBDA_KEY = 'lambda-key',
  /**
   * S3 key
   */
  S3_KEY = 's3-key',
}

/**
 * Service Linked Role type enum
 */
export enum ServiceLinkedRoleType {
  /**
   * Access Analyzer SLR
   */
  ACCESS_ANALYZER = 'access-analyzer',
  /**
   * GUARDDUTY SLR
   */
  GUARDDUTY = 'guardduty',
  /**
   * MACIE SLR
   */
  MACIE = 'macie',
  /**
   * SECURITYHUB SLR
   */
  SECURITY_HUB = 'securityhub',
  /**
   * AUTOSCALING SLR
   */
  AUTOSCALING = 'autoscaling',
  /**
   * AWSCloud9 SLR
   */
  AWS_CLOUD9 = 'cloud9',
  /**
   * AWS Firewall Manager SLR
   */
  FMS = 'fms',
}

/**
 * Allowed rule id type for NagSuppression
 */
export enum NagSuppressionRuleIds {
  DDB3 = 'DDB3',
  EC28 = 'EC28',
  EC29 = 'EC29',
  IAM4 = 'IAM4',
  IAM5 = 'IAM5',
  SMG4 = 'SMG4',
  VPC3 = 'VPC3',
  S1 = 'S1',
  KDS3 = 'KDS3',
  AS3 = 'AS3',
}

/**
 * NagSuppression Detail Type
 */
export type NagSuppressionDetailType = {
  /**
   * Suppressions rule id
   */
  id: NagSuppressionRuleIds;
  /**
   * Suppressions details
   */
  details: {
    /**
     * Resource path
     */
    path: string;
    /**
     * Suppressions reason
     */
    reason: string;
  }[];
};

export interface AcceleratorStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly replacementsConfig: ReplacementsConfig;
  readonly partition: string;
  readonly configRepositoryName: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
  readonly globalRegion: string;
  readonly centralizedLoggingRegion: string;
  /**
   * Accelerator resource name prefixes
   */
  readonly prefixes: AcceleratorResourcePrefixes;
  readonly enableSingleAccountMode: boolean;
  /**
   * Use existing roles for deployment
   */
  readonly useExistingRoles: boolean;
  /**
   * Central logs kms key arn
   * @remarks
   * this is only possible after logging stack is run in centralizedLoggingRegion
   * It will be used in
   * - logging stack for replication to s3 bucket
   * - organizations stack for org trail
   * - security-audit stack for AWS config service, SSM session manager, account trail
   * - security stack for macie and guard duty
   */
  centralLogsBucketKmsKeyArn?: string;
  /**
   * Flag indicating diagnostic pack enabled
   */
  isDiagnosticsPackEnabled: string;
  /**
   * Accelerator pipeline account id, for external deployment it will be pipeline account otherwise management account
   */
  pipelineAccountId: string;
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
   * Nag suppression input list
   */
  protected nagSuppressionInputs: NagSuppressionDetailType[] = [];

  /**
   * Accelerator SSM parameters
   * This array is used to store SSM parameters that are created per-stack.
   */
  protected ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];

  protected centralLogsBucketName: string;

  public readonly organizationId: string | undefined;

  /**
   * Flag indicating external deployment
   */
  public readonly isExternalDeployment: boolean;

  public acceleratorResourceNames: AcceleratorResourceNames;

  public stackParameters: Map<string, cdk.aws_ssm.StringParameter>;

  /**
   * Flag indicating if AWS KMS CMK is enabled for AWS Lambda environment encryption
   */
  public readonly isLambdaCMKEnabled: boolean;

  /**
   * Flag indicating if AWS KMS CMK is enabled for AWS CloudWatch log group data encryption
   */
  public readonly isCloudWatchLogsGroupCMKEnabled: boolean;

  /**
   * Flag indicating if AWS KMS CMK is enabled for AWS S3 bucket encryption
   */
  public readonly isS3CMKEnabled: boolean;

  /**
   * Flag indicating if S3 access logs bucket is enabled
   */
  public readonly isAccessLogsBucketEnabled: boolean;

  /**
   * External resource SSM parameters
   * These parameters are loaded along with externalResourceMapping from SSM
   */
  private externalResourceParameters: { [key: string]: string } | undefined;

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger = createLogger([cdk.Stack.of(this).stackName]);
    this.props = props;
    this.ssmParameters = [];
    this.organizationId = props.organizationConfig.getOrganizationId();
    this.isExternalDeployment =
      props.pipelineAccountId !== props.accountsConfig.getManagementAccountId() ? true : false;
    //
    // Initialize resource names
    this.acceleratorResourceNames = new AcceleratorResourceNames({
      prefixes: props.prefixes,
      centralizedLoggingRegion: props.centralizedLoggingRegion,
    });

    //
    // Get CentralLogBucket name
    this.centralLogsBucketName = this.getCentralLogBucketName();

    //
    // Get external resource ssm parameters from pre loaded globalConfig
    this.externalResourceParameters =
      props.globalConfig.externalLandingZoneResources?.resourceParameters?.[`${this.account}-${this.region}`];

    this.stackParameters = new Map<string, cdk.aws_ssm.StringParameter>();
    this.stackParameters.set(
      'StackId',
      new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
        parameterName: this.getSsmPath(SsmResourceType.STACK_ID, [cdk.Stack.of(this).stackName]),
        stringValue: cdk.Stack.of(this).stackId,
      }),
    );

    this.stackParameters.set(
      'StackVersion',
      new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
        parameterName: this.getSsmPath(SsmResourceType.VERSION, [cdk.Stack.of(this).stackName]),
        stringValue: version,
      }),
    );

    //
    // Set if AWS KMS CMK is enabled for Lambda environment encryption
    //
    this.isLambdaCMKEnabled = this.isCmkEnabled(this.props.globalConfig.lambda?.encryption);

    //
    // Set if AWS KMS CMK is enabled for AWS CloudWatch log group data encryption
    //
    this.isCloudWatchLogsGroupCMKEnabled = this.isCmkEnabled(
      this.props.globalConfig.logging.cloudwatchLogs?.encryption,
    );

    //
    // Set if AWS KMS CMK is enabled for AWS S3 bucket encryption
    //
    this.isS3CMKEnabled = this.isCmkEnabled(this.props.globalConfig.s3?.encryption);

    //
    // Set if S3 access log bucket is enabled
    //
    this.isAccessLogsBucketEnabled = this.accessLogsBucketEnabled();
  }

  /**
   * Function to get server access logs bucket name
   * @returns
   *
   * @remarks
   * If importedBucket used returns imported server access logs bucket name else return solution defined bucket name
   */
  protected getServerAccessLogsBucketName(): string | undefined {
    if (this.props.globalConfig.logging.accessLogBucket?.importedBucket?.name) {
      return this.getBucketNameReplacement(this.props.globalConfig.logging.accessLogBucket.importedBucket.name);
    }
    if (!this.isAccessLogsBucketEnabled) {
      return undefined;
    }
    return `${this.acceleratorResourceNames.bucketPrefixes.s3AccessLogs}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
  }

  /**
   * Function to get ELB logs bucket name
   * @returns
   *
   * @remarks
   * If importedBucket used returns imported ELB logs bucket name else solution defined bucket name
   */
  protected getElbLogsBucketName(): string {
    if (this.props.globalConfig.logging.elbLogBucket?.importedBucket?.name) {
      return this.getBucketNameReplacement(this.props.globalConfig.logging.elbLogBucket.importedBucket.name);
    } else {
      return `${
        this.acceleratorResourceNames.bucketPrefixes.elbLogs
      }-${this.props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this).region}`;
    }
  }

  /**
   * Function to get Central Log bucket name
   * @returns
   */
  private getCentralLogBucketName(): string {
    if (this.props.globalConfig.logging.centralLogBucket?.importedBucket) {
      return this.getBucketNameReplacement(this.props.globalConfig.logging.centralLogBucket.importedBucket.name);
    }
    return `${
      this.acceleratorResourceNames.bucketPrefixes.centralLogs
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`;
  }

  /**
   * Function to get CentralLogs bucket key
   * @param customResourceLambdaCloudWatchLogKmsKey {@link cdk.aws_kms.IKey}
   *
   * @returns key {@link cdk.aws_kms.IKey}
   *
   * @remarks
   * If importedBucket used returns imported CentralLogs bucket cmk arn else return solution defined CentralLogs bucket cmk arn
   */
  protected getCentralLogsBucketKey(customResourceLambdaCloudWatchLogKmsKey?: cdk.aws_kms.IKey): cdk.aws_kms.IKey {
    if (this.props.globalConfig.logging.centralLogBucket?.importedBucket?.name) {
      return this.getAcceleratorKey(
        AcceleratorKeyType.IMPORTED_CENTRAL_LOG_BUCKET,
        customResourceLambdaCloudWatchLogKmsKey,
      )!;
    } else {
      return this.getAcceleratorKey(AcceleratorKeyType.CENTRAL_LOG_BUCKET, customResourceLambdaCloudWatchLogKmsKey)!;
    }
  }

  /**
   * List of supported partitions for Service Linked Role creation
   */
  protected serviceLinkedRoleSupportedPartitionList: string[] = ['aws', 'aws-cn', 'aws-us-gov'];

  /**
   * Create Access Analyzer Service Linked role
   *
   * @remarks
   * Access Analyzer Service linked role is created when organization is enabled and accessAnalyzer flag is ON.
   */
  protected createAccessAnalyzerServiceLinkedRole(key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey }) {
    if (
      this.props.organizationConfig.enable &&
      this.props.securityConfig.accessAnalyzer.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      this.createServiceLinkedRole(ServiceLinkedRoleType.ACCESS_ANALYZER, {
        cloudwatch: key.cloudwatch,
        lambda: key.lambda,
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AccessAnalyzerServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AccessAnalyzerServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AccessAnalyzerServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AccessAnalyzerServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
    }
  }

  /**
   * Create GuardDuty Service Linked role
   *
   * @remarks
   * GuardDuty Service linked role is created when organization is enabled and guardduty flag is ON.
   */
  protected createGuardDutyServiceLinkedRole(key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey }) {
    if (
      this.props.organizationConfig.enable &&
      this.props.securityConfig.centralSecurityServices.guardduty.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      this.createServiceLinkedRole(ServiceLinkedRoleType.GUARDDUTY, { cloudwatch: key.cloudwatch, lambda: key.lambda });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/GuardDutyServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/GuardDutyServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/GuardDutyServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/GuardDutyServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
    }
  }

  /**
   * Create SecurityHub Service Linked role
   *
   * @remarks
   * SecurityHub Service linked role is created when organization is enabled and securityHub flag is ON.
   */
  protected createSecurityHubServiceLinkedRole(key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey }) {
    if (
      this.props.organizationConfig.enable &&
      this.props.securityConfig.centralSecurityServices.securityHub.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      this.createServiceLinkedRole(ServiceLinkedRoleType.SECURITY_HUB, {
        cloudwatch: key.cloudwatch,
        lambda: key.lambda,
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/SecurityHubServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/SecurityHubServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/SecurityHubServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/SecurityHubServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
    }
  }

  /**
   * Create Macie Service Linked role
   *
   * @remarks
   * Macie Service linked role is created when organization is enabled and macie flag is ON.
   */
  protected createMacieServiceLinkedRole(key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey }) {
    if (
      this.props.organizationConfig.enable &&
      this.props.securityConfig.centralSecurityServices.macie.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      this.createServiceLinkedRole(ServiceLinkedRoleType.MACIE, { cloudwatch: key.cloudwatch, lambda: key.lambda });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/MacieServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/MacieServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/MacieServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/MacieServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
    }
  }

  /**
   * Create AutoScaling Service Linked role
   *
   * @remarks
   * AutoScaling when ebsDefaultVolumeEncryption flag is ON. Or when firewall is used.
   */
  protected createAutoScalingServiceLinkedRole(key: {
    cloudwatch?: cdk.aws_kms.IKey;
    lambda?: cdk.aws_kms.IKey;
  }): ServiceLinkedRole | undefined {
    if (
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      const serviceLinkedRole = this.createServiceLinkedRole(ServiceLinkedRoleType.AUTOSCALING, {
        cloudwatch: key.cloudwatch,
        lambda: key.lambda,
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
      return serviceLinkedRole;
    }
    return;
  }

  /**
   * Function to get active account ids
   * @returns accountIds string
   *
   * @remarks
   * Get only non suspended OUs account ids
   */
  protected getActiveAccountIds() {
    const accountNames: string[] = [];
    const accountIds: string[] = [];
    const suspendedOuItems = this.props.organizationConfig.organizationalUnits.filter(item => item.ignore);
    const suspendedOuNames = suspendedOuItems.flatMap(item => item.name);

    for (const accountItem of [
      ...this.props.accountsConfig.mandatoryAccounts,
      ...this.props.accountsConfig.workloadAccounts,
    ]) {
      if (!suspendedOuNames.includes(accountItem.organizationalUnit)) {
        accountNames.push(accountItem.name);
      }
    }

    accountNames.forEach(item => accountIds.push(this.props.accountsConfig.getAccountId(item)));
    return accountIds;
  }

  /**
   * Create AWS CLOUD9 Service Linked role
   *
   * @remarks
   * AWS CLOUD9 when ebsDefaultVolumeEncryption flag is ON and partition is 'aws'
   */
  protected createAwsCloud9ServiceLinkedRole(key: {
    cloudwatch?: cdk.aws_kms.IKey;
    lambda?: cdk.aws_kms.IKey;
  }): ServiceLinkedRole | undefined {
    if (
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      this.props.partition === 'aws'
    ) {
      const serviceLinkedRole = this.createServiceLinkedRole(ServiceLinkedRoleType.AWS_CLOUD9, {
        cloudwatch: key.cloudwatch,
        lambda: key.lambda,
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AWSServiceRoleForAWSCloud9/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AWSServiceRoleForAWSCloud9/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AWSServiceRoleForAWSCloud9/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });

      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AWSServiceRoleForAWSCloud9/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Custom resource Lambda role policy.',
          },
        ],
      });
      return serviceLinkedRole;
    }
    return;
  }

  /**
   * Create AWS Firewall Manager Service Linked role
   *
   * @remarks
   * Service linked role is created in the partitions that allow it.
   * Since it is used for delegated admin organizations need to be enabled
   */
  protected createAwsFirewallManagerServiceLinkedRole(key: {
    cloudwatch?: cdk.aws_kms.IKey;
    lambda?: cdk.aws_kms.IKey;
  }): ServiceLinkedRole {
    // create service linked roles only in the partitions that allow it
    const serviceLinkedRole = this.createServiceLinkedRole(ServiceLinkedRoleType.FMS, {
      cloudwatch: key.cloudwatch,
      lambda: key.lambda,
    });
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/FirewallManagerServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
          reason: 'Custom resource Lambda role policy.',
        },
      ],
    });

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/FirewallManagerServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
          reason: 'Custom resource Lambda role policy.',
        },
      ],
    });
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/FirewallManagerServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
          reason: 'Custom resource Lambda role policy.',
        },
      ],
    });

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/FirewallManagerServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
          reason: 'Custom resource Lambda role policy.',
        },
      ],
    });
    return serviceLinkedRole;
  }
  /**
   * Function to create Service Linked Role for given type
   * @param roleType {@link ServiceLinkedRoleType}
   * @returns ServiceLinkedRole
   *
   * @remarks
   * Service Linked Role creation is depended on the service configuration.
   */
  private createServiceLinkedRole(
    roleType: string,
    key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey },
  ): ServiceLinkedRole {
    let serviceLinkedRole: ServiceLinkedRole | undefined;

    switch (roleType) {
      case ServiceLinkedRoleType.ACCESS_ANALYZER:
        this.logger.debug('Create AccessAnalyzerServiceLinkedRole');
        serviceLinkedRole = new ServiceLinkedRole(this, 'AccessAnalyzerServiceLinkedRole', {
          awsServiceName: 'access-analyzer.amazonaws.com',
          environmentEncryptionKmsKey: key.lambda,
          cloudWatchLogKmsKey: key.cloudwatch,
          cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          roleName: 'AWSServiceRoleForAccessAnalyzer',
        });

        break;
      case ServiceLinkedRoleType.GUARDDUTY:
        this.logger.debug('Create GuardDutyServiceLinkedRole');
        serviceLinkedRole = new ServiceLinkedRole(this, 'GuardDutyServiceLinkedRole', {
          awsServiceName: 'guardduty.amazonaws.com',
          description: 'A service-linked role required for Amazon GuardDuty to access your resources. ',
          environmentEncryptionKmsKey: key.lambda,
          cloudWatchLogKmsKey: key.cloudwatch,
          cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          roleName: 'AWSServiceRoleForAmazonGuardDuty',
        });

        break;
      case ServiceLinkedRoleType.SECURITY_HUB:
        if (
          this.props.organizationConfig.enable &&
          this.props.securityConfig.centralSecurityServices.securityHub.enable
        ) {
          this.logger.debug('Create SecurityHubServiceLinkedRole');
          serviceLinkedRole = new ServiceLinkedRole(this, 'SecurityHubServiceLinkedRole', {
            awsServiceName: 'securityhub.amazonaws.com',
            description: 'A service-linked role required for AWS Security Hub to access your resources.',
            environmentEncryptionKmsKey: key.lambda,
            cloudWatchLogKmsKey: key.cloudwatch,
            cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            roleName: 'AWSServiceRoleForSecurityHub',
          });
        }
        break;
      case ServiceLinkedRoleType.MACIE:
        if (this.props.organizationConfig.enable && this.props.securityConfig.centralSecurityServices.macie.enable) {
          this.logger.debug('Create MacieServiceLinkedRole');
          serviceLinkedRole = new ServiceLinkedRole(this, 'MacieServiceLinkedRole', {
            awsServiceName: 'macie.amazonaws.com',
            environmentEncryptionKmsKey: key.lambda,
            cloudWatchLogKmsKey: key.cloudwatch,
            cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            roleName: 'AWSServiceRoleForAmazonMacie',
          });
        }
        break;
      case ServiceLinkedRoleType.AUTOSCALING:
        this.logger.debug('Create AutoScalingServiceLinkedRole');
        serviceLinkedRole = new ServiceLinkedRole(this, 'AutoScalingServiceLinkedRole', {
          awsServiceName: 'autoscaling.amazonaws.com',
          description:
            'Default Service-Linked Role enables access to AWS Services and Resources used or managed by Auto Scaling',
          environmentEncryptionKmsKey: key.lambda,
          cloudWatchLogKmsKey: key.cloudwatch,
          cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          roleName: 'AWSServiceRoleForAutoScaling',
        });
        break;
      case ServiceLinkedRoleType.AWS_CLOUD9:
        if (
          this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
          this.props.partition === 'aws'
        ) {
          this.logger.debug('Create Aws Cloud9 Service Linked Role');
          serviceLinkedRole = new ServiceLinkedRole(this, 'AWSServiceRoleForAWSCloud9', {
            awsServiceName: 'cloud9.amazonaws.com',
            description: 'Service linked role for AWS Cloud9',
            environmentEncryptionKmsKey: key.lambda,
            cloudWatchLogKmsKey: key.cloudwatch,
            cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            roleName: 'AWSServiceRoleForAWSCloud9',
          });
        }
        break;
      case ServiceLinkedRoleType.FMS:
        this.logger.debug('Create FirewallManagerServiceLinkedRole');
        serviceLinkedRole = new ServiceLinkedRole(this, 'FirewallManagerServiceLinkedRole', {
          awsServiceName: 'fms.amazonaws.com',
          environmentEncryptionKmsKey: key.lambda,
          cloudWatchLogKmsKey: key.cloudwatch,
          cloudWatchLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          roleName: 'AWSServiceRoleForFMS',
        });
        break;
      default:
        throw new Error(`Invalid service linked role type ${roleType}`);
    }
    return serviceLinkedRole!;
  }

  /**
   * Function to get Accelerator key for given key type
   * @param keyType {@type AcceleratorKeyType}
   * @param customResourceLambdaCloudWatchLogKmsKey {@link cdk.aws_kms.IKey}
   * @returns cdk.aws_kms.IKey
   */
  public getAcceleratorKey(
    keyType: AcceleratorKeyType,
    customResourceLambdaCloudWatchLogKmsKey?: cdk.aws_kms.IKey,
  ): cdk.aws_kms.IKey | undefined {
    let key: cdk.aws_kms.IKey | undefined;
    switch (keyType) {
      case AcceleratorKeyType.S3_KEY:
        key = this.isS3CMKEnabled
          ? cdk.aws_kms.Key.fromKeyArn(
              this,
              'AcceleratorS3KeyLookup',
              cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.acceleratorResourceNames.parameters.s3CmkArn,
              ),
            )
          : undefined;
        break;
      case AcceleratorKeyType.CLOUDWATCH_KEY:
        key = this.isCloudWatchLogsGroupCMKEnabled
          ? cdk.aws_kms.Key.fromKeyArn(
              this,
              'AcceleratorGetCloudWatchKey',
              cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
              ),
            )
          : undefined;
        break;
      case AcceleratorKeyType.LAMBDA_KEY:
        key = this.isLambdaCMKEnabled
          ? cdk.aws_kms.Key.fromKeyArn(
              this,
              'AcceleratorGetLambdaKey',
              cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.acceleratorResourceNames.parameters.lambdaCmkArn,
              ),
            )
          : undefined;
        break;
      case AcceleratorKeyType.CENTRAL_LOG_BUCKET:
        key = new KeyLookup(this, 'AcceleratorCentralLogBucketKeyLookup', {
          accountId: this.props.accountsConfig.getLogArchiveAccountId(),
          keyRegion: this.props.centralizedLoggingRegion,
          roleName: this.acceleratorResourceNames.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess,
          keyArnParameterName: this.acceleratorResourceNames.parameters.centralLogBucketCmkArn,
          kmsKey: customResourceLambdaCloudWatchLogKmsKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          acceleratorPrefix: this.props.prefixes.accelerator,
          kmsKeyArn: this.props.centralLogsBucketKmsKeyArn,
        }).getKey();

        break;
      case AcceleratorKeyType.IMPORTED_CENTRAL_LOG_BUCKET:
        key = new KeyLookup(this, 'AcceleratorImportedCentralLogBucketKeyLookup', {
          accountId: this.props.accountsConfig.getLogArchiveAccountId(),
          keyRegion: this.props.centralizedLoggingRegion,
          roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
          keyArnParameterName: this.acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn,
          kmsKey: customResourceLambdaCloudWatchLogKmsKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          acceleratorPrefix: this.props.prefixes.accelerator,
          kmsKeyArn: this.props.centralLogsBucketKmsKeyArn,
        }).getKey();
        break;
      default:
        throw new Error(`Invalid key type ${keyType}`);
    }

    return key!;
  }

  /**
   * Function to get replacement bucket name
   * @param name
   * @returns
   */
  protected getBucketNameReplacement(name: string): string {
    return name.replace('${REGION}', cdk.Stack.of(this).region).replace('${ACCOUNT_ID}', cdk.Stack.of(this).account);
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

  /**
   * Function to add resource suppressions by path
   */
  protected addResourceSuppressionsByPath(): void {
    for (const nagSuppressionInput of this.nagSuppressionInputs) {
      for (const detail of nagSuppressionInput.details) {
        NagSuppressions.addResourceSuppressionsByPath(this, detail.path, [
          { id: `AwsSolutions-${nagSuppressionInput.id}`, reason: detail.reason },
        ]);
      }
    }
  }

  /**
   * Function to check if LZA deployed CMK is enabled for a given service
   * @param encryptionConfig {@link ServiceEncryptionConfig} | {@link S3EncryptionConfig}
   * @returns boolean
   */
  protected isCmkEnabled(encryptionConfig?: ServiceEncryptionConfig | S3EncryptionConfig): boolean {
    let isCmkEnable = true;
    if (!encryptionConfig) {
      return isCmkEnable;
    }

    if (encryptionConfig instanceof ServiceEncryptionConfig) {
      isCmkEnable = encryptionConfig.useCMK;
    }

    if (encryptionConfig instanceof S3EncryptionConfig) {
      isCmkEnable = encryptionConfig.createCMK;
    }

    const deploymentTargets = encryptionConfig.deploymentTargets;

    if (!deploymentTargets) {
      return isCmkEnable;
    }

    return this.isIncluded(deploymentTargets) ? isCmkEnable : !isCmkEnable;
  }

  /**
   * Function to check if LZA deployed S3 access logs bucket is enabled
   *
   * @remarks
   * LogArchive account centralized logging region server access log bucket is always enabled since the solution deployed CentralLogs bucket requires access to the log bucket.
   *
   * @returns boolean
   */
  protected accessLogsBucketEnabled(): boolean {
    if (
      cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId() &&
      cdk.Stack.of(this).region == this.props.centralizedLoggingRegion
    ) {
      return true;
    }

    const isEnable = this.props.globalConfig.logging.accessLogBucket?.enable ?? true;
    const deploymentTargets = this.props.globalConfig.logging.accessLogBucket?.deploymentTargets ?? undefined;

    if (!deploymentTargets) {
      return isEnable;
    }

    return this.isIncluded(deploymentTargets) ? isEnable : !isEnable;
  }

  public isIncluded(deploymentTargets: DeploymentTargets): boolean {
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

  /**
   * Private helper function to get account names from Accounts array of DeploymentTarget
   * @param accounts
   * @returns Array of account names
   *
   * @remarks Used only in getAccountNamesFromDeploymentTarget function.
   */
  private getAccountNamesFromDeploymentTargetAccountNames(accounts: string[]): string[] {
    const accountNames: string[] = [];
    for (const account of accounts ?? []) {
      accountNames.push(account);
    }
    return accountNames;
  }

  /**
   * Private helper function to get account names from given list of account configs
   * @param ouName
   * @param accountConfigs
   * @returns Array of account names
   *
   * @remarks Used only in getAccountNamesFromDeploymentTarget function.
   */
  private getAccountNamesFromAccountConfigs(
    ouName: string,
    accountConfigs: (AccountConfig | GovCloudAccountConfig)[],
  ): string[] {
    const accountNames: string[] = [];
    if (ouName === 'Root') {
      for (const account of accountConfigs) {
        accountNames.push(account.name);
      }
    } else {
      for (const account of accountConfigs) {
        if (ouName === account.organizationalUnit) {
          accountNames.push(account.name);
        }
      }
    }

    return accountNames;
  }

  /**
   * Function to get list of account names from given DeploymentTargets.
   * @param deploymentTargets
   * @returns Array of account names
   */
  protected getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountNames: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      accountNames.push(
        ...this.getAccountNamesFromAccountConfigs(ou, [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]),
      );
    }

    accountNames.push(...this.getAccountNamesFromDeploymentTargetAccountNames(deploymentTargets.accounts));

    return [...new Set(accountNames)];
  }

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  /**
   * Private helper function to append account ids from Accounts array of DeploymentTarget or ShareTargets
   * @param accounts
   * @param accountIds - List where processed account ids from Accounts array of DeploymentTarget or ShareTargets to be appended to.
   * @returns Array of Account Ids
   *
   * @remarks Used only in getAccountIdsFromDeploymentTarget function.
   */
  private appendAccountIdsFromDeploymentTargetAccounts(
    deploymentTargets: DeploymentTargets | ShareTargets,
    accountIds: string[],
  ): void {
    for (const accountName of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(accountName);
      this._addAccountId(accountIds, accountId);
    }
  }

  /**
   * Private helper function to append account ids from given list of account configs
   * @param ouName
   * @param accountConfigs
   * @param accountIds - List where processed account ids from accountConfigs to be appended to.
   * @returns Array of Account Ids
   *
   * @remarks Used only in getAccountIdsFromDeploymentTarget function.
   */
  private appendAccountIdsFromAccountConfigs(
    ouName: string,
    accountConfigs: (AccountConfig | GovCloudAccountConfig)[],
    accountIds: string[],
  ): void {
    if (ouName === 'Root') {
      for (const accountConfig of accountConfigs) {
        const accountId = this.props.accountsConfig.getAccountId(accountConfig.name);
        this._addAccountId(accountIds, accountId);
      }
    } else {
      for (const accountConfig of accountConfigs) {
        if (ouName === accountConfig.organizationalUnit) {
          const accountId = this.props.accountsConfig.getAccountId(accountConfig.name);
          this._addAccountId(accountIds, accountId);
        }
      }
    }
  }

  /**
   * Function to get account ids from given DeploymentTarget
   * @param deploymentTargets
   * @returns
   */
  public getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      this.appendAccountIdsFromAccountConfigs(
        ou,
        [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts],
        accountIds,
      );
    }

    this.appendAccountIdsFromDeploymentTargetAccounts(deploymentTargets, accountIds);

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

  public getRegionsFromDeploymentTarget(deploymentTargets: DeploymentTargets): Region[] {
    const regions: Region[] = [];
    const enabledRegions = this.props.globalConfig.enabledRegions;
    regions.push(
      ...enabledRegions.filter(region => {
        return !deploymentTargets?.excludedRegions?.includes(region);
      }),
    );
    return regions;
  }

  public getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
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

  /**
   * Function to get central endpoint vpc
   * @returns VpcConfig {@link VpcConfig}
   */
  protected getCentralEndpointVpc(): VpcConfig {
    let centralEndpointVpc = undefined;
    const centralEndpointVpcs = this.props.networkConfig.vpcs.filter(
      item =>
        item.interfaceEndpoints?.central &&
        this.props.accountsConfig.getAccountId(item.account) === cdk.Stack.of(this).account &&
        item.region === cdk.Stack.of(this).region,
    );

    if (this.props.partition !== 'aws' && this.props.partition !== 'aws-cn' && centralEndpointVpcs.length > 0) {
      this.logger.error('Central Endpoint VPC is only possible in commercial regions');
      throw new Error(`Configuration validation failed at runtime.`);
    }

    if (centralEndpointVpcs.length > 1) {
      this.logger.error(`multiple (${centralEndpointVpcs.length}) central endpoint vpcs detected, should only be one`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    centralEndpointVpc = centralEndpointVpcs[0];

    return centralEndpointVpc;
  }

  /**
   * Function to get account ids from ShareTarget
   * @param shareTargets
   * @returns
   */
  public getAccountIdsFromShareTarget(shareTargets: ShareTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of shareTargets.organizationalUnits ?? []) {
      this.appendAccountIdsFromAccountConfigs(
        ou,
        [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts],
        accountIds,
      );
    }

    this.appendAccountIdsFromDeploymentTargetAccounts(shareTargets, accountIds);

    return accountIds;
  }

  public isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(cdk.Stack.of(this).region)) {
      this.logger.info(`${cdk.Stack.of(this).region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  public isAccountExcluded(accounts: string[]): boolean {
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
        prefix: lifecycleRule.prefix,
      };
      rules.push(rule);
    }
    return rules;
  }

  /**
   * Returns the SSM parameter path for the given resource type and replacement strings.
   * @see {@link SsmParameterPath} for resource type schema
   *
   * @param resourceType
   * @param replacements
   * @returns
   */
  public getSsmPath(resourceType: SsmResourceType, replacements: string[]) {
    // Prefix applied to all SSM parameters
    // Static for now, but leaving option to modify for future iterations
    const ssmPrefix = this.props.prefixes.ssmParamName;
    return new SsmParameterPath(ssmPrefix, resourceType, replacements).parameterPath;
  }

  /**
   * Function to get list of targets by type organization unit or account for given scp
   * @param targetName
   * @param targetType
   * @returns
   */
  public getScpNamesForTarget(targetName: string, targetType: 'ou' | 'account'): string[] {
    const scps: string[] = [];

    for (const serviceControlPolicy of this.props.organizationConfig.serviceControlPolicies) {
      if (targetType === 'ou' && serviceControlPolicy.deploymentTargets.organizationalUnits) {
        if (serviceControlPolicy.deploymentTargets.organizationalUnits.indexOf(targetName) !== -1) {
          scps.push(serviceControlPolicy.name);
        }
      }
      if (targetType === 'account' && serviceControlPolicy.deploymentTargets.accounts) {
        if (serviceControlPolicy.deploymentTargets.accounts.indexOf(targetName) !== -1) {
          scps.push(serviceControlPolicy.name);
        }
      }
    }
    return scps;
  }

  /**
   * Get the IAM condition context key for the organization.
   * @param organizationId string | undefined
   * @returns
   */
  protected getPrincipalOrgIdCondition(organizationId: string | undefined): PrincipalOrgIdConditionType {
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
  public getOrgPrincipals(organizationId: string | undefined, withPrefixCondition?: boolean): cdk.aws_iam.IPrincipal {
    if (this.props.partition === 'aws-cn' || !this.props.organizationConfig.enable) {
      const accountIds = this.props.accountsConfig.getAccountIds();
      if (accountIds) {
        const principals: cdk.aws_iam.PrincipalBase[] = [];
        accountIds.forEach(accountId => {
          principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
        });
        return withPrefixCondition
          ? new cdk.aws_iam.CompositePrincipal(...principals).withConditions({
              ArnLike: {
                'aws:PrincipalArn': `arn:${this.partition}:iam::*:role/${this.props.prefixes.accelerator}*`,
              },
            })
          : new cdk.aws_iam.CompositePrincipal(...principals);
      }
    }
    if (organizationId) {
      return withPrefixCondition
        ? new cdk.aws_iam.OrganizationPrincipal(organizationId).withConditions({
            ArnLike: {
              'aws:PrincipalArn': `arn:${this.partition}:iam::*:role/${this.props.prefixes.accelerator}*`,
            },
          })
        : new cdk.aws_iam.OrganizationPrincipal(organizationId);
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
   * @param tempFileName
   * @returns
   */
  public generatePolicyReplacements(
    policyPath: string,
    returnTempPath: boolean,
    organizationId?: string,
    tempFileName?: string,
    parameters?: { [key: string]: string | string[] },
  ): string {
    // Transform policy document
    let policyContent: string = fs.readFileSync(policyPath, 'utf8');
    const acceleratorPrefix = this.props.prefixes.accelerator;
    const acceleratorPrefixNoDash = acceleratorPrefix.endsWith('-')
      ? acceleratorPrefix.slice(0, -1)
      : acceleratorPrefix;

    const additionalReplacements: { [key: string]: string | string[] } = {
      '\\${ACCELERATOR_DEFAULT_PREFIX_SHORTHAND}': acceleratorPrefix.substring(0, 4).toUpperCase(),
      '\\${ACCELERATOR_PREFIX_ND}': acceleratorPrefixNoDash,
      '\\${ACCELERATOR_PREFIX_LND}': acceleratorPrefixNoDash.toLowerCase(),
      '\\${ACCELERATOR_SSM_PREFIX}': this.props.prefixes.ssmParamName,
      '\\${ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME}': this.centralLogsBucketName,
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

    const policyParams: { [key: string]: string | string[] } = {
      ...this.props.replacementsConfig.placeholders,
      ...parameters,
    };

    for (const key of Object.keys(policyParams)) {
      additionalReplacements[`\\\${${ReplacementsConfig.POLICY_PARAMETER_PREFIX}:${key}}`] = policyParams[key];
    }

    policyContent = policyReplacements({
      content: policyContent,
      acceleratorPrefix,
      managementAccountAccessRole: this.props.globalConfig.managementAccountAccessRole,
      partition: this.props.partition,
      additionalReplacements,
      acceleratorName: this.props.globalConfig.externalLandingZoneResources?.acceleratorName || 'lza',
      networkConfig: this.props.networkConfig,
      accountsConfig: this.props.accountsConfig,
    });

    // Validate and remove all unnecessary spaces in JSON string
    policyContent = JSON.stringify(JSON.parse(policyContent));
    if (returnTempPath) {
      return this.createTempFile(policyContent, tempFileName);
    } else {
      return policyContent;
    }
  }

  /**
   * Create a temp file of a transformed policy document
   * @param policyContent
   * @param tempFileName
   * @returns
   */
  private createTempFile(policyContent: string, tempFileName?: string): string {
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
    const tempPath = path.join(tempDir, tempFileName ?? `${uuidv4()}.json`);

    // Write transformed file
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    fs.writeFileSync(tempPath, policyContent, 'utf-8');

    return tempPath;
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
    let ebsEncryptionKey: cdk.aws_kms.IKey;
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
          `${this.props.prefixes.ssmParamName}/kms/${this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey}/key-arn`,
        ),
      );
    } else {
      // user set encryption as true and has default ebs encryption enabled
      // no kms key is provided
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}-${device.ebs!.kmsKeyId}`),
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `${this.props.prefixes.ssmParamName}/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        ),
      );
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
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `${this.props.prefixes.ssmParamName}/kms/${device.ebs!.kmsKeyId}/key-arn`,
      ),
    );
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

  /**
   * Public accessor method to add SSM parameters
   * @param props
   */
  public addSsmParameter(props: { logicalId: string; parameterName: string; stringValue: string }) {
    this.ssmParameters.push({
      logicalId: props.logicalId,
      parameterName: props.parameterName,
      stringValue: props.stringValue,
    });
  }

  /**
   * Helper function to verify if resource managed by ASEA or not by looking in resource mapping
   * Can be replaced with LZA Configuration check. Not using configuration check to avoid errors/mistakes in configuration by user
   *
   * @param resourceType
   * @param resourceIdentifier
   * @returns
   */
  public isManagedByAsea(resourceType: string, resourceIdentifier: string): boolean {
    if (!this.props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) return false;
    const aseaResourceList = this.props.globalConfig.externalLandingZoneResources.resourceList;
    return !!aseaResourceList.find(
      r =>
        r.accountId === cdk.Stack.of(this).account &&
        r.region === cdk.Stack.of(this).region &&
        r.resourceType === resourceType &&
        r.resourceIdentifier === resourceIdentifier,
    );
  }

  public getExternalResourceParameter(name: string) {
    if (!this.externalResourceParameters) throw new Error(`No ssm parameter "${name}" found in account and region`);
    return this.externalResourceParameters[name];
  }

  public addNagSuppression(nagSuppression: NagSuppressionDetailType) {
    this.nagSuppressionInputs.push(nagSuppression);
  }
}

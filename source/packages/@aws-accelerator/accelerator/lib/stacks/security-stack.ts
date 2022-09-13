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
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { Region } from '@aws-accelerator/config';
import {
  CentralLogsBucket,
  EbsDefaultEncryption,
  GuardDutyPublishingDestination,
  KeyLookup,
  MacieExportConfigClassification,
  PasswordPolicy,
  SecurityHubStandards,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { pascalCase } from 'pascal-case';

/**
 * Security Stack, configures local account security services
 */
export class SecurityStack extends AcceleratorStack {
  readonly cloudwatchKey: cdk.aws_kms.Key;
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;
  readonly auditAccountName: string;
  readonly centralLogsBucketName: string;
  readonly centralLogsBucketKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.auditAccountName = props.securityConfig.getDelegatedAccountName();
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();
    this.centralLogsBucketName = `${
      AcceleratorStack.ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.globalConfig.homeRegion}`;

    this.centralLogsBucketKey = new KeyLookup(this, 'CentralLogsBucketKey', {
      accountId: props.accountsConfig.getLogArchiveAccountId(),
      keyRegion: props.globalConfig.homeRegion,
      roleName: CentralLogsBucket.CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME,
      keyArnParameterName: CentralLogsBucket.KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    //
    // MacieSession configuration
    //
    this.configureMacie();

    //
    // GuardDuty configuration
    //
    this.configureGuardDuty();

    //
    // SecurityHub configuration
    //
    this.configureSecurityHub();

    //
    // Ebs Default Volume Encryption configuration
    //
    this.configureDefaultEbsEncryption();

    //
    // Update IAM Password Policy
    //
    this.updateIamPasswordPolicy();

    Logger.info('[security-stack] Completed stack synthesis');
  }

  /**
   * Function to configure Macie
   */
  private configureMacie() {
    if (
      this.props.securityConfig.centralSecurityServices.macie.enable &&
      this.props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          bucketName: this.centralLogsBucketName,
          bucketKmsKey: this.centralLogsBucketKey,
          logKmsKey: this.cloudwatchKey,
          keyPrefix: `macie/${cdk.Stack.of(this).account}/`,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`Macie audit delegated admin account name "${this.auditAccountName}" not found.`);
      }
    }
  }

  /**
   * Function to configure GuardDuty
   */
  private configureGuardDuty() {
    if (
      this.props.securityConfig.centralSecurityServices.guardduty.enable &&
      this.props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
        if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
          new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
            exportDestinationType:
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
            destinationArn: `arn:${cdk.Stack.of(this).partition}:s3:::${this.centralLogsBucketName}`,
            destinationKmsKey: this.centralLogsBucketKey,
            logKmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        } else {
          throw new Error(`Guardduty audit delegated admin account name "${this.auditAccountName}" not found.`);
        }
      }
    }
  }

  /**
   * Function to configure SecurityHub
   */
  private configureSecurityHub() {
    if (
      this.props.securityConfig.centralSecurityServices.securityHub.enable &&
      this.props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
        new SecurityHubStandards(this, 'SecurityHubStandards', {
          standards: this.props.securityConfig.centralSecurityServices.securityHub.standards,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`SecurityHub audit delegated admin account name "${this.auditAccountName}" not found.`);
      }
    }
  }

  /**
   * Function to configure default EBS encryption
   */
  private configureDefaultEbsEncryption() {
    if (
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      let ebsEncryptionKey: cdk.aws_kms.Key;

      if (this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) {
        ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
          this,
          pascalCase(this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) + `-KmsKey`,
          cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/kms/${this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey}/key-arn`,
          ),
        ) as cdk.aws_kms.Key;
      } else {
        ebsEncryptionKey = new cdk.aws_kms.Key(this, 'EbsEncryptionKey', {
          alias: AcceleratorStack.ACCELERATOR_EBS_DEFAULT_KEY_ALIAS,
          description: AcceleratorStack.ACCELERATOR_EBS_DEFAULT_KEY_DESCRIPTION,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          enableKeyRotation: true,
        });
        ebsEncryptionKey.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow service-linked role use',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
            principals: [
              new cdk.aws_iam.ArnPrincipal(
                `arn:${cdk.Stack.of(this).partition}:iam::${
                  cdk.Stack.of(this).account
                }:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
              ),
            ],
            resources: ['*'],
          }),
        );
        ebsEncryptionKey.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow Autoscaling to create grant',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['kms:CreateGrant'],
            principals: [
              new cdk.aws_iam.ArnPrincipal(
                `arn:${cdk.Stack.of(this).partition}:iam::${
                  cdk.Stack.of(this).account
                }:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
              ),
            ],
            resources: ['*'],
            conditions: { Bool: { 'kms:GrantIsForAWSResource': 'true' } },
          }),
        );
      }
      new EbsDefaultEncryption(this, 'EbsDefaultVolumeEncryption', {
        ebsEncryptionKmsKey: ebsEncryptionKey,
        logGroupKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      new cdk.aws_ssm.StringParameter(this, 'EbsDefaultVolumeEncryptionParameter', {
        parameterName: `/accelerator/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        stringValue: ebsEncryptionKey.keyArn,
      });
    }
  }

  /**
   * Function to update IAM password policy
   */
  private updateIamPasswordPolicy() {
    if (this.props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info(`[security-stack] Setting the IAM Password policy`);
      new PasswordPolicy(this, 'IamPasswordPolicy', {
        ...this.props.securityConfig.iamPasswordPolicy,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }
  }
}

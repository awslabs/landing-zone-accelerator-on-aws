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
  EbsDefaultEncryption,
  GuardDutyPublishingDestination,
  KeyLookup,
  MacieExportConfigClassification,
  PasswordPolicy,
  SecurityHubStandards,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

/**
 * Security Stack, configures local account security services
 */
export class SecurityStack extends AcceleratorStack {
  readonly acceleratorKey: cdk.aws_kms.Key;
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const auditAccountName = props.securityConfig.getDelegatedAccountName();
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();

    this.acceleratorKey = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    //
    // MacieSession configuration
    //
    this.configureMacie(props, auditAccountName);

    //
    // GuardDuty configuration
    //
    this.configureGuardDuty(props, auditAccountName);

    //
    // SecurityHub configuration
    //
    this.configureSecurityHub(props, auditAccountName);

    //
    // Ebs Default Volume Encryption configuration
    //
    this.configureDefaultEbsEncryption(props);

    //
    // Update IAM Password Policy
    //
    this.updateIamPasswordPolicy(props);

    Logger.info('[security-stack] Completed stack synthesis');
  }

  /**
   * Function to configure Macie
   * @param props
   * @param auditAccountName
   */
  private configureMacie(props: AcceleratorStackProps, auditAccountName: string) {
    if (
      props.securityConfig.centralSecurityServices.macie.enable &&
      props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        const bucketName = `aws-accelerator-org-macie-disc-repo-${this.auditAccountId}-${cdk.Aws.REGION}`;

        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          bucketName: bucketName,
          kmsKey: this.acceleratorKey,
          keyPrefix: `${cdk.Stack.of(this).account}-aws-macie-export-config`,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`Macie audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }
  }

  /**
   * Function to configure GuardDuty
   * @param props
   * @param auditAccountName
   */
  private configureGuardDuty(props: AcceleratorStackProps, auditAccountName: string) {
    if (
      props.securityConfig.centralSecurityServices.guardduty.enable &&
      props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        const bucketArn = `arn:${cdk.Stack.of(this).partition}:s3:::aws-accelerator-org-gduty-pub-dest-${
          this.auditAccountId
        }-${cdk.Stack.of(this).region}`;

        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          exportDestinationType:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
          bucketArn: bucketArn,
          kmsKey: this.acceleratorKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`Guardduty audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }
  }

  /**
   * Function to configure SecurityHub
   * @param props
   * @param auditAccountName
   */
  private configureSecurityHub(props: AcceleratorStackProps, auditAccountName: string) {
    if (
      props.securityConfig.centralSecurityServices.securityHub.enable &&
      props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        new SecurityHubStandards(this, 'SecurityHubStandards', {
          standards: props.securityConfig.centralSecurityServices.securityHub.standards,
          kmsKey: this.acceleratorKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`SecurityHub audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }
  }

  /**
   * Function to configure default EBS encryption
   * @param props
   */
  private configureDefaultEbsEncryption(props: AcceleratorStackProps) {
    if (
      props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      const ebsEncryptionKey = new cdk.aws_kms.Key(this, 'EbsEncryptionKey', {
        enableKeyRotation: true,
        description: 'EBS Volume Encryption',
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
      new EbsDefaultEncryption(this, 'EbsDefaultVolumeEncryption', {
        ebsEncryptionKmsKey: ebsEncryptionKey,
        logGroupKmsKey: this.acceleratorKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });

      new cdk.aws_ssm.StringParameter(this, 'EbsDefaultVolumeEncryptionParameter', {
        parameterName: `/accelerator/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        stringValue: ebsEncryptionKey.keyArn,
      });
    }
  }

  /**
   * Function to update IAM password policy
   * @param props
   */
  private updateIamPasswordPolicy(props: AcceleratorStackProps) {
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info(`[security-stack] Setting the IAM Password policy`);
      new PasswordPolicy(this, 'IamPasswordPolicy', {
        ...props.securityConfig.iamPasswordPolicy,
        kmsKey: this.acceleratorKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }
  }
}

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
import { NagSuppressions } from 'cdk-nag';

import { Region } from '@aws-accelerator/config';
import {
  AcceleratorMetadata,
  EbsDefaultEncryption,
  GuardDutyPublishingDestination,
  KeyLookup,
  MacieExportConfigClassification,
  PasswordPolicy,
  SecurityHubStandards,
  ConfigAggregation,
} from '@aws-accelerator/constructs';

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
  readonly configAggregationAccountId: string;
  readonly metadataRule: AcceleratorMetadata | undefined;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    const elbLogBucketName = `${
      this.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`;
    this.auditAccountName = props.securityConfig.getDelegatedAccountName();
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();
    this.configAggregationAccountId = props.accountsConfig.getManagementAccountId();
    if (
      props.securityConfig.awsConfig.aggregation?.enable &&
      props.securityConfig.awsConfig.aggregation.delegatedAdminAccount
    ) {
      this.configAggregationAccountId = props.accountsConfig.getAccountId(
        props.securityConfig.awsConfig.aggregation.delegatedAdminAccount,
      );
    }
    this.centralLogsBucketName = `${
      this.acceleratorResourceNames.bucketPrefixes.centralLogs
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`;

    this.centralLogsBucketKey = new KeyLookup(this, 'CentralLogsBucketKey', {
      accountId: props.accountsConfig.getLogArchiveAccountId(),
      keyRegion: props.centralizedLoggingRegion,
      roleName: this.acceleratorResourceNames.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess,
      keyArnParameterName: this.acceleratorResourceNames.parameters.centralLogBucketCmkArn,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      acceleratorPrefix: props.prefixes.accelerator,
    }).getKey();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
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
    //
    // Create Accelerator Metadata Rule
    //

    this.metadataRule = this.acceleratorMetadataRule(
      props,
      this.centralLogsBucketName,
      elbLogBucketName,
      this.cloudwatchKey,
    );

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    if (
      this.props.securityConfig.awsConfig.aggregation?.enable &&
      this.configAggregationAccountId === cdk.Stack.of(this).account
    ) {
      this.enableConfigAggregation();
    }

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to configure Macie
   */
  private configureMacie() {
    if (
      this.props.securityConfig.centralSecurityServices.macie.enable &&
      this.props.securityConfig.centralSecurityServices.macie.excludeRegions.indexOf(
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
        this.logger.error(`Macie audit delegated admin account name "${this.auditAccountName}" not found.`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }
  }

  /**
   * Function to configure GuardDuty
   */
  private configureGuardDuty() {
    if (
      this.props.securityConfig.centralSecurityServices.guardduty.enable &&
      this.props.securityConfig.centralSecurityServices.guardduty.excludeRegions.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
        if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
          new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
            exportDestinationType:
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
            exportDestinationOverride:
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideExisting ?? false,
            destinationArn: `arn:${cdk.Stack.of(this).partition}:s3:::${this.centralLogsBucketName}/guardduty`,
            destinationKmsKey: this.centralLogsBucketKey,
            logKmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        } else {
          this.logger.error(`Guardduty audit delegated admin account name "${this.auditAccountName}" not found.`);
          throw new Error(`Configuration validation failed at runtime.`);
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
      this.props.securityConfig.centralSecurityServices.securityHub.excludeRegions.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (this.props.accountsConfig.containsAccount(this.auditAccountName)) {
        const standards: { name: string; enable: boolean; controlsToDisable: string[] }[] = [];
        for (const standard of this.props.securityConfig.centralSecurityServices.securityHub.standards) {
          if (standard.deploymentTargets) {
            if (!this.isIncluded(standard.deploymentTargets)) {
              this.logger.info(`Item excluded`);
              continue;
            }
          }
          // add to standards list
          standards.push({
            name: standard.name,
            enable: standard.enable,
            controlsToDisable: standard.controlsToDisable,
          });
        }
        if (standards.length > 0) {
          new SecurityHubStandards(this, 'SecurityHubStandards', {
            standards,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      } else {
        this.logger.error(`SecurityHub audit delegated admin account name "${this.auditAccountName}" not found.`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }
  }

  /**
   * Function to configure default EBS encryption
   */
  private configureDefaultEbsEncryption() {
    if (
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.excludeRegions.indexOf(
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
            `${this.props.prefixes.ssmParamName}/kms/${this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey}/key-arn`,
          ),
        ) as cdk.aws_kms.Key;
      } else {
        ebsEncryptionKey = new cdk.aws_kms.Key(this, 'EbsEncryptionKey', {
          alias: this.acceleratorResourceNames.customerManagedKeys.ebsDefault.alias,
          description: this.acceleratorResourceNames.customerManagedKeys.ebsDefault.description,
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
        ebsEncryptionKey.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Account Access',
            effect: cdk.aws_iam.Effect.ALLOW,
            principals: [new cdk.aws_iam.AccountPrincipal(cdk.Stack.of(this).account)],
            actions: ['kms:*'],
            resources: ['*'],
          }),
        );
        ebsEncryptionKey.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'ec2',
            effect: cdk.aws_iam.Effect.ALLOW,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:CallerAccount': cdk.Stack.of(this).account,
                'kms:ViaService': `ec2.${cdk.Stack.of(this).region}.${cdk.Aws.URL_SUFFIX}`,
              },
            },
          }),
        );
        if (this.props.partition === 'aws') {
          ebsEncryptionKey.addToResourcePolicy(
            new iam.PolicyStatement({
              sid: 'Allow cloud9 service-linked role use',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
              principals: [
                new cdk.aws_iam.ArnPrincipal(
                  `arn:${cdk.Stack.of(this).partition}:iam::${
                    cdk.Stack.of(this).account
                  }:role/aws-service-role/cloud9.amazonaws.com/AWSServiceRoleForAWSCloud9`,
                ),
              ],
              resources: ['*'],
            }),
          );
          ebsEncryptionKey.addToResourcePolicy(
            new iam.PolicyStatement({
              sid: 'Allow cloud9 attachment of persistent resources',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['kms:CreateGrant', 'kms:ListGrants', 'kms:RevokeGrant'],
              principals: [
                new cdk.aws_iam.ArnPrincipal(
                  `arn:${cdk.Stack.of(this).partition}:iam::${
                    cdk.Stack.of(this).account
                  }:role/aws-service-role/cloud9.amazonaws.com/AWSServiceRoleForAWSCloud9`,
                ),
              ],
              resources: ['*'],
              conditions: { Bool: { 'kms:GrantIsForAWSResource': 'true' } },
            }),
          );
        }
      }
      new EbsDefaultEncryption(this, 'EbsDefaultVolumeEncryption', {
        ebsEncryptionKmsKey: ebsEncryptionKey,
        logGroupKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      this.ssmParameters.push({
        logicalId: 'EbsDefaultVolumeEncryptionParameter',
        parameterName: `${this.props.prefixes.ssmParamName}/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        stringValue: ebsEncryptionKey.keyArn,
      });
    }
  }

  /**
   * Function to update IAM password policy
   */
  private updateIamPasswordPolicy() {
    if (this.props.enableSingleAccountMode) {
      return;
    } else {
      if (this.props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
        this.logger.info(`Setting the IAM Password policy`);
        new PasswordPolicy(this, 'IamPasswordPolicy', {
          ...this.props.securityConfig.iamPasswordPolicy,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Function to config aggregator
   */
  private enableConfigAggregation() {
    this.logger.info('Enabling Config Aggregation');
    new ConfigAggregation(this, 'EnableConfigAggregation', {
      acceleratorPrefix: this.props.prefixes.accelerator,
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/EnableConfigAggregation/ConfigAggregatorRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Config managed role required.',
        },
      ],
    );
  }

  private acceleratorMetadataRule(
    acceleratorProps: AcceleratorStackProps,
    centralLogBucketName: string,
    elbLogBucketName: string,
    cloudwatchKmsKey: cdk.aws_kms.Key,
  ): AcceleratorMetadata | undefined {
    const isManagementAccountAndHomeRegion =
      cdk.Stack.of(this).account === acceleratorProps.accountsConfig.getManagementAccountId() &&
      cdk.Stack.of(this).region === acceleratorProps.globalConfig.homeRegion;
    // if accelerator metadata is not defined in config then return
    if (!acceleratorProps.globalConfig.acceleratorMetadata) {
      return;
    }
    // if the stack is not in management account and home region then return
    if (!isManagementAccountAndHomeRegion) {
      return;
    }
    const metadataLogBucketName = `${
      this.acceleratorResourceNames.bucketPrefixes.metadata
    }-${this.props.accountsConfig.getAccountId(acceleratorProps.globalConfig.acceleratorMetadata?.account)}-${
      this.props.globalConfig.homeRegion
    }`;

    return new AcceleratorMetadata(this, 'AcceleratorMetadata', {
      acceleratorConfigRepositoryName: acceleratorProps.configRepositoryName,
      acceleratorPrefix: this.props.prefixes.accelerator,
      acceleratorSsmParamPrefix: this.props.prefixes.ssmParamName,
      assumeRole: acceleratorProps.globalConfig.managementAccountAccessRole,
      centralLogBucketName,
      elbLogBucketName,
      cloudwatchKmsKey,
      loggingAccountId: acceleratorProps.accountsConfig.getAccountId(
        acceleratorProps.globalConfig.acceleratorMetadata.account,
      ),
      logRetentionInDays: acceleratorProps.globalConfig.cloudwatchLogRetentionInDays,
      metadataLogBucketName: metadataLogBucketName,
      organizationId: this.organizationId ?? '',
      globalRegion: acceleratorProps.globalRegion,
    });
  }
}

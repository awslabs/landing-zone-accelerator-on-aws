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

import { EbsDefaultVolumeEncryptionConfig, Region } from '@aws-accelerator/config';
import {
  AcceleratorMetadata,
  EbsDefaultEncryption,
  GuardDutyPublishingDestination,
  MacieExportConfigClassification,
  PasswordPolicy,
  SecurityHubStandards,
  ConfigAggregation,
} from '@aws-accelerator/constructs';

import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  NagSuppressionRuleIds,
} from './accelerator-stack';
import { pascalCase } from 'pascal-case';

/**
 * Security Stack, configures local account security services
 */
export class SecurityStack extends AcceleratorStack {
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;
  readonly auditAccountName: string;
  readonly centralLogsBucketKey: cdk.aws_kms.IKey;
  readonly configAggregationAccountId: string;
  readonly cloudwatchKey?: cdk.aws_kms.IKey;
  readonly metadataRule: AcceleratorMetadata | undefined;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    const elbLogBucketName = this.getElbLogsBucketName();
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
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.centralLogsBucketKey = this.getCentralLogsBucketKey(this.cloudwatchKey);

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
    this.configureDefaultEbsEncryption(props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption);

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

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Validate Delegated Admin Account name for the given security service is part of account config
   * @param securityServiceName string
   */
  private validateDelegatedAdminAccountName(securityServiceName: string) {
    if (!this.props.accountsConfig.containsAccount(this.auditAccountName)) {
      this.logger.error(
        `${securityServiceName} audit delegated admin account name "${this.auditAccountName}" not found.`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
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
      // Validate Delegated Admin Account name is part of account config
      this.validateDelegatedAdminAccountName('Macie');

      new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
        bucketName: this.centralLogsBucketName,
        bucketKmsKey: this.centralLogsBucketKey,
        logKmsKey: this.cloudwatchKey,
        keyPrefix: `macie/${cdk.Stack.of(this).account}/`,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
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
      if (this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.enable) {
        // Validate Delegated Admin Account name is part of account config
        this.validateDelegatedAdminAccountName('Guardduty');
        let destinationPrefix = 'guardduty';
        if (
          this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
            ?.useCustomPrefix
        ) {
          destinationPrefix =
            this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
              ?.customOverride ?? '';
        }

        const destinationArn = `arn:${cdk.Stack.of(this).partition}:s3:::${
          this.centralLogsBucketName
        }/${destinationPrefix}`;

        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          exportDestinationType:
            this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
          exportDestinationOverride:
            this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideExisting ?? false,
          destinationArn: destinationArn,
          destinationKmsKey: this.centralLogsBucketKey,
          logKmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Function to initialize SecurityHub standards
   * @returns
   */
  private initializeSecurityHubStandards(): { name: string; enable: boolean; controlsToDisable: string[] }[] {
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

    return standards;
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
      // Validate Delegated Admin Account name is part of account config
      this.validateDelegatedAdminAccountName('SecurityHub');

      const standards = this.initializeSecurityHubStandards();

      if (standards.length > 0) {
        new SecurityHubStandards(this, 'SecurityHubStandards', {
          standards,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Function to configure default EBS encryption
   * @param ebsEncryptionConfig EbsDefaultVolumeEncryptionConfig
   */
  private configureDefaultEbsEncryption(ebsEncryptionConfig: EbsDefaultVolumeEncryptionConfig) {
    if (ebsEncryptionConfig.enable && this.deployEbsEncryption(ebsEncryptionConfig)) {
      new EbsDefaultEncryption(this, 'EbsDefaultVolumeEncryption', {
        ebsEncryptionKmsKey: this.getOrCreateEbsEncryptionKey(ebsEncryptionConfig),
        logGroupKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }
  }

  /**
   * Determines if EBS default volume encryption should be deployed to
   * this stack's account/region
   * @param ebsEncryptionConfig EbsDefaultVolumeEncryptionConfig
   * @returns boolean
   */
  private deployEbsEncryption(ebsEncryptionConfig: EbsDefaultVolumeEncryptionConfig): boolean {
    if (ebsEncryptionConfig.excludeRegions) {
      return ebsEncryptionConfig.excludeRegions.indexOf(this.region) === -1;
    } else {
      return ebsEncryptionConfig.deploymentTargets ? this.isIncluded(ebsEncryptionConfig.deploymentTargets) : true;
    }
  }

  /**
   * Get custom key or create LZA-managed KMS key
   * @param ebsEncryptionConfig EbsDefaultVolumeEncryptionConfig
   * @returns cdk.aws_kms.IKey
   */
  private getOrCreateEbsEncryptionKey(ebsEncryptionConfig: EbsDefaultVolumeEncryptionConfig): cdk.aws_kms.IKey {
    let ebsEncryptionKey: cdk.aws_kms.IKey;

    if (ebsEncryptionConfig.kmsKey) {
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(ebsEncryptionConfig.kmsKey) + `-KmsKey`,
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `${this.props.prefixes.ssmParamName}/kms/${ebsEncryptionConfig.kmsKey}/key-arn`,
        ),
      );
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
    this.ssmParameters.push({
      logicalId: 'EbsDefaultVolumeEncryptionParameter',
      parameterName: `${this.props.prefixes.ssmParamName}/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
      stringValue: ebsEncryptionKey.keyArn,
    });

    return ebsEncryptionKey;
  }

  /**
   * Function to update IAM password policy
   */
  private updateIamPasswordPolicy() {
    if (this.props.enableSingleAccountMode || this.props.useExistingRoles) {
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
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/EnableConfigAggregation/ConfigAggregatorRole/Resource`,
          reason: 'AWS Config managed role required.',
        },
      ],
    });
  }

  private acceleratorMetadataRule(
    acceleratorProps: AcceleratorStackProps,
    centralLogBucketName: string,
    elbLogBucketName: string,
    cloudwatchKmsKey?: cdk.aws_kms.IKey,
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

/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Region } from '@aws-accelerator/config';
import {
  GuardDutyPublishingDestination,
  MacieExportConfigClassification,
  SecurityHubStandards,
  PasswordPolicy,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import * as config from 'aws-cdk-lib/aws-config';
import * as iam from 'aws-cdk-lib/aws-iam';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { Logger } from '../logger';

/**
 * Security Stack, configures local account security services
 */
export class SecurityStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    //
    // MacieSession configuration
    //
    if (
      props.securityConfig.centralSecurityServices.macie.enable &&
      props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          region: cdk.Stack.of(this).region,
          S3keyPrefix: 'aws-macie-export-config',
        });
      } else {
        throw new Error(`Macie audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // GuardDuty configuration
    //
    if (
      props.securityConfig.centralSecurityServices.guardduty.enable &&
      props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          region: cdk.Stack.of(this).region,
          exportDestinationType:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
        });
      } else {
        throw new Error(`Guardduty audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // SecurityHub configuration
    //
    if (
      props.securityConfig.centralSecurityServices.securityHub.enable &&
      props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        new SecurityHubStandards(this, 'SecurityHubStandards', {
          region: cdk.Stack.of(this).region,
          standards: props.securityConfig.centralSecurityServices.securityHub.standards,
        });
      } else {
        throw new Error(`SecurityHub audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // AWS Config - Set up recorder and delivery channel, only if Control Tower
    // is not being used. Else the Control Tower SCP will block these calls from
    // member accounts
    //
    // If Control Tower is enabled, make sure to set up AWS Config in the
    // management account since this is not enabled by default by Control Tower.
    //
    // An AWS Control Tower preventive guardrail is enforced with AWS
    // Organizations using Service Control Policies (SCPs) that disallows
    // configuration changes to AWS Config.
    //
    let configRecorder: config.CfnConfigurationRecorder | undefined = undefined;
    if (
      !props.globalConfig.controlTower.enable ||
      props.accountsConfig.getManagementAccountId() === cdk.Stack.of(this).account
    ) {
      if (props.securityConfig.awsConfig.enableConfigurationRecorder) {
        const configRecorderRole = new iam.Role(this, 'ConfigRecorderRole', {
          assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
          managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRole')],
        });

        /**
         * As per the documentation, the config role should have
         * the s3:PutObject permission to avoid access denied issues
         * while AWS config tries to check the s3 bucket (in another account) write permissions
         * https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy.html
         *
         */
        configRecorderRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: ['*'],
          }),
        );

        configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
          roleArn: configRecorderRole.roleArn,
          recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: true,
          },
        });
      }

      if (props.securityConfig.awsConfig.enableDeliveryChannel) {
        new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
          s3BucketName: `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
            props.globalConfig.homeRegion
          }`,
          configSnapshotDeliveryProperties: {
            deliveryFrequency: 'One_Hour',
          },
        });
      }
    }

    //
    // Config Rules
    //
    Logger.info('[security-stack] Evaluating AWS Config rule sets');
    for (const ruleSet of props.securityConfig.awsConfig.ruleSets) {
      if (!this.isIncluded(ruleSet.deploymentTargets)) {
        Logger.info('[security-stack] Item excluded');
        continue;
      }

      Logger.info(
        `[security-stack] Account (${cdk.Stack.of(this).account}) should be included, deploying AWS Config Rules`,
      );

      for (const rule of ruleSet.rules) {
        Logger.info(`[security-stack] Creating managed rule ${rule.name}`);

        const resourceTypes: config.ResourceType[] = [];
        for (const resourceType of rule.complianceResourceTypes ?? []) {
          resourceTypes.push(config.ResourceType.of(resourceType));
        }

        const configRule = new config.ManagedRule(this, pascalCase(rule.name), {
          configRuleName: rule.name,
          identifier: rule.identifier,
          inputParameters: rule.inputParameters,
          ruleScope: {
            resourceTypes,
          },
        });

        if (configRecorder) {
          configRule.node.addDependency(configRecorder);
        }
      }
    }

    //
    // Update IAM Password Policy
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info(`[security-stack] Setting the IAM Password policy`);
      new PasswordPolicy(this, 'IamPasswordPolicy', {
        ...props.securityConfig.centralSecurityServices.iamPasswordPolicy,
      });
    }
  }
}

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

import { AccountsConfig, GlobalConfig, SecurityConfig } from '@aws-accelerator/config';
import {
  GuardDutyPublishingDestination,
  MacieExportConfigClassification,
  MacieSession,
  SecurityHubStandards,
} from '@aws-accelerator/constructs';
import * as config from '@aws-cdk/aws-config';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';

/**
 * SecurityStackProps
 */
export interface SecurityStackProps extends cdk.StackProps {
  accountIds: { [name: string]: string };
  accountsConfig: AccountsConfig;
  globalConfig: GlobalConfig;
  securityConfig: SecurityConfig;
}

/**
 * Organizational Security Stack, depends on Organizations and Security-Audit Stack
 */
export class SecurityStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // MacieSession configuration
    if (
      props.securityConfig.centralSecurityServices.macie.enable &&
      props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(cdk.Stack.of(this).region) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.accountExists(auditAccountName)) {
        // TODO check later if enable is required, because add members would od this
        const macieSession = new MacieSession(this, 'MacieSession', {
          region: cdk.Stack.of(this).region,
          findingPublishingFrequency:
            props.securityConfig.centralSecurityServices.macie.policyFindingsPublishingFrequency,
          isSensitiveSh: props.securityConfig.centralSecurityServices.macie.publishSensitiveDataFindings,
        });
        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          region: cdk.Stack.of(this).region,
          S3keyPrefix: 'aws-macie-export-config',
        }).node.addDependency(macieSession);
      } else {
        throw new Error(`Macie audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //GuardDuty configuration
    if (
      props.securityConfig.centralSecurityServices.guardduty.enable &&
      props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(cdk.Stack.of(this).region) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.accountExists(auditAccountName)) {
        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          region: cdk.Stack.of(this).region,
          exportDestinationType:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
        });
      } else {
        throw new Error(`Guardduty audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //SecurityHub configuration
    if (
      props.securityConfig.centralSecurityServices.securityHub.enable &&
      props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(cdk.Stack.of(this).region) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.accountExists(auditAccountName)) {
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
      props.accountIds[props.accountsConfig.mandatoryAccounts.management.email] === cdk.Stack.of(this).account
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
          s3BucketName: `aws-accelerator-central-logs-${
            props.accountIds[props.accountsConfig.mandatoryAccounts.logArchive.email]
          }-${props.globalConfig.homeRegion}`,
          configSnapshotDeliveryProperties: {
            deliveryFrequency: 'One_Hour',
          },
        });
      }
    }

    console.log('security-stack: AWS Config');
    for (const ruleSet of props.securityConfig.awsConfig.ruleSets) {
      //
      // Region exclusion check
      // TODO: Move this to a util function
      //
      if (ruleSet.excludeRegions?.includes(cdk.Stack.of(this).region)) {
        console.log(`security-stack: ${cdk.Stack.of(this).region} region excluded`);
        continue;
      }

      //
      // Account exclusion check
      // TODO: Move this to a util function
      //
      let excludeAccount = false;
      for (const account in ruleSet.excludeAccounts) {
        const email = props.accountsConfig.getEmail(account);
        if (cdk.Stack.of(this).account === props.accountIds[email]) {
          console.log(`security-stack: ${account} account excluded`);
          excludeAccount = true;
          break;
        }
      }
      if (excludeAccount) {
        continue;
      }

      let includeAccount = false;

      //
      // Check Accounts List
      //
      for (const account in ruleSet.accounts) {
        const email = props.accountsConfig.getEmail(account);
        if (cdk.Stack.of(this).account === props.accountIds[email]) {
          includeAccount = true;
          break;
        }
      }

      //
      // Check OU List
      //
      for (const ou of Object.values(ruleSet.organizationalUnits ?? [])) {
        console.log(`security-stack: Checking ${ou}`);
        if (ou === 'root-ou') {
          includeAccount = true;
          break;
        }
      }

      if (includeAccount) {
        console.log(
          `security-stack: Account (${cdk.Stack.of(this).account}) should be included, deploying AWS Config Rules`,
        );

        for (const rule of ruleSet.rules) {
          console.log(`security-stack: Creating managed rule ${rule.identifier}`);

          const resourceTypes: config.ResourceType[] = [];
          for (const resourceType of Object.values(rule['compliance-resource-types'] ?? [])) {
            resourceTypes.push(config.ResourceType.of(resourceType));
          }

          const configRule = new config.ManagedRule(this, pascalCase(rule.identifier), {
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
    }
  }
}

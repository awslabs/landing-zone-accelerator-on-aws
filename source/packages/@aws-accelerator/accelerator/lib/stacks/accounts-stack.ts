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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MoveAccountRule, OptInRegions } from '@aws-accelerator/constructs';
import { AcceleratorStack, AcceleratorStackProps, NagSuppressionRuleIds } from './accelerator-stack';
import { ScpResource } from '../resources/scp-resource';
import { KmsKeyResource } from '../resources/kms-key-resource';

export interface AccountsStackProps extends AcceleratorStackProps {
  readonly configDirPath: string;
}

export class AccountsStack extends AcceleratorStack {
  private keyResource: KmsKeyResource;

  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    this.keyResource = new KmsKeyResource(this, props);

    if (props.globalConfig.enableOptInRegions) {
      this.enableOptInRegions(props);
    }

    //
    // Create MoveAccountRule
    //
    this.createMoveAccountRule(props);

    //
    // Global Organizations actions
    //
    if (props.globalRegion === cdk.Stack.of(this).region) {
      //
      // Create and attach scps
      //
      const scpResource = new ScpResource(this, this.keyResource.cloudwatchKey, this.keyResource.lambdaKey, props);
      const scpItems = scpResource.createAndAttachScps(props);

      //
      // Create Access Analyzer Service Linked Role
      //
      this.createAccessAnalyzerServiceLinkedRole({
        cloudwatch: this.keyResource.cloudwatchKey,
        lambda: this.keyResource.lambdaKey,
      });

      //
      // Create Config Service Linked Role
      //
      this.createConfigServiceLinkedRole({
        cloudwatch: this.keyResource.cloudwatchKey,
        lambda: this.keyResource.lambdaKey,
      });

      //
      // Create Access GuardDuty Service Linked Role
      //
      this.createGuardDutyServiceLinkedRole({
        cloudwatch: this.keyResource.cloudwatchKey,
        lambda: this.keyResource.lambdaKey,
      });

      //
      // Create Access SecurityHub Service Linked Role
      //
      this.createSecurityHubServiceLinkedRole({
        cloudwatch: this.keyResource.cloudwatchKey,
        lambda: this.keyResource.lambdaKey,
      });

      //
      // Create Access Macie Service Linked Role
      //
      this.createMacieServiceLinkedRole({
        cloudwatch: this.keyResource.cloudwatchKey,
        lambda: this.keyResource.lambdaKey,
      });

      //
      // Configure and attach quarantine scp
      //
      scpResource.configureAndAttachQuarantineScp(scpItems, props);

      //
      // End of Stack functionality
      //
      this.logger.debug(`Stack synthesis complete`);
    }

    //
    // Create SSM parameters
    //
    this.createSsmParameters();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to create MoveAccountRule
   * @param props {@link AccountsStackProps}
   * @returns MoveAccountRule | undefined
   *
   * @remarks
   * Create MoveAccountRule only in global region for ControlTower and Organization is enabled.
   */
  private createMoveAccountRule(props: AccountsStackProps): MoveAccountRule | undefined {
    let moveAccountRule: MoveAccountRule | undefined;
    if (props.globalRegion === cdk.Stack.of(this).region) {
      if (props.organizationConfig.enable && !props.globalConfig.controlTower.enable) {
        moveAccountRule = new MoveAccountRule(this, 'MoveAccountRule', {
          globalRegion: props.globalRegion,
          homeRegion: props.globalConfig.homeRegion,
          moveAccountRoleName: this.acceleratorResourceNames.roles.moveAccountConfig,
          commitId: props.configCommitId ?? '',
          acceleratorPrefix: props.prefixes.accelerator,
          configTableNameParameterName: this.acceleratorResourceNames.parameters.configTableName,
          configTableArnParameterName: this.acceleratorResourceNames.parameters.configTableArn,
          kmsKey: this.keyResource.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountRole/Policy/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/DefaultPolicy/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });
      }
    }
    return moveAccountRule;
  }

  /**
   * Function to enable opt-in regions for all accounts
   * @param props {@link AccountsStackProps}
   */

  private enableOptInRegions(props: AccountsStackProps) {
    this.logger.info(`Enable opt-in regions`);
    new OptInRegions(this, 'OptInRegions', {
      kmsKey: this.keyResource.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      managementAccountId: props.accountsConfig.getManagementAccountId(),
      accountIds: props.accountsConfig.getAccountIds(),
      homeRegion: props.globalConfig.homeRegion,
      enabledRegions: props.globalConfig.enabledRegions,
      globalRegion: props.globalRegion,
    });

    const optInRegionsIam4SuppressionPaths = [
      'OptInRegions/OptInRegionsOnEvent/ServiceRole/Resource',
      'OptInRegions/OptInRegionsIsComplete/ServiceRole/Resource',
      'OptInRegions/OptInRegionsProvider/framework-onEvent/ServiceRole/Resource',
      'OptInRegions/OptInRegionsProvider/framework-isComplete/ServiceRole/Resource',
      'OptInRegions/OptInRegionsProvider/framework-onTimeout/ServiceRole/Resource',
    ];

    const optInRegionsIam5SuppressionPaths = [
      'OptInRegions/OptInRegionsOnEvent/ServiceRole/DefaultPolicy/Resource',
      'OptInRegions/OptInRegionsIsComplete/ServiceRole/DefaultPolicy/Resource',
      'OptInRegions/OptInRegionsProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource',
      'OptInRegions/OptInRegionsProvider/framework-isComplete/ServiceRole/DefaultPolicy/Resource',
      'OptInRegions/OptInRegionsProvider/framework-onTimeout/ServiceRole/DefaultPolicy/Resource',
      'OptInRegions/OptInRegionsProvider/waiter-state-machine/Role/DefaultPolicy/Resource',
    ];

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM4, optInRegionsIam4SuppressionPaths);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM5, optInRegionsIam5SuppressionPaths);

    // AwsSolutions-SF1: The Step Function does not log "ALL" events to CloudWatch Logs.
    this.createNagSuppressionsInputs(NagSuppressionRuleIds.SF1, [
      'OptInRegions/OptInRegionsProvider/waiter-state-machine/Resource',
    ]);

    // AwsSolutions-SF2: The Step Function does not have X-Ray tracing enabled.
    this.createNagSuppressionsInputs(NagSuppressionRuleIds.SF2, [
      'OptInRegions/OptInRegionsProvider/waiter-state-machine/Resource',
    ]);
  }

  /**
   * Create NagSuppressions inputs
   * @param inputs
   */
  private createNagSuppressionsInputs(type: NagSuppressionRuleIds, inputs: string[]) {
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    for (const input of inputs) {
      this.nagSuppressionInputs.push({
        id: type,
        details: [
          {
            path: `${this.stackName}/${input}`,
            reason: 'AWS Custom resource provider role created by cdk.',
          },
        ],
      });
    }
  }
}

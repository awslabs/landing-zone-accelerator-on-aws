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
import * as path from 'path';
import * as fs from 'fs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class CustomizationsStack extends AcceleratorStack {
  private stackSetAdministratorAccount: string;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    this.props = props;
    this.stackSetAdministratorAccount = props.accountsConfig.getManagementAccountId();

    if (props.customizationsConfig?.customizations?.cloudFormationStackSets) {
      this.deployCustomStackSets();
    }

    Logger.debug(`[customizations-stack] Region: ${cdk.Stack.of(this).region}`);
    Logger.info('[customizations-stack] Completed stack synthesis');
  }

  //
  // Create custom CloudFormation StackSets
  //
  private deployCustomStackSets() {
    if (
      this.account === this.stackSetAdministratorAccount &&
      this.props.globalConfig.homeRegion == cdk.Stack.of(this).region &&
      this.props.customizationsConfig?.customizations?.cloudFormationStackSets
    ) {
      const customStackSetList = this.props.customizationsConfig.customizations.cloudFormationStackSets;
      for (const stackSet of customStackSetList ?? []) {
        Logger.info(`[customizations-stack] New stack set ${stackSet.name}`);
        const deploymentTargetAccounts: string[] | undefined = this.getAccountIdsFromDeploymentTarget(
          stackSet.deploymentTargets,
        );
        const templateBody = fs.readFileSync(path.join(this.props.configDirPath, stackSet.template), 'utf-8');

        new cdk.aws_cloudformation.CfnStackSet(this, pascalCase(`AWSAccelerator-Custom-${stackSet.name}`), {
          permissionModel: 'SELF_MANAGED',
          stackSetName: stackSet.name,
          capabilities: stackSet.capabilities,
          description: stackSet.description,
          operationPreferences: {
            failureTolerancePercentage: 25,
            maxConcurrentPercentage: 35,
            regionConcurrencyType: 'PARALLEL',
          },
          stackInstancesGroup: [
            {
              deploymentTargets: {
                accounts: deploymentTargetAccounts,
              },
              regions: stackSet.regions,
            },
          ],
          templateBody: templateBody,
        });
      }
    }
  }
}

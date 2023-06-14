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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class DependenciesStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Create put SSM parameter role
    if (cdk.Stack.of(this).region === props.globalConfig.homeRegion) {
      this.logger.info('Creating cross-account/cross-region put SSM parameter role in home region');
      this.createPutSsmParameterRole(props.prefixes.ssmParamName, props.partition, this.organizationId);
    }
  }

  /**
   * Create a role that can be assumed to put cross-account/cross-region SSM parameters
   * @param ssmPrefix
   * @param partition
   * @param organizationId
   * @returns
   */
  private createPutSsmParameterRole(ssmPrefix: string, partition: string, organizationId?: string): cdk.aws_iam.Role {
    const role = new cdk.aws_iam.Role(this, 'PutSsmParameterRole', {
      assumedBy: this.getOrgPrincipals(organizationId),
      roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
              resources: [`arn:${partition}:ssm:*:*:parameter${ssmPrefix}*`],
            }),
          ],
        }),
      },
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
    // rule suppression with evidence for this permission.
    NagSuppressions.addResourceSuppressions(role, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'This role is required to give permissions to put/delete SSM parameters across accounts and regions',
      },
    ]);
    return role;
  }
}

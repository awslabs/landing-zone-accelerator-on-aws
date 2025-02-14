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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from '../accelerator-stack';
import { IdentityCenter } from './identity-center';
import { DiagnosticsPack } from './diagnostics-pack';
import * as path from 'path';

/**
 * Enum for log level
 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export class DependenciesStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Create put SSM parameter role
    if (cdk.Stack.of(this).region === props.globalConfig.homeRegion) {
      this.logger.info('Creating cross-account/cross-region put SSM parameter role in home region');
      this.createPutSsmParameterRole(props.prefixes.ssmParamName, props.partition, this.organizationId);
    }

    this.addDefaultEventBusPolicy(props);

    //
    // Create Identity Center dependent resources
    //
    new IdentityCenter(this, props);

    //
    // Create the diagnostics pack dependent resources. The Diagnostics pack will be deployed for multi-account environments without utilizing existing roles for deployment.
    //
    if (!props.enableSingleAccountMode && !props.useExistingRoles) {
      new DiagnosticsPack(this, props);
    }
  }

  /**
   * Public accessor method to add logs to logger
   * @param logLevel
   * @param message
   */
  public addLogs(logLevel: LogLevel, message: string) {
    switch (logLevel) {
      case 'info':
        this.logger.info(message);
        break;

      case 'warn':
        this.logger.warn(message);
        break;

      case 'error':
        this.logger.error(message);
        break;
    }
  }

  /**
   * Create a role that can be assumed to put and read cross-account/cross-region SSM parameters
   * @param ssmPrefix
   * @param partition
   * @param organizationId
   * @returns
   */
  private createPutSsmParameterRole(ssmPrefix: string, partition: string, organizationId?: string): cdk.aws_iam.Role {
    const role = new cdk.aws_iam.Role(this, 'PutSsmParameterRole', {
      assumedBy: this.getOrgPrincipals(organizationId, true),
      roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:PutParameter', 'ssm:DeleteParameter', 'ssm:GetParameter'],
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

  /**
   * Function to provide end-user defined resource-based policy.
   */
  private addDefaultEventBusPolicy(props: AcceleratorStackProps) {
    if (
      props.globalConfig.defaultEventBus?.policy &&
      this.isIncluded(props.globalConfig.defaultEventBus.deploymentTargets)
    ) {
      const defaultEventBus = cdk.aws_events.EventBus.fromEventBusName(this, 'EventBus', 'default');
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, props.globalConfig.defaultEventBus.policy),
          false,
          this.organizationId,
        ),
      );
      // Create a statements list using the PolicyStatement factory
      const statements: cdk.aws_iam.PolicyStatement[] = [];
      for (const statement of policyDocument.Statement) {
        statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
      }
      statements.forEach((statement, index) => {
        const statementId = statement.sid;

        // Normalize the resource ARNs
        const resources = statement.resources;

        // Create the policy
        new cdk.aws_events.CfnEventBusPolicy(this, `EventBusPolicy-${index}`, {
          eventBusName: defaultEventBus.eventBusName,
          statementId: statementId!,
          statement: {
            Effect: statement.effect,
            Action: statement.actions,
            Resource: resources,
            Principal: '*',
            Condition: statement.conditions || undefined,
          },
        });
      });
    }
  }
}

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
import { Construct } from 'constructs';
import * as path from 'path';
import { LzaCustomResource } from '../lza-custom-resource';
import { pascalCase } from 'change-case';
/**
 * Initialized ServiceLinkedRoleProps properties
 */
export interface ServiceLinkedRoleProps {
  /**
   * Custom resource lambda environment encryption key
   */
  readonly environmentEncryptionKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudWatchLogKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * Service linked role service name
   */
  readonly awsServiceName: string;
  /**
   * Service linked role service description
   */
  readonly description?: string;
  /**
   * Service linked role name that should be created when create-service-link role api call is made.
   * this allows to look up roles faster, scale better in case naming changes by service.
   * @example
   * for autoscaling.amazonaws.com roleName would be AWSServiceRoleForAutoScaling
   */
  readonly roleName: string;
  /**
   * Prefix for nag suppression
   */
  readonly nagSuppressionPrefix?: string;
}

/**
 * Class for ServiceLinkedRole
 */
export class ServiceLinkedRole extends Construct {
  public readonly roleArn: string;
  public readonly roleName: string;
  constructor(scope: Construct, id: string, props: ServiceLinkedRoleProps) {
    super(scope, id);

    // make a unique name for each service name
    const resourceName = `ServiceLinkedRole${pascalCase(props.awsServiceName)}`;

    const lzaCustomResource = new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          {
            serviceName: props.awsServiceName,
            description: props.description,
            roleName: props.roleName,
          },
        ],
        nagSuppressionPrefix: `${props.nagSuppressionPrefix}/${resourceName}`,
        forceUpdate: true,
      },
      lambda: {
        assetPath: path.join(__dirname, 'create-service-linked-role/dist'),
        environmentEncryptionKmsKey: props.environmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.cloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.cloudWatchLogRetentionInDays,
        timeOut: cdk.Duration.minutes(15),
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['iam:CreateServiceLinkedRole', 'iam:GetRole'],
            resources: ['*'],
          }),
        ],
      },
    });

    this.roleArn = lzaCustomResource.resource.getAtt('roleArn').toString();
    this.roleName = lzaCustomResource.resource.getAtt('roleName').toString();
  }
}

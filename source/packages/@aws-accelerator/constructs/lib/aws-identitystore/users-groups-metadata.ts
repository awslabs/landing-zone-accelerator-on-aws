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
import { pascalCase } from 'change-case';
import { LzaCustomResource } from '../lza-custom-resource';

/**
 * Initialized UsersGroupsMetadataProps properties
 */
export interface UsersGroupsMetadataProps {
  /**
   * Identity Store Id
   */
  readonly identityStoreId: string;
  /**
   * Identity Center principals
   */
  readonly principals: { type: string; name: string }[];
  /**
   * Custom resource name unique identifier
   */
  readonly resourceUniqueIdentifier: string;
  /**
   * Custom resource lambda environment encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaEnvironmentEncryptionKmsKey: cdk.aws_kms.IKey | undefined;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaCloudWatchLogKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly customResourceLambdaLogRetentionInDays: number;
}

/**
 * Class for UsersGroupsMetadata
 */
export class UsersGroupsMetadata extends Construct {
  public readonly principalsMetadata: { type: string; name: string; id: string }[] = [];
  constructor(scope: Construct, id: string, props: UsersGroupsMetadataProps) {
    super(scope, id);

    for (const principal of props.principals) {
      const resourceName = pascalCase(
        `UsersGroupsMetadata-${props.resourceUniqueIdentifier}-${principal.type}-${principal.name}`,
      );

      const lzaCustomResource = new LzaCustomResource(this, resourceName, {
        resource: {
          name: resourceName,
          parentId: id,
          properties: [
            { identityStoreId: props.identityStoreId },
            { principalType: principal.type },
            { principalName: principal.name },
          ],
        },
        lambda: {
          assetPath: path.join(__dirname, 'get-users-groups-id/dist'),
          environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
          cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
          cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
          timeOut: cdk.Duration.minutes(5),
          roleInitialPolicy: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['identitystore:ListGroups', 'identitystore:ListUsers'],
              resources: ['*'],
            }),
          ],
        },
      });
      this.principalsMetadata.push({ type: principal.type, name: principal.name, id: lzaCustomResource.resource.ref });
    }
  }
}

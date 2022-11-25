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

export interface SsmInventoryProps {
  bucketName: string;
  bucketRegion: string;
  accountId: string;
  prefix: string;
}

export class Inventory extends Construct {
  constructor(scope: Construct, id: string, props: SsmInventoryProps) {
    super(scope, id);

    new cdk.aws_ssm.CfnResourceDataSync(this, 'ResourceDataSync', {
      bucketName: props.bucketName,
      bucketRegion: props.bucketRegion,
      syncName: `${props.prefix}${props.accountId}-Inventory`,
      syncFormat: 'JsonSerDe',
      bucketPrefix: `ssm-inventory`,
      syncType: 'SyncToDestination',
    });

    new cdk.aws_ssm.CfnAssociation(this, 'GatherInventory', {
      name: `AWS-GatherSoftwareInventory`,
      associationName: `${props.prefix}${props.accountId}-InventoryCollection`,
      scheduleExpression: 'rate(12 hours)',
      targets: [
        {
          key: 'InstanceIds',
          values: ['*'],
        },
      ],
    });
  }
}

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
import {
  TransitGatewayRouteTableAssociation,
  TransitGatewayAttachment,
  TransitGatewayRouteTablePropagation,
  TransitGateway,
  TransitGatewayAttachmentType,
} from '../../lib/aws-ec2/transit-gateway';
import { snapShotTest } from '../snapshot-test';
import { describe, it } from '@jest/globals';

const testNamePrefix = 'Construct(TransitGatewayRouteTableAssociation): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayRouteTableAssociation(stack, 'TransitGatewayRouteTableAssociation', {
  transitGatewayAttachmentId: 'transitGatewayAttachmentId',
  transitGatewayRouteTableId: 'transitGatewayRouteTableId',
});
/**
 * TransitGatewayRouteTableAssociation construct test
 */
describe('TransitGatewayRouteTableAssociation', () => {
  snapShotTest(testNamePrefix, stack);
});

/**
 * TransitGatewayAttachment construct test
 */
describe('TransitGatewayAttachment', () => {
  it('default tgw attachment', () => {
    new TransitGatewayAttachment(stack, 'TransitGatewayAttachment', {
      name: 'name',
      partition: 'partition',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        applianceModeSupport: 'enable',
        dnsSupport: 'enable',
        ipv6Support: 'disable',
      },
    });
  });

  it('govcloud tgw attachment', () => {
    new TransitGatewayAttachment(stack, 'TransitGatewayAttachmentGovCloud', {
      name: 'name',
      partition: 'aws-us-gov',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        applianceModeSupport: 'enable',
        dnsSupport: 'enable',
        ipv6Support: 'disable',
      },
    });
  });

  it('tgw lookup', () => {
    TransitGatewayAttachment.fromLookup(stack, 'TgwAttachLookup', {
      transitGatewayId: 'transitGatewayId',
      name: 'name',
      owningAccountId: 'owningAccountId',
      type: TransitGatewayAttachmentType.VPC,
      roleName: 'roleName',
      kmsKey: new cdk.aws_kms.Key(stack, 'TgwAttachLookupKms'),
      logRetentionInDays: 7,
    });
  });
  it('regular tgw attachment in aws partition', () => {
    new TransitGatewayAttachment(stack, 'TransitGatewayAttachmentAwsPartition', {
      name: 'name',
      partition: 'aws',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        applianceModeSupport: 'enable',
        dnsSupport: 'disable',
        ipv6Support: 'enable',
      },
    });
  });
  it('regular tgw attachment in aws partition options toggled', () => {
    new TransitGatewayAttachment(stack, 'TransitGatewayAttachmentAwsPartitionOptions', {
      name: 'name',
      partition: 'aws',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
    });
  });
  snapShotTest('Construct(TransitGatewayAttachment): ', stack);
});

/**
 * TransitGatewayRouteTablePropagation construct test
 */
describe('TransitGatewayRouteTablePropagation', () => {
  new TransitGatewayRouteTablePropagation(stack, 'TransitGatewayRouteTablePropagation', {
    transitGatewayAttachmentId: 'transitGatewayAttachmentId',
    transitGatewayRouteTableId: 'transitGatewayRouteTableId',
  });
  snapShotTest('Construct(TransitGatewayRouteTablePropagation): ', stack);
});

/**
 * TransitGateway construct test
 */
describe('TransitGateway', () => {
  new TransitGateway(stack, 'TransitGateway', {
    name: 'name',
    amazonSideAsn: 1234,
    autoAcceptSharedAttachments: 'enable',
    defaultRouteTableAssociation: 'enable',
    defaultRouteTablePropagation: 'enable',
    description: 'description',
    dnsSupport: 'enable',
    multicastSupport: 'enable',
    vpnEcmpSupport: 'enable',
    tags: [{ key: 'key', value: 'value' }],
  });
  snapShotTest('Construct(TransitGateway): ', stack);
});

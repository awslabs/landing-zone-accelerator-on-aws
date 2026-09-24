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
import { Template } from 'aws-cdk-lib/assertions';
import {
  TransitGatewayRouteTableAssociation,
  TransitGatewayAttachment,
  TransitGatewayRouteTablePropagation,
  TransitGateway,
  TransitGatewayAttachmentType,
} from '../../lib/aws-ec2/transit-gateway';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from 'vitest';

const testNamePrefix = 'Construct(TransitGatewayRouteTableAssociation): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const customResourceHandler = cdk.aws_lambda.Function.fromFunctionName(stack, 'test', 'test');

new TransitGatewayRouteTableAssociation(stack, 'TransitGatewayRouteTableAssociation', {
  transitGatewayAttachmentId: 'transitGatewayAttachmentId',
  transitGatewayRouteTableId: 'transitGatewayRouteTableId',
});
new TransitGatewayRouteTableAssociation(stack, 'TransitGatewayRouteTableAssociationCustom', {
  transitGatewayAttachmentId: 'transitGatewayAttachmentId',
  transitGatewayRouteTableId: 'transitGatewayRouteTableId',
  customResourceHandler,
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
    TransitGatewayAttachment.fromBatchLookup(stack, 'TgwAttachLookup', {
      options: [
        {
          transitGatewayId: 'transitGatewayId',
          name: 'name',
          owningAccountId: 'owningAccountId',
          type: TransitGatewayAttachmentType.VPC,
          roleName: 'roleName',
        },
      ],
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
  it('tgw from id', () => {
    TransitGatewayAttachment.fromTransitGatewayAttachmentId(stack, 'TgwAttachId', {
      attachmentId: 'transitGatewayAttachmentId',
      attachmentName: 'name',
    });
  });
  it('iso partition tgw attachment emits options block', () => {
    // Options were silently dropped for partitions other than aws / aws-us-gov (e.g. aws-iso),
    // so applianceModeSupport never reached the attachment. This asserts they now emit.
    const isoStack = new cdk.Stack();
    new TransitGatewayAttachment(isoStack, 'TransitGatewayAttachmentIso', {
      name: 'name',
      partition: 'aws-iso',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        applianceModeSupport: 'enable',
        dnsSupport: 'enable',
        ipv6Support: 'disable',
      },
    });
    const template = Template.fromStack(isoStack);
    template.hasResourceProperties('AWS::EC2::TransitGatewayAttachment', {
      Options: {
        ApplianceModeSupport: 'enable',
        DnsSupport: 'enable',
        Ipv6Support: 'disable',
      },
    });
    // SecurityGroupReferencingSupport must NOT be injected when it is not configured, since
    // isolated partitions may not accept the property.
    const options = Object.values(template.findResources('AWS::EC2::TransitGatewayAttachment'))[0].Properties.Options;
    expect(options.SecurityGroupReferencingSupport).toBeUndefined();
  });
  it('iso partition tgw attachment emits securityGroupReferencingSupport only when configured', () => {
    const isoStack = new cdk.Stack();
    new TransitGatewayAttachment(isoStack, 'TransitGatewayAttachmentIsoSgRef', {
      name: 'name',
      partition: 'aws-iso',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        applianceModeSupport: 'enable',
        securityGroupReferencingSupport: 'enable',
      },
    });
    Template.fromStack(isoStack).hasResourceProperties('AWS::EC2::TransitGatewayAttachment', {
      Options: {
        ApplianceModeSupport: 'enable',
        SecurityGroupReferencingSupport: 'enable',
      },
    });
  });
  it('iso partition tgw attachment omits unset options instead of defaulting them', () => {
    // The default-partition branch emits only options explicitly set in config; unset options
    // are omitted rather than defaulted. This keeps the fix opt-in: a partition that does not
    // accept a key only sees it when the deployment set it. Here applianceModeSupport/dnsSupport/
    // ipv6Support are omitted, so only SecurityGroupReferencingSupport is rendered.
    const isoStack = new cdk.Stack();
    new TransitGatewayAttachment(isoStack, 'TransitGatewayAttachmentIsoPartial', {
      name: 'name',
      partition: 'aws-iso',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        securityGroupReferencingSupport: 'enable',
      },
    });
    const template = Template.fromStack(isoStack);
    template.hasResourceProperties('AWS::EC2::TransitGatewayAttachment', {
      Options: {
        SecurityGroupReferencingSupport: 'enable',
      },
    });
    const options = Object.values(template.findResources('AWS::EC2::TransitGatewayAttachment'))[0].Properties.Options;
    expect(options.ApplianceModeSupport).toBeUndefined();
    expect(options.DnsSupport).toBeUndefined();
    expect(options.Ipv6Support).toBeUndefined();
  });
  it('iso partition tgw attachment emits no options block when none are configured', () => {
    // With no options set in config, the attachment renders no Options block at all, byte-identical
    // to the pre-fix template. This guarantees the fix cannot alter an attachment that never opted in,
    // in this or any future default-case partition.
    const isoStack = new cdk.Stack();
    new TransitGatewayAttachment(isoStack, 'TransitGatewayAttachmentIsoNoOptions', {
      name: 'name',
      partition: 'aws-iso',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
    });
    const template = Template.fromStack(isoStack);
    const properties = Object.values(template.findResources('AWS::EC2::TransitGatewayAttachment'))[0].Properties;
    expect(properties.Options).toBeUndefined();
  });
  it('tgw attachment with security group referencing', () => {
    new TransitGatewayAttachment(stack, 'TransitGatewayAttachmentWithSgRef', {
      name: 'name-with-sg-ref',
      partition: 'aws',
      transitGatewayId: 'transitGatewayId',
      subnetIds: ['one', 'two', 'three'],
      vpcId: 'vpcId',
      options: {
        securityGroupReferencingSupport: 'enable',
      },
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
  new TransitGatewayRouteTablePropagation(stack, 'TransitGatewayRouteTablePropagationCustom', {
    transitGatewayAttachmentId: 'transitGatewayAttachmentId',
    transitGatewayRouteTableId: 'transitGatewayRouteTableId',
    customResourceHandler,
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
  it('tgw with security group referencing', () => {
    new TransitGateway(stack, 'TransitGatewayWithSgRef', {
      name: 'name-with-sg-ref',
      amazonSideAsn: 1234,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      dnsSupport: 'enable',
      securityGroupReferencingSupport: 'enable',
      vpnEcmpSupport: 'enable',
    });
  });
  it('tgw with encryption support', () => {
    new TransitGateway(stack, 'TransitGatewayWithEncryption', {
      name: 'name-with-encryption',
      amazonSideAsn: 1234,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      dnsSupport: 'enable',
      encryptionSupport: 'enable',
      vpnEcmpSupport: 'enable',
    });
  });
  snapShotTest('Construct(TransitGateway): ', stack);
});
/**
 * Import TransitGateway construct test
 */
describe('ImportTransitGateway', () => {
  TransitGateway.fromTransitGatewayAttributes(stack, 'ImportTransitGateway', {
    transitGatewayId: 'someTransitGatewayId',
    transitGatewayName: 'someTransitGateway',
  });
  snapShotTest('Construct(ImportTransitGateway): ', stack);
});

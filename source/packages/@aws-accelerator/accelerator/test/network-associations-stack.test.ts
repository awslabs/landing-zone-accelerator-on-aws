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

import { describe, test, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { SecurityGroupConfig } from '@aws-accelerator/config';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { snapShotTest } from './snapshot-test';
import { Create, cloneWithOverrides, findSsmParameters } from './accelerator-test-helpers';
import { NetworkAssociationsStack } from '../lib/stacks/network-stacks/network-associations-stack/network-associations-stack';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';
const testNamePrefix = 'Construct(NetworkAssociationsStack): ';

describe('NetworkAssociationsStack', () => {
  const acceleratorTestStacks = Create.stacks(AcceleratorStage.NETWORK_ASSOCIATIONS);
  const stackNames = [
    'Network-us-east-1',
    'SharedServices-us-east-1',
    'Network-us-west-2',
    'SharedServices-us-west-2',
    'Audit-us-east-1',
    'Audit-us-west-2',
    'LogArchive-us-east-1',
    'LogArchive-us-west-2',
  ];

  type PeeringConfig = [string, string, string, boolean, boolean];

  const peeringList: PeeringConfig[] = [
    ['Network', 'us-east-1', 'NonTemplate-Ipam-Cross-Region-Same-Account', false, true],
    ['Network', 'us-east-1', 'NonTemplate-Ipam-Same-Region-Cross-Account', true, false],
    ['Network', 'us-east-1', 'Template-Requester-Same-OU-Same-Region-Ipam', false, false],
    ['Network', 'us-east-1', 'Template-Requester-Same-OU-Cross-Region-Ipam', false, true],
    ['Network', 'us-east-1', 'Template-Requester-Same-OU-Half-Same-Region-Static', false, false],
    ['SharedServices', 'us-east-1', 'NonTemplate-Static-Cross-Region-Cross-Account', true, true],
    ['SharedServices', 'us-east-1', 'NonTemplate-Ipam-Same-Region-Same-Account', false, false],
    ['Audit', 'us-east-1', 'Template-Requester-Different-OU-Same-Region-Static', true, false],
    ['Audit', 'us-east-1', 'Template-Requester-Different-OU-Same-Region-Ipam', true, false],
    ['Audit', 'us-west-2', 'Template-Requester-Different-OU-Cross-Region-Static', true, true],
    ['Audit', 'us-west-2', 'Template-Requester-Different-OU-Cross-Region-Ipam', true, true],
  ];

  stackNames.forEach(n => snapShotTest(testNamePrefix, () => acceleratorTestStacks.stacks.get(n)));

  test('Route Table Lookup', () => {
    const stackPdx = acceleratorTestStacks.stacks.get(`Network-us-east-1`)! as unknown as NetworkAssociationsStack;

    expect(Array.from(stackPdx['routeTableMap'].keys())).toEqual(
      expect.arrayContaining([
        'SharedServices-Main_444444444444_SharedServices-App-A',
        'Network-NonTemplate-Static-West_555555555555_Network-NonTemplate-Static-Public-West', // same account cross region lookup
        'Network-Endpoints_Network-Endpoints-A',
      ]),
    );
  });

  it.each<PeeringConfig>(peeringList)(
    'Vpc Peering Config: %s %s %s',
    (account, region, peeringName, crossAcct, crossRegion) => {
      testVpcPeeringConfig(acceleratorTestStacks, account, region, peeringName, crossAcct, crossRegion);
    },
  );

  test('Security groups are created for shared VPCs', () => {
    // Audit account is in Security OU which receives SharedServices-App-A subnet
    // The security group should be created in the recipient's NetworkAssociationsStack
    const stack = acceleratorTestStacks.stacks.get('Audit-us-east-1')!;
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupName: 'SharedServices-Main-Rsyslog-sg',
    });
  });

  test('Security group ingress rules referencing other security groups are created for shared VPCs', () => {
    const stack = acceleratorTestStacks.stacks.get('Audit-us-east-1')!;
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: '-1',
      Description: 'allow from app sg',
      GroupId: Match.anyValue(),
      SourceSecurityGroupId: Match.anyValue(),
    });
  });

  /**
   * The VPC ID of a RAM-shared VPC is only available in a share target account because the owning
   * account's NetworkVpcStack pushes it there with the PutSsmParameter custom resource. Looking it
   * up emits an `AWS::SSM::Parameter::Value<String>` CFN parameter, and CloudFormation resolves
   * every one of those on create/update even when no resource references it - so a share target
   * that needs nothing from the VPC itself would fail with
   * `Unable to fetch parameters [...] from parameter store for this account`.
   *
   * See GitHub issue #930.
   */
  describe('Shared VPC ID lookups', () => {
    const sharedVpcName = 'SharedServices-Main';
    const sharedVpcIdSsmPath = `/accelerator/network/vpc/${sharedVpcName}/id`;

    /**
     * Synthesizes a NetworkAssociationsStack for the Audit account, which is a share target of the
     * SharedServices-Main subnets, with the security groups of that VPC replaced.
     */
    const synthAuditStackWithSharedVpcSecurityGroups = (securityGroups: SecurityGroupConfig[]) => {
      const props = acceleratorTestStacks['props'] as AcceleratorStackProps;
      const networkConfig = cloneWithOverrides(props.networkConfig, {
        vpcs: props.networkConfig.vpcs.map(vpcItem =>
          vpcItem.name === sharedVpcName ? cloneWithOverrides(vpcItem, { securityGroups }) : vpcItem,
        ),
      });

      const app = new cdk.App();
      return new NetworkAssociationsStack(app, 'NetworkAssociationsStackSharedVpcTest', {
        ...props,
        networkConfig,
        env: { account: props.accountsConfig.getAuditAccountId(), region: 'us-east-1' },
      });
    };

    test('are emitted for a shared VPC that declares security groups', () => {
      // Baseline: the Audit account creates security groups in SharedServices-Main, so it genuinely
      // needs the VPC ID and the lookup must still be emitted.
      const stack = acceleratorTestStacks.stacks.get('Audit-us-east-1')!;
      expect(findSsmParameters(stack, sharedVpcIdSsmPath)).toHaveLength(1);
    });

    test('are not emitted for a shared VPC with no security groups', () => {
      const stack = synthAuditStackWithSharedVpcSecurityGroups([]);

      // Nothing in this stack consumes the shared VPC ID, so no dead SSM parameter should be
      // emitted for it. Before this fix the parameter was always emitted and CloudFormation failed
      // to resolve it in every share target account.
      expect(findSsmParameters(stack, sharedVpcIdSsmPath)).toHaveLength(0);
    });

    test('do not prevent shared subnet resources from being created', () => {
      const stack = synthAuditStackWithSharedVpcSecurityGroups([]);
      const template = Template.fromStack(stack);

      // Dropping the VPC ID lookup must not drop the shared subnet handling: the stack still tags
      // the shared subnets it receives.
      template.resourceCountIs('Custom::ShareSubnetTags', 1);
    });
  });
});

const testVpcPeeringConfig = (
  synthStacks: AcceleratorSynthStacks,
  accountName: string,
  region: string,
  peeringName: string,
  crossAccount: boolean,
  crossRegion: boolean,
) => {
  const stack = synthStacks.stacks.get(`${accountName}-${region}`)! as unknown as NetworkAssociationsStack;
  const template = Template.fromStack(stack);
  const vpcPeeringConfig = template.findResources('AWS::EC2::VPCPeeringConnection', {
    Properties: {
      Tags: Match.arrayWith([
        {
          Key: 'Name',
          Value: peeringName,
        },
      ]),
    },
  });
  expect(vpcPeeringConfig).not.toEqual({});

  const peeringProps = Object.values(vpcPeeringConfig)[0]['Properties'];

  if (crossAccount) {
    expect(peeringProps['PeerRoleArn']).toBeDefined();
  } else {
    expect(peeringProps['PeerRoleArn']).not.toBeDefined();
  }

  if (crossAccount || crossRegion) {
    expect(peeringProps['PeerVpcId']['Ref']).toMatch(/^SsmParamLookup/);
  } else {
    expect(peeringProps['PeerVpcId']['Ref']).toMatch(/^SsmParameterValue/);
  }
};

describe('NoVpcFlowLogStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Network-us-east-1`, [
      AcceleratorStage.NETWORK_ASSOCIATIONS,
      'aws',
      'us-east-1',
      'all-enabled-ou-targets',
    ]),
  );
});

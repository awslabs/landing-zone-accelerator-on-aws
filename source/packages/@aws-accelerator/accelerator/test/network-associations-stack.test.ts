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

import { describe, test, it } from '@jest/globals';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';
import { NetworkAssociationsStack } from '../lib/stacks/network-stacks/network-associations-stack/network-associations-stack';
import { Template } from 'aws-cdk-lib/assertions';
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
      Tags: [
        {
          Key: 'Name',
          Value: peeringName,
        },
      ],
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

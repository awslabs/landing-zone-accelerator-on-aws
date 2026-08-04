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

import { describe, expect, test } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { Ec2FirewallConfig } from '@aws-accelerator/config';

import { AcceleratorStage } from '../lib/accelerator-stage';
import { snapShotTest } from './snapshot-test';
import { Create, cloneWithOverrides, findSsmParameters } from './accelerator-test-helpers';
import { NetworkAssociationsGwlbStack } from '../lib/stacks/network-stacks/network-associations-gwlb-stack/network-associations-gwlb-stack';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

describe('NetworkAssociationsGwlbStack', () => {
  snapShotTest(
    'Construct(NetworkAssociationsGwlbStack): ',
    Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB),
  );

  /**
   * The VPC ID of a RAM-shared VPC is only available in a share target account because the owning
   * account's NetworkVpcStack pushes it there with the PutSsmParameter custom resource. Looking it
   * up emits an `AWS::SSM::Parameter::Value<String>` CFN parameter, and CloudFormation resolves
   * every one of those on create/update even when no resource references it - so a share target
   * that deploys no firewall into the shared VPC would fail with
   * `Unable to fetch parameters [...] from parameter store for this account`.
   *
   * See GitHub issue #930.
   */
  describe('Shared VPC ID lookups', () => {
    const acceleratorTestStacks = Create.stacks(AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB);

    test('are not emitted for a shared VPC with no firewall resources', () => {
      // SharedServices is a share target of the Network-Endpoints-A subnet, but no firewall in the
      // customizations config is deployed into Network-Endpoints, so this stack never consumes that
      // VPC ID and must not emit a lookup for it.
      const stack = acceleratorTestStacks.stacks.get('SharedServices-us-east-1')! as Stack;

      expect(findSsmParameters(stack, '/accelerator/network/vpc/Network-Endpoints/id')).toHaveLength(0);
    });

    test('are emitted for a VPC that owns firewall resources', () => {
      // SharedServices owns SharedServices-Main and deploys firewalls into it, so the lookup for a
      // VPC that is genuinely needed must still be emitted.
      const stack = acceleratorTestStacks.stacks.get('SharedServices-us-east-1')! as Stack;

      expect(findSsmParameters(stack, '/accelerator/network/vpc/SharedServices-Main/id')).toHaveLength(1);
    });

    test('are emitted for a shared VPC that a firewall is deployed into', () => {
      // The Audit account receives the SharedServices-App-A subnet and the customizations config
      // places a firewall in SharedServices-Main, so the shared VPC ID is still required here.
      const stack = acceleratorTestStacks.stacks.get('Audit-us-east-1')! as Stack;

      expect(findSsmParameters(stack, '/accelerator/network/vpc/SharedServices-Main/id')).toHaveLength(1);
    });

    /**
     * getSharedVpcsWithFirewalls unions three firewall sources, and the tests above only reach the
     * `instances` one. These two pin the other two branches independently: if either line were
     * dropped from the union, the lookup for a shared VPC that needs it would silently disappear and
     * the share target stack would fail to deploy.
     *
     * Network-Endpoints is owned by the Network account and shares Network-Endpoints-A with
     * SharedServices, which hosts no firewall in it - so the baseline is no lookup (asserted above).
     * Repointing a single firewall source at it must bring the lookup back. Neither firewall config
     * declares an `account`, so isInScope resolves against vpcsInScopeMap and no firewall resource is
     * actually created in the shared VPC - which isolates the filter from the rest of the stack.
     */
    const synthSharedServicesStackWithFirewallIn = (
      source: 'managerInstances' | 'autoscalingGroups',
      vpcName: string,
    ): Stack => {
      const props = acceleratorTestStacks['props'] as AcceleratorStackProps;
      const configuredFirewalls = props.customizationsConfig.firewalls!;
      const overrides: Partial<Ec2FirewallConfig> =
        source === 'managerInstances'
          ? {
              managerInstances: (configuredFirewalls.managerInstances ?? []).map(item =>
                cloneWithOverrides(item, { vpc: vpcName }),
              ),
            }
          : {
              autoscalingGroups: (configuredFirewalls.autoscalingGroups ?? []).map(item =>
                cloneWithOverrides(item, { vpc: vpcName }),
              ),
            };

      const customizationsConfig = cloneWithOverrides(props.customizationsConfig, {
        firewalls: cloneWithOverrides(configuredFirewalls, overrides),
      });

      const app = new cdk.App();
      return new NetworkAssociationsGwlbStack(app, `NetworkAssociationsGwlbStack${source}Test`, {
        ...props,
        customizationsConfig,
        env: { account: props.accountsConfig.getAccountId('SharedServices'), region: 'us-east-1' },
      });
    };

    test('are emitted for a shared VPC referenced only by a firewall manager instance', () => {
      const stack = synthSharedServicesStackWithFirewallIn('managerInstances', 'Network-Endpoints');

      expect(findSsmParameters(stack, '/accelerator/network/vpc/Network-Endpoints/id')).toHaveLength(1);
    });

    test('are emitted for a shared VPC referenced only by a firewall autoscaling group', () => {
      const stack = synthSharedServicesStackWithFirewallIn('autoscalingGroups', 'Network-Endpoints');

      expect(findSsmParameters(stack, '/accelerator/network/vpc/Network-Endpoints/id')).toHaveLength(1);
    });
  });
});

describe('NetworkAssociationsGwlbStack firewall autoScalingGroupName', () => {
  // issue #3088: the firewall ASG name flows exclusively through
  // processAutoScalingReplacements, which rebuilds the AutoScalingConfig field by field.
  // The all-enabled test-asg sets autoScalingGroupName; assert it survives that reconstruction
  // and reaches the physical AWS::AutoScaling::AutoScalingGroup name.
  const getTemplate = () =>
    Template.fromStack(
      Create.stack('Network-us-east-1', [
        AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB,
        'aws',
        'us-east-1',
        'all-enabled',
      ])!,
    );

  test('passes the configured autoScalingGroupName through to the firewall ASG', () => {
    getTemplate().hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: 'firewall-custom-asg-name',
    });
  });
});

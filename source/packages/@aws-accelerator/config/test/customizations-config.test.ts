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

import {
  CustomizationsConfig,
  CloudFormationStackConfig,
  CloudFormationStackSetConfig,
  AlbListenerFixedResponseConfig,
  AlbListenerForwardConfigTargetGroupStickinessConfig,
  AlbListenerForwardConfig,
  AlbListenerRedirectConfig,
  ApplicationLoadBalancerListenerConfig,
  ApplicationLoadBalancerAttributesConfig,
  ApplicationLoadBalancerConfig,
  TargetGroupItemConfig,
  NetworkLoadBalancerListenerConfig,
  NetworkLoadBalancerConfig,
  EbsItemConfig,
  PrivateIpAddressConfig,
  BlockDeviceMappingItem,
  NetworkInterfaceItemConfig,
  LaunchTemplateConfig,
  AutoScalingConfig,
  AppConfigItem,
} from '../lib/customizations-config';
import { describe, expect, it } from '@jest/globals';
import * as path from 'path';

describe('CustomizationsConfig', () => {
  describe('Test config', () => {
    const customizationsConfigFromFile = CustomizationsConfig.load(
      path.resolve('../accelerator/test/configs/all-enabled'),
    );
    const customizationsConfig = new CustomizationsConfig();

    it('has loaded successfully', () => {
      expect(customizationsConfigFromFile.customizations.cloudFormationStacks.length).toBe(3);
      expect(customizationsConfig.customizations.cloudFormationStacks.length).toBe(0);
      // expect(customizationsConfigFromFile.applications.length).toBe(7);
      expect(customizationsConfig.applications.length).toBe(0);
    });
    const cloudFormationStackConfig = new CloudFormationStackConfig();
    expect(cloudFormationStackConfig.description).toEqual('');

    const cloudFormationStackSetConfig = new CloudFormationStackSetConfig();
    expect(cloudFormationStackSetConfig.description).toEqual('');

    const albListenerFixedResponseConfig = new AlbListenerFixedResponseConfig();
    expect(albListenerFixedResponseConfig.statusCode).toEqual('');

    const albListenerForwardConfigTargetGroupStickinessConfig =
      new AlbListenerForwardConfigTargetGroupStickinessConfig();
    expect(albListenerForwardConfigTargetGroupStickinessConfig.durationSeconds).toEqual(undefined);

    const albListenerForwardConfig = new AlbListenerForwardConfig();
    expect(albListenerForwardConfig.targetGroupStickinessConfig).toEqual(undefined);

    const albListenerRedirectConfig = new AlbListenerRedirectConfig();
    expect(albListenerRedirectConfig.statusCode).toEqual(undefined);

    const applicationLoadBalancerListenerConfig = new ApplicationLoadBalancerListenerConfig();
    expect(applicationLoadBalancerListenerConfig.name).toEqual('');

    const applicationLoadBalancerAttributesConfig = new ApplicationLoadBalancerAttributesConfig();
    expect(applicationLoadBalancerAttributesConfig.deletionProtection).toEqual(undefined);

    const applicationLoadBalancerConfig = new ApplicationLoadBalancerConfig();
    expect(applicationLoadBalancerConfig.name).toEqual('');

    const targetGroupItemConfig = new TargetGroupItemConfig();
    expect(targetGroupItemConfig.protocolVersion).toEqual(undefined);

    const networkLoadBalancerListenerConfig = new NetworkLoadBalancerListenerConfig();
    expect(networkLoadBalancerListenerConfig.certificate).toEqual(undefined);

    const networkLoadBalancerConfig = new NetworkLoadBalancerConfig();
    expect(networkLoadBalancerConfig.deletionProtection).toEqual(undefined);

    const ebsItemConfig = new EbsItemConfig();
    expect(ebsItemConfig.deleteOnTermination).toEqual(undefined);

    const blockDeviceMappingItem = new BlockDeviceMappingItem();
    expect(blockDeviceMappingItem.ebs).toEqual(undefined);

    const privateIpAddressConfig = new PrivateIpAddressConfig();
    expect(privateIpAddressConfig.primary).toEqual(undefined);

    const networkInterfaceItemConfig = new NetworkInterfaceItemConfig();
    expect(networkInterfaceItemConfig.associateCarrierIpAddress).toEqual(undefined);

    const launchTemplateConfig = new LaunchTemplateConfig();
    expect(launchTemplateConfig.blockDeviceMappings).toEqual(undefined);

    const autoScalingConfig = new AutoScalingConfig();
    expect(autoScalingConfig.healthCheckGracePeriod).toEqual(undefined);

    const appConfigItem = new AppConfigItem();
    expect(appConfigItem.targetGroups).toEqual(undefined);
  });
});

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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import {
  CentralNetworkServicesConfig,
  DnsFirewallRuleGroupConfig,
  DnsFirewallRulesConfig,
} from '@aws-accelerator/config';
import { ResolverFirewallDomainList } from '@aws-accelerator/constructs/lib/aws-route-53-resolver/firewall-domain-list';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorStackProps } from '../../../../lib/stacks/accelerator-stack';
import { NetworkPrepStack } from '../../../../lib/stacks/network-stacks/network-prep-stack/network-prep-stack';
import { ResolverResources } from '../../../../lib/stacks/network-stacks/network-prep-stack/resolver-resources';
import { createAcceleratorStackProps } from '../../stack-props-test-helper';

describe('ResolverResources', () => {
  let app: cdk.App;
  let props: AcceleratorStackProps;
  let networkStack: NetworkPrepStack;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(NetworkPrepStack.prototype, 'getCentralLogBucketName').mockReturnValue('unitTestLogBucket');
    jest.spyOn(NetworkPrepStack.prototype, 'getSsmPath').mockReturnValue('/test/ssm-path/');
    jest.spyOn(NetworkPrepStack.prototype, 'getAcceleratorKey').mockReturnValue(undefined);
    jest.spyOn(NetworkPrepStack.prototype, 'isIncluded').mockReturnValue(true);
    jest
      .spyOn(ResolverResources.prototype as any, 'createResolverQueryLogs')
      .mockReturnValue(new Map<string, string>());
    jest.spyOn(ResolverFirewallDomainList.prototype as any, 'getAssetUrl').mockReturnValue('');
    jest.mock('aws-sdk', () => ({
      Bucket: jest.fn(() => ({
        fromBucketName: jest.fn(),
      })),
    }));

    app = new cdk.App();
    props = createAcceleratorStackProps();
    networkStack = new NetworkPrepStack(app, 'unit-test-network-prep-stack', props);
  });

  describe('ResolverResources', () => {
    const delegatedAdminAccountId = '1234567890';
    const centralConfig = {} as CentralNetworkServicesConfig;
    const orgId = '1';
    let domainMap: Map<string, string>;
    let resolverResources: ResolverResources;
    let firewallRuleConfig: DnsFirewallRuleGroupConfig;

    beforeEach(() => {
      domainMap = new Map();
      resolverResources = new ResolverResources(networkStack, delegatedAdminAccountId, centralConfig, props, orgId);
      firewallRuleConfig = {
        name: 'test-config',
        rules: [] as DnsFirewallRulesConfig[],
      } as DnsFirewallRuleGroupConfig;
    });

    test('createDomainLists with no firewallItem rules', () => {
      const result = resolverResources['createDomainLists'](firewallRuleConfig, domainMap, '../configs');
      expect(result.size).toBe(0);
    });

    test('createDomainLists with firewallItem rules', () => {
      firewallRuleConfig.rules.push({
        name: 'test-1',
        action: 'BLOCK',
        priority: 1,
        customDomainList: 'a/b/file.text',
      } as DnsFirewallRulesConfig);
      firewallRuleConfig.rules.push({
        name: 'test-2',
        action: 'BLOCK',
        priority: 1,
        customDomainList: './resolver-configs/allowed-domains.txt',
      } as DnsFirewallRulesConfig);

      const result = resolverResources['createDomainLists'](firewallRuleConfig, domainMap, '../configs');
      expect(result.size).toBe(2);
    });

    test('createDomainLists no longer uses folder name as key', () => {
      const filename = 'allowed-domains';
      const folderName = 'resolver-configs';
      firewallRuleConfig.rules.push({
        name: 'test-2',
        action: 'BLOCK',
        priority: 1,
        customDomainList: `./${folderName}/${filename}.txt`,
      } as DnsFirewallRulesConfig);

      const result = resolverResources['createDomainLists'](firewallRuleConfig, domainMap, '../configs');
      expect(result.get(folderName)).toBeUndefined();
    });

    test('createDomainLists uses filename as key', () => {
      const filename = 'allowed-domains';
      const folderName = 'resolver-configs';
      firewallRuleConfig.rules.push({
        name: 'test-2',
        action: 'BLOCK',
        priority: 1,
        customDomainList: `./${folderName}/${filename}.txt`,
      } as DnsFirewallRulesConfig);

      const result = resolverResources['createDomainLists'](firewallRuleConfig, domainMap, '../configs');
      expect(result.get(filename)).not.toBeUndefined();
    });

    test('setRuleList uses filename as key', () => {
      const filename = 'allowed-domains';
      const folderName = 'resolver-configs';
      firewallRuleConfig.rules.push({
        name: 'test-2',
        action: 'BLOCK',
        priority: 1,
        customDomainList: `./${folderName}/${filename}.txt`,
      } as DnsFirewallRulesConfig);
      const expected = 'test-result';
      domainMap.set(filename, expected);

      const result = resolverResources['setRuleList'](firewallRuleConfig, domainMap);
      expect(result).toHaveLength(1);
      expect(result[0].firewallDomainListId).toEqual(expected);
    });
  });
});

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
import { ResolverFirewallDomainList } from '@aws-accelerator/constructs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
    vi.clearAllMocks();
    vi.spyOn(NetworkPrepStack.prototype, 'getCentralLogBucketName').mockReturnValue('unitTestLogBucket');
    vi.spyOn(NetworkPrepStack.prototype, 'getSsmPath').mockReturnValue('/test/ssm-path/');
    vi.spyOn(NetworkPrepStack.prototype, 'getAcceleratorKey').mockReturnValue(undefined);
    vi.spyOn(NetworkPrepStack.prototype, 'isIncluded').mockReturnValue(true);
    vi.spyOn(ResolverResources.prototype as any, 'createResolverQueryLogs').mockReturnValue(new Map<string, string>());
    vi.spyOn(ResolverFirewallDomainList.prototype as any, 'getAssetUrl').mockReturnValue('');
    vi.mock('aws-sdk', () => ({
      Bucket: vi.fn(function () {
        return {
          fromBucketName: vi.fn(),
        };
      }),
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

  // Regression coverage for GitLab issue #4873 defect 2:
  // createResolverQueryLogs used `break` when a VPC's query log was ASEA-managed, which
  // exited the ENTIRE VPC loop. Any VPC ordered after the first ASEA-managed one then never
  // got a query-log config or SSM parameter. The fix changes `break` to `continue`.
  describe('createResolverQueryLogs (issue #4873 defect 2)', () => {
    const delegatedAdminAccountId = '1234567890';
    const centralConfig = {} as CentralNetworkServicesConfig;
    const orgId = '1';

    test('a non-ASEA VPC ordered after an ASEA-managed VPC still gets a query-log entry', () => {
      // Construct while the top-level beforeEach mock is still active (returns an empty Map, cheap),
      // then restore the real createResolverQueryLogs so we exercise the actual loop.
      const resolverResources = new ResolverResources(
        networkStack,
        delegatedAdminAccountId,
        centralConfig,
        props,
        orgId,
      );
      vi.spyOn(ResolverResources.prototype as any, 'createResolverQueryLogs').mockRestore();

      // First VPC is ASEA-managed, second is not.
      vi.spyOn(networkStack as any, 'isManagedByAsea').mockImplementation(
        (_type: any, name: string) => name === 'asea-managed-qlog',
      );
      // Bypass the real QueryLoggingConfig construct + addSsmParameter; return a deterministic logId.
      vi.spyOn(resolverResources as any, 'createQueryLogItem').mockReturnValue({ logId: 'test-log-id' });

      const testProps = createAcceleratorStackProps();
      // Both VPCs must resolve to the stack's own account ('00000001') and region ('us-east-1'),
      // otherwise the loop body is skipped and the test would pass for the wrong reason.
      testProps.accountsConfig.getAccountId = vi.fn(() => '00000001') as any;
      (testProps.networkConfig as any).vpcs = [
        {
          name: 'asea-vpc',
          account: 'Network',
          region: 'us-east-1',
          vpcRoute53Resolver: {
            queryLogs: { name: 'asea-managed-qlog', destinations: ['s3'] },
          },
        },
        {
          name: 'lza-vpc',
          account: 'Network',
          region: 'us-east-1',
          vpcRoute53Resolver: {
            queryLogs: { name: 'lza-qlog', destinations: ['s3'] },
          },
        },
      ];

      const result: Map<string, string> = (resolverResources as any).createResolverQueryLogs(
        delegatedAdminAccountId,
        testProps,
        undefined,
        orgId,
      );

      // The second (non-ASEA) VPC must still get its query-log entry.
      // With the old `break`, the loop exited at the first ASEA-managed VPC and this was absent.
      expect(result.get('lza-qlog-s3')).toBe('test-log-id');
      // The ASEA-managed VPC is skipped, so it has no entry.
      expect(result.get('asea-managed-qlog-s3')).toBeUndefined();
    });
  });
});

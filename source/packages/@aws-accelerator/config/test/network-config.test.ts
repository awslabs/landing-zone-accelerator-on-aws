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
  NetworkConfig,
  VpcPeeringConfig,
  CentralNetworkServicesConfig,
  FirewallManagerConfig,
  GwlbConfig,
  GwlbEndpointConfig,
  NfwFirewallPolicyConfig,
  NfwFirewallPolicyPolicyConfig,
  NfwStatelessRuleGroupReferenceConfig,
  NfwStatefulRuleGroupReferenceConfig,
  NfwRuleGroupConfig,
  NfwRuleGroupRuleConfig,
  NfwRuleVariableConfig,
  NfwRuleVariableDefinitionConfig,
  NfwRuleSourceConfig,
  NfwStatelessRulesAndCustomActionsConfig,
  NfwRuleSourceStatelessRuleConfig,
  NfwRuleSourceStatelessRuleDefinitionConfig,
  NfwRuleSourceStatelessMatchAttributesConfig,
  NfwRuleSourceStatelessTcpFlagsConfig,
  NfwRuleSourceStatelessPortRangeConfig,
  NfwRuleSourceCustomActionConfig,
  NfwRuleSourceCustomActionDefinitionConfig,
  NfwRuleSourceCustomActionDimensionConfig,
  NfwRuleSourceStatefulRuleConfig,
  NfwRuleSourceStatefulRuleOptionsConfig,
  NfwRuleSourceStatefulRuleHeaderConfig,
  NfwRuleSourceListConfig,
  ResolverConfig,
  DnsFirewallRuleGroupConfig,
  DnsFirewallRulesConfig,
  DnsQueryLogsConfig,
  ResolverEndpointConfig,
  ResolverRuleConfig,
  VpcTemplatesConfig,
} from '../lib/network-config';

import { VpcFlowLogsConfig } from '../lib/common-types/types';

import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

describe('NetworkConfig', () => {
  describe('Test config', () => {
    // const networkConfigFromFile = NetworkConfig.load(path.resolve('../accelerator/test/configs/all-enabled'), true);
    it('has loaded successfully', () => {
      const networkConfig = new NetworkConfig();
      expect(networkConfig.vpcs).toEqual([]);
      // expect(networkConfigFromFile.accountNames).toEqual([
      //   'Management',
      //   'LogArchive',
      //   'Audit',
      //   'SharedServices',
      //   'Network',
      // ]);
    });

    it('loads from string', () => {
      const buffer = fs.readFileSync(
        path.join('../accelerator/test/configs/all-enabled', NetworkConfig.FILENAME),
        'utf8',
      );
      const networkConfigFromString = NetworkConfig.loadFromString(buffer);
      if (!networkConfigFromString) {
        throw new Error('networkConfigFromString is not defined');
      }
      // expect(networkConfigFromString.accountNames).toStrictEqual([]);
      //expect(NetworkConfig.loadFromString('corrupt str')).toBe(undefined);
    });

    it('test static types', () => {
      const vpcPeeringConfig = new VpcPeeringConfig();
      expect(vpcPeeringConfig.name).toEqual('');

      const centralNetworkServicesConfig = new CentralNetworkServicesConfig();
      expect(centralNetworkServicesConfig.delegatedAdminAccount).toEqual('');

      const firewallManagerServiceConfig = new FirewallManagerConfig();
      expect(firewallManagerServiceConfig.delegatedAdminAccount).toEqual('');

      const gwlbConfig = new GwlbConfig();
      expect(gwlbConfig.name).toEqual('');

      const gwlbEndpointConfig = new GwlbEndpointConfig();
      expect(gwlbEndpointConfig.name).toEqual('');

      const nfwFirewallPolicyConfig = new NfwFirewallPolicyConfig();
      expect(nfwFirewallPolicyConfig.name).toEqual('');

      const nfwFirewallPolicyPolicyConfig = new NfwFirewallPolicyPolicyConfig();
      expect(nfwFirewallPolicyPolicyConfig.statelessDefaultActions).toEqual([]);

      const nfwStatelessRuleGroupReferenceConfig = new NfwStatelessRuleGroupReferenceConfig();
      expect(nfwStatelessRuleGroupReferenceConfig.name).toEqual('');

      const nfwStatefulRuleGroupReferenceConfig = new NfwStatefulRuleGroupReferenceConfig();
      expect(nfwStatefulRuleGroupReferenceConfig.name).toEqual('');

      const nfwRuleGroupConfig = new NfwRuleGroupConfig();
      expect(nfwRuleGroupConfig.name).toEqual('');

      const nfwRuleGroupRuleConfig = new NfwRuleGroupRuleConfig();
      expect(nfwRuleGroupRuleConfig.ruleVariables).toEqual(undefined);

      const nfwRuleVariableConfig = new NfwRuleVariableConfig();
      expect(nfwRuleVariableConfig.ipSets).toEqual([{ name: '', definition: [] }]);

      const nfwRuleVariableDefinitionConfig = new NfwRuleVariableDefinitionConfig();
      expect(nfwRuleVariableDefinitionConfig.name).toEqual('');

      const nfwRuleSourceConfig = new NfwRuleSourceConfig();
      expect(nfwRuleSourceConfig.rulesSourceList).toEqual(undefined);

      const nfwStatelessRulesAndCustomActionsConfig = new NfwStatelessRulesAndCustomActionsConfig();
      expect(nfwStatelessRulesAndCustomActionsConfig.customActions).toEqual(undefined);

      const nfwRuleSourceStatelessRuleConfig = new NfwRuleSourceStatelessRuleConfig();
      expect(nfwRuleSourceStatelessRuleConfig.priority).toEqual(123);

      const nfwRuleSourceStatelessRuleDefinitionConfig = new NfwRuleSourceStatelessRuleDefinitionConfig();
      expect(nfwRuleSourceStatelessRuleDefinitionConfig.actions).toEqual(['aws:drop']);

      const nfwRuleSourceStatelessMatchAttributesConfig = new NfwRuleSourceStatelessMatchAttributesConfig();
      expect(nfwRuleSourceStatelessMatchAttributesConfig.sources).toEqual(undefined);

      const nfwRuleSourceStatelessTcpFlagsConfig = new NfwRuleSourceStatelessTcpFlagsConfig();
      expect(nfwRuleSourceStatelessTcpFlagsConfig.flags).toEqual([]);

      const nfwRuleSourceStatelessPortRangeConfig = new NfwRuleSourceStatelessPortRangeConfig();
      expect(nfwRuleSourceStatelessPortRangeConfig.fromPort).toEqual(123);

      const nfwRuleSourceCustomActionConfig = new NfwRuleSourceCustomActionConfig();
      expect(nfwRuleSourceCustomActionConfig.actionName).toEqual('');

      const nfwRuleSourceCustomActionDefinitionConfig = new NfwRuleSourceCustomActionDefinitionConfig();
      expect(nfwRuleSourceCustomActionDefinitionConfig.publishMetricAction.dimensions).toEqual([]);

      const nfwRuleSourceCustomActionDimensionConfig = new NfwRuleSourceCustomActionDimensionConfig();
      expect(nfwRuleSourceCustomActionDimensionConfig.dimensions).toEqual([]);

      const nfwRuleSourceStatefulRuleConfig = new NfwRuleSourceStatefulRuleConfig();
      expect(nfwRuleSourceStatefulRuleConfig.action).toEqual('DROP');

      const nfwRuleSourceStatefulRuleOptionsConfig = new NfwRuleSourceStatefulRuleOptionsConfig();
      expect(nfwRuleSourceStatefulRuleOptionsConfig.keyword).toEqual('');

      const nfwRuleSourceStatefulRuleHeaderConfig = new NfwRuleSourceStatefulRuleHeaderConfig();
      expect(nfwRuleSourceStatefulRuleHeaderConfig.destination).toEqual('');

      const nfwRuleSourceListConfig = new NfwRuleSourceListConfig();
      expect(nfwRuleSourceListConfig.targets).toEqual([]);

      const resolverConfig = new ResolverConfig();
      expect(resolverConfig.endpoints).toEqual(undefined);

      const dnsFirewallRuleGroupConfig = new DnsFirewallRuleGroupConfig();
      expect(dnsFirewallRuleGroupConfig.name).toEqual('');

      const dnsFirewallRulesConfig = new DnsFirewallRulesConfig();
      expect(dnsFirewallRulesConfig.name).toEqual('');

      const dnsQueryLogsConfig = new DnsQueryLogsConfig();
      expect(dnsQueryLogsConfig.name).toEqual('');

      const resolverEndpointConfig = new ResolverEndpointConfig();
      expect(resolverEndpointConfig.name).toEqual('');

      const resolverRuleConfig = new ResolverRuleConfig();
      expect(resolverRuleConfig.name).toEqual('');

      const vpcFlowLogsConfig = new VpcFlowLogsConfig();
      expect(vpcFlowLogsConfig.trafficType).toEqual('ALL');

      const vpcTemplatesConfig = new VpcTemplatesConfig();
      expect(vpcTemplatesConfig.name).toEqual('');
    });
  });
});

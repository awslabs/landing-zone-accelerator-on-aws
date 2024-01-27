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

import {
  AseaResourceType,
  CentralNetworkServicesConfig,
  NfwRuleGroupConfig,
  NfwRuleGroupRuleConfig,
  NfwStatefulRuleGroupReferenceConfig,
  NfwStatelessRuleGroupReferenceConfig,
} from '@aws-accelerator/config';
import { FirewallPolicyProperty, NetworkFirewallPolicy, NetworkFirewallRuleGroup } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import fs from 'fs';
import { pascalCase } from 'pascal-case';
import path from 'path';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class NfwResources {
  public readonly policyMap: Map<string, string>;
  public readonly ruleGroupMap: Map<string, string>;
  private stack: NetworkPrepStack;
  constructor(
    networkPrepStack: NetworkPrepStack,
    delegatedAdminAccountId: string,
    centralConfig: CentralNetworkServicesConfig,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkPrepStack;

    // Create NFW rule groups
    this.ruleGroupMap = this.createNfwRuleGroups(delegatedAdminAccountId, centralConfig, props);
    // Create NFW policies
    this.policyMap = this.createNfwPolicies(delegatedAdminAccountId, this.ruleGroupMap, centralConfig);
  }

  /**
   * Create AWS Network Firewall rule groups
   * @param accountId
   * @param ruleItem
   */
  private createNfwRuleGroups(
    accountId: string,
    centralConfig: CentralNetworkServicesConfig,
    props: AcceleratorStackProps,
  ): Map<string, string> {
    const ruleGroupMap = new Map<string, string>();

    for (const ruleItem of centralConfig.networkFirewall?.rules ?? []) {
      const regions = ruleItem.regions.map(item => {
        return item.toString();
      });

      // Create regional rule groups in the delegated admin account
      if (this.stack.isTargetStack([accountId], regions)) {
        this.stack.addLogs(LogLevel.INFO, `Create network firewall rule group ${ruleItem.name}`);
        let rule;
        if (this.stack.isManagedByAsea(AseaResourceType.NFW_RULE_GROUP, ruleItem.name)) {
          const groupArn = this.stack.getExternalResourceParameter(
            this.stack.getSsmPath(SsmResourceType.NFW_RULE_GROUP, [ruleItem.name]),
          );
          rule = NetworkFirewallRuleGroup.fromAttributes(
            this.stack,
            pascalCase(`${ruleItem.name}NetworkFirewallRuleGroup`),
            {
              groupArn,
              groupName: ruleItem.name,
            },
          );
        } else {
          //
          // Create rule group
          rule = new NetworkFirewallRuleGroup(this.stack, pascalCase(`${ruleItem.name}NetworkFirewallRuleGroup`), {
            capacity: ruleItem.capacity,
            name: ruleItem.name,
            type: ruleItem.type,
            description: ruleItem.description,
            ruleGroup: this.getRuleGroupRuleConfig(ruleItem, props),
            tags: ruleItem.tags ?? [],
          });

          this.stack.addSsmParameter({
            logicalId: pascalCase(`SsmParam${ruleItem.name}NetworkFirewallRuleGroup`),
            parameterName: this.stack.getSsmPath(SsmResourceType.NFW_RULE_GROUP, [ruleItem.name]),
            stringValue: rule.groupArn,
          });

          if (ruleItem.shareTargets) {
            this.stack.addLogs(LogLevel.INFO, `Share Network Firewall rule group ${ruleItem.name}`);
            this.stack.addResourceShare(ruleItem, `${ruleItem.name}_NetworkFirewallRuleGroupShare`, [rule.groupArn]);
          }
        }
        ruleGroupMap.set(ruleItem.name, rule.groupArn);
      }
    }
    return ruleGroupMap;
  }

  /**
   * Get rule group rule configuration for a given rule group item
   * @param ruleItem
   * @param props
   * @returns
   */
  private getRuleGroupRuleConfig(
    ruleItem: NfwRuleGroupConfig,
    props: AcceleratorStackProps,
  ): NfwRuleGroupRuleConfig | undefined {
    return ruleItem.ruleGroup?.rulesSource.rulesFile
      ? {
          rulesSource: {
            rulesString: this.getSuricataRules(
              ruleItem.ruleGroup?.rulesSource.rulesFile,
              fs.readFileSync(path.join(props.configDirPath, ruleItem.ruleGroup?.rulesSource.rulesFile), 'utf8'),
            ),
            rulesSourceList: undefined,
            statefulRules: undefined,
            statelessRulesAndCustomActions: undefined,
            rulesFile: undefined,
          },
          ruleVariables: ruleItem.ruleGroup?.ruleVariables,
          statefulRuleOptions: ruleItem.ruleGroup.statefulRuleOptions,
        }
      : ruleItem.ruleGroup;
  }

  /**
   * Function to read suricata rule file and get rule definition
   * @param fileName
   * @param fileContent
   * @returns
   */
  private getSuricataRules(fileName: string, fileContent: string): string {
    const rules: string[] = [];
    // Suricata supported action type list
    // @link https://suricata.readthedocs.io/en/suricata-6.0.2/rules/intro.html#action
    const suricataRuleActionType = ['alert', 'pass', 'drop', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth'];
    fileContent.split(/\r?\n/).forEach(line => {
      const ruleAction = line.split(' ')[0];
      if (suricataRuleActionType.includes(ruleAction)) {
        rules.push(line);
      }
    });

    if (rules.length > 0) {
      return rules.join('\n');
    } else {
      this.stack.addLogs(LogLevel.ERROR, `No rule definition found in suricata rules file ${fileName}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
  }

  /**
   * Create AWS Network Firewall policy
   * @param accountId
   * @param policyItem
   */
  private createNfwPolicies(
    accountId: string,
    ruleGroupMap: Map<string, string>,
    centralConfig: CentralNetworkServicesConfig,
  ): Map<string, string> {
    const policyMap = new Map<string, string>();

    for (const policyItem of centralConfig.networkFirewall?.policies ?? []) {
      const regions = policyItem.regions.map(item => {
        return item.toString();
      });

      // Create regional rule groups in the delegated admin account
      if (this.stack.isTargetStack([accountId], regions)) {
        // Instantiate firewall policy construct
        this.stack.addLogs(LogLevel.INFO, `Create network firewall policy ${policyItem.name}`);
        let policy;
        if (this.stack.isManagedByAsea(AseaResourceType.NFW_POLICY, policyItem.name)) {
          const policyArn = this.stack.getExternalResourceParameter(
            this.stack.getSsmPath(SsmResourceType.NFW_POLICY, [policyItem.name]),
          );
          policy = NetworkFirewallPolicy.fromAttributes(
            this.stack,
            pascalCase(`${policyItem.name}NetworkFirewallPolicy`),
            {
              policyArn,
              policyName: policyItem.name,
            },
          );
        } else {
          // Create new firewall policy object with rule group references
          const firewallPolicy: FirewallPolicyProperty = {
            statelessDefaultActions: policyItem.firewallPolicy.statelessDefaultActions,
            statelessFragmentDefaultActions: policyItem.firewallPolicy.statelessFragmentDefaultActions,
            statefulDefaultActions: policyItem.firewallPolicy.statefulDefaultActions,
            statefulEngineOptions: policyItem.firewallPolicy.statefulEngineOptions,
            statefulRuleGroupReferences: policyItem.firewallPolicy.statefulRuleGroups
              ? this.getStatefulRuleGroupReferences(policyItem.firewallPolicy.statefulRuleGroups, ruleGroupMap)
              : [],
            statelessCustomActions: policyItem.firewallPolicy.statelessCustomActions,
            statelessRuleGroupReferences: policyItem.firewallPolicy.statelessRuleGroups
              ? this.getStatelessRuleGroupReferences(policyItem.firewallPolicy.statelessRuleGroups, ruleGroupMap)
              : [],
          };
          policy = new NetworkFirewallPolicy(this.stack, pascalCase(`${policyItem.name}NetworkFirewallPolicy`), {
            name: policyItem.name,
            firewallPolicy,
            description: policyItem.description,
            tags: policyItem.tags ?? [],
          });
          this.stack.addSsmParameter({
            logicalId: pascalCase(`SsmParam${policyItem.name}NetworkFirewallPolicy`),
            parameterName: this.stack.getSsmPath(SsmResourceType.NFW_POLICY, [policyItem.name]),
            stringValue: policy.policyArn,
          });

          if (policyItem.shareTargets) {
            this.stack.addLogs(LogLevel.INFO, `Share Network Firewall policy ${policyItem.name}`);
            this.stack.addResourceShare(policyItem, `${policyItem.name}_NetworkFirewallPolicyShare`, [
              policy.policyArn,
            ]);
          }
        }
        policyMap.set(policyItem.name, policy.policyArn);
      }
    }
    return policyMap;
  }

  /**
   * Return stateful rule group references
   * @param ruleGroupReferences
   * @param ruleGroupMap
   * @returns
   */
  private getStatefulRuleGroupReferences(
    ruleGroupReferences: NfwStatefulRuleGroupReferenceConfig[],
    ruleGroupMap: Map<string, string>,
  ): { resourceArn: string; priority?: number }[] {
    const references: { resourceArn: string; priority?: number }[] = [];

    for (const reference of ruleGroupReferences) {
      if (!ruleGroupMap.get(reference.name)) {
        this.stack.addLogs(LogLevel.ERROR, `Stateful rule group ${reference.name} not found in rule map`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      references.push({ resourceArn: ruleGroupMap.get(reference.name)!, priority: reference.priority });
    }
    return references;
  }

  /**
   * Return stateless rule group references
   * @param ruleGroupReferences
   * @param ruleGroupMap
   * @returns
   */
  private getStatelessRuleGroupReferences(
    ruleGroupReferences: NfwStatelessRuleGroupReferenceConfig[],
    ruleGroupMap: Map<string, string>,
  ): { priority: number; resourceArn: string }[] {
    const references: { priority: number; resourceArn: string }[] = [];

    for (const reference of ruleGroupReferences) {
      if (!ruleGroupMap.get(reference.name)) {
        this.stack.addLogs(LogLevel.ERROR, `Stateless rule group ${reference.name} not found in rule map`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      references.push({ priority: reference.priority, resourceArn: ruleGroupMap.get(reference.name)! });
    }
    return references;
  }
}

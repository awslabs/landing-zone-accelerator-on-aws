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
import { Construct } from 'constructs';

import { NfwRuleGroupRuleConfig, NfwRuleVariableDefinitionConfig } from '@aws-accelerator/config';

interface INetworkFirewallRuleGroup extends cdk.IResource {
  /**
   * The Amazon Resource Name (ARN) of the rule group.
   */
  readonly groupArn: string;

  /**
   * The ID of the rule group.
   */
  readonly groupId: string;

  /**
   * The name of the rule group.
   */
  readonly groupName: string;
}

interface NetworkFirewallRuleGroupProps {
  /**
   * The maximum operating resources that this rule group can use.
   */
  readonly capacity: number;

  /**
   * The name of the rule group.
   */
  readonly name: string;

  /**
   * Indicates whether the rule group is stateless or stateful.
   */
  readonly type: string;

  /**
   * A description of the rule group.
   */
  readonly description?: string;

  /**
   * An object that defines the rule group rules.
   */
  readonly ruleGroup?: NfwRuleGroupRuleConfig;

  /**
   * An optional list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class NetworkFirewallRuleGroup extends cdk.Resource implements INetworkFirewallRuleGroup {
  public readonly groupArn: string;
  public readonly groupId: string;
  public readonly groupName: string;
  private ruleGroup?: cdk.aws_networkfirewall.CfnRuleGroup.RuleGroupProperty;

  constructor(scope: Construct, id: string, props: NetworkFirewallRuleGroupProps) {
    super(scope, id);

    // Set initial properties
    this.groupName = props.name;

    // Transform properties as necessary
    if (props.ruleGroup) {
      // Set rule group property
      this.ruleGroup = {
        rulesSource: {
          rulesSourceList: props.ruleGroup.rulesSource.rulesSourceList,
          rulesString: props.ruleGroup.rulesSource.rulesString,
          statefulRules: props.ruleGroup.rulesSource.statefulRules,
          statelessRulesAndCustomActions: this.transformStatelessCustom(props.ruleGroup),
        },
        ruleVariables: this.transformRuleVariables(props.ruleGroup),
        statefulRuleOptions: this.transformRuleOptions(props.ruleGroup),
      };
    }

    // Set name tag
    props.tags?.push({ key: 'Name', value: this.groupName });

    const resource = new cdk.aws_networkfirewall.CfnRuleGroup(this, 'Resource', {
      capacity: props.capacity,
      ruleGroupName: this.groupName,
      type: props.type,
      description: props.description,
      ruleGroup: this.ruleGroup,
      tags: props.tags,
    });

    this.groupArn = resource.ref;
    this.groupId = resource.attrRuleGroupId;
  }

  /**
   * Transform stateless and custom rule group policies to conform with L1 construct.
   *
   * @param props
   */
  private transformStatelessCustom(props: NfwRuleGroupRuleConfig) {
    const property = props.rulesSource.statelessRulesAndCustomActions;
    const statelessRules = [];
    const customActions = [];

    if (property) {
      // Push stateless rules
      for (const rule of property.statelessRules ?? []) {
        statelessRules.push({
          priority: rule.priority,
          ruleDefinition: {
            actions: rule.ruleDefinition.actions,
            matchAttributes: {
              destinationPorts: rule.ruleDefinition.matchAttributes?.destinationPorts ?? [],
              destinations:
                rule.ruleDefinition.matchAttributes?.destinations?.map(item => {
                  return { addressDefinition: item };
                }) ?? [],
              protocols: rule.ruleDefinition.matchAttributes?.protocols ?? [],
              sourcePorts: rule.ruleDefinition.matchAttributes?.sourcePorts ?? [],
              sources:
                rule.ruleDefinition.matchAttributes?.sources?.map(item => {
                  return { addressDefinition: item };
                }) ?? [],
              tcpFlags: rule.ruleDefinition.matchAttributes?.tcpFlags,
            },
          },
        });
      }

      // Push custom actions
      for (const action of property.customActions ?? []) {
        customActions.push({
          actionDefinition: {
            publishMetricAction: {
              dimensions: action.actionDefinition.publishMetricAction.dimensions.map(item => {
                return { value: item };
              }),
            },
          },
          actionName: action.actionName,
        });
      }

      return {
        statelessRules,
        customActions,
      };
    }
    return undefined;
  }

  /**
   * Transform rule variables to conform with L1 construct.
   *
   * @param props
   */
  private transformRuleVariables(props: NfwRuleGroupRuleConfig) {
    const property = props.ruleVariables;
    const ipSets: { [key: string]: { definition: string[] } } = {};
    const portSets: { [key: string]: { definition: string[] } } = {};

    if (property) {
      const ipSetDefinitions = this.getVariableDefinitions(property.ipSets);
      const portSetDefinitions = this.getVariableDefinitions(property.portSets);

      ipSetDefinitions.forEach(ipSet => {
        ipSets[ipSet.name] = { definition: ipSet.definition };
      });

      portSetDefinitions.forEach(portSet => {
        portSets[portSet.name] = { definition: portSet.definition };
      });

      return {
        ipSets,
        portSets,
      };
    }
    return undefined;
  }

  /**
   * Takes in variable definitions as a map or array and transforms them into an array
   * @param definition
   * @returns
   */
  private getVariableDefinitions(
    definition: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[],
  ): NfwRuleVariableDefinitionConfig[] {
    const variableDefinitions: NfwRuleVariableDefinitionConfig[] = [];

    if (Array.isArray(definition)) {
      variableDefinitions.push(...definition);
    } else {
      variableDefinitions.push(definition);
    }

    return variableDefinitions;
  }

  /**
   * Transform rule options to conform with L1 construct.
   *
   * @param props
   */
  private transformRuleOptions(props: NfwRuleGroupRuleConfig) {
    const property = props.statefulRuleOptions;

    if (property) {
      return { ruleOrder: property };
    }
    return undefined;
  }
}

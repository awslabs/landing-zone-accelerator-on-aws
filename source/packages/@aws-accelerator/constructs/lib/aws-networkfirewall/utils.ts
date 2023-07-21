import * as cdk from 'aws-cdk-lib';
import { NfwRuleGroupRuleConfig, NfwRuleVariableDefinitionConfig } from '@aws-accelerator/config';
import { FirewallPolicyProperty } from './policy';

/**
 * Transform stateless and custom rule group policies to conform with L1 construct.
 *
 * @param props
 */
function transformStatelessCustom(props: NfwRuleGroupRuleConfig) {
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
      customActions: customActions.length > 0 ? customActions : undefined,
    };
  }
  return undefined;
}

/**
 * Transform rule variables to conform with L1 construct.
 *
 * @param props
 */
function transformRuleVariables(props: NfwRuleGroupRuleConfig) {
  const property = props.ruleVariables;
  const ipSets: { [key: string]: { definition: string[] } } = {};
  const portSets: { [key: string]: { definition: string[] } } = {};

  if (property) {
    const ipSetDefinitions = getVariableDefinitions(property.ipSets);
    const portSetDefinitions = getVariableDefinitions(property.portSets);

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
function getVariableDefinitions(
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
function transformRuleOptions(props: NfwRuleGroupRuleConfig) {
  const property = props.statefulRuleOptions;

  if (property) {
    return { ruleOrder: property };
  }
  return undefined;
}

/**
 * Transform rule group to conform with L1 construct.
 * @param ruleGroup
 * @returns
 */
export function transformRuleGroup(ruleGroup: NfwRuleGroupRuleConfig) {
  return {
    rulesSource: {
      rulesSourceList: ruleGroup.rulesSource.rulesSourceList,
      rulesString: ruleGroup.rulesSource.rulesString,
      statefulRules: ruleGroup.rulesSource.statefulRules,
      statelessRulesAndCustomActions: transformStatelessCustom(ruleGroup),
    },
    ruleVariables: transformRuleVariables(ruleGroup),
    statefulRuleOptions: transformRuleOptions(ruleGroup),
  };
}

/**
 * Transform custom actions to conform with L1 construct.
 *
 * @param props
 */
function transformPolicyCustomActions(props: FirewallPolicyProperty) {
  const property = props.statelessCustomActions;
  const customActions = [];

  for (const action of property ?? []) {
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
  return customActions;
}

/**
 * Transform engine options to conform with L1 construct.
 *
 * @param props
 */
function transformPolicyEngineOptions(props: FirewallPolicyProperty) {
  const property = props.statefulEngineOptions;
  if (property) {
    return { ruleOrder: property };
  }
  return;
}

export function transformPolicy(
  firewallPolicy: FirewallPolicyProperty,
): cdk.aws_networkfirewall.CfnFirewallPolicy.FirewallPolicyProperty {
  let customActions: cdk.aws_networkfirewall.CfnFirewallPolicy.CustomActionProperty[] | undefined;
  let statefulOptions: cdk.aws_networkfirewall.CfnFirewallPolicy.StatefulEngineOptionsProperty | undefined;
  // Transform properties as necessary
  if (firewallPolicy.statelessCustomActions) {
    customActions = transformPolicyCustomActions(firewallPolicy);
  }
  if (firewallPolicy.statefulEngineOptions) {
    statefulOptions = transformPolicyEngineOptions(firewallPolicy);
  }
  return {
    statelessDefaultActions: firewallPolicy.statelessDefaultActions,
    statelessFragmentDefaultActions: firewallPolicy.statelessFragmentDefaultActions,
    statefulDefaultActions: firewallPolicy.statefulDefaultActions,
    statefulEngineOptions: statefulOptions,
    statefulRuleGroupReferences: firewallPolicy.statefulRuleGroupReferences,
    statelessCustomActions: customActions,
    statelessRuleGroupReferences: firewallPolicy.statelessRuleGroupReferences,
  };
}

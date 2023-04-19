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

import path from 'path';
import * as fs from 'fs';
import {
  NetworkConfig,
  NfwRuleGroupConfig,
  NfwStatelessRulesAndCustomActionsConfig,
  NfwRuleSourceStatelessRuleDefinitionConfig,
  NfwRuleSourceStatelessMatchAttributesConfig,
  NetworkConfigTypes,
  NfwFirewallPolicyConfig,
  NfwRuleSourceCustomActionConfig,
  NfwRuleSourceStatefulRuleConfig,
  NfwRuleSourceStatefulRuleOptionsConfig,
  NfwRuleVariableDefinitionConfig,
  NfwFirewallConfig,
  SubnetConfig,
} from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate network firewall
 */
export class NetworkFirewallValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate rule groups
    //
    this.validateRuleGroups(values, helpers, errors);
    //
    // Valiodate rule variables
    //
    this.validateRuleVariables(values, helpers, errors);
    //
    // Validate suricata rule file
    //
    this.validateSuricataFile(values, configDir, errors);
    //
    // Validate policies
    //
    this.validatePolicies(values, helpers, errors);
    //
    // Validate firewalls
    //
    this.validateFirewalls(values, helpers, errors);
  }

  private validateRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate rule group names
    //
    this.validateRuleGroupNames(values, helpers, errors);
    //
    // Validate rule group share target OUs
    //
    this.validateRuleGroupShareTargetOus(values, helpers, errors);
    //
    // Validate rule group share target account names
    //
    this.validateRuleGroupShareTargetAccountNames(values, helpers, errors);
    //
    // Confirm that the rule group definition is valid
    //
    const allValid = this.validateRulesSourceDefinition(values, helpers, errors);

    if (allValid) {
      //
      // Validate rule group rules
      //
      this.validateRuleGroupRules(values, helpers, errors);
    }
  }

  /**
   * Validate uniqueness of rule group names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleGroups = values.centralNetworkServices?.networkFirewall?.rules;
    if (ruleGroups) {
      const ruleGroupNames = ruleGroups.map(group => {
        return group.name;
      });

      if (helpers.hasDuplicates(ruleGroupNames)) {
        errors.push(
          `Duplicate Network Firewall rule group names exist. Rule group names must be unique. Rule group names in file: ${ruleGroupNames}`,
        );
      }

      for (const name of ruleGroupNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall rule group name "${name}" is invalid. Rule group names must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  /**
   * Validate rule group share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupShareTargetOus(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const group of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      for (const ou of group.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Network Firewall rule group ${group.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate rule group share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupShareTargetAccountNames(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const group of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      for (const account of group.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Network Firewall rule group ${group.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate that each rule group only contains a single rule source
   * @param values
   * @param errors
   * @returns
   */
  private validateRulesSourceDefinition(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    let allValid = true;
    for (const rule of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      const ruleSource = rule.ruleGroup?.rulesSource;

      if (ruleSource) {
        const keys = helpers.getObjectKeys(ruleSource);

        if (keys.length > 1) {
          allValid = false;
          errors.push(
            `[Network Firewall rule group ${rule.name}]: rules source has multiple properties defined. Please only define a single rules source per rule group. Rules sources for this rule: ${keys}`,
          );
        }
      }
    }
    return allValid;
  }

  /**
   * Validate rules in each rule group type
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      const rulesSource = rule.ruleGroup?.rulesSource;
      if (rulesSource) {
        // Validate stateless rules and custom actions
        if (rulesSource.statelessRulesAndCustomActions) {
          this.validateStatelessRuleGroups(rule, helpers, errors);
          this.validateCustomActions(rule, helpers, errors);
        }
        // Validate stateful rules
        if (rulesSource.statefulRules) {
          this.validateStatefulRuleGroups(rule, helpers, errors);
        }
        // Validate domain lists
        if (rulesSource.rulesSourceList) {
          this.validateDomainList(rule, helpers, errors);
        }
        // Validate rule strings
        if (rulesSource.rulesString) {
          this.validateRuleString(rule, errors);
        }
      }
    });
  }

  /**
   * Validate stateless rule groups
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleGroups(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const statelessRules = rule.ruleGroup!.rulesSource.statelessRulesAndCustomActions!;
    // Validate the rule type is STATELESS
    if (rule.type !== 'STATELESS') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource statelessRulesAndCustomActions must be STATELESS`,
      );
    }

    // Validate priorities are unique
    const priorities = statelessRules.statelessRules.map(item => {
      return item.priority.toString();
    });
    if (helpers.hasDuplicates(priorities)) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: Duplicate priorities in rule group. Please assign unique priority values. Priorities in rule group: ${priorities}`,
      );
    }

    // Validate priorities are within constraints
    let allValid = true;
    for (const priority of priorities) {
      if (parseInt(priority) < 1 || parseInt(priority) > 65535) {
        allValid = false;
      }
    }

    if (!allValid) {
      errors.push(
        `[Network firewall rule group ${rule.name}]: Invalid priority value in rule group. Priority must be a number between 1 and 65535. Priorities in rule group: ${priorities}`,
      );
    }

    // Validate if the rule group includes options only available to stateful groups
    if (rule.ruleGroup?.ruleVariables || rule.ruleGroup?.statefulRuleOptions) {
      errors.push(
        `[Network firewall rule group ${rule.name}]: stateless rule groups cannot contain the ruleVariables or statefulRuleOptions properties`,
      );
    }

    // Validate rule definition
    this.validateStatelessRuleDefinitions(rule, statelessRules, helpers, errors);
  }

  /**
   * Validate stateless rule group definitions
   * @param rule
   * @param statelessRules
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleDefinitions(
    rule: NfwRuleGroupConfig,
    statelessRules: NfwStatelessRulesAndCustomActionsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ruleItem of statelessRules.statelessRules) {
      const definition = ruleItem.ruleDefinition;

      // Validate ports and CIDRs
      this.validateStatelessRuleDefinitionHeader(rule, definition, helpers, errors);
    }
  }

  /**
   * Validate IP header details for stateless rule groups
   * @param rule
   * @param definition
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleDefinitionHeader(
    rule: NfwRuleGroupConfig,
    definition: NfwRuleSourceStatelessRuleDefinitionConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const attributes = definition.matchAttributes;
    // Validate CIDRs
    const cidrs = [...(attributes.sources ?? []), ...(attributes.destinations ?? [])] ?? [];
    cidrs.forEach(cidr => {
      if (!helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: invalid CIDR ${cidr} in matchAttributes configuration`,
        );
      }
    });

    // Validate ports
    if (attributes.destinationPorts || attributes.sourcePorts) {
      const isValidProtocol = attributes.protocols
        ? attributes.protocols.includes(6) || attributes.protocols.includes(17)
        : true;

      if (!isValidProtocol) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: matchAttributes protocols must include 6 (TCP) and/or 17 (UDP) if sourcePorts or destinationPorts are defined`,
        );
      }

      // Validate port range values
      this.validateStatelessRuleDefinitionPortRanges(rule, attributes, errors);
    }

    // Validate TCP flags
    if (attributes.tcpFlags) {
      this.validateStatelessRuleDefinitionTcpFlags(rule, attributes, errors);
    }
  }

  /**
   * Validate stateless rule group port ranges
   * @param rule
   * @param attributes
   * @param errors
   */
  private validateStatelessRuleDefinitionPortRanges(
    rule: NfwRuleGroupConfig,
    attributes: NfwRuleSourceStatelessMatchAttributesConfig,
    errors: string[],
  ) {
    // Validate protocol number
    const isTcpProtocol = attributes.protocols ? attributes.protocols.includes(6) : true;

    if (!isTcpProtocol) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: matchAttributes protocols must include 6 (TCP) if tcpFlags are defined`,
      );
    }
    // Validate attributes
    const portRanges = [...(attributes.destinationPorts ?? []), ...(attributes.sourcePorts ?? [])] ?? [];
    portRanges.forEach(portRange => {
      const isValidPortRange = portRange.fromPort <= portRange.toPort;
      const portRangeString = `fromPort: ${portRange.fromPort}, toPort: ${portRange.toPort}`;

      if (!isValidPortRange) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: fromPort must be less than or equal to toPort. Defined port range: ${portRangeString}`,
        );
      }

      if (isValidPortRange && (portRange.fromPort < 0 || portRange.fromPort > 65535)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: fromPort value must be between 0 and 65535. Defined port range: ${portRangeString}`,
        );
      }

      if (isValidPortRange && (portRange.toPort < 0 || portRange.toPort > 65535)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: toPort value must be between 0 and 65535. Defined port range: ${portRangeString}`,
        );
      }
    });
  }

  /**
   * Validate stateless rule definition TCP flags
   * @param rule
   * @param attributes
   * @param errors
   */
  private validateStatelessRuleDefinitionTcpFlags(
    rule: NfwRuleGroupConfig,
    attributes: NfwRuleSourceStatelessMatchAttributesConfig,
    errors: string[],
  ) {
    for (const flagItem of attributes.tcpFlags ?? []) {
      const nonMatchingFlags = flagItem.flags.filter(item => !flagItem.masks.includes(item));

      if (nonMatchingFlags.length > 0) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: invalid TCP flags contained in rule definition. If masks are defined, flags can only contain values also contained in masks. Flags: ${flagItem.flags}, Masks: ${flagItem.masks}`,
        );
      }
    }
  }

  /**
   * Validate stateless custom actions
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateCustomActions(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const customActions = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.customActions;
    const statelessRules = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.statelessRules;
    let allValid = true;

    for (const ruleItem of statelessRules ?? []) {
      for (const action of ruleItem.ruleDefinition.actions) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !customActions) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleDefinition custom action "${action}" is invalid. No matching actionName defined under the customActions property`,
          );
        }
      }
    }

    if (customActions) {
      allValid = this.validateCustomActionNames(rule, customActions, helpers, errors);
    }

    if (customActions && allValid) {
      this.validateStatelessRuleActions(rule, customActions, errors);
    }
  }

  /**
   * Validate custom action names and dimensions
   * @param resource
   * @param customActions
   * @param helpers
   * @param errors
   * @returns
   */
  private validateCustomActionNames(
    resource: NfwRuleGroupConfig | NfwFirewallPolicyConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const actionNames = customActions.map(item => {
      return item.actionName;
    });
    let allValid = true;
    const resourceType = NetworkConfigTypes.nfwRuleGroupConfig.is(resource) ? 'rule group' : 'policy';

    // Check if duplicate action names are defined
    if (helpers.hasDuplicates(actionNames)) {
      allValid = false;
      errors.push(
        `[Network Firewall ${resourceType} ${resource.name}]: customActions definition has duplicate actionNames defined. Please define unique actionNames. actionNames in file: ${actionNames}`,
      );
    }

    // Validate action name regex
    for (const actionName of actionNames) {
      if (!helpers.matchesRegex(actionName, '^[a-zA-Z0-9]+$')) {
        allValid = false;
        errors.push(
          `[Network Firewall ${resourceType} ${resource.name}]: customActions actionName "${actionName}" is invalid. actionName must match regular expression "^[a-zA-Z0-9]+$"`,
        );
      }
    }

    // Validate action definition regex
    for (const action of customActions) {
      for (const dimension of action.actionDefinition.publishMetricAction.dimensions) {
        if (!helpers.matchesRegex(dimension, '^[a-zA-Z0-9-_ ]+$')) {
          allValid = false;
          errors.push(
            `[Network Firewall ${resourceType} ${resource.name}]: customActions actionDefinition dimension "${dimension}" is invalid. Dimension must match regular expression "^[a-zA-Z0-9-_ ]+$"`,
          );
        }
      }
    }
    return allValid;
  }

  /**
   * Validate stateless custom actions defined in a rule definition
   * @param rule
   * @param customActions
   * @param errors
   */
  private validateStatelessRuleActions(
    rule: NfwRuleGroupConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    errors: string[],
  ) {
    const ruleDefinitions = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.statelessRules;
    const actionNames = customActions.map(item => {
      return item.actionName;
    });

    for (const definition of ruleDefinitions ?? []) {
      for (const action of definition.ruleDefinition.actions) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !actionNames.includes(action)) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleDefinition custom action "${action}" is invalid. Custom actions must be defined under the customActions property`,
          );
        }
      }
    }
  }

  private validateStatefulRuleGroups(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const statefulRules = rule.ruleGroup!.rulesSource.statefulRules!;
    // Validate rule type
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource statefulRules must be STATEFUL`,
      );
    }

    // Validate sids are unique
    const allValid = this.validateStatefulSids(rule, statefulRules, helpers, errors);

    // Validate rule definitions
    if (allValid) {
      for (const ruleItem of statefulRules) {
        // Validate rule header
        this.validateStatefulRuleHeader(rule, ruleItem, helpers, errors);
        // Validate rule options
        this.validateStatefulRuleOptions(rule, ruleItem, helpers, errors);
      }
    }
  }

  /**
   * Returns true if stateful rules all have unique and valid sid options
   * @param rule
   * @param statefulRules
   * @param helpers
   * @param errors
   * @returns
   */
  private validateStatefulSids(
    rule: NfwRuleGroupConfig,
    statefulRules: NfwRuleSourceStatefulRuleConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    let allValid = true;

    // Retrieve sids from rule options
    const sids: NfwRuleSourceStatefulRuleOptionsConfig[] = [];
    for (const ruleItem of statefulRules) {
      for (const optionItem of ruleItem.ruleOptions) {
        if (optionItem.keyword === 'sid') {
          sids.push(optionItem);
        }
      }
    }

    // Validate there is a sid for each rule
    if (sids.length < statefulRules.length) {
      allValid = false;
      errors.push(
        `[Network Firewall rule group ${rule.name}]: one or more stateful rule definition rule options does not include "sid" keyword. "sid" keyword is required for all stateful rules`,
      );
    }
    if (sids.length > statefulRules.length) {
      allValid = false;
      errors.push(
        `[Network Firewall rule group ${rule.name}]: one or more stateful rule definition rule options includes multiple "sid" keywords. Only one "sid" keyword may be defined for all stateful rules`,
      );
    }

    // Validate sid ids
    const idsValid = this.validateStatefulSidSettings(rule, sids, helpers, errors);
    if (!idsValid) {
      allValid = false;
    }

    if (idsValid) {
      // Validate sids are unique
      const ids = sids.map(item => {
        return item.settings![0];
      });

      if (helpers.hasDuplicates(ids)) {
        allValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule options "sid" IDs contain duplicates. "sid" IDs must be unique`,
        );
      }
    }
    return allValid;
  }

  /**
   * Returns true if sid settings values are unique and valid
   * @param rule
   * @param sids
   * @param helpers
   * @param errors
   * @returns
   */
  private validateStatefulSidSettings(
    rule: NfwRuleGroupConfig,
    sids: NfwRuleSourceStatefulRuleOptionsConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate sid settings
    let idsValid = true;
    for (const sid of sids) {
      if (!sid.settings) {
        idsValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: one or more stateful rule options "sid" keywords does not have a corresponding ID set in settings`,
        );
      }

      if (sid.settings && (sid.settings.length > 1 || !helpers.matchesRegex(sid.settings[0], '^\\d+$'))) {
        idsValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: one or more stateful rule options "sid" IDs are invalid. "sid" IDs must be a number in string quotes`,
        );
      }
    }
    return idsValid;
  }

  /**
   * Validate stateful rule header object
   * @param rule
   * @param statefulRule
   * @param helpers
   * @param errors
   */
  private validateStatefulRuleHeader(
    rule: NfwRuleGroupConfig,
    statefulRule: NfwRuleSourceStatefulRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const anyArray = ['any', 'ANY'];
    // Validate IP addresses
    [statefulRule.header.destination, statefulRule.header.source].forEach(cidr => {
      if (!anyArray.includes(cidr) && !helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule header IP source/destination "${cidr}" is invalid. Valid values are a CIDR range or the string "ANY"`,
        );
      }
    });
    // Validate port ranges
    [statefulRule.header.destinationPort, statefulRule.header.sourcePort].forEach(port => {
      // Validate the port is using the correct format
      if (!anyArray.includes(port) && !helpers.matchesRegex(port, '^\\d{1,5}(:\\d{1,5})?$')) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port "${port}" is invalid. Valid values are a single port, port range separated by colon (1990:1994), or the string "ANY"`,
        );
      }
      // Validate port ranges
      if (helpers.matchesRegex(port, '^\\d{1,5}:\\d{1,5}$')) {
        const fromPort = parseInt(port.split(':')[0]);
        const toPort = parseInt(port.split(':')[1]);

        if (fromPort > toPort) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. fromPort is greater than toPort`,
          );
        }

        if (fromPort < 0 || fromPort > 65535) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. fromPort is outside range 0-65535`,
          );
        }

        if (toPort < 0 || toPort > 65535) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. toPort is outside range 0-65535`,
          );
        }
      }
    });
  }

  /**
   * Validate stateful rule options
   * @param rule
   * @param statefulRule
   * @param helpers
   * @param errors
   */
  private validateStatefulRuleOptions(
    rule: NfwRuleGroupConfig,
    statefulRule: NfwRuleSourceStatefulRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const keywords = statefulRule.ruleOptions.map(option => {
      return option.keyword;
    });

    // Validate there are not duplicate keywords
    if (helpers.hasDuplicates(keywords)) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: stateful rule options has duplicate keywords. Please define unique keywords. Keywords in file: ${keywords}`,
      );
    }
  }

  /**
   * Validate stateful domain lists
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateDomainList(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const domainList = rule.ruleGroup!.rulesSource.rulesSourceList!;
    // Validate rule type
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesSourceList must be STATEFUL`,
      );
    }
    // Validate targets
    for (const target of domainList.targets) {
      if (!helpers.matchesRegex(target, '^\\.?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$')) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: target "${target}" is invalid. Targets must be formatted ".example.com" for wildcard domains and "example.com" for explicit match domains `,
        );
      }
    }
  }

  /**
   * Validate stateful rule variables
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleVariables(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const rule of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      if (rule.ruleGroup?.ruleVariables) {
        if (rule.type !== 'STATEFUL') {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleVariables may only be applied to STATEFUL rule groups`,
          );
        } else {
          this.validateRuleVariableDefinitions(rule, helpers, errors);
        }
      }
    }
  }

  /**
   * Validate rule variable definitions
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateRuleVariableDefinitions(
    rule: NfwRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const ipSets = this.getRuleVariableDefinitions(rule.ruleGroup!.ruleVariables!.ipSets);
    const portSets = this.getRuleVariableDefinitions(rule.ruleGroup!.ruleVariables!.portSets);

    // Validate CIDRs
    ipSets.forEach(ipSet => {
      ipSet.definition.forEach(cidr => {
        if (!helpers.isValidIpv4Cidr(cidr)) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${ipSet.name}]: invalid CIDR ${cidr}. Value must be a valid IPv4 CIDR range`,
          );
        }
      });
    });

    // Validate ports
    portSets.forEach(portSet => {
      portSet.definition.forEach(port => {
        if (!helpers.matchesRegex(port, '^\\d{1,5}$')) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${portSet.name}]: invalid port "${port}". Valid value is a single TCP/UDP port between 0-65535`,
          );
        }
        if (helpers.matchesRegex(port, '^\\d{1,5}$') && (parseInt(port) < 0 || parseInt(port) > 65535)) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${portSet.name}]: invalid port "${port}". Valid value is a single TCP/UDP port between 0-65535`,
          );
        }
      });
    });
  }

  /**
   * Returns an array of rule variable definitions
   * @param definition
   * @returns
   */
  private getRuleVariableDefinitions(
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

  private validateRuleString(rule: NfwRuleGroupConfig, errors: string[]) {
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesString must be STATEFUL`,
      );
    }

    const suricataRuleActionType = ['alert', 'pass', 'drop', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth'];
    const ruleSplit = rule.ruleGroup!.rulesSource.rulesString!.split(' ');
    if (!suricataRuleActionType.includes(ruleSplit[0])) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: invalid rule string. String must start with one of the following valid Suricata actions: ${suricataRuleActionType}`,
      );
    }
  }

  /**
   * Function to validate Endpoint policy document file existence
   * @param configDir
   */
  private validateSuricataFile(values: NetworkConfig, configDir: string, errors: string[]) {
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      if (rule.ruleGroup?.rulesSource.rulesFile) {
        if (!fs.existsSync(path.join(configDir, rule.ruleGroup?.rulesSource.rulesFile))) {
          errors.push(`Suricata rules file ${rule.ruleGroup?.rulesSource.rulesFile} not found !!`);
        } else {
          const fileContent = fs.readFileSync(path.join(configDir, rule.ruleGroup?.rulesSource.rulesFile), 'utf8');
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

          if (rules.length === 0) {
            errors.push(`No rule definition found in suricata rules file ${rule.ruleGroup?.rulesSource.rulesFile}!!`);
          }

          if (rule.type !== 'STATEFUL') {
            errors.push(
              `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesFile must be STATEFUL`,
            );
          }
        }
      }
    });
  }

  /**
   * Validate firewall policies
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicies(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate policy names
    //
    this.validatePolicyNames(values, helpers, errors);
    //
    // Validate policy share target OUs
    //
    this.validatePolicyShareTargetOus(values, helpers, errors);
    //
    // Validate policy share target accounts
    //
    this.validatePolicyShareTargetAccounts(values, helpers, errors);
    //
    // Validate policy rule groups
    //
    this.validatePolicyRuleGroups(values, helpers, errors);
    //
    // Validate policy custom actions
    //
    this.validatePolicyCustomActions(values, helpers, errors);
  }

  /**
   * Get all rule groups defined in configuration
   * @param values
   * @returns
   */
  private getRuleGroups(values: NetworkConfig): Map<string, NfwRuleGroupConfig> {
    const ruleGroups = new Map<string, NfwRuleGroupConfig>();
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      ruleGroups.set(rule.name, rule);
    });

    return ruleGroups;
  }

  /**
   * Validate firewall policy names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const policies = values.centralNetworkServices?.networkFirewall?.policies;
    if (policies) {
      const policyNames = policies.map(policy => {
        return policy.name;
      });

      if (helpers.hasDuplicates(policyNames)) {
        errors.push(
          `Duplicate Network Firewall policy names exist. Policy names must be unique. Policy names in file: ${policyNames}`,
        );
      }

      for (const name of policyNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall policy name "${name}" is invalid. Policy names must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyShareTargetOus(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      for (const ou of policy.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Network Firewall policy ${policy.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      for (const account of policy.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Network Firewall policy ${policy.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate rule groups defined in firewall policies
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const allRules = this.getRuleGroups(values);
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      // Validate stateless policies
      this.validatePolicyStatelessRuleGroups(policy, allRules, helpers, errors);
      // Validate stateful policies
      this.validatePolicyStatefulRuleGroups(policy, allRules, helpers, errors);
    }
  }

  /**
   * Validate stateless rule groups defined in policy
   * @param policy
   * @param allRules
   * @param helpers
   * @param errors
   */
  private validatePolicyStatelessRuleGroups(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (policy.firewallPolicy.statelessRuleGroups) {
      const statelessPolicyNames = policy.firewallPolicy.statelessRuleGroups.map(group => {
        return group.name;
      });
      const statelessPolicyPriorities = policy.firewallPolicy.statelessRuleGroups.map(ruleGroup => {
        return ruleGroup.priority.toString();
      });

      // Validate there are no duplicates
      if (helpers.hasDuplicates(statelessPolicyNames)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateless rule group references exist. Rule group reference names must be unique. Rule group names in file: ${statelessPolicyNames}`,
        );
      }
      if (helpers.hasDuplicates(statelessPolicyPriorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateless rule group priorities exist. Rule group priorities must be unique. Rule group priorities in file: ${statelessPolicyPriorities}`,
        );
      }

      // Validate priorities are within constraints
      if (!this.validatePriorityValues(statelessPolicyPriorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Invalid priority value in stateless rule group reference. Priority must be a number between 1 and 65535. Priorities in policy: ${statelessPolicyPriorities}`,
        );
      }

      // Validate rule group references
      this.validatePolicyRuleGroupReferences(policy, allRules, statelessPolicyNames, 'STATELESS', errors);
    }
  }

  /**
   * Returns true if priority values are within constraints
   * @param priorities
   * @returns
   */
  private validatePriorityValues(priorities: string[]): boolean {
    let allValid = true;
    for (const priority of priorities) {
      if (parseInt(priority) < 1 || parseInt(priority) > 65535) {
        allValid = false;
      }
    }
    return allValid;
  }

  /**
   * Validate stateful rule groups
   * @param policy
   * @param allRules
   * @param helpers
   * @param errors
   */
  private validatePolicyStatefulRuleGroups(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (policy.firewallPolicy.statefulRuleGroups) {
      const statefulPolicyNames = policy.firewallPolicy.statefulRuleGroups.map(group => {
        return group.name;
      });

      // Validate there are no duplicates
      if (helpers.hasDuplicates(statefulPolicyNames)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateful rule group references exist. Rule group reference names must be unique. Rule group names in file: ${statefulPolicyNames}`,
        );
      }

      // Validate STRICT ORDER is set if default actions are defined
      if (
        policy.firewallPolicy.statefulDefaultActions &&
        policy.firewallPolicy.statefulEngineOptions !== 'STRICT_ORDER'
      ) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: STRICT_ORDER must be set for statefulEngineOptions property if definin g statefulDefaultActions`,
        );
      }

      // Validate STRICT_ORDER policies
      this.validatePolicyStatefulStrictOrder(policy, helpers, errors);
      // Validate eulw group references
      this.validatePolicyRuleGroupReferences(policy, allRules, statefulPolicyNames, 'STATEFUL', errors);
    }
  }

  /**
   * Validate stateful STRICT_ORDER policies
   * @param policy
   * @param helpers
   * @param errors
   */
  private validatePolicyStatefulStrictOrder(
    policy: NfwFirewallPolicyConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const priorities: string[] = [];
    const statefulRuleGroups = policy.firewallPolicy.statefulRuleGroups!;
    statefulRuleGroups.forEach(reference => {
      if (reference.priority) {
        priorities.push(reference.priority.toString());
      }
    });

    if (priorities.length > 0) {
      // Validate strict order is defined
      const strictOrder = policy.firewallPolicy.statefulEngineOptions === 'STRICT_ORDER';
      if (!strictOrder) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: STRICT_ORDER must be set for statefulEngineOptions property if defining rule group priority values`,
        );
      }
      // Validate all rule groups have a prioity set
      if (strictOrder && statefulRuleGroups.length > priorities.length) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: priority values must be set for each rule group when defining a STRICT_ORDER policy`,
        );
      }
      // Validate priorities are unique
      if (strictOrder && helpers.hasDuplicates(priorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateful rule group priorities exist. Rule group priorities must be unique. Rule group priorities in file: ${priorities}`,
        );
      }
      // Validate priority values
      if (strictOrder && !this.validatePriorityValues(priorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Invalid priority value in stateful rule group reference. Priority must be a number between 1 and 65535. Priorities in policy: ${priorities}`,
        );
      }
    }
  }

  /**
   * Validate rule group reference attributes
   * @param policy
   * @param allRules
   * @param policyNames
   * @param groupType
   * @param errors
   */
  private validatePolicyRuleGroupReferences(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    policyNames: string[],
    groupType: 'STATEFUL' | 'STATELESS',
    errors: string[],
  ) {
    for (const name of policyNames) {
      const group = allRules.get(name);
      // Validate rule group exists
      if (!group) {
        errors.push(`[Network Firewall policy ${policy.name}]: rule group "${name}" does not exist`);
      }

      if (group) {
        // Validate regions match
        const regionMismatch = policy.regions.some(region => !group.regions.includes(region));
        if (regionMismatch) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: rule group "${name}" is not deployed to one or more region(s) the policy is deployed to. Policy regions: ${policy.regions}; Rule group regions: ${group.regions}`,
          );
        }
        // Validate policy is the correct type
        if (group.type !== groupType) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: rule group reference "${name}" is not configured as a ${groupType} rule group type`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy stateless custom actions
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyCustomActions(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      const customActions = policy.firewallPolicy.statelessCustomActions;

      for (const action of [
        ...policy.firewallPolicy.statelessDefaultActions,
        ...policy.firewallPolicy.statelessFragmentDefaultActions,
      ]) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !customActions) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: stateless custom action "${action}" is invalid. No matching actionName defined under the statelessCustomActions property`,
          );
        }
      }

      // Validate custom actions are all valid
      let allValid = true;
      if (customActions) {
        allValid = this.validateCustomActionNames(policy, customActions, helpers, errors);
      }
      // Validate default actions
      if (customActions && allValid) {
        this.validatePolicyDefaultActions(policy, customActions, errors);
      }
    }
  }

  /**
   * Validate firewall policy stateless default actions
   * @param policy
   * @param customActions
   * @param errors
   */
  private validatePolicyDefaultActions(
    policy: NfwFirewallPolicyConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    errors: string[],
  ) {
    const actionNames = customActions.map(item => {
      return item.actionName;
    });

    for (const action of [
      ...policy.firewallPolicy.statelessDefaultActions,
      ...policy.firewallPolicy.statelessFragmentDefaultActions,
    ]) {
      if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !actionNames.includes(action)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: stateless custom action "${action}" is invalid. No matching actionName defined under the statelessCustomActions property`,
        );
      }
    }
  }

  private validateFirewalls(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate firewall names
    //
    this.validateFirewallNames(values, helpers, errors);
    //
    // Validate firewall deployment targets
    //
    this.validateFirewallDeploymentTargets(values, helpers, errors);
  }

  /**
   * Validate firewall names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const firewalls = values.centralNetworkServices?.networkFirewall?.firewalls;

    if (firewalls) {
      const firewallNames = firewalls.map(firewall => {
        return firewall.name;
      });

      // Validate there are no duplicate names
      if (helpers.hasDuplicates(firewallNames)) {
        errors.push(
          `Duplicate Network Firewall firewall names exist. Firewall names must be unique. Firewall names in file: ${firewallNames}`,
        );
      }

      // Validate regex
      for (const name of firewallNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall name "${name}" is invalid. Firewall name must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  private validateFirewallDeploymentTargets(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const allPolicies = this.getPolicies(values);
    for (const firewall of values.centralNetworkServices?.networkFirewall?.firewalls ?? []) {
      // Validate VPC and subnet configuration
      const vpcValid = this.validateFirewallVpc(firewall, helpers, errors);

      // Validate logging configurations
      this.validateFirewallLoggingConfigurations(firewall, helpers, errors);

      if (vpcValid) {
        // Validate VPC target account(s) with policies
        this.validateFirewallTargetAccount(firewall, allPolicies, helpers, errors);
      }
    }
  }

  /**
   * Validate the target VPC and subnets for the firewall
   * @param firewall
   * @param helpers
   * @param errors
   * @returns
   */
  private validateFirewallVpc(
    firewall: NfwFirewallConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate VPC exists
    let allValid = true;
    const vpc = helpers.getVpc(firewall.vpc);
    if (!vpc) {
      allValid = false;
      errors.push(`[Network Firewall firewall ${firewall.name}]: VPC "${firewall.vpc}" does not exist`);
    }

    if (vpc) {
      // Validate subnets exist within the VPC
      const subnets: SubnetConfig[] = [];
      firewall.subnets.forEach(subnetItem => {
        const subnet = helpers.getSubnet(vpc, subnetItem);
        if (!subnet) {
          allValid = false;
          errors.push(
            `[Network Firewall firewall ${firewall.name}]: subnet "${subnetItem}" does not exist in VPC "${vpc.name}"`,
          );
        } else {
          subnets.push(subnet);
        }
      });

      // Validate there are no duplicate subnet AZs/names
      const azs: string[] = [];
      const subnetNames: string[] = [];
      subnets.forEach(item => {
        azs.push(item.availabilityZone ? item.availabilityZone : '');
        subnetNames.push(item.name);
      });
      if (helpers.hasDuplicates(azs)) {
        allValid = false;
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: subnets with duplicate AZs targeted. Subnet AZs must be unique. Subnet AZs in file: ${azs}`,
        );
      }
      if (helpers.hasDuplicates(subnetNames)) {
        allValid = false;
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: duplicate subnets targeted. Target subnets must be unique. Subnets in file: ${subnetNames}`,
        );
      }
    }
    return allValid;
  }

  /**
   * Validate if there are duplicate firewall logging configuration types
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateFirewallLoggingConfigurations(
    firewall: NfwFirewallConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (firewall.loggingConfiguration) {
      // Validate there are no duplicates
      const loggingTypes: string[] = [];
      firewall.loggingConfiguration.forEach(config => loggingTypes.push(config.type));

      if (helpers.hasDuplicates(loggingTypes)) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: duplicate logging configuration types. Each logging type must be unique. Logging types in file: ${loggingTypes}`,
        );
      }
    }
  }

  /**
   * Validate firewall target account against firewall policy shares
   * @param firewall
   * @param allPolicies
   * @param helpers
   * @param errors
   */
  private validateFirewallTargetAccount(
    firewall: NfwFirewallConfig,
    allPolicies: Map<string, NfwFirewallPolicyConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate policy exists
    const firewallPolicy = allPolicies.get(firewall.firewallPolicy);
    if (!firewallPolicy) {
      errors.push(
        `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" does not exist`,
      );
    } else {
      // Validate RAM shares exist in desired accounts
      const vpc = helpers.getVpc(firewall.vpc)!;
      const vpcAccountNames = helpers.getVpcAccountNames(vpc);
      const policyAccountNames = helpers.getDelegatedAdminShareTargets(firewallPolicy.shareTargets);
      const targetComparison = helpers.compareTargetAccounts(vpcAccountNames, policyAccountNames);

      if (targetComparison.length > 0) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" is not shared with one or more target OU(s)/account(s) for VPC "${vpc.name}." Missing accounts: ${targetComparison}`,
        );
      }
      // Validate regions match
      if (!firewallPolicy.regions.includes(vpc.region)) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" target region(s) do not match region for VPC "${vpc.name}." Policy regions: ${firewallPolicy.regions}; VPC region: ${vpc.region}`,
        );
      }
    }
  }

  /**
   * Return all policies definied in the configuration
   * @param values
   * @returns
   */
  private getPolicies(values: NetworkConfig): Map<string, NfwFirewallPolicyConfig> {
    const policies = new Map<string, NfwFirewallPolicyConfig>();
    values.centralNetworkServices?.networkFirewall?.policies.forEach(policy => policies.set(policy.name, policy));
    return policies;
  }
}

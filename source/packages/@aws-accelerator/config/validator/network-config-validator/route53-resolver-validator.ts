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
  NetworkConfigTypes,
  DnsQueryLogsConfig,
  DnsFirewallRuleGroupConfig,
  DnsFirewallRulesConfig,
  ResolverEndpointConfig,
  VpcConfig,
  SubnetConfig,
  ResolverRuleConfig,
} from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate Route53Resolver
 */
export class Route53ResolverValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    const domainLists: { name: string; document: string }[] = [];
    //
    // Prepare Custom domain list
    //
    this.prepareCustomDomainList(values, domainLists);
    //
    // Custom domain lists
    //
    this.validateCustomDomainListDocumentFile(configDir, domainLists, errors);
    //
    // Validate query logs
    //
    this.validateQueryLogs(values, helpers, errors);
    //
    // Validate DNS firewall rules
    //
    this.validateDnsFirewallRuleGroups(values, helpers, errors);
    //
    // Validate resolver endpoints
    //
    this.validateResolverEndpoints(values, helpers, errors);
    //
    // Validate resolver rules
    //
    this.validateResolverRules(values, helpers, errors);
  }

  /**
   * Function to prepare custom domain list
   * @param values
   */
  private prepareCustomDomainList(values: NetworkConfig, domainLists: { name: string; document: string }[]) {
    for (const ruleGroup of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const rule of ruleGroup.rules) {
        if (rule.customDomainList) {
          domainLists.push({ name: rule.name, document: rule.customDomainList });
        }
      }
    }
  }

  /**
   * Function to validate custom domain list document file existence
   * @param configDir
   */
  private validateCustomDomainListDocumentFile(
    configDir: string,
    domainLists: { name: string; document: string }[],
    errors: string[],
  ) {
    for (const list of domainLists) {
      if (!fs.existsSync(path.join(configDir, list.document))) {
        errors.push(`DNS firewall custom domain list ${list.name} document file ${list.document} not found!`);
      }
    }
  }

  private validateQueryLogs(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const queryLogs = values.centralNetworkServices?.route53Resolver?.queryLogs;

    if (queryLogs) {
      //
      // Validate query log destinations
      //
      this.validateQueryLogDestinations(queryLogs, helpers, errors);
      //
      // Validate query log share target OUs
      //
      this.validateQueryLogShareTargetOus(queryLogs, helpers, errors);
      //
      // Validate query log share target accounts
      //
      this.validateQueryLogShareTargetAccounts(queryLogs, helpers, errors);
    }
  }

  /**
   * Validate query log destinations
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogDestinations(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate there are no duplicates
    if (helpers.hasDuplicates(queryLogs.destinations)) {
      errors.push(
        `[Resolver query logs ${queryLogs.name}]: duplicate destinations configured. Destinations must be unique. Destinations in file: ${queryLogs.destinations}`,
      );
    }
  }

  /**
   * Validate query log share target OUs
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogShareTargetOus(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ou of queryLogs.shareTargets?.organizationalUnits ?? []) {
      if (!helpers.ouExists(ou)) {
        errors.push(
          `Share target OU ${ou} for Resolver query logs ${queryLogs.name} does not exist in organization-config.yaml`,
        );
      }
    }
  }

  /**
   * Validate query logs share target accounts
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogShareTargetAccounts(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const account of queryLogs.shareTargets?.accounts ?? []) {
      if (!helpers.accountExists(account)) {
        errors.push(
          `Share target account ${account} for Resolver query logs ${queryLogs.name} does not exist in accounts-config.yaml`,
        );
      }
    }
  }

  /**
   * Validate firewall rule groups
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDnsFirewallRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate firewall rule names
    //
    this.validateFirewallRuleNames(values, helpers, errors);
    //
    // Validate firewall share target OUs
    //
    this.validateFirewallRuleShareTargetOus(values, helpers, errors);
    //
    // Validate firewall share target OUs
    //
    this.validateFirewallRuleShareTargetAccounts(values, helpers, errors);
    //
    // Validate firewall rules
    //
    this.validateFirewallRules(values, helpers, errors);
  }

  /**
   * Validate firewall rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.firewallRuleGroups?.forEach(rule => ruleNames.push(rule.name));

    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver firewall rule groups contain duplicate names. Rule group names must be unique. Rule group names in file: ${ruleNames}`,
      );
    }
  }

  /**
   * Validate firewall share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleShareTargetOus(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const rule of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const ou of rule.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Resolver firewall rule group ${rule.name} does not exist in organization-config.yaml`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const rule of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const account of rule.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Resolver firewall rule group ${rule.name} does not exist in accounts-config.yaml`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall rule group rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const group of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      //
      // Validate firewall rule names
      //
      this.validateRuleGroupRuleNames(group, helpers, errors);
      //
      // Validate firewall rule priorities
      //
      this.validateRuleGroupRulePriorities(group, helpers, errors);
      for (const rule of group.rules) {
        //
        // Validate shape of rule object
        //
        this.validateRuleStructure(rule, helpers, errors);
      }
    }
  }

  /**
   * Validate rule names in a rule group
   * @param group
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRuleNames(
    group: DnsFirewallRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const ruleNames: string[] = [];
    group.rules.forEach(rule => ruleNames.push(rule.name));
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `[Resolver firewall rule group ${group.name}]: duplicate rule names. Rule names must be unique for each rule group. Rule names in file: ${ruleNames}`,
      );
    }
  }

  /**
   * Validate rule priorities in a rule group
   * @param group
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRulePriorities(
    group: DnsFirewallRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const priorities: string[] = [];
    group.rules.forEach(rule => priorities.push(rule.priority.toString()));
    if (helpers.hasDuplicates(priorities)) {
      errors.push(
        `[Resolver firewall rule group ${group.name}]: duplicate rule priorities. Rule priorities must be unique for each rule group. Rule priorities in file: ${priorities}`,
      );
    }
  }

  /**
   * Validate the shape of the rule object
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateRuleStructure(rule: DnsFirewallRulesConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const keys = helpers.getObjectKeys(rule);
    const blockKeys = ['blockResponse', 'blockOverrideDomain', 'blockOverrideTtl'];

    // Validate domain list
    if (rule.customDomainList && rule.managedDomainList) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: you may only specify one of customDomainList or managedDomainList`,
      );
    }
    if (!rule.customDomainList && !rule.managedDomainList) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: you must specify one of customDomainList or managedDomainList`,
      );
    }

    // Validate non-BLOCK actions
    if (rule.action !== 'BLOCK' && keys.some(key => blockKeys.includes(key))) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: cannot specify the following rule properties for ${rule.action} action: ${blockKeys}`,
      );
    }

    // Validate block actions
    if (rule.action === 'BLOCK') {
      this.validateBlockActions(rule, keys, errors);
    }
  }

  /**
   * Validate block actions for the rule object
   * @param rule
   * @param keys
   * @param errors
   */
  private validateBlockActions(rule: DnsFirewallRulesConfig, keys: string[], errors: string[]) {
    const blockOverrideKeys = ['blockOverrideDomain', 'blockOverrideTtl'];
    // Ensure the BLOCK action has a blockResponse
    if (!rule.blockResponse) {
      errors.push(`[Resolver firewall rule ${rule.name}]: BLOCK actions require the blockResponse property`);
    } else {
      // Validate non-OVERRIDE BLOCK actions
      if (rule.blockResponse !== 'OVERRIDE' && keys.some(key => blockOverrideKeys.includes(key))) {
        errors.push(
          `[Resolver firewall rule ${rule.name}]: cannot specify the following rule properties for BLOCK actions with ${rule.blockResponse} block response: ${blockOverrideKeys}`,
        );
      }
      // Validate OVERRIDE BLOCK actions
      if (rule.blockResponse === 'OVERRIDE' && !blockOverrideKeys.some(overrideKey => keys.includes(overrideKey))) {
        errors.push(
          `[Resolver firewall rule ${rule.name}]: must specify the following rule properties for BLOCK actions with OVERRIDE block response: ${blockOverrideKeys}`,
        );
      }
    }
  }

  private validateResolverEndpoints(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate endpoint names
    //
    this.validateResolverEndpointNames(values, helpers, errors);
    //
    // Validate resolver endpoint properties
    //
    this.validateResolverEndpointProps(values, helpers, errors);
  }

  /**
   * Validate resolver endpoint names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const endpointNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => endpointNames.push(endpoint.name));

    // Valiadate there are no duplicates
    if (helpers.hasDuplicates(endpointNames)) {
      errors.push(
        `Resolver endpoints contain duplicate names. Endpoint names must be unique. Endpoint names in file: ${endpointNames}`,
      );
    }

    // Validate regex
    endpointNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver endpoint name "${name}" is invalid. Endpoint names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate resolver endpoint properties
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointProps(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const endpoint of values.centralNetworkServices?.route53Resolver?.endpoints ?? []) {
      //
      // Validate endpoint object structure
      //
      const allValid = this.validateResolverEndpointStructure(endpoint, helpers, errors);
      //
      // Validate rules
      //
      if (allValid) {
        this.validateResolverEndpointVpcs(values, endpoint, helpers, errors);
      }
    }
  }

  /**
   * Validate structure and property values of the endpoint
   * @param endpoint
   * @param helpers
   * @param errors
   * @returns
   */
  private validateResolverEndpointStructure(
    endpoint: ResolverEndpointConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    let allValid = true;

    // Validate rules are not set on inbound endpoint
    if (endpoint.type === 'INBOUND' && endpoint.rules) {
      allValid = false;
      errors.push(`[Resolver endpoint ${endpoint.name}]: INBOUND endpoint type cannot have associated resolver rules`);
    }

    // Validate rule types
    if (endpoint.type === 'OUTBOUND') {
      endpoint.rules?.forEach(rule => {
        if (rule.ruleType && rule.ruleType !== 'FORWARD') {
          allValid = false;
          errors.push(
            `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: rules associated with OUTBOUND endpoints can only specify FORWARD rule type`,
          );
        }
      });
    }

    // Validate allowed CIDRs
    const cidrs: string[] = [];
    let cidrsValid = true;
    endpoint.allowedCidrs?.forEach(cidr => cidrs.push(cidr));

    cidrs.forEach(item => {
      if (!helpers.isValidIpv4Cidr(item)) {
        allValid = false;
        cidrsValid = false;
        errors.push(
          `[Resolver endpoint ${endpoint.name}]: allowedCidr "${item}" is invalid. Value must be a valid IPv4 CIDR range`,
        );
      }
    });

    if (cidrsValid && helpers.hasDuplicates(cidrs)) {
      allValid = false;
      errors.push(`[Resolver endpoint ${endpoint.name}]: endpoint has duplicate allowed CIDRs`);
    }
    return allValid;
  }

  /**
   * Validate endpoint target VPC attributes
   * @param values
   * @param endpoint
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointVpcs(
    values: NetworkConfig,
    endpoint: ResolverEndpointConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const delegatedAdmin = values.centralNetworkServices!.delegatedAdminAccount;

    // Validate VPC
    const vpc = helpers.getVpc(endpoint.vpc);
    if (!vpc) {
      errors.push(`[Resolver endpoint ${endpoint.name}]: VPC "${endpoint.vpc}" does not exist`);
    } else {
      // Validate the target is not a VPC template
      if (NetworkConfigTypes.vpcTemplatesConfig.is(vpc)) {
        errors.push(
          `[Resolver endpoint ${endpoint.name}]: VPC templates are not a supported target VPC type for Resolver endpoints`,
        );
      }

      if (NetworkConfigTypes.vpcConfig.is(vpc)) {
        // Validate we are targeting delegated admin account
        if (vpc.account !== delegatedAdmin) {
          errors.push(
            `[Resolver endpoint ${endpoint.name}]: VPC "${vpc.name}" is not deployed to delegated admin account "${delegatedAdmin}". Resolver endpoints must be deployed to the delegated admin account`,
          );
        }
        // Validate VPC subnets
        this.validateResolverEndpointSubnets(endpoint, vpc, helpers, errors);
      }
    }
  }

  private validateResolverEndpointSubnets(
    endpoint: ResolverEndpointConfig,
    vpc: VpcConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const subnets: SubnetConfig[] = [];
    endpoint.subnets.forEach(item => {
      const subnet = helpers.getSubnet(vpc, item);
      // Validate subnet exists
      if (!subnet) {
        errors.push(`[Resolver endpoint ${endpoint.name}]: VPC "${vpc.name}" does not contain the subnet "${item}"`);
      } else {
        subnets.push(subnet);
      }
    });

    // Validate there are no duplicate subnets or AZs
    const subnetNames: string[] = [];
    const subnetAzs: string[] = [];
    subnets.forEach(subnetItem => {
      subnetNames.push(subnetItem.name);
      subnetAzs.push(subnetItem.availabilityZone ? subnetItem.availabilityZone : '');
    });

    if (helpers.hasDuplicates(subnetNames)) {
      errors.push(
        `[Resolver endpoint ${endpoint.name}]: endpoint has duplicate subnets defined. Subnets must be unique. Subnets in file: ${subnetNames}`,
      );
    }
    if (helpers.hasDuplicates(subnetAzs)) {
      errors.push(
        `[Resolver endpoint ${endpoint.name}]: endpoint has duplicate subnet AZs defined. AZs must be unique. AZs in file: ${subnetAzs}`,
      );
    }
  }

  private validateResolverRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate Resolver rule share target OUs
    //
    this.validateResolverRuleShareTargetOus(values, helpers, errors);
    //
    // Validate Resolver rule share target accounts
    //
    this.validateResolverRuleShareTargetAccounts(values, helpers, errors);
    //
    // Validate SYSTEM rules
    //
    this.validateSystemRules(values, helpers, errors);
    //
    // Validate FORWARD rules
    //
    this.validateForwardRules(values, helpers, errors);
  }

  /**
   * Validate Resolver rule share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverRuleShareTargetOus(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // SYSTEM rules
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(systemRule => {
      systemRule.shareTargets?.organizationalUnits?.forEach(ou => {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Resolver rule ${systemRule.name} does not exist in organization-config.yaml`,
          );
        }
      });
    });

    // FORWARD rules
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(forwardRule => {
        forwardRule.shareTargets?.organizationalUnits?.forEach(ou => {
          if (!helpers.ouExists(ou)) {
            errors.push(
              `Share target OU ${ou} for Resolver endpoint ${endpoint.name} rule ${forwardRule.name} does not exist in organization-config.yaml`,
            );
          }
        });
      });
    });
  }

  /**
   * Validate Resolver rule share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverRuleShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // SYSTEM rules
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(systemRule => {
      systemRule.shareTargets?.accounts?.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Resolver rule ${systemRule.name} does not exist in accounts-config.yaml`,
          );
        }
      });
    });

    // FORWARD rules
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(forwardRule => {
        forwardRule.shareTargets?.accounts?.forEach(account => {
          if (!helpers.accountExists(account)) {
            errors.push(
              `Share target account ${account} for Resolver endpoint ${endpoint.name} rule ${forwardRule.name} does not exist in accounts-config.yaml`,
            );
          }
        });
      });
    });
  }

  /**
   * Validate SYSTEM rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateSystemRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate rule names
    this.validateSystemRuleNames(values, helpers, errors);

    // Validate rule properties
    for (const rule of values.centralNetworkServices?.route53Resolver?.rules ?? []) {
      // Validate only SYSTEM rules are created in this block
      if (rule.ruleType && rule.ruleType !== 'SYSTEM') {
        errors.push(`[Resolver rule ${rule.name}]: rules not defined under an endpoint must use the SYSTEM rule type`);
      }
      // Validate there are no targets for the SYSTEM rule
      if (rule.inboundEndpointTarget || rule.targetIps) {
        errors.push(`[Resolver rule ${rule.name}]: SYSTEM rule type cannot include targets`);
      }
      // Validate domain name regex
      if (!helpers.matchesRegex(rule.domainName, '(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)')) {
        errors.push(
          `[Resolver rule ${rule.name}]: domain name "${rule.domainName}" is invalid. Domain name must match the pattern "(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)"`,
        );
      }
    }
  }

  /**
   * Validate SYSTEM rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateSystemRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(item => {
      ruleNames.push(item.name);
    });

    // Validate rule names are unique
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver SYSTEM rules has duplicates. Resolver rule names must be unique. Rule names in file: ${ruleNames}`,
      );
    }

    // Validate regex
    ruleNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver SYSTEM rule name "${name}" is invalid. Resolver rule names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate FORWARD rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateForwardRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const endpointMap = this.getResolverEndpoints(values);

    // Validate FORMWARD rule names
    this.validateForwardRuleNames(values, helpers, errors);

    // Validate FORWARD rule properties
    for (const endpoint of values.centralNetworkServices?.route53Resolver?.endpoints ?? []) {
      for (const rule of endpoint.rules ?? []) {
        const targetValid = this.validateForwardRuleProps(endpoint, rule, helpers, errors);

        if (targetValid) {
          this.validateForwardRuleTargets(endpoint, rule, endpointMap, helpers, errors);
        }
      }
    }
  }

  /**
   * Return a map of endpoint configurations
   * @param values
   * @returns
   */
  private getResolverEndpoints(values: NetworkConfig): Map<string, ResolverEndpointConfig> {
    const endpoints = new Map<string, ResolverEndpointConfig>();
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint =>
      endpoints.set(endpoint.name, endpoint),
    );
    return endpoints;
  }

  /**
   * Validate FORWARD rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateForwardRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(rule => ruleNames.push(rule.name));
    });

    // Validate rule names are unique
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver FORWARD rules has duplicates. Resolver rule names must be unique. Rule names in file: ${ruleNames}`,
      );
    }

    // Validate regex
    ruleNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver FORWARD rule name "${name}" is invalid. Resolver rule names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate FORWARD rule props
   * @param endpoint
   * @param rule
   * @param helpers
   * @param errors
   * @returns
   */
  private validateForwardRuleProps(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate domain name
    if (!helpers.matchesRegex(rule.domainName, '(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)')) {
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: domain name ${rule.domainName} is invalid. Domain name must match the pattern "(^\\.$)(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)"`,
      );
    }

    // Validate target type
    let targetValid = true;
    if (rule.targetIps && rule.inboundEndpointTarget) {
      targetValid = false;
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: cannot define a FORWARD rule with both targetIp and inboundEndpointTarget properties`,
      );
    }
    if (!rule.targetIps && !rule.inboundEndpointTarget) {
      targetValid = false;
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: FORWARD rule must be defined with one of targetIp or inboundEndpointTarget properties`,
      );
    }

    return targetValid;
  }

  /**
   * Validate FORWARD rule targets
   * @param endpoint
   * @param rule
   * @param endpointMap
   * @param helpers
   * @param errors
   */
  private validateForwardRuleTargets(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    endpointMap: Map<string, ResolverEndpointConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate target IPs
    rule.targetIps?.forEach(target => {
      if (!helpers.isValidIpv4(target.ip)) {
        errors.push(
          `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: IP "${target.ip}" is invalid. Value must be a valid IPv4 address`,
        );
      }

      // Validate ports
      if (target.port) {
        if (!helpers.matchesRegex(target.port, '^\\d{1,5}$')) {
          errors.push(
            `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target port "${target.port}" is invalid. Port must be a valid port in range 0-65535`,
          );
        } else {
          if (parseInt(target.port) < 0 || parseInt(target.port) > 65535) {
            errors.push(
              `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target port "${target.port}" is invalid. Port must be a valid port in range 0-65535`,
            );
          }
        }
      }
    });

    if (rule.inboundEndpointTarget) {
      this.validateForwardRuleInboundTarget(endpoint, rule, endpointMap, errors);
    }
  }

  private validateForwardRuleInboundTarget(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    endpointMap: Map<string, ResolverEndpointConfig>,
    errors: string[],
  ) {
    // Validate inbound endpoints
    const inboundTarget = endpointMap.get(rule.inboundEndpointTarget!);

    if (!inboundTarget) {
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target endpoint "${rule.inboundEndpointTarget}" does not exist`,
      );
    } else {
      if (inboundTarget.type !== 'INBOUND') {
        errors.push(
          `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target endpoint "${rule.inboundEndpointTarget}" is not an INBOUND endpoint`,
        );
      }
    }
  }
}

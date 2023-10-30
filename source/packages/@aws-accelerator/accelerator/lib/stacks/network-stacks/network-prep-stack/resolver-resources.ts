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

import { CentralNetworkServicesConfig, DnsFirewallRuleGroupConfig, DnsQueryLogsConfig } from '@aws-accelerator/config';
import {
  QueryLoggingConfig,
  ResolverFirewallDomainList,
  ResolverFirewallDomainListType,
  ResolverFirewallRuleGroup,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import path from 'path';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class ResolverResources {
  public readonly domainListMap: Map<string, string>;
  public readonly queryLogsMap: Map<string, string>;
  public readonly ruleGroupMap: Map<string, string>;

  private stack: NetworkPrepStack;

  constructor(
    networkPrepStack: NetworkPrepStack,
    delegatedAdminAccountId: string,
    centralConfig: CentralNetworkServicesConfig,
    props: AcceleratorStackProps,
    orgId?: string,
  ) {
    this.stack = networkPrepStack;

    // Create DNS firewall rule groups
    [this.domainListMap, this.ruleGroupMap] = this.createDnsFirewallRuleGroups(
      delegatedAdminAccountId,
      centralConfig,
      props,
    );
    // Create Resolver query logs
    this.queryLogsMap = this.createResolverQueryLogs(
      delegatedAdminAccountId,
      props,
      centralConfig.route53Resolver?.queryLogs,
      orgId,
    );
  }

  /**
   * Create DNS firewall rule groups
   * @param accountId
   * @param firewallItem
   */
  private createDnsFirewallRuleGroups(
    accountId: string,
    centralConfig: CentralNetworkServicesConfig,
    props: AcceleratorStackProps,
  ): Map<string, string>[] {
    const domainMap = new Map<string, string>();
    const ruleGroupMap = new Map<string, string>();

    for (const firewallItem of centralConfig.route53Resolver?.firewallRuleGroups ?? []) {
      const regions = firewallItem.regions.map(item => {
        return item.toString();
      });

      // Create regional rule groups in the delegated admin account
      if (this.stack.isTargetStack([accountId], regions)) {
        // Create domain lists for the rule group
        const ruleItemDomainMap = this.createDomainLists(firewallItem, domainMap, props);
        ruleItemDomainMap.forEach((value, key) => domainMap.set(key, value));

        // Build new rule list with domain list ID
        const ruleList = this.setRuleList(firewallItem, domainMap);

        // Create rule group
        this.stack.addLogs(LogLevel.INFO, `Creating DNS firewall rule group ${firewallItem.name}`);
        const ruleGroup = new ResolverFirewallRuleGroup(this.stack, pascalCase(`${firewallItem.name}RuleGroup`), {
          firewallRules: ruleList,
          name: firewallItem.name,
          tags: firewallItem.tags ?? [],
        });
        ruleGroupMap.set(firewallItem.name, ruleGroup.groupId);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${firewallItem.name}RuleGroup`),
          parameterName: this.stack.getSsmPath(SsmResourceType.DNS_RULE_GROUP, [firewallItem.name]),
          stringValue: ruleGroup.groupId,
        });

        if (firewallItem.shareTargets) {
          this.stack.addLogs(LogLevel.INFO, `Share DNS firewall rule group ${firewallItem.name}`);
          this.stack.addResourceShare(firewallItem, `${firewallItem.name}_ResolverFirewallRuleGroupShare`, [
            ruleGroup.groupArn,
          ]);
        }
      }
    }
    return [domainMap, ruleGroupMap];
  }

  /**
   * Create/look up domain lists as needed for a rule group
   * @param firewallItem
   * @param domainMap
   * @param props
   * @returns
   */
  private createDomainLists(
    firewallItem: DnsFirewallRuleGroupConfig,
    domainMap: Map<string, string>,
    props: AcceleratorStackProps,
  ): Map<string, string> {
    for (const ruleItem of firewallItem.rules) {
      let domainListType: ResolverFirewallDomainListType;
      let filePath: string | undefined = undefined;
      let listName: string;
      let message: string;
      // Check to ensure both types aren't defined
      if (ruleItem.customDomainList) {
        domainListType = ResolverFirewallDomainListType.CUSTOM;
        filePath = path.join(props.configDirPath, ruleItem.customDomainList);
        try {
          listName = ruleItem.customDomainList.split('/')[1].split('.')[0];
          message = `Creating DNS firewall custom domain list ${listName}`;
        } catch (e) {
          this.stack.addLogs(LogLevel.ERROR, `Error creating DNS firewall domain list: ${e}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      } else {
        domainListType = ResolverFirewallDomainListType.MANAGED;
        listName = ruleItem.managedDomainList!;
        message = `Looking up DNS firewall managed domain list ${listName}`;
      }

      // Create or look up domain list
      if (!domainMap.has(listName)) {
        this.stack.addLogs(LogLevel.INFO, message);
        const domainList = new ResolverFirewallDomainList(this.stack, pascalCase(`${listName}DomainList`), {
          name: listName,
          path: filePath,
          tags: [],
          type: domainListType,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
        });
        domainMap.set(listName, domainList.listId);
      }
    }
    return domainMap;
  }

  /**
   * Set the list of rules for a given rule group
   * @param firewallItem
   * @param domainMap
   * @returns
   */
  private setRuleList(
    firewallItem: DnsFirewallRuleGroupConfig,
    domainMap: Map<string, string>,
  ): cdk.aws_route53resolver.CfnFirewallRuleGroup.FirewallRuleProperty[] {
    const ruleList: cdk.aws_route53resolver.CfnFirewallRuleGroup.FirewallRuleProperty[] = [];
    let domainListName: string;

    for (const ruleItem of firewallItem.rules) {
      // Check the type of domain list
      if (ruleItem.customDomainList) {
        try {
          domainListName = ruleItem.customDomainList.split('/')[1].split('.')[0];
        } catch (e) {
          this.stack.addLogs(LogLevel.ERROR, `Error parsing list name from ${ruleItem.customDomainList}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      } else {
        domainListName = ruleItem.managedDomainList!;
      }

      // Create the DNS firewall rule list
      if (!domainMap.get(domainListName)) {
        this.stack.addLogs(LogLevel.ERROR, `Domain list ${domainListName} not found in domain map`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      ruleList.push({
        action: ruleItem.action.toString(),
        firewallDomainListId: domainMap.get(domainListName)!,
        priority: ruleItem.priority,
        blockOverrideDnsType:
          ruleItem.action === 'BLOCK' && ruleItem.blockResponse === 'OVERRIDE' ? 'CNAME' : undefined,
        blockOverrideDomain: ruleItem.blockOverrideDomain,
        blockOverrideTtl: ruleItem.blockOverrideTtl,
        blockResponse: ruleItem.blockResponse,
      });
    }
    return ruleList;
  }

  /**
   * Create Route 53 Resolver query logs
   * @param delegatedAdminAccountId
   * @param props
   * @param logItem
   */
  private createResolverQueryLogs(
    delegatedAdminAccountId: string,
    props: AcceleratorStackProps,
    logItem?: DnsQueryLogsConfig,
    orgId?: string,
  ): Map<string, string> {
    const queryLogsMap = new Map<string, string>();

    if (logItem && delegatedAdminAccountId === cdk.Stack.of(this.stack).account) {
      if (logItem.destinations.includes('s3')) {
        this.stack.addLogs(LogLevel.INFO, `Create DNS query log ${logItem.name}-s3 for central S3 destination`);
        const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
          this.stack,
          'CentralLogsBucket',
          `${
            this.stack.acceleratorResourceNames.bucketPrefixes.centralLogs
          }-${props.accountsConfig.getLogArchiveAccountId()}-${props.centralizedLoggingRegion}`,
        );

        const s3QueryLogConfig = this.createQueryLogItem(logItem, centralLogsBucket, props.partition, orgId);
        queryLogsMap.set(`${logItem.name}-s3`, s3QueryLogConfig.logId);
      }

      if (logItem.destinations.includes('cloud-watch-logs')) {
        this.stack.addLogs(
          LogLevel.INFO,
          `Create DNS query log ${logItem.name}-cwl for central CloudWatch logs destination`,
        );

        const logGroup = new cdk.aws_logs.LogGroup(this.stack, 'QueryLogsLogGroup', {
          encryptionKey: this.stack.cloudwatchKey,
          retention: this.stack.logRetention,
        });

        const cwlQueryLogConfig = this.createQueryLogItem(logItem, logGroup, props.partition, orgId);
        queryLogsMap.set(`${logItem.name}-cwl`, cwlQueryLogConfig.logId);
      }
    }
    return queryLogsMap;
  }

  /**
   * Create a resolver query logging config item
   * @param logItem
   * @param destination
   * @param partition
   * @param organizationId
   * @returns
   */
  private createQueryLogItem(
    logItem: DnsQueryLogsConfig,
    destination: cdk.aws_s3.IBucket | cdk.aws_logs.LogGroup,
    partition: string,
    organizationId?: string,
  ): QueryLoggingConfig {
    let logicalId: string;
    let logName: string;

    if (destination instanceof cdk.aws_logs.LogGroup) {
      logicalId = `${logItem.name}CwlQueryLogConfig`;
      logName = `${logItem.name}-cwl`;
    } else {
      logicalId = `${logItem.name}S3QueryLogConfig`;
      logName = `${logItem.name}-s3`;
    }

    const queryLogsConfig = new QueryLoggingConfig(this.stack, pascalCase(`${logicalId}`), {
      destination,
      name: logName,
      organizationId,
      partition,
      logRetentionInDays: this.stack.logRetention,
      kmsKey: this.stack.cloudwatchKey,
    });

    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${logicalId}`),
      parameterName: this.stack.getSsmPath(SsmResourceType.QUERY_LOGS, [`${logName}`]),
      stringValue: queryLogsConfig.logId,
    });

    if (logItem.shareTargets) {
      this.stack.addLogs(LogLevel.INFO, `Share DNS query log config ${logName}`);
      this.stack.addResourceShare(logItem, `${logName}_QueryLogConfigShare`, [queryLogsConfig.logArn]);
    }
    return queryLogsConfig;
  }
}

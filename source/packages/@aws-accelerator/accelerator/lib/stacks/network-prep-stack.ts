/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';

import {
  KeyLookup,
  Organization,
  QueryLoggingConfig,
  ResolverFirewallDomainList,
  ResolverFirewallDomainListType,
  ResolverFirewallRuleGroup,
  ResourceShare,
  TransitGateway,
  TransitGatewayRouteTable,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

interface ResolverFirewallRuleProps {
  action: string;
  firewallDomainListId: string;
  priority: number;
  blockOverrideDnsType?: string;
  blockOverrideDomain?: string;
  blockOverrideTtl?: number;
  blockResponse?: string;
}

export class NetworkPrepStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const auditAccountId = props.accountsConfig.getAuditAccountId();

    const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: cdk.Stack.of(this).account === auditAccountId ? cdk.Stack.of(this).account : auditAccountId,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    //
    // Generate Transit Gateways
    //
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(tgwItem.account);
      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        Logger.info(`[network-prep-stack] Add Transit Gateway ${tgwItem.name}`);

        const tgw = new TransitGateway(this, pascalCase(`${tgwItem.name}TransitGateway`), {
          name: tgwItem.name,
          amazonSideAsn: tgwItem.asn,
          autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
          defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
          defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
          dnsSupport: tgwItem.dnsSupport,
          vpnEcmpSupport: tgwItem.vpnEcmpSupport,
          tags: tgwItem.tags,
        });

        new ssm.StringParameter(this, pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`), {
          parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/id`,
          stringValue: tgw.transitGatewayId,
        });

        for (const routeTableItem of tgwItem.routeTables ?? []) {
          Logger.info(`[network-prep-stack] Add Transit Gateway Route Tables ${routeTableItem.name}`);

          const routeTable = new TransitGatewayRouteTable(
            this,
            pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
            {
              transitGatewayId: tgw.transitGatewayId,
              name: routeTableItem.name,
              tags: routeTableItem.tags,
            },
          );

          new ssm.StringParameter(
            this,
            pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
            {
              parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
              stringValue: routeTable.id,
            },
          );
        }

        if (tgwItem.shareTargets) {
          Logger.info(`[network-prep-stack] Share transit gateway`);

          // Build a list of principals to share to
          const principals: string[] = [];

          // Loop through all the defined OUs
          for (const ouItem of tgwItem.shareTargets.organizationalUnits ?? []) {
            let ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
            // AWS::RAM::ResourceShare expects the organizations ARN if
            // sharing with the entire org (Root)
            if (ouItem === 'Root') {
              ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
            }
            Logger.info(
              `[network-prep-stack] Share Transit Gateway ${tgwItem.name} with Organizational Unit ${ouItem}: ${ouArn}`,
            );
            principals.push(ouArn);
          }

          // Loop through all the defined accounts
          for (const account of tgwItem.shareTargets.accounts ?? []) {
            const accountId = props.accountsConfig.getAccountId(account);
            Logger.info(
              `[network-prep-stack] Share Transit Gateway ${tgwItem.name} with Account ${account}: ${accountId}`,
            );
            principals.push(accountId);
          }

          // Create the Resource Share
          new ResourceShare(this, `${pascalCase(tgwItem.name)}TransitGatewayShare`, {
            name: `${tgwItem.name}_TransitGatewayShare`,
            principals,
            resourceArns: [tgw.transitGatewayArn],
          });
        }
      }
    }

    //
    // Central network services
    //
    if (props.networkConfig.centralNetworkServices) {
      const centralConfig = props.networkConfig.centralNetworkServices;
      const accountId = props.accountsConfig.getAccountId(centralConfig.delegatedAdminAccount);

      //
      // DNS firewall
      //
      // Create and store domain lists first
      const domainMap = new Map<string, string>();

      for (const firewallItem of centralConfig.route53Resolver?.firewallRuleGroups ?? []) {
        const regions = firewallItem.regions.map(item => {
          return item.toString();
        });

        // Create regional rule groups in the delegated admin account
        if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
          for (const ruleItem of firewallItem.rules) {
            let domainListType: ResolverFirewallDomainListType;
            let filePath: string | undefined = undefined;
            let listName: string;
            // Check to ensure both types aren't defined
            if (ruleItem.customDomainList && ruleItem.managedDomainList) {
              throw new Error(
                `[network-prep-stack] Only one of customDomainList or managedDomainList may be defined for ${ruleItem.name}`,
              );
            } else if (ruleItem.customDomainList) {
              domainListType = ResolverFirewallDomainListType.CUSTOM;
              filePath = path.join(props.configDirPath, ruleItem.customDomainList);
              try {
                listName = ruleItem.customDomainList.split('/')[1].split('.')[0];
                if (!domainMap.has(listName)) {
                  Logger.info(`[network-prep-stack] Creating DNS firewall custom domain list ${listName}`);
                }
              } catch (e) {
                throw new Error(`[network-prep-stack] Error creating DNS firewall domain list: ${e}`);
              }
            } else if (ruleItem.managedDomainList) {
              domainListType = ResolverFirewallDomainListType.MANAGED;
              listName = ruleItem.managedDomainList;
              if (!domainMap.has(listName)) {
                Logger.info(`[network-prep-stack] Looking up DNS firewall managed domain list ${listName}`);
              }
            } else {
              throw new Error(
                `[network-prep-stack] One of customDomainList or managedDomainList must be defined for ${ruleItem.name}`,
              );
            }

            // Create or look up domain list
            if (!domainMap.has(listName)) {
              const domainList = new ResolverFirewallDomainList(this, pascalCase(`${listName}DomainList`), {
                name: listName,
                path: filePath,
                tags: [],
                type: domainListType,
                kmsKey: key,
                logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
              });
              domainMap.set(listName, domainList.listId);
            }
          }

          // Build new rule list with domain list ID
          const ruleList: ResolverFirewallRuleProps[] = [];
          let listName: string;
          for (const ruleItem of firewallItem.rules) {
            // Check the type of domain list
            if (ruleItem.customDomainList) {
              try {
                listName = ruleItem.customDomainList.split('/')[1].split('.')[0];
              } catch (e) {
                throw new Error(`[network-prep-stack] Error parsing list name from ${ruleItem.customDomainList}`);
              }
            } else {
              listName = ruleItem.managedDomainList!;
            }

            // Create the DNS firewall rule list
            try {
              if (domainMap.get(listName)) {
                if (ruleItem.action === 'BLOCK' && ruleItem.blockResponse === 'OVERRIDE') {
                  ruleList.push({
                    action: ruleItem.action.toString(),
                    firewallDomainListId: domainMap.get(listName)!,
                    priority: ruleItem.priority,
                    blockOverrideDnsType: 'CNAME',
                    blockOverrideDomain: ruleItem.blockOverrideDomain,
                    blockOverrideTtl: ruleItem.blockOverrideTtl,
                    blockResponse: ruleItem.blockResponse,
                  });
                } else {
                  ruleList.push({
                    action: ruleItem.action.toString(),
                    firewallDomainListId: domainMap.get(listName)!,
                    priority: ruleItem.priority,
                    blockResponse: ruleItem.blockResponse,
                  });
                }
              } else {
                throw new Error(`Domain list ${listName} not found in domain map`);
              }
            } catch (e) {
              throw new Error(`[network-prep-stack] Error updating DNS firewall rule list: ${e}`);
            }
          }

          Logger.info(`[network-prep-stack] Creating DNS firewall rule group ${firewallItem.name}`);
          const ruleGroup = new ResolverFirewallRuleGroup(this, pascalCase(`${firewallItem.name}RuleGroup`), {
            firewallRules: ruleList,
            name: firewallItem.name,
            tags: firewallItem.tags ?? [],
          });
          new ssm.StringParameter(this, pascalCase(`SsmParam${firewallItem.name}RuleGroup`), {
            parameterName: `/accelerator/network/route53Resolver/firewall/ruleGroups/${firewallItem.name}/id`,
            stringValue: ruleGroup.groupId,
          });

          if (firewallItem.shareTargets) {
            Logger.info(`[network-prep-stack] Share DNS firewall rule group ${firewallItem.name}`);

            // Build a list of principals to share to
            const principals: string[] = [];

            // Loop through all the defined OUs
            for (const ouItem of firewallItem.shareTargets.organizationalUnits ?? []) {
              let ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
              // AWS::RAM::ResourceShare expects the organizations ARN if
              // sharing with the entire org (Root)
              if (ouItem === 'Root') {
                ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
              }
              Logger.info(
                `[network-prep-stack] Share rule group ${firewallItem.name} with Organizational Unit ${ouItem}: ${ouArn}`,
              );
              principals.push(ouArn);
            }

            // Loop through all the defined accounts
            for (const account of firewallItem.shareTargets.accounts ?? []) {
              const accountId = props.accountsConfig.getAccountId(account);
              Logger.info(
                `[network-prep-stack] Share rule group ${firewallItem.name} with Account ${account}: ${accountId}`,
              );
              principals.push(accountId);
            }

            // Create the Resource Share
            new ResourceShare(this, `${pascalCase(firewallItem.name)}RuleGroupShare`, {
              name: `${firewallItem.name}_ResolverFirewallRuleGroupShare`,
              principals,
              resourceArns: [ruleGroup.groupArn],
            });
          }
        }
      }

      //
      // Route53 Resolver query log configuration
      //
      if (centralConfig.route53Resolver?.queryLogs) {
        // Create query log configurations only in the delegated admin account
        if (accountId === cdk.Stack.of(this).account) {
          const logItem = centralConfig.route53Resolver.queryLogs;

          if (logItem.destinations.includes('s3')) {
            Logger.info(`[network-prep-stack] Create DNS query log ${logItem.name}-s3 for central S3 destination`);
            const centralLogsBucket = cdk.aws_s3.Bucket.fromBucketName(
              this,
              'CentralLogsBucket',
              `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
                props.globalConfig.homeRegion
              }`,
            );

            const s3QueryLogConfig = new QueryLoggingConfig(this, pascalCase(`${logItem.name}S3QueryLogConfig`), {
              destination: centralLogsBucket,
              name: `${logItem.name}-s3`,
            });
            new ssm.StringParameter(this, pascalCase(`SsmParam${logItem.name}S3QueryLogConfig`), {
              parameterName: `/accelerator/network/route53Resolver/queryLogConfigs/${logItem.name}-s3/id`,
              stringValue: s3QueryLogConfig.logId,
            });

            if (logItem.shareTargets) {
              Logger.info(`[network-prep-stack] Share DNS query log config ${logItem.name}-s3`);

              // Build a list of principals to share to
              const principals: string[] = [];

              // Loop through all the defined OUs
              for (const ouItem of logItem.shareTargets.organizationalUnits ?? []) {
                let ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
                // AWS::RAM::ResourceShare expects the organizations ARN if
                // sharing with the entire org (Root)
                if (ouItem === 'Root') {
                  ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
                }
                Logger.info(
                  `[network-prep-stack] Share query log config ${logItem.name}-s3 with Organizational Unit ${ouItem}: ${ouArn}`,
                );
                principals.push(ouArn);
              }

              // Loop through all the defined accounts
              for (const account of logItem.shareTargets.accounts ?? []) {
                const accountId = props.accountsConfig.getAccountId(account);
                Logger.info(
                  `[network-prep-stack] Share rule group ${logItem.name}-s3 with Account ${account}: ${accountId}`,
                );
                principals.push(accountId);
              }

              // Create the Resource Share
              new ResourceShare(this, `${pascalCase(logItem.name)}S3QueryLogShare`, {
                name: `${logItem.name}-s3_QueryLogConfigShare`,
                principals,
                resourceArns: [s3QueryLogConfig.logArn],
              });
            }
          }

          if (logItem.destinations.includes('cloud-watch-logs')) {
            Logger.info(
              `[network-prep-stack] Create DNS query log ${logItem.name}-cwl for central CloudWatch logs destination`,
            );
            const organization = new Organization(this, 'Organization');

            const logKey = new cdk.aws_kms.Key(this, 'QueryLogsCmk', {
              alias: `accelerator/route53Resolver/queryLogs`,
              description: 'AWS Accelerator CloudWatch Logs CMK for Route 53 Resolver Query Logs',
              enableKeyRotation: true,
            });

            const logGroup = new cdk.aws_logs.LogGroup(this, 'QueryLogsLogGroup', {
              encryptionKey: logKey,
            });

            const cwlQueryLogConfig = new QueryLoggingConfig(this, pascalCase(`${logItem.name}CwlQueryLogConfig`), {
              destination: logGroup,
              name: `${logItem.name}-cwl`,
              key: logKey,
              organizationId: organization.id,
            });
            new ssm.StringParameter(this, pascalCase(`SsmParam${logItem.name}CwlQueryLogConfig`), {
              parameterName: `/accelerator/network/route53Resolver/queryLogConfigs/${logItem.name}-cwl/id`,
              stringValue: cwlQueryLogConfig.logId,
            });

            if (logItem.shareTargets) {
              Logger.info(`[network-prep-stack] Share DNS query log config ${logItem.name}-cwl`);

              // Build a list of principals to share to
              const principals: string[] = [];

              // Loop through all the defined OUs
              for (const ouItem of logItem.shareTargets.organizationalUnits ?? []) {
                let ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
                // AWS::RAM::ResourceShare expects the organizations ARN if
                // sharing with the entire org (Root)
                if (ouItem === 'Root') {
                  ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
                }
                Logger.info(
                  `[network-prep-stack] Share query log config ${logItem.name}-cwl with Organizational Unit ${ouItem}: ${ouArn}`,
                );
                principals.push(ouArn);
              }

              // Loop through all the defined accounts
              for (const account of logItem.shareTargets.accounts ?? []) {
                const accountId = props.accountsConfig.getAccountId(account);
                Logger.info(
                  `[network-prep-stack] Share rule group ${logItem.name}-cwl with Account ${account}: ${accountId}`,
                );
                principals.push(accountId);
              }

              // Create the Resource Share
              new ResourceShare(this, `${pascalCase(logItem.name)}CwlQueryLogShare`, {
                name: `${logItem.name}-cwl_QueryLogConfigShare`,
                principals,
                resourceArns: [cwlQueryLogConfig.logArn],
              });
            }
          }
        }
      }
    }
  }
}

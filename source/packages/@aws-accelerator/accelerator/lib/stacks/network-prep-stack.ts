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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';

import {
  AccountsConfig,
  DnsFirewallRuleGroupConfig,
  DnsQueryLogsConfig,
  IpamPoolConfig,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  OrganizationConfig,
  TransitGatewayConfig,
} from '@aws-accelerator/config';
import {
  FirewallPolicyProperty,
  Ipam,
  IpamPool,
  IpamScope,
  KeyLookup,
  NetworkFirewallPolicy,
  NetworkFirewallRuleGroup,
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
import { KeyStack } from './key-stack';

interface ResolverFirewallRuleProps {
  action: string;
  firewallDomainListId: string;
  priority: number;
  blockOverrideDnsType?: string;
  blockOverrideDomain?: string;
  blockOverrideTtl?: number;
  blockResponse?: string;
}

type ResourceShareType =
  | DnsFirewallRuleGroupConfig
  | DnsQueryLogsConfig
  | IpamPoolConfig
  | NfwRuleGroupConfig
  | NfwFirewallPolicyConfig
  | TransitGatewayConfig;

export class NetworkPrepStack extends AcceleratorStack {
  private accountsConfig: AccountsConfig;
  private orgConfig: OrganizationConfig;
  private key: cdk.aws_kms.Key;
  private logRetention: number;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.orgConfig = props.organizationConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    //
    // Generate Transit Gateways
    //
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = this.accountsConfig.getAccountId(tgwItem.account);
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
          this.addResourceShare(tgwItem, `${tgwItem.name}_TransitGatewayShare`, [tgw.transitGatewayArn]);
        }
      }
    }

    //
    // Central network services
    //
    if (props.networkConfig.centralNetworkServices) {
      const centralConfig = props.networkConfig.centralNetworkServices;
      const accountId = this.accountsConfig.getAccountId(centralConfig.delegatedAdminAccount);

      //
      // Generate IPAMs
      //
      for (const ipamItem of centralConfig.ipams ?? []) {
        const poolMap = new Map<string, IpamPool>();
        const scopeMap = new Map<string, IpamScope>();

        if (accountId === cdk.Stack.of(this).account && ipamItem.region === cdk.Stack.of(this).region) {
          Logger.info(`[network-prep-stack] Add IPAM ${ipamItem.name}`);

          // Create IPAM
          const ipam = new Ipam(this, pascalCase(`${ipamItem.name}Ipam`), {
            name: ipamItem.name,
            description: ipamItem.description,
            operatingRegions: ipamItem.operatingRegions,
            tags: ipamItem.tags,
          });
          new ssm.StringParameter(this, pascalCase(`SsmParam${ipamItem.name}IpamId`), {
            parameterName: `/accelerator/network/ipam/${ipamItem.name}/id`,
            stringValue: ipam.ipamId,
          });

          // Create scopes
          for (const scopeItem of ipamItem.scopes ?? []) {
            Logger.info(`[network-prep-stack] Add IPAM scope ${scopeItem.name}`);
            const ipamScope = new IpamScope(this, pascalCase(`${scopeItem.name}Scope`), {
              ipamId: ipam.ipamId,
              name: scopeItem.name,
              description: scopeItem.description,
              tags: scopeItem.tags ?? [],
            });
            scopeMap.set(scopeItem.name, ipamScope);
            new ssm.StringParameter(this, pascalCase(`SsmParam${scopeItem.name}ScopeId`), {
              parameterName: `/accelerator/network/ipam/scopes/${scopeItem.name}/id`,
              stringValue: ipamScope.ipamScopeId,
            });
          }

          // Create pools
          if (ipamItem.pools) {
            // Create base pools
            const basePools = ipamItem.pools.filter(item => {
              return !item.sourceIpamPool;
            });
            for (const poolItem of basePools ?? []) {
              Logger.info(`[network-prep-stack] Add IPAM top-level pool ${poolItem.name}`);
              let poolScope: string | undefined;

              if (poolItem.scope) {
                poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

                if (!poolScope) {
                  throw new Error(
                    `[network-prep-stack] Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`,
                  );
                }
              }

              const pool = new IpamPool(this, pascalCase(`${poolItem.name}Pool`), {
                addressFamily: poolItem.addressFamily ?? 'ipv4',
                ipamScopeId: poolScope ?? ipam.privateDefaultScopeId,
                name: poolItem.name,
                allocationDefaultNetmaskLength: poolItem.allocationDefaultNetmaskLength,
                allocationMaxNetmaskLength: poolItem.allocationMaxNetmaskLength,
                allocationMinNetmaskLength: poolItem.allocationMinNetmaskLength,
                allocationResourceTags: poolItem.allocationResourceTags,
                autoImport: poolItem.autoImport,
                description: poolItem.description,
                locale: poolItem.locale,
                provisionedCidrs: poolItem.provisionedCidrs,
                publiclyAdvertisable: poolItem.publiclyAdvertisable,
                tags: poolItem.tags,
              });
              poolMap.set(poolItem.name, pool);
              new ssm.StringParameter(this, pascalCase(`SsmParam${poolItem.name}PoolId`), {
                parameterName: `/accelerator/network/ipam/pools/${poolItem.name}/id`,
                stringValue: pool.ipamPoolId,
              });

              // Add resource shares
              if (poolItem.shareTargets) {
                Logger.info(`[network-prep-stack] Share IPAM pool ${poolItem.name}`);
                this.addResourceShare(poolItem, `${poolItem.name}_IpamPoolShare`, [pool.ipamPoolArn]);
              }
            }

            // Create nested pools
            const nestedPools = ipamItem.pools.filter(item => {
              return item.sourceIpamPool;
            });

            // Use while loop for iteration
            while (poolMap.size < ipamItem.pools.length) {
              for (const poolItem of nestedPools) {
                // Check if source pool name has been created or exists in the config array
                const sourcePool = poolMap.get(poolItem.sourceIpamPool!)?.ipamPoolId;
                if (!sourcePool) {
                  // Check for case where the source pool hasn't been created yet
                  const sourcePoolExists = nestedPools.find(item => item.name === poolItem.sourceIpamPool);
                  if (!sourcePoolExists) {
                    throw new Error(
                      `[network-prep-stack] Unable to locate source IPAM pool ${poolItem.sourceIpamPool} for pool ${poolItem.name}`,
                    );
                  }
                  // Skip iteration if source pool exists but has not yet been created
                  continue;
                }

                // Check if this item has already been created
                const poolExists = poolMap.get(poolItem.name);

                if (sourcePool && !poolExists) {
                  Logger.info(`[network-prep-stack] Add IPAM nested pool ${poolItem.name}`);
                  let poolScope: string | undefined;

                  if (poolItem.scope) {
                    poolScope = scopeMap.get(poolItem.scope)?.ipamScopeId;

                    if (!poolScope) {
                      throw new Error(
                        `[network-prep-stack] Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`,
                      );
                    }
                  }

                  const pool = new IpamPool(this, pascalCase(`${poolItem.name}Pool`), {
                    addressFamily: poolItem.addressFamily ?? 'ipv4',
                    ipamScopeId: poolScope ?? ipam.privateDefaultScopeId,
                    name: poolItem.name,
                    allocationDefaultNetmaskLength: poolItem.allocationDefaultNetmaskLength,
                    allocationMaxNetmaskLength: poolItem.allocationMaxNetmaskLength,
                    allocationMinNetmaskLength: poolItem.allocationMinNetmaskLength,
                    allocationResourceTags: poolItem.allocationResourceTags,
                    autoImport: poolItem.autoImport,
                    description: poolItem.description,
                    locale: poolItem.locale,
                    provisionedCidrs: poolItem.provisionedCidrs,
                    publiclyAdvertisable: poolItem.publiclyAdvertisable,
                    sourceIpamPoolId: sourcePool,
                    tags: poolItem.tags,
                  });
                  // Record item in pool map
                  poolMap.set(poolItem.name, pool);
                  new ssm.StringParameter(this, pascalCase(`SsmParam${poolItem.name}PoolId`), {
                    parameterName: `/accelerator/network/ipam/pools/${poolItem.name}/id`,
                    stringValue: pool.ipamPoolId,
                  });

                  // Add resource shares
                  if (poolItem.shareTargets) {
                    Logger.info(`[network-prep-stack] Share IPAM pool ${poolItem.name}`);
                    this.addResourceShare(poolItem, `${poolItem.name}_IpamPoolShare`, [pool.ipamPoolArn]);
                  }
                }
              }
            }
          }
        }
      }

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
                kmsKey: this.key,
                logRetentionInDays: this.logRetention,
              });
              domainMap.set(listName, domainList.listId);
            }
          }

          // Build new rule list with domain list ID
          const ruleList: ResolverFirewallRuleProps[] = [];
          let domainListName: string;
          for (const ruleItem of firewallItem.rules) {
            // Check the type of domain list
            if (ruleItem.customDomainList) {
              try {
                domainListName = ruleItem.customDomainList.split('/')[1].split('.')[0];
              } catch (e) {
                throw new Error(`[network-prep-stack] Error parsing list name from ${ruleItem.customDomainList}`);
              }
            } else {
              domainListName = ruleItem.managedDomainList!;
            }

            // Create the DNS firewall rule list

            if (domainMap.get(domainListName)) {
              if (ruleItem.action === 'BLOCK' && ruleItem.blockResponse === 'OVERRIDE') {
                ruleList.push({
                  action: ruleItem.action.toString(),
                  firewallDomainListId: domainMap.get(domainListName)!,
                  priority: ruleItem.priority,
                  blockOverrideDnsType: 'CNAME',
                  blockOverrideDomain: ruleItem.blockOverrideDomain,
                  blockOverrideTtl: ruleItem.blockOverrideTtl,
                  blockResponse: ruleItem.blockResponse,
                });
              } else {
                ruleList.push({
                  action: ruleItem.action.toString(),
                  firewallDomainListId: domainMap.get(domainListName)!,
                  priority: ruleItem.priority,
                  blockResponse: ruleItem.blockResponse,
                });
              }
            } else {
              throw new Error(`Domain list ${domainListName} not found in domain map`);
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
            this.addResourceShare(firewallItem, `${firewallItem.name}_ResolverFirewallRuleGroupShare`, [
              ruleGroup.groupArn,
            ]);
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
              this.addResourceShare(logItem, `${logItem.name}-s3_QueryLogConfigShare`, [s3QueryLogConfig.logArn]);
            }
          }

          if (logItem.destinations.includes('cloud-watch-logs')) {
            Logger.info(
              `[network-prep-stack] Create DNS query log ${logItem.name}-cwl for central CloudWatch logs destination`,
            );
            const organization = new Organization(this, 'Organization');

            const logGroup = new cdk.aws_logs.LogGroup(this, 'QueryLogsLogGroup', {
              encryptionKey: this.key,
              retention: this.logRetention,
            });

            const cwlQueryLogConfig = new QueryLoggingConfig(this, pascalCase(`${logItem.name}CwlQueryLogConfig`), {
              destination: logGroup,
              name: `${logItem.name}-cwl`,
              organizationId: organization.id,
            });
            new ssm.StringParameter(this, pascalCase(`SsmParam${logItem.name}CwlQueryLogConfig`), {
              parameterName: `/accelerator/network/route53Resolver/queryLogConfigs/${logItem.name}-cwl/id`,
              stringValue: cwlQueryLogConfig.logId,
            });

            if (logItem.shareTargets) {
              Logger.info(`[network-prep-stack] Share DNS query log config ${logItem.name}-cwl`);
              this.addResourceShare(logItem, `${logItem.name}-cwl_QueryLogConfigShare`, [cwlQueryLogConfig.logArn]);
            }
          }
        }
      }

      //
      // Network Firewall rule groups
      //
      const ruleMap = new Map<string, string>();

      for (const ruleItem of centralConfig.networkFirewall?.rules ?? []) {
        const regions = ruleItem.regions.map(item => {
          return item.toString();
        });

        // Create regional rule groups in the delegated admin account
        if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
          Logger.info(`[network-prep-stack] Create network firewall rule group ${ruleItem.name}`);
          const rule = new NetworkFirewallRuleGroup(this, pascalCase(`${ruleItem.name}NetworkFirewallRuleGroup`), {
            capacity: ruleItem.capacity,
            name: ruleItem.name,
            type: ruleItem.type,
            description: ruleItem.description,
            ruleGroup: ruleItem.ruleGroup,
            tags: ruleItem.tags ?? [],
          });
          ruleMap.set(ruleItem.name, rule.groupArn);
          new ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}NetworkFirewallRuleGroup`), {
            parameterName: `/accelerator/network/networkFirewall/ruleGroups/${ruleItem.name}/arn`,
            stringValue: rule.groupArn,
          });

          if (ruleItem.shareTargets) {
            Logger.info(`[network-prep-stack] Share Network Firewall rule group ${ruleItem.name}`);
            this.addResourceShare(ruleItem, `${ruleItem.name}_NetworkFirewallRuleGroupShare`, [rule.groupArn]);
          }
        }
      }

      //
      // Network Firewall policies
      //
      for (const policyItem of centralConfig.networkFirewall?.policies ?? []) {
        const regions = policyItem.regions.map(item => {
          return item.toString();
        });

        // Create regional rule groups in the delegated admin account
        if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
          // Store rule group references to associate with policy
          const statefulGroups = [];
          const statelessGroups = [];

          for (const group of policyItem.firewallPolicy.statefulRuleGroups ?? []) {
            if (ruleMap.has(group.name)) {
              statefulGroups.push({ priority: group.priority, resourceArn: ruleMap.get(group.name)! });
            } else {
              throw new Error(`[network-prep-stack] Rule group ${group.name} not found in rule map`);
            }
          }

          for (const group of policyItem.firewallPolicy.statelessRuleGroups ?? []) {
            if (ruleMap.has(group.name)) {
              statelessGroups.push({ priority: group.priority, resourceArn: ruleMap.get(group.name)! });
            } else {
              throw new Error(`[network-prep-stack] Rule group ${group.name} not found in rule map`);
            }
          }

          // Create new firewall policy object with rule group references
          const firewallPolicy: FirewallPolicyProperty = {
            statelessDefaultActions: policyItem.firewallPolicy.statelessDefaultActions,
            statelessFragmentDefaultActions: policyItem.firewallPolicy.statelessFragmentDefaultActions,
            statefulDefaultActions: policyItem.firewallPolicy.statefulDefaultActions,
            statefulEngineOptions: policyItem.firewallPolicy.statefulEngineOptions,
            statefulRuleGroupReferences: statefulGroups,
            statelessCustomActions: policyItem.firewallPolicy.statelessCustomActions,
            statelessRuleGroupReferences: statelessGroups,
          };

          // Instantiate firewall policy construct
          Logger.info(`[network-prep-stack] Create network firewall policy ${policyItem.name}`);
          const policy = new NetworkFirewallPolicy(this, pascalCase(`${policyItem.name}NetworkFirewallPolicy`), {
            name: policyItem.name,
            firewallPolicy: firewallPolicy,
            description: policyItem.description,
            tags: policyItem.tags ?? [],
          });
          new ssm.StringParameter(this, pascalCase(`SsmParam${policyItem.name}NetworkFirewallPolicy`), {
            parameterName: `/accelerator/network/networkFirewall/policies/${policyItem.name}/arn`,
            stringValue: policy.policyArn,
          });

          if (policyItem.shareTargets) {
            Logger.info(`[network-prep-stack] Share Network Firewall policy ${policyItem.name}`);
            this.addResourceShare(policyItem, `${policyItem.name}_NetworkFirewallPolicyShare`, [policy.policyArn]);
          }
        }
      }
    }

    Logger.info('[network-prep-stack] Completed stack synthesis');
  }

  /**
   * Add RAM resource shares to the stack.
   *
   * @param item
   * @param resourceShareName
   * @param resourceArns
   */
  private addResourceShare(item: ResourceShareType, resourceShareName: string, resourceArns: string[]) {
    // Build a list of principals to share to
    const principals: string[] = [];

    // Loop through all the defined OUs
    for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
      let ouArn = this.orgConfig.getOrganizationalUnitArn(ouItem);
      // AWS::RAM::ResourceShare expects the organizations ARN if
      // sharing with the entire org (Root)
      if (ouItem === 'Root') {
        ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
      }
      Logger.info(`[network-prep-stack] Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
      principals.push(ouArn);
    }

    // Loop through all the defined accounts
    for (const account of item.shareTargets?.accounts ?? []) {
      const accountId = this.accountsConfig.getAccountId(account);
      Logger.info(`[network-prep-stack] Share ${resourceShareName} with Account ${account}: ${accountId}`);
      principals.push(accountId);
    }

    // Create the Resource Share
    new ResourceShare(this, `${pascalCase(resourceShareName)}ResourceShare`, {
      name: resourceShareName,
      principals,
      resourceArns: resourceArns,
    });
  }
}

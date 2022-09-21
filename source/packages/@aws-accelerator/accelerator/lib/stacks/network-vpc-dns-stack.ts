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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  AccountsConfig,
  Region,
  ResolverEndpointConfig,
  ResolverRuleConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { HostedZone, RecordSet, ResolverRule } from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class NetworkVpcDnsStack extends AcceleratorStack {
  private cloudwatchKey: cdk.aws_kms.Key;
  private accountsConfig: AccountsConfig;
  private logRetention: number;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    //
    // Store VPC IDs, interface endpoint DNS, and Route 53 resolver endpoints
    //
    const vpcMap = new Map<string, string>();
    const endpointMap = new Map<string, string>();
    const zoneMap = new Map<string, string>();
    const resolverMap = new Map<string, string>();
    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        // Set VPC ID
        const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${vpcItem.name}/id`,
        );
        vpcMap.set(vpcItem.name, vpcId);

        // Set interface endpoint DNS names
        for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
          const endpointDns = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem.service}/dns`,
          );
          const zoneId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem.service}/hostedZoneId`,
          );
          endpointMap.set(`${vpcItem.name}_${endpointItem.service}`, endpointDns);
          zoneMap.set(`${vpcItem.name}_${endpointItem.service}`, zoneId);
        }

        // Set Route 53 resolver endpoints
        if (props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints) {
          const endpoints = props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;

          for (const endpointItem of endpoints) {
            // Only map endpoints for relevant VPCs
            if (endpointItem.vpc === vpcItem.name) {
              const endpointId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/route53Resolver/endpoints/${endpointItem.name}/id`,
              );
              resolverMap.set(`${vpcItem.name}_${endpointItem.name}`, endpointId);
            }
          }
        }
      }
    }

    //
    // Create private hosted zones
    //

    for (const vpcItem of [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        const vpcId = vpcMap.get(vpcItem.name);

        if (!vpcId) {
          throw new Error(`[network-vpc-dns-stack] Unable to locate VPC ${vpcItem.name}`);
        }
        // Create private hosted zones
        if (vpcItem.interfaceEndpoints?.central) {
          this.createHostedZones(vpcItem, vpcId, endpointMap, zoneMap);
        }

        //
        // Create resolver rules
        //

        // FORWARD rules
        if (props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints) {
          const endpoints = props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;

          for (const endpointItem of endpoints) {
            if (endpointItem.vpc === vpcItem.name && endpointItem.type === 'OUTBOUND') {
              this.createForwardRules(vpcItem, endpointItem, resolverMap);
            }
          }
        }
      }
    }

    // SYSTEM rules
    if (props.networkConfig.centralNetworkServices?.route53Resolver?.rules) {
      const delegatedAdminAccountId = this.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      // Only deploy in the delegated admin account
      if (delegatedAdminAccountId === cdk.Stack.of(this).account) {
        this.createSystemRules(props.networkConfig.centralNetworkServices?.route53Resolver?.rules);
      }
    }

    Logger.info('[network-vpc-dns-stack] Completed stack synthesis');
  }

  /**
   * Create private hosted zones
   *
   * @param vpcItem
   * @param vpcId
   * @param endpointMap
   * @param zoneMap
   */
  private createHostedZones(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcId: string,
    endpointMap: Map<string, string>,
    zoneMap: Map<string, string>,
  ): void {
    for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
      // Create the private hosted zone
      Logger.info(
        `[network-vpc-dns-stack] Creating private hosted zone for VPC:${vpcItem.name} endpoint:${endpointItem.service}`,
      );
      const hostedZoneName = HostedZone.getHostedZoneNameForService(endpointItem.service, cdk.Stack.of(this).region);
      const hostedZone = new HostedZone(
        this,
        `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
        {
          hostedZoneName,
          vpcId,
        },
      );
      new cdk.aws_ssm.StringParameter(
        this,
        `SsmParam${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
        {
          parameterName: `/accelerator/network/vpc/${vpcItem.name}/route53/hostedZone/${endpointItem.service}/id`,
          stringValue: hostedZone.hostedZoneId,
        },
      );

      // Create the record set
      let recordSetName = hostedZoneName;
      const wildcardServices = ['ecr.dkr', 's3'];
      if (wildcardServices.includes(endpointItem.service)) {
        recordSetName = `*.${hostedZoneName}`;
      }

      // Check mapping for DNS name
      const endpointKey = `${vpcItem.name}_${endpointItem.service}`;
      const dnsName = endpointMap.get(endpointKey);
      const zoneId = zoneMap.get(endpointKey);
      if (!dnsName) {
        throw new Error(
          `[network-vpc-dns-stack] Unable to locate DNS name for VPC:${vpcItem.name} endpoint:${endpointItem.service}`,
        );
      }
      if (!zoneId) {
        throw new Error(
          `[network-vpc-dns-stack] Unable to locate hosted zone ID for VPC:${vpcItem.name} endpoint:${endpointItem.service}`,
        );
      }

      Logger.info(
        `[network-vpc-dns-stack] Creating alias record for VPC:${vpcItem.name} endpoint:${endpointItem.service}`,
      );
      new RecordSet(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpRecordSet`, {
        type: 'A',
        name: recordSetName,
        hostedZone: hostedZone,
        dnsName: dnsName,
        hostedZoneId: zoneId,
      });
    }
  }

  /**
   * Create Route 53 resolver FORWARD rules
   *
   * @param vpcItem
   * @param endpointItem
   * @param resolverMap
   */
  private createForwardRules(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    endpointItem: ResolverEndpointConfig,
    resolverMap: Map<string, string>,
  ): void {
    // Check for endpoint in map
    const endpointKey = `${vpcItem.name}_${endpointItem.name}`;
    const endpointId = resolverMap.get(endpointKey);
    if (!endpointId) {
      throw new Error(
        `[network-vpc-dns-stack] Create resolver rule: unable to locate resolver endpoint ${endpointItem.name}`,
      );
    }

    // Create rules
    for (const ruleItem of endpointItem.rules ?? []) {
      Logger.info(
        `[network-vpc-dns-stack] Add Route 53 Resolver FORWARD rule ${ruleItem.name} to endpoint ${endpointItem.name}`,
      );

      // Check whether there is an inbound endpoint target
      let inboundTarget: string | undefined = undefined;
      if (ruleItem.inboundEndpointTarget) {
        const targetKey = `${vpcItem.name}_${ruleItem.inboundEndpointTarget}`;
        inboundTarget = resolverMap.get(targetKey);
        if (!inboundTarget) {
          throw new Error(
            `[network-vpc-dns-stack] Target inbound endpoint: ${ruleItem.inboundEndpointTarget} not found in endpoint map`,
          );
        }
      }

      // Create resolver rule and SSM parameter
      const rule = new ResolverRule(this, `${pascalCase(endpointItem.name)}ResolverRule${pascalCase(ruleItem.name)}`, {
        domainName: ruleItem.domainName,
        name: ruleItem.name,
        ruleType: ruleItem.ruleType,
        resolverEndpointId: endpointId,
        targetIps: ruleItem.targetIps,
        tags: ruleItem.tags,
        targetInbound: inboundTarget,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}ResolverRule`), {
        parameterName: `/accelerator/network/route53Resolver/rules/${ruleItem.name}/id`,
        stringValue: rule.ruleId,
      });

      if (ruleItem.shareTargets) {
        Logger.info(`[network-vpc-dns-stack] Share Route 53 Resolver FORWARD rule ${ruleItem.name}`);
        this.addResourceShare(ruleItem, `${ruleItem.name}_ResolverRule`, [rule.ruleArn]);
      }
    }
  }

  /**
   * Create Route 53 resolver SYSTEM rules
   * @param rules
   */
  private createSystemRules(rules: ResolverRuleConfig[]): void {
    // Process SYSTEM rules
    for (const ruleItem of rules ?? []) {
      // Only deploy if the region isn't excluded
      if (!ruleItem.excludedRegions?.includes(cdk.Stack.of(this).region as Region) || !ruleItem.excludedRegions) {
        Logger.info(`[network-vpc-dns-stack] Add Route 53 Resolver SYSTEM rule ${ruleItem.name}`);

        const rule = new ResolverRule(this, `SystemResolverRule${pascalCase(ruleItem.name)}`, {
          domainName: ruleItem.domainName,
          name: ruleItem.name,
          ruleType: ruleItem.ruleType ?? 'SYSTEM',
          tags: ruleItem.tags,
        });
        new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${ruleItem.name}ResolverRule`), {
          parameterName: `/accelerator/network/route53Resolver/rules/${ruleItem.name}/id`,
          stringValue: rule.ruleId,
        });

        if (ruleItem.shareTargets) {
          Logger.info(`[network-vpc-dns-stack] Share Route 53 Resolver SYSTEM rule ${ruleItem.name}`);
          this.addResourceShare(ruleItem, `${ruleItem.name}_ResolverRule`, [rule.ruleArn]);
        }
      }
    }
  }
}

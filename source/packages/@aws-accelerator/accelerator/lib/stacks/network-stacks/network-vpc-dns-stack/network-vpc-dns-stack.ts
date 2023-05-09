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
import { NagSuppressions } from 'cdk-nag';

import {
  InterfaceEndpointServiceConfig,
  Region,
  ResolverEndpointConfig,
  ResolverRuleConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { HostedZone, RecordSet, ResolverRule } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';

export class NetworkVpcDnsStack extends NetworkStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    //
    // Store VPC IDs, interface endpoint DNS, and Route 53 resolver endpoints
    //
    const vpcMap = this.setVpcMap(this.vpcsInScope);
    const [endpointMap, zoneMap] = this.setInterfaceEndpointDnsMap(this.vpcsInScope);
    const resolverMap = this.setResolverEndpointMap(this.vpcsInScope);

    //
    // Create private hosted zones
    //

    for (const vpcItem of this.vpcsInScope) {
      const vpcId = vpcMap.get(vpcItem.name);

      if (!vpcId) {
        this.logger.error(`Unable to locate VPC ${vpcItem.name}`);
        throw new Error(`Configuration validation failed at runtime.`);
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

    // SYSTEM rules
    if (props.networkConfig.centralNetworkServices?.route53Resolver?.rules) {
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      // Only deploy in the delegated admin account
      if (delegatedAdminAccountId === cdk.Stack.of(this).account) {
        this.createSystemRules(props.networkConfig.centralNetworkServices?.route53Resolver?.rules);
      }
    }

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
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
      this.logger.info(`Creating private hosted zone for VPC:${vpcItem.name} endpoint:${endpointItem.service}`);
      const hostedZoneName = HostedZone.getHostedZoneNameForService(endpointItem.service, cdk.Stack.of(this).region);
      const hostedZone = new HostedZone(
        this,
        `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
        {
          hostedZoneName,
          vpcId,
        },
      );
      this.ssmParameters.push({
        logicalId: `SsmParam${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
        parameterName: this.getSsmPath(SsmResourceType.PHZ_ID, [vpcItem.name, endpointItem.service]),
        stringValue: hostedZone.hostedZoneId,
      });

      // Create record sets
      this.createRecordSets(vpcItem, endpointItem, endpointMap, zoneMap, hostedZoneName, hostedZone);
    }
  }

  /**
   * Create record sets for centralized interface endpoints
   * @param vpcItem
   * @param endpointItem
   * @param endpointMap
   * @param zoneMap
   * @param hostedZoneName
   * @param hostedZone
   */
  private createRecordSets(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    endpointItem: InterfaceEndpointServiceConfig,
    endpointMap: Map<string, string>,
    zoneMap: Map<string, string>,
    hostedZoneName: string,
    hostedZone: HostedZone,
  ) {
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
      this.logger.error(`Unable to locate DNS name for VPC:${vpcItem.name} endpoint:${endpointItem.service}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    if (!zoneId) {
      this.logger.error(`Unable to locate hosted zone ID for VPC:${vpcItem.name} endpoint:${endpointItem.service}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    // Create alias record for hosted zone
    this.logger.info(`Creating alias record for VPC:${vpcItem.name} endpoint:${endpointItem.service}`);
    new RecordSet(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpRecordSet`, {
      type: 'A',
      name: recordSetName,
      hostedZone: hostedZone,
      dnsName: dnsName,
      hostedZoneId: zoneId,
    });

    // Create additional record for S3 endpoints
    if (endpointItem.service === 's3') {
      this.logger.info(`Creating additional record for VPC:${vpcItem.name} endpoint:${endpointItem.service}`);
      new RecordSet(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpRecordSetNonWildcard`, {
        type: 'A',
        name: hostedZoneName,
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
      this.logger.error(`Create resolver rule: unable to locate resolver endpoint ${endpointItem.name}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    // Create rules
    for (const ruleItem of endpointItem.rules ?? []) {
      this.logger.info(`Add Route 53 Resolver FORWARD rule ${ruleItem.name} to endpoint ${endpointItem.name}`);

      // Check whether there is an inbound endpoint target
      let inboundTarget: string | undefined = undefined;
      if (ruleItem.inboundEndpointTarget) {
        const targetKey = `${vpcItem.name}_${ruleItem.inboundEndpointTarget}`;
        inboundTarget = resolverMap.get(targetKey);
        if (!inboundTarget) {
          this.logger.error(`Target inbound endpoint: ${ruleItem.inboundEndpointTarget} not found in endpoint map`);
          throw new Error(`Configuration validation failed at runtime.`);
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
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${ruleItem.name}ResolverRule`),
        parameterName: this.getSsmPath(SsmResourceType.RESOLVER_RULE, [ruleItem.name]),
        stringValue: rule.ruleId,
      });

      // create role to be assumed by MAD account to update resolver rule
      this.createManagedADResolverRuleUpdateRole(ruleItem.name, rule.ruleArn);

      if (ruleItem.shareTargets) {
        this.logger.info(`Share Route 53 Resolver FORWARD rule ${ruleItem.name}`);
        this.addResourceShare(ruleItem, `${ruleItem.name}_ResolverRule`, [rule.ruleArn]);
      }
    }
  }

  /**
   * Create IAM role to be assumed by MAD account to update resolver rule in central account
   * @param ruleName
   * @param ruleArn
   * @returns
   */
  private createManagedADResolverRuleUpdateRole(ruleName: string, ruleArn: string) {
    for (const managedActiveDirectory of this.props.iamConfig.managedActiveDirectories ?? []) {
      const madAccountId = this.props.accountsConfig.getAccountId(managedActiveDirectory.account);
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        this.props.networkConfig.centralNetworkServices!.delegatedAdminAccount,
      );

      if (madAccountId === delegatedAdminAccountId) {
        this.logger.info(
          `Managed AD account is same as delegated admin account, skipping role creation for ${managedActiveDirectory.name} active directory}`,
        );
        return;
      }
      if (
        delegatedAdminAccountId === cdk.Stack.of(this).account &&
        cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
        ruleName === managedActiveDirectory.resolverRuleName
      ) {
        this.logger.info(
          `Create Managed AD resolver rule update role for ${managedActiveDirectory.name} active directory`,
        );
        new cdk.aws_iam.Role(this, pascalCase(`${this.props.prefixes.accelerator}-MAD-${ruleName}`), {
          roleName: `${this.props.prefixes.accelerator}-MAD-${ruleName}`,
          assumedBy: new cdk.aws_iam.PrincipalWithConditions(new cdk.aws_iam.AccountPrincipal(madAccountId), {
            ArnLike: {
              'aws:PrincipalARN': [
                `arn:${cdk.Stack.of(this).partition}:iam::${madAccountId}:role/${this.props.prefixes.accelerator}-*`,
              ],
            },
          }),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['route53resolver:ListResolverRules'],
                  resources: ['*'],
                }),
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['route53resolver:UpdateResolverRule'],
                  resources: [ruleArn],
                }),
              ],
            }),
          },
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/` + pascalCase(`${this.props.prefixes.accelerator}-MAD-${ruleName}`) + '/Resource',
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'Role needs access to list resolver rules and update',
            },
          ],
        );
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
        this.logger.info(`Add Route 53 Resolver SYSTEM rule ${ruleItem.name}`);

        const rule = new ResolverRule(this, `SystemResolverRule${pascalCase(ruleItem.name)}`, {
          domainName: ruleItem.domainName,
          name: ruleItem.name,
          ruleType: ruleItem.ruleType ?? 'SYSTEM',
          tags: ruleItem.tags,
        });
        this.ssmParameters.push({
          logicalId: pascalCase(`SsmParam${ruleItem.name}ResolverRule`),
          parameterName: this.getSsmPath(SsmResourceType.RESOLVER_RULE, [ruleItem.name]),
          stringValue: rule.ruleId,
        });

        if (ruleItem.shareTargets) {
          this.logger.info(`Share Route 53 Resolver SYSTEM rule ${ruleItem.name}`);
          this.addResourceShare(ruleItem, `${ruleItem.name}_ResolverRule`, [rule.ruleArn]);
        }
      }
    }
  }
}

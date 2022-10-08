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

import { EndpointAddresses } from './endpoint-addresses';

export interface IResolverRule extends cdk.IResource {
  /**
   * The friendly name of the resolver rule.
   */
  readonly name: string;

  /**
   * The Amazon Resource Name (ARN) of the resolver rule.
   */
  readonly ruleArn: string;

  /**
   * The ID that Resolver assigned to the resolver rule when you created it.
   */
  readonly ruleId: string;
}

export interface ResolverRuleProps {
  /**
   * DNS queries for this domain name are forwarded to the IP addresses that are specified in `TargetIps`.
   */
  readonly domainName: string;

  /**
   * The name for the Resolver rule.
   */
  readonly name: string;

  /**
   * The ID of the endpoint that the rule is associated with.
   */
  readonly resolverEndpointId?: string;

  /**
   * The type of resolver rule: FORWARD, RECURSIVE, or SYSTEM.
   *
   * @default FORWARD
   */
  readonly ruleType?: string;

  /**
   * Choose to target an inbound resolver endpoint for name resolution.
   */
  readonly targetInbound?: string;

  /**
   * An array that contains the IP addresses and ports that an outbound endpoint forwards DNS queries to.
   */
  readonly targetIps?: cdk.aws_route53resolver.CfnResolverRule.TargetAddressProperty[];

  /**
   * A list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays?: number;
}

export class ResolverRule extends cdk.Resource implements IResolverRule {
  public readonly name: string;
  public readonly ruleArn: string;
  public readonly ruleId: string;
  private targetIps?: cdk.aws_route53resolver.CfnResolverRule.TargetAddressProperty[] | cdk.Reference;

  constructor(scope: Construct, id: string, props: ResolverRuleProps) {
    super(scope, id);

    this.name = props.name;

    if (props.targetInbound) {
      if (!props.kmsKey) {
        throw new Error(`kmsKey property must be included if targetInbound property is defined.`);
      }
      if (!props.logRetentionInDays) {
        throw new Error(`logRetentionInDays property must be included if targetInbound property is defined.`);
      }
      this.targetIps = this.lookupInbound(props.targetInbound, props.kmsKey, props.logRetentionInDays);
    } else {
      this.targetIps = props.targetIps;
    }

    const resource = new cdk.aws_route53resolver.CfnResolverRule(this, 'Resource', {
      domainName: props.domainName,
      resolverEndpointId: props.ruleType === 'SYSTEM' ? undefined : props.resolverEndpointId,
      ruleType: props.ruleType ?? 'FORWARD',
      name: this.name,
      targetIps: this.targetIps,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', this.name);

    this.ruleArn = resource.attrArn;
    this.ruleId = resource.attrResolverRuleId;
  }

  private lookupInbound(endpointId: string, kmsKey: cdk.aws_kms.Key, logRetentionInDays: number): cdk.Reference {
    const lookup = new EndpointAddresses(this, 'LookupInbound', {
      endpointId: endpointId,
      kmsKey,
      logRetentionInDays,
    });
    return lookup.ipAddresses;
  }
}

export interface ResolverRuleAssociationProps {
  /**
   * The ID of the Resolver rule to associate.
   */
  readonly resolverRuleId: string;

  /**
   * The ID of the VPC to associate.
   */
  readonly vpcId: string;
}

export class ResolverRuleAssociation extends cdk.Resource {
  constructor(scope: Construct, id: string, props: ResolverRuleAssociationProps) {
    super(scope, id);

    new cdk.aws_route53resolver.CfnResolverRuleAssociation(this, 'Resource', {
      resolverRuleId: props.resolverRuleId,
      vpcId: props.vpcId,
    });
  }
}

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

export interface IResolverFirewallRuleGroup extends cdk.IResource {
  /**
   * The ARN (Amazon Resource Name) of the rule group.
   */
  readonly groupArn: string;

  /**
   * The ID of the rule group.
   */
  readonly groupId: string;

  /**
   * The name of the rule group.
   */
  readonly name: string;
}

export interface ResolverFirewallRuleGroupProps {
  /**
   * A list of the rules that you have defined.
   */
  readonly firewallRules: cdk.aws_route53resolver.CfnFirewallRuleGroup.FirewallRuleProperty[];

  /**
   * The name of the rule group.
   */
  readonly name: string;

  /**
   * A list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class ResolverFirewallRuleGroup extends cdk.Resource implements IResolverFirewallRuleGroup {
  public readonly groupArn: string;
  public readonly groupId: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: ResolverFirewallRuleGroupProps) {
    super(scope, id);

    this.name = props.name;
    props.tags?.push({ key: 'Name', value: this.name });

    const resource = new cdk.aws_route53resolver.CfnFirewallRuleGroup(this, 'Resource', {
      firewallRules: props.firewallRules,
      tags: props.tags,
    });

    this.groupArn = resource.attrArn;
    this.groupId = resource.ref;
  }
}

export interface ResolverFirewallRuleGroupAssociationProps {
  /**
   * The unique identifier of the firewall rule group.
   */
  readonly firewallRuleGroupId: string;

  /**
   * The setting that determines the processing order of the rule group
   * among the rule groups that are associated with a single VPC.
   */
  readonly priority: number;

  /**
   * The unique identifier of the VPC that is associated with the rule group.
   */
  readonly vpcId: string;

  /**
   * If enabled, this setting disallows modification or removal of the association
   */
  readonly mutationProtection?: string;

  /**
   * A list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class ResolverFirewallRuleGroupAssociation extends cdk.Resource {
  constructor(scope: Construct, id: string, props: ResolverFirewallRuleGroupAssociationProps) {
    super(scope, id);

    new cdk.aws_route53resolver.CfnFirewallRuleGroupAssociation(this, 'Resource', {
      firewallRuleGroupId: props.firewallRuleGroupId,
      priority: props.priority,
      vpcId: props.vpcId,
      mutationProtection: props.mutationProtection,
      tags: props.tags,
    });
  }
}

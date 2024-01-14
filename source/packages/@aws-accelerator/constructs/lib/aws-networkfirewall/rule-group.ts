/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { NfwRuleGroupRuleConfig } from '@aws-accelerator/config';
import { transformRuleGroup } from './utils';

interface INetworkFirewallRuleGroup extends cdk.IResource {
  /**
   * The Amazon Resource Name (ARN) of the rule group.
   */
  readonly groupArn: string;

  /**
   * The ID of the rule group.
   */
  readonly groupId: string;

  /**
   * The name of the rule group.
   */
  readonly groupName: string;
}

interface NetworkFirewallRuleGroupProps {
  /**
   * The maximum operating resources that this rule group can use.
   */
  readonly capacity: number;

  /**
   * The name of the rule group.
   */
  readonly name: string;

  /**
   * Indicates whether the rule group is stateless or stateful.
   */
  readonly type: string;

  /**
   * A description of the rule group.
   */
  readonly description?: string;

  /**
   * An object that defines the rule group rules.
   */
  readonly ruleGroup?: NfwRuleGroupRuleConfig;

  /**
   * An optional list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class NetworkFirewallRuleGroup extends cdk.Resource implements INetworkFirewallRuleGroup {
  public readonly groupArn: string;
  public readonly groupId: string;
  public readonly groupName: string;

  /**
   * Returns CfnRuleGroup by applying updates to included resource
   * @param scope Stack in which included RuleGroup is created/managed
   * @param id logicalId of RuleGroup
   * @param attrs
   */
  static includedCfnResource(
    scope: cdk.cloudformation_include.CfnInclude,
    id: string,
    props: NetworkFirewallRuleGroupProps,
  ) {
    const resource = scope.getResource(id) as cdk.aws_networkfirewall.CfnRuleGroup;
    // Transform properties as necessary
    if (props.ruleGroup) {
      // Set rule group property
      resource.ruleGroup = transformRuleGroup(props.ruleGroup);
    } else {
      // Remove existing rule group property
      resource.ruleGroup = undefined;
    }
    // Updating capacity requires replacement
    resource.capacity = props.capacity;
    // Updating type requires replacement
    resource.type = props.type;
    resource.description = props.description;
    return resource;
  }

  static fromAttributes(
    scope: Construct,
    id: string,
    attrs: { groupArn: string; groupName: string },
  ): INetworkFirewallRuleGroup {
    class Import extends cdk.Resource implements INetworkFirewallRuleGroup {
      public readonly groupArn = attrs.groupArn;
      public readonly groupId = attrs.groupName;
      // groupId is not used anywhere. Need to store in SSM if needed
      public readonly groupName = '';

      constructor(scope: Construct, id: string) {
        super(scope, id);
      }
    }
    return new Import(scope, id);
  }

  constructor(scope: Construct, id: string, props: NetworkFirewallRuleGroupProps) {
    super(scope, id);

    // Set initial properties
    this.groupName = props.name;

    let ruleGroup: cdk.aws_networkfirewall.CfnRuleGroup.RuleGroupProperty | undefined;
    // Transform properties as necessary
    if (props.ruleGroup) {
      // Set rule group property
      ruleGroup = transformRuleGroup(props.ruleGroup);
    }

    // Set name tag
    props.tags?.push({ key: 'Name', value: this.groupName });

    const resource = new cdk.aws_networkfirewall.CfnRuleGroup(this, 'Resource', {
      capacity: props.capacity,
      ruleGroupName: this.groupName,
      type: props.type,
      description: props.description,
      ruleGroup,
      tags: props.tags,
    });

    this.groupArn = resource.ref;
    this.groupId = resource.attrRuleGroupId;
  }
}

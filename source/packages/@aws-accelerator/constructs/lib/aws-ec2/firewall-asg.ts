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
import { FirewallProps, IFirewall, Firewall } from './firewall';
import { AutoScalingConfig } from '@aws-accelerator/config';
import { AutoscalingGroup } from '../aws-autoscaling/create-autoscaling-group';

export interface IFirewallAutoScalingGroup extends IFirewall {
  /**
   * The Autoscaling Group ID
   */
  readonly groupName: string;
}

interface FirewallAutoScalingGroupProps extends FirewallProps {
  /**
   * The Autoscaling Group configuration
   */
  readonly autoscaling: AutoScalingConfig;
  /**
   * Custom resource lambda environment encryption key
   */
  readonly lambdaKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudWatchLogKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
}

export class FirewallAutoScalingGroup extends Firewall implements IFirewallAutoScalingGroup {
  public readonly groupName: string;

  constructor(scope: Construct, id: string, props: FirewallAutoScalingGroupProps) {
    super(scope, id, props);

    const tags = props.tags ? [{ key: 'Name', value: this.name }, ...props.tags] : [{ key: 'Name', value: this.name }];

    const asg = new AutoscalingGroup(this, 'Resource', {
      name: props.autoscaling.name,
      minSize: props.autoscaling.minSize,
      maxSize: props.autoscaling.maxSize,
      desiredSize: props.autoscaling.desiredSize,
      launchTemplateId: this.launchTemplate.launchTemplateId,
      launchTemplateVersion: this.launchTemplate.version,
      healthCheckType: props.autoscaling.healthCheckType,
      healthCheckGracePeriod: props.autoscaling.healthCheckGracePeriod,
      targetGroups: props.autoscaling.targetGroups,
      subnets: props.autoscaling.subnets,
      tags,
      lambdaKey: props.lambdaKey,
      cloudWatchLogKmsKey: props.cloudWatchLogKmsKey,
      cloudWatchLogRetentionInDays: props.cloudWatchLogRetentionInDays,
    });

    this.groupName = asg.autoscalingGroupName;
  }
}

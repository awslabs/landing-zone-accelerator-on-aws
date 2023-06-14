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
import { ServiceLinkedRole } from '@aws-accelerator/constructs';

export interface IAutoscalingGroupResource extends cdk.IResource {
  /**
   * The name of the AWS::AutoScaling::AutoScalingGroup resource
   */
  readonly autoscalingGroupName: string;
}

export interface AutoscalingGroupProps {
  readonly name: string;
  readonly minSize: number;
  readonly maxSize: number;
  readonly desiredSize: number;
  readonly launchTemplateVersion: string;
  readonly launchTemplateId: string;
  readonly healthCheckGracePeriod?: number;
  readonly healthCheckType?: string;
  readonly targetGroups?: string[];
  readonly subnets: string[];
  readonly lambdaKey: cdk.aws_kms.IKey;
  readonly cloudWatchLogKmsKey: cdk.aws_kms.IKey;
  readonly cloudWatchLogRetentionInDays: number;
  readonly tags?: cdk.CfnTag[];
}

export class AutoscalingGroup extends cdk.Resource implements IAutoscalingGroupResource {
  public readonly autoscalingGroupName: string;

  constructor(scope: Construct, id: string, props: AutoscalingGroupProps) {
    super(scope, id);

    // Ensure there is service linked role for autoscaling
    new ServiceLinkedRole(this, 'AutoScalingServiceLinkedRole', {
      environmentEncryptionKmsKey: props.lambdaKey,
      cloudWatchLogKmsKey: props.cloudWatchLogKmsKey,
      cloudWatchLogRetentionInDays: props.cloudWatchLogRetentionInDays,
      awsServiceName: 'autoscaling.amazonaws.com',
      description:
        'Default Service-Linked Role enables access to AWS Services and Resources used or managed by Auto Scaling',
      roleName: 'AWSServiceRoleForAutoScaling',
    });

    const resource = new cdk.aws_autoscaling.CfnAutoScalingGroup(this, 'Resource', {
      minSize: props.minSize.toString(),
      maxSize: props.maxSize.toString(),
      desiredCapacity: props.desiredSize.toString(),
      launchTemplate: {
        version: props.launchTemplateVersion,
        launchTemplateId: props.launchTemplateId,
      },
      healthCheckType: props.healthCheckType!,
      healthCheckGracePeriod: props.healthCheckGracePeriod,
      targetGroupArns: props.targetGroups,
      vpcZoneIdentifier: props.subnets,
      tags: props.tags ? this.processTags(props.tags) : undefined,
      // autoScalingGroupName: props.name,
    });
    this.autoscalingGroupName = resource.ref;
  }

  private processTags(tags: cdk.CfnTag[]): cdk.aws_autoscaling.CfnAutoScalingGroup.TagPropertyProperty[] {
    return tags.map(tag => {
      return {
        key: tag.key,
        value: tag.value,
        propagateAtLaunch: true,
      };
    });
  }
}

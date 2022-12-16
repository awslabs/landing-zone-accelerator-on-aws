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
import { Reference } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ITargetGroupResource extends cdk.IResource {
  /**
   * The ARN of the TargetGroup.
   */
  readonly targetGroupArn: string;
  /**
   * The name of the TargetGroup
   */
  readonly targetGroupName: string;
}

export interface TargetGroupProps {
  /**
   * Name of the target group.
   */
  readonly name: string;
  /**
   * port of the target group.
   */
  readonly port: number;
  /**
   * protocol of the target group.
   */
  readonly protocol: string;
  /**
   * protocolVersion of the target group.
   */
  readonly protocolVersion?: string;
  /**
   * Type of the target group.
   */
  readonly type: string;
  /**
   * Target group VPC ID (required).
   */
  readonly vpc: string;
  /**
   * Target group Attributes (optional).
   */
  readonly attributes?: TargetGroupAttributesType;
  /**
   * Target group Attributes (optional).
   */
  readonly healthCheck?: TargetGroupHealthCheckType;
  /**
   * Targets for the target group
   */
  readonly targets?: string[] | Reference;
  /**
   * Target group Attributes (optional).
   */
  readonly threshold?: TargetGroupThresholdType;
  /**
   * Target group Attributes (optional).
   */
  readonly matcher?: TargetGroupMatcherType;
}

export type TargetGroupAttributesType = {
  deregistrationDelay?: number;
  stickiness?: boolean;
  stickinessType?: string;
  algorithm?: string;
  slowStart?: number;
  appCookieName?: string;
  appCookieDuration?: number;
  lbCookieDuration?: number;
  connectionTermination?: boolean;
  preserveClientIp?: boolean;
  proxyProtocolV2?: boolean;
  targetFailover?: string;
};
export type TargetGroupHealthCheckType = {
  enabled?: boolean;
  interval?: number;
  path?: string;
  port?: number;
  protocol?: string;
  timeout?: number;
};
export type TargetGroupThresholdType = {
  healthy?: number;
  unhealthy?: number;
};
export type TargetGroupMatcherType = {
  grpcCode?: string;
  httpCode?: string;
};

export class TargetGroup extends cdk.Resource implements ITargetGroupResource {
  public readonly targetGroupArn: string;
  public readonly targetGroupName: string;
  constructor(scope: Construct, id: string, props: TargetGroupProps) {
    super(scope, id);

    const resource = new cdk.aws_elasticloadbalancingv2.CfnTargetGroup(this, 'Resource', {
      healthCheckEnabled: true,
      healthCheckIntervalSeconds: props.healthCheck ? props.healthCheck.interval : undefined,
      healthCheckPath: props.healthCheck ? props.healthCheck.path : undefined,
      healthCheckPort: props.healthCheck ? props.healthCheck.port?.toString() : undefined,
      healthCheckProtocol: props.healthCheck ? props.healthCheck.protocol : undefined,
      healthCheckTimeoutSeconds: props.healthCheck ? props.healthCheck.timeout : undefined,
      healthyThresholdCount: props.threshold ? props.threshold.healthy : undefined,
      matcher: {
        grpcCode: props.matcher ? props.matcher.grpcCode : undefined,
        httpCode: props.matcher ? props.matcher.httpCode : undefined,
      },
      name: props.name,
      port: props.port,
      protocol: props.protocol,
      protocolVersion: props.protocolVersion ?? undefined,
      targetGroupAttributes: this.buildAttributes(props) ?? undefined,
      targets: props.targets ? this.buildTargets(props.targets) : undefined,
      targetType: props.type,
      unhealthyThresholdCount: props.threshold ? props.threshold.healthy : undefined,
      vpcId: props.vpc,
    });
    // Add Name tag
    cdk.Tags.of(this).add('Name', props.name);

    // Set initial properties
    this.targetGroupArn = resource.ref;
    this.targetGroupName = resource.attrTargetGroupName;
  }

  private buildAttributes(props: TargetGroupProps) {
    // add elements to the array.
    // based on https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-elasticloadbalancingv2-targetgroup-targetgroupattribute.html
    if (props.attributes) {
      const targetGroupAttributesProperties = [];

      if (props.attributes.deregistrationDelay) {
        targetGroupAttributesProperties.push({
          key: 'deregistration_delay.timeout_seconds',
          value: props.attributes.deregistrationDelay.toString(),
        });
      }
      if (props.attributes.stickiness) {
        targetGroupAttributesProperties.push({
          key: 'stickiness.enabled',
          value: props.attributes.stickiness.toString(),
        });
      }
      if (props.attributes.stickinessType) {
        targetGroupAttributesProperties.push({
          key: 'stickiness.type',
          value: props.attributes.stickinessType,
        });
      }
      if (props.attributes.algorithm) {
        targetGroupAttributesProperties.push({
          key: 'load_balancing.algorithm.type',
          value: props.attributes.algorithm,
        });
      }
      if (props.attributes.slowStart) {
        targetGroupAttributesProperties.push({
          key: 'slow_start.duration_seconds',
          value: props.attributes.slowStart.toString(),
        });
      }
      if (props.attributes.appCookieName) {
        targetGroupAttributesProperties.push({
          key: 'stickiness.app_cookie.cookie_name',
          value: props.attributes.appCookieName,
        });
      }
      if (props.attributes.appCookieDuration) {
        targetGroupAttributesProperties.push({
          key: 'stickiness.app_cookie.duration_seconds',
          value: props.attributes.appCookieDuration.toString(),
        });
      }
      if (props.attributes.lbCookieDuration) {
        targetGroupAttributesProperties.push({
          key: 'stickiness.lb_cookie.duration_seconds',
          value: props.attributes.lbCookieDuration.toString(),
        });
      }
      if (props.attributes.connectionTermination) {
        targetGroupAttributesProperties.push({
          key: 'deregistration_delay.connection_termination.enabled',
          value: props.attributes.connectionTermination.toString(),
        });
      }
      if (props.attributes.preserveClientIp) {
        targetGroupAttributesProperties.push({
          key: 'preserve_client_ip.enabled',
          value: props.attributes.preserveClientIp.toString(),
        });
      }
      if (props.attributes.proxyProtocolV2) {
        targetGroupAttributesProperties.push({
          key: 'proxy_protocol_v2.enabled',
          value: props.attributes.proxyProtocolV2.toString(),
        });
      }
      if (props.attributes.targetFailover) {
        targetGroupAttributesProperties.push({
          key: 'target_failover.on_deregistration',
          value: props.attributes.targetFailover,
        });
        targetGroupAttributesProperties.push({
          key: 'target_failover.on_unhealthy',
          value: props.attributes.targetFailover,
        });
      }

      if (targetGroupAttributesProperties.length > 0) {
        return targetGroupAttributesProperties;
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  private buildTargets(
    targets: string[] | Reference,
  ): cdk.aws_elasticloadbalancingv2.CfnTargetGroup.TargetDescriptionProperty[] | Reference {
    if (targets instanceof Reference) {
      return targets;
    }
    return targets.map(target => {
      return { id: target };
    });
  }
}

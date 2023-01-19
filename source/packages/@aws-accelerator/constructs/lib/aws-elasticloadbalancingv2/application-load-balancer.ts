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
import { pascalCase } from 'change-case';
import { ApplicationLoadBalancerListenerConfig } from '@aws-accelerator/config';

export interface IApplicationLoadBalancerResource extends cdk.IResource {
  /**
   * The ARN of the ApplicationLoadBalancer.
   */
  readonly applicationLoadBalancerArn: string;
  /**
   * The name of the ApplicationLoadBalancer
   */
  readonly applicationLoadBalancerName: string;
}

export type albAttributesType = {
  deletionProtection?: boolean;
  idleTimeout?: number;
  routingHttpDesyncMitigationMode?: string;
  routingHttpDropInvalidHeader?: boolean;
  routingHttpXAmznTlsCipherEnable?: boolean;
  routingHttpXffClientPort?: boolean;
  routingHttpXffHeaderProcessingMode?: 'append' | 'preserve' | 'remove';
  http2Enabled?: boolean;
  wafFailOpen?: boolean;
};

export type albForwardTargetGroup = {
  targetGroupArn: string;
};

export type albListenerActionProperty = {
  type: string;
  fixedResponseConfig?: {
    statusCode: string;

    // the properties below are optional
    contentType?: string;
    messageBody?: string;
  };
  forwardConfig?: {
    targetGroups: albForwardTargetGroup[];
    targetGroupStickinessConfig?: {
      durationSeconds?: number;
      enabled?: boolean;
    };
  };
  order?: number;
  redirectConfig?: {
    statusCode?: string;

    // the properties below are optional
    host?: string;
    path?: string;
    port?: string;
    protocol?: string;
    query?: string;
  };
  targetGroupArn: string;
};

export interface ApplicationLoadBalancerProps {
  /**
   * Name for Application Load Balancer.
   */
  readonly name: string;
  /**
   * Application Load Balancer Subnets (required).
   */
  readonly subnets: string[];
  /**
   * Application Load Balancer SecurityGroups (required).
   */
  readonly securityGroups?: string[];
  /**
   * Application Load Balancer scheme.
   */
  readonly scheme?: string;
  /**
   * Application Load Balancer attributes.
   */
  readonly attributes?: albAttributesType;
  /**
   * Listeners for Application Load Balancer.
   */
  readonly listeners?: ApplicationLoadBalancerListenerConfig[];

  /**
   * Access logs s3 bucket name.
   */
  readonly accessLogsBucket: string;
}

export class ApplicationLoadBalancer extends cdk.Resource implements IApplicationLoadBalancerResource {
  public readonly applicationLoadBalancerArn: string;
  public readonly applicationLoadBalancerName: string;
  constructor(scope: Construct, id: string, props: ApplicationLoadBalancerProps) {
    super(scope, id);
    const resource = new cdk.aws_elasticloadbalancingv2.CfnLoadBalancer(this, 'Resource', {
      type: 'application',
      subnets: props.subnets,
      name: props.name,
      scheme: props.scheme,
      securityGroups: props.securityGroups,
      loadBalancerAttributes: this.buildAttributes(props),
    });

    // Add Name tag
    cdk.Tags.of(this).add('Name', props.name);

    // Set initial properties
    this.applicationLoadBalancerArn = resource.ref;
    this.applicationLoadBalancerName = resource.attrLoadBalancerName;

    for (const listener of props.listeners ?? []) {
      const listenerAction: cdk.aws_elasticloadbalancingv2.CfnListener.ActionProperty =
        this.getListenerAction(listener);
      new cdk.aws_elasticloadbalancingv2.CfnListener(this, pascalCase(`Listener${listener.name}`), {
        defaultActions: [listenerAction],
        loadBalancerArn: resource.ref,
        certificates: [{ certificateArn: this.getCertificate(listener.certificate) }],
        port: listener.port,
        protocol: listener.protocol,
        sslPolicy: listener.sslPolicy!,
      });
    }
  }
  private getCertificate(certificate: string | undefined) {
    if (certificate) {
      //check if user provided arn. If so do nothing, if not get it from ssm
      if (certificate.match('\\arn:*')) {
        return certificate;
      } else {
        return cdk.aws_ssm.StringParameter.valueForStringParameter(this, `/accelerator/acm/${certificate}/arn`);
      }
    }
    return undefined;
  }
  private getListenerAction(
    listener: ApplicationLoadBalancerListenerConfig,
  ): cdk.aws_elasticloadbalancingv2.CfnListener.ActionProperty {
    const listenerTargetGroupArn = listener.targetGroup;
    const actionValues: albListenerActionProperty = {
      type: listener.type,
      order: listener.order,
      targetGroupArn: listenerTargetGroupArn,
    };
    if (listener.type === 'forward') {
      actionValues.forwardConfig = {
        targetGroups: [{ targetGroupArn: listener.targetGroup }],
        targetGroupStickinessConfig: listener.forwardConfig?.targetGroupStickinessConfig ?? undefined,
      };
    } else if (listener.type === 'redirect') {
      if (listener.redirectConfig) {
        actionValues.redirectConfig = {
          host: listener.redirectConfig.host ?? undefined,
          path: listener.redirectConfig.path ?? undefined,
          port: listener.redirectConfig.port?.toString() ?? undefined,
          protocol: listener.redirectConfig.protocol ?? undefined,
          query: listener.redirectConfig.query ?? undefined,
          statusCode: listener.redirectConfig.statusCode ?? undefined,
        };
      } else {
        throw new Error(`Listener ${listener.name} is set to redirect but redirectConfig is not defined`);
      }
    } else if (listener.type === 'fixed-response') {
      if (listener.fixedResponseConfig) {
        actionValues.fixedResponseConfig = {
          contentType: listener.fixedResponseConfig.contentType ?? undefined,
          messageBody: listener.fixedResponseConfig.messageBody ?? undefined,
          statusCode: listener.fixedResponseConfig.statusCode ?? undefined,
        };
      } else {
        throw new Error(`Listener ${listener.name} is set to fixed-response but fixedResponseConfig is not defined`);
      }
    } else {
      throw new Error(`Listener ${listener.name} is not set to forward, fixed-response or redirect`);
    }

    return actionValues as cdk.aws_elasticloadbalancingv2.CfnListener.ActionProperty;
  }

  private buildAttributes(props: ApplicationLoadBalancerProps) {
    // add elements to the array.
    // based on https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-elasticloadbalancingv2-loadbalancer-loadbalancerattributes.html
    const albAttributesProperties = [
      {
        key: 'access_logs.s3.enabled',
        value: 'true',
      },
      {
        key: 'access_logs.s3.bucket',
        value: props.accessLogsBucket,
      },
      {
        key: 'access_logs.s3.prefix',
        value: `${cdk.Stack.of(this).account}/${cdk.Stack.of(this).region}/${props.name}`,
      },
    ];
    if (props.attributes) {
      if (props.attributes.deletionProtection) {
        albAttributesProperties.push({
          key: 'deletion_protection.enabled',
          value: props.attributes.deletionProtection.toString(),
        });
      }
      if (props.attributes.idleTimeout) {
        albAttributesProperties.push({
          key: 'idle_timeout.timeout_seconds',
          value: props.attributes.idleTimeout.toString(),
        });
      }
      if (props.attributes.routingHttpDesyncMitigationMode) {
        albAttributesProperties.push({
          key: 'routing.http.desync_mitigation_mode',
          value: props.attributes.routingHttpDesyncMitigationMode,
        });
      }
      if (props.attributes.routingHttpDropInvalidHeader) {
        albAttributesProperties.push({
          key: 'routing.http.drop_invalid_header_fields.enabled',
          value: props.attributes.routingHttpDropInvalidHeader.toString(),
        });
      }
      if (props.attributes.routingHttpXAmznTlsCipherEnable) {
        albAttributesProperties.push({
          key: 'routing.http.x_amzn_tls_version_and_cipher_suite.enabled',
          value: props.attributes.routingHttpXAmznTlsCipherEnable.toString(),
        });
      }
      if (props.attributes.routingHttpXffClientPort) {
        albAttributesProperties.push({
          key: 'routing.http.xff_client_port.enabled',
          value: props.attributes.routingHttpXffClientPort.toString(),
        });
      }
      if (props.attributes.routingHttpXffHeaderProcessingMode) {
        albAttributesProperties.push({
          key: 'routing.http.xff_header_processing.mode',
          value: props.attributes.routingHttpXffHeaderProcessingMode,
        });
      }
      if (props.attributes.http2Enabled) {
        albAttributesProperties.push({
          key: 'routing.http2.enabled',
          value: props.attributes.http2Enabled.toString(),
        });
      }
      if (props.attributes.wafFailOpen) {
        albAttributesProperties.push({
          key: 'waf.fail_open.enabled',
          value: props.attributes.wafFailOpen.toString(),
        });
      }
    }
    return albAttributesProperties;
  }
}

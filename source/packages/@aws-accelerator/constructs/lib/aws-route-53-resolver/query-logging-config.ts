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
import * as path from 'path';

export interface IQueryLoggingConfig extends cdk.IResource {
  /**
   * The Amazon Resource Name (ARN) for the query logging configuration.
   */
  readonly logArn: string;

  /**
   * The ID for the query logging configuration.
   */
  readonly logId: string;

  /**
   * The name that you assigned to the query logging config.
   */
  readonly name: string;
}

export interface QueryLoggingConfigProps {
  /**
   * The resource that you want Resolver to send query logs.
   */
  readonly destination: cdk.aws_s3.IBucket | cdk.aws_logs.LogGroup;

  /**
   * The name of the query logging configuration.
   */
  readonly name: string;

  /**
   * The partition of this stack.
   */
  readonly partition: string;

  /**
   * An AWS Organization ID, if the destination is CloudWatch Logs.
   */
  readonly organizationId?: string;

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class QueryLoggingConfig extends cdk.Resource implements IQueryLoggingConfig {
  public readonly logArn: string;
  public readonly logId: string;
  public readonly name: string;
  private destinationArn: string;
  private logRetentionInDays: number;
  private kmsKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: QueryLoggingConfigProps) {
    super(scope, id);

    this.name = props.name;
    this.logRetentionInDays = props.logRetentionInDays;
    this.kmsKey = props.kmsKey;

    if (props.destination instanceof cdk.aws_logs.LogGroup) {
      if (props.partition !== 'aws-cn' && !props.organizationId) {
        throw new Error('organizationId property must be defined when specifying a CloudWatch log group destination');
      }
      this.destinationArn = props.destination.logGroupArn;
    } else if ('bucketName' in props.destination) {
      this.destinationArn = props.destination.bucketArn;
    } else {
      throw new Error('Invalid resource type specified for destination property');
    }

    if (props.partition === 'aws-cn') {
      const customQueryLoggingConfigResource = this.queryLoggingConfig();
      if (props.destination instanceof cdk.aws_logs.LogGroup) {
        const customLogResourcePoliyResource = this.logResourcePolicy(props.destination);
        customLogResourcePoliyResource.node.addDependency(customQueryLoggingConfigResource);
      }
      this.logArn = customQueryLoggingConfigResource.getAtt('attrArn').toString();
      this.logId = customQueryLoggingConfigResource.getAtt('attrId').toString();
    } else {
      if (props.destination instanceof cdk.aws_logs.LogGroup) {
        this.addPermissions(props.destination, props.organizationId!);
      }
      const resource = new cdk.aws_route53resolver.CfnResolverQueryLoggingConfig(this, 'Resource', {
        destinationArn: this.destinationArn,
      });
      this.logArn = resource.attrArn;
      this.logId = resource.attrId;
    }
  }

  private addPermissions(logGroup: cdk.aws_logs.LogGroup, orgId: string) {
    logGroup.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow log delivery access',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`${logGroup.logGroupArn}:log-stream:*`],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgId': orgId,
          },
        },
      }),
    );
  }

  private logResourcePolicy(logGroupDest: cdk.aws_logs.LogGroup) {
    // Use custom resource
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::LogResourcePolicy', {
      codeDirectory: path.join(__dirname, 'log-resource-policy/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['logs:PutResourcePolicy', 'logs:DeleteResourcePolicy'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'LogResourcePolicy', {
      resourceType: 'Custom::LogResourcePolicy',
      serviceToken: provider.serviceToken,
      properties: {
        policyName: 'AllowLogDeliveryAccess',
        policyStatements: [
          {
            Sid: 'Allow log delivery access',
            Effect: cdk.aws_iam.Effect.ALLOW,
            Principal: { Service: 'delivery.logs.amazonaws.com' },
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: [`${logGroupDest.logGroupArn}:log-stream:*`],
          },
        ],
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(this);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: this.logRetentionInDays,
        encryptionKey: this.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
    return resource;
  }

  private queryLoggingConfig() {
    // Use custom resource
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::QueryLoggingConfig', {
      codeDirectory: path.join(__dirname, 'query-logging-config/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'route53resolver:ListResolverQueryLogConfigs',
            'route53resolver:CreateResolverQueryLogConfig',
            'route53resolver:DeleteResolverQueryLogConfig',
            'logs:*',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: '*',
          Condition: {
            'ForAnyValue:StringEquals': {
              'iam:AWSServiceName': ['route53resolver.amazonaws.com'],
            },
          },
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'QueryLoggingConfig', {
      resourceType: 'Custom::QueryLoggingConfig',
      serviceToken: provider.serviceToken,
      properties: {
        DestinationArn: this.destinationArn,
        Name: this.name,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(this);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: this.logRetentionInDays,
        encryptionKey: this.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
    return resource;
  }
}

export interface QueryLoggingConfigAssociationProps {
  /**
   * The ID of the query logging configuration that a VPC is associated with.
   */
  readonly resolverQueryLogConfigId?: string;

  /**
   * The ID of the Amazon VPC that is associated with the query logging configuration.
   */
  readonly vpcId?: string;

  /**
   * The partition of this stack.
   */
  readonly partition: string;

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class QueryLoggingConfigAssociation extends cdk.Resource {
  private vpcId: string | undefined;
  private resolverQueryLogConfigId: string | undefined;
  private logRetentionInDays: number;
  private kmsKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: QueryLoggingConfigAssociationProps) {
    super(scope, id);
    this.vpcId = props.vpcId;
    this.resolverQueryLogConfigId = props.resolverQueryLogConfigId;
    this.logRetentionInDays = props.logRetentionInDays;
    this.kmsKey = props.kmsKey;

    if (props.partition === 'aws-cn') {
      this.queryLoggingConfigAssociation();
    } else {
      new cdk.aws_route53resolver.CfnResolverQueryLoggingConfigAssociation(this, 'Resource', {
        resolverQueryLogConfigId: this.resolverQueryLogConfigId,
        resourceId: this.vpcId,
      });
    }
  }

  private queryLoggingConfigAssociation(): void {
    // Use custom resource
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::QueryLoggingConfigAssociation', {
      codeDirectory: path.join(__dirname, 'query-logging-config-association/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'route53resolver:DisassociateResolverQueryLogConfig',
            'route53resolver:AssociateResolverQueryLogConfig',
            'route53resolver:ListResolverQueryLogConfigs',
            'route53resolver:GetResolverQueryLogConfig',
            'route53resolver:ListResolverQueryLogConfigAssociations',
            'ec2:DescribeVpcs',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: '*',
          Condition: {
            'ForAnyValue:StringEquals': {
              'iam:AWSServiceName': ['route53resolver.amazonaws.com'],
            },
          },
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'QueryLoggingConfigAssociation', {
      resourceType: 'Custom::QueryLoggingConfigAssociation',
      serviceToken: provider.serviceToken,
      properties: {
        ResolverQueryLogConfigId: this.resolverQueryLogConfigId,
        VpcId: this.vpcId,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(this);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: this.logRetentionInDays,
        encryptionKey: this.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}

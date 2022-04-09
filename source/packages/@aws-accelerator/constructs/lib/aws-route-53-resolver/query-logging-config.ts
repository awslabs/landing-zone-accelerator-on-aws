/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
   * An AWS Organization ID, if the destination is CloudWatch Logs.
   */
  readonly organizationId?: string;
}

export class QueryLoggingConfig extends cdk.Resource implements IQueryLoggingConfig {
  public readonly logArn: string;
  public readonly logId: string;
  public readonly name: string;
  private destinationArn: string;

  constructor(scope: Construct, id: string, props: QueryLoggingConfigProps) {
    super(scope, id);

    this.name = props.name;

    if (props.destination instanceof cdk.aws_logs.LogGroup) {
      if (!props.organizationId) {
        throw new Error('organizationId property must be defined when specifying a CloudWatch log group destination');
      }
      this.addPermissions(props.destination, props.organizationId);
      this.destinationArn = props.destination.logGroupArn;
    } else if ('bucketName' in props.destination) {
      this.destinationArn = props.destination.bucketArn;
    } else {
      throw new Error('Invalid resource type specified for destination property');
    }

    const resource = new cdk.aws_route53resolver.CfnResolverQueryLoggingConfig(this, 'Resource', {
      destinationArn: this.destinationArn,
    });

    this.logArn = resource.attrArn;
    this.logId = resource.attrId;
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
}

export class QueryLoggingConfigAssociation extends cdk.Resource {
  constructor(scope: Construct, id: string, props: QueryLoggingConfigAssociationProps) {
    super(scope, id);

    new cdk.aws_route53resolver.CfnResolverQueryLoggingConfigAssociation(this, 'Resource', {
      resolverQueryLogConfigId: props.resolverQueryLogConfigId,
      resourceId: props.vpcId,
    });
  }
}

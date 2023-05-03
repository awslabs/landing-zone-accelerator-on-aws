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
import { v4 as uuidv4 } from 'uuid';

import { IpamAllocationConfig } from '@aws-accelerator/config';

export interface IIpamSubnet extends cdk.IResource {
  /**
   * The IPv4 CIDR assigned to the subnet
   *
   * @attribute
   */
  readonly ipv4CidrBlock: string;
  /**
   * The resource ID of the subnet
   *
   * @attribute
   */
  readonly subnetId: string;
}

export interface IpamSubnetProps {
  /**
   * The friendly name of the subnet
   */
  readonly name: string;
  /**
   * The availability zone (AZ) of the subnet
   */
  readonly availabilityZone: string;
  /**
   * The base IPAM pool CIDR range the subnet is assigned to
   */
  readonly basePool: string[];
  /**
   * The IPAM allocation configuration
   */
  readonly ipamAllocation: IpamAllocationConfig;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * The VPC ID the subnet will be created in
   */
  readonly vpcId: string;
  /**
   * Auto-create public IP addresses on EC2 instance launch
   */
  readonly mapPublicIpOnLaunch?: boolean;
  /**
   * An array of tags for the subnet
   */
  readonly tags?: cdk.CfnTag[];
  /**
   * The outpost arn for the subnet
   */
  readonly outpostArn?: string;
}

export interface IpamSubnetLookupOptions {
  readonly owningAccountId: string;
  readonly ssmSubnetIdPath: string;
  readonly roleName?: string;
  readonly region?: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class IpamSubnet extends cdk.Resource implements IIpamSubnet {
  public static fromLookup(scope: Construct, id: string, options: IpamSubnetLookupOptions): IIpamSubnet {
    class Import extends cdk.Resource implements IIpamSubnet {
      public readonly subnetId: string = options.ssmSubnetIdPath;
      public readonly ipv4CidrBlock: string;

      constructor(scope: Construct, id: string) {
        super(scope, id);

        const GET_IPAM_SUBNET_CIDR = 'Custom::GetIpamSubnetCidr';

        const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, GET_IPAM_SUBNET_CIDR, {
          codeDirectory: path.join(__dirname, 'get-ipam-subnet-cidr/dist'),
          runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
          policyStatements: [
            {
              Effect: 'Allow',
              Action: ['sts:AssumeRole'],
              Resource: '*',
            },
            {
              Effect: 'Allow',
              Action: ['ec2:DescribeSubnets', 'ssm:GetParameter'],
              Resource: '*',
            },
          ],
        });

        // Construct role arn if this is a cross-account lookup
        let roleArn: string | undefined = undefined;
        if (options.roleName) {
          roleArn = cdk.Stack.of(this).formatArn({
            service: 'iam',
            region: '',
            account: options.owningAccountId,
            resource: 'role',
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: options.roleName,
          });
        }
        const resource = new cdk.CustomResource(this, 'Resource', {
          resourceType: GET_IPAM_SUBNET_CIDR,
          serviceToken: provider.serviceToken,
          properties: {
            ssmSubnetIdPath: options.ssmSubnetIdPath,
            region: options.region,
            roleArn,
            uuid: uuidv4(), // Generates a new UUID to force the resource to update
          },
        });

        const stack = cdk.Stack.of(scope);
        const logGroup =
          (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
          new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
            logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
            retention: options.logRetentionInDays,
            encryptionKey: options.kmsKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        resource.node.addDependency(logGroup);

        this.ipv4CidrBlock = resource.getAttString('ipv4CidrBlock');
      }
    }
    return new Import(scope, id);
  }

  public readonly ipv4CidrBlock: string;
  public readonly subnetId: string;
  private tags: { Key: string; Value: string }[] = [];

  constructor(scope: Construct, id: string, props: IpamSubnetProps) {
    super(scope, id);

    const IPAM_SUBNET = 'Custom::IpamSubnet';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, IPAM_SUBNET, {
      codeDirectory: path.join(__dirname, 'ipam-subnet/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:CreateTags', 'ec2:DeleteSubnet', 'ec2:ModifySubnetAttribute'],
          Resource: `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:subnet/*`,
        },
        {
          Effect: 'Allow',
          Action: ['ec2:CreateSubnet'],
          Resource: [
            `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:subnet/*`,
            `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:vpc/*`,
          ],
        },
        {
          Effect: 'Allow',
          Action: ['ec2:DescribeVpcs', 'ec2:DescribeSubnets'],
          Resource: '*',
        },
      ],
    });

    // Convert tag object to expected keys
    if (props.tags) {
      this.tags = props.tags.map(tag => {
        return {
          Key: tag.key,
          Value: tag.value,
        };
      });
    }

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: IPAM_SUBNET,
      serviceToken: provider.serviceToken,
      properties: {
        name: props.name,
        availabilityZone: props.availabilityZone,
        basePool: props.basePool,
        ipamAllocation: props.ipamAllocation,
        vpcId: props.vpcId,
        mapPublicIpOnLaunch: props.mapPublicIpOnLaunch,
        tags: this.tags ?? [],
        outpostArn: props.outpostArn,
      },
    });

    this.ipv4CidrBlock = resource.getAttString('ipv4CidrBlock');
    this.subnetId = resource.ref;

    /**
     * Single pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}

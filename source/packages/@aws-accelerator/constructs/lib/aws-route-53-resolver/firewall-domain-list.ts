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

export interface IResolverFirewallDomainList extends cdk.IResource {
  /**
   * The ID of the domain list.
   */
  readonly listId: string;

  /**
   * The name of the domain list.
   */
  readonly name: string;

  /**
   * The Amazon Resource Name (ARN) of the firewall domain list.
   */
  readonly listArn?: string;
}

export enum ResolverFirewallDomainListType {
  CUSTOM = 'CUSTOM',
  MANAGED = 'MANAGED',
}

export interface ResolverFirewallDomainListProps {
  /**
   * The name of the domain list.
   */
  readonly name: string;

  /**
   * The type of the domain list.
   */
  readonly type: ResolverFirewallDomainListType;

  /**
   * Path to a file containing a domain list.
   */
  readonly path?: string;

  /**
   * A list of CloudFormation tags
   */
  readonly tags?: cdk.CfnTag[];

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class ResolverFirewallDomainList extends cdk.Resource implements IResolverFirewallDomainList {
  public readonly listId: string;
  public readonly name: string;
  public readonly listArn?: string;
  private assetUrl?: string;

  constructor(scope: Construct, id: string, props: ResolverFirewallDomainListProps) {
    super(scope, id);

    this.name = props.name;

    if (props.type === ResolverFirewallDomainListType.CUSTOM) {
      // Check if path was provided
      if (!props.path) {
        throw new Error('path property must be specified when creating domain list of type CUSTOM');
      }
      this.assetUrl = this.getAssetUrl(props.path);

      props.tags?.push({ key: 'Name', value: this.name });

      // Create custom domain list with uploaded asset file
      const resource = new cdk.aws_route53resolver.CfnFirewallDomainList(this, 'Resource', {
        domainFileUrl: this.assetUrl,
        tags: props.tags,
      });

      this.listArn = resource.attrArn;
      this.listId = resource.attrId;
    } else {
      // Create custom resource provider
      const RESOURCE_TYPE = 'Custom::ResolverManagedDomainList';

      const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
        codeDirectory: path.join(__dirname, 'get-domain-lists/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['route53resolver:ListFirewallDomainLists'],
            Resource: '*',
          },
        ],
      });

      // Get managed domain list ID
      const resource = new cdk.CustomResource(this, 'Resource', {
        resourceType: RESOURCE_TYPE,
        serviceToken: provider.serviceToken,
        properties: {
          listName: props.name,
          region: cdk.Stack.of(this).region,
        },
      });

      /**
       * Singleton pattern to define the log group for the singleton function
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

      this.listId = resource.ref;
    }
  }

  private getAssetUrl(assetUrlPath: string): string {
    const asset = new cdk.aws_s3_assets.Asset(this, 'Asset', {
      path: assetUrlPath,
    });
    return asset.s3ObjectUrl;
  }
}

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
import * as assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export enum PolicyType {
  AISERVICES_OPT_OUT_POLICY = 'AISERVICES_OPT_OUT_POLICY',
  BACKUP_POLICY = 'BACKUP_POLICY',
  SERVICE_CONTROL_POLICY = 'SERVICE_CONTROL_POLICY',
  TAG_POLICY = 'TAG_POLICY',
}

export interface Tag {
  /**
   * The key identifier, or name, of the tag.
   */
  Key: string | undefined;

  /**
   * The string value that's associated with the key of the tag. You can set the value of a
   * tag to an empty string, but you can't set the value of a tag to null.
   */
  Value: string | undefined;
}

/**
 * Initialized Policy properties
 */
export interface PolicyProps {
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * The friendly name of the policy
   */
  readonly name: string;
  /**
   * The AWS partition the policy will be created in
   */
  readonly partition: string;
  /**
   * The path of the file for the policy
   */
  readonly path: string;
  /**
   * The type of policy to create
   */
  readonly type: PolicyType;
  /**
   * The SCP strategy - "allow-list" or "deny-list"The type of policy to create
   */
  readonly strategy?: string;
  /**
   * Accelerator prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * An optional description of the policy
   */
  readonly description?: string;
  /**
   * An optional list of tags for the policy
   */
  readonly tags?: Tag[];
}

/**
 * Class to initialize Policy
 */
export class Policy extends Construct {
  public readonly id: string;
  public readonly path: string;
  public readonly name: string;
  public readonly description?: string;
  public readonly type: PolicyType;
  public readonly strategy?: string;
  public readonly tags?: Tag[];

  constructor(scope: Construct, id: string, props: PolicyProps) {
    super(scope, id);

    this.path = props.path;
    this.name = props.name;
    this.description = props.description || '';
    this.type = props.type;
    this.strategy = props.strategy;
    this.tags = props.tags || [];

    //
    // Bundle the policy file. This will be available as an asset in S3
    //
    const asset = new assets.Asset(this, 'Policy', {
      path: props.path,
    });

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::OrganizationsCreatePolicy', {
      codeDirectory: path.join(__dirname, 'create-policy/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      description: 'Organizations create policy',
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:CreatePolicy',
            'organizations:DeletePolicy',
            'organizations:DetachPolicy',
            'organizations:ListPolicies',
            'organizations:ListTargetsForPolicy',
            'organizations:UpdatePolicy',
            'organizations:TagResource',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: cdk.Stack.of(this).formatArn({
            service: 's3',
            region: '',
            account: '',
            resource: asset.s3BucketName,
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: '*',
          }),
        },
      ],
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::CreatePolicy',
      serviceToken: provider.serviceToken,
      properties: {
        bucket: asset.s3BucketName,
        key: asset.s3ObjectKey,
        partition: props.partition,
        policyTagKey: `${props.acceleratorPrefix}Managed`,
        uuid: uuidv4(),
        name: props.name,
        description: props.description,
        type: props.type,
        strategy: props.strategy,
        tags: props.tags,
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

    this.id = resource.ref;
  }
}

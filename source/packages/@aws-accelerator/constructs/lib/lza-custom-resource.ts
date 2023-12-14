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
import { NagSuppressions } from 'cdk-nag';
import { v4 as uuidv4 } from 'uuid';
import { pascalCase } from 'change-case';
import { LzaLambda } from './lza-lambda';

/**
 * Initialized LzaCustomResourceProps properties
 */
export interface LzaCustomResourceProps {
  /**
   * Custom resource properties
   */
  readonly resource: {
    /**
     * Logical name for the custom resource
     */
    readonly name: string;
    /**
     * Logical Id for the implementor construct
     */
    readonly parentId: string;
    /**
     * A name value object list for custom resource properties
     *
     * @example
     * [{ solution: 'accelerator', author: 'tsd' }]
     */
    readonly properties?: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }[];
    /**
     * Generates a new UUID to force the resource to update
     */
    readonly forceUpdate?: boolean;
    /**
     * The AWS Lambda function to invoke for all resource lifecycle operations (CREATE/UPDATE/DELETE).
     *
     * @default
     * undefined.
     *
     * @remarks
     * This function is responsible to begin the requested resource operation (CREATE/UPDATE/DELETE).
     * When no value provided construct will create lambda function for the custom resource.
     */
    readonly onEventHandler?: cdk.aws_lambda.IFunction;
    /**
     * Debug flag used in custom resource lambda function to output debug logs
    @default false    
     */
    readonly debug?: boolean;
  };

  /**
   * Custom resource lambda properties
   */
  readonly lambda?: {
    /**
     * LZA Custom resource lambda asset folder path including the /dist folder
     */
    readonly assetPath: string;
    /**
     * Custom resource lambda environment encryption key, when undefined default AWS managed key will be used
     */
    readonly environmentEncryptionKmsKey?: cdk.aws_kms.IKey;
    /**
     * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
     */
    readonly cloudWatchLogKmsKey?: cdk.aws_kms.IKey;
    /**
     * Custom resource lambda cloudwatch log retention in days
     */
    readonly cloudWatchLogRetentionInDays: number;
    /**
     * A description of the custom resource lambda function.
     */
    readonly description?: string;
    /**
     * Custom resource lambda execution role. This is the role that will be assumed by the function upon execution.
     * @default
     * A unique role will be generated for this lambda function.
     */
    readonly role?: cdk.aws_iam.Role | cdk.aws_iam.IRole;
    /**
     * The amount of memory, in MB, that is allocated to custom resource Lambda function. Lambda uses this value to proportionally allocate the amount of CPU power.
     * @default 256
     */
    readonly memorySize?: number;
    /**
     * Custom resource lambda function execution time (in seconds) after which Lambda terminates the function.
     * @default 3 seconds
     */
    readonly timeOut?: cdk.Duration;
    /**
     * Initial policy statements to add to the created custom resource Lambda Role.
     */
    readonly roleInitialPolicy?: cdk.aws_iam.PolicyStatement[];
    /**
     * The name of the method within lambda code that custom resource lambda calls to execute the function. The format includes the file name.
     * @default 'index.handler'
     */
    readonly handler?: string;
    /**
     * Determine the removal policy of CloudWatch log group for the lambda.
    @default RemovalPolicy.Destroy
     */
    readonly cloudWatchLogRemovalPolicy?: cdk.RemovalPolicy;
    /**
     * A name value object list for lambda environment variables
     *
     * @example
     * [{ solution: 'accelerator', author: 'tsd' }]
     */
    readonly environmentVariables?: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }[];
  };
  /**
   * Prefix for nag suppression
   */
  readonly nagSuppressionPrefix?: string;
}

export type CloudFormationCustomResourceEvent =
  | CloudFormationCustomResourceCreateEvent
  | CloudFormationCustomResourceUpdateEvent
  | CloudFormationCustomResourceDeleteEvent;

export type CloudFormationCustomResourceResponse =
  | CloudFormationCustomResourceSuccessResponse
  | CloudFormationCustomResourceFailedResponse;

/**
 * CloudFormation Custom Resource event and response
 * http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref.html
 */
export interface CloudFormationCustomResourceEventCommon {
  ServiceToken: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  ResourceType: string;
  ResourceProperties: {
    ServiceToken: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Key: string]: any;
  };
}

export interface CloudFormationCustomResourceCreateEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Create';
}

export interface CloudFormationCustomResourceUpdateEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Update';
  PhysicalResourceId: string;
  OldResourceProperties: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Key: string]: any;
  };
}

export interface CloudFormationCustomResourceDeleteEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Delete';
  PhysicalResourceId: string;
}

export interface CloudFormationCustomResourceResponseCommon {
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Data?:
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [Key: string]: any;
      }
    | undefined;
  NoEcho?: boolean | undefined;
}

export interface CloudFormationCustomResourceSuccessResponse extends CloudFormationCustomResourceResponseCommon {
  Status: 'SUCCESS';
  Reason?: string | undefined;
}

export interface CloudFormationCustomResourceFailedResponse extends CloudFormationCustomResourceResponseCommon {
  Status: 'FAILED';
  Reason: string;
}

/**
 * Class for LZA Custom Resource Construct
 * This class can create LZA standard custom resource constructs
 */
export class LzaCustomResource extends Construct {
  public readonly resource: cdk.CustomResource;

  private readonly provider: cdk.custom_resources.Provider;

  constructor(scope: Construct, id: string, props: LzaCustomResourceProps) {
    super(scope, id);

    if (props.resource.onEventHandler && props.lambda) {
      throw new Error(
        `Custom resource onEventHandler lambda function or construct lambda property can be provided, both can't be provided.`,
      );
    }

    if (!props.resource.onEventHandler && !props.lambda) {
      throw new Error(
        `Either custom resource onEventHandler lambda function or construct lambda property must be provided, both can't be undefined.`,
      );
    }

    let providerLambdaFunction = props.resource.onEventHandler;
    const nagSuppressionPrefix = props.nagSuppressionPrefix
      ? `${props.nagSuppressionPrefix}/${props.resource.name}`
      : `${props.resource.parentId}/${props.resource.name}`;

    if (props.lambda) {
      const lzaLambda = new LzaLambda(this, 'Function', {
        assetPath: props.lambda.assetPath,
        environmentEncryptionKmsKey: props.lambda.environmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.lambda.cloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.lambda.cloudWatchLogRetentionInDays,
        description:
          props.lambda.description ?? `Accelerator deployed ${props.resource.name} custom resource lambda function.`,
        role: props.lambda.role,
        memorySize: props.lambda.memorySize,
        timeOut: props.lambda.timeOut,
        roleInitialPolicy: props.lambda.roleInitialPolicy,
        handler: props.lambda.handler,
        cloudWatchLogRemovalPolicy: props.lambda.cloudWatchLogRemovalPolicy,
        environmentVariables: props.lambda.environmentVariables,
        nagSuppressionPrefix,
      });

      providerLambdaFunction = lzaLambda.resource;
    }

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambdaFunction!,
    });

    this.resource = new cdk.CustomResource(this, pascalCase(props.resource.name + 'Resource'), {
      serviceToken: this.provider.serviceToken,
      properties: this.prepareResourceProperties(props),
    });

    this.addSuppression(scope, props);
  }

  /**
   * Function to add NagSuppressions
   * @param scope {@link Construct}
   * @param nagSuppressionPrefix {@link LzaCustomResourceProps}
   */
  private addSuppression(scope: Construct, props: LzaCustomResourceProps) {
    const stack = cdk.Stack.of(scope);

    let prefix: string | undefined;

    if (props.nagSuppressionPrefix) {
      prefix = `${stack.stackName}/${props.nagSuppressionPrefix}/${props.resource.name}/Resource`;
    } else {
      prefix = `${stack.stackName}/${props.resource.parentId}/${props.resource.name}/Resource`;
    }

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(stack, `${prefix}/framework-onEvent/ServiceRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${prefix}/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
  }

  /**
   * Function to prepare Resource Properties
   * @param props {@link LzaCustomResourceProps}
   * @returns
   */
  private prepareResourceProperties(props: LzaCustomResourceProps):
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }
    | undefined {
    const resourcePropertyList:
      | {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        }[] = props.resource.properties ?? [{ debug: props.resource.debug ?? false }];

    if (props.resource.forceUpdate) {
      resourcePropertyList.push({ uuid: uuidv4() });
    }

    const resourceProperties: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    } = {};

    for (const resourceProperty of resourcePropertyList) {
      for (const [key, value] of Object.entries(resourceProperty)) {
        resourceProperties[key] = value;
      }
    }

    return resourcePropertyList.length > 0 ? resourceProperties : undefined;
  }
}

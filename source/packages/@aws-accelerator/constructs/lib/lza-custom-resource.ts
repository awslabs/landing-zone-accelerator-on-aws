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
  };

  /**
   * Custom resource lambda properties
   */
  readonly lambda: {
    /**
     * LZA Custom resource lambda asset folder path including the /dist folder
     */
    readonly assetPath: string;
    /**
     * Custom resource lambda environment encryption key
     */
    readonly environmentEncryptionKmsKey: cdk.aws_kms.IKey;
    /**
     * Custom resource lambda log group encryption key
     */
    readonly cloudWatchLogKmsKey: cdk.aws_kms.IKey;
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
     * @default - A unique role will be generated for this lambda function.
     */
    readonly role?: cdk.aws_iam.Role;
    /**
     * The amount of memory, in MB, that is allocated to custom resource Lambda function. Lambda uses this value to proportionally allocate the amount of CPU power.
     * @default 256
     */
    readonly memorySize?: number;
    /**
     * Custom resource lambda function execution time (in seconds) after which Lambda terminates the function.
     * @default 3 seconds
     */
    readonly timeOut?: number;
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
     * Debug flag used in custom resource lambda function to output debug logs
    @default false    
     */
    readonly debug?: boolean;
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

    const functionName = pascalCase(props.resource.name + 'Function');

    const providerLambdaFunction = new cdk.aws_lambda.Function(this, functionName, {
      description:
        props.lambda.description ?? `Accelerator deployed ${props.resource.name} custom resource lambda function.`,
      code: cdk.aws_lambda.Code.fromAsset(props.lambda.assetPath),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      memorySize: props.lambda.memorySize ?? 256,
      timeout: props.lambda.timeOut ? cdk.Duration.seconds(props.lambda.timeOut) : cdk.Duration.seconds(160),
      role: props.lambda.role,
      initialPolicy: props.lambda.roleInitialPolicy,
      handler: props.lambda.handler ?? 'index.handler',
      environmentEncryption: props.lambda.environmentEncryptionKmsKey,
      environment: this.prepareLambdaEnvironments(props),
    });

    new cdk.aws_logs.LogGroup(this, `${providerLambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambdaFunction.functionName}`,
      retention: props.lambda.cloudWatchLogRetentionInDays,
      encryptionKey: props.lambda.cloudWatchLogKmsKey,
      removalPolicy: props.lambda.cloudWatchLogRemovalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambdaFunction,
    });

    this.resource = new cdk.CustomResource(this, pascalCase(props.resource.name + 'Resource'), {
      serviceToken: this.provider.serviceToken,
      properties: this.prepareResourceProperties(props),
    });

    const stack = cdk.Stack.of(scope);

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${props.resource.parentId}/${id}/${functionName}/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${props.resource.parentId}/${id}/${functionName}/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${props.resource.parentId}/${id}/Resource/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${props.resource.parentId}/${id}/Resource/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
  }

  /**
   * Function to prepare Lambda Environment variables
   * @param props {@link LzaCustomResourceProps}
   * @returns
   */
  private prepareLambdaEnvironments(props: LzaCustomResourceProps):
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }
    | undefined {
    const lambdaEnvironmentList:
      | {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        }[] = props.lambda.environmentVariables ?? [];

    const lambdaEnvironment: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    } = {};

    for (const environmentVariable of lambdaEnvironmentList) {
      for (const [key, value] of Object.entries(environmentVariable)) {
        lambdaEnvironment[key] = value;
      }
    }

    return lambdaEnvironmentList.length > 0 ? lambdaEnvironment : undefined;

    // return lambdaEnvironment;
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
        }[] = props.resource.properties ?? [{ debug: props.lambda.debug ?? false }];

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

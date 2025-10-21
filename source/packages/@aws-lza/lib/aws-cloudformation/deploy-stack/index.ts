/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import {
  CloudFormationClient,
  DescribeStacksCommand,
  StackStatus,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import { delay, generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { createLogger } from '../../../common/logger';
import { AcceleratorModuleName } from '../../../common/resources';
import { ModuleHandlerReturnType } from '../../../common/types';
import { IDeployStackHandlerParameter, IDeployStackModule } from '../../../interfaces/aws-cloudformation/deploy-stack';

import path from 'path';
import { readFile } from 'fs/promises';
import { isStackExists } from '../../../common/cloudformation-functions';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { uploadFileToS3 } from '../../../common/s3-functions';
import { S3Client } from '@aws-sdk/client-s3';

export class DeployStackModule implements IDeployStackModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  public async handler(props: IDeployStackHandlerParameter): Promise<ModuleHandlerReturnType> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IDeployStackHandlerParameter}
   * @returns {@link ModuleHandlerReturnType}
   */
  private async manageModule(props: IDeployStackHandlerParameter): Promise<ModuleHandlerReturnType> {
    //
    // Get default configuration
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_CLOUDFORMATION, props);
    const stackName = props.configuration.stackName;

    const templateFileContent = await this.readTemplateFile(props.configuration.templatePath);

    const client = new CloudFormationClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const stackExists = await isStackExists(client, stackName);

    if (!stackExists) {
      if (props.dryRun) {
        const dryRunMessage = `Stack not found ${stackName}, accelerator will skip the ${defaultProps.moduleName} module ${props.operation} operation.`;
        return {
          status: true,
          message: generateDryRunResponse(defaultProps.moduleName, props.operation, dryRunMessage),
        };
      }

      const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stack not found ${stackName}, accelerator will skip the ${defaultProps.moduleName} module ${props.operation} operation.`;
      this.logger.error(message);
      return { status: false, message };
    }

    if (props.dryRun) {
      const dryRunMessage = `Stack ${stackName} exists, accelerator will deploy the ${defaultProps.moduleName} module ${props.operation} operation.`;
      return {
        status: true,
        message: generateDryRunResponse(defaultProps.moduleName, props.operation, dryRunMessage),
      };
    }

    this.logger.info(`${stackName} exists initiating stack deployment.`);
    const status = await this.deployStackWithS3Template(client, props, templateFileContent);

    this.logger.info(`${stackName} deployment completed, with status "${status}".`);

    return {
      status: true,
      message: `Module ${defaultProps.moduleName} ${props.operation} operation for ${stackName} stack completed successfully, with status "${status}".`,
    };
  }

  private async readTemplateFile(templatePath: string): Promise<string> {
    const resolvedPath = path.resolve(templatePath);
    try {
      return await readFile(resolvedPath, 'utf8');
    } catch (error) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to read template file ${resolvedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async deployStackWithS3Template(
    client: CloudFormationClient,
    props: IDeployStackHandlerParameter,
    templateFileContent: string,
  ): Promise<string> {
    const now = new Date();
    const timestamp = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = path.basename(props.configuration.templatePath);
    const s3Key = `cr-modified-templates/${props.configuration.stackName}/${timestamp}/${fileName}`;

    const s3Client = new S3Client({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    this.logger.info(`Uploading template to S3 bucket with key ${s3Key}.`);
    await uploadFileToS3(s3Client, props.configuration.s3BucketName, s3Key, templateFileContent);

    this.logger.info(`Uploaded template to S3 bucket ${props.configuration.s3BucketName} with key ${s3Key}.`);

    const s3Url = `https://${props.configuration.s3BucketName}.s3.amazonaws.com/${s3Key}`;

    this.logger.info(`Deploying stack ${props.configuration.stackName}.`);
    return await this.deployStack(client, props, s3Url);
  }

  private async deployStack(
    client: CloudFormationClient,
    props: IDeployStackHandlerParameter,
    s3Url: string,
  ): Promise<string> {
    this.logger.info(`Deploying stack ${props.configuration.stackName}.`);
    try {
      await client.send(
        new UpdateStackCommand({
          StackName: props.configuration.stackName,
          TemplateURL: s3Url,
          Capabilities: ['CAPABILITY_NAMED_IAM'],
        }),
      );
    } catch (error: unknown) {
      const noUpdateMessage = 'No updates are to be performed';
      if (error instanceof Error && error.name === 'ValidationError' && error.message.includes(noUpdateMessage)) {
        const message = `${noUpdateMessage} for stack ${props.configuration.stackName}`;
        this.logger.warn(message);
        return message;
      }
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to deploy stack ${props.configuration.stackName} with error ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    this.logger.info(`Waiting for stack ${props.configuration.stackName} operation to complete.`);
    return await this.waitForStackOperation(client, props.configuration.stackName);
  }

  private async waitForStackOperation(client: CloudFormationClient, stackName: string): Promise<string> {
    let stackStatus: StackStatus | undefined;
    const queryIntervalInSeconds = 20;
    const maxWaitTimeInMinutes = 5;
    const startTime = Date.now();
    const maxWaitTimeInMs = maxWaitTimeInMinutes * 60 * 1000;

    const FAILED_STATES: StackStatus[] = [
      StackStatus.CREATE_FAILED,
      StackStatus.ROLLBACK_IN_PROGRESS,
      StackStatus.ROLLBACK_FAILED,
      StackStatus.ROLLBACK_COMPLETE,
      StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
      StackStatus.UPDATE_ROLLBACK_FAILED,
      StackStatus.UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS,
      StackStatus.UPDATE_ROLLBACK_COMPLETE,
    ];

    const SUCCESS_STATES: StackStatus[] = [StackStatus.CREATE_COMPLETE, StackStatus.UPDATE_COMPLETE];

    const IN_PROGRESS_STATES: StackStatus[] = [
      StackStatus.CREATE_IN_PROGRESS,
      StackStatus.UPDATE_IN_PROGRESS,
      StackStatus.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS,
    ];

    // Get initial status
    const initialResponse = await client.send(new DescribeStacksCommand({ StackName: stackName }));
    if (!initialResponse.Stacks || initialResponse.Stacks.length === 0) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${stackName} not found`);
    }
    stackStatus = initialResponse.Stacks[0].StackStatus;

    while (stackStatus && IN_PROGRESS_STATES.includes(stackStatus)) {
      if (Date.now() - startTime > maxWaitTimeInMs) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for stack ${stackName} operation to complete after ${maxWaitTimeInMinutes} minutes`,
        );
      }

      this.logger.warn(
        `Stack ${stackName} operation is currently in ${stackStatus} state. After ${queryIntervalInSeconds} seconds delay, the status will be rechecked.`,
      );

      await delay(queryIntervalInSeconds / 60);

      const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack operation failed, DescribeStacksCommand didn't return stack object for ${stackName} stack`,
        );
      }

      stackStatus = response.Stacks[0].StackStatus;

      if (stackStatus && FAILED_STATES.includes(stackStatus)) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${stackName} operation failed with status ${stackStatus} - ${response.Stacks[0].StackStatusReason ?? 'No reason provided'}`,
        );
      }
    }

    if (stackStatus && SUCCESS_STATES.includes(stackStatus)) {
      this.logger.info(`Stack ${stackName} operation completed successfully.`);
      return `Stack ${stackName} operation completed successfully with status ${stackStatus}`;
    }

    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${stackName} operation completed with unexpected status: ${stackStatus}`,
    );
  }
}

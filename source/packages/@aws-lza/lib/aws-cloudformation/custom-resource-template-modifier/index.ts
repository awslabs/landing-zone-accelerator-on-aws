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
  GetTemplateCommand,
  TemplateStage,
} from '@aws-sdk/client-cloudformation';
import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';

import {
  ICustomResourceTemplateModifierConfiguration,
  ICustomResourceTemplateModifierHandlerParameter,
  ICustomResourceTemplateModifierModule,
} from '../../../interfaces/aws-cloudformation/custom-resource-template-modifier';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { AcceleratorModuleName } from '../../../common/resources';
import { ModuleHandlerReturnType } from '../../../common/types';

export class CustomResourceTemplateModifierModule implements ICustomResourceTemplateModifierModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  public async handler(props: ICustomResourceTemplateModifierHandlerParameter): Promise<ModuleHandlerReturnType> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link ICustomResourceTemplateModifierHandlerParameter}
   * @returns {@link ModuleHandlerReturnType}
   */
  private async manageModule(props: ICustomResourceTemplateModifierHandlerParameter): Promise<ModuleHandlerReturnType> {
    //
    // Get default configuration
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_CLOUDFORMATION, props);
    const stackName = props.configuration.stackName;

    const client = new CloudFormationClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const stackExists = await this.isStackExists(client, stackName);

    if (props.dryRun) {
      const dryRunMessage = stackExists
        ? `Accelerator will modify the ${stackName} stack template for custom resources ${props.configuration.resourceNames.join(
            ',',
          )}.`
        : `Stack not found ${stackName}, accelerator will skip the template modification for custom resources.`;

      return {
        status: true,
        message: generateDryRunResponse(defaultProps.moduleName, props.operation, dryRunMessage),
      };
    }

    if (!stackExists) {
      const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stack not found ${stackName}, accelerator will skip the template modification for custom resources.`;
      this.logger.error(message);
      return { status: false, message };
    }

    const modifiedTemplateDetails = await this.getModifiedTemplateDetails(
      client,
      stackName,
      props.configuration.resourceNames,
    );

    if (!modifiedTemplateDetails.status) {
      return { status: false, message: modifiedTemplateDetails.message! };
    }

    await this.writeTemplateToDisk(props.configuration, modifiedTemplateDetails.body!);

    return {
      status: true,
      message: `Module ${defaultProps.moduleName} ${props.operation} operation completed successfully.`,
    };
  }

  /**
   * Function to check if stack exists
   * @param client {@link CloudFormationClient}
   * @param stackName string
   * @returns
   */
  private async isStackExists(client: CloudFormationClient, stackName: string): Promise<boolean> {
    this.logger.info(`Checking if stack ${stackName} exists.`);
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new DescribeStacksCommand({
            StackName: stackName,
          }),
        ),
      );

      if (!response.Stacks) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api did not return Stacks object for ${stackName} stack.`,
        );
      }
      const stackCount = response.Stacks.length;
      if (stackCount > 1) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api returned more than 1 stack for ${stackName} stack.`,
        );
      }

      if (stackCount === 0) {
        this.logger.info(`Stack ${stackName} does not exist.`);
        return false;
      }

      this.logger.info(`Stack ${stackName} exists.`);
      return true;
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.name === 'ValidationError' && e.message.includes('does not exist')) {
          this.logger.info(`Stack ${stackName} does not exist.`);
          return false;
        }
      }
      throw e;
    }
  }

  /**
   * Function to get stack template body
   * @param client {@link CloudFormationClient}
   * @param stackName string
   * @returns string
   */
  private async getStackTemplateBody(client: CloudFormationClient, stackName: string): Promise<string> {
    this.logger.info(`Retrieving stack ${stackName} template.`);
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new GetTemplateCommand({
            StackName: stackName,
            TemplateStage: TemplateStage.Original,
          }),
        ),
      );

      if (!response.TemplateBody) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetTemplate api did not return TemplateBody for ${stackName} stack.`,
        );
      }
      this.logger.info(`Retrieved stack ${stackName} template.`);
      return response.TemplateBody;
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.warn(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Error while retrieving template for stack ${stackName}. ${e.message}`,
        );
      }
      throw e;
    }
  }

  /**
   * Function to get resource dependencies
   * @param dependsOn
   * @returns
   */
  private getDependencies(dependsOn: unknown): string[] {
    if (!dependsOn) return [];

    if (typeof dependsOn === 'string') {
      return [dependsOn];
    }

    if (Array.isArray(dependsOn)) {
      return dependsOn.filter((dep): dep is string => typeof dep === 'string');
    }

    return [];
  }

  /**
   * Function to get modified template
   * @param client {@link CloudFormationClient}
   * @param stackName string
   * @param resourceNames string[]
   * @returns status {@link ModuleHandlerReturnType}
   */
  private async getModifiedTemplateDetails(
    client: CloudFormationClient,
    stackName: string,
    resourceNames: string[],
  ): Promise<{ status: boolean; body?: string; message?: string }> {
    this.logger.info(`Modifying stack ${stackName} template.`);
    const templateBody = await this.getStackTemplateBody(client, stackName);

    // Add JSON parsing error handling
    let templateJson;
    try {
      templateJson = JSON.parse(templateBody);
    } catch (e) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Invalid JSON in template for stack ${stackName}`);
    }

    if (!templateJson.Resources) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack template missing Resources object for stack ${stackName}`,
      );
    }

    // Modify deletion policy for specified resources by type
    const resourcesByType = new Map<string, string[]>();
    for (const [resourceName, resource] of Object.entries(templateJson.Resources)) {
      const resourceObj = resource as { Type: string; DeletionPolicy?: string; [key: string]: unknown };
      if (!resourcesByType.has(resourceObj.Type)) {
        resourcesByType.set(resourceObj.Type, []);
      }
      resourcesByType.get(resourceObj.Type)!.push(resourceName);
    }

    const errors: string[] = [];
    for (const resourceType of resourceNames) {
      const matchingResources = resourcesByType.get(resourceType) || [];

      if (matchingResources.length === 0) {
        errors.push(`No resources found with type ${resourceType} in template ${stackName}`);
      } else {
        // Update all matching resources
        for (const resourceName of matchingResources) {
          templateJson.Resources[resourceName] = {
            ...templateJson.Resources[resourceName],
            DeletionPolicy: 'Retain',
          };

          // Check if this custom resource has dependent log groups
          const resource = templateJson.Resources[resourceName];
          const dependencies = this.getDependencies(resource.DependsOn);

          this.updateCustomResourceLogGroupRetention(resourceName, dependencies, templateJson);
        }
        this.logger.info(`Updated ${matchingResources.length} resources of type ${resourceType}`);
      }
    }

    if (errors.length > 0) {
      this.logger.error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: ${errors.join(', ')}.`);
      return { status: false, message: `${MODULE_EXCEPTIONS.INVALID_INPUT}: ${errors.join(', ')}.` };
    }

    this.logger.info(`Modified stack ${stackName} template.`);
    return { status: true, body: JSON.stringify(templateJson, null, 2) };
  }

  /**
   * Function to update Custom resource log group retention
   * @param resourceName string
   * @param dependencies string[]
   * @param templateJson
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateCustomResourceLogGroupRetention(resourceName: string, dependencies: string[], templateJson: any) {
    for (const dependency of dependencies) {
      const resourceDependencies = templateJson.Resources[dependency];
      if (resourceDependencies && resourceDependencies.Type === 'AWS::Logs::LogGroup') {
        templateJson.Resources[dependency] = {
          ...templateJson.Resources[dependency],
          DeletionPolicy: 'Retain',
        };
        this.logger.info(
          `Updated deletion policy for dependent log group ${dependency} of custom resource ${resourceName}`,
        );
      }
    }
  }

  /**
   * Function to write modified template to disk
   * @param props {@link ICustomResourceTemplateModifierConfiguration}
   * @param templateBody string
   */
  private async writeTemplateToDisk(
    props: ICustomResourceTemplateModifierConfiguration,
    templateBody: string,
  ): Promise<void> {
    this.logger.info(`Creating modified stack ${props.stackName} template into disk.`);
    const fileName = `${props.stackName}.json`;
    const filePath = path.join(props.directory, props.accountId, props.region, fileName);
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, templateBody);
    } catch (e) {
      this.logger.error(`Error while writing modified stack ${props.stackName} template to disk: ${e}`);
      throw e;
    }
    this.logger.info(`Created modified stack ${props.stackName} template into ${filePath}`);
  }
}

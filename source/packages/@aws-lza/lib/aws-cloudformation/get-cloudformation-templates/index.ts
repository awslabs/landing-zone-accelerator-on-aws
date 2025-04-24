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
  IGetCloudFormationTemplatesModule,
  IGetCloudFormationTemplatesHandlerParameter,
} from '../../../interfaces/aws-cloudformation/get-cloudformation-templates';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { promises as fs } from 'fs';
import { generateDryRunResponse, getCredentials, getModuleDefaultParameters } from '../../../common/functions';

import { AcceleratorModuleName, IAssumeRoleCredential, IModuleDefaultParameter } from '../../../common/resources';
import { AcceleratorEnvironment } from '../../../common/types';
import { CloudFormationClient, GetTemplateCommand } from '@aws-sdk/client-cloudformation';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

export class GetCloudFormationTemplatesModule implements IGetCloudFormationTemplatesModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to enable baseline for AWS Organizations organizational unit (OU)
   *
   * @param props {@link IGetCloudFormationTemplatesHandlerParameter}
   * @returns status string
   */
  public async handler(props: IGetCloudFormationTemplatesHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IGetCloudFormationTemplatesHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IGetCloudFormationTemplatesHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_CLOUDFORMATION, props);
    const centralAccountId = props.configuration.centralAccountId;
    const batchSize = props.configuration.batchSize ?? 50;
    if (defaultProps.dryRun) {
      return this.executeDryRun(props, defaultProps);
    }
    const environmentCredentials = await this.getEnvironmentsCredentials({
      centralAccountId,
      environments: props.configuration.acceleratorEnvironments,
      assumeRoleCredentials: props.credentials,
      roleNameToAssume: props.configuration.roleNameToAssume,
      solutionId: props.solutionId,
      partition: props.partition,
      batchSize,
    });

    await this.processCloudFormationTemplates({
      environmentCredentials,
      stackPrefix: props.configuration.stackPrefix,
      stackName: props.configuration.stackName,
      batchSize,
      basePath: props.configuration.directory,
    });

    return `CloudFormation Templates for stacks retrieved successfully and have been written to ${props.configuration.directory}`;
  }

  /**
   * Retrieves AWS credentials for multiple environments
   * @param props - Properties containing environment details and credential configuration
   * @param props.centralAccountId - Central AWS account ID
   * @param props.environments - List of AWS environments to process
   * @param props.assumeRoleCredentials - Base credentials for role assumption
   * @param props.roleNameToAssume - Role name to assume in target accounts
   * @param props.solutionId - Optional solution identifier
   * @param props.partition - Optional AWS partition
   * @param props.batchSize - Number of concurrent credential retrievals
   * @returns Array of environment credentials
   * @private
   */
  private async getEnvironmentsCredentials(props: {
    centralAccountId: string;
    environments: AcceleratorEnvironment[];
    assumeRoleCredentials?: IAssumeRoleCredential;
    roleNameToAssume: string;
    solutionId?: string;
    partition?: string;
    batchSize: number;
  }): Promise<{ environment: AcceleratorEnvironment; credentials: IAssumeRoleCredential | undefined }[]> {
    const credentialPromises: Promise<{
      environment: AcceleratorEnvironment;
      credentials: IAssumeRoleCredential | undefined;
    }>[] = [];
    const credentials = [];
    for (const environment of props.environments) {
      const envCreds = this.getEnvironmentCredentials({
        centralAccountId: props.centralAccountId,
        accountId: environment.accountId,
        region: environment.region,
        solutionId: props.solutionId,
        partition: props.partition,
        crossAccountRoleName: props.roleNameToAssume,
        managementCredentials: props.assumeRoleCredentials,
      }).then(envCredsResponse => {
        credentialPromises.splice(credentialPromises.indexOf(envCreds), 1);
        return envCredsResponse;
      });

      credentialPromises.push(envCreds);

      if (credentialPromises.length >= props.batchSize) {
        const resolvedCredentials = await Promise.race(credentialPromises);
        credentials.push(resolvedCredentials);
      }
    }

    const batchCredentials = await Promise.all(credentialPromises);
    credentials.push(...batchCredentials);
    return credentials;
  }

  /**
   * Retrieves credentials for a specific AWS environment
   * @param props - Properties for credential retrieval
   * @param props.centralAccountId - Central AWS account ID
   * @param props.accountId - AWS account ID
   * @param props.region - AWS region
   * @param props.solutionId - Optional solution identifier
   * @param props.partition - Optional AWS partition
   * @param props.crossAccountRoleName - Role name to assume
   * @param props.managementCredentials - Base credentials for role assumption
   * @returns Object containing environment and credential information
   * @throws {Error} When credentials cannot be retrieved
   * @private
   */
  private async getEnvironmentCredentials(props: {
    centralAccountId: string;
    accountId: string;
    region: string;
    solutionId?: string;
    partition?: string;
    crossAccountRoleName: string;
    managementCredentials?: IAssumeRoleCredential;
  }): Promise<{ environment: AcceleratorEnvironment; credentials: IAssumeRoleCredential | undefined }> {
    if (props.centralAccountId === props.accountId) {
      return {
        environment: {
          accountId: props.accountId,
          region: props.region,
        },
        credentials: props.managementCredentials,
      };
    }
    const credentials = await getCredentials({
      accountId: props.accountId,
      region: props.region,
      solutionId: props.solutionId,
      partition: props.partition,
      assumeRoleName: props.crossAccountRoleName,
      sessionName: 'AcceleratorGetCloudFormationTemplate',
      credentials: props.managementCredentials,
    });

    if (!credentials) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not retrieve credentials for account ${props.accountId} in region ${props.region}, using role ${props.crossAccountRoleName}`,
      );
    }

    return {
      environment: {
        accountId: props.accountId,
        region: props.region,
      },
      credentials,
    };
  }

  /**
   * Retrieves CloudFormation templates from multiple environments
   * @param props - Properties for template retrieval
   * @param props.environmentCredentials - Array of environment credentials
   * @param props.stackPrefix - Optional stack name prefix
   * @param props.stackName - Optional specific stack name
   * @param props.batchSize - Number of concurrent template retrievals
   * @returns Array of templates with their associated environments
   * @private
   */
  private async processCloudFormationTemplates(props: {
    basePath: string;
    environmentCredentials: {
      environment: { accountId: string; region: string };
      credentials: IAssumeRoleCredential | undefined;
    }[];
    stackPrefix?: string;
    stackName?: string;
    batchSize: number;
  }): Promise<void> {
    const cloudFormationTemplates = [];
    const cloudFormationTemplatesPromises: Promise<void>[] = [];
    for (const environmentCredential of props.environmentCredentials) {
      const cfnTemplatePromise = this.processCloudFormationTemplate({
        environment: environmentCredential.environment,
        credentials: environmentCredential.credentials,
        stackPrefix: props.stackPrefix,
        stackName: props.stackName,
        basePath: props.basePath,
      }).then(cfnTemplateResponse => {
        cloudFormationTemplatesPromises.splice(cloudFormationTemplatesPromises.indexOf(cfnTemplatePromise), 1);
        return cfnTemplateResponse;
      });

      if (cloudFormationTemplatesPromises.length >= props.batchSize) {
        const resolvedTemplate = await Promise.race(cloudFormationTemplatesPromises);
        cloudFormationTemplates.push(resolvedTemplate);
      }
    }

    const batchCloudFormationTemplatesPromises = await Promise.all(cloudFormationTemplatesPromises);
    cloudFormationTemplates.push(...batchCloudFormationTemplatesPromises);
  }

  /**
   * Retrieves a CloudFormation template from a specific environment
   * @param props - Properties for template retrieval
   * @param props.environment - Target AWS environment
   * @param props.credentials - AWS credentials
   * @param props.stackPrefix - Optional stack name prefix
   * @param props.stackName - Optional specific stack name
   * @returns Object containing environment, stack name, and template body
   * @private
   */
  private async processCloudFormationTemplate(props: {
    environment: AcceleratorEnvironment;
    credentials: IAssumeRoleCredential | undefined;
    basePath: string;
    stackPrefix?: string;
    stackName?: string;
  }): Promise<void> {
    const stackName = this.setStackName({
      stackName: props.stackName,
      stackPrefix: props.stackPrefix,
      environment: props.environment,
    });

    const cfnClient = new CloudFormationClient({
      credentials: props.credentials,
      region: props.environment.region,
    });

    const getStackTemplateCommand = new GetTemplateCommand({
      StackName: stackName,
      TemplateStage: 'Original',
    });

    const stackTemplateItem = {
      environment: props.environment,
      stackName,
      template: '{}',
      basePath: props.basePath,
    };
    try {
      const stackTemplate = await throttlingBackOff(() => cfnClient.send(getStackTemplateCommand));
      if (stackTemplate.TemplateBody) {
        stackTemplateItem.template = stackTemplate.TemplateBody;
      }
    } catch (err) {
      this.logger.warn(
        `No template found for account ${props.environment.accountId} in region ${props.environment.region}. Returning empty template.`,
      );
    }
    await this.writeTemplateToDisk(stackTemplateItem);
  }

  /**
   * Writes a single CloudFormation template to disk
   * @param props - Properties for writing template
   * @param props.environment - AWS environment details
   * @param props.stackName - Name of the stack
   * @param props.template - Template content
   * @param props.basePath - Base directory path for output
   * @private
   */
  private async writeTemplateToDisk(props: {
    environment: AcceleratorEnvironment;
    stackName: string;
    template: string;
    basePath: string;
  }): Promise<void> {
    const fileName = `${props.stackName}.json`;
    const filePath = path.join(props.basePath, props.environment.accountId, props.environment.region, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const fileContent = props.template;
    await fs.writeFile(filePath, fileContent);
    this.logger.info(`Wrote template to ${filePath}`);
  }

  /**
   * Determines the stack name based on provided parameters
   * @param props - Properties for stack name generation
   * @param props.stackName - Optional specific stack name
   * @param props.stackPrefix - Optional stack name prefix
   * @param props.environment - AWS environment details
   * @returns Generated stack name
   * @throws {Error} When neither stackName nor stackPrefix is provided
   * @private
   */
  private setStackName(props: { stackName?: string; stackPrefix?: string; environment: AcceleratorEnvironment }) {
    if (!props.stackName && !props.stackPrefix) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT} - Either stackName or stackPrefix must be defined.`);
    }

    if (props.stackName && props.stackPrefix) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT} - Only one of stackName or stackPrefix can be defined.`);
    }
    let stackName: string;
    if (props.stackName) {
      stackName = props.stackName;
    } else {
      stackName = `${props.stackPrefix}-${props.environment.accountId}-${props.environment.region}`;
    }

    return stackName;
  }

  /**
   * Executes a dry run of the template retrieval process
   * @param moduleProps - Module configuration parameters
   * @returns Status message indicating dry run results
   * @private
   */
  private executeDryRun(
    moduleProps: IGetCloudFormationTemplatesHandlerParameter,
    defaultProps: IModuleDefaultParameter,
  ): string {
    if (moduleProps.configuration.stackName && moduleProps.configuration.stackPrefix) {
      return generateDryRunResponse(
        defaultProps.moduleName,
        moduleProps.operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Either stackName or stackPrefix must be defined, not both.`,
      );
    }

    this.logger.info('Executing dry run for retrieval of cloudformation templates.');
    return generateDryRunResponse(
      defaultProps.moduleName,
      moduleProps.operation,
      'Dry run for retrieval of cloudformation templates was successful.',
    );
  }
}

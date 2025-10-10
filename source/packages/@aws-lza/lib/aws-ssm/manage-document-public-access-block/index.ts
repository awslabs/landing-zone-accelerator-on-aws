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
  IBlockPublicDocumentSharingConfiguration,
  IBlockPublicDocumentSharingHandlerParameter,
  IBlockPublicDocumentSharingModule,
} from '../../../interfaces/aws-ssm/manage-document-public-access-block';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';

import { SSMClient, UpdateServiceSettingCommand, GetServiceSettingCommand } from '@aws-sdk/client-ssm';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

export class BlockPublicDocumentSharingModule implements IBlockPublicDocumentSharingModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage SSM Block Public Document Sharing
   *
   * @param props {@link IBlockPublicDocumentSharingHandlerParameter}
   * @returns status string
   */
  public async handler(props: IBlockPublicDocumentSharingHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IBlockPublicDocumentSharingHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IBlockPublicDocumentSharingHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_SSM, props);

    //
    // Validate configuration input
    //
    const configurationValid = this.isConfigurationValid(props.configuration);

    const client = new SSMClient({
      region: defaultProps.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const currentPublicDocumentSharingState = await this.getCurrentPublicDocumentSharingState(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        configurationValid,
        currentPublicDocumentSharingState,
        props.configuration,
      );
    }

    if (!configurationValid) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: SSM Block Public Document Sharing configuration is invalid.`,
      );
    }

    if (props.configuration.enable) {
      return await this.enablePublicDocumentSharingBlock(client, currentPublicDocumentSharingState);
    } else {
      return await this.disablePublicDocumentSharingBlock(client, currentPublicDocumentSharingState);
    }
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param configurationValid boolean
   * @param currentPublicDocumentSharingState boolean
   * @param configuration {@link IBlockPublicDocumentSharingConfiguration}
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configurationValid: boolean,
    currentPublicDocumentSharingState: boolean,
    configuration: IBlockPublicDocumentSharingConfiguration,
  ): string {
    if (!configurationValid) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason: SSM Block Public Document Sharing configuration is invalid.`,
      );
    }

    const isCurrentlyBlocked = currentPublicDocumentSharingState;
    const shouldBeBlocked = configuration.enable;

    if (shouldBeBlocked && isCurrentlyBlocked) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `SSM Block Public Document Sharing already enabled for the environment, accelerator will skip the process of enabling SSM Block Public Document Sharing.`,
      );
    }

    if (!shouldBeBlocked && !isCurrentlyBlocked) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `SSM Block Public Document Sharing already disabled for the environment, accelerator will skip the process of disabling SSM Block Public Document Sharing.`,
      );
    }

    if (shouldBeBlocked && !isCurrentlyBlocked) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `SSM Block Public Document Sharing not enabled for the environment, accelerator will enable SSM Block Public Document Sharing.`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `SSM Block Public Document Sharing enabled for the environment, accelerator will disable SSM Block Public Document Sharing.`,
    );
  }

  /**
   * Function to validate configuration input
   * @param configuration {@link IBlockPublicDocumentSharingConfiguration}
   * @returns boolean
   */
  private isConfigurationValid(configuration: IBlockPublicDocumentSharingConfiguration): boolean {
    // For SSM Block Public Document Sharing, the configuration is valid if enable is a boolean
    return typeof configuration.enable === 'boolean';
  }

  /**
   * Function to check current state of SSM Block Public Document Sharing
   * @param client {@link SSMClient}
   * @returns boolean - true if public document sharing is blocked, false if allowed
   */
  private async getCurrentPublicDocumentSharingState(client: SSMClient): Promise<boolean> {
    this.logger.info(`Retrieving current SSM Block Public Document Sharing state.`);

    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new GetServiceSettingCommand({
            SettingId: '/ssm/documents/console/public-sharing-permission',
          }),
        ),
      );

      if (response.ServiceSetting?.SettingValue === undefined) {
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetServiceSetting API did not return SettingValue.`);
      }

      // 'Disable' means public sharing is blocked (feature enabled)
      // 'Enable' means public sharing is allowed (feature disabled)
      return response.ServiceSetting.SettingValue === 'Disable';
    } catch (error) {
      if ((error as Error)?.name === 'ServiceSettingNotFound') {
        this.logger.info(
          `SSM Block Public Document Sharing setting not found, defaulting to disabled (public sharing allowed).`,
        );
        return false; // Default to public sharing allowed if setting doesn't exist
      }
      throw error;
    }
  }

  /**
   * Function to enable SSM Block Public Document Sharing
   * @param client {@link SSMClient}
   * @param currentState boolean - current state of public document sharing blocking
   * @returns string
   */
  private async enablePublicDocumentSharingBlock(client: SSMClient, currentState: boolean): Promise<string> {
    if (currentState) {
      return `SSM Block Public Document Sharing already enabled for the environment, accelerator skipped the process of enabling SSM Block Public Document Sharing.`;
    }

    this.logger.info(`Enabling SSM Block Public Document Sharing.`);
    await throttlingBackOff(() =>
      client.send(
        new UpdateServiceSettingCommand({
          SettingId: '/ssm/documents/console/public-sharing-permission',
          SettingValue: 'Disable', // 'Disable' blocks public sharing
        }),
      ),
    );

    return `Enabled SSM Block Public Document Sharing for the environment.`;
  }

  /**
   * Function to disable SSM Block Public Document Sharing
   * @param client {@link SSMClient}
   * @param currentState boolean - current state of public document sharing blocking
   * @returns string
   */
  private async disablePublicDocumentSharingBlock(client: SSMClient, currentState: boolean): Promise<string> {
    if (!currentState) {
      return `SSM Block Public Document Sharing already disabled for the environment, accelerator skipped the process of disabling SSM Block Public Document Sharing.`;
    }

    this.logger.info(`Disabling SSM Block Public Document Sharing.`);
    await throttlingBackOff(() =>
      client.send(
        new UpdateServiceSettingCommand({
          SettingId: '/ssm/documents/console/public-sharing-permission',
          SettingValue: 'Enable', // 'Enable' allows public sharing
        }),
      ),
    );

    return `Disabled SSM Block Public Document Sharing for the environment.`;
  }
}

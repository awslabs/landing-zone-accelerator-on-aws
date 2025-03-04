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
  IManageEbsDefaultEncryptionConfiguration,
  IManageEbsDefaultEncryptionHandlerParameter,
  IManageEbsDefaultEncryptionModule,
} from '../../../interfaces/amazon-ec2/manage-ebs-default-encryption';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';

import {
  DisableEbsEncryptionByDefaultCommand,
  EC2Client,
  EnableEbsEncryptionByDefaultCommand,
  GetEbsDefaultKmsKeyIdCommand,
  GetEbsEncryptionByDefaultCommand,
  ModifyEbsDefaultKmsKeyIdCommand,
} from '@aws-sdk/client-ec2';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

export class ManageEbsDefaultEncryptionModule implements IManageEbsDefaultEncryptionModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to enable baseline for AWS Organizations organizational unit (OU)
   *
   * @param props {@link IManageEbsDefaultEncryptionHandlerParameter}
   * @returns status string
   */
  public async handler(props: IManageEbsDefaultEncryptionHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IManageEbsDefaultEncryptionHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IManageEbsDefaultEncryptionHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AMAZON_EC2, props);

    //
    // Validate configuration input
    //
    const configurationValid = this.isConfigurationValid(props.configuration);

    const client = new EC2Client({
      region: defaultProps.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const defaultEncryptionEnabled = await this.isDefaultEncryptionEnabled(client);

    const existingEncryptionKeyId = await this.getExistingDefaultEncryptionKeyId(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        configurationValid,
        defaultEncryptionEnabled,
        existingEncryptionKeyId,
        props.configuration,
      );
    }

    if (!configurationValid) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: when default encryption is enabled kms key id can not be undefined or missing.`,
      );
    }

    if (props.configuration.enableDefaultEncryption) {
      return await this.enableDefaultEncryption(
        client,
        defaultEncryptionEnabled,
        existingEncryptionKeyId,
        props.configuration,
      );
    } else {
      return await this.disableDefaultEncryption(client, defaultEncryptionEnabled);
    }
  }

  /**
   * Function to check if default encryption for EBS is enabled
   * @param client {@link OrganizationsClient}
   * @returns boolean
   */
  private async isDefaultEncryptionEnabled(client: EC2Client): Promise<boolean> {
    this.logger.info(`Retrieving existing default EBS encryption settings.`);
    const response = await throttlingBackOff(() => client.send(new GetEbsEncryptionByDefaultCommand()));

    if (response.EbsEncryptionByDefault === undefined) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetEbsEncryptionByDefault API did not return EbsEncryptionByDefault object.`,
      );
    }
    return response.EbsEncryptionByDefault;
  }

  /**
   * Function to get existing default encryption key id for EBS
   * @param client {@link EC2Client}
   * @returns string
   */
  private async getExistingDefaultEncryptionKeyId(client: EC2Client): Promise<string> {
    this.logger.info(`Retrieving existing default encryption key.`);
    const response = await throttlingBackOff(() => client.send(new GetEbsDefaultKmsKeyIdCommand()));

    if (!response.KmsKeyId) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetEbsDefaultKmsKeyId API did not return KmsKeyId.`);
    }
    return response.KmsKeyId;
  }

  /**
   * Function to enable default encryption for EBS
   * @param client {@link EC2Client}
   */
  private async enableEncryptionByDefault(client: EC2Client): Promise<void> {
    this.logger.info(`Enabling default encryption for EBS.`);
    await throttlingBackOff(() => client.send(new EnableEbsEncryptionByDefaultCommand({})));
  }

  /**
   * Function to modify default encryption key for EBS
   * @param client {@link EC2Client}
   * @param keyId string
   * @param existingEncryptionKeyId string
   * @returns string
   */
  private async modifyEbsDefaultKmsKeyId(
    client: EC2Client,
    keyId: string,
    existingEncryptionKeyId: string,
  ): Promise<string> {
    this.logger.info(`Modifying default encryption key for EBS.`);
    const response = await throttlingBackOff(() =>
      client.send(new ModifyEbsDefaultKmsKeyIdCommand({ KmsKeyId: keyId })),
    );

    if (!response.KmsKeyId) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ModifyEbsDefaultKmsKeyId API did not return KmsKeyId.`);
    }

    return `Amazon EBS default encryption set to kms key id changed from "${existingEncryptionKeyId}" to "${response.KmsKeyId}" for the environment.`;
  }

  /**
   * Function to enable default encryption and set default encryption kms key
   * @param client {@link EC2Client}
   * @param defaultEncryptionEnabled boolean
   * @param existingEncryptionKeyId string
   * @param configuration {@link IManageEbsDefaultEncryptionConfiguration}
   * @returns string
   */
  private async enableDefaultEncryption(
    client: EC2Client,
    defaultEncryptionEnabled: boolean,
    existingEncryptionKeyId: string,
    configuration: IManageEbsDefaultEncryptionConfiguration,
  ): Promise<string> {
    if (!defaultEncryptionEnabled) {
      await this.enableEncryptionByDefault(client);
    }

    defaultEncryptionEnabled = await this.isDefaultEncryptionEnabled(client);
    if (defaultEncryptionEnabled && existingEncryptionKeyId !== configuration.kmsKeyId) {
      return await this.modifyEbsDefaultKmsKeyId(client, configuration.kmsKeyId!, existingEncryptionKeyId);
    }

    return `Amazon EBS default encryption already set to kms key id to "${configuration.kmsKeyId}" for the environment, accelerator skipped the process of enabling EBS default encryption key.`;
  }

  /**
   * Function to disable default encryption for EBS
   * @param client {@link EC2Client}
   */
  private async disableDefaultEncryption(client: EC2Client, defaultEncryptionEnabled: boolean): Promise<string> {
    if (defaultEncryptionEnabled) {
      this.logger.info(`Disabling default encryption for EBS.`);
      await throttlingBackOff(() => client.send(new DisableEbsEncryptionByDefaultCommand({})));
      return `Disabled Amazon EBS default encryption for the environment.`;
    }

    return `Amazon EBS default encryption already disabled for the environment,  accelerator skipped the process of disabling EBS default encryption key.`;
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param configurationValid boolean
   * @param defaultEncryptionEnabled boolean
   * @param existingEncryptionKeyId string
   * @param configuration {@link IManageEbsDefaultEncryptionConfiguration}
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configurationValid: boolean,
    defaultEncryptionEnabled: boolean,
    existingEncryptionKeyId: string,
    configuration: IManageEbsDefaultEncryptionConfiguration,
  ): string {
    if (!configurationValid) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason default encryption is set to enable, but kms key id is undefined or missing.`,
      );
    }

    if (!configuration.enableDefaultEncryption && defaultEncryptionEnabled) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Amazon EBS default encryption enabled for the environment, accelerator will disable default encryption.`,
      );
    }

    if (!configuration.enableDefaultEncryption && !defaultEncryptionEnabled) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Amazon EBS default encryption already disabled for the environment, accelerator will skip the process of disabling EBS default encryption key.`,
      );
    }

    if (!defaultEncryptionEnabled) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Amazon EBS default encryption not enabled for the environment, accelerator will enable default encryption and set the default encryption kms key to "${configuration.kmsKeyId}".`,
      );
    }

    if (existingEncryptionKeyId !== configuration.kmsKeyId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Existing Amazon EBS default encryption key id is ${existingEncryptionKeyId}, accelerator will set default encryption key to "${configuration.kmsKeyId}".`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `Existing Amazon EBS default encryption key id is "${configuration.kmsKeyId}", accelerator will skip the process of enabling EBS default encryption key.`,
    );
  }
  /**
   * Function to validate configuration input
   * @param configuration {@link IManageEbsDefaultEncryptionConfiguration}
   * @returns boolean
   */
  private isConfigurationValid(configuration: IManageEbsDefaultEncryptionConfiguration): boolean {
    if (configuration.enableDefaultEncryption && !configuration.kmsKeyId) {
      return false;
    }
    return true;
  }
}

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
  IManageImageBlockPublicAccessHandlerParameter,
  IManageImageBlockPublicAccessModule,
} from '../../../interfaces/amazon-ec2/manage-image-block-public-access';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';

import {
  EC2Client,
  EnableImageBlockPublicAccessCommand,
  DisableImageBlockPublicAccessCommand,
  GetImageBlockPublicAccessStateCommand,
} from '@aws-sdk/client-ec2';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

export class ManageImageBlockPublicAccessModule implements IManageImageBlockPublicAccessModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  public async handler(props: IManageImageBlockPublicAccessHandlerParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AMAZON_EC2, props);

    const configurationValid = typeof props.configuration.enable === 'boolean';

    const client = new EC2Client({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const currentState = await this.getCurrentState(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        configurationValid,
        currentState,
        props.configuration.enable,
      );
    }

    if (!configurationValid) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Image Block Public Access configuration is invalid.`);
    }

    if (props.configuration.enable) {
      return await this.enableBlockPublicAccess(client, currentState);
    } else {
      return await this.disableBlockPublicAccess(client, currentState);
    }
  }

  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configurationValid: boolean,
    currentState: boolean,
    enable: boolean,
  ): string {
    if (!configurationValid) {
      return generateDryRunResponse(moduleName, operation, `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}.`);
    }
    if (enable && currentState) {
      return generateDryRunResponse(moduleName, operation, `Image Block Public Access already enabled, skipping.`);
    }
    if (!enable && !currentState) {
      return generateDryRunResponse(moduleName, operation, `Image Block Public Access already disabled, skipping.`);
    }
    if (enable) {
      return generateDryRunResponse(moduleName, operation, `Will enable Image Block Public Access.`);
    }
    return generateDryRunResponse(moduleName, operation, `Will disable Image Block Public Access.`);
  }

  /**
   * Get current state - returns true if public access is blocked
   */
  private async getCurrentState(client: EC2Client): Promise<boolean> {
    this.logger.info(`Retrieving current Image Block Public Access state.`);
    try {
      const response = await throttlingBackOff(() => client.send(new GetImageBlockPublicAccessStateCommand({})));
      // 'block-new-sharing' means public access is blocked
      return response.ImageBlockPublicAccessState === 'block-new-sharing';
    } catch (error) {
      this.logger.warn(`Failed to get Image Block Public Access state, defaulting to disabled: ${error}`);
      return false;
    }
  }

  private async enableBlockPublicAccess(client: EC2Client, currentState: boolean): Promise<string> {
    if (currentState) {
      return `Image Block Public Access already enabled, skipped.`;
    }
    this.logger.info(`Enabling Image Block Public Access.`);
    await throttlingBackOff(() =>
      client.send(new EnableImageBlockPublicAccessCommand({ ImageBlockPublicAccessState: 'block-new-sharing' })),
    );
    return `Enabled Image Block Public Access.`;
  }

  private async disableBlockPublicAccess(client: EC2Client, currentState: boolean): Promise<string> {
    if (!currentState) {
      return `Image Block Public Access already disabled, skipped.`;
    }
    this.logger.info(`Disabling Image Block Public Access.`);
    await throttlingBackOff(() => client.send(new DisableImageBlockPublicAccessCommand({})));
    return `Disabled Image Block Public Access.`;
  }
}

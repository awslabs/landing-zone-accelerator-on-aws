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
  IRootUserManagementHandlerParameter,
  IRootUserManagementModule,
} from '../../../interfaces/aws-iam/root-user-management';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';

import { OrganizationsClient } from '@aws-sdk/client-organizations';

import {
  DisableOrganizationsRootCredentialsManagementCommand,
  DisableOrganizationsRootSessionsCommand,
  EnableOrganizationsRootCredentialsManagementCommand,
  EnableOrganizationsRootSessionsCommand,
  IAMClient,
  ListOrganizationsFeaturesCommand,
  ServiceAccessNotEnabledException,
} from '@aws-sdk/client-iam';

import { AcceleratorModuleName } from '../../../common/resources';
import { enableServiceAccess, disableServiceAccess } from '../../../common/functions';

type RootUserManagement = {
  serviceEnabled: boolean;
  credentials: boolean;
  session: boolean;
};
export class RootUserManagementModule implements IRootUserManagementModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to enable/disable IAM Root User Management
   *
   * @param props {@link IRootUserManagementHandlerParameter}
   * @returns status string
   */
  public async handler(props: IRootUserManagementHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IRootUserManagementHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IRootUserManagementHandlerParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_IAM, props);

    const rootUserManagementConfiguration: RootUserManagement = {
      serviceEnabled: props.configuration.enabled,
      credentials: props.configuration.credentials,
      session: props.configuration.session,
    };

    const organizationsClient = new OrganizationsClient({
      region: defaultProps.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const iamClient = new IAMClient({
      region: defaultProps.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    let dryRunResponse = '';

    const rootUserManagementStatus = await this.getRootUserManagementStatus(iamClient);

    if (JSON.stringify(rootUserManagementStatus) == JSON.stringify(rootUserManagementConfiguration)) {
      if (defaultProps.dryRun) dryRunResponse = 'No updates requred.  Current state and configuration match.';
    }

    if (!rootUserManagementStatus.serviceEnabled && rootUserManagementConfiguration.serviceEnabled) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will enable AWS Service Access for IAM. ';
      } else {
        await enableServiceAccess(organizationsClient, 'iam.amazonaws.com');
      }
    }
    if (!rootUserManagementStatus.credentials && rootUserManagementConfiguration.credentials) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will enable IAM Root User Credentials Management. ';
      } else {
        await this.enableRootCredentialsManagement(iamClient);
      }
    }

    if (!rootUserManagementStatus.session && rootUserManagementConfiguration.session) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will enable IAM Root User Session Management. ';
      } else {
        await this.enableRootSessionManagment(iamClient);
      }
    }

    if (rootUserManagementStatus.session && !rootUserManagementConfiguration.session) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will disable IAM Root User Session Management. ';
      } else {
        await this.disableRootSessionManagement(iamClient);
      }
    }

    if (rootUserManagementStatus.credentials && !rootUserManagementConfiguration.credentials) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will disable IAM Root User Credentials Management. ';
      } else {
        await this.disableRootCredentialsManagement(iamClient);
      }
    }

    if (rootUserManagementStatus.serviceEnabled && !rootUserManagementConfiguration.serviceEnabled) {
      if (defaultProps.dryRun) {
        dryRunResponse = dryRunResponse + 'Will disable AWS Service Access for IAM. ';
      } else {
        await disableServiceAccess(organizationsClient, 'iam.amazonaws.com');
      }
    }

    if (defaultProps.dryRun) {
      this.logger.info(
        `Dry run execution for ${defaultProps.moduleName} ${props.operation} completed.  See log for details.`,
      );
      return generateDryRunResponse(defaultProps.moduleName, props.operation, dryRunResponse);
    } else {
      return 'success';
    }
  }

  private async enableRootCredentialsManagement(iamClient: IAMClient): Promise<void> {
    try {
      const response = await throttlingBackOff(() =>
        iamClient.send(new EnableOrganizationsRootCredentialsManagementCommand()),
      );
      this.logger.debug(response);
      this.logger.info('IAM Root User Credentials enabled');
    } catch (e: unknown) {
      this.logger.error('Failed to enable root user credential management');
      throw e;
    }
  }

  private async enableRootSessionManagment(iamClient: IAMClient): Promise<void> {
    try {
      const session = await throttlingBackOff(() => iamClient.send(new EnableOrganizationsRootSessionsCommand()));
      this.logger.debug(session);
      this.logger.info('IAM Root User Sessions enabled');
    } catch (e: unknown) {
      this.logger.error('Failed to enable root user session management');
      throw e;
    }
  }

  private async disableRootSessionManagement(iamClient: IAMClient): Promise<void> {
    try {
      const session = await throttlingBackOff(() => iamClient.send(new DisableOrganizationsRootSessionsCommand()));
      this.logger.debug(session);
      this.logger.info('IAM Root User Sessions disabled');
    } catch (e: unknown) {
      this.logger.error('Failed to disable root user session management');
      throw e;
    }
  }

  private async disableRootCredentialsManagement(iamClient: IAMClient): Promise<void> {
    this.logger.debug('Disabling IAM root user credentials management');
    try {
      const credentials = await throttlingBackOff(() =>
        iamClient.send(new DisableOrganizationsRootCredentialsManagementCommand()),
      );
      this.logger.debug(credentials);
      this.logger.info('IAM Root User Sessions disabled');
    } catch (e: unknown) {
      this.logger.error('Failed to disable root user credentials management');
      throw e;
    }
  }

  private async getRootUserManagementStatus(iamClient: IAMClient): Promise<RootUserManagement> {
    const status: RootUserManagement = {
      serviceEnabled: false,
      credentials: false,
      session: false,
    };
    try {
      const serviceAccessEnabled = await iamClient.send(new ListOrganizationsFeaturesCommand());
      status.serviceEnabled = true;
      for (const feature of serviceAccessEnabled.EnabledFeatures ?? []) {
        this.logger.info(`feature: ${feature}`);
        switch (feature) {
          case 'RootCredentialsManagement':
            status.credentials = true;
            break;
          case 'RootSessions':
            status.session = true;
            break;
        }
      }
      return status;
    } catch (e: unknown) {
      if (e instanceof ServiceAccessNotEnabledException) {
        return status;
      } else {
        this.logger.error('Failed to get service status');
        throw e;
      }
    }
  }
}

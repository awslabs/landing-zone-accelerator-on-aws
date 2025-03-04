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
  ICreateOrganizationalUnitHandlerParameter,
  ICreateOrganizationalUnitModule,
} from '../../../interfaces/aws-organizations/create-organizational-unit';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import {
  generateDryRunResponse,
  getModuleDefaultParameters,
  getOrganizationalUnitsForParent,
  getParentOuId,
  setRetryStrategy,
} from '../../../common/functions';

import {
  CreateOrganizationalUnitCommand,
  OrganizationalUnit,
  OrganizationsClient,
  Tag,
} from '@aws-sdk/client-organizations';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

export class CreateOrganizationalUnitModule implements ICreateOrganizationalUnitModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Public member to provide created organization unit, which can be used by the caller engine
   */
  public createdOrganizationalUnit: OrganizationalUnit | undefined;

  /**
   * Handler function to enable baseline for AWS Organizations organizational unit (OU)
   *
   * @param props {@link ICreateOrganizationalUnitHandlerParameter}
   * @returns status string
   */
  public async handler(props: ICreateOrganizationalUnitHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link ICreateOrganizationalUnitHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: ICreateOrganizationalUnitHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_ORGANIZATIONS, props);

    const ouName = props.configuration.name.substring(props.configuration.name.lastIndexOf('/') + 1);
    const parentOuName = this.getParentOuName(props.configuration.name);

    const client = new OrganizationsClient({
      region: defaultProps.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const parentOuId = await getParentOuId(client, parentOuName);

    const ouExist = parentOuId === undefined ? false : await this.isOuExist(client, ouName, parentOuId);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        ouName,
        parentOuName,
        ouExist,
        parentOuId,
      );
    }

    if (!parentOuId) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Parent OU "${parentOuName}" of new ou ${ouName} not found.`);
    }

    if (ouExist) {
      return `AWS Organizations organizational unit "${ouName}" for parent "${parentOuName}" exist, ou creation operation skipped.`;
    }

    return await this.createOrganizationalUnit(client, ouName, parentOuName, parentOuId, props.configuration.tags);
  }

  /**
   * Function to get Parent OU name
   * @param ouPath string
   * @returns string
   */
  private getParentOuName(ouPath: string): string {
    const ouNames = ouPath.replace(/\/+$/, '').split('/');
    if (ouNames.length === 1) {
      return 'Root';
    }

    return ouPath.substring(0, ouPath.lastIndexOf('/'));
  }

  /**
   * Function to create OU
   * @param client {@link OrganizationsClient}
   * @param ouName string
   * @param parentOuName string
   * @param parentOuId string
   * @param tags {@link Tag}[] | undefined
   * @returns string
   */
  private async createOrganizationalUnit(
    client: OrganizationsClient,
    ouName: string,
    parentOuName: string,
    parentOuId: string,
    tags?: Tag[],
  ): Promise<string> {
    this.logger.info(`Creating Organizational unit ${ouName} for parent "${parentOuName}".`);
    const response = await throttlingBackOff(() =>
      client.send(
        new CreateOrganizationalUnitCommand({
          Name: ouName,
          ParentId: parentOuId,
          Tags: tags,
        }),
      ),
    );

    if (!response.OrganizationalUnit) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Organization unit "${ouName}" create organization unit api did not return OrganizationalUnit object.`,
      );
    }

    this.createdOrganizationalUnit = response.OrganizationalUnit;

    return `AWS Organizations organizational unit "${ouName}" created successfully. New OU id is "${response.OrganizationalUnit.Id}".`;
  }

  /**
   * Function to check if organizational unit already exists
   * @param client {@link OrganizationsClient}
   * @param ouName string
   * @param parentOuId string
   * @returns boolean
   */
  private async isOuExist(client: OrganizationsClient, ouName: string, parentOuId: string): Promise<boolean> {
    const organizationalUnitsForParent = await getOrganizationalUnitsForParent(client, parentOuId);

    for (const organizationalUnit of organizationalUnitsForParent) {
      if (organizationalUnit.Name === ouName) {
        return true;
      }
    }

    return false;
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param ouName string
   * @param parentOuName string
   * @param ouExist boolean
   * @param parentOuId string | undefined
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    ouName: string,
    parentOuName: string,
    ouExist: boolean,
    parentOuId?: string,
  ): string {
    if (!parentOuId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason parent ou "${parentOuName}" of new ou "${ouName}" not found in AWS Organizations.`,
      );
    }

    if (ouExist) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Organizations organizational unit (OU) "${ouName}" for parent "${parentOuName}" exists, accelerator will skip the OU creation process.`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Organizations organizational unit (OU) "${ouName}" for parent "${parentOuName}" does not exists, accelerator will create the new OU.`,
    );
  }
}

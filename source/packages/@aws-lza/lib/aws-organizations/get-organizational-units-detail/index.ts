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

import path from 'path';
import { createLogger } from '../../../common/logger';
import {
  IGetOrganizationalUnitsDetailHandlerParameter,
  IGetOrganizationalUnitsDetailModule,
  IOrganizationalUnitDetailsType,
} from '../../../interfaces/aws-organizations/get-organizational-units-detail';
import {
  getEnabledBaselines,
  getLandingZoneIdentifier,
  getOrganizationalUnitsForParent,
  getOrganizationId,
  getOrganizationRootId,
  isOrganizationsConfigured,
  setRetryStrategy,
} from '../../../common/functions';
import { ControlTowerClient, EnabledBaselineSummary } from '@aws-sdk/client-controltower';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
export class GetOrganizationalUnitsDetailModule implements IGetOrganizationalUnitsDetailModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  private landingZoneIdentifier: string | undefined;
  private enabledBaselines: EnabledBaselineSummary[] = [];

  /**
   * Handler function to get AWS Organizations Organizational Unit details
   *
   * @param props {@link IGetOrganizationalUnitsDetailHandlerParameter}
   * @returns ouDetails {@link IOrganizationalUnitDetailsType}[]
   */
  public async handler(
    props: IGetOrganizationalUnitsDetailHandlerParameter,
  ): Promise<IOrganizationalUnitDetailsType[]> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IGetOrganizationalUnitsDetailHandlerParameter}
   * @returns ouDetails {@link IOrganizationalUnitDetailsType}[]
   */
  private async manageModule(
    props: IGetOrganizationalUnitsDetailHandlerParameter,
  ): Promise<IOrganizationalUnitDetailsType[]> {
    const organizationClient = new OrganizationsClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const organizationsConfigured = await isOrganizationsConfigured(organizationClient);

    if (!organizationsConfigured) {
      this.logger.warn(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Organizations not configured, unable to get organization units detail`,
      );
      return [];
    }

    this.setControlTowerResources(props);

    return await this.getAllOrganizationalUnits(organizationClient);
  }

  /**
   * Function to set Control Tower resources when Control Tower is enabled
   * @param props {@link IGetOrganizationalUnitsDetailHandlerParameter}
   * @returns
   */
  private async setControlTowerResources(props: IGetOrganizationalUnitsDetailHandlerParameter): Promise<void> {
    if (!props.configuration.enableControlTower) {
      return;
    }

    const controlTowerClient = new ControlTowerClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    this.landingZoneIdentifier = await getLandingZoneIdentifier(controlTowerClient);

    if (this.landingZoneIdentifier) {
      this.enabledBaselines = await getEnabledBaselines(controlTowerClient);
    }
  }

  /**
   * Function to get Organizational unit details recursively
   * @param organizationClient {@link OrganizationsClient}
   * @param parentId string | undefined
   * @param parentCompletePath string | undefined
   * @param level number | undefined
   * @param organizationId string | undefined
   * @param rootId string | undefined
   * @returns
   */
  private async getAllOrganizationalUnits(
    organizationClient: OrganizationsClient,
    parentId?: string,
    parentCompletePath?: string,
    level?: number,
    organizationId?: string,
    rootId?: string,
  ): Promise<IOrganizationalUnitDetailsType[]> {
    // Set defaults
    parentCompletePath = parentCompletePath ?? '';
    level = level || 1;

    // Get org details only on first call
    if (!organizationId || !rootId) {
      organizationId = await getOrganizationId(organizationClient);
      rootId = await getOrganizationRootId(organizationClient);
      parentId = rootId;
    }

    const allOrganizationalUnitDetails: IOrganizationalUnitDetailsType[] = [];
    const organizationalUnitsForParent = await getOrganizationalUnitsForParent(organizationClient, parentId!);

    for (const organizationalUnitForParent of organizationalUnitsForParent) {
      // Validate required fields
      if (!organizationalUnitForParent.Name || !organizationalUnitForParent.Id || !organizationalUnitForParent.Arn) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListOrganizationalUnitsForParent did not return valid ou details, ou name, id or arn is missing for parent OU ${parentId}`,
        );
      }

      const completePath = parentCompletePath
        ? `${parentCompletePath}/${organizationalUnitForParent.Name}`
        : organizationalUnitForParent.Name;
      const parentName = parentCompletePath ? parentCompletePath.split('/').pop()! : 'Root';

      allOrganizationalUnitDetails.push({
        organizationId: organizationId,
        rootId: rootId,
        name: organizationalUnitForParent.Name,
        id: organizationalUnitForParent.Id,
        arn: organizationalUnitForParent.Arn,
        ouLevel: level,
        parentId: parentId!,
        parentName: parentName,
        completePath: completePath,
        parentCompletePath: parentCompletePath,
        registeredwithControlTower: this.landingZoneIdentifier
          ? this.isOrganizationalUnitRegisteredWithControlTower(this.enabledBaselines, organizationalUnitForParent.Arn)
          : false,
      });

      const childOrganizationalUnitDetails = await this.getAllOrganizationalUnits(
        organizationClient,
        organizationalUnitForParent.Id,
        completePath,
        level + 1,
        organizationId,
        rootId,
      );

      allOrganizationalUnitDetails.push(...childOrganizationalUnitDetails);
    }

    return allOrganizationalUnitDetails;
  }

  /**
   * Function to check if organizational unit is registered with control tower
   * @param enabledBaselines {@link EnabledBaselineSummary}[]
   * @param ouArn string
   * @returns
   */
  private isOrganizationalUnitRegisteredWithControlTower(
    enabledBaselines: EnabledBaselineSummary[],
    ouArn: string,
  ): boolean {
    return enabledBaselines.some(item => item.targetIdentifier?.toLowerCase() === ouArn.toLowerCase());
  }
}

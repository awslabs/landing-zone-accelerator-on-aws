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
  IRegisterOrganizationalUnitHandlerParameter,
  IRegisterOrganizationalUnitModule,
} from '../../../interfaces/control-tower/register-organizational-unit';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import {
  delay,
  generateDryRunResponse,
  getLandingZoneDetails,
  getLandingZoneIdentifier,
  getModuleDefaultParameters,
  getOrganizationalUnitArn,
  getOrganizationalUnitIdByPath,
  setRetryStrategy,
} from '../../../common/functions';

import {
  BaselineOperationStatus,
  BaselineSummary,
  ControlTowerClient,
  EnableBaselineCommand,
  EnabledBaselineParameter,
  EnabledBaselineSummary,
  EnablementStatus,
  GetBaselineOperationCommand,
  paginateListBaselines,
  paginateListEnabledBaselines,
} from '@aws-sdk/client-controltower';
import { AcceleratorModuleName } from '../../../common/resources';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { STSClient } from '@aws-sdk/client-sts';

export class RegisterOrganizationalUnitModule implements IRegisterOrganizationalUnitModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to enable baseline for AWS Organizations organizational unit (OU)
   *
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   * @returns status string
   */
  public async handler(props: IRegisterOrganizationalUnitHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IRegisterOrganizationalUnitHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE, props);

    const client = new ControlTowerClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const ouName =
      props.configuration.name.toLowerCase() === 'root' ? `Root/${props.configuration.name}` : props.configuration.name;

    const organizationClient = new OrganizationsClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const ouId = await getOrganizationalUnitIdByPath(organizationClient, ouName);

    const landingZoneIdentifier = await getLandingZoneIdentifier(client);
    const landingZoneDetails =
      landingZoneIdentifier === undefined
        ? undefined
        : await getLandingZoneDetails(client, props.region, landingZoneIdentifier);

    const enabledBaselines: EnabledBaselineSummary[] =
      landingZoneIdentifier === undefined ? [] : await this.getEnabledBaselines(client);

    const availableControlTowerBaselines: BaselineSummary[] =
      landingZoneIdentifier === undefined ? [] : await this.getAvailableControlTowerBaselines(client);

    const awsControlTowerBaselineIdentifier = availableControlTowerBaselines.find(
      item => item.name!.toLowerCase() === 'AWSControlTowerBaseline'.toLowerCase(),
    )?.arn;

    let ouArn: string | undefined;
    if (ouId) {
      ouArn = await getOrganizationalUnitArn(
        organizationClient,
        new STSClient({
          region: props.region,
          customUserAgent: props.solutionId,
          retryStrategy: setRetryStrategy(),
          credentials: props.credentials,
        }),
        ouId,
        props.partition,
        props.configuration.organizationalUnitId,
      );
    }

    let ouRegisteredInControlTower: EnabledBaselineSummary | undefined;
    if (ouArn) {
      ouRegisteredInControlTower = enabledBaselines.find(
        item => item.targetIdentifier!.toLowerCase() === (ouArn as string).toLowerCase(),
      );
    }

    const identityCenterBaselineIdentifier = await this.getIdentityCenterBaselineIdentifier(
      availableControlTowerBaselines,
      enabledBaselines,
    );

    const baselineVersion: string | undefined =
      landingZoneDetails?.version === undefined ? undefined : this.getBaselineVersion(landingZoneDetails!.version!);

    const currentRegistrationStatus = ouRegisteredInControlTower?.statusSummary?.status;
    const currentBaselineVersion = ouRegisteredInControlTower?.baselineVersion;

    if (defaultProps.dryRun) {
      return this.getDryRunResponse({
        moduleName: defaultProps.moduleName,
        operation: props.operation,
        ouName,
        isRegistered: ouRegisteredInControlTower !== undefined,
        landingZoneIdentifier,
        ouId,
        currentRegistrationStatus,
        currentBaselineVersion,
        baselineVersion,
      });
    }

    if (!ouId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Organizations organizational unit (OU) "${ouName}" not found.`,
      );
    }

    if (!ouArn) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Organizations organizational unit (OU) "${ouName}" not found to determine ou arn.`,
      );
    }

    if (!landingZoneIdentifier) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Control Tower Landing Zone not found in the region "${props.region}".`,
      );
    }

    if (!landingZoneDetails) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZone API did not return LandingZone details.`);
    }

    if (!baselineVersion) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: GetLandingZone API did not return LandingZone details to determine the baseline version.`,
      );
    }

    if (!awsControlTowerBaselineIdentifier) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListBaselines api did not returned AWSControlTowerBaseline identifier.`,
      );
    }

    if (landingZoneDetails.enableIdentityCenterAccess && !identityCenterBaselineIdentifier) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found in enabledBaselines returned by ListEnabledBaselines api.`,
      );
    }

    if (currentRegistrationStatus === EnablementStatus.FAILED) {
      const message = `AWS Organizations organizational unit (OU) "${ouName}" is already registered with AWS Control Tower, registration status is "${currentRegistrationStatus}", accelerator will skip the registration process, review and fix the registration status from console.`;
      this.logger.warn(message);
      return message;
    }

    if (ouRegisteredInControlTower && currentBaselineVersion !== baselineVersion) {
      const message = `AWS Organizations organizational unit (OU) "${ouName}" is already registered with AWS Control Tower, but the baseline version is "${currentBaselineVersion}" which is different from expected baseline version "${baselineVersion}" and registration status is "${currentRegistrationStatus}", update baseline is required for OU, perform update baseline from console.`;
      this.logger.warn(message);
      return message;
    }

    const parameters: EnabledBaselineParameter[] = [];

    parameters.push({
      key: 'IdentityCenterEnabledBaselineArn',
      value: identityCenterBaselineIdentifier,
    });

    if (!ouRegisteredInControlTower) {
      return await this.registerOuWithControlTower(
        client,
        ouName,
        ouArn,
        baselineVersion,
        awsControlTowerBaselineIdentifier,
        parameters,
      );
    }

    const message = `AWS Organizations organizational unit (OU) "${ouName}" is already registered with AWS Control Tower, registration status is "${currentRegistrationStatus}" and baseline version is "${currentBaselineVersion}", operation skipped.`;

    this.logger.warn(message);
    return message;
  }

  /**
   * Function to register OU with AWS Control Tower
   * @param client {@link ControlTowerClient}
   * @param ouName string
   * @param ouArn string
   * @param baselineVersion string
   * @param awsControlTowerBaselineIdentifier string
   * @param parameters {@link EnabledBaselineParameter}[]
   * @returns string
   */
  private async registerOuWithControlTower(
    client: ControlTowerClient,
    ouName: string,
    ouArn: string,
    baselineVersion: string,
    awsControlTowerBaselineIdentifier: string,
    parameters: EnabledBaselineParameter[],
  ): Promise<string> {
    this.logger.info(`Registering AWS Organizations organizational unit (OU) "${ouName}" with AWS Control Tower.`);

    const response = await throttlingBackOff(() =>
      client.send(
        new EnableBaselineCommand({
          baselineIdentifier: awsControlTowerBaselineIdentifier,
          baselineVersion: baselineVersion,
          targetIdentifier: ouArn,
          parameters,
        }),
      ),
    );

    if (!response.operationIdentifier) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}:  EnableBaseline api did not return operationIdentifier property while registering AWS Organizations organizational unit (OU) "${ouName}".`,
      );
    }

    await this.waitUntilBaselineCompletes(client, ouName, ouArn, response.operationIdentifier);

    const status = `Registration of AWS Organizations organizational unit (OU) "${ouName}" with AWS Control Tower is successful.`;

    this.logger.info(status);
    return status;
  }

  /**
   * Function to check and wait till the AWS Organizations organizational unit registration completion.
   * @param client {@link ControlTowerClient}
   * @param ouName string
   * @param ouArn string
   * @param operationIdentifier string
   */
  private async waitUntilBaselineCompletes(
    client: ControlTowerClient,
    ouName: string,
    ouArn: string,
    operationIdentifier: string,
  ): Promise<void> {
    const queryIntervalInMinutes = 2;
    const timeoutInMinutes = 60;
    let elapsedInMinutes = 0;

    await delay(2);
    let status = await this.getBaselineOperationStatus(client, ouArn, operationIdentifier);

    while (status !== BaselineOperationStatus.SUCCEEDED) {
      await delay(queryIntervalInMinutes);
      status = await this.getBaselineOperationStatus(client, ouArn, operationIdentifier);
      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Organizations organizational unit "${ouName}" baseline operation took more than ${timeoutInMinutes} minutes. Pipeline aborted, please review AWS Control Tower console to make sure organization unit registration completes.`,
        );
      }
      this.logger.info(
        `AWS Organizations organizational unit "${ouName}" baseline operation with identifier "${operationIdentifier}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }
  }

  /**
   * Function to get the AWS Organizations organizational unit baseline operation status
   * @param client {@link ControlTowerClient}
   * @param ouId string
   * @param operationIdentifier string
   * @returns operationStatus {@link BaselineOperationStatus}
   */
  private async getBaselineOperationStatus(
    client: ControlTowerClient,
    ouId: string,
    operationIdentifier: string,
  ): Promise<BaselineOperationStatus> {
    const response = await throttlingBackOff(() =>
      client.send(new GetBaselineOperationCommand({ operationIdentifier })),
    );

    const operationStatus = response.baselineOperation?.status;

    if (!operationStatus) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone GetBaselineOperation api did not return operationStatus property.`,
      );
    }

    if (operationStatus === BaselineOperationStatus.FAILED) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Organizations organizational unit "${ouId}" baseline operation with identifier "${operationIdentifier}" in "${operationStatus}" state. Investigate baseline operation before executing pipeline.`,
      );
    }

    return operationStatus;
  }

  /**
   * Function to get enabled baselines
   * @param client {@link ControlTowerClient}
   * @returns enabledBaselines {@link EnabledBaselineSummary}[]
   */
  private async getEnabledBaselines(client: ControlTowerClient): Promise<EnabledBaselineSummary[]> {
    const enabledBaselines: EnabledBaselineSummary[] = [];
    const paginator = paginateListEnabledBaselines({ client }, {});
    for await (const page of paginator) {
      for (const enabledBaseline of page.enabledBaselines ?? []) {
        enabledBaselines.push(enabledBaseline);
      }
    }

    return enabledBaselines;
  }

  /**
   * Function to get available AWS Control Tower baselines
   * @param client {@link ControlTowerClient}
   * @returns baselines {@link BaselineSummary}[]
   */
  private async getAvailableControlTowerBaselines(client: ControlTowerClient): Promise<BaselineSummary[]> {
    const baselines: BaselineSummary[] = [];
    const paginator = paginateListBaselines({ client }, {});
    for await (const page of paginator) {
      for (const baseline of page.baselines ?? []) {
        baselines.push(baseline);
      }
    }

    return baselines;
  }

  /**
   * Function to get IdentityCenterBaselineIdentifier
   * @param baselines {@link BaselineSummary}[]
   * @param enabledBaselines {@link EnabledBaselineSummary}[]
   * @returns string | undefined
   */
  private async getIdentityCenterBaselineIdentifier(
    baselines: BaselineSummary[],
    enabledBaselines: EnabledBaselineSummary[],
  ): Promise<string | undefined> {
    const baseline = baselines.find(item => item.name!.toLowerCase() === 'IdentityCenterBaseline'.toLowerCase());

    if (baseline) {
      const enabledBaseline = enabledBaselines.find(item => item.baselineIdentifier === baseline.arn);

      if (enabledBaseline) {
        return enabledBaseline.arn!;
      }
    }

    return undefined;
  }

  /**
   * Function to get dry run response
   * @param props
   * @returns string
   */
  private getDryRunResponse(props: {
    moduleName: string;
    operation: string;
    ouName: string;
    isRegistered: boolean;
    landingZoneIdentifier?: string;
    ouId?: string;
    currentRegistrationStatus?: EnablementStatus;
    currentBaselineVersion?: string;
    baselineVersion?: string;
  }): string {
    if (!props.landingZoneIdentifier) {
      return generateDryRunResponse(
        props.moduleName,
        props.operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason the environment does not have AWS Control Tower Landing Zone configured.`,
      );
    }

    if (!props.ouId) {
      return generateDryRunResponse(
        props.moduleName,
        props.operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason organizational unit "${props.ouName}" not found.`,
      );
    }

    if (!props.isRegistered) {
      return generateDryRunResponse(
        props.moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${props.ouName}" is not registered with AWS Control Tower accelerator will register the OU with AWS Control Tower.`,
      );
    }

    if (props.currentRegistrationStatus === EnablementStatus.FAILED) {
      return generateDryRunResponse(
        props.moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${props.ouName}" is already registered with AWS Control Tower, registration status is "${props.currentRegistrationStatus}", accelerator will skip the registration process, review and fix the registration status from console.`,
      );
    }

    if (props.currentBaselineVersion !== props.baselineVersion) {
      return generateDryRunResponse(
        props.moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${props.ouName}" is already registered with AWS Control Tower, but the baseline version is "${props.currentBaselineVersion}" which is different from expected baseline version "${props.baselineVersion}" and registration status is "${props.currentRegistrationStatus}", baseline update is required, review the upgrade from console. Baseline version compatibility metrics can be found here https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html`,
      );
    }

    return generateDryRunResponse(
      props.moduleName,
      props.operation,
      `AWS Organizations organizational unit (OU) "${props.ouName}" is already registered with AWS Control Tower, registration status is "${props.currentRegistrationStatus}", accelerator will skip the registration process.`,
    );
  }

  /**
   * Function to get baseline version based on AWS Control Tower Landing Zone version
   *
   * @remarks
   * Baseline version compatibility information can be found [here](https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html)
   * @param landingZoneVersion string
   * @returns baselineVersion string
   */
  private getBaselineVersion(landingZoneVersion: string): string {
    const landingZoneVersionSet1 = ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'];
    const landingZoneVersionSet2 = ['2.8', '2.9'];
    const landingZoneVersionSet3 = ['3.0', '3.1'];

    const baselineVersion = '4.0';

    if (landingZoneVersionSet1.includes(landingZoneVersion)) {
      return '1.0';
    }
    if (landingZoneVersionSet2.includes(landingZoneVersion)) {
      return '2.0';
    }
    if (landingZoneVersionSet3.includes(landingZoneVersion)) {
      return '3.0';
    }

    return baselineVersion;
  }
}

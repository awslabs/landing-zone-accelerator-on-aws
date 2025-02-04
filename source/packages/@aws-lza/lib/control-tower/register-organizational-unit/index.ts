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

export class RegisterOrganizationalUnitModule implements IRegisterOrganizationalUnitModule {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

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
    const ouId = this.getOuId(props.configuration.ouArn);

    const client = new ControlTowerClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const landingZoneIdentifier = await getLandingZoneIdentifier(client);

    if (defaultProps.dryRun && !landingZoneIdentifier) {
      return this.getDryRunResponse(defaultProps.moduleName, props, ouId, landingZoneIdentifier);
    }

    if (!landingZoneIdentifier) {
      throw new Error(`Error: AWS Control Tower Landing Zone not found in the region "${props.region}".`);
    }

    const landingZoneDetails = await getLandingZoneDetails(client, props.region, landingZoneIdentifier);

    const enabledBaselines: EnabledBaselineSummary[] = await this.getEnabledBaselines(client);

    const ouRegisteredInControlTower = enabledBaselines.find(
      item => item.targetIdentifier!.toLowerCase() === props.configuration.ouArn.toLowerCase(),
    );

    const availableControlTowerBaselines = await this.getAvailableControlTowerBaselines(client);

    const awsControlTowerBaselineIdentifier = availableControlTowerBaselines.find(
      item => item.name!.toLowerCase() === 'AWSControlTowerBaseline'.toLowerCase(),
    )?.arn;

    if (!awsControlTowerBaselineIdentifier) {
      throw new Error(
        `Internal Error: AWSControlTowerBaseline identifier not found in available Control Tower baselines returned by ListBaselines api.`,
      );
    }

    const identityCenterBaselineIdentifier = await this.getIdentityCenterBaselineIdentifier(
      availableControlTowerBaselines,
      enabledBaselines,
    );

    if (landingZoneDetails!.enableIdentityCenterAccess && !identityCenterBaselineIdentifier) {
      throw new Error(
        `Internal Error: AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found in enabled baselines returned by ListEnabledBaselines api.`,
      );
    }

    const parameters: EnabledBaselineParameter[] = [];

    parameters.push({
      key: 'IdentityCenterEnabledBaselineArn',
      value: identityCenterBaselineIdentifier,
    });

    const baselineVersion = this.getBaselineVersion(landingZoneDetails!.version!);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props,
        ouId,
        landingZoneIdentifier,
        baselineVersion,
        ouRegisteredInControlTower,
      );
    }

    if (!ouRegisteredInControlTower) {
      return await this.registerOuWithControlTower(
        client,
        props,
        ouId,
        baselineVersion,
        awsControlTowerBaselineIdentifier,
        parameters,
      );
    }

    const existingRegistrationStatus = ouRegisteredInControlTower.statusSummary!.status!;
    const existingBaselineVersion = ouRegisteredInControlTower.baselineVersion!;

    if (existingRegistrationStatus === EnablementStatus.FAILED) {
      RegisterOrganizationalUnitModule.logger.warn(
        `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, registration status is ${existingRegistrationStatus}, starting registration process.`,
      );
      return await this.registerOuWithControlTower(
        client,
        props,
        ouId,
        baselineVersion,
        awsControlTowerBaselineIdentifier,
        parameters,
      );
    }

    if (existingBaselineVersion !== baselineVersion) {
      const message = `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, but the baseline version is ${
        ouRegisteredInControlTower!.baselineVersion
      } which is different from expected baseline version ${baselineVersion} and registration status is ${existingRegistrationStatus}, update baseline is required for OU, perform update baseline from console.`;
      RegisterOrganizationalUnitModule.logger.warn(message);
      return message;
    }

    const message = `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, registration status is ${existingRegistrationStatus} and baseline version is ${existingBaselineVersion}, operation skipped.`;

    RegisterOrganizationalUnitModule.logger.warn(message);
    return message;
  }

  /**
   * Function to register OU with AWS Control Tower
   * @param client {@link ControlTowerClient}
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   * @param ouId string
   * @param baselineVersion string
   * @param awsControlTowerBaselineIdentifier string
   * @param parameters {@link EnabledBaselineParameter}[]
   * @returns string
   */
  private async registerOuWithControlTower(
    client: ControlTowerClient,
    props: IRegisterOrganizationalUnitHandlerParameter,
    ouId: string,
    baselineVersion: string,
    awsControlTowerBaselineIdentifier: string,
    parameters: EnabledBaselineParameter[],
  ): Promise<string> {
    RegisterOrganizationalUnitModule.logger.info(
      `Registering AWS Organizations organizational unit (OU) "${ouId}" with AWS Control Tower.`,
    );

    const response = await throttlingBackOff(() =>
      client.send(
        new EnableBaselineCommand({
          baselineIdentifier: awsControlTowerBaselineIdentifier,
          baselineVersion: baselineVersion,
          targetIdentifier: props.configuration.ouArn,
          parameters,
        }),
      ),
    );

    if (!response.operationIdentifier) {
      throw new Error(
        `Internal error: AWS Organizations organizational unit (OU) "${ouId}" EnableBaseline api didn't return operationIdentifier object.`,
      );
    }
    await this.waitUntilBaselineCompletes(client, ouId, response.operationIdentifier, props);

    const status = `Registration of AWS Organizations organizational unit (OU) "${ouId}" with AWS Control Tower is successful.`;

    RegisterOrganizationalUnitModule.logger.info(status);
    return status;
  }

  /**
   * Function to check and wait till the AWS Organizations organizational unit registration completion.
   * @param client {@link ControlTowerClient}
   * @param operationIdentifier string
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   */
  private async waitUntilBaselineCompletes(
    client: ControlTowerClient,
    ouId: string,
    operationIdentifier: string,
    props: IRegisterOrganizationalUnitHandlerParameter,
  ): Promise<void> {
    const queryIntervalInMinutes = 2;
    const timeoutInMinutes = 60;
    let elapsedInMinutes = 0;

    await delay(2);
    let status = await this.getBaselineOperationStatus(client, props.configuration.ouArn, operationIdentifier);

    while (status !== BaselineOperationStatus.SUCCEEDED) {
      await delay(queryIntervalInMinutes);
      status = await this.getBaselineOperationStatus(client, props.configuration.ouArn, operationIdentifier);
      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `AWS Organizations organizational unit "${ouId}" baseline operation took more than ${timeoutInMinutes} minutes. Pipeline aborted, please review AWS Control Tower console to make sure organization unit registration completes.`,
        );
      }
      RegisterOrganizationalUnitModule.logger.info(
        `AWS Organizations organizational unit "${ouId}" baseline operation with identifier "${operationIdentifier}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }
  }

  /**
   * Function to get the AWS Organizations organizational unit baseline operation status
   *
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
        `Internal Error: AWS Control Tower Landing Zone GetBaselineOperation api didn't return operation status.`,
      );
    }

    if (operationStatus === BaselineOperationStatus.FAILED) {
      throw new Error(
        `AWS Organizations organizational unit "${ouId}" baseline operation with identifier "${operationIdentifier}" in "${operationStatus}" state. Investigate baseline operation before executing pipeline.`,
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
   * @returns identifier string | undefined
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
   * @param moduleName string
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   * @param ouId string
   * @param landingZoneIdentifier string | undefined
   * @param baselineVersion string
   * @param enabledBaselineSummary {@link EnabledBaselineSummary}
   * @returns status string
   */
  private getDryRunResponse(
    moduleName: string,
    props: IRegisterOrganizationalUnitHandlerParameter,
    ouId: string,
    landingZoneIdentifier?: string,
    baselineVersion?: string,
    enabledBaselineSummary?: EnabledBaselineSummary,
  ): string {
    if (!landingZoneIdentifier) {
      return generateDryRunResponse(
        moduleName,
        props.operation,
        `Will experience error because the environment does not have AWS Control Tower Landing Zone.`,
      );
    }

    if (!enabledBaselineSummary) {
      return generateDryRunResponse(
        moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${ouId}" is not registered with AWS Control Tower accelerator will register the OU with AWS Control Tower.`,
      );
    }
    const existingRegistrationStatus = enabledBaselineSummary.statusSummary!.status!;
    const existingBaselineVersion = enabledBaselineSummary.baselineVersion!;

    if (existingRegistrationStatus === EnablementStatus.FAILED) {
      return generateDryRunResponse(
        moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, registration status is ${existingRegistrationStatus}, accelerator will try to re-register the OU.`,
      );
    }

    if (existingBaselineVersion !== baselineVersion) {
      return generateDryRunResponse(
        moduleName,
        props.operation,
        `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, but the baseline version is ${existingBaselineVersion} which is different from expected baseline version ${baselineVersion} and registration status is ${existingRegistrationStatus}, manual baseline update is required. Baseline version compatibility metrics can be found here https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      props.operation,
      `AWS Organizations organizational unit (OU) "${ouId}" is already registered with AWS Control Tower, registration status is ${existingRegistrationStatus}, accelerator will skip the registration process.`,
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

  /**
   * Function to get OU id from ouArn
   * @param ouArn string
   * @returns string
   */
  private getOuId(ouArn: string): string {
    return ouArn.split('/').pop()!;
  }
}

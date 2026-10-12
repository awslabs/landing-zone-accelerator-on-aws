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
import {
  createStatusLogger,
  getOrganizationalUnitsDetail,
  IRegisterOrganizationalUnitHandlerParameter,
  registerOrganizationalUnit,
  getParametersValue,
  setRetryStrategy,
  throttlingBackOff,
} from '../../../../../@aws-lza/index';
import {
  ServiceCatalogClient,
  paginateListPortfolios,
  AssociatePrincipalWithPortfolioCommand,
  PrincipalType,
} from '@aws-sdk/client-service-catalog';
import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * An abstract class to manage register AWS Organizations Organizational Unit (OU) with AWS Control Tower module
 */
export abstract class RegisterOrganizationalUnitModule {
  /**
   * Function to invoke register AWS Organizations Organizational Unit (OU) with AWS Control Tower module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams): Promise<string> {
    if (!params.moduleRunnerParameters.configs.globalConfig.controlTower.enable) {
      return `Module "${params.moduleItem.name}" execution skipped, Control Tower Landing zone is not enabled for the environment.`;
    }

    statusLogger.info(`Executing "${params.moduleItem.name}" module.`);

    // Associate current IAM role with Control Tower Account Factory portfolio (best-effort)
    await RegisterOrganizationalUnitModule.associateCallerWithControlTowerPortfolio(params);

    // Get SSM parameter to check if governed regions were updated
    const governRegionsUpdatedParamName =
      params.moduleRunnerParameters.resourcePrefixes.ssmParamName + '/control-tower/govern-regions-updated';

    let reregisterOu = false;
    try {
      const ssmParameters = await getParametersValue(
        [governRegionsUpdatedParamName],
        params.moduleRunnerParameters.configs.globalConfig.homeRegion,
        'RegisterOrganizationalUnitModule',
        undefined,
        params.runnerParameters.solutionId,
        params.moduleRunnerParameters.managementAccountCredentials,
        { [governRegionsUpdatedParamName]: 'false' }, // Default when parameter doesn't exist yet — expected on first run
      );

      const governRegionsUpdatedParam = ssmParameters.find(p => p.Name === governRegionsUpdatedParamName);
      if (governRegionsUpdatedParam?.Value === 'true') {
        statusLogger.info('Governed regions were updated, will re-register organizational units.');
        reregisterOu = true;
      } else {
        statusLogger.info('No governed regions update detected, skipping OU re-registration.');
      }
    } catch (error) {
      statusLogger.warn(
        `Failed to read SSM parameter ${governRegionsUpdatedParamName}. Defaulting reregisterOu to false. This is a non-critical error and will not affect core functionality. Error: ${error}`,
      );
    }

    const securityOuName = params.moduleRunnerParameters.configs.accountsConfig.getAuditAccount().organizationalUnit;

    const organizationalUnitsDetail = await getOrganizationalUnitsDetail({
      moduleName: params.moduleItem.name,
      operation: 'get-organizational-units-detail',
      partition: params.runnerParameters.partition,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      useExistingRole: params.runnerParameters.useExistingRoles,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        enableControlTower: params.moduleRunnerParameters.configs.globalConfig.controlTower.enable,
      },
    });

    const unregisteredOrganizationalUnits =
      params.moduleRunnerParameters.configs.organizationConfig.organizationalUnits.filter(
        item =>
          item.name !== securityOuName &&
          (organizationalUnitsDetail.some(
            ouDetail => ouDetail.completePath === item.name && !ouDetail.registeredwithControlTower,
          ) ||
            reregisterOu),
      );

    // Sort organizational units by hierarchy depth
    const sortedOrganizationalUnits = [...unregisteredOrganizationalUnits]
      .filter(ou => !ou.ignore)
      .sort((a, b) => {
        const depthA = a.name.split('/').length;
        const depthB = b.name.split('/').length;

        if (depthA === depthB) {
          return a.name.localeCompare(b.name);
        }

        return depthA - depthB;
      });

    if (sortedOrganizationalUnits.length === 0) {
      return `Skipping "${params.moduleItem.name}" because all organizational units found in configuration file are already registered with AWS ControlTower.`;
    }

    const statuses: string[] = [];
    for (const organizationalUnit of sortedOrganizationalUnits) {
      const param: IRegisterOrganizationalUnitHandlerParameter = {
        moduleName: params.moduleItem.name,
        operation: 'register-organizational-unit',
        partition: params.runnerParameters.partition,
        region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
        useExistingRole: params.runnerParameters.useExistingRoles,
        solutionId: params.runnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
        dryRun: params.runnerParameters.dryRun,
        configuration: {
          name: organizationalUnit.name,
          reregisterOu: reregisterOu,
        },
      };
      statusLogger.info(`Executing "${params.moduleItem.name}" module for ${organizationalUnit.name} OU.`);
      statuses.push(await registerOrganizationalUnit(param));
    }

    // Reset the SSM parameter to false after processing all OUs
    if (reregisterOu) {
      const ssmClient = new SSMClient({
        region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
        customUserAgent: params.runnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
      });

      await ssmClient.send(
        new PutParameterCommand({
          Name: governRegionsUpdatedParamName,
          Value: 'false',
          Type: 'String',
          Description: 'Indicates that Control Tower governed regions have been updated',
          Overwrite: true,
        }),
      );
      statusLogger.info(`Reset SSM parameter ${governRegionsUpdatedParamName} to false after re-registering OUs.`);
    }

    return `Module "${params.moduleItem.name}" completed successfully with status ${statuses.join('\n')}`;
  }

  /**
   * Associate the current IAM role with the AWS Control Tower Account Factory portfolio.
   *
   * @remarks
   * This is a best-effort operation. If the portfolio is not found or the association fails,
   * a warning is logged and execution continues without throwing. Skipped in the aws-eusc partition, where
   * AWS Control Tower does not create an Account Factory portfolio.
   *
   * @param params {@link ModuleParams}
   */
  private static async associateCallerWithControlTowerPortfolio(params: ModuleParams): Promise<void> {
    // AWS Service Catalog, and with it the Account Factory portfolio, is not available in the aws-eusc partition
    if (params.runnerParameters.partition === 'aws-eusc') {
      statusLogger.info(
        `AWS Service Catalog is not available in partition ${params.runnerParameters.partition}, skipping Control Tower portfolio association.`,
      );
      return;
    }

    try {
      const homeRegion = params.moduleRunnerParameters.configs.globalConfig.homeRegion;
      const credentials = params.moduleRunnerParameters.managementAccountCredentials;
      const solutionId = params.runnerParameters.solutionId;

      const stsClient = new STSClient({
        region: homeRegion,
        customUserAgent: solutionId,
        retryStrategy: setRetryStrategy(),
        credentials,
      });

      const serviceCatalogClient = new ServiceCatalogClient({
        region: homeRegion,
        customUserAgent: solutionId,
        retryStrategy: setRetryStrategy(),
        credentials,
      });

      const callerIdentity = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
      const callerArn = callerIdentity.Arn;

      if (!callerArn) {
        statusLogger.warn('Unable to determine caller identity ARN, skipping Control Tower portfolio association.');
        return;
      }

      // Convert assumed-role ARN to IAM role ARN
      let roleArn = callerArn;
      const assumedRoleMatch = callerArn.match(/^arn:[^:]+:sts::(\d+):assumed-role\/([^/]+)\/.+$/);
      if (assumedRoleMatch) {
        roleArn = `arn:${params.runnerParameters.partition}:iam::${assumedRoleMatch[1]}:role/${assumedRoleMatch[2]}`;
      }

      // Find the Control Tower Account Factory portfolio
      let portfolioId: string | undefined;
      const paginator = paginateListPortfolios({ client: serviceCatalogClient }, {});
      for await (const page of paginator) {
        const portfolio = (page.PortfolioDetails ?? []).find(
          item => item.DisplayName === 'AWS Control Tower Account Factory Portfolio',
        );
        if (portfolio?.Id) {
          portfolioId = portfolio.Id;
          break;
        }
      }

      if (!portfolioId) {
        statusLogger.warn('AWS Control Tower Account Factory Portfolio not found, skipping portfolio association.');
        return;
      }

      statusLogger.info(
        `Associating IAM role "${roleArn}" with AWS Control Tower Account Factory Portfolio "${portfolioId}".`,
      );
      await throttlingBackOff(() =>
        serviceCatalogClient.send(
          new AssociatePrincipalWithPortfolioCommand({
            PortfolioId: portfolioId,
            PrincipalARN: roleArn,
            PrincipalType: PrincipalType.IAM,
          }),
        ),
      );
      statusLogger.info(`Successfully associated IAM role "${roleArn}" with Control Tower Account Factory Portfolio.`);
    } catch (error) {
      statusLogger.warn(
        `Failed to associate IAM role with Control Tower Account Factory Portfolio: ${error}. This is non-fatal, continuing execution anyway.`,
      );
    }
  }
}

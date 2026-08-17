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

/**
 * @fileoverview Amazon GuardDuty CLI Command Handler - Processes GuardDuty CLI commands and configuration
 *
 * Provides command handling and configuration validation for Amazon GuardDuty CLI operations.
 * Handles parameter parsing, configuration validation, and execution coordination for
 * GuardDuty setup and management across AWS Organizations.
 *
 * Key capabilities:
 * - CLI parameter parsing and validation
 * - GuardDuty configuration schema validation
 * - Session context management
 * - Error handling and user feedback
 * - Integration with GuardDuty module operations
 */

import { z } from 'zod';
import { DestinationType, FindingPublishingFrequency, OrgFeatureStatus } from '@aws-sdk/client-guardduty';

import { configureGuardDuty } from '../../../lib/guardduty/guardduty';
import {
  IGuardDutyConfiguration,
  IGuardDutyModuleRequest,
  IGuardDutyModuleResponse,
} from '../../../lib/guardduty/interfaces';
import { IModuleResponse } from '../../common/interfaces';
import {
  CliExecutionParameterType,
  ConfigurationObjectType,
  getConfig,
  getSessionDetailsFromArgs,
  logError,
  logErrorAndExit,
} from './root';

const baseProtectionSchema = z.object({
  enable: z.boolean(),
  excludedRegions: z.array(z.string()).optional(),
});

const guardDutyConfigSchema = z.object({
  enable: z.boolean(),
  accountAccessRoleName: z.string(),
  delegatedAdminAccountId: z.string(),
  autoEnableOrgMembers: z.enum(Object.keys(OrgFeatureStatus) as [string, ...string[]]),
  batchOperationSettings: z
    .object({
      maxConcurrentEnvironments: z.number().gt(0).optional(),
      operationTimeoutMs: z.number().gt(0).optional(),
    })
    .optional(),
  protectionsConfiguration: z
    .object({
      s3Protection: baseProtectionSchema,
      eksProtection: baseProtectionSchema.extend({ manageAgent: z.boolean().optional() }).optional(),
      ec2Protection: baseProtectionSchema.extend({ keepSnapshots: z.boolean() }).optional(),
      rdsProtection: baseProtectionSchema.optional(),
      lambdaProtection: baseProtectionSchema.optional(),
    })
    .optional(),
  exportFrequency: z.enum(Object.keys(FindingPublishingFrequency) as [string, ...string[]]).optional(),
  exportDestination: z
    .object({
      destinationArn: z.string(),
      kmsKeyArn: z.string(),
      destinationType: z.enum(Object.keys(DestinationType) as [string, ...string[]]),
      overrideExisting: z.boolean().optional(),
    })
    .optional(),
  enableKeepMalwareSnapshots: z.boolean().optional(),
  regionFilters: z
    .object({
      ignoredRegions: z.array(z.string()).optional(),
      disabledRegions: z.array(z.string()).optional(),
    })
    .optional(),
  boundary: z
    .object({
      regions: z.array(z.string()).optional(),
    })
    .optional(),
  dataSources: z
    .object({
      organizations: z
        .object({
          tableName: z.string(),
          filters: z.array(z.any()).optional(),
          filterOperator: z.enum(['AND', 'OR']).optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Abstract command handler class for Amazon GuardDuty CLI operations
 */
export abstract class GuardDutyCommand {
  /**
   * Executes the GuardDuty configuration command with validated parameters
   * @param param - CLI execution parameters
   * @returns Promise resolving to GuardDuty module response
   */
  public static async execute(param: CliExecutionParameterType): Promise<IModuleResponse<IGuardDutyModuleResponse>> {
    return configureGuardDuty(await GuardDutyCommand.getParams(param));
  }

  /**
   * Parses and validates CLI parameters to create GuardDuty module request
   * @param param - CLI execution parameters
   * @returns Promise resolving to validated GuardDuty module request
   */
  public static async getParams(param: CliExecutionParameterType): Promise<IGuardDutyModuleRequest> {
    if (typeof param.args['configuration'] !== 'string') {
      logErrorAndExit(
        'An error occurred (MissingRequiredParameters): The configuration parameter is a required string',
      );
    }

    const config = getConfig(param.args['configuration']);
    if (!GuardDutyCommand.validConfig(config)) {
      process.exit(1);
    }

    // Get current session details
    const currentSessionDetails = await getSessionDetailsFromArgs(param);

    return {
      ...currentSessionDetails,
      moduleName: param.moduleName,
      operation: param.commandName,
      dryRun: param.args['dry-run'] as boolean,
      configuration: {
        accountAccessRoleName: config['accountAccessRoleName'],
        enable: config['enable'],
        delegatedAdminAccountId: config['delegatedAdminAccountId'],
        autoEnableOrgMembers: config['autoEnableOrgMembers'],
        batchOperationSettings: config['batchOperationSettings'],
        ...(config['protectionsConfiguration'] && { protectionsConfiguration: config['protectionsConfiguration'] }),
        ...(config['exportFrequency'] && { exportFrequency: config['exportFrequency'] }),
        ...(config['exportDestination'] && { exportDestination: config['exportDestination'] }),
        ...(config['enableKeepMalwareSnapshots'] !== undefined && {
          enableKeepMalwareSnapshots: config['enableKeepMalwareSnapshots'],
        }),
        ...(config['regionFilters'] && { regionFilters: config['regionFilters'] }),
        ...(config['boundary'] && { boundary: config['boundary'] }),
        ...(config['dataSources'] && { dataSources: config['dataSources'] }),
      },
    };
  }

  /**
   * Validates GuardDuty configuration object against required schema
   * @param config - Configuration object to validate
   * @returns Type guard indicating if config is valid IGuardDutyConfiguration
   */
  public static validConfig(config: ConfigurationObjectType): config is IGuardDutyConfiguration {
    const result = guardDutyConfigSchema.safeParse(config);
    if (!result.success) {
      const issue = result.error.issues[0];
      logError(`(ConfigValidation): config.${issue.path.join('.')}: ${issue.message}`);
      return false;
    }
    return true;
  }
}

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
import { createLogger } from '../common/logger';
import { SecurityHubManageOrganizationAdminModule } from '../lib/security-hub/manage-organization-admin';
import { SecurityHubManageAutomationRulesModule } from '../lib/security-hub/manage-automation-rules';
import { ISecurityHubManageOrganizationAdminParameter } from '../interfaces/security-hub/manage-organization-admin';
import { ISecurityHubManageAutomationRulesParameter } from '../interfaces/security-hub/manage-automation-rules';

process.on('uncaughtException', err => {
  throw err;
});

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Security Hub organization admin
 * @param input {@link ISecurityHubManageOrganizationAdminParameter}
 * @returns string
 *
 * @description
 * Use this function to manage the organization's Security Hub admin
 *
 * @example
 * ```
 * const param: ISecurityHubManageOrganizationAdminParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     enable: true,
 *     accountId: 'XXXXXXXXXXXX',
 *   },
 *   operation: 'manage-organization-admin',
 *   dryRun: true,
 *   solutionId: 'test',
 * };
 * ```
 */
export async function manageSecurityHubOrganizationAdminAccount(
  input: ISecurityHubManageOrganizationAdminParameter,
): Promise<string> {
  try {
    return await new SecurityHubManageOrganizationAdminModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

/**
 * Function to manage Security Hub automation rules
 * @param input {@link ISecurityHubManageAutomationRulesParameter}
 * @returns string
 *
 * @description
 * Use this function to manage Security Hub automation rules that automatically update findings based on specified criteria.
 * Automation rules help streamline security operations by automatically suppressing, updating, or enriching findings.
 *
 * @example
 * ```
 * const param: ISecurityHubManageAutomationRulesParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     automationRules: [
 *       {
 *         name: 'SuppressLowSeverityFindings',
 *         description: 'Automatically suppress low severity findings',
 *         enabled: true,
 *         ruleOrder: 1,
 *         isTerminal: false,
 *         actions: [
 *           {
 *             type: 'FINDING_FIELDS_UPDATE',
 *             findingFieldsUpdate: {
 *               severityLabel: 'LOW',
 *               workflowStatus: 'SUPPRESSED',
 *               verificationState: 'FALSE_POSITIVE',
 *               confidence: 85,
 *               criticality: 50,
 *               types: ['Software and Configuration Checks'],
 *               userDefinedFields: { 'custom-field': 'custom-value' },
 *               note: {
 *                 text: 'Automatically suppressed by automation rule',
 *                 updatedBy: 'SecurityTeam'
 *               },
 *               relatedFindings: [
 *                 {
 *                   productArn: 'arn:aws:securityhub:us-east-1::product/aws/securityhub',
 *                   id: 'related-finding-id'
 *                 }
 *               ]
 *             }
 *           }
 *         ],
 *         criteria: [
 *           {
 *             key: 'SeverityLabel',
 *             filter: [
 *               {
 *                 value: 'LOW',
 *                 comparison: 'EQUALS'
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   },
 *   operation: 'manage-automation-rules',
 *   dryRun: false,
 *   solutionId: 'test',
 * };
 * ```
 */
export async function manageSecurityHubAutomationRules(
  input: ISecurityHubManageAutomationRulesParameter,
): Promise<string> {
  try {
    return (await new SecurityHubManageAutomationRulesModule().handler(input)).message;
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

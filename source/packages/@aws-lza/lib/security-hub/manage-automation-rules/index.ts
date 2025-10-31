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
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { createLogger } from '../../../common/logger';
import { AcceleratorModuleName } from '../../../common/resources';
import { ModuleHandlerReturnType } from '../../../common/types';
import {
  ISecurityHubAutomationRuleConfig,
  ISecurityHubAutomationRuleAction,
  ISecurityHubAutomationRuleCriteria,
  ISecurityHubManageAutomationRulesConfiguration,
  ISecurityHubManageAutomationRulesModule,
  ISecurityHubManageAutomationRulesParameter,
} from '../../../interfaces/security-hub/manage-automation-rules';
import {
  AutomationRulesAction,
  AutomationRulesActionType,
  AutomationRulesFindingFilters,
  CreateAutomationRuleCommand,
  BatchDeleteAutomationRulesCommand,
  ListAutomationRulesCommand,
  SecurityHubClient,
  BatchUpdateAutomationRulesCommand,
  AutomationRulesMetadata,
  RuleStatus,
  SeverityLabel,
  VerificationState,
  WorkflowStatus,
} from '@aws-sdk/client-securityhub';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { throttlingBackOff } from '../../../common/throttle';

/**
 * SecurityHubManageAutomationRulesModule class to manage AWS Security Hub Automation Rules
 */
export class SecurityHubManageAutomationRulesModule implements ISecurityHubManageAutomationRulesModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage Security Hub Automation Rules
   *
   * @param props {@link ISecurityHubManageAutomationRulesParameter}
   * @returns Status message
   */
  public async handler(props: ISecurityHubManageAutomationRulesParameter): Promise<ModuleHandlerReturnType> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_SECURITY_HUB, props);
    const client = new SecurityHubClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const existingRules = await this.getExistingAutomationRules(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(defaultProps.moduleName, props.operation, props.configuration, existingRules);
    }

    return this.applyAutomationRulesConfiguration(client, props.configuration, existingRules);
  }

  /**
   * Function to simulate module operations
   *
   * @param moduleName Name of the module for logging
   * @param operation Operation type to simulate
   * @param config {@link ISecurityHubManageAutomationRulesConfiguration}
   * @param existingRules Currently configured automation rules
   * @returns Dry-run response message
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    config: ISecurityHubManageAutomationRulesConfiguration,
    existingRules: Map<string, AutomationRulesMetadata>,
  ): ModuleHandlerReturnType {
    const configuredRuleNames = new Set(config.automationRules.map(rule => rule.name));
    const rulesToCreate: string[] = [];
    const rulesToUpdate: string[] = [];
    const rulesToDelete: string[] = [];

    for (const rule of config.automationRules) {
      const existingRule = existingRules.get(rule.name);
      if (existingRule) {
        rulesToUpdate.push(rule.name);
      } else {
        rulesToCreate.push(rule.name);
      }
    }

    for (const [ruleName] of existingRules) {
      if (!configuredRuleNames.has(ruleName)) {
        rulesToDelete.push(ruleName);
      }
    }

    const messageParts: string[] = [];

    if (rulesToCreate.length > 0) {
      messageParts.push(`${rulesToCreate.join(', ')} will be created`);
    }

    if (rulesToUpdate.length > 0) {
      messageParts.push(`${rulesToUpdate.join(', ')} will be updated`);
    }

    if (rulesToDelete.length > 0) {
      messageParts.push(`${rulesToDelete.join(', ')} will be deleted`);
    }

    const message =
      messageParts.length === 0 ? 'No changes needed for Security Hub automation rules' : messageParts.join('\n');

    return {
      status: true,
      message: generateDryRunResponse(moduleName, operation, message),
    };
  }

  /**
   * Function to apply the desired Security Hub automation rules configuration by creating, updating, and deleting rules as needed
   *
   * @param client {@link SecurityHubClient}
   * @param config {@link ISecurityHubManageAutomationRulesConfiguration} - The desired automation rules configuration
   * @param existingRules Currently configured automation rules mapped by rule name
   * @returns Success message summarizing the operations performed
   */
  private async applyAutomationRulesConfiguration(
    client: SecurityHubClient,
    config: ISecurityHubManageAutomationRulesConfiguration,
    existingRules: Map<string, AutomationRulesMetadata>,
  ): Promise<ModuleHandlerReturnType> {
    const results: string[] = [];
    const configuredRuleNames = new Set(config.automationRules.map(rule => rule.name));

    // Separate rules into create and update batches
    const rulesToCreate: ISecurityHubAutomationRuleConfig[] = [];
    const rulesToUpdate: Array<{ config: ISecurityHubAutomationRuleConfig; arn: string }> = [];

    for (const rule of config.automationRules) {
      const existingRule = existingRules.get(rule.name);
      if (existingRule) {
        rulesToUpdate.push({ config: rule, arn: existingRule.RuleArn! });
      } else {
        rulesToCreate.push(rule);
      }
    }

    // Create rules in batches (no batch create command available, so process individually in batches)
    if (rulesToCreate.length > 0) {
      const result = await this.batchCreateAutomationRules(client, rulesToCreate);
      results.push(result);
    }

    if (rulesToUpdate.length > 0) {
      const result = await this.batchUpdateAutomationRules(client, rulesToUpdate);
      results.push(result);
    }

    const rulesToDeleteEntries = Array.from(existingRules.entries()).filter(
      ([ruleName]) => !configuredRuleNames.has(ruleName),
    );

    if (rulesToDeleteEntries.length > 0) {
      const ruleArns = rulesToDeleteEntries.map(([, ruleMetadata]) => ruleMetadata.RuleArn!);
      const ruleNames = rulesToDeleteEntries.map(([ruleName]) => ruleName);
      const result = await this.batchDeleteAutomationRules(client, ruleArns, ruleNames);
      results.push(result);
    }

    const message = results.length === 0 ? 'No changes needed for Security Hub automation rules' : results.join('; ');

    return {
      status: true,
      message,
    };
  }

  /**
   * Function to retrieve existing automation rules
   *
   * @param client {@link SecurityHubClient}
   * @returns Map of rule names to rule metadata
   */
  private async getExistingAutomationRules(client: SecurityHubClient): Promise<Map<string, AutomationRulesMetadata>> {
    const rules = new Map<string, AutomationRulesMetadata>();

    try {
      const response = await throttlingBackOff(() => client.send(new ListAutomationRulesCommand({})));

      if (response.AutomationRulesMetadata) {
        for (const rule of response.AutomationRulesMetadata) {
          if (rule.RuleName) {
            rules.set(rule.RuleName, rule);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${error.message}" error when listing automation rules`,
        );
      }
      throw error;
    }

    return rules;
  }

  /**
   * Function to batch create automation rules
   *
   * @param client {@link SecurityHubClient}
   * @param rulesToCreate Array of rule configurations to create
   * @param batchSize Batch size for processing (default: 50)
   * @returns Success message
   */
  private async batchCreateAutomationRules(
    client: SecurityHubClient,
    rulesToCreate: ISecurityHubAutomationRuleConfig[],
    batchSize: number = 50,
  ): Promise<string> {
    const createdRules: string[] = [];

    // Split rules into batches
    for (let i = 0; i < rulesToCreate.length; i += batchSize) {
      const batch = rulesToCreate.slice(i, i + batchSize);

      const batchPromises = batch.map(async ruleConfig => {
        const createRuleInput = {
          RuleName: ruleConfig.name,
          Description: ruleConfig.description,
          RuleStatus: ruleConfig.enabled ? RuleStatus.ENABLED : RuleStatus.DISABLED,
          RuleOrder: ruleConfig.ruleOrder || 1,
          IsTerminal: ruleConfig.isTerminal,
          Actions: ruleConfig.actions.map(action => this.convertAction(action)),
          Criteria: this.convertCriteria(ruleConfig.criteria),
        };

        try {
          await throttlingBackOff(() => client.send(new CreateAutomationRuleCommand(createRuleInput)));
          return ruleConfig.name;
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.logger.error(
              `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${error.message}" error when creating automation rule "${ruleConfig.name}"`,
            );
          }
          throw error;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      createdRules.push(...batchResults);
    }

    return `Successfully created automation rules: ${createdRules.join(', ')}`;
  }

  /**
   * Function to batch update automation rules
   *
   * @param client {@link SecurityHubClient}
   * @param rulesToUpdate Array of rules to update with their ARNs
   * @returns Success message
   */
  private async batchUpdateAutomationRules(
    client: SecurityHubClient,
    rulesToUpdate: Array<{ config: ISecurityHubAutomationRuleConfig; arn: string }>,
  ): Promise<string> {
    try {
      const updateItems = rulesToUpdate.map(({ config, arn }) => ({
        RuleArn: arn,
        RuleName: config.name,
        Description: config.description,
        RuleStatus: config.enabled ? RuleStatus.ENABLED : RuleStatus.DISABLED,
        RuleOrder: config.ruleOrder || 1,
        IsTerminal: config.isTerminal,
        Actions: config.actions.map(action => this.convertAction(action)),
        Criteria: this.convertCriteria(config.criteria),
      }));

      await throttlingBackOff(() =>
        client.send(
          new BatchUpdateAutomationRulesCommand({
            UpdateAutomationRulesRequestItems: updateItems,
          }),
        ),
      );

      const ruleNames = rulesToUpdate.map(({ config }) => config.name);
      return `Successfully updated automation rules: ${ruleNames.join(', ')}`;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${error.message}" error when batch updating automation rules`,
        );
      }
      throw error;
    }
  }

  /**
   * Function to batch delete automation rules
   *
   * @param client {@link SecurityHubClient}
   * @param ruleArns Array of rule ARNs to delete
   * @param ruleNames Array of rule names being deleted
   * @returns Success message
   */
  private async batchDeleteAutomationRules(
    client: SecurityHubClient,
    ruleArns: string[],
    ruleNames: string[],
  ): Promise<string> {
    try {
      await throttlingBackOff(() =>
        client.send(
          new BatchDeleteAutomationRulesCommand({
            AutomationRulesArns: ruleArns,
          }),
        ),
      );

      return `Successfully deleted automation rules: ${ruleNames.join(', ')}`;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${error.message}" error when batch deleting automation rules`,
        );
      }
      throw error;
    }
  }

  /**
   * Function to convert action configuration to AWS SDK format
   *
   * @param action {@link ISecurityHubAutomationRuleAction}
   * @returns {@link AutomationRulesAction}
   */
  private convertAction(action: ISecurityHubAutomationRuleAction): AutomationRulesAction {
    const automationAction: AutomationRulesAction = {
      Type: action.type as AutomationRulesActionType,
    };

    if (action.findingFieldsUpdate) {
      automationAction.FindingFieldsUpdate = {
        Note: action.findingFieldsUpdate.note
          ? {
              Text: action.findingFieldsUpdate.note.text,
              UpdatedBy: action.findingFieldsUpdate.note.updatedBy,
            }
          : undefined,
        Severity: action.findingFieldsUpdate.severityLabel
          ? { Label: action.findingFieldsUpdate.severityLabel as SeverityLabel }
          : undefined,
        VerificationState: action.findingFieldsUpdate.verificationState as VerificationState,
        Confidence: action.findingFieldsUpdate.confidence,
        Criticality: action.findingFieldsUpdate.criticality,
        Types: action.findingFieldsUpdate.types,
        UserDefinedFields: action.findingFieldsUpdate.userDefinedFields,
        Workflow: action.findingFieldsUpdate.workflowStatus
          ? { Status: action.findingFieldsUpdate.workflowStatus as WorkflowStatus }
          : undefined,
        RelatedFindings: action.findingFieldsUpdate.relatedFindings
          ? action.findingFieldsUpdate.relatedFindings.map(finding => ({
              ProductArn: finding.productArn,
              Id: finding.id,
            }))
          : undefined,
      };
    }

    return automationAction;
  }

  /**
   * Utility function to capitalize the first letter of a string
   *
   * @param str String to capitalize
   * @returns String with first letter capitalized
   */
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Function to convert an object's property names from camelCase to PascalCase for SDK
   *
   * @param obj Object to convert
   * @returns Object with PascalCase property names
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToPascalCase(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.convertToPascalCase(item));
    }

    if (typeof obj === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const pascalKey = this.capitalizeFirstLetter(key);
        converted[pascalKey] = this.convertToPascalCase(value);
      }
      return converted;
    }

    return obj;
  }

  /**
   * Function to convert criteria configuration to AWS SDK format
   *
   * @param criteria Array of criteria configurations
   * @returns {@link AutomationRulesFindingFilters}
   */
  private convertCriteria(criteria: ISecurityHubAutomationRuleCriteria[]): AutomationRulesFindingFilters {
    return criteria.reduce((filters, criterion) => {
      const key = criterion.key;
      const convertedFilter = this.convertToPascalCase(criterion.filter);
      return Object.assign(filters, { [key]: convertedFilter });
    }, {} as AutomationRulesFindingFilters);
  }
}

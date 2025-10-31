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

import { IModuleCommonParameter } from '../../common/resources';
import { ModuleHandlerReturnType } from '../../common/types';

/**
 * Security Hub automation rules string filter configuration
 */
export interface ISecurityHubAutomationRulesStringFilter {
  /**
   * The string value to filter on
   */
  readonly value: string;
  /**
   * The comparison operator to use
   */
  readonly comparison:
    | 'EQUALS'
    | 'PREFIX'
    | 'NOT_EQUALS'
    | 'PREFIX_NOT_EQUALS'
    | 'CONTAINS'
    | 'NOT_CONTAINS'
    | 'CONTAINS_WORD';
}

/**
 * Security Hub automation rules number filter configuration
 */
export interface ISecurityHubAutomationRulesNumberFilter {
  /**
   * Greater than or equal to
   */
  readonly gte?: number;
  /**
   * Less than or equal to
   */
  readonly lte?: number;
  /**
   * Greater than
   */
  readonly gt?: number;
  /**
   * Less than
   */
  readonly lt?: number;
  /**
   * Equal to
   */
  readonly eq?: number;
}

/**
 * Security Hub automation rules date filter configuration
 */
export interface ISecurityHubAutomationRulesDateFilter {
  /**
   * Start date
   */
  readonly start?: string;
  /**
   * End date
   */
  readonly end?: string;
  /**
   * Date range configuration
   */
  readonly dateRange?: {
    value: number;
    unit: 'DAYS';
  };
}

/**
 * Security Hub automation rules key-value filter configuration
 */
export interface ISecurityHubAutomationRulesKeyValueFilter {
  /**
   * The key to filter on
   */
  readonly key: string;
  /**
   * The value to filter on
   */
  readonly value: string;
  /**
   * The comparison operator to use
   */
  readonly comparison: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS';
}

/**
 * Security Hub automation rule note configuration
 */
export interface ISecurityHubAutomationRuleNote {
  /**
   * The note text
   */
  readonly text: string;
  /**
   * Who updated the note
   */
  readonly updatedBy: string;
}

/**
 * Security Hub automation rule related finding configuration
 */
export interface ISecurityHubAutomationRuleRelatedFinding {
  /**
   * The product ARN
   */
  readonly productArn: string;
  /**
   * The finding ID
   */
  readonly id: string;
}

/**
 * Security Hub automation rule finding fields update configuration for modifying finding attributes
 */
export interface ISecurityHubAutomationRuleFindingFieldsUpdate {
  /**
   * Note to add to the finding
   */
  readonly note?: ISecurityHubAutomationRuleNote;
  /**
   * Severity label to assign to the finding
   */
  readonly severityLabel?: string;
  /**
   * Verification state to assign to the finding
   */
  readonly verificationState?: string;
  /**
   * Confidence score to assign to the finding (0-100)
   */
  readonly confidence?: number;
  /**
   * Criticality score to assign to the finding (0-100)
   */
  readonly criticality?: number;
  /**
   * Types to assign to the finding
   */
  readonly types?: string[];
  /**
   * User-defined fields to assign to the finding
   */
  readonly userDefinedFields?: Record<string, string>;
  /**
   * Workflow status to assign to the finding
   */
  readonly workflowStatus?: string;
  /**
   * Related findings to link to this finding
   */
  readonly relatedFindings?: ISecurityHubAutomationRuleRelatedFinding[];
}

/**
 * Security Hub automation rule action configuration for defining what actions to take on matching findings
 */
export interface ISecurityHubAutomationRuleAction {
  /**
   * The type of action to perform
   */
  readonly type: string;
  /**
   * Finding fields to update when the action is triggered
   */
  readonly findingFieldsUpdate?: ISecurityHubAutomationRuleFindingFieldsUpdate;
}

/**
 * Security Hub automation rule criteria configuration with dynamic keys for flexible filtering
 * Supports any valid SecurityHub finding field as a key with appropriate filter arrays as values
 */
export interface ISecurityHubAutomationRuleCriteria {
  /**
   * The criteria key/field name
   */
  readonly key: string;
  /**
   * The filter to apply for this criteria
   */
  readonly filter:
    | ISecurityHubAutomationRulesStringFilter[]
    | ISecurityHubAutomationRulesNumberFilter[]
    | ISecurityHubAutomationRulesDateFilter[]
    | ISecurityHubAutomationRulesKeyValueFilter[];
}

/**
 * AWS Security Hub automation rule configuration
 *
 * @description
 * Use this configuration to define Security Hub automation rules that automatically update findings based on specified criteria.
 * Automation rules help streamline security operations by automatically suppressing, updating, or enriching findings.
 */
export interface ISecurityHubAutomationRuleConfig {
  /**
   * The name of the automation rule
   */
  readonly name: string;
  /**
   * A description of what the automation rule does
   */
  readonly description: string;
  /**
   * Whether the automation rule is enabled
   */
  readonly enabled: boolean;
  /**
   * The action to take when findings match the criteria
   */
  readonly actions: ISecurityHubAutomationRuleAction[];
  /**
   * The criteria that findings must match to trigger the action
   */
  readonly criteria: ISecurityHubAutomationRuleCriteria[];
  /**
   * An integer from 1 to 1000 that represents the order in which the rule action is applied to findings
   */
  readonly ruleOrder?: number;
  /**
   * Specifies whether a rule is the last to be applied with respect to a finding that matches the rule criteria
   */
  readonly isTerminal?: boolean;
  /**
   * List of regions to be excluded from applying this automation rule
   */
  readonly excludeRegions?: string[];
}

/**
 * AWS Security Hub Automation Rules Configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 * ```
 * {
 *   automationRules: [
 *     {
 *       name: "SuppressLowSeverityFindings",
 *       description: "Automatically suppress low severity findings",
 *       enabled: true,
 *       action: {
 *         type: "FINDING_FIELDS_UPDATE",
 *         findingFieldsUpdate: {
 *           workflowStatus: "SUPPRESSED",
 *           note: {
 *             text: "Automatically suppressed by automation rule",
 *             updatedBy: "SecurityTeam"
 *           }
 *         }
 *       },
 *       criteria: [
 *         {
 *           key: "SeverityLabel",
 *           filter: [
 *             {
 *               value: "LOW",
 *               comparison: "EQUALS"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
export interface ISecurityHubManageAutomationRulesConfiguration {
  /**
   * List of Security Hub automation rules to manage
   */
  readonly automationRules: ISecurityHubAutomationRuleConfig[];
}

/**
 * AWS Security Hub module handler parameter
 */
export interface ISecurityHubManageAutomationRulesParameter extends IModuleCommonParameter {
  /**
   * AWS Security Hub Automation Rules Configuration
   *
   * @example
   *
   * ```
   * {
   *   automationRules: [
   *     {
   *       name: "SuppressLowSeverityFindings",
   *       description: "Automatically suppress low severity findings",
   *       enabled: true,
   *       action: {
   *         type: "FINDING_FIELDS_UPDATE",
   *         findingFieldsUpdate: {
   *           workflowStatus: "SUPPRESSED"
   *         }
   *       },
   *       criteria: [
   *         {
   *           key: "SeverityLabel",
   *           filter: [
   *             {
   *               value: "LOW",
   *               comparison: "EQUALS"
   *             }
   *           ]
   *         }
   *       ]
   *     }
   *   ]
   * }
   * ```
   */
  readonly configuration: ISecurityHubManageAutomationRulesConfiguration;
}

/**
 * Security Hub Automation Rules Management
 */
export interface ISecurityHubManageAutomationRulesModule {
  /**
   * Handler function for Security Hub Automation Rules Configuration
   *
   * @param props {@link ISecurityHubManageAutomationRulesParameter}
   * @returns status string
   */
  handler(props: ISecurityHubManageAutomationRulesParameter): Promise<ModuleHandlerReturnType>;
}

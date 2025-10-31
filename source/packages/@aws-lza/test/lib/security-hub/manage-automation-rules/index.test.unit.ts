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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SecurityHubClient,
  CreateAutomationRuleCommand,
  BatchDeleteAutomationRulesCommand,
  ListAutomationRulesCommand,
  BatchUpdateAutomationRulesCommand,
  AutomationRulesMetadata,
  RuleStatus,
} from '@aws-sdk/client-securityhub';

import { SecurityHubManageAutomationRulesModule } from '../../../../lib/security-hub/manage-automation-rules';
import {
  ISecurityHubManageAutomationRulesParameter,
  ISecurityHubManageAutomationRulesConfiguration,
  ISecurityHubAutomationRuleConfig,
} from '../../../../interfaces/security-hub/manage-automation-rules';
import { MOCK_CONSTANTS } from '../../../mocked-resources';

vi.mock('@aws-sdk/client-securityhub', async () => {
  const actual = await vi.importActual('@aws-sdk/client-securityhub');

  return {
    ...actual,
    SecurityHubClient: vi.fn(),
    CreateAutomationRuleCommand: vi.fn(),
    BatchDeleteAutomationRulesCommand: vi.fn(),
    ListAutomationRulesCommand: vi.fn(),
    BatchUpdateAutomationRulesCommand: vi.fn(),
  };
});

describe('SecurityHubManageAutomationRulesModule', () => {
  const mockSend = vi.fn();
  const securityHubModule = new SecurityHubManageAutomationRulesModule();

  beforeEach(() => {
    vi.clearAllMocks();
    (SecurityHubClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  const mockAutomationRule: ISecurityHubAutomationRuleConfig = {
    name: 'TestRule',
    description: 'Test automation rule',
    enabled: true,
    ruleOrder: 1,
    isTerminal: false,
    actions: [
      {
        type: 'FINDING_FIELDS_UPDATE',
        findingFieldsUpdate: {
          severityLabel: 'LOW',
          verificationState: 'FALSE_POSITIVE',
          workflowStatus: 'SUPPRESSED',
          confidence: 85,
          criticality: 50,
          types: ['Software and Configuration Checks'],
          userDefinedFields: { 'custom-field': 'custom-value' },
          note: {
            text: 'Automatically suppressed by automation rule',
            updatedBy: 'SecurityTeam',
          },
          relatedFindings: [
            {
              productArn: 'arn:aws:securityhub:us-east-1::product/aws/securityhub',
              id: 'test-finding-id',
            },
          ],
        },
      },
    ],
    criteria: [
      {
        key: 'SeverityLabel',
        filter: [
          {
            value: 'LOW',
            comparison: 'EQUALS',
          },
        ],
      },
    ],
  };

  const mockAutomationRule2: ISecurityHubAutomationRuleConfig = {
    name: 'TestRule2',
    description: 'Test automation rule - 2',
    enabled: false,
    isTerminal: false,
    actions: [
      {
        type: 'FINDING_FIELDS_UPDATE',
        findingFieldsUpdate: {
          verificationState: 'FALSE_POSITIVE',
          workflowStatus: 'SUPPRESSED',
          confidence: 85,
          criticality: 50,
          types: ['Software and Configuration Checks'],
          userDefinedFields: { 'custom-field': 'custom-value' },
          note: {
            text: 'Automatically suppressed by automation rule',
            updatedBy: 'SecurityTeam',
          },
          relatedFindings: [
            {
              productArn: 'arn:aws:securityhub:us-east-1::product/aws/securityhub',
              id: 'test-finding-id',
            },
          ],
        },
      },
    ],
    criteria: [
      {
        key: 'SeverityLabel',
        filter: [
          {
            value: 'LOW',
            comparison: 'EQUALS',
          },
        ],
      },
      {
        key: 'CreatedAt',
        filter: [
          {
            start: new Date().toISOString(),
            dateRange: undefined,
          },
        ],
      },
    ],
  };

  const mockConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
    automationRules: [mockAutomationRule],
  };

  const mockProps: ISecurityHubManageAutomationRulesParameter = {
    configuration: mockConfiguration,
    ...MOCK_CONSTANTS.runnerParameters,
  };

  const mockExistingRule: AutomationRulesMetadata = {
    RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/test-rule-id',
    RuleName: 'TestRule',
    RuleOrder: 1,
    RuleStatus: RuleStatus.ENABLED,
    IsTerminal: false,
    Description: 'Test automation rule',
    CreatedAt: new Date(),
    UpdatedAt: new Date(),
    CreatedBy: 'test-user',
  };

  describe('handler', () => {
    it('should create new automation rules when none exist', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
      expect(ListAutomationRulesCommand).toHaveBeenCalledTimes(1);
      expect(CreateAutomationRuleCommand).toHaveBeenCalledTimes(1);
    });

    it('should update existing automation rules', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({
            AutomationRulesMetadata: [
              {
                ...mockExistingRule,
                RuleName: 'TestRule2',
              },
            ],
          });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const props: ISecurityHubManageAutomationRulesParameter = {
        configuration: {
          automationRules: [mockAutomationRule2],
        },
        ...MOCK_CONSTANTS.runnerParameters,
      };

      const result = await securityHubModule.handler(props);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully updated automation rules: TestRule2');
      expect(ListAutomationRulesCommand).toHaveBeenCalledTimes(1);
      expect(BatchUpdateAutomationRulesCommand).toHaveBeenCalledTimes(1);
    });

    it('should update existing automation rules with fallback value', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule] });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully updated automation rules: TestRule');
      expect(ListAutomationRulesCommand).toHaveBeenCalledTimes(1);
      expect(BatchUpdateAutomationRulesCommand).toHaveBeenCalledTimes(1);
    });

    it('should delete automation rules not in configuration', async () => {
      const extraRule: AutomationRulesMetadata = {
        ...mockExistingRule,
        RuleName: 'ExtraRule',
        RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/extra-rule',
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule, extraRule] });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.resolve({});
        }
        if (command instanceof BatchDeleteAutomationRulesCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe(
        'Successfully updated automation rules: TestRule; Successfully deleted automation rules: ExtraRule',
      );
      expect(BatchDeleteAutomationRulesCommand).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed operations (create, update, delete)', async () => {
      const extraRule: AutomationRulesMetadata = {
        ...mockExistingRule,
        RuleName: 'ExtraRule',
        RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/extra-rule',
      };

      const newRule: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        name: 'NewRule',
      };

      const mixedConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [mockAutomationRule, newRule],
      };

      const mixedProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: mixedConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule, extraRule] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.resolve({});
        }
        if (command instanceof BatchDeleteAutomationRulesCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mixedProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe(
        'Successfully created automation rules: NewRule; Successfully updated automation rules: TestRule; Successfully deleted automation rules: ExtraRule',
      );
    });

    it('should return no changes message when configuration matches existing rules', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule] });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const emptyConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [],
      };

      const emptyProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: emptyConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(emptyProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('No changes needed for Security Hub automation rules');
    });

    it('should handle batch create with multiple rules', async () => {
      const rule1: ISecurityHubAutomationRuleConfig = { ...mockAutomationRule, name: 'Rule1' };
      const rule2: ISecurityHubAutomationRuleConfig = { ...mockAutomationRule, name: 'Rule2' };
      const rule3: ISecurityHubAutomationRuleConfig = { ...mockAutomationRule, name: 'Rule3' };

      const multiRuleConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [rule1, rule2, rule3],
      };

      const multiRuleProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: multiRuleConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(multiRuleProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: Rule1, Rule2, Rule3');
      expect(CreateAutomationRuleCommand).toHaveBeenCalledTimes(3);
    });

    it('should handle action without findingFieldsUpdate', async () => {
      const ruleWithoutUpdate: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        actions: [
          {
            type: 'FINDING_FIELDS_UPDATE',
          },
        ],
      };

      const configWithoutUpdate: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [ruleWithoutUpdate],
      };

      const propsWithoutUpdate: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: configWithoutUpdate,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(propsWithoutUpdate);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });

    it('should handle criteria with unknown key', async () => {
      const ruleWithUnknownCriteria: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        criteria: [
          {
            key: 'UnknownKey',
            filter: [
              {
                value: 'test',
                comparison: 'EQUALS',
              },
            ],
          },
        ],
      };

      const configWithUnknownCriteria: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [ruleWithUnknownCriteria],
      };

      const propsWithUnknownCriteria: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: configWithUnknownCriteria,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(propsWithUnknownCriteria);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });
  });

  describe('handler - dry run mode', () => {
    const mockDryRunProps: ISecurityHubManageAutomationRulesParameter = {
      ...mockProps,
      dryRun: true,
    };

    it('should return dry run response for creating new rules', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockDryRunProps);

      expect(result.status).toBe(true);
      expect(result.message).toContain('TestRule will be created');
      expect(CreateAutomationRuleCommand).not.toHaveBeenCalled();
    });

    it('should return dry run response for updating existing rules', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockDryRunProps);

      expect(result.status).toBe(true);
      expect(result.message).toContain('TestRule will be updated');
      expect(BatchUpdateAutomationRulesCommand).not.toHaveBeenCalled();
    });

    it('should return dry run response for deleting rules', async () => {
      const extraRule: AutomationRulesMetadata = {
        ...mockExistingRule,
        RuleName: 'ExtraRule',
        RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/extra-rule',
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule, extraRule] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockDryRunProps);

      expect(result.status).toBe(true);
      expect(result.message).toContain('TestRule will be updated');
      expect(result.message).toContain('ExtraRule will be deleted');
      expect(BatchDeleteAutomationRulesCommand).not.toHaveBeenCalled();
    });

    it('should return dry run response for no changes needed', async () => {
      const emptyConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [],
      };

      const emptyDryRunProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockDryRunProps,
        configuration: emptyConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(emptyDryRunProps);

      expect(result.status).toBe(true);
      expect(result.message).toContain('No changes needed for Security Hub automation rules');
    });
  });

  describe('error handling', () => {
    it('should handle ListAutomationRulesCommand error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.reject(new Error('List automation rules failed'));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(securityHubModule.handler(mockProps)).rejects.toThrow('List automation rules failed');
    });

    it('should handle CreateAutomationRuleCommand error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.reject(new Error('Create automation rule failed'));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(securityHubModule.handler(mockProps)).rejects.toThrow('Create automation rule failed');
    });

    it('should handle BatchUpdateAutomationRulesCommand error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [mockExistingRule] });
        }
        if (command instanceof BatchUpdateAutomationRulesCommand) {
          return Promise.reject(new Error('Batch update automation rules failed'));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(securityHubModule.handler(mockProps)).rejects.toThrow('Batch update automation rules failed');
    });

    it('should handle BatchDeleteAutomationRulesCommand error', async () => {
      const extraRule: AutomationRulesMetadata = {
        ...mockExistingRule,
        RuleName: 'ExtraRule',
        RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/extra-rule',
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [extraRule] });
        }
        if (command instanceof BatchDeleteAutomationRulesCommand) {
          return Promise.reject(new Error('Batch delete automation rules failed'));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const emptyConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [],
      };

      const emptyProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: emptyConfiguration,
      };

      await expect(securityHubModule.handler(emptyProps)).rejects.toThrow('Batch delete automation rules failed');
    });
  });

  describe('edge cases', () => {
    it('should handle disabled automation rule', async () => {
      const disabledRule: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        enabled: false,
      };

      const disabledConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [disabledRule],
      };

      const disabledProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: disabledConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(disabledProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });

    it('should handle rule without ruleOrder (default to 1)', async () => {
      const ruleWithoutOrder: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        ruleOrder: undefined,
      };

      const configWithoutOrder: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [ruleWithoutOrder],
      };

      const propsWithoutOrder: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: configWithoutOrder,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(propsWithoutOrder);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });

    it('should handle findingFieldsUpdate with partial fields', async () => {
      const ruleWithPartialUpdate: ISecurityHubAutomationRuleConfig = {
        ...mockAutomationRule,
        actions: [
          {
            type: 'FINDING_FIELDS_UPDATE',
            findingFieldsUpdate: {
              severityLabel: 'MEDIUM',
              // Only severityLabel provided, others undefined
            },
          },
        ],
      };

      const configWithPartialUpdate: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: [ruleWithPartialUpdate],
      };

      const propsWithPartialUpdate: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: configWithPartialUpdate,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(propsWithPartialUpdate);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });

    it('should handle existing rule without RuleName', async () => {
      const ruleWithoutName: AutomationRulesMetadata = {
        ...mockExistingRule,
        RuleName: undefined,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [ruleWithoutName] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(mockProps);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Successfully created automation rules: TestRule');
    });

    it('should handle large batch size for rule creation', async () => {
      // Create 100+ rules to test batch processing
      const manyRules: ISecurityHubAutomationRuleConfig[] = [];
      for (let i = 1; i <= 75; i++) {
        manyRules.push({
          ...mockAutomationRule,
          name: `TestRule${i}`,
        });
      }

      const manyRulesConfiguration: ISecurityHubManageAutomationRulesConfiguration = {
        automationRules: manyRules,
      };

      const manyRulesProps: ISecurityHubManageAutomationRulesParameter = {
        ...mockProps,
        configuration: manyRulesConfiguration,
      };

      mockSend.mockImplementation(command => {
        if (command instanceof ListAutomationRulesCommand) {
          return Promise.resolve({ AutomationRulesMetadata: [] });
        }
        if (command instanceof CreateAutomationRuleCommand) {
          return Promise.resolve({ RuleArn: 'arn:aws:securityhub:us-east-1:111122223333:automation-rule/new-rule' });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await securityHubModule.handler(manyRulesProps);

      expect(result.status).toBe(true);
      expect(result.message).toContain('Successfully created automation rules:');
      expect(CreateAutomationRuleCommand).toHaveBeenCalledTimes(75);
    });
  });
});

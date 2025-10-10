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

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { CloudFormationClient, StackStatus } from '@aws-sdk/client-cloudformation';
import { IStackPolicyHandlerParameter } from '../../../../interfaces/aws-cloudformation/create-stack-policy';
import { StackPolicyModule } from '../../../../lib/aws-cloudformation/create-stack-policy';
import * as commonFunctions from '../../../../common/functions';
import * as throttle from '../../../../common/throttle';

// Mock the AWS SDK clients and commands
jest.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: jest.fn(),
  paginateListStacks: jest.fn(),
  SetStackPolicyCommand: jest.fn().mockImplementation(params => {
    return { params };
  }),
  StackStatus: {
    CREATE_COMPLETE: 'CREATE_COMPLETE',
    UPDATE_COMPLETE: 'UPDATE_COMPLETE',
    ROLLBACK_COMPLETE: 'ROLLBACK_COMPLETE',
    IMPORT_COMPLETE: 'IMPORT_COMPLETE',
    IMPORT_ROLLBACK_COMPLETE: 'IMPORT_ROLLBACK_COMPLETE',
  },
}));

describe('StackPolicy', () => {
  let stackPolicy: StackPolicyModule;

  beforeEach(() => {
    stackPolicy = new StackPolicyModule();
    jest.spyOn(commonFunctions, 'getCurrentAccountId').mockResolvedValue('123456789012');
    jest.spyOn(commonFunctions, 'setRetryStrategy').mockReturnValue({ mode: 'standard' } as any);
    jest.spyOn(throttle, 'throttlingBackOff').mockImplementation((fn: any) => fn());

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createAllowStackPolicy', () => {
    it('returns allow', () => {
      const result = stackPolicy['createAllowStackPolicy']();
      const policyBody = JSON.parse(result);

      expect(policyBody.Statement[0].Effect).toBe('Allow');
      expect(policyBody.Statement[0].Action).toBe('Update:*');
    });
  });

  describe('createDenyStackPolicy', () => {
    it('returns deny', () => {
      const result = stackPolicy['createDenyStackPolicy']([]);
      const policyBody = JSON.parse(result);

      expect(policyBody.Statement[0].Effect).toBe('Deny');
      expect(policyBody.Statement[0].Action[0]).toBe('Update:Replace');
      expect(policyBody.Statement[0].Action[1]).toBe('Update:Delete');
    });

    it('handles null protectedTypes', () => {
      const result = stackPolicy['createDenyStackPolicy'](null as any);
      const policyBody = JSON.parse(result);

      expect(policyBody.Statement[0].Effect).toBe('Deny');
      expect(policyBody.Statement[0].Condition.StringEquals.ResourceType).toEqual([]);
    });

    it('returns deny with protected types', () => {
      const protectedTypes = ['AWS::EC2::InternetGateway', 'AWS::EC2::Route'];
      const result = stackPolicy['createDenyStackPolicy'](protectedTypes);
      const policyBody = JSON.parse(result);
      expect(policyBody.Statement[0].Condition.StringEquals.ResourceType).toHaveLength(2);
      expect(policyBody.Statement[0].Condition.StringEquals.ResourceType[0]).toBe('AWS::EC2::InternetGateway');
      expect(policyBody.Statement[0].Condition.StringEquals.ResourceType[1]).toBe('AWS::EC2::Route');
    });
  });

  describe('handler', () => {
    beforeEach(() => {
      jest
        .spyOn(StackPolicyModule.prototype, 'loadLzaStackNames' as any)
        .mockResolvedValue(['AWSAccelerator-Stack1', 'AWSAccelerator-Stack2']);
      jest.spyOn(StackPolicyModule.prototype, 'setStackPolicy' as any).mockResolvedValue(undefined);
      jest.spyOn(StackPolicyModule.prototype, 'getAccountCredentials' as any).mockImplementation(() => {
        return Promise.resolve({
          accessKeyId: 'test',
          secretAccessKey: 'test',
          sessionToken: 'test-token',
        });
      });
    });

    it('handler returns enabled on success with empty stacks', async () => {
      const props: IStackPolicyHandlerParameter = {
        accountIds: ['123456789012', '234567890123'], // Add a second account to test cross-account credentials
        regions: ['us-east-1'],
        managementAccountAccessRole: 'MockRole',
        enabled: true,
        acceleratorPrefix: 'AWSAccelerator',
        protectedTypes: [],
        operation: 'test',
        partition: 'aws',
        region: 'us-east-1',
      };

      // Mock empty stack list to test the null coalescing operator
      jest.spyOn(StackPolicyModule.prototype, 'loadLzaStackNames' as any).mockResolvedValue(null);

      const result = await stackPolicy.handler(props);
      expect(result).toEqual(`StackPolicy has been succesfully changed to ${props.enabled}`);

      // Restore the original mock for other tests
      jest
        .spyOn(StackPolicyModule.prototype, 'loadLzaStackNames' as any)
        .mockResolvedValue(['AWSAccelerator-Stack1', 'AWSAccelerator-Stack2']);
    });

    it('handler returns enabled on success', async () => {
      const props: IStackPolicyHandlerParameter = {
        accountIds: ['123456789012', '234567890123'], // Add a second account to test cross-account credentials
        regions: ['us-east-1'],
        managementAccountAccessRole: 'MockRole',
        enabled: true,
        acceleratorPrefix: 'AWSAccelerator',
        protectedTypes: [],
        operation: 'test',
        partition: 'aws',
        region: 'us-east-1',
      };

      const result = await stackPolicy.handler(props);
      expect(result).toEqual(`StackPolicy has been succesfully changed to ${props.enabled}`);
    });

    it('handler returns disabled on success', async () => {
      const props: IStackPolicyHandlerParameter = {
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'MockRole',
        enabled: false,
        acceleratorPrefix: 'AWSAccelerator',
        protectedTypes: [],
        operation: 'test',
        partition: 'aws',
        region: 'us-east-1',
      };

      const result = await stackPolicy.handler(props);
      expect(result).toEqual(`StackPolicy has been succesfully changed to ${props.enabled}`);
    });

    it('dry run works', async () => {
      const props: IStackPolicyHandlerParameter = {
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'MockRole',
        enabled: true,
        dryRun: true,
        acceleratorPrefix: 'AWSAccelerator',
        moduleName: 'TestModule',
        operation: 'test-operation',
        protectedTypes: [],
        partition: 'aws',
        region: 'us-east-1',
      };

      jest.spyOn(StackPolicyModule.prototype, 'executeDryRun' as any).mockReturnValue('Dry run response');

      const result = await stackPolicy.handler(props);
      expect(result).toBe('Dry run response');
    });

    it('handles undefined protectedTypes', async () => {
      const props: IStackPolicyHandlerParameter = {
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'MockRole',
        enabled: true,
        acceleratorPrefix: 'AWSAccelerator',
        protectedTypes: [],
        operation: 'test',
        partition: 'aws',
        region: 'us-east-1',
      };

      const result = await stackPolicy.handler(props);
      expect(result).toEqual(`StackPolicy has been succesfully changed to ${props.enabled}`);
    });
  });

  describe('loadLzaStackNames', () => {
    it('loadLzaStackNames only finds lza stacks using paginator', async () => {
      const mockPaginator = jest.fn().mockImplementation(async function* () {
        yield {
          StackSummaries: [
            { StackName: 'AWSAccelerator-Stack1', StackStatus: StackStatus.CREATE_COMPLETE },
            { StackName: 'AWSAccelerator-Stack2', StackStatus: StackStatus.UPDATE_COMPLETE },
            { StackName: 'NonAWSAccelerator-Stack1', StackStatus: StackStatus.CREATE_COMPLETE },
          ],
        };
      });

      const paginateListStacks = require('@aws-sdk/client-cloudformation').paginateListStacks;
      paginateListStacks.mockImplementation(() => mockPaginator());

      const cfnClientMock = {} as CloudFormationClient;
      const result = await stackPolicy['loadLzaStackNames'](cfnClientMock, 'AWSAccelerator');
      expect(result).toHaveLength(2);
    });

    it('loadLzaStackNames gets all pages from paginator', async () => {
      const mockPaginator = jest.fn().mockImplementation(async function* () {
        yield {
          StackSummaries: [
            { StackName: 'AWSAccelerator-Stack1', StackStatus: StackStatus.CREATE_COMPLETE },
            { StackName: 'AWSAccelerator-Stack2', StackStatus: StackStatus.UPDATE_COMPLETE },
            { StackName: 'NonAWSAccelerator-Stack1', StackStatus: StackStatus.CREATE_COMPLETE },
          ],
        };
        yield {
          StackSummaries: [
            { StackName: 'AWSAccelerator-Stack3', StackStatus: StackStatus.CREATE_COMPLETE },
            { StackName: 'abcdefg', StackStatus: StackStatus.CREATE_COMPLETE },
            { StackName: 'NonAWSAccelerator-Stack2', StackStatus: StackStatus.CREATE_COMPLETE },
          ],
        };
        yield {
          StackSummaries: [],
        };
      });

      const paginateListStacks = require('@aws-sdk/client-cloudformation').paginateListStacks;
      paginateListStacks.mockImplementation(() => mockPaginator());

      const cfnClientMock = {} as CloudFormationClient;
      const result = await stackPolicy['loadLzaStackNames'](cfnClientMock, 'AWSAccelerator');
      expect(result).toHaveLength(3);
    });

    it('handles empty StackSummaries', async () => {
      const mockPaginator = jest.fn().mockImplementation(async function* () {
        yield {
          StackSummaries: undefined,
        };
      });

      const paginateListStacks = require('@aws-sdk/client-cloudformation').paginateListStacks;
      paginateListStacks.mockImplementation(() => mockPaginator());

      const cfnClientMock = {} as CloudFormationClient;
      const result = await stackPolicy['loadLzaStackNames'](cfnClientMock, 'AWSAccelerator');
      expect(result).toHaveLength(0);
    });

    it('handles stack summaries with undefined stack names', async () => {
      const mockPaginator = jest.fn().mockImplementation(async function* () {
        yield {
          StackSummaries: [
            { StackName: undefined, StackStatus: StackStatus.CREATE_COMPLETE },
            { StackName: 'AWSAccelerator-Stack2', StackStatus: StackStatus.UPDATE_COMPLETE },
          ],
        };
      });

      const paginateListStacks = require('@aws-sdk/client-cloudformation').paginateListStacks;
      paginateListStacks.mockImplementation(() => mockPaginator());

      const cfnClientMock = {} as CloudFormationClient;
      const result = await stackPolicy['loadLzaStackNames'](cfnClientMock, 'AWSAccelerator');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('AWSAccelerator-Stack2');
    });
  });

  describe('setStackPolicy', () => {
    it('throws error on non 200 result', async () => {
      const cfnClientMock = {
        send: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            $metadata: { httpStatusCode: 400 },
          });
        }),
      } as unknown as CloudFormationClient;
      await expect(
        stackPolicy['setStackPolicy'](cfnClientMock, 'stack1', 'policy1', 'us-east-1', true),
      ).rejects.toThrow();
    });

    it('no error on 200 result', async () => {
      const cfnClientMock = {
        send: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            $metadata: { httpStatusCode: 200 },
          });
        }),
      } as unknown as CloudFormationClient;
      await expect(
        stackPolicy['setStackPolicy'](cfnClientMock, 'stack1', 'policy1', 'us-east-1', true),
      ).resolves.not.toThrow();
    });
  });

  describe('executeDryRun', () => {
    it('returns dry run response', () => {
      const props: IStackPolicyHandlerParameter = {
        moduleName: 'TestModule',
        operation: 'test-operation',
        enabled: true,
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'TestRole',
        protectedTypes: ['AWS::IAM::Role'],
        acceleratorPrefix: 'AWSAccelerator',
        partition: 'aws',
        region: 'us-east-1',
      };

      jest.spyOn(commonFunctions, 'generateDryRunResponse').mockReturnValue('Dry run response');

      const result = stackPolicy['executeDryRun'](['stack1', 'stack2'], 'us-east-1', props);
      expect(result).toBe('Dry run response');
    });

    it('uses default module name when not provided', () => {
      const props: IStackPolicyHandlerParameter = {
        operation: 'test-operation',
        enabled: true,
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'TestRole',
        protectedTypes: ['AWS::IAM::Role'],
        acceleratorPrefix: 'AWSAccelerator',
        partition: 'aws',
        region: 'us-east-1',
      };

      jest.spyOn(commonFunctions, 'generateDryRunResponse').mockReturnValue('Dry run response');

      const result = stackPolicy['executeDryRun'](['stack1'], 'us-east-1', props);
      expect(result).toBe('Dry run response');
    });

    it('forEach with undefined stacksInRegion', () => {
      const props: IStackPolicyHandlerParameter = {
        operation: 'test-operation',
        enabled: true,
        accountIds: ['123456789012'],
        regions: ['us-east-1'],
        managementAccountAccessRole: 'TestRole',
        protectedTypes: ['AWS::IAM::Role'],
        acceleratorPrefix: 'AWSAccelerator',
        partition: 'aws',
        region: 'us-east-1',
      };

      const expectedResponse = 'response';
      jest.spyOn(commonFunctions, 'generateDryRunResponse').mockReturnValue(expectedResponse);

      const result = stackPolicy['executeDryRun'](undefined as any, 'us-east-1', props);
      expect(result).toBe(expectedResponse);
    });
  });

  describe('getAccountCredentials', () => {
    it('returns provided credentials when current account matches target account', async () => {
      const props = {
        credentials: { accessKeyId: 'test', secretAccessKey: 'test', sessionToken: 'test-token' },
      } as any;

      const result = await stackPolicy['getAccountCredentials']('123456789012', '123456789012', 'us-east-1', props);
      expect(result).toBe(props.credentials);
    });

    it('gets new credentials when account differs', async () => {
      const props = {
        managementAccountAccessRole: 'TestRole',
        partition: 'aws',
        solutionId: 'SO0199',
      } as any;

      const mockCredentials = { accessKeyId: 'new', secretAccessKey: 'new', sessionToken: 'new' };
      jest.spyOn(commonFunctions, 'getCredentials').mockResolvedValue(mockCredentials);

      const result = await stackPolicy['getAccountCredentials']('234567890123', '123456789012', 'us-east-1', props);
      expect(result).toBe(mockCredentials);

      // Verify getCredentials was called with correct parameters
      expect(commonFunctions.getCredentials).toHaveBeenCalledWith({
        accountId: '234567890123',
        region: 'us-east-1',
        solutionId: 'SO0199',
        partition: 'aws',
        assumeRoleName: 'TestRole',
        sessionName: 'AcceleratorCreateStackPolicy',
      });
    });
  });
});

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
import * as functions from '../../../common/functions';
import { describe, beforeEach, expect, test, jest } from '@jest/globals';
import { CloudFormationClient, GetTemplateCommand } from '@aws-sdk/client-cloudformation';
import path from 'path';
import { promises as fs } from 'fs';
import { IGetCloudFormationTemplatesHandlerParameter } from '../../../interfaces/aws-cloudformation/get-cloudformation-templates';
import { GetCloudFormationTemplatesModule } from '../../../lib/aws-cloudformation/get-cloudformation-templates';
import { MOCK_CONSTANTS } from '../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { AcceleratorEnvironment } from '../../../common/types';

jest.mock(
  '../../../common/functions',
  () =>
    ({
      ...jest.requireActual('../../../common/functions'),
      getCredentials: jest.fn(),
    } as typeof functions),
);

jest.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: jest.fn(),
  GetTemplateCommand: jest.fn(),
}));

describe('GetCloudFormationTemplatesModule', () => {
  const mockCfnClientSend = jest.fn();
  let cfnModule: GetCloudFormationTemplatesModule;

  beforeEach(() => {
    jest.clearAllMocks();
    (CloudFormationClient as jest.Mock).mockImplementation(() => ({
      send: mockCfnClientSend,
    }));
    (functions.getCredentials as jest.Mock).mockReturnValue(Promise.resolve(MOCK_CONSTANTS.credentials));
    cfnModule = new GetCloudFormationTemplatesModule();
  });

  const baseInput: IGetCloudFormationTemplatesHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: MOCK_CONSTANTS.GetCloudFormationTemplatesModule.configuration,
  };

  describe('handler method', () => {
    describe('dry run mode', () => {
      test('should return success message for valid configuration', async () => {
        const dryRunInput = { ...baseInput, dryRun: true };
        const response = await cfnModule.handler(dryRunInput);
        expect(response).toContain('Dry run for retrieval of cloudformation templates was successful');
        expect(mockCfnClientSend).not.toHaveBeenCalled();
      });

      test('should return error message when both stackName and stackPrefix provided', async () => {
        const invalidDryRunInput = {
          ...baseInput,
          dryRun: true,
          configuration: {
            ...baseInput.configuration,
            stackName: 'TestStack',
            stackPrefix: 'TestPrefix',
          },
        };
        const response = await cfnModule.handler(invalidDryRunInput);
        expect(response).toContain(MODULE_EXCEPTIONS.INVALID_INPUT);
        expect(mockCfnClientSend).not.toHaveBeenCalled();
      });
    });

    describe('live mode', () => {
      test('should process all environments successfully', async () => {
        mockCfnClientSend.mockReturnValue(Promise.resolve({ TemplateBody: '{"Resources": {}}' }));
        const response = await cfnModule.handler(baseInput);
        expect(response).toContain('CloudFormation Templates for stacks retrieved successfully');
        expect(mockCfnClientSend).toHaveBeenCalledTimes(2);
      });

      test('should pass with smaller batch size', async () => {
        mockCfnClientSend.mockReturnValue(Promise.resolve({ TemplateBody: '{"Resources": {}}' }));
        const response = await cfnModule.handler({
          ...MOCK_CONSTANTS.runnerParameters,
          configuration: {
            batchSize: 5,
            ...MOCK_CONSTANTS.GetCloudFormationTemplatesModule.configuration,
          },
        });
        expect(response).toContain('CloudFormation Templates for stacks retrieved successfully');
        expect(mockCfnClientSend).toHaveBeenCalledTimes(2);
      });

      test('should handle API errors gracefully', async () => {
        mockCfnClientSend.mockReturnValue(Promise.reject(new Error('API Error')));
        const response = await cfnModule.handler(baseInput);
        expect(response).toContain('CloudFormation Templates for stacks retrieved successfully');
      });
    });
  });

  describe('getEnvironmentsCredentials method', () => {
    test('should process environments in small batches', async () => {
      const environments: AcceleratorEnvironment[] = [
        { accountId: '111111111111', region: 'us-east-1' },
        { accountId: '222222222222', region: 'us-east-1' },
        { accountId: '333333333333', region: 'us-west-1' },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (cfnModule as any).getEnvironmentsCredentials({
        centralAccountId: '111111111111',
        environments,
        roleNameToAssume: 'TestRole',
        batchSize: 2,
      });

      expect(result).toHaveLength(3); // FIXME: needs to fix
      expect(result[0].environment).toBeDefined();
      expect(result[1].environment).toBeDefined();
      expect(result[2].environment).toBeDefined();
    });

    test('should process environments in large batches', async () => {
      const environments: AcceleratorEnvironment[] = [
        { accountId: '111111111111', region: 'us-east-1' },
        { accountId: '222222222222', region: 'us-east-1' },
        { accountId: '333333333333', region: 'us-west-1' },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (cfnModule as any).getEnvironmentsCredentials({
        centralAccountId: '111111111111',
        environments,
        roleNameToAssume: 'TestRole',
      });

      expect(result).toHaveLength(3);
      expect(result[0].environment).toBeDefined();
      expect(result[1].environment).toBeDefined();
      expect(result[2].environment).toBeDefined();
    });

    test('should handle empty environments list', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (cfnModule as any).getEnvironmentsCredentials({
        centralAccountId: '111111111111',
        environments: [],
        roleNameToAssume: 'TestRole',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('getEnvironmentCredentials method', () => {
    test('should return management credentials for central account', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (cfnModule as any).getEnvironmentCredentials({
        centralAccountId: '111111111111',
        accountId: '111111111111',
        region: 'us-east-1',
        crossAccountRoleName: 'TestRole',
        managementCredentials: MOCK_CONSTANTS.credentials,
      });

      expect(result.credentials).toEqual(MOCK_CONSTANTS.credentials);
    });

    test('should throw error when no credentials returned', async () => {
      (functions.getCredentials as jest.Mock).mockReturnValue(Promise.resolve(undefined));

      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cfnModule as any).getEnvironmentCredentials({
          centralAccountId: '111111111111',
          accountId: '222222222222',
          region: 'us-east-1',
          crossAccountRoleName: 'TestRole',
          managementCredentials: MOCK_CONSTANTS.credentials,
        }),
      ).rejects.toThrow(MODULE_EXCEPTIONS.SERVICE_EXCEPTION);
    });

    test('should get credentials for non-central account', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (cfnModule as any).getEnvironmentCredentials({
        centralAccountId: '111111111111',
        accountId: '222222222222',
        region: 'us-east-1',
        crossAccountRoleName: 'TestRole',
        managementCredentials: MOCK_CONSTANTS.credentials,
      });

      expect(result.environment).toBeDefined();
      expect(result.credentials).toBeDefined();
    });
  });

  describe('processCloudFormationTemplates method', () => {
    test('should process templates in batches', async () => {
      const environmentCredentials = [
        {
          environment: { accountId: '111111111111', region: 'us-east-1' },
          credentials: MOCK_CONSTANTS.credentials,
        },
        {
          environment: { accountId: '222222222222', region: 'us-east-2' },
          credentials: MOCK_CONSTANTS.credentials,
        },
        {
          environment: { accountId: '333333333333', region: 'us-east-2' },
          credentials: MOCK_CONSTANTS.credentials,
        },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).processCloudFormationTemplates({
        environmentCredentials,
        stackPrefix: 'TestStack',
        batchSize: 2,
        basePath: '/tmp/cfn-templates-test',
      });

      expect(mockCfnClientSend).toHaveBeenCalledTimes(3);
    });

    test('should handle template retrieval errors', async () => {
      const environmentCredentials = [
        {
          environment: { accountId: '111111111111', region: 'us-east-1' },
          credentials: MOCK_CONSTANTS.credentials,
        },
      ];

      mockCfnClientSend.mockReturnValue(Promise.reject(new Error('Template not found')));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).processCloudFormationTemplates({
        environmentCredentials,
        stackPrefix: 'TestStack',
        batchSize: 1,
        basePath: '/tmp/cfn-templates-test',
      });

      // Should not throw error and continue processing
      expect(mockCfnClientSend).toHaveBeenCalled();
    });
  });

  describe('processCloudFormationTemplate method', () => {
    test('should retrieve and save template successfully', async () => {
      mockCfnClientSend.mockReturnValue(Promise.resolve({ TemplateBody: '{"Resources": {}}' }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).processCloudFormationTemplate({
        environment: { accountId: '111111111111', region: 'us-east-1' },
        credentials: MOCK_CONSTANTS.credentials,
        stackPrefix: 'TestStack',
        basePath: '/tmp/cfn-templates-test',
      });

      expect(mockCfnClientSend).toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle missing template', async () => {
      mockCfnClientSend.mockReturnValue(Promise.reject(new Error('Template not found')));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).processCloudFormationTemplate({
        environment: { accountId: '111111111111', region: 'us-east-1' },
        credentials: MOCK_CONSTANTS.credentials,
        stackPrefix: 'TestStack',
        basePath: '/tmp/cfn-templates-test',
      });

      // Should write empty template
      const filePath = path.join(
        '/tmp/cfn-templates-test',
        '111111111111',
        'us-east-1',
        'TestStack-111111111111-us-east-1.json',
      );
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('{}');
    });
  });

  describe('setStackName method', () => {
    test('should return stackName when provided', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (cfnModule as any).setStackName({
        stackName: 'TestStack',
        environment: { accountId: '111111111111', region: 'us-east-1' },
      });
      expect(result).toBe('TestStack');
    });

    test('should generate stack name from prefix', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (cfnModule as any).setStackName({
        stackPrefix: 'Test',
        environment: { accountId: '111111111111', region: 'us-east-1' },
      });
      expect(result).toBe('Test-111111111111-us-east-1');
    });

    test('should throw error when neither stackName nor stackPrefix provided', () => {
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cfnModule as any).setStackName({
          environment: { accountId: '111111111111', region: 'us-east-1' },
        }),
      ).toThrow(MODULE_EXCEPTIONS.INVALID_INPUT);
    });

    test('should throw error when both stackName and stackPrefix provided', () => {
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cfnModule as any).setStackName({
          stackName: 'TestStack',
          stackPrefix: 'Test',
          environment: { accountId: '111111111111', region: 'us-east-1' },
        }),
      ).toThrow(MODULE_EXCEPTIONS.INVALID_INPUT);
    });
  });

  describe('writeTemplateToDisk method', () => {
    test('should write template to correct location', async () => {
      const testTemplate = {
        environment: { accountId: '111111111111', region: 'us-east-1' },
        stackName: 'test-stack',
        template: '{"Resources": {}}',
        basePath: '/tmp/cfn-templates-test',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).writeTemplateToDisk(testTemplate);

      const filePath = path.join(
        testTemplate.basePath,
        testTemplate.environment.accountId,
        testTemplate.environment.region,
        `${testTemplate.stackName}.json`,
      );

      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe(testTemplate.template);
    });

    test('should handle nested directory creation', async () => {
      const testTemplate = {
        environment: { accountId: '111111111111', region: 'us-east-1' },
        stackName: 'test-stack',
        template: '{"Resources": {}}',
        basePath: '/tmp/cfn-templates-test/nested/deep/path',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cfnModule as any).writeTemplateToDisk(testTemplate);

      const filePath = path.join(
        testTemplate.basePath,
        testTemplate.environment.accountId,
        testTemplate.environment.region,
        `${testTemplate.stackName}.json`,
      );

      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  // Cleanup after all tests
  afterAll(async () => {
    try {
      await fs.rm('/tmp/cfn-templates-test', { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });
});

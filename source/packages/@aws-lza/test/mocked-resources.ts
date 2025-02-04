import { AcceleratorModuleName } from '../common/resources';

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
const operation = 'mockOperation';

export const MOCK_CONSTANTS = {
  unknownError: new Error('Unknown command'),
  runnerParameters: {
    operation: operation,
    partition: 'mockPartition',
    region: 'mockRegion',
    prefix: 'mockPrefix',
    configDirPath: '/path/to/config',
    useExistingRole: false,
    solutionId: 'mockSolutionId',
  },
  registerOuConfiguration: {
    ouArn: 'mockOuArn',
  },
  existingLandingArn: 'mockExistingLandingArn',
  existingLandingZoneIdentifier: 'mockLandingZoneIdentifier',
  baselines: {
    controlTowerBaseline: {
      arn: 'mockControlTowerBaselineArn',
      description: 'mock description',
      name: 'AWSControlTowerBaseline',
    },
    identityCenterBaseline: {
      arn: 'mockIdentityCenterBaselineArn',
      description: 'mock description',
      name: 'IdentityCenterBaseline',
    },
    auditBaseline: {
      arn: 'mockAuditBaselineArn',
      description: 'mock description',
      name: 'AuditBaseline',
    },
  },
  operationIdentifier: 'mockOperationIdentifier',
  enabledBaselines: {
    mockTarget1: {
      arn: 'mockEnabledBaselineArn1',
      baselineIdentifier: 'mockBaselineIdentifier1',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockTargetIdentifier1',
      baselineVersion: '4.0',
    },
    mockTarget2: {
      arn: 'mockEnabledBaselineArn1',
      baselineIdentifier: 'mockBaselineIdentifier1',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockTargetIdentifier1',
      baselineVersion: '4.0',
    },
    mockOu: {
      arn: 'mockOuArn',
      baselineIdentifier: 'mockOuBaselineIdentifier1',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockOuArn',
      baselineVersion: '4.0',
    },
    mockOuFailed: {
      arn: 'mockOuArn',
      baselineIdentifier: 'mockOuBaselineIdentifier1',
      statusSummary: {
        status: 'FAILED',
      },
      targetIdentifier: 'mockOuArn',
      baselineVersion: '4.0',
    },
    mockOuOldBaseLineVersion: {
      arn: 'mockOuArn',
      baselineIdentifier: 'mockOuBaselineIdentifier1',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockOuArn',
      baselineVersion: '3.0',
    },
    mockIdentityCenterBaseline: {
      arn: 'mockIdentityCenterBaselineArn',
      baselineIdentifier: 'mockIdentityCenterBaselineArn',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockIdentityCenterBaselineArn',
      baselineVersion: '4.0',
    },
  },
  dryRunResponsePattern: {
    setupLandingZoneModule: (status: string) =>
      new RegExp(
        `\\[DRY-RUN\\]: ${AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE} ${operation} \\(no actual changes were made\\)[\\s\\S]*?${status}`,
      ),
  },
};

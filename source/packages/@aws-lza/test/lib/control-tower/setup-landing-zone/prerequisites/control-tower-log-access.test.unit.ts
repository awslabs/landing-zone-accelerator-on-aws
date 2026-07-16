/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://aws.amazon.com/apache2.0/
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { GetKeyPolicyCommand, KMSClient, PutKeyPolicyCommand } from '@aws-sdk/client-kms';
import { IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam';

import { ControlTowerLogAccess } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/control-tower-log-access';
import { getCredentials } from '../../../../../lib/common/sts-functions';

const mockKmsSend = vi.fn();
const mockIamSend = vi.fn();
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  processStart: vi.fn(),
  processEnd: vi.fn(),
  dryRun: vi.fn(),
  commandExecution: vi.fn(),
  commandSuccess: vi.fn(),
}));

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: vi.fn(),
  GetKeyPolicyCommand: vi.fn(),
  PutKeyPolicyCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-iam', () => ({
  IAMClient: vi.fn(),
  PutRolePolicyCommand: vi.fn(),
}));

vi.mock('../../../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../../../../common/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../../../../common/functions', async () => ({
  ...(await vi.importActual('../../../../../common/functions')),
  setRetryStrategy: vi.fn(() => ({})),
}));

vi.mock('../../../../../common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

const managementCredentials = {
  accessKeyId: 'management-access-key',
  secretAccessKey: 'management-secret-key',
  sessionToken: 'management-session-token',
};

const logArchiveCredentials = {
  accessKeyId: 'log-archive-access-key',
  secretAccessKey: 'log-archive-secret-key',
  sessionToken: 'log-archive-session-token',
};

const props = {
  partition: 'aws',
  region: 'us-east-1',
  logArchiveAccountId: '222222222222',
  centralizedLoggingKeyArn: 'arn:aws:kms:us-east-1:111111111111:key/key-id',
  solutionId: 'mockSolutionId',
  credentials: managementCredentials,
};

function configureLogAccess(properties: typeof props = props): Promise<void> {
  return ControlTowerLogAccess.configure(
    properties.partition,
    properties.region,
    properties.logArchiveAccountId,
    properties.centralizedLoggingKeyArn,
    properties.solutionId,
    properties.credentials,
  );
}

const expectedKeyPolicyStatement = {
  Sid: 'AllowControlTowerReadOnlyExecutionRoleToDecryptLogs',
  Effect: 'Allow',
  Principal: {
    AWS: 'arn:aws:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole',
  },
  Action: ['kms:Decrypt'],
  Resource: '*',
  Condition: {
    StringEquals: {
      'kms:ViaService': 's3.us-east-1.amazonaws.com',
    },
  },
};

describe('ControlTowerLogAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKmsSend.mockReset();
    mockIamSend.mockReset();

    vi.mocked(KMSClient).mockImplementation(function () {
      return { send: mockKmsSend } as never;
    });
    vi.mocked(IAMClient).mockImplementation(function () {
      return { send: mockIamSend } as never;
    });
    vi.mocked(getCredentials).mockResolvedValue(logArchiveCredentials);
  });

  test('adds decrypt permissions while preserving customer key policy statements', async () => {
    const customerStatement = {
      Sid: 'CustomerStatement',
      Effect: 'Allow',
      Principal: { AWS: 'arn:aws:iam::111111111111:root' },
      Action: 'kms:*',
      Resource: '*',
    };
    mockKmsSend
      .mockResolvedValueOnce({
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Id: 'AWSControlTowerPolicy',
          Statement: [customerStatement],
        }),
      })
      .mockResolvedValueOnce({});
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    expect(GetKeyPolicyCommand).toHaveBeenCalledWith({
      KeyId: props.centralizedLoggingKeyArn,
      PolicyName: 'default',
    });
    expect(PutKeyPolicyCommand).toHaveBeenCalledTimes(1);

    const keyPolicyInput = vi.mocked(PutKeyPolicyCommand).mock.calls[0][0];
    const updatedKeyPolicy = JSON.parse(keyPolicyInput.Policy!);
    expect(updatedKeyPolicy.Statement).toEqual([customerStatement, expectedKeyPolicyStatement]);

    expect(getCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: props.logArchiveAccountId,
        region: props.region,
        partition: props.partition,
        solutionId: props.solutionId,
        assumeRoleName: 'AWSControlTowerExecution',
        credentials: props.credentials,
        requireSessionPolicy: true,
      }),
    );
    const credentialsInput = vi.mocked(getCredentials).mock.calls[0][0];
    expect(JSON.parse(credentialsInput.sessionPolicy!)).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'iam:PutRolePolicy',
          Resource: 'arn:aws:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole',
        },
      ],
    });
    expect(PutRolePolicyCommand).toHaveBeenCalledWith({
      RoleName: 'aws-controltower-ReadOnlyExecutionRole',
      PolicyName: 'AWSAcceleratorControlTowerLogDecryptPolicy',
      PolicyDocument: expect.any(String),
    });

    const rolePolicyInput = vi.mocked(PutRolePolicyCommand).mock.calls[0][0];
    expect(JSON.parse(rolePolicyInput.PolicyDocument)).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowControlTowerLoggingKeyDecryption',
          Effect: 'Allow',
          Action: ['kms:Decrypt'],
          Resource: props.centralizedLoggingKeyArn,
          Condition: {
            StringEquals: {
              'kms:ViaService': 's3.us-east-1.amazonaws.com',
            },
          },
        },
      ],
    });
  });

  test('does not rewrite an already-correct key policy', async () => {
    mockKmsSend.mockResolvedValueOnce({
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [expectedKeyPolicyStatement],
      }),
    });
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    expect(PutKeyPolicyCommand).not.toHaveBeenCalled();
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(1);
  });

  test('does not rewrite a semantically equivalent key policy statement', async () => {
    mockKmsSend.mockResolvedValueOnce({
      Policy: JSON.stringify({
        Statement: [
          {
            Resource: '*',
            Condition: {
              StringEquals: {
                'kms:ViaService': 's3.us-east-1.amazonaws.com',
              },
            },
            Action: 'kms:Decrypt',
            Principal: {
              AWS: 'arn:aws:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole',
            },
            Effect: 'Allow',
            Sid: 'AllowControlTowerReadOnlyExecutionRoleToDecryptLogs',
          },
        ],
        Version: '2012-10-17',
      }),
    });
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    expect(PutKeyPolicyCommand).not.toHaveBeenCalled();
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(1);
  });

  test('replaces an outdated managed key policy statement without duplication', async () => {
    const outdatedStatement = {
      ...expectedKeyPolicyStatement,
      Action: ['kms:Decrypt', 'kms:DescribeKey'],
    };
    mockKmsSend
      .mockResolvedValueOnce({
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [outdatedStatement],
        }),
      })
      .mockResolvedValueOnce({});
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    const keyPolicyInput = vi.mocked(PutKeyPolicyCommand).mock.calls[0][0];
    const updatedKeyPolicy = JSON.parse(keyPolicyInput.Policy!);
    expect(updatedKeyPolicy.Statement).toEqual([expectedKeyPolicyStatement]);
  });

  test('normalizes a single-statement key policy before adding decrypt permissions', async () => {
    const customerStatement = {
      Sid: 'CustomerStatement',
      Effect: 'Allow',
      Principal: { AWS: 'arn:aws:iam::111111111111:root' },
      Action: 'kms:*',
      Resource: '*',
    };
    mockKmsSend
      .mockResolvedValueOnce({
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: customerStatement,
        }),
      })
      .mockResolvedValueOnce({});
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    const keyPolicyInput = vi.mocked(PutKeyPolicyCommand).mock.calls[0][0];
    const updatedKeyPolicy = JSON.parse(keyPolicyInput.Policy!);
    expect(updatedKeyPolicy.Statement).toEqual([customerStatement, expectedKeyPolicyStatement]);
  });

  test('throws when KMS does not return the current key policy', async () => {
    mockKmsSend.mockResolvedValueOnce({ Policy: undefined });

    await expect(configureLogAccess()).rejects.toThrow(/GetKeyPolicyCommand did not return Policy/);

    expect(getCredentials).not.toHaveBeenCalled();
    expect(PutRolePolicyCommand).not.toHaveBeenCalled();
  });

  test('wraps failures while attaching the Log Archive role policy with step context', async () => {
    const expectedError = new Error('Unable to attach role policy');
    mockKmsSend.mockResolvedValueOnce({
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [expectedKeyPolicyStatement],
      }),
    });
    mockIamSend.mockRejectedValueOnce(expectedError);

    await expect(configureLogAccess()).rejects.toMatchObject({
      message: expect.stringContaining('Failed to update the AWS Control Tower Log Archive role policy'),
      cause: expectedError,
    });
  });

  test('logs security-relevant policy mutations', async () => {
    mockKmsSend.mockResolvedValueOnce({
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [],
      }),
    });
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess();

    expect(mockLogger.info).toHaveBeenNthCalledWith(
      1,
      `Updating AWS Control Tower logging KMS key policy ${props.centralizedLoggingKeyArn} to grant decrypt access to arn:aws:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole.`,
    );
    expect(mockLogger.info).toHaveBeenNthCalledWith(
      2,
      'Attaching AWSAcceleratorControlTowerLogDecryptPolicy to arn:aws:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole.',
    );
  });

  test('uses the KMS ViaService suffix for the European Sovereign Cloud partition', async () => {
    const euscProps = {
      ...props,
      partition: 'aws-eusc',
      region: 'eusc-de-east-1',
      centralizedLoggingKeyArn: 'arn:aws-eusc:kms:eusc-de-east-1:111111111111:key/key-id',
    };
    mockKmsSend.mockResolvedValueOnce({
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [],
      }),
    });
    mockIamSend.mockResolvedValueOnce({});

    await configureLogAccess(euscProps);

    const keyPolicyInput = vi.mocked(PutKeyPolicyCommand).mock.calls[0][0];
    const keyPolicy = JSON.parse(keyPolicyInput.Policy!);
    expect(keyPolicy.Statement.at(-1)).toMatchObject({
      Principal: {
        AWS: 'arn:aws-eusc:iam::222222222222:role/aws-controltower-ReadOnlyExecutionRole',
      },
      Condition: {
        StringEquals: {
          'kms:ViaService': 's3.eusc-de-east-1.amazonaws.com',
        },
      },
    });
  });
});

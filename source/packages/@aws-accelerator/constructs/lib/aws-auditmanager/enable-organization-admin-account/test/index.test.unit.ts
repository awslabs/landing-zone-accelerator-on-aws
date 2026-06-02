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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, beforeEach, afterEach, expect, test, it, vi } from 'vitest';
import { handler } from '../index';
import {
  AuditManagerClient,
  AccountStatus,
  GetAccountStatusCommand,
  GetOrganizationAdminAccountCommand,
  GetSettingsCommand,
  UpdateSettingsCommand,
  DeregisterOrganizationAdminAccountCommand,
  RegisterOrganizationAdminAccountCommand,
} from '@aws-sdk/client-auditmanager';

import {
  OrganizationsClient,
  EnableAWSServiceAccessCommand,
  ListAWSServiceAccessForOrganizationCommand,
} from '@aws-sdk/client-organizations';

vi.mock('@aws-sdk/client-auditmanager');
vi.mock('@aws-sdk/client-organizations');
vi.mock('@aws-accelerator/utils/lib/throttle', () => ({
  throttlingBackOff: vi.fn(async fn => fn()),
}));

describe('enable-organization-admin-account', () => {
  let mockEvent: any;

  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

    mockEvent = {
      RequestType: 'Create',
      ResourceProperties: {
        managementAccountId: '111111111111',
        region: 'us-east-1',
        adminAccountId: '222222222222',
        kmsKeyArn: 'arn:aws:kms:us-east-1:111111111111:key/1234abcd',
        solutionId: 'SO0000',
      },
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should successfully enable audit manager and register admin account on Create', async () => {
    // When

    const mockGetAccountStatus = {
      status: AccountStatus.INACTIVE,
    };

    const mockListServiceAccess = {
      EnabledServicePrincipals: [],
    };

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve(mockGetAccountStatus);
          }
          return Promise.resolve({});
        }),
      };
    });

    (OrganizationsClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof ListAWSServiceAccessForOrganizationCommand) {
            return Promise.resolve(mockListServiceAccess);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });

    expect(OrganizationsClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(EnableAWSServiceAccessCommand).toHaveBeenCalledWith({
      ServicePrincipal: 'auditmanager.amazonaws.com',
    });
  });

  test('should update settings when audit manager is already enabled', async () => {
    // When

    const mockGetAccountStatus = {
      status: AccountStatus.ACTIVE,
    };

    const mockGetOrgAdminAccount = {
      adminAccountId: '333333333333',
    };

    const mockGetSettings = {
      settings: {
        kmsKey: 'DEFAULT',
      },
    };

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve(mockGetAccountStatus);
          }
          if (command instanceof GetOrganizationAdminAccountCommand) {
            return Promise.resolve(mockGetOrgAdminAccount);
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve(mockGetSettings);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });

    expect(UpdateSettingsCommand).toHaveBeenCalledWith({
      kmsKey: mockEvent.ResourceProperties.kmsKeyArn,
    });
  });

  test('should skip admin account registration when new and existing admin accounts are same', async () => {
    // When

    const existingAdminId = '222222222222';

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetOrganizationAdminAccountCommand) {
            return Promise.resolve({ adminAccountId: existingAdminId });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(consoleSpy).toHaveBeenCalledWith(
      `Existing delegated admin account ${existingAdminId} is same as new delegated admin account ${mockEvent.ResourceProperties.adminAccountId}, no changes in delegated admin account required`,
    );

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });

    expect(AuditManagerClient).toHaveBeenCalled();
    expect(GetOrganizationAdminAccountCommand).toHaveBeenCalled();
    expect(DeregisterOrganizationAdminAccountCommand).not.toHaveBeenCalled();
    expect(RegisterOrganizationAdminAccountCommand).not.toHaveBeenCalled();
  });

  test('should handle Delete request successfully', async () => {
    // When

    mockEvent.RequestType = 'Delete';

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should throw error when trying to set management account as admin', async () => {
    // When

    mockEvent.ResourceProperties.adminAccountId = mockEvent.ResourceProperties.managementAccountId;

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetOrganizationAdminAccountCommand) {
            return Promise.resolve({ adminAccountId: undefined });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute & Verify

    await expect(handler(mockEvent)).rejects.toThrow(
      'You cannot register management account/yourself as delegated administrator for your organization.',
    );
  });

  test('should deregister existing admin account before registering new one', async () => {
    // When

    const existingAdminId = '333333333333';

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetOrganizationAdminAccountCommand) {
            return Promise.resolve({ adminAccountId: existingAdminId });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    await handler(mockEvent);

    // Verify

    expect(DeregisterOrganizationAdminAccountCommand).toHaveBeenCalledWith({
      adminAccountId: existingAdminId,
    });
    expect(RegisterOrganizationAdminAccountCommand).toHaveBeenCalledWith({
      adminAccountId: mockEvent.ResourceProperties.adminAccountId,
    });
  });

  test('should skip KMS key update when existing and new KMS keys are same', async () => {
    // When

    const existingKmsKey = 'arn:aws:kms:us-east-1:111111111111:key/1234abcd'; // Same as mockEvent.ResourceProperties.kmsKeyArn

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve({
              settings: {
                kmsKey: existingKmsKey,
              },
            });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(consoleSpy).toHaveBeenCalledWith(
      `Existing kms key ${existingKmsKey} is same as new kms key ${mockEvent.ResourceProperties.kmsKeyArn}, no changes in encryption key required`,
    );

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });

    expect(AuditManagerClient).toHaveBeenCalled();
    expect(GetSettingsCommand).toHaveBeenCalled();
    expect(UpdateSettingsCommand).not.toHaveBeenCalled();
  });

  test('should update KMS key when existing and new KMS keys are different', async () => {
    // When

    const existingKmsKey = 'arn:aws:kms:us-east-1:111111111111:key/different-key';

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve({
              settings: {
                kmsKey: existingKmsKey,
              },
            });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    const response = await handler(mockEvent);

    // Verify

    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Existing kms key'));

    expect(UpdateSettingsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kmsKey: mockEvent.ResourceProperties.kmsKeyArn,
      }),
    );

    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  it('should skip enabling service access when audit manager is already enabled in Organizations', async () => {
    // When

    const mockListServiceAccess = {
      EnabledServicePrincipals: [
        {
          ServicePrincipal: 'auditmanager.amazonaws.com',
          DateEnabled: new Date(),
        },
      ],
    };

    (OrganizationsClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof ListAWSServiceAccessForOrganizationCommand) {
            return Promise.resolve(mockListServiceAccess);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    await handler(mockEvent);

    // Verify

    expect(EnableAWSServiceAccessCommand).not.toHaveBeenCalled();
  });

  it('should enable service access when audit manager is not enabled in Organizations', async () => {
    // When

    const mockListServiceAccess = {
      EnabledServicePrincipals: [
        {
          ServicePrincipal: 'some-other-service.amazonaws.com',
          DateEnabled: new Date(),
        },
      ],
    };

    (OrganizationsClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof ListAWSServiceAccessForOrganizationCommand) {
            return Promise.resolve(mockListServiceAccess);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    await handler(mockEvent);

    // Verify

    expect(EnableAWSServiceAccessCommand).toHaveBeenCalledWith({
      ServicePrincipal: 'auditmanager.amazonaws.com',
    });
  });

  it('should enable service access when no services are enabled in Organizations', async () => {
    // When

    const mockListServiceAccess = {
      EnabledServicePrincipals: [],
    };

    (OrganizationsClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof ListAWSServiceAccessForOrganizationCommand) {
            return Promise.resolve(mockListServiceAccess);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    await handler(mockEvent);

    // Verify

    expect(EnableAWSServiceAccessCommand).toHaveBeenCalledWith({
      ServicePrincipal: 'auditmanager.amazonaws.com',
    });
  });

  it('should handle undefined EnabledServicePrincipals', async () => {
    // When

    const mockListServiceAccess = {
      EnabledServicePrincipals: undefined,
    };

    (OrganizationsClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof ListAWSServiceAccessForOrganizationCommand) {
            return Promise.resolve(mockListServiceAccess);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute

    await handler(mockEvent);

    // Verify

    expect(EnableAWSServiceAccessCommand).toHaveBeenCalledWith({
      ServicePrincipal: 'auditmanager.amazonaws.com',
    });
  });

  test('should handle undefined kmsKeyArn without updating settings', async () => {
    // When
    delete mockEvent.ResourceProperties.kmsKeyArn;

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve({
              settings: {
                kmsKey: 'DEFAULT',
              },
            });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should handle explicitly undefined kmsKeyArn without updating settings', async () => {
    // When
    mockEvent.ResourceProperties.kmsKeyArn = undefined;

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve({
              settings: {
                kmsKey: 'DEFAULT',
              },
            });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should handle null kmsKeyArn without updating settings', async () => {
    // When
    mockEvent.ResourceProperties.kmsKeyArn = null;

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.resolve({ status: AccountStatus.ACTIVE });
          }
          if (command instanceof GetSettingsCommand) {
            return Promise.resolve({
              settings: {
                kmsKey: 'DEFAULT',
              },
            });
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });
<<<<<<< HEAD
=======

  test('should return success when Audit Manager is not available in the region (AccessDeniedException)', async () => {
    // When - Audit Manager is not available in the region, GetAccountStatus throws AccessDeniedException
    const accessDeniedError = new AccessDeniedException({
      message: 'AWS Audit Manager is not available in this region',
      $metadata: {},
    });

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.reject(accessDeniedError);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify - should gracefully return success, not throw/timeout
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should return success when Audit Manager throws AccessDeniedException on Update', async () => {
    // When - same scenario but on Update event
    mockEvent.RequestType = 'Update';

    const accessDeniedError = new AccessDeniedException({
      message: 'AWS Audit Manager is not available in this region',
      $metadata: {},
    });

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.reject(accessDeniedError);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should return success when Audit Manager throws AccessDeniedException on Delete', async () => {
    // When - service unavailable during a Delete event
    mockEvent.RequestType = 'Delete';

    const accessDeniedError = new AccessDeniedException({
      message: 'AWS Audit Manager is not available in this region',
      $metadata: {},
    });

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.reject(accessDeniedError);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute
    const response = await handler(mockEvent);

    // Verify
    expect(response).toEqual({
      Status: 'Success',
      StatusCode: 200,
    });
  });

  test('should rethrow non-AccessDeniedException errors from GetAccountStatus', async () => {
    // When - a different error occurs (not service unavailability)
    const internalError = new Error('Internal server error');

    (AuditManagerClient as any).mockImplementation(function () {
      return {
        send: vi.fn().mockImplementation(command => {
          if (command instanceof GetAccountStatusCommand) {
            return Promise.reject(internalError);
          }
          return Promise.resolve({});
        }),
      };
    });

    // Execute & Verify - should throw for non-AccessDeniedException errors
    await expect(handler(mockEvent)).rejects.toThrow('Internal server error');
  });
>>>>>>> b943486b5 (chore(deps): upgrade vitest 3.2.4 to 4.1.8)
});

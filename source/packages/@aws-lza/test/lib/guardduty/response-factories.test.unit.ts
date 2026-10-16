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

import { beforeEach, describe, expect, test } from 'vitest';
import { DestinationType } from '@aws-sdk/client-guardduty';
import {
  IGuardDutyDetectorResponse,
  IGuardDutyExportDestination,
  IGuardDutyProtectionsConfiguration,
} from '../../../lib/guardduty/interfaces';
import { GuardDutyDetectorResponseHandler } from '../../../lib/guardduty/response-factories';

describe('GuardDutyDetectorResponseHandler', () => {
  let handler: GuardDutyDetectorResponseHandler;

  beforeEach(() => {
    handler = new GuardDutyDetectorResponseHandler();
  });

  describe('create', () => {
    test('should create detector response with minimal data', () => {
      const response = handler.create('enabled', 'us-east-1', {
        accountIds: ['XXXXXXXXXXXX'],
      });

      expect(response).toEqual({
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
        protectionsConfiguration: undefined,
        exportFrequency: undefined,
        exportDestination: undefined,
      });
    });

    test('should create detector response with empty accountIds', () => {
      const response = handler.create('disabled', 'us-west-2', {
        accountIds: [],
      });

      expect(response).toEqual({
        operation: 'disabled',
        regions: ['us-west-2'],
        accountIds: [],
        protectionsConfiguration: undefined,
        exportFrequency: undefined,
        exportDestination: undefined,
      });
    });

    test('should create detector response without accountIds data', () => {
      const response = handler.create('enabled', 'eu-west-1', {});

      expect(response).toEqual({
        operation: 'enabled',
        regions: ['eu-west-1'],
        accountIds: [],
        protectionsConfiguration: undefined,
        exportFrequency: undefined,
        exportDestination: undefined,
      });
    });

    test('should create detector response with full configuration', () => {
      const mockProtections: IGuardDutyProtectionsConfiguration = {
        s3Protection: { enable: true },
        eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: true },
        ec2Protection: { enable: true, keepSnapshots: false },
        rdsProtection: { enable: true },
        lambdaProtection: { enable: true },
      };

      const mockExportDest: IGuardDutyExportDestination = {
        destinationArn: 'arn:aws:s3:::my-bucket',
        kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/test-key',
        destinationType: 'S3' as DestinationType,
      };

      const response = handler.create('enabled', 'us-east-1', {
        accountIds: ['XXXXXXXXXXXX'],
        protectionsConfiguration: mockProtections,
        exportFrequency: 'SIX_HOURS',
        exportDestination: mockExportDest,
      });

      expect(response.protectionsConfiguration).toEqual(mockProtections);
      expect(response.exportFrequency).toBe('SIX_HOURS');
      expect(response.exportDestination).toEqual(mockExportDest);
    });
  });

  describe('getIdentifier', () => {
    test('should generate correct identifier for enabled operation', () => {
      const response: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };

      expect(handler.getIdentifier(response)).toBe('enabled-detector');
    });

    test('should generate correct identifier for disabled operation', () => {
      const response: IGuardDutyDetectorResponse = {
        operation: 'disabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };

      expect(handler.getIdentifier(response)).toBe('disabled-detector');
    });
  });

  describe('canMerge', () => {
    test('should return true for same operation', () => {
      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
      };

      expect(handler.canMerge(r1, r2)).toBe(true);
    });

    test('should return false for different operations', () => {
      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'disabled',
        regions: ['us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
      };

      expect(handler.canMerge(r1, r2)).toBe(false);
    });
  });

  describe('merge', () => {
    test('should merge regions without duplicates', () => {
      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1', 'us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
      };

      const merged = handler.merge(r1, r2);
      expect(merged.regions).toEqual(['us-east-1', 'us-west-2']);
    });

    test('should merge accountIds without duplicates', () => {
      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-west-2'],
        accountIds: ['XXXXXXXXXXXX', 'YYYYYYYYYYYY'],
      };

      const merged = handler.merge(r1, r2);
      expect(merged.accountIds).toEqual(['XXXXXXXXXXXX', 'YYYYYYYYYYYY']);
    });

    test('should preserve existing protectionsConfiguration', () => {
      const mockProtections: IGuardDutyProtectionsConfiguration = {
        s3Protection: { enable: true },
      };

      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
        protectionsConfiguration: mockProtections,
        exportFrequency: 'SIX_HOURS',
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
        exportFrequency: 'FIFTEEN_MINUTES',
      };

      const merged = handler.merge(r1, r2);
      expect(merged.protectionsConfiguration).toEqual(mockProtections);
      expect(merged.exportFrequency).toBe('SIX_HOURS');
    });

    test('should use new response values when existing are undefined', () => {
      const mockExportDest: IGuardDutyExportDestination = {
        destinationArn: 'arn:aws:s3:::bucket',
        kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/key',
        destinationType: 'S3' as DestinationType,
      };

      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
        exportDestination: mockExportDest,
      };

      const merged = handler.merge(r1, r2);
      expect(merged.exportDestination).toEqual(mockExportDest);
    });

    test('should handle undefined configuration in both responses', () => {
      const r1: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-east-1'],
        accountIds: ['XXXXXXXXXXXX'],
      };
      const r2: IGuardDutyDetectorResponse = {
        operation: 'enabled',
        regions: ['us-west-2'],
        accountIds: ['YYYYYYYYYYYY'],
      };

      const merged = handler.merge(r1, r2);
      expect(merged.protectionsConfiguration).toBeUndefined();
      expect(merged.exportFrequency).toBeUndefined();
      expect(merged.exportDestination).toBeUndefined();
    });
  });
});

describe('Integration tests', () => {
  test('should work together for complete workflow', () => {
    const handler = new GuardDutyDetectorResponseHandler();

    const r1 = handler.create('enabled', 'us-east-1', {
      accountIds: ['XXXXXXXXXXXX'],
      protectionsConfiguration: { s3Protection: { enable: true } },
      exportFrequency: 'SIX_HOURS',
    });

    const r2 = handler.create('enabled', 'us-west-2', {
      accountIds: ['YYYYYYYYYYYY'],
    });

    expect(handler.canMerge(r1, r2)).toBe(true);

    const merged = handler.merge(r1, r2);
    expect(merged.regions).toEqual(['us-east-1', 'us-west-2']);
    expect(merged.accountIds).toEqual(['XXXXXXXXXXXX', 'YYYYYYYYYYYY']);
    expect(merged.exportFrequency).toBe('SIX_HOURS');
  });

  test('should handle disabled operation workflow', () => {
    const handler = new GuardDutyDetectorResponseHandler();

    const r1 = handler.create('disabled', 'us-east-1', { accountIds: ['XXXXXXXXXXXX'] });
    const r2 = handler.create('disabled', 'eu-central-1', { accountIds: ['YYYYYYYYYYYY'] });

    expect(handler.canMerge(r1, r2)).toBe(true);

    const merged = handler.merge(r1, r2);
    expect(merged.regions).toEqual(['us-east-1', 'eu-central-1']);
    expect(merged.accountIds).toEqual(['XXXXXXXXXXXX', 'YYYYYYYYYYYY']);
  });
});

/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  GlobalConfig,
  AccessLogBucketConfig,
  CentralLogBucketConfig,
  CostAndUsageReportConfig,
  BudgetReportConfig,
  ServiceQuotaLimitsConfig,
} from '../lib/global-config';
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

describe('GlobalConfig', () => {
  describe('Test config', () => {
    // it('has loaded successfully', () => {
    //   const globalConfig = new GlobalConfig({
    //     homeRegion: 'us-east-1',
    //   });
    //   const globalConfigFromFile = GlobalConfig.load(path.resolve('../accelerator/test/configs/all-enabled'), true);

    //   expect(globalConfig.accountNames).toStrictEqual([]);
    //   expect(globalConfigFromFile.accountNames).toStrictEqual([
    //     'Management',
    //     'LogArchive',
    //     'Audit',
    //     'SharedServices',
    //     'Network',
    //   ]);
    // });

    it('loads from string', () => {
      const buffer = fs.readFileSync(
        path.join('../accelerator/test/configs/all-enabled', GlobalConfig.FILENAME),
        'utf8',
      );
      const globalConfigFromString = GlobalConfig.loadFromString(buffer);
      if (!globalConfigFromString) {
        throw new Error('globalConfigFromString is not defined');
      }
      // expect(globalConfigFromString.accountNames).toStrictEqual([]);

      //expect(GlobalConfig.loadFromString('corrupt str')).toBe(undefined);
    });

    it('has an empty list of lifecycle rules', () => {
      const accessLogBucketConfig = new AccessLogBucketConfig();
      expect(accessLogBucketConfig.lifecycleRules).toStrictEqual([]);

      const centralLogBucketConfig = new CentralLogBucketConfig();
      expect(centralLogBucketConfig.lifecycleRules).toStrictEqual([]);
    });

    it('tests CostAndUsageReportConfig', () => {
      const curConfig = new CostAndUsageReportConfig();
      expect(curConfig.additionalSchemaElements).toStrictEqual(['']);
      expect(curConfig.compression).toEqual('');
      expect(curConfig.format).toEqual('');
      expect(curConfig.reportName).toEqual('');
      expect(curConfig.reportName).toEqual('');
      expect(curConfig.s3Prefix).toEqual('');
      expect(curConfig.timeUnit).toEqual('');
      expect(curConfig.additionalArtifacts).toBe(undefined);
      expect(curConfig.refreshClosedReports).toBe(true);
      expect(curConfig.reportVersioning).toEqual('');
      expect(curConfig.lifecycleRules).toBe(undefined);
    });

    it('tests BudgetReportConfig', () => {
      const brConfig = new BudgetReportConfig();
      expect(brConfig.amount).toStrictEqual(2000);
      expect(brConfig.name).toEqual('');
      expect(brConfig.type).toEqual('');
      expect(brConfig.subscriptionType).toEqual('');
      expect(brConfig.unit).toEqual('');
      expect(brConfig.timeUnit).toEqual('');
      expect(brConfig.includeUpfront).toBe(true);
      expect(brConfig.includeTax).toBe(true);
      expect(brConfig.includeSupport).toBe(true);
      expect(brConfig.includeRecurring).toBe(true);
      expect(brConfig.includeDiscount).toBe(true);
      expect(brConfig.includeRefund).toBe(false);
      expect(brConfig.includeCredit).toBe(false);
      expect(brConfig.useAmortized).toBe(false);
      expect(brConfig.useBlended).toBe(false);
    });

    it('tests ServiceQuotaLimitsConfig', () => {
      const serviceQuotaLimitsConfig = new ServiceQuotaLimitsConfig();
      expect(serviceQuotaLimitsConfig.serviceCode).toEqual('');
      expect(serviceQuotaLimitsConfig.quotaCode).toEqual('');
      expect(serviceQuotaLimitsConfig.desiredValue).toEqual(2000);
      expect(serviceQuotaLimitsConfig.deploymentTargets).toEqual({
        accounts: [],
        excludedAccounts: [],
        excludedRegions: [],
        organizationalUnits: [],
      });
    });
  });
});

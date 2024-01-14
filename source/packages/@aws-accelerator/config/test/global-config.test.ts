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

import {
  GlobalConfig,
  CostAndUsageReportConfig,
  BudgetReportConfig,
  ServiceQuotaLimitsConfig,
  SsmParameterConfig,
  SsmParametersConfig,
  SsmInventoryConfig,
  AcceleratorSettingsConfig,
  AcceleratorMetadataConfig,
  SnsConfig,
  SnsTopicConfig,
  BackupConfig,
  VaultConfig,
  ReportConfig,
  externalLandingZoneResourcesConfig,
  centralizeCdkBucketsConfig,
  AccountCloudTrailConfig,
  AccessLogBucketConfig,
  CentralLogBucketConfig,
  ElbLogBucketConfig,
  CloudWatchLogsExclusionConfig,
  CloudWatchLogsConfig,
} from '../lib/global-config';
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

describe('GlobalConfig', () => {
  describe('Test config', () => {
    it('has loaded successfully', () => {
      // const globalConfig = new GlobalConfig({
      //   homeRegion: 'us-east-1',
      // });
      const globalConfigFromFile = GlobalConfig.load(path.resolve('../accelerator/test/configs/snapshot-only'));

      expect(globalConfigFromFile.ssmParameters?.length).toBe(1);
      expect(globalConfigFromFile.ssmParameters?.at(0)?.parameters?.at(0)?.name).toBe('parameterTest');
      expect(globalConfigFromFile.ssmParameters?.at(0)?.parameters?.at(0)?.path).toBe('/my/parameter/structure');
      expect(globalConfigFromFile.ssmParameters?.at(0)?.parameters?.at(0)?.value).toBe('parameterTestValue');

      //   expect(globalConfig.accountNames).toStrictEqual([]);
      //   expect(globalConfigFromFile.accountNames).toStrictEqual([
      //     'Management',
      //     'LogArchive',
      //     'Audit',
      //     'SharedServices',
      //     'Network',
      //   ]);
    });

    it('loads from string', () => {
      const buffer = fs.readFileSync(
        path.join('../accelerator/test/configs/snapshot-only', GlobalConfig.FILENAME),
        'utf8',
      );
      const globalConfigFromString = GlobalConfig.loadFromString(buffer);
      if (!globalConfigFromString) {
        throw new Error('globalConfigFromString is not defined');
      }
      // expect(globalConfigFromString.accountNames).toStrictEqual([]);

      //expect(GlobalConfig.loadFromString('corrupt str')).toBe(undefined);
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
    it('test static types', () => {
      expect(new AccessLogBucketConfig().lifecycleRules).toEqual(undefined);
      expect(new CentralLogBucketConfig().lifecycleRules).toEqual(undefined);
      expect(new ElbLogBucketConfig().lifecycleRules).toEqual(undefined);
      expect(new CloudWatchLogsExclusionConfig().regions).toEqual(undefined);
      expect(new CloudWatchLogsConfig().enable).toEqual(undefined);

      expect(new centralizeCdkBucketsConfig().enable).toEqual(true);
      expect(new AccountCloudTrailConfig().regions).toEqual([]);
      expect(new externalLandingZoneResourcesConfig().mappingFileBucket).toEqual('');
      expect(new ReportConfig().budgets).toEqual([]);
      expect(new VaultConfig().policy).toEqual('');
      expect(new SsmParameterConfig().name).toEqual('');
      expect(new SsmParametersConfig().parameters).toEqual([]);
      expect(new SsmInventoryConfig().enable).toBeFalsy;

      expect(new AcceleratorSettingsConfig().maxConcurrentStacks).toBeUndefined;

      expect(new AcceleratorMetadataConfig().enable).toBeFalsy;
      expect(new SnsConfig().topics).toEqual([]);
      expect(new SnsTopicConfig().emailAddresses).toEqual([]);
      expect(new BackupConfig().vaults).toEqual([]);
    });
  });
});

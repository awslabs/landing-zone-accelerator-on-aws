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

import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  SecurityConfig,
  KeyConfig,
  GuardDutyEksProtectionConfig,
  AuditManagerDefaultReportsDestinationConfig,
  AuditManagerConfig,
  DetectiveConfig,
  SecurityHubStandardConfig,
  SecurityHubLoggingCloudwatchConfig,
  SecurityHubLoggingConfig,
  SnsSubscriptionConfig,
  DocumentConfig,
  DocumentSetConfig,
  AwsConfigAggregation,
  ConfigRule,
  AwsConfigRuleSet,
  MetricConfig,
  MetricSetConfig,
  AlarmConfig,
  AlarmSetConfig,
  EncryptionConfig,
  LogGroupsConfig,
  IsPublicSsmDoc,
} from '../lib/security-config';

describe('SecurityConfig', () => {
  describe('Test config', () => {
    const securityConfigFromFile = SecurityConfig.load(path.resolve('../accelerator/test/configs/snapshot-only'));
    it('has loaded successfully', () => {
      expect(securityConfigFromFile.getDelegatedAccountName()).toBe('Audit');
    });

    expect(new KeyConfig().name).toEqual('');

    expect(new GuardDutyEksProtectionConfig().enable).toBe(false);

    expect(new AuditManagerDefaultReportsDestinationConfig().enable).toBe(false);

    expect(new AuditManagerConfig().enable).toBe(false);

    expect(new DetectiveConfig().enable).toBe(false);

    expect(new SecurityHubStandardConfig().enable).toBe(true);

    expect(new SecurityHubLoggingCloudwatchConfig().enable).toBe(true);

    expect(new SecurityHubLoggingConfig().cloudWatch).toBe(undefined);

    expect(new SnsSubscriptionConfig().email).toBe('');

    expect(new DocumentConfig().name).toBe('');

    expect(new DocumentSetConfig().documents).toStrictEqual([]);

    expect(new AwsConfigAggregation().enable).toBe(true);

    expect(new ConfigRule().name).toBe('');

    expect(new AwsConfigRuleSet().rules).toStrictEqual([]);

    expect(new MetricConfig().filterName).toBe('');

    expect(new MetricSetConfig().regions).toBeUndefined;

    expect(new AlarmConfig().alarmName).toBe('');

    expect(new AlarmSetConfig().regions).toBeUndefined;

    expect(new EncryptionConfig().kmsKeyName).toBeUndefined;

    expect(new LogGroupsConfig().encryption).toBeUndefined;
  });
});

describe('should throw an exception for wrong config', () => {
  function loadError() {
    SecurityConfig.loadFromString('some random string');
  }

  const errMsg = 'could not load configuration';
  expect(loadError).toThrow(new Error(errMsg));
});

describe('should return right values for correct config', () => {
  const buffer = fs.readFileSync(
    path.join(path.resolve('../accelerator/test/configs/snapshot-only'), SecurityConfig.FILENAME),
    'utf8',
  );
  const securityConfigFromString = SecurityConfig.loadFromString(buffer);
  expect(securityConfigFromString?.awsConfig.enableConfigurationRecorder).toBe(true);
});

describe('isPublicSsmDoc', () => {
  expect(IsPublicSsmDoc('AWSDoc')).toBeFalsy(); // not public doc
  expect(IsPublicSsmDoc('Doc')).toBeFalsy(); // not public doc
  expect(IsPublicSsmDoc('AWSAccelerator-Attach-IAM-Instance-Profile')).toBeFalsy(); // not public doc
  expect(IsPublicSsmDoc('AWS-AWSAccelerator-Attach-IAM-Instance-Profile')).toBeTruthy(); //public doc
});

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

import * as cdk from 'aws-cdk-lib';
import { CreateCertificate } from '../../lib/aws-certificate-manager/create-certificate';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(CreateCertificate): ';
//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

/**
 * CloudWatchDestination construct test
 */
describe('RequestCertificate', () => {
  new CreateCertificate(stack, 'RequestCertificate', {
    name: 'requestCert',
    type: 'request',
    validation: 'DNS',
    domain: '*.example.com',
    san: ['e.co', '*.example.net'],
    cloudWatchLogsKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyImportCert', {}),
    logRetentionInDays: 363,
    homeRegion: 'us-east-1',
    assetBucketName: 'aws-accelerator-assets',
    assetFunctionRoleName: 'AWSAccelerator-AssetsAccessRole',
  });
  snapShotTest(testNamePrefix, stack);
});

describe('ImportCertificate', () => {
  new CreateCertificate(stack, 'ImportCertificate', {
    name: 'importCert',
    type: 'import',
    privKey: 'cert/privKey.pem',
    cert: 'cert/cert.crt',
    chain: 'cert/chain.csr',
    cloudWatchLogsKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyRequestCert', {}),
    logRetentionInDays: 363,
    homeRegion: 'us-east-1',
    assetBucketName: 'aws-accelerator-assets',
    assetFunctionRoleName: 'AWSAccelerator-AssetsAccessRole',
  });
  snapShotTest(testNamePrefix, stack);
});

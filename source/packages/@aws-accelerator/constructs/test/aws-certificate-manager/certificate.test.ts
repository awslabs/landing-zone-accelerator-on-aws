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
import { Certificate } from '../../lib/aws-certificate-manager/certificate';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(Certificate): ';
//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

/**
 * Certificate construct test
 */
describe('Certificate', () => {
  new Certificate(stack, 'RequestCertificate', {
    parameterName: '/accelerator/acm/requestCert/arn',
    type: 'request',
    validation: 'DNS',
    domain: '*.example.com',
    san: ['e.co', '*.example.net'],
    homeRegion: 'us-east-1',
    assetBucketName: 'aws-accelerator-assets',
    assetFunctionRoleName: 'AWSAccelerator-AssetsAccessRole',
    cloudWatchLogsKmsKey: new cdk.aws_kms.Key(stack, 'RequestCertificateCloudWatchKey', {}),
    logRetentionInDays: 365,
  });
  snapShotTest(testNamePrefix, stack);
});

describe('ImportCertificate', () => {
  new Certificate(stack, 'ImportCertificate', {
    parameterName: '/accelerator/acm/importCert/arn',
    type: 'import',
    privKey: 'cert/privKey.pem',
    cert: 'cert/cert.crt',
    chain: 'cert/chain.csr',
    homeRegion: 'us-east-1',
    assetBucketName: 'aws-accelerator-assets',
    assetFunctionRoleName: 'AWSAccelerator-AssetsAccessRole',
    cloudWatchLogsKmsKey: new cdk.aws_kms.Key(stack, 'ImportCertificateCloudWatchKey', {}),
    logRetentionInDays: 365,
  });
  snapShotTest(testNamePrefix, stack);
});

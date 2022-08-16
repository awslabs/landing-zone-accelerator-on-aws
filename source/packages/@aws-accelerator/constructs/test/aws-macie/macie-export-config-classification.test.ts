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
import { MacieExportConfigClassification } from '../../lib/aws-macie/macie-export-config-classification';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(MacieExportConfigClassification): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new MacieExportConfigClassification(stack, 'AwsMacieUpdateExportConfigClassification', {
  bucketName: 'bucketName',
  keyPrefix: `111111111111-aws-macie-export-config`,
  logRetentionInDays: 3653,
  bucketKmsKey: new cdk.aws_kms.Key(stack, 'BucketKey', {}),
  logKmsKey: new cdk.aws_kms.Key(stack, 'LogKey', {}),
});

/**
 * MacieExportConfigClassification construct test
 */
describe('MacieExportConfigClassification', () => {
  snapShotTest(testNamePrefix, stack);
});

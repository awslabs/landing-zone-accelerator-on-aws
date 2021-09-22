/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { countResources, expect as expectCDK } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import { test } from '@jest/globals';
import * as compliant_constructs from '../index';

/*
 * Example test
 */
test('compliant_constructs.SecureS3Bucket', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  // WHEN
  new compliant_constructs.SecureS3Bucket(stack, 'MyTestConstruct', {
    kmsDescription: 'secure-s3-bucket-description',
    s3BucketName: 'test-bucket',
    kmsAliasName: 'test-bucket-alias',
  });
  // THEN
  expectCDK(stack).to(countResources('AWS::SNS::Topic', 0));
});

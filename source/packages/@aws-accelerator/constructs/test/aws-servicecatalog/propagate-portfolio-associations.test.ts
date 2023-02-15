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
import { PropagatePortfolioAssociations } from '../../lib/aws-servicecatalog/propagate-portfolio-associations';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';
import { PortfolioConfig } from '@aws-accelerator/config';

const testNamePrefix = 'Construct(PropagatePortfolioAssociations): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const portfolioItem = new PortfolioConfig();

new PropagatePortfolioAssociations(stack, 'PropagatePortfolioAssociations', {
  portfolioId: 'portfolioId',
  shareAccountIds: ['222222222222', '333333333333'],
  crossAccountRole: 'AWSAccelerator-CrossAccount-ServiceCatalog-Role',
  portfolioDefinition: portfolioItem,
  logRetentionInDays: 3653,
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
});

/**
 * PropagatePortfolioAssociations construct test
 */
describe('PropagatePortfolioAssociations', () => {
  snapShotTest(testNamePrefix, stack);
});

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

import * as cdk from 'aws-cdk-lib';

import { DiagnosticsPackStack } from '../lib/stacks/diagnostics-pack-stack';
import { snapShotTest } from './snapshot-test';
import { describe, it } from 'vitest';
import { Template, Match } from 'aws-cdk-lib/assertions';

const testNamePrefix = 'Construct(DiagnosticsPackStack): ';

/**
 * DiagnosticsPack Stack
 */
const getStack = () => {
  const app = new cdk.App();
  const stack = new DiagnosticsPackStack(app, 'DiagnosticsPackStack', {
    acceleratorPrefix: 'AWSAccelerator',
    ssmParamPrefix: '/accelerator',
    bucketNamePrefix: 'aws-accelerator',
    installerStackName: 'AWSAccelerator-InstallerStack',
    configRepositoryName: 'aws-accelerator-config',
    configRepositoryLocation: 'codecommit',
    configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
    qualifier: 'aws-accelerator',
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
  });
  return stack;
};

/**
 * DiagnosticsPack Stack with S3 configuration source
 */
const getS3ConfigStack = () => {
  const app = new cdk.App();
  const stack = new DiagnosticsPackStack(app, 'DiagnosticsPackStackS3Config', {
    acceleratorPrefix: 'AWSAccelerator',
    ssmParamPrefix: '/accelerator',
    bucketNamePrefix: 'aws-accelerator',
    installerStackName: 'AWSAccelerator-InstallerStack',
    configRepositoryName: 'aws-accelerator-config',
    configRepositoryLocation: 's3',
    configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
  });
  return stack;
};
describe('DiagnosticsPackStack', () => {
  snapShotTest(testNamePrefix, getStack);
});

describe('DiagnosticsPackStackS3Config', () => {
  snapShotTest(testNamePrefix, getS3ConfigStack);
});

/**
 * DiagnosticsPack Stack with codeconnection configuration source
 */
const getCodeConnectionConfigStack = () => {
  const app = new cdk.App();
  const stack = new DiagnosticsPackStack(app, 'DiagnosticsPackStackCodeConnectionConfig', {
    acceleratorPrefix: 'AWSAccelerator',
    ssmParamPrefix: '/accelerator',
    bucketNamePrefix: 'aws-accelerator',
    installerStackName: 'AWSAccelerator-InstallerStack',
    configRepositoryName: 'aws-accelerator-config',
    configRepositoryLocation: 'codeconnection',
    configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
  });
  return stack;
};

describe('DiagnosticsPackStackCodeConnectionConfig', () => {
  snapShotTest(testNamePrefix, getCodeConnectionConfigStack);
});

/**
 * Targeted IAM assertions for the codeconnection support. These do not rely on
 * the snapshot (which can be regenerated blindly) and lock in the specific
 * permissions the diagnostics Lambda needs to read config from the pipeline
 * artifact bucket.
 */
describe('DiagnosticsPackStack codeconnection IAM', () => {
  it('grants pipeline artifact bucket read and codepipeline list permissions', () => {
    const template = Template.fromStack(getCodeConnectionConfigStack());

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PipelineArtifactBucketReadAccess',
            Action: 's3:GetObject',
          }),
          Match.objectLike({
            Sid: 'CodepipelineAccess',
            Action: Match.arrayWith([
              'codepipeline:GetPipelineState',
              'codepipeline:ListPipelineExecutions',
              'codepipeline:ListActionExecutions',
            ]),
          }),
        ]),
      },
    });
  });
});

/**
 * DiagnosticsPack Stack with codeconnection source and a qualifier (external
 * pipeline deployment). Exercises the qualifier branch that derives the pipeline
 * artifact bucket name.
 */
const getCodeConnectionQualifierStack = () => {
  const app = new cdk.App();
  const stack = new DiagnosticsPackStack(app, 'DiagnosticsPackStackCodeConnectionQualifier', {
    acceleratorPrefix: 'AWSAccelerator',
    ssmParamPrefix: '/accelerator',
    bucketNamePrefix: 'aws-accelerator',
    installerStackName: 'AWSAccelerator-InstallerStack',
    configRepositoryName: 'aws-accelerator-config',
    configRepositoryLocation: 'codeconnection',
    configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
    qualifier: 'myqual',
    env: {
      account: '000000000000',
      region: 'us-east-1',
    },
  });
  return stack;
};

describe('DiagnosticsPackStackCodeConnectionQualifier', () => {
  snapShotTest(testNamePrefix, getCodeConnectionQualifierStack);

  it('scopes the pipeline artifact bucket read to the qualifier-prefixed bucket', () => {
    const template = Template.fromStack(getCodeConnectionQualifierStack());

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PipelineArtifactBucketReadAccess',
            Resource: {
              'Fn::Join': ['', Match.arrayWith([Match.stringLikeRegexp('myqual-pipeline-000000000000-us-east-1/\\*')])],
            },
          }),
        ]),
      },
    });
  });
});

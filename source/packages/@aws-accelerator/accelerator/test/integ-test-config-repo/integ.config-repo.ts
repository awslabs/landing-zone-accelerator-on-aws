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

/**
 * Steps to run
 * - install cdk in the account and bootstrap it
 * - from source run
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/accelerator/test/integ-test-config-repo --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import * as config_repository from '../../lib/config-repository';

/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}

// CDK App for Integration Tests
const app = new cdk.App();

export class ConfigRepoIntegTestStack extends cdk.Stack {
  public managementAccountEmail: string;
  public logArchiveAccountEmail: string;
  public auditAccountEmail: string;
  public repositoryName: string;
  public configBucketName: string;
  public serverAccessLogsBucketName: string;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.managementAccountEmail = 'manager@example.com';
    this.logArchiveAccountEmail = 'logs@example.com';
    this.auditAccountEmail = 'audit@example.com';
    this.repositoryName = 'aws-accelerator-config-integ';
    this.configBucketName = `aws-accelerator-config-integ-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;
    this.serverAccessLogsBucketName = `aws-accelerator-s3-access-logs-integ-${cdk.Stack.of(this).account}-${
      cdk.Stack.of(this).region
    }`;

    new config_repository.CodeCommitConfigRepository(this, 'CodeCommitConfigRepository', {
      repositoryName: this.repositoryName,
      repositoryBranchName: 'main',
      description:
        'AWS Accelerator configuration repository, created and initialized with default config file by pipeline',
      managementAccountEmail: this.managementAccountEmail,
      logArchiveAccountEmail: this.logArchiveAccountEmail,
      auditAccountEmail: this.auditAccountEmail,
      controlTowerEnabled: 'true',
      controlTowerLandingZoneConfig: {
        version: '3.3',
        logging: {
          loggingBucketRetentionDays: 365,
          accessLoggingBucketRetentionDays: 3650,
          organizationTrail: true,
        },
        security: { enableIdentityCenterAccess: true },
      },
      enableSingleAccountMode: false,
    });

    // new cdk.aws_s3.Bucket(this, 'ConfigBucket', {
    //   bucketName: this.configBucketName,
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    //   autoDeleteObjects: true,
    // });

    // new config_repository.S3ConfigRepository(this, 'S3ConfigRepository', {
    //   configBucketName: this.configBucketName,
    //   description:
    //     'AWS Accelerator configuration repository, created and initialized with default config file by pipeline',
    //   managementAccountEmail: this.managementAccountEmail,
    //   logArchiveAccountEmail: this.logArchiveAccountEmail,
    //   auditAccountEmail: this.auditAccountEmail,
    //   controlTowerEnabled: 'true',
    //   controlTowerLandingZoneConfig: {
    //     version: '3.3',
    //     logging: {
    //       loggingBucketRetentionDays: 365,
    //       accessLoggingBucketRetentionDays: 3650,
    //       organizationTrail: true,
    //     },
    //     security: { enableIdentityCenterAccess: true },
    //   },
    //   enableSingleAccountMode: false,
    //   installerKey: new cdk.aws_kms.Key(this, 'InstallerKey', {}),
    //   serverAccessLogsBucketName: 'server-access-logging-bucket',
    // });

    cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
  }
}

// Stack under test
const stackUnderTest = new ConfigRepoIntegTestStack(app, 'ConfigRepoIntegTestStack', {
  description: 'This stack includes the application resources for integration testing.',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'AspectIntegTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

// test that the repo is created with the correct name
integ.assertions.awsApiCall('CodeCommit', 'GetRepository', { repositoryName: stackUnderTest.repositoryName }).expect(
  ExpectedResult.objectLike({
    repositoryMetadata: { repositoryName: stackUnderTest.repositoryName },
  }),
);

// Can't compare actual fileContent with getFile because response exceeds 4kb limit
// https://github.com/aws/aws-cdk/issues/24490
// test the correct files exist in the repo
integ.assertions
  .awsApiCall('CodeCommit', 'GetFolder', { repositoryName: stackUnderTest.repositoryName, folderPath: '/' })
  .expect(
    ExpectedResult.objectLike({
      files: [
        {
          absolutePath: 'accounts-config.yaml',
        },
        {
          absolutePath: 'global-config.yaml',
        },
        {
          absolutePath: 'iam-config.yaml',
        },
        {
          absolutePath: 'network-config.yaml',
        },
        {
          absolutePath: 'organization-config.yaml',
        },
        {
          absolutePath: 'security-config.yaml',
        },
      ],
    }),
  );

// test that the s3 files match expected
const s3ApiCall = integ.assertions
  .awsApiCall('S3', 'listObjectsV2', { Bucket: stackUnderTest.configBucketName })
  .expect(
    ExpectedResult.objectLike({
      Contents: [
        {
          Key: 'zipped/aws-accelerator-config.zip',
        },
      ],
    }),
  );

s3ApiCall.provider.addToRolePolicy({
  Effect: 'Allow',
  Action: ['s3:GetObject', 's3:ListBucket'],
  Resource: ['*'],
});

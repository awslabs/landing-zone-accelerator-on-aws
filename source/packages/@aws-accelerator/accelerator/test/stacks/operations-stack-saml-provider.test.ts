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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CloudWatchLogsConfig,
  GlobalConfig,
  LoggingConfig,
  ProviderConfig,
  RoleConfig,
  RoleSetConfig,
} from '@aws-accelerator/config';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OperationsStack, OperationsStackProps } from '../../lib/stacks/operations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

const METADATA_FILE = 'saml-metadata.xml';
// SamlProvider requires a metadata document of at least 1000 characters
const METADATA_DOCUMENT = `<?xml version="1.0"?><EntityDescriptor entityID="https://idp.example.com"><!--${'x'.repeat(
  1000,
)}--></EntityDescriptor>`;

let app: cdk.App;
let configDirPath: string;

beforeAll(() => {
  configDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-stack-saml-'));
  fs.writeFileSync(path.join(configDirPath, METADATA_FILE), METADATA_DOCUMENT);
});

afterAll(() => {
  fs.rmSync(configDirPath, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(OperationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  vi.spyOn(OperationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  vi.spyOn(OperationsStack.prototype, 'getAcceleratorKey').mockImplementation(() => undefined);
  vi.spyOn(OperationsStack.prototype, 'isIncluded').mockImplementation(() => true);
  app = new cdk.App();
});

describe('OperationsStack SAML provider role trust', () => {
  test.each([
    ['aws', 'us-east-1', 'https://signin.aws.amazon.com/saml'],
    ['aws-cn', 'cn-north-1', 'https://signin.amazonaws.cn/saml'],
    ['aws-eusc', 'eusc-de-east-1', 'https://eusc-de-east-1.signin.amazonaws-eusc.eu/saml'],
  ])('sets the %s sign-in endpoint as SAML:aud in %s', (partition, region, expectedAudience) => {
    const template = Template.fromStack(createStackWithSamlRole(partition, region));

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'saml-role',
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRoleWithSAML',
            Effect: 'Allow',
            Condition: { StringEquals: { 'SAML:aud': expectedAudience } },
            Principal: { Federated: { Ref: Match.stringLikeRegexp('^CorporateIdPSamlProvider') } },
          },
        ],
      },
    });
  });

  test('throws a clear error when the role references an undefined SAML provider', () => {
    expect(() => createStackWithSamlRole('aws-eusc', 'eusc-de-east-1', 'MissingIdP')).toThrow(
      'SAML provider MissingIdP not found',
    );
  });
});

function createStackWithSamlRole(partition: string, region: string, providerName = 'CorporateIdP') {
  const role = {
    name: 'saml-role',
    assumedBy: [{ type: 'provider', principal: providerName }],
    policies: { awsManaged: ['ReadOnlyAccess'] },
  } as RoleConfig;

  const overrideProps = {
    partition,
    configDirPath,
    env: { account: '00000001', region },
    globalConfig: {
      homeRegion: region,
      logging: {
        cloudwatchLogs: {} as CloudWatchLogsConfig,
        sessionManager: { sendToCloudWatchLogs: false, sendToS3: false },
        cloudtrail: { enable: false },
      } as LoggingConfig,
    } as GlobalConfig,
    iamConfig: {
      providers: [{ name: 'CorporateIdP', metadataDocument: METADATA_FILE } as ProviderConfig],
      roleSets: [{ roles: [role], deploymentTargets: { accounts: ['100000'] } } as unknown as RoleSetConfig],
    },
  } as AcceleratorStackProps;

  const props = createAcceleratorStackProps(overrideProps);
  return new OperationsStack(app, `test-stack-saml-${partition}`, props as OperationsStackProps);
}

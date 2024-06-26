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
import { getCloudFormationTemplate } from '../lib/get-template';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import {
  CloudFormationClient,
  GetTemplateCommand,
  CloudFormationServiceException,
  ChangeSetNotFoundException,
} from '@aws-sdk/client-cloudformation';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { expect, it, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

let cfnMock: AwsClientStub<CloudFormationClient>;
let stsMock: AwsClientStub<STSClient>;
beforeEach(() => {
  cfnMock = mockClient(CloudFormationClient);
  stsMock = mockClient(STSClient);
});
afterEach(() => {
  cfnMock.reset();
  stsMock.reset();
});

it('same account, template is valid', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'stack1';
  const template = '{"a":"b"}';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand).resolves({ TemplateBody: template });

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe(template);

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('cross account, template is valid', async () => {
  //Given
  const currentAccountId = '012345678910';
  const crossAccountId = '123456789012';
  const stackName = 'stack2';
  const template = '{"a":"b"}';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: crossAccountId });
  stsMock.on(AssumeRoleCommand).resolves({
    Credentials: {
      AccessKeyId: 'ASIAIOSFODNN7EXAMPLE',
      SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      SessionToken: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      Expiration: undefined,
    },
  });
  cfnMock.on(GetTemplateCommand).resolves({ TemplateBody: template });

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe(template);

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('same account - custom stack, template is valid', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'customStack1-custom-stack-account-region';
  const customStackName = 'customStack1';
  const template = '{"a":"b"}';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand, { StackName: stackName, TemplateStage: 'Processed' }).rejects();
  cfnMock
    .on(GetTemplateCommand, { StackName: customStackName, TemplateStage: 'Original' })
    .resolves({ TemplateBody: template });

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    'customizations',
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe(template);

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('same account, cfn error 1', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'stack1CfnError1';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand).rejects(
    new CloudFormationServiceException({
      $metadata: { httpStatusCode: 400 },
      name: 'name',
      $fault: 'server',
      message: `Stack with id ${stackName} does not exist`,
    }),
  );

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe('{}');

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('same account, cfn gives string', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'stack1CfnError2';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand).resolves(
    new ChangeSetNotFoundException({
      $metadata: { httpStatusCode: 400 },
      message: 'message',
    }),
  );

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe('{}');

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('same account, cfn responds with non json string', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'stackErr1';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand).resolves({ TemplateBody: 'string' });

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe('{}');

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

it('same account, cfn responds with non json undefined', async () => {
  //Given
  const currentAccountId = '123456789012';
  const stackName = 'stackErr2';
  stsMock.on(GetCallerIdentityCommand).resolves({ Account: currentAccountId });
  stsMock.on(AssumeRoleCommand).resolves({});
  cfnMock.on(GetTemplateCommand).resolves({ TemplateBody: undefined });

  //when
  await getCloudFormationTemplate(
    currentAccountId,
    'region',
    'aws',
    undefined,
    stackName,
    path.resolve(__dirname),
    'roleNames',
  );
  const content = fs.readFileSync(path.join(__dirname, `${stackName}.json`), 'utf-8');

  // then
  expect(content.toString()).toBe('{}');

  //clean up
  fs.rmSync(path.join(__dirname, `${stackName}.json`));
});

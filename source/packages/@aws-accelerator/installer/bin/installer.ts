#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import * as installer from '../lib/installer-stack';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks());

const useExternalPipelineAccount = app.node.tryGetContext('use-external-pipeline-account') === 'true';
const enableTester = app.node.tryGetContext('enable-tester') === 'true';
const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');

if (enableTester && managementCrossAccountRoleName === undefined) {
  console.log(`Invalid --management-cross-account-role-name ${managementCrossAccountRoleName}`);
  throw new Error(
    'Usage: app.ts [--context use-external-pipeline-account=BOOLEAN] [--context enable-tester=BOOLEAN] [--context management-cross-account-role-name=MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME]',
  );
}

new installer.InstallerStack(app, 'AWSAccelerator-InstallerStack', {
  description: `(SO0199) Landing Zone Accelerator on AWS`,
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  useExternalPipelineAccount: useExternalPipelineAccount,
  enableTester: enableTester,
  managementCrossAccountRoleName: managementCrossAccountRoleName,
});

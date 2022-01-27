#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as installer from '../lib/installer-stack';

const app = new cdk.App();
const useExternalPipelineAccount = app.node.tryGetContext('use-external-pipeline-account') === 'true';
const enableTester = app.node.tryGetContext('enable-tester') === 'true';
const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');

if (enableTester && managementCrossAccountRoleName === undefined) {
  console.log(`Invalid --management-cross-account-role-name ${managementCrossAccountRoleName}`);
  throw new Error(
    'Usage: app.ts [--context use-external-pipeline-account=BOOLEAN] [--context enable-tester=BOOLEAN] [--context managementCrossAccountRoleName=MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME]',
  );
}

new installer.InstallerStack(app, 'AWSAccelerator-InstallerStack', {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  useExternalPipelineAccount: useExternalPipelineAccount,
  enableTester: enableTester,
  managementCrossAccountRoleName: managementCrossAccountRoleName,
});

#!/usr/bin/env node
import 'source-map-support/register';
import { version } from '../../../../package.json';
import * as cdk from 'aws-cdk-lib';
import { GovCloudAccountVendingStack } from '../lib/govcloud-avm-stack';

const app = new cdk.App();
new GovCloudAccountVendingStack(app, 'AWSAccelerator-GovCloudAccountVending', {
  description: `(SO0199-govcloudavm) Landing Zone Accelerator on AWS. Version ${version}.`,
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as installer from '../lib/installer-stack';

const app = new cdk.App();

new installer.InstallerStack(app, 'AWSAccelerator-InstallerStack', {});

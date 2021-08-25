#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { InstallerStack } from '../lib/installer-stack';

const app = new cdk.App();

new InstallerStack(app, 'InstallerStack', {});

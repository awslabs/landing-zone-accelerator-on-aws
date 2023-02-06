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

import { Plugin, PluginHost } from 'aws-cdk/lib/api/plugin';
import * as AWS from 'aws-sdk';

import { AssumeRoleProviderSource } from './assume-role-provider-source';

export class AssumeProfilePlugin implements Plugin {
  readonly version = '1';

  constructor(
    private readonly props: {
      region?: string;
      assumeRoleName?: string;
      assumeRoleDuration?: number;
      credentials?: AWS.STS.Credentials;
      partition?: string;
      caBundlePath?: string;
    } = {},
  ) {}

  init(host: PluginHost): void {
    const source = new AssumeRoleProviderSource({
      name: 'cdk-assume-role-plugin',
      assumeRoleName: this.props.assumeRoleName ?? AssumeProfilePlugin.getDefaultAssumeRoleName(),
      assumeRoleDuration: this.props.assumeRoleDuration ?? AssumeProfilePlugin.getDefaultAssumeRoleDuration(),
      region: this.props.region!,
      credentials: this.props.credentials,
      partition: this.props.partition,
      caBundlePath: this.props.caBundlePath,
    });
    host.registerCredentialProviderSource(source);
  }

  static getDefaultAssumeRoleName(): string {
    return process.env['CDK_PLUGIN_ASSUME_ROLE_NAME']!;
  }

  static getDefaultAssumeRoleDuration(): number {
    if (process.env['CDK_PLUGIN_ASSUME_ROLE_DURATION']) {
      return +process.env['CDK_PLUGIN_ASSUME_ROLE_DURATION'];
    }
    return 3600;
  }
}

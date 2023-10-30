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

import { CredentialProviderSource } from 'aws-cdk/lib/api/plugin';
import * as AWS from 'aws-sdk';
import { green } from 'colors/safe';

import { throttlingBackOff } from './backoff';
import fs from 'fs';
import https from 'https';

export interface AssumeRoleProviderSourceProps {
  name: string;
  assumeRoleName: string;
  assumeRoleDuration: number;
  region: string;
  credentials?: AWS.STS.Credentials;
  partition?: string;
  caBundlePath?: string;
}

export class AssumeRoleProviderSource implements CredentialProviderSource {
  readonly name = this.props.name;
  private readonly cache: { [accountId: string]: AWS.Credentials } = {};
  private readonly cacheExpiration: { [accountId: string]: Date } = {};

  constructor(private readonly props: AssumeRoleProviderSourceProps) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async canProvideCredentials(): Promise<boolean> {
    return true;
  }

  async getProvider(accountId: string): Promise<AWS.Credentials> {
    if (this.cache[accountId] && new Date() < this.cacheExpiration[accountId]) {
      return this.cache[accountId];
    }

    let assumeRole;
    try {
      // Try to assume the role with the given duration
      assumeRole = await this.assumeRole(accountId, this.props.assumeRoleDuration);
    } catch (e) {
      console.warn(`Cannot assume role for ${this.props.assumeRoleDuration} seconds: ${e}`);

      // If that fails, than try to assume the role for one hour
      assumeRole = await this.assumeRole(accountId, 3600);
    }

    const credentials = assumeRole.Credentials!;
    this.cache[accountId] = new AWS.Credentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });
    this.cacheExpiration[accountId] = new Date(+new Date() + 60000 * 30);
    return this.cache[accountId];
  }

  protected async assumeRole(accountId: string, duration: number): Promise<AWS.STS.AssumeRoleResponse> {
    const roleArn = `arn:${this.props.partition ?? 'aws'}:iam::${accountId}:role/${this.props.assumeRoleName}`;
    console.log(`Assuming role ${green(roleArn)} for ${duration} seconds`);
    let httpOptions: AWS.HTTPOptions | undefined = undefined;
    if (this.props.caBundlePath) {
      const certs = [fs.readFileSync(this.props.caBundlePath)];
      httpOptions = {
        agent: new https.Agent({
          rejectUnauthorized: true,
          ca: certs,
        }),
      };
    }
    let sts: AWS.STS;
    if (this.props.credentials) {
      sts = new AWS.STS({
        region: this.props.region,
        accessKeyId: this.props.credentials.AccessKeyId,
        secretAccessKey: this.props.credentials.SecretAccessKey,
        sessionToken: this.props.credentials.SessionToken,
        httpOptions,
      });
    } else {
      sts = new AWS.STS({ region: this.props.region, httpOptions });
    }

    return throttlingBackOff(() =>
      sts
        .assumeRole({
          RoleArn: roleArn,
          RoleSessionName: this.name,
          DurationSeconds: duration,
        })
        .promise(),
    );
  }
}

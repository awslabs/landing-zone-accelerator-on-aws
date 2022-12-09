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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { pascalCase } from 'change-case';
import { ActiveDirectoryLogSubscription } from './active-directory-log-subscription';

/**
 * Initialized ActiveDirectoryProps properties
 */
export interface ActiveDirectoryProps {
  /**
   * Friendly name for the managed active directory name
   */
  readonly directoryName: string;
  /**
   * Managed active directory dns name
   */
  readonly dnsName: string;
  /**
   * Managed active directory target vpc id
   */
  readonly vpcId: string;
  /**
   * AD configuration EC2 instance subnet ids
   */
  readonly madSubnetIds: string[];
  /**
   * Managed active directory admin password secret
   */
  readonly adminSecretValue: cdk.SecretValue;
  /**
   * Managed active directory edition, possible values are Standard or Enterprise
   */
  readonly edition: string;
  /**
   * Managed active directory netBiosDomainName name
   */
  readonly netBiosDomainName: string;
  /**
   * Managed active directory CloudWatch log group name
   */
  readonly logGroupName: string;
  /**
   * Managed active directory CloudWatch log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Custom resource lambda key
   */
  readonly lambdaKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log group encryption key
   */
  readonly cloudwatchKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log retention in days
   */
  readonly cloudwatchLogRetentionInDays: number;
}

/**
 * Managed active directory creation class.
 */
export class ActiveDirectory extends Construct {
  public readonly id: string;
  public readonly dnsIpAddresses: string[];

  constructor(scope: Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);

    const activeDirectory = new cdk.aws_directoryservice.CfnMicrosoftAD(
      this,
      pascalCase(`${props.directoryName}ActiveDirectory`),
      {
        name: props.dnsName,
        password: props.adminSecretValue.toString(),
        vpcSettings: { vpcId: props.vpcId, subnetIds: props.madSubnetIds },
        edition: props.edition,
        shortName: props.netBiosDomainName,
      },
    );

    // Create log subscription
    new ActiveDirectoryLogSubscription(this, pascalCase(`${props.directoryName}LogSubscription`), {
      activeDirectory: activeDirectory,
      activeDirectoryLogGroupName: props.logGroupName,
      activeDirectoryLogRetentionInDays: props.logRetentionInDays,
      lambdaKmsKey: props.lambdaKey,
      cloudWatchLogsKmsKey: props.cloudwatchKey,
      logRetentionInDays: props.cloudwatchLogRetentionInDays,
    });

    this.id = activeDirectory.ref;
    this.dnsIpAddresses = activeDirectory.attrDnsIpAddresses;
  }
}

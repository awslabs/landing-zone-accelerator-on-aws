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

import { FMSNotificationChannel } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class FmsResources {
  private stack: NetworkPrepStack;
  public readonly notificationChannelMap?: Map<string, string>;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    this.stack = networkPrepStack;

    // Create FMS notification channels
    this.notificationChannelMap = this.createFMSNotificationChannels(props);
  }

  /**
   * Creates FMS Notification Channels
   */
  private createFMSNotificationChannels(props: AcceleratorStackProps): Map<string, string> | undefined {
    const fmsConfiguration = props.networkConfig.firewallManagerService;
    // Exit if Notification channels don't exist.
    if (!fmsConfiguration?.notificationChannels || fmsConfiguration.notificationChannels.length === 0) {
      return undefined;
    }
    const accountId = props.accountsConfig.getAccountId(fmsConfiguration.delegatedAdminAccount);
    const auditAccountId = props.accountsConfig.getAuditAccountId();
    const notificationChannelMap = new Map<string, string>();
    const roleArn = `arn:${cdk.Stack.of(this.stack).partition}:iam::${cdk.Stack.of(this.stack).account}:role/${
      props.prefixes.accelerator
    }-FMS-Notifications`;

    for (const notificationChannel of fmsConfiguration.notificationChannels) {
      const snsTopicName = notificationChannel.snsTopic;
      if (this.stack.isTargetStack([accountId], [notificationChannel.region])) {
        const snsTopicsSecurity =
          props.securityConfig.centralSecurityServices.snsSubscriptions?.map(
            snsSubscription => snsSubscription.level,
          ) || [];
        const snsTopicsGlobal = props.globalConfig.snsTopics?.topics.map(snsTopic => snsTopic.name) || [];
        const snsTopics = [...snsTopicsSecurity, ...snsTopicsGlobal];
        if (!snsTopics.includes(snsTopicName)) {
          this.stack.addLogs(
            LogLevel.ERROR,
            `SNS Topic level ${snsTopicName} does not exist in the security config SNS Topics`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        let snsTopicArn = `arn:${cdk.Stack.of(this.stack).partition}:sns:${cdk.Stack.of(this.stack).region}:${
          cdk.Stack.of(this.stack).account
        }:${props.prefixes.snsTopicName}-${snsTopicName}`;

        if (snsTopicsSecurity.includes(snsTopicName)) {
          snsTopicArn = `arn:${cdk.Stack.of(this.stack).partition}:sns:${
            cdk.Stack.of(this.stack).region
          }:${auditAccountId}:${props.prefixes.snsTopicName}-${snsTopicName}Notifications`;
        }
        this.stack.addLogs(
          LogLevel.INFO,
          `Adding FMS notification channel for ${fmsConfiguration.delegatedAdminAccount} in region ${notificationChannel.region} to topic ${snsTopicArn}`,
        );

        const channel = new FMSNotificationChannel(
          this.stack,
          `fmsNotification-${this.stack.account}-${this.stack.region}`,
          {
            snsTopicArn,
            snsRoleArn: roleArn,
          },
        );
        notificationChannelMap.set(snsTopicName, channel.snsTopicArn);

        this.stack.addLogs(LogLevel.INFO, `Created FMS notification Channel`);
      }
    }
    return notificationChannelMap;
  }
}

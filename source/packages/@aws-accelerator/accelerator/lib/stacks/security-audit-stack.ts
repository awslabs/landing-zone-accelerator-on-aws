/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from '@aws-cdk/core';
import { AccountsConfig, SecurityConfig } from '@aws-accelerator/config';
import {
  GuardDutyDetectorConfig,
  GuardDutyExportConfigDestinationTypes,
  GuardDutyMembers,
  MacieMembers,
  MacieSession,
  SecurityHubMembers,
} from '@aws-accelerator/constructs';

export interface SecurityAuditStackProps extends cdk.StackProps {
  stage: string;
  accountsConfig: AccountsConfig;
  securityConfig: SecurityConfig;
}

export class SecurityAuditStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: SecurityAuditStackProps) {
    super(scope, id, props);

    //Macie configuration
    if (
      props.securityConfig['central-security-services'].macie.enable &&
      props.securityConfig['central-security-services'].macie['exclude-regions']!.indexOf(cdk.Stack.of(this).region) ===
        -1
    ) {
      // Delegated account MacieSession needs to be enabled before adding other account as member
      // Adding delegated account from management account should enable macie in delegated account
      // If delegated account macie was disabled for some reason add members will not work
      // TODO chack later if eneable is required
      const macieSession = new MacieSession(this, 'MacieSession', {
        region: cdk.Stack.of(this).region,
        findingPublishingFrequency:
          props.securityConfig['central-security-services'].macie['policy-findings-publishing-frequency'],
        isSensitiveSh: props.securityConfig['central-security-services'].macie['publish-sensitive-data-findings'],
      });

      new MacieMembers(this, 'MacieMembers', {
        region: cdk.Stack.of(this).region,
        adminAccountId: cdk.Stack.of(this).account,
      }).node.addDependency(macieSession);
    }

    //GuardDuty configuration
    if (
      props.securityConfig['central-security-services'].guardduty.enable &&
      props.securityConfig['central-security-services'].guardduty['exclude-regions']!.indexOf(
        cdk.Stack.of(this).region,
      ) === -1
    ) {
      const guardDutyMembers = new GuardDutyMembers(this, 'GuardDutyMembers', {
        region: cdk.Stack.of(this).region,
        enableS3Protection: props.securityConfig['central-security-services'].guardduty['s3-protection'].enable,
      });

      new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
        region: cdk.Stack.of(this).region,
        isExportConfigEnable:
          props.securityConfig['central-security-services'].guardduty['export-configuration'].enable &&
          !props.securityConfig['central-security-services'].guardduty['s3-protection']['exclude-regions']!.includes(
            cdk.Stack.of(this).region,
          ),
        exportDestination: GuardDutyExportConfigDestinationTypes.S3,
        exportFrequency:
          props.securityConfig['central-security-services'].guardduty['export-configuration']['export-frequency'],
      }).node.addDependency(guardDutyMembers);
    }

    //SecurityHub configuration
    if (
      props.securityConfig['central-security-services']['security-hub'].enable &&
      props.securityConfig['central-security-services']['security-hub']['exclude-regions']!.indexOf(
        cdk.Stack.of(this).region,
      ) === -1
    ) {
      new SecurityHubMembers(this, 'SecurityHubMembers', {
        region: cdk.Stack.of(this).region,
      });
    }
  }
}

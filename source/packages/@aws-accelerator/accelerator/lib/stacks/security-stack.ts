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
  MacieSession,
  MacieExportConfigClassification,
  GuardDutyPublishingDestination,
} from '@aws-accelerator/constructs';

/**
 * SecurityStackProps
 */
export interface SecurityStackProps extends cdk.StackProps {
  readonly stage: string;
  readonly accountsConfig: AccountsConfig;
  readonly securityConfig: SecurityConfig;
}

/**
 * Organizational Security Stack, depends on Organizations and Security-Audit Stack
 */
export class SecurityStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // MacieSession configuration
    if (
      props.securityConfig['central-security-services'].macie.enable &&
      props.securityConfig['central-security-services'].macie['exclude-regions']!.indexOf(cdk.Stack.of(this).region) ===
        -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.accountExists(auditAccountName)) {
        // TODO chack later if eneable is required, because add members would od this
        const macieSession = new MacieSession(this, 'MacieSession', {
          region: cdk.Stack.of(this).region,
          findingPublishingFrequency:
            props.securityConfig['central-security-services'].macie['policy-findings-publishing-frequency'],
          isSensitiveSh: props.securityConfig['central-security-services'].macie['publish-sensitive-data-findings'],
        });
        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          region: cdk.Stack.of(this).region,
          S3keyPrefix: 'aws-macie-export-config',
        }).node.addDependency(macieSession);
      } else {
        throw new Error(`Macie audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //GuardDuty configuration
    if (
      props.securityConfig['central-security-services'].guardduty.enable &&
      props.securityConfig['central-security-services'].guardduty['exclude-regions']!.indexOf(
        cdk.Stack.of(this).region,
      ) === -1
    ) {
      const auditAccountName = props.securityConfig.getDelegatedAccountName();
      if (props.accountsConfig.accountExists(auditAccountName)) {
        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          region: cdk.Stack.of(this).region,
          exportDestinationType:
            props.securityConfig['central-security-services'].guardduty['export-configuration']['destination-type'],
        });
      } else {
        throw new Error(`Guardduty audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }
  }
}

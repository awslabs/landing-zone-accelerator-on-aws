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

import { AccountsConfig, GlobalConfig, OrganizationConfig, SecurityConfig } from '@aws-accelerator/config';
import {
  EnableAwsServiceAccess,
  GuardDutyOrganizationAdminAccount,
  MacieOrganizationAdminAccount,
  OrganizationalUnit,
  Policy,
  PolicyAttachment,
  PolicyType,
  RootOrganizationalUnit,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as logs from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';

const path = require('path');

export interface OrganizationsStackProps extends cdk.StackProps {
  accountIds: { [name: string]: string };
  configDirPath: string;
  accountsConfig: AccountsConfig;
  organizationsConfig: OrganizationConfig;
  globalConfig: GlobalConfig;
  securityConfig: SecurityConfig;
}

/**
 * The Organizations stack is executed in all enabled regions in the
 * Organizations Management (Root) account
 */
export class OrganizationsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    //
    // Obtain the Root
    //
    const root = RootOrganizationalUnit.fromName(this, 'RootOu', { name: 'Root' });

    //
    // Global Organizations actions, only execute in the home region
    //
    if (props.globalConfig['home-region'] === cdk.Stack.of(this).region) {
      //
      // Loop through list of organizational-units in the configuration file and
      // create them. Associate related SCPs
      //
      // Note: The Accelerator will only create new Organizational Units if they
      //       do not already exist. If Organizational Units are found outside of
      //       those that are listed in the configuration file, they are ignored
      //       and left in place
      //
      const organizationalUnitList: { [key: string]: OrganizationalUnit } = {};
      for (const [key, organizationalUnit] of Object.entries(props.organizationsConfig['organizational-units'])) {
        // Create Organizational Unit
        organizationalUnitList[key] = new OrganizationalUnit(this, pascalCase(organizationalUnit.name), {
          name: organizationalUnit.name,
          parentId: root.id,
        });

        console.log(`adding for ${organizationalUnit.name}`);

        // Add FullAWSAccess SCP
        new PolicyAttachment(this, pascalCase(`Attach_FullAWSAccess_${organizationalUnit.name}`), {
          policyId: 'p-FullAWSAccess',
          targetId: organizationalUnitList[key].id,
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });
      }

      //
      // Create Accounts
      //
      for (const account of Object.values(props.accountsConfig['mandatory-accounts'])) {
        console.log(account['account-name']);
        // new AwsAccount()
      }
      for (const account of Object.values(props.accountsConfig['workload-accounts'])) {
        console.log(account['account-name']);
        // new AwsAccount()
      }

      // Deploy SCPs
      for (const serviceControlPolicy of Object.values(props.organizationsConfig['service-control-policies'])) {
        const scp = new Policy(this, serviceControlPolicy.name, {
          description: serviceControlPolicy.description,
          name: serviceControlPolicy.name,
          path: path.join(props.configDirPath, 'service-control-policies', serviceControlPolicy.policy),
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });

        for (const organizationalUnit of serviceControlPolicy['organizational-units'] ?? []) {
          let targetId = root.id;
          if (organizationalUnit !== 'root') {
            targetId = organizationalUnitList[organizationalUnit].id;
          }

          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${organizationalUnit}`), {
            policyId: scp.id,
            targetId,
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }

        for (const account of serviceControlPolicy.accounts ?? []) {
          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
            policyId: scp.id,
            email: props.accountsConfig.getEmail(account),
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }
      }

      //
      // Configure Organizations Trail
      //

      if (props.globalConfig.logging.cloudtrail.enable && props.globalConfig.logging.cloudtrail['organization-trail']) {
        const enableCloudtrailServiceAccess = new EnableAwsServiceAccess(this, 'EnableOrganizationsCloudTrail', {
          servicePrincipal: 'cloudtrail.amazonaws.com',
        });

        const cloudTrailCloudWatchCmk = new kms.Key(this, 'CloudTrailCloudWatchCmk', {
          enableKeyRotation: true,
          description: 'CloudTrail Log Group CMK',
          alias: 'accelerator/organizations-cloudtrail/log-group/',
        });
        cloudTrailCloudWatchCmk.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow Account use of the key',
            actions: ['kms:*'],
            principals: [new iam.AccountRootPrincipal()],
            resources: ['*'],
          }),
        );
        cloudTrailCloudWatchCmk.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow logs use of the key',
            actions: ['kms:*'],
            principals: [new iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
            resources: ['*'],
            conditions: {
              ArnEquals: {
                'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                  cdk.Stack.of(this).region
                }:${cdk.Stack.of(this).account}:*`,
              },
            },
          }),
        );

        const cloudTrailCloudWatchCmkLogGroup = new logs.LogGroup(this, 'CloudTrailCloudWatchLogGroup', {
          retention: logs.RetentionDays.ONE_YEAR,
          encryptionKey: cloudTrailCloudWatchCmk,
          logGroupName: 'aws-accelerator-cloudtrail-logs',
        });

        const organizationsTrail = new cdk_extensions.Trail(this, 'OrganizationsCloudTrail', {
          bucket: s3.Bucket.fromBucketName(
            this,
            'CentralLogsBucket',
            `aws-accelerator-central-logs-${
              props.accountIds[props.accountsConfig['mandatory-accounts']['log-archive'].email]
            }-${cdk.Stack.of(this).region}`,
          ),
          cloudWatchLogGroup: cloudTrailCloudWatchCmkLogGroup,
          cloudWatchLogsRetention: logs.RetentionDays.ONE_MONTH,
          enableFileValidation: true,
          encryptionKey: kms.Key.fromKeyArn(
            this,
            'CentralLogsCmk',
            `arn:${cdk.Stack.of(this).partition}:kms:${cdk.Stack.of(this).region}:${
              props.accountIds[props.accountsConfig['mandatory-accounts']['log-archive'].email]
            }:alias/accelerator/central-logs/s3`,
          ),
          includeGlobalServiceEvents: true,
          isMultiRegionTrail: true,
          isOrganizationTrail: true,
          managementEvents: cloudtrail.ReadWriteType.ALL,
          sendToCloudWatchLogs: true,
          trailName: 'AWSAccelerator-Organizations-CloudTrail',
        });

        organizationsTrail.addEventSelector(cloudtrail.DataResourceType.S3_OBJECT, [
          `arn:${cdk.Stack.of(this).partition}:s3:::`,
        ]);
        organizationsTrail.addEventSelector(cloudtrail.DataResourceType.LAMBDA_FUNCTION, [
          `arn:${cdk.Stack.of(this).partition}:lambda`,
        ]);

        organizationsTrail.node.addDependency(enableCloudtrailServiceAccess);
      }
    }

    // Security Services delegated admin account configuration
    // Global decoration for security services
    const adminAccountId =
      props.accountIds[
        props.accountsConfig.getEmail(props.securityConfig['central-security-services']['delegated-admin-account'])
      ];

    // Macie Configuration
    if (props.securityConfig['central-security-services'].macie.enable) {
      if (
        props.securityConfig['central-security-services'].macie['exclude-regions']!.indexOf(
          cdk.Stack.of(this).region,
        ) == -1
      ) {
        console.log(
          `Starts macie admin account delegation to the account with email ${
            props.accountsConfig['mandatory-accounts'].audit.email
          } account in ${cdk.Stack.of(this).region} region`,
        );
        console.log(`Macie Admin Account ID is ${adminAccountId}`);
        new MacieOrganizationAdminAccount(this, 'MacieOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountId: adminAccountId,
        });
      } else {
        console.log(
          `${cdk.Stack.of(this).region} region was in macie excluded list so ignoring this region for ${
            props.accountsConfig['mandatory-accounts'].audit.email
          } account`,
        );
      }
    }

    //GuardDuty Config
    if (props.securityConfig['central-security-services'].guardduty.enable) {
      if (
        props.securityConfig['central-security-services'].guardduty['exclude-regions']!.indexOf(
          cdk.Stack.of(this).region,
        ) == -1
      ) {
        console.log(
          `Starts guardduty admin account delegation to the account with email ${
            props.accountsConfig['mandatory-accounts'].audit.email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        console.log(`Guardduty Admin Account ID is ${adminAccountId}`);
        new GuardDutyOrganizationAdminAccount(this, 'GuardDutyEnableOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountId: adminAccountId,
        });
      } else {
        console.log(
          `${cdk.Stack.of(this).region} region was in guardduty excluded list so ignoring this region for ${
            props.accountsConfig['mandatory-accounts'].audit.email
          } account`,
        );
      }
    }

    //
    // Move accounts to correct OUs
    //

    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
  }
}

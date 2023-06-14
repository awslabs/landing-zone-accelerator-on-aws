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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import * as path from 'path';

import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';

let organizationsClient: AWS.Organizations;

const acceleratorRolePrefix = 'AWSAccelerator';
const snsTopicArn = process.env['SNS_TOPIC_ARN'];
const partition = process.env['AWS_PARTITION']!;
const homeRegion = process.env['HOME_REGION']!;

const snsClient = new AWS.SNS({ region: homeRegion });

if (partition === 'aws-us-gov') {
  organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
} else if (partition === 'aws-cn') {
  organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1' });
} else {
  organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
}

/**
 * revert-scp-changes - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.ScheduledEvent): Promise<{ statusCode: number }> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const eventName: string = event.detail.eventName;
  const policyId: string = event.detail.requestParameters.policyId;
  const userIdentityArn: string = event.detail.userIdentity.arn;

  // Exits if the scp change was made by the Accelerator
  if (await isChangeMadeByAccelerator(userIdentityArn)) {
    console.log('SCP modification performed by LZA role, exiting');
    return {
      statusCode: 200,
    };
  }

  const policyDetail: AWS.Organizations.Policy = await getPolicyDetails(policyId);
  const organizationConfig = await getOrganizationConfig();
  const accountsConfig = await getAccountConfig();

  if (await isControlTowerPolicy(policyDetail)) {
    console.log('SCP owned by Control Tower, exiting');
    return {
      statusCode: 200,
    };
  }

  if (policyDetail?.PolicySummary?.Type && policyDetail?.PolicySummary?.Type !== 'SERVICE_CONTROL_POLICY') {
    console.log('Policy is not a service control policy, exiting');
    return {
      statusCode: 200,
    };
  }

  const policyManagedByAccelerator = await isPolicyManagedByAccelerator(
    policyDetail.PolicySummary!.Name!,
    organizationConfig,
  );

  if (eventName === 'UpdatePolicy') {
    if (policyManagedByAccelerator) {
      await revertScpModification(policyDetail, organizationConfig);
    } else {
      console.log('Updated policy not managed by accelerator, exiting');
      return {
        statusCode: 200,
      };
    }
  } else if (['DetachPolicy', 'AttachPolicy'].includes(eventName)) {
    const targetId: string = event.detail.requestParameters.targetId;
    const targetManagedByAccelerator: boolean = await isTargetManagedByAccelerator(
      targetId,
      organizationConfig,
      accountsConfig,
    );
    if (!policyManagedByAccelerator && !targetManagedByAccelerator) {
      console.log(`Policy ${policyId} and target ${targetId} not managed by accelerator, exiting`);
      return {
        statusCode: 200,
      };
    }

    if (eventName === 'DetachPolicy') {
      await reattachScp(policyId, targetId);
    } else if (eventName === 'AttachPolicy') {
      await detachScp(policyId, targetId);
    }
  }

  return {
    statusCode: 200,
  };
}

async function reattachScp(policyId: string, target: string): Promise<void> {
  console.log(`Reattaching policy ${policyId} to target ${target}`);
  const attachPolicyParams = { PolicyId: policyId, TargetId: target };
  await throttlingBackOff(() => organizationsClient.attachPolicy(attachPolicyParams).promise());
  await publishSuccessToSns(
    `A manual SCP modification was automatically reverted by the Landing Zone Accelerator. Policy ${policyId} was reattached to ${target}.`,
  );
}

async function detachScp(policyId: string, target: string): Promise<void> {
  console.log(`Detaching policy ${policyId} from target ${target}`);
  const detachPolicyParams = { PolicyId: policyId, TargetId: target };
  await throttlingBackOff(() => organizationsClient.detachPolicy(detachPolicyParams).promise());
  await publishSuccessToSns(
    `A manual SCP modification was automatically reverted by the Landing Zone Accelerator. Policy ${policyId} was detached from ${target}.`,
  );
}

async function revertScpModification(
  policyDetail: AWS.Organizations.Policy,
  orgConfig: OrganizationConfig,
): Promise<void> {
  const policyName = policyDetail.PolicySummary?.Name;
  const policyId = policyDetail.PolicySummary?.Id;
  if (!policyName || !policyId) {
    await publishErrorToSns(`Error automatically remediating SCP modification. Investigate recent changes to SCPs.`);
    throw Error(`SCP ${policyId} not found, exiting`);
  }

  const originalPolicy = await getOriginalPolicyDocument(policyName, orgConfig);
  console.log(`Original policy document: \n${originalPolicy}`);
  console.log('Performing update to revert policy to accelerator configuration');
  const updatePolicyParams = { Content: originalPolicy, PolicyId: policyId };
  await throttlingBackOff(() => organizationsClient.updatePolicy(updatePolicyParams).promise());
  await publishSuccessToSns(
    `A manual SCP modification was automatically reverted by the Landing Zone Accelerator. Policy ${policyId} was updated to match the configuration provided in the aws-accelerator-config repository.`,
  );
  console.log('Policy update successful');
}

async function getPolicyDetails(policyId: string): Promise<AWS.Organizations.Policy> {
  const getPolicyParams = { PolicyId: policyId };

  try {
    const response = await throttlingBackOff(() => organizationsClient.describePolicy(getPolicyParams).promise());
    return response.Policy!;
  } catch (e) {
    console.error(e);
    await publishErrorToSns(`Error automatically remediating SCP modification. Investigate recent changes to SCPs.`);
    throw Error(`Error fetching policy details for policy ${policyId} , exiting`);
  }
}

async function isControlTowerPolicy(policyDetail: AWS.Organizations.Policy): Promise<boolean> {
  const policyName = policyDetail?.PolicySummary?.Name;
  if (policyName?.startsWith('aws-guardrails-')) {
    return true;
  }
  return false;
}

async function getOriginalPolicyDocument(policyName: string, orgConfig: OrganizationConfig): Promise<string> {
  const policyPath = await getOriginalPolicyDocumentPath(policyName, orgConfig);
  return JSON.stringify(require(path.join(__dirname, 'policies', policyPath)));
}

async function getOrganizationConfig(): Promise<OrganizationConfig> {
  const organizationConfig = OrganizationConfig.load(path.join(__dirname, '/config'));
  await organizationConfig.loadOrganizationalUnitIds(partition);
  if (!organizationConfig) {
    throw Error('Error parsing organization-config file, object undefined');
  }
  return organizationConfig;
}

async function getAccountConfig(): Promise<AccountsConfig> {
  const accountsConfig = AccountsConfig.load(path.join(__dirname, '/config'));
  await accountsConfig.loadAccountIds(partition, false);
  if (!accountsConfig) {
    await publishErrorToSns(`Error automatically remediating SCP modification. Investigate recent changes to SCPs.`);
    throw Error('Error parsing account-config file, object undefined');
  }
  return accountsConfig;
}

async function getOriginalPolicyDocumentPath(policyName: string, orgConfig: OrganizationConfig): Promise<string> {
  for (const policyDetail of orgConfig.serviceControlPolicies) {
    if (policyName === policyDetail.name) {
      return policyDetail.policy;
    }
  }
  throw Error(`Policy ${policyName} not found in organization-config file`);
}

async function isChangeMadeByAccelerator(principalArn: string): Promise<boolean> {
  console.log(`SCP modification performed by ${principalArn}`);
  const principalArr = principalArn.split(':');
  const principal = principalArr[principalArr.length - 1];
  const roleNameArr = principal.split('/');
  const roleName = roleNameArr[roleNameArr.length - 1];

  if (roleName?.startsWith(acceleratorRolePrefix)) {
    return true;
  } else {
    return false;
  }
}

async function isPolicyManagedByAccelerator(policyName: string, orgConfig: OrganizationConfig): Promise<boolean> {
  const policyNames = orgConfig.serviceControlPolicies?.map(a => a.name);
  if (policyNames && policyNames.includes(policyName)) {
    return true;
  }
  return false;
}

async function isTargetManagedByAccelerator(
  targetId: string,
  orgConfig: OrganizationConfig,
  acctConfig: AccountsConfig,
): Promise<boolean> {
  if (targetId.startsWith('ou-')) {
    const organizationUnitIds = orgConfig.organizationalUnitIds?.map(a => a.id);
    if (organizationUnitIds?.includes(targetId)) {
      return true;
    } else {
      return false;
    }
  } else {
    const accountIds = acctConfig.accountIds?.map(a => a.accountId);
    if (accountIds?.includes(targetId)) {
      return true;
    } else {
      return false;
    }
  }
}

async function publishErrorToSns(errorMessage: string): Promise<void> {
  const publishParams = {
    Message: errorMessage,
    Subject: 'Service Control Policy Remediation Failure',
    TopicArn: snsTopicArn,
  };
  if (!snsTopicArn) {
    console.log('SNS Topic not configured, publishing error message to logs');
    console.log(errorMessage);
    return;
  }
  try {
    await throttlingBackOff(() => snsClient.publish(publishParams).promise());
  } catch (e) {
    console.error(e);
  }
  return;
}

async function publishSuccessToSns(successMessage: string): Promise<void> {
  const publishParams = {
    Message: successMessage,
    Subject: 'Service Control Policy Remediation Success',
    TopicArn: snsTopicArn,
  };
  if (!snsTopicArn) {
    console.log('SNS Topic not configured, publishing success message to logs');
    console.log(successMessage);
    return;
  }
  try {
    await throttlingBackOff(() => snsClient.publish(publishParams).promise());
  } catch (e) {
    console.error(e);
  }
  return;
}

/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { AccountConfig, AccountsConfig, GovCloudAccountConfig, NetworkConfig } from '@aws-accelerator/config';

// ACCEL_LOOKUP::VPC_ID:ACCOUNT|OU|ORG:{accountId}|{ouId}
// ACCEL_LOOKUP::ACCOUNT_ID:ACCOUNT|OU|ORG:{accountId}|{ouId}
export enum POLICY_LOOKUP_TYPE {
  VPC_ID = 'VPC_ID',
  VPCE_ID = 'VPCE_ID',
  ACCOUNT_ID = 'ACCOUNT_ID',
  CUSTOM = 'CUSTOM',
}

export enum POLICY_LOOKUP_SCOPE {
  ACCOUNT = 'ACCOUNT',
  OU = 'OU',
  ORG = 'ORG',
}

export const ACCEL_POLICY_LOOKUP_REGEX = /\${ACCEL_LOOKUP::([a-zA-Z0-9-:_]*)}/g;

export function policyReplacements(props: {
  content: string;
  acceleratorPrefix: string;
  managementAccountAccessRole: string;
  partition: string;
  additionalReplacements: { [key: string]: string | string[] };
  acceleratorName: string;
  networkConfig?: NetworkConfig;
  accountsConfig?: AccountsConfig;
}): string {
  const {
    acceleratorPrefix,
    additionalReplacements,
    managementAccountAccessRole,
    partition,
    networkConfig,
    accountsConfig,
  } = props;
  let { content } = props;

  for (const [key, value] of Object.entries(additionalReplacements)) {
    const normalizedValue = normalize(value);
    content = content.replace(
      new RegExp(key, 'g'),
      typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue),
    );
  }
  const replacements = {
    '\\${MANAGEMENT_ACCOUNT_ACCESS_ROLE}': managementAccountAccessRole,
    '\\${ACCELERATOR_NAME}': props.acceleratorName,
    '\\${ACCELERATOR_PREFIX}': acceleratorPrefix,
    '\\${PARTITION}': partition,
  };

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(key, 'g'), value);
  }

  const matches = content.match(ACCEL_POLICY_LOOKUP_REGEX);
  const uniqueLookup = [...new Set(matches)];

  for (const lookupPattern of uniqueLookup) {
    const value = getPolicyReplaceValue(lookupPattern, networkConfig, accountsConfig);
    const stringifiedValue = typeof value === 'string' ? value : value.map(v => `"${v}"`).join(',');
    if (!stringifiedValue) {
      // If the value of the parameter is empty, we need to remove any heading comma with space if there is any
      content = content.replace(new RegExp(`,?\\s*${escapeRegExp(lookupPattern)}`, 'g'), stringifiedValue);
    } else {
      content = content.replace(new RegExp(escapeRegExp(lookupPattern), 'g'), stringifiedValue);
    }
  }
  return content;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function getPolicyReplaceValue(
  key: string,
  networkConfig?: NetworkConfig,
  accountsConfig?: AccountsConfig,
): string[] | string {
  ACCEL_POLICY_LOOKUP_REGEX.lastIndex = 0;
  const parameterReplacementNeeded = ACCEL_POLICY_LOOKUP_REGEX.exec(key);
  if (parameterReplacementNeeded) {
    return getPolicyReplacementValue(parameterReplacementNeeded, networkConfig, accountsConfig);
  }

  return key;
}

function getPolicyReplacementValue(
  replacement: RegExpMatchArray,
  networkConfig?: NetworkConfig,
  accountsConfig?: AccountsConfig,
): string | string[] {
  const replacementArray = replacement[1].split(':');
  if (replacementArray.length < 2) {
    throw new Error(`Invalid POLICY_LOOKUP_VALUE: ${replacement[1]}`);
  }

  const lookupType = replacementArray[0];
  const lookupScope = replacementArray[1];

  let returnValue: string | string[];

  // Validate lookup data
  validatePolicyLookupData(lookupType, lookupScope, replacementArray);

  switch (lookupType) {
    case POLICY_LOOKUP_TYPE.VPC_ID:
      if (!networkConfig || !accountsConfig) {
        throw new Error('Missing networkConfig and accountConfig for policy statement with VPC parameters');
      }
      returnValue = getScopeVpcIds(networkConfig, accountsConfig, lookupScope, replacementArray);
      break;
    case POLICY_LOOKUP_TYPE.VPCE_ID:
      if (!networkConfig || !accountsConfig) {
        throw new Error('Missing networkConfig and accountConfig for policy statement with VPCE parameters');
      }
      returnValue = getScopeVpcEndpointIds(networkConfig, accountsConfig, lookupScope, replacementArray);
      break;
    case POLICY_LOOKUP_TYPE.ACCOUNT_ID:
      if (!accountsConfig) {
        throw new Error('Missing accountConfig for policy statement with ACCOUNT parameters');
      }
      returnValue = getScopeAccountIds(accountsConfig, lookupScope, replacementArray);
      break;
    case POLICY_LOOKUP_TYPE.CUSTOM:
      // Return the parameter itself for custom parameter. The parameter will be replacement with value from replacement config
      // The only exception will be ACCEL_LOOKUP::CUSTOM:ATTACHED_RESOURCE_ARN whose value will only be available during lambda runtime
      returnValue = replacement[0];
      break;
    default:
      throw new Error(`Invalid POLICY_LOOKUP type: ${lookupType}`);
  }

  return returnValue;
}

/**
 * Validate lookup data
 * @param lookupType string
 * @param replacementArray string[]
 */
function validatePolicyLookupData(lookupType: string, lookupScope: string, replacementArray: string[]) {
  let isError = false;
  if (
    lookupType === POLICY_LOOKUP_TYPE.VPC_ID ||
    lookupType === POLICY_LOOKUP_TYPE.VPCE_ID ||
    lookupType === POLICY_LOOKUP_TYPE.ACCOUNT_ID
  ) {
    if (lookupScope === POLICY_LOOKUP_SCOPE.ACCOUNT && replacementArray.length !== 3) {
      // VPC_ID:ACCOUNT:{accountId}
      isError = true;
    } else if (lookupScope === POLICY_LOOKUP_SCOPE.OU && replacementArray.length !== 3) {
      // VPC_ID:OU:{ouId}
      isError = true;
    } else if (lookupScope === POLICY_LOOKUP_SCOPE.ORG && replacementArray.length !== 2) {
      // VPC_ID:ORG
      isError = true;
    }
  }

  if (isError) {
    throw new Error(`Invalid replacement options ${replacementArray}`);
  }
}

function getAccountsForOrgUnit(
  accountsConfig: AccountsConfig,
  organizationUnit: string,
): (AccountConfig | GovCloudAccountConfig)[] {
  const accounts = accountsConfig.getAccounts(false);
  return accounts.filter(account => account.organizationalUnit === organizationUnit);
}

function getScopeAccountIds(accountsConfig: AccountsConfig, lookupScope: string, replacementArray: string[]): string[] {
  if (lookupScope === POLICY_LOOKUP_SCOPE.ORG) {
    return accountsConfig.getAccountIds();
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.ACCOUNT) {
    const accountName = replacementArray[2];
    const accountId = accountsConfig.getAccountId(accountName);
    return [accountId];
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.OU) {
    const organizationUnit = replacementArray[2];
    const accounts = getAccountsForOrgUnit(accountsConfig, organizationUnit);
    return accounts.reduce((accountIds: string[], account) => {
      const accountId = accountsConfig.getAccountId(account.name);
      if (accountId) {
        accountIds.push(accountId);
      }
      return accountIds;
    }, []);
  }

  return [];
}

function getScopeVpcIds(
  networkConfig: NetworkConfig,
  accountsConfig: AccountsConfig,
  lookupScope: string,
  replacementArray: string[],
): string[] {
  if (!networkConfig.accountVpcIds) return [];

  const accountVpcIdMap = networkConfig.accountVpcIds;
  if (lookupScope === POLICY_LOOKUP_SCOPE.ORG) {
    return Object.values(accountVpcIdMap).reduce((acc, arr) => {
      return acc.concat(arr);
    }, []);
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.ACCOUNT) {
    const accountName = replacementArray[2];
    const accountId = accountsConfig.getAccountId(accountName);
    return accountVpcIdMap[accountId] || [];
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.OU) {
    const organizationUnit = replacementArray[2];
    const accounts = getAccountsForOrgUnit(accountsConfig, organizationUnit);
    return accounts
      .map(account => accountVpcIdMap[accountsConfig.getAccountId(account.name)] || [])
      .reduce((acc, arr) => {
        return acc.concat(arr);
      }, []);
  }

  return [];
}

function getScopeVpcEndpointIds(
  networkConfig: NetworkConfig,
  accountsConfig: AccountsConfig,
  lookupScope: string,
  replacementArray: string[],
): string[] {
  if (!networkConfig.accountVpcEndpointIds) return [];

  const accountVpcEndpointIdMap = networkConfig.accountVpcEndpointIds;
  if (lookupScope === POLICY_LOOKUP_SCOPE.ORG) {
    return Object.values(accountVpcEndpointIdMap).reduce((acc, arr) => {
      return acc.concat(arr);
    }, []);
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.ACCOUNT) {
    const accountName = replacementArray[2];
    const accountId = accountsConfig.getAccountId(accountName);
    return accountVpcEndpointIdMap[accountId] || [];
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.OU) {
    const organizationUnit = replacementArray[2];
    const accounts = getAccountsForOrgUnit(accountsConfig, organizationUnit);
    return accounts
      .map(account => accountVpcEndpointIdMap[accountsConfig.getAccountId(account.name)] || [])
      .reduce((acc, arr) => {
        return acc.concat(arr);
      }, []);
  }

  return [];
}

/**
 * When using some APIs to update resource policy, e.g. IAM:UpdateAssumeRolePolicy,
 * an array with single string value will be automatically converted to string in the JSON policy.
 * We explicitly do the conversion here to avoid policy mismatch while checking resource policy compliance.
 *
 * @param value
 * @returns
 */
function normalize(value: string | string[]) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 1) return `"${value[0]}"`;
  return value;
}

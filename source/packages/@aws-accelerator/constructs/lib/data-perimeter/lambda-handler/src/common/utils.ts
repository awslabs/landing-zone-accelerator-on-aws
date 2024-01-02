import * as fs from 'fs';
import * as path from 'path';
import { PolicyDocument, ResourceType } from './common-resources';

export const RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY = [ResourceType.CERTIFICATE_AUTHORITY, ResourceType.LAMBDA_FUNCTION];
const RESOURCE_POLICY_FILE_DIR = 'policies';

/**
 * Compare if two JSON objects are deeply equal
 * @param {*} obj1
 * @param {*} obj2
 * @returns
 */
export const deepEqual = (obj1: unknown, obj2: unknown) => {
  if (obj1 === obj2) return true;

  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;

    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])) return false;
  }

  return true;
};

/**
 * Get resource policy templates with placeholders from lambda environment
 *
 * @returns Map of ResourceType -> string of PolicyDocument
 */
export const getResourcePolicies = (): Map<ResourceType, string> => {
  const accountId: string = process.env['ACCOUNT_ID']!;
  const resourcePolicyFilesDir = path.join(__dirname, RESOURCE_POLICY_FILE_DIR, accountId);
  const files = fs.readdirSync(resourcePolicyFilesDir);

  const map = new Map<ResourceType, string>();
  for (const resourceTypeKey of Object.keys(ResourceType)) {
    const resourceType = ResourceType[resourceTypeKey as keyof typeof ResourceType];
    if (RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY.includes(resourceType)) continue;

    const file = files.find(file => path.basename(file) === `${resourceTypeKey}.json`);
    if (file) {
      map.set(resourceType, fs.readFileSync(path.join(resourcePolicyFilesDir, file), 'utf-8'));
    } else {
      throw new Error(`Cannot find policy file for ${resourceTypeKey} in account ${accountId}`);
    }
  }
  return map;
};

/**
 * Replace the placeholder in resource policy template with actual value.
 *
 * @param {*} policyTemplateMap
 * @param {*} params
 * @returns Map of file name (string) -> JSON policy object (PolicyDocument)
 */
export const generatePolicyReplacements = (
  policyTemplateMap: Map<ResourceType, string>,
  params: { [key: string]: string | string[] },
): Map<ResourceType, PolicyDocument> => {
  const map = new Map();
  for (const [policyKey, policyStr] of policyTemplateMap) {
    let jsonStr = policyStr;
    for (const paramKey in params || {}) {
      const regex = new RegExp('\\$\\{' + paramKey + '\\}', 'g');
      const value =
        typeof params[paramKey] === 'string' ? (params[paramKey] as string) : JSON.stringify(params[paramKey]);

      jsonStr = jsonStr.replace(regex, value);
    }

    map.set(policyKey, JSON.parse(jsonStr));
  }

  return map;
};

export function stringToEnumValue<T extends Record<string, string>>(
  enumObj: T,
  stringValue: string,
): T[keyof T] | undefined {
  const enumKeys = Object.keys(enumObj) as (keyof T)[];
  for (const key of enumKeys) {
    if (enumObj[key] === stringValue) {
      return key as T[keyof T];
    }
  }
  return undefined; // Return undefined if no match is found
}

/**
 * Compare if each statement in {mandatoryPolicy} exists in current {resourcePolicy}.
 *
 * @param {*} currPolicy
 * @param {*} expectedPolicy
 * @returns
 */
export const compareResourcePolicies = async (
  currPolicy: PolicyDocument | undefined,
  expectedPolicy: PolicyDocument | undefined,
): Promise<{
  complianceType: string;
  annotation?: string;
}> => {
  if (!currPolicy)
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Resource policy is empty',
    };
  if (!expectedPolicy) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Mandatory resource policy is empty',
    };
  }

  const currStatements = currPolicy.Statement || [];
  for (const policy of expectedPolicy.Statement || []) {
    const target = currStatements.find(s => s.Sid === policy.Sid);
    if (!target)
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: `Policy statement ${policy.Sid} is not found`,
      };

    if (!deepEqual(target, policy)) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: `Policy statement ${policy.Sid} is not identical to mandatory resource policy`,
      };
    }
  }

  return {
    complianceType: 'COMPLIANT',
  };
};

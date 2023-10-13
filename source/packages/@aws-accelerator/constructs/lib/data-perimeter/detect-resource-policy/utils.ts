import * as fs from 'fs';
import * as path from 'path';

// There is no type for AWS Config Rule event in AWS SDK.
// Thus, we need to define them here.
export type ConfigRuleEvent = {
  invokingEvent: string; // This is a stringified JSON.
  ruleParameters?: string;
  resultToken: string;
  executionRoleArn?: string;
  configRuleArn: string;
  configRuleName: string;
  configRuleId: string;
  accountId: string;
};

export type InvokingEvent = {
  configurationItem?: ConfigurationItem;
  messageType: string;
};

export type ConfigurationItem = {
  relatedEvents: string[];
  configurationStateId: number;
  version: string;
  configurationItemCaptureTime: string;
  configurationItemStatus: string;
  configurationStateMd5Hash: string;
  ARN: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  AWSAccountId: string;
  supplementaryConfiguration?: { BucketPolicy?: { policyText: string }; Policy?: string };
  configuration?: { keyManager?: string; path?: string; assumeRolePolicyDocument?: string };
};

export type PolicyDocument = {
  Version: string;
  Id?: string;
  Statement: Statement[];
};

export type Statement = {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Principal?: Principal;
  Action: string | string[];
  Resource: string | string[];
  Condition?: { [condition: string]: { [key: string]: unknown } };
};

export type Principal = {
  Service?: string | string[];
  AWS?: string | string[];
};

export const APPLICABLE_RESOURCES = Object.freeze(['AWS::S3::Bucket', 'AWS::KMS::Key', 'AWS::IAM::Role']);

export const RESOURCE_POLICY = Object.freeze({
  S3_POLICY: 'S3',
  IAM_POLICY: 'IAM',
  KMS_POLICY: 'KMS',
});

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
 * @returns Map of file name (string) -> string of PolicyDocument
 */
export const getResourcePolicies = () => {
  const resourcePolicyFilesDir = path.join(__dirname, RESOURCE_POLICY_FILE_DIR);

  const files = fs.readdirSync(resourcePolicyFilesDir);
  return new Map<string, string>(
    files
      .filter(file => path.extname(file) === '.json')
      .map(file => [
        file.slice(0, file.lastIndexOf('.')),
        fs.readFileSync(path.join(resourcePolicyFilesDir, file), 'utf-8'),
      ]),
  );
};

/**
 * Replace the placeholder in resource policy template with actual value.
 *
 * @param {*} policyTemplateMap
 * @param {*} params
 * @returns Map of file name (string) -> JSON policy object (PolicyDocument)
 */
export const generatePolicyReplacements = (
  policyTemplateMap: Map<string, string>,
  params: { [key: string]: string | string[] },
): Map<string, PolicyDocument> => {
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

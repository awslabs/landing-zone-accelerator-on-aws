import * as fs from 'fs';
import * as path from 'path';

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

export const RESOURCE_POLICY = Object.freeze({
  S3_POLICY: 'S3',
  IAM_POLICY: 'IAM',
  KMS_POLICY: 'KMS',
});

const RESOURCE_POLICY_FILE_DIR = 'policies';

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

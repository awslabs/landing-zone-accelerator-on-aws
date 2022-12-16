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

export function policyReplacements(props: {
  content: string;
  acceleratorPrefix: string;
  managementAccountAccessRole: string;
  partition: string;
  additionalReplacements: { [key: string]: string | string[] };
}): string {
  const { acceleratorPrefix, additionalReplacements, managementAccountAccessRole, partition } = props;
  let { content } = props;

  for (const [key, value] of Object.entries(additionalReplacements)) {
    content = content.replace(new RegExp(key, 'g'), typeof value === 'string' ? value : JSON.stringify(value));
  }

  const replacements = {
    '\\${MANAGEMENT_ACCOUNT_ACCESS_ROLE}': managementAccountAccessRole,
    '\\${ACCELERATOR_PREFIX}': acceleratorPrefix,
    '\\${PARTITION}': partition,
  };

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(key, 'g'), value);
  }

  return content;
}

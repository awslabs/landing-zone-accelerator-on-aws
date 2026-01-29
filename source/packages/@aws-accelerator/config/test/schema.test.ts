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

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

describe('Schema', () => {
  const schemaFiles = [
    'accounts-config.json',
    'customizations-config.json',
    'global-config.json',
    'iam-config.json',
    'network-config.json',
    'organization-config.json',
    'replacements-config.json',
    'security-config.json',
  ];

  /**
   * Detects when both a class (e.g. CustomConfig) and its interface (ICustomConfig) are exported to the schema.
   * This happens when a model references the class type instead of the interface type.
   * Fix by changing the type reference from ClassName to IClassName in the model.
   */
  it.each(schemaFiles)('%s should not have duplicate definitions for class and interface', schemaFile => {
    const schemaPath = path.join(__dirname, '../lib/schemas', schemaFile);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const definitions = Object.keys(schema.definitions);

    const duplicates = definitions.filter(d => !d.startsWith('I') && definitions.includes(`I${d}`));

    expect(duplicates).toEqual([]);
  });
});

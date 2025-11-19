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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonSchema } from '../lib/common';

/**
 * Allowed schema types that can be patched.
 * This type ensures type safety when specifying which schema to patch.
 */
type AllowedSchemaType =
  | 'IAccountsConfig'
  | 'IGlobalConfig'
  | 'IIamConfig'
  | 'IOrganizationConfig'
  | 'ISecurityConfig'
  | 'IReplacementsConfig'
  | 'ICustomizationsConfig'
  | 'INetworkConfig';

/**
 * Whitelist of allowed schema types and their corresponding file paths.
 * This prevents arbitrary file access and ensures only known schemas can be patched.
 */
const ALLOWED_SCHEMAS: Record<AllowedSchemaType, string> = {
  IAccountsConfig: 'lib/schemas/accounts-config.json',
  IGlobalConfig: 'lib/schemas/global-config.json',
  IIamConfig: 'lib/schemas/iam-config.json',
  IOrganizationConfig: 'lib/schemas/organization-config.json',
  ISecurityConfig: 'lib/schemas/security-config.json',
  IReplacementsConfig: 'lib/schemas/replacements-config.json',
  ICustomizationsConfig: 'lib/schemas/customizations-config.json',
  INetworkConfig: 'lib/schemas/network-config.json',
};

/**
 * Patches a generated JSON schema to allow YAML anchors at the top level.
 *
 * This function modifies the root type definition of a JSON schema to add a
 * `patternProperties` rule that allows properties starting with "." (dot).
 * These properties are used for YAML anchors and should be ignored during validation.
 *
 * @param schemaType - The type of schema to patch (must be in the ALLOWED_SCHEMAS whitelist)
 *
 * @remarks
 * - Only the root type definition is patched; nested objects are not affected
 * - The schema maintains `additionalProperties: false` for strict validation
 * - YAML anchors (properties starting with ".") are allowed only at the top level
 * - The function validates that the schema file exists and matches the expected type
 *
 * @example
 * ```typescript
 * patchSchema('IAccountsConfig');
 * // Patches lib/schemas/accounts-config.json to allow .anchor properties
 * ```
 */
function patchSchema(schemaType: AllowedSchemaType): void {
  // Validate that the schema type is in the whitelist
  if (!(schemaType in ALLOWED_SCHEMAS)) {
    console.error(`Error: Invalid schema type "${schemaType}"`);
    console.error(`Allowed types: ${Object.keys(ALLOWED_SCHEMAS).join(', ')}`);
    process.exit(1);
  }

  const schemaPath = join(__dirname, '..', ALLOWED_SCHEMAS[schemaType]);

  // Verify the file exists
  if (!existsSync(schemaPath)) {
    console.error(`Error: Schema file not found: ${schemaPath}`);
    process.exit(1);
  }
  const schemaContent = readFileSync(schemaPath, 'utf8');
  const schema: JsonSchema = JSON.parse(schemaContent);

  // Verify the schema references the expected type
  const rootRef = schema.$ref;
  if (!rootRef) {
    console.warn('Warning: No $ref found at root level');
    return;
  }

  const rootTypeName = rootRef.split('/').pop();
  if (rootTypeName !== schemaType) {
    console.error(`Error: Schema type mismatch. Expected ${schemaType}, found ${rootTypeName}`);
    process.exit(1);
  }

  // Only patch the root type definition to allow YAML anchors at the top level
  if (schema.definitions && schema.definitions[schemaType]) {
    const rootDef = schema.definitions[schemaType];

    if (rootDef.additionalProperties === false || rootDef.additionalProperties === undefined) {
      // Add patternProperties to allow properties starting with "." at the top level only
      if (!rootDef.patternProperties) {
        rootDef.patternProperties = {};
      }

      // Allow any property starting with "." (for YAML anchors)
      rootDef.patternProperties['^\\.'] = {
        description: 'YAML anchor',
      };
    }
  } else {
    console.warn(`Warning: Root type definition "${schemaType}" not found`);
  }

  // Write the patched schema back
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n', 'utf8');
}

/**
 * Main execution block
 * Reads the schema type from command line arguments and patches the corresponding schema.
 */
function main(): void {
  // Get schema type from command line argument
  const schemaType = process.argv[2];

  if (!schemaType) {
    console.error('Usage: ts-node patch-schema.ts <schema-type>');
    console.error(`Allowed types: ${Object.keys(ALLOWED_SCHEMAS).join(', ')}`);
    process.exit(1);
  }

  try {
    patchSchema(schemaType as AllowedSchemaType);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error patching schema: ${error.message}`);
    } else {
      console.error(`Error patching schema: ${String(error)}`);
    }
    process.exit(1);
  }
}

// Execute main function
main();

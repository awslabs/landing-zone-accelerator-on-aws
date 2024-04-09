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
import Ajv from 'ajv';
import { IAccountsConfig } from '../models/accounts-config';
import { IGlobalConfig } from '../models/global-config';
import { IIamConfig } from '../models/iam-config';
import { IOrganizationConfig } from '../models/organization-config';
import { ISecurityConfig } from '../models/security-config';
import { IReplacementsConfig } from '../models/replacements-config';
import { ICustomizationsConfig } from '../models/customizations-config';
import { INetworkConfig } from '../models/network-config';
import * as accountsSchema from '../schemas/accounts-config.json';
import * as globalSchema from '../schemas/global-config.json';
import * as iamSchema from '../schemas/iam-config.json';
import * as organizationSchema from '../schemas/organization-config.json';
import * as securitySchema from '../schemas/security-config.json';
import * as replacementsSchema from '../schemas/replacements-config.json';
import * as customizationsSchema from '../schemas/customizations-config.json';
import * as networkSchema from '../schemas/network-config.json';

const ajv = new Ajv({ allErrors: true, verbose: true });

interface JsonSchema {
  $ref: string;
  $schema: string;
  definitions: {
    [key: string]: object;
  };
}

type FilteredErrors = { [key: string]: string };

/**
 * Validates the provided content against the given JSON Schema.
 *
 * @param schema The JSON Schema object to validate the content against.
 * @param content The content to be validated.
 * @returns An object containing errors found during validation (filtered to ignore certain errors).
 *
 * @remarks
 * Errors are filtered to ensure that the validation passes if a user provided
 * extra properties that were not found in the schema.
 */
function validate(schema: JsonSchema, content: unknown): FilteredErrors {
  ajv.validate(schema, content);

  const errors: FilteredErrors = {};
  if (ajv.errors !== undefined && ajv.errors !== null) {
    if (ajv.errors.length > 0) {
      ajv.errors.forEach(e => {
        if (
          e.message !== undefined &&
          !e.message.includes('must NOT have additional properties') &&
          !e.message.includes('must match a schema in')
        ) {
          let message = e.message;
          if (!message.includes(e.schema as string)) {
            message += ` (${e.schema})`;
          }
          errors[e.instancePath] = message;
        }
      });
    }
  }

  return errors;
}

/**
 * Parses the provided content against the given JSON Schema. If any errors are
 * found an exception is thrown, messages are properly formatted and displayed
 * back to the user.
 *
 * @param schema The JSON Schema to use for parsing.
 * @param content The content to be parsed.
 * @returns The parsed content with the correct interface type.
 */
function parse<T>(schema: JsonSchema, content: unknown, file: string): T {
  const errors = validate(schema, content);
  if (Object.keys(errors).length > 0) {
    const errorsList = Object.keys(errors).map(error => `* ${error} => ${errors[error]}`);
    const errorMessage = errorsList.join('\n');
    throw new Error(`Could not parse content in ${file}:\n\n${errorMessage}\n\n`);
  }

  return content as T;
}

/**
 * Parses provided content against the Accounts JSON Schema.
 */
export function parseAccountsConfig(content: unknown): IAccountsConfig {
  return parse(accountsSchema, content, 'accounts-config');
}
/**
 * Parses provided content against the Global JSON Schema.
 */
export function parseGlobalConfig(content: unknown): IGlobalConfig {
  return parse(globalSchema, content, 'global-config');
}
/**
 * Parses provided content against the IAM JSON Schema.
 */
export function parseIamConfig(content: unknown): IIamConfig {
  return parse(iamSchema, content, 'iam-config');
}
/**
 * Parses provided content against the Organization JSON Schema.
 */
export function parseOrganizationConfig(content: unknown): IOrganizationConfig {
  return parse(organizationSchema, content, 'organization-config');
}
/**
 * Parses provided content against the Security JSON Schema.
 */
export function parseSecurityConfig(content: unknown): ISecurityConfig {
  return parse(securitySchema, content, 'security-config');
}
/**
 * Parses provided content against the Replacements JSON Schema.
 */
export function parseReplacementsConfig(content: unknown): IReplacementsConfig {
  return parse(replacementsSchema, content, 'replacements-config');
}
/**
 * Parses provided content against the Customizations JSON Schema.
 */
export function parseCustomizationsConfig(content: unknown): ICustomizationsConfig {
  return parse(customizationsSchema, content, 'customizations-config');
}
/**
 * Parses provided content against the Network JSON Schema.
 */
export function parseNetworkConfig(content: unknown): INetworkConfig {
  return parse(networkSchema, content, 'network-config');
}

/**
 * Checks if the provided content conforms to the specified JSON Schema.
 *
 * @param schema The JSON schema to validate against.
 * @param interfaceName The name of the interface defined in the JSON schema.
 * @param content The content to be checked against the specified interface.
 * @returns Returns true if the content conforms to the interface, false otherwise.
 */
function is(schema: JsonSchema, interfaceName: string, content: unknown): boolean {
  let newSchema = ajv.getSchema(interfaceName);
  if (!newSchema) {
    ajv.addSchema({ ...schema, $ref: `#/definitions/${interfaceName}` }, interfaceName);
    newSchema = ajv.getSchema(interfaceName);
  }
  if (!newSchema?.schema) {
    throw new Error(`Could not find schema for ${interfaceName}`);
  }
  const errors = validate(newSchema.schema as JsonSchema, content);

  return Object.keys(errors).length == 0;
}

/**
 * Checks if content conforms to any type in the Accounts JSON Schema.
 */
export function isAccountsType<T>(
  interfaceName: keyof typeof accountsSchema.definitions,
  content: unknown,
): content is T {
  return is(accountsSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Global JSON Schema.
 */
export function isGlobalType<T>(interfaceName: keyof typeof globalSchema.definitions, content: unknown): content is T {
  return is(globalSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the IAM JSON Schema.
 */
export function isIamType<T>(interfaceName: keyof typeof iamSchema.definitions, content: unknown): content is T {
  return is(iamSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Organizations JSON Schema.
 */
export function isOrganizationType<T>(
  interfaceName: keyof typeof organizationSchema.definitions,
  content: unknown,
): content is T {
  return is(organizationSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Security JSON Schema.
 */
export function isSecurityType<T>(
  interfaceName: keyof typeof securitySchema.definitions,
  content: unknown,
): content is T {
  return is(securitySchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Replacements JSON Schema.
 */
export function isReplacementsType<T>(
  interfaceName: keyof typeof replacementsSchema.definitions,
  content: unknown,
): content is T {
  return is(replacementsSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Customizations JSON Schema.
 */
export function isCustomizationsType<T>(
  interfaceName: keyof typeof customizationsSchema.definitions,
  content: unknown,
): content is T {
  return is(customizationsSchema, interfaceName, content);
}
/**
 * Checks if content conforms to any type in the Network JSON Schema.
 */
export function isNetworkType<T>(
  interfaceName: keyof typeof networkSchema.definitions,
  content: unknown,
): content is T {
  return is(networkSchema, interfaceName, content);
}

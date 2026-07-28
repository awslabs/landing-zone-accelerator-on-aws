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
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { IAccountsConfig } from '../models/accounts-config';
import { ICustomizationsConfig } from '../models/customizations-config';
import { IGlobalConfig } from '../models/global-config';
import { IIamConfig } from '../models/iam-config';
import { INetworkConfig } from '../models/network-config';
import { IOrganizationConfig } from '../models/organization-config';
import { IReplacementsConfig } from '../models/replacements-config';
import { ISecurityConfig } from '../models/security-config';
import * as accountsSchema from '../schemas/accounts-config.json';
import * as customizationsSchema from '../schemas/customizations-config.json';
import * as globalSchema from '../schemas/global-config.json';
import * as iamSchema from '../schemas/iam-config.json';
import * as networkSchema from '../schemas/network-config.json';
import * as organizationSchema from '../schemas/organization-config.json';
import * as replacementsSchema from '../schemas/replacements-config.json';
import * as securitySchema from '../schemas/security-config.json';

const ajv = new Ajv({ allErrors: true, verbose: true });

const logger = createLogger(['parse']);

interface SchemaDefinition {
  additionalProperties?: boolean;
  patternProperties?: {
    [pattern: string]: {
      description?: string;
    };
  };
  [key: string]: unknown;
}

export interface JsonSchema {
  $ref?: string;
  definitions?: {
    [key: string]: SchemaDefinition;
  };
}

type FilteredErrors = { [key: string]: string };

/**
 * Strictness setting that controls how the validator treats unrecognized
 * configuration keys (keys not defined in the JSON schema).
 *
 * - `off`: unrecognized keys are silently ignored (default, preserves legacy behavior).
 * - `warn`: a warning is logged for each unrecognized key, but validation continues.
 * - `strict`: validation fails when an unrecognized key is encountered.
 */
export type ConfigValidationMode = 'off' | 'warn' | 'strict';

/**
 * Module-level validation mode applied by {@link parse}. Defaults to `off` so
 * that, unless explicitly configured, behavior is byte-for-byte identical to
 * the legacy validator.
 *
 * @remarks
 * This is process-global and is NOT reset automatically. Entry points set it
 * from the global config before loading the other configuration files. The
 * type-guard helpers (`is*Type`) deliberately validate in `off` mode regardless.
 */
let configValidationMode: ConfigValidationMode = 'off';

/**
 * Sets the validation mode used when parsing configuration files. Any value
 * other than `warn` or `strict` resolves to `off`.
 *
 * @param mode The desired {@link ConfigValidationMode}, or any value to coerce.
 */
export function setConfigValidationMode(mode: ConfigValidationMode | string | undefined): void {
  configValidationMode = mode === 'warn' || mode === 'strict' ? mode : 'off';
}

/**
 * Returns the currently configured {@link ConfigValidationMode}.
 */
export function getConfigValidationMode(): ConfigValidationMode {
  return configValidationMode;
}

/**
 * Computes the Levenshtein edit distance between two strings.
 */
function editDistance(a: string, b: string): number {
  const previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? diagonal : Math.min(diagonal, previous[j], previous[j - 1]) + 1;
      diagonal = temp;
    }
  }
  return previous[b.length];
}

/**
 * Finds the defined schema property whose name is closest to an unrecognized
 * key, used to produce a "did you mean" hint. Only returns a suggestion when
 * the candidate is reasonably close to the provided key.
 */
function closestKey(key: string, allowedKeys: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of allowedKeys) {
    const distance = editDistance(key, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (best !== undefined && bestDistance <= Math.max(2, Math.floor(key.length / 2))) {
    return best;
  }
  return undefined;
}

/**
 * Extracts unrecognized-key violations from a set of AJV errors.
 *
 * @param ajvErrors The `ajv.errors` array produced by the most recent validation.
 * @returns A map of `instancePath/key` to a human-readable "unrecognized key"
 * message (with an optional "did you mean" suggestion). Empty when there are no
 * unrecognized keys.
 *
 * @remarks
 * AJV (configured with `verbose: true`) reports an `additionalProperties`
 * violation for every key not defined in the schema. This helper isolates those
 * violations from genuine schema errors (type/enum/required), so callers can
 * decide - by {@link ConfigValidationMode} - whether to ignore, warn, or fail.
 * YAML anchors (top-level dot-prefixed keys) are permitted and skipped. A
 * violation raised inside a union (`anyOf`/`oneOf`) branch is only genuine when
 * the union as a whole failed to match; otherwise it is a false positive from a
 * branch the data legitimately did not match, and is suppressed.
 *
 * This never inspects missing keys: AJV reports those under the `required`
 * keyword, which this helper ignores. A missing key is therefore never treated
 * as unrecognized in any mode.
 */
function collectUnrecognizedKeys(ajvErrors: typeof ajv.errors): FilteredErrors {
  const unrecognized: FilteredErrors = {};
  if (ajvErrors === undefined || ajvErrors === null || ajvErrors.length === 0) {
    return unrecognized;
  }

  // Track instance paths where a union (anyOf/oneOf) matched no branch. An
  // additionalProperties violation that originates inside a union branch is only
  // genuine when the union as a whole failed; otherwise it is a false positive
  // emitted by a branch the data legitimately did not match.
  const failedUnionPaths = new Set<string>();
  for (const e of ajvErrors) {
    if (e.keyword === 'anyOf' || e.keyword === 'oneOf') {
      failedUnionPaths.add(e.instancePath);
    }
  }

  const isWithinFailedUnion = (instancePath: string): boolean => {
    for (const unionPath of failedUnionPaths) {
      if (instancePath === unionPath || instancePath.startsWith(`${unionPath}/`)) {
        return true;
      }
    }
    return false;
  };

  for (const e of ajvErrors) {
    if (e.keyword !== 'additionalProperties') {
      continue;
    }
    const badKey = (e.params as { additionalProperty?: string })?.additionalProperty;
    // YAML anchors (top-level dot-prefixed keys) are permitted; skip them.
    if (typeof badKey !== 'string' || badKey.startsWith('.')) {
      continue;
    }
    // Suppress additionalProperties errors raised by a union branch that the
    // data did not match (the union matched another branch and is valid).
    const schemaPath = typeof e.schemaPath === 'string' ? e.schemaPath : '';
    const insideUnion = schemaPath.includes('/anyOf/') || schemaPath.includes('/oneOf/');
    if (insideUnion && !isWithinFailedUnion(e.instancePath)) {
      continue;
    }
    const location = `${e.instancePath}/${badKey}`;
    // anyOf branches can surface the same key multiple times; report once.
    if (unrecognized[location] !== undefined) {
      continue;
    }
    const allowedKeys = Object.keys(
      (e.parentSchema as { properties?: { [key: string]: unknown } } | undefined)?.properties ?? {},
    );
    const suggestion = closestKey(badKey, allowedKeys);
    // Escape user-controlled key names (YAML keys may contain control
    // characters) to avoid forging log/error lines.
    const safeBadKey = JSON.stringify(badKey);
    unrecognized[location] = `unrecognized key ${safeBadKey}${
      suggestion ? `, did you mean ${JSON.stringify(suggestion)}?` : ''
    }`;
  }

  return unrecognized;
}

/**
 * Validates the provided content against the given JSON Schema.
 *
 * @param schema The JSON Schema object to validate the content against.
 * @param content The content to be validated.
 * @param mode The {@link ConfigValidationMode} controlling how unrecognized keys are handled.
 * @returns An object containing errors found during validation (filtered to ignore certain errors).
 *
 * @remarks
 * Unrecognized keys are handled per {@link ConfigValidationMode}: in `off` mode
 * they are suppressed (legacy behavior), in `warn` mode each is logged as a
 * warning, and in `strict` mode each is surfaced as a validation error. Genuine
 * schema errors (type/enum/required, including missing required keys) are always
 * reported regardless of mode. The `anyOf` wrapper error
 * (`"must match a schema in ..."`) is always suppressed.
 */
function validate(schema: JsonSchema, content: unknown, mode: ConfigValidationMode = 'off'): FilteredErrors {
  ajv.validate(schema, content);

  const errors: FilteredErrors = {};
  const unrecognized = collectUnrecognizedKeys(ajv.errors);

  if (ajv.errors !== undefined && ajv.errors !== null && ajv.errors.length > 0) {
    for (const e of ajv.errors) {
      // Unrecognized keys are handled separately (mode-aware) below.
      if (e.keyword === 'additionalProperties') {
        continue;
      }
      if (e.message !== undefined && !e.message.includes('must match a schema in')) {
        let message = e.message;
        if (!message.includes(e.schema as string)) {
          message += ` (${e.schema})`;
        }
        errors[e.instancePath] = message;
      }
    }
  }

  if (mode === 'warn') {
    for (const location of Object.keys(unrecognized)) {
      logger.warn(`${location} => ${unrecognized[location]}`);
    }
  } else if (mode === 'strict') {
    Object.assign(errors, unrecognized);
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
  const errors = validate(schema, content, configValidationMode);
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
 * A single unrecognized-key finding produced by {@link warnOnUnrecognizedKeys}.
 */
export interface UnrecognizedKeyFinding {
  /** The configuration file the finding was found in (e.g. `network-config.yaml`). */
  readonly file: string;
  /** The instance path of the offending key (e.g. `/vpcs/0/targetGroups/1/foo`). */
  readonly location: string;
  /** A human-readable message, including a "did you mean" hint where available. */
  readonly message: string;
}

/**
 * The set of configuration files and their schemas that {@link warnOnUnrecognizedKeys}
 * inspects. The filenames match the canonical `*.FILENAME` constants on the
 * config classes but are duplicated here to keep this module free of upstream
 * dependencies (the config classes import from here).
 */
const DIAGNOSABLE_CONFIG_FILES: { file: string; schema: JsonSchema }[] = [
  { file: 'accounts-config.yaml', schema: accountsSchema },
  { file: 'customizations-config.yaml', schema: customizationsSchema },
  { file: 'global-config.yaml', schema: globalSchema },
  { file: 'iam-config.yaml', schema: iamSchema },
  { file: 'network-config.yaml', schema: networkSchema },
  { file: 'organization-config.yaml', schema: organizationSchema },
  { file: 'replacements-config.yaml', schema: replacementsSchema },
  { file: 'security-config.yaml', schema: securitySchema },
];

/**
 * Scans every configuration file for unrecognized keys and logs each as a
 * warning. Returns the findings so callers can act further (e.g. count them).
 * Never throws.
 *
 * This is the advisory counterpart to {@link parse}: it runs the same
 * unrecognized-key detection used by `warn`/`strict` mode, but as a read-only
 * diagnostic that reports every offending key up front rather than failing
 * file-by-file mid-load. Callers decide when to invoke it (the pipeline
 * validator runs it only when the mode is `warn` or `strict`).
 *
 * @param configDirPath The directory containing the configuration files.
 * @param replacementsConfig Optional replacement preprocessor so files using
 * `{{ }}` tokens and `!include` load correctly. When omitted, files are parsed
 * as-is.
 * @returns One {@link UnrecognizedKeyFinding} per unrecognized key across all
 * files (empty when the configs are clean). Files that are absent (optional
 * configs) or that fail to load/parse are skipped silently - this diagnostic
 * must never block validation.
 *
 * @remarks
 * Missing keys are never reported: only keys that are present but not defined in
 * the schema surface here. This function does not mutate the module-level
 * {@link ConfigValidationMode}.
 */
export function warnOnUnrecognizedKeys(
  configDirPath: string,
  replacementsConfig?: { preProcessBuffer: (buffer: string) => string },
): UnrecognizedKeyFinding[] {
  const findings: UnrecognizedKeyFinding[] = [];
  const schema = createSchema(configDirPath, replacementsConfig);

  for (const { file, schema: jsonSchema } of DIAGNOSABLE_CONFIG_FILES) {
    const filePath = path.join(configDirPath, file);
    if (!fs.existsSync(filePath)) {
      // Optional configs (e.g. customizations, replacements) may not exist.
      continue;
    }
    let content: unknown;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const processed = replacementsConfig ? replacementsConfig.preProcessBuffer(raw) : raw;
      content = yaml.load(processed, { schema });
    } catch (e) {
      // A file that cannot even be read/parsed is not our concern here; the
      // real loaders will surface that error. Skip it so the diagnostic is
      // strictly additive and never blocks validation.
      logger.debug(`Skipping unrecognized-key diagnostic for ${file}: ${e}`);
      continue;
    }

    ajv.validate(jsonSchema, content);
    const unrecognized = collectUnrecognizedKeys(ajv.errors);
    for (const location of Object.keys(unrecognized)) {
      findings.push({ file, location, message: unrecognized[location] });
    }
  }

  if (findings.length === 0) {
    return findings;
  }
  // Tailor the guidance to the active mode: under `strict` these findings are
  // also enforced as errors and will fail validation, so pointing the operator
  // at strict (as the `warn`-mode message does) would be misleading.
  const guidance =
    configValidationMode === 'strict'
      ? `Because configurationValidationMode is 'strict', these will fail configuration validation.`
      : `These are ignored today and may indicate typos, misplaced settings, or unsupported options. Set ` +
        `configurationValidationMode to 'strict' in global-config.yaml to fail on them.`;
  logger.warn(`Found ${findings.length} unrecognized configuration key(s). ${guidance}`);
  for (const finding of findings) {
    logger.warn(`  ${finding.file}: ${finding.location} => ${finding.message}`);
  }
  return findings;
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

function createIncludeTag(
  baseDir: string,
  includeStack: string[],
  replacementsConfig?: { preProcessBuffer: (buffer: string) => string },
): yaml.Type {
  return new yaml.Type('!include', {
    kind: 'scalar',
    construct: (filePath: string) => {
      if (includeStack.includes(filePath)) {
        throw new Error(`Circular include detected: ${includeStack.join(' -> ')} -> ${filePath}`);
      }
      const fullPath = path.resolve(baseDir, filePath);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const processedContent = replacementsConfig ? replacementsConfig.preProcessBuffer(content) : content;
        return yaml.load(processedContent, {
          schema: createSchemaInternal(path.dirname(fullPath), [...includeStack, filePath], replacementsConfig),
        });
      } catch (e) {
        logger.error(`${e}`);
        throw new Error(`Failed to include file ${fullPath}: ${e}`);
      }
    },
  });
}

function createSchemaInternal(
  baseDir: string,
  includeStack: string[],
  replacementsConfig?: { preProcessBuffer: (buffer: string) => string },
): yaml.Schema {
  return yaml.DEFAULT_SCHEMA.extend([createIncludeTag(baseDir, includeStack, replacementsConfig)]);
}

export function createSchema(
  baseDir: string,
  replacementsConfig?: { preProcessBuffer: (buffer: string) => string },
): yaml.Schema {
  return createSchemaInternal(baseDir, [], replacementsConfig);
}

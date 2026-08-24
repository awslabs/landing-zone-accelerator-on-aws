/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { GetParametersCommand, GetParametersResult, Parameter, SSMClient } from '@aws-sdk/client-ssm';
import { throttlingBackOff } from './throttle';

const DYNAMIC_REFERENCE_MARKER = '{{resolve:';
const PLAINTEXT_SSM_DYNAMIC_REFERENCE_SOURCE = String.raw`\{\{resolve:ssm:([a-zA-Z0-9_.\-/]+)(?::(\d+))?\}\}`;
const SSM_PARAMETER_BATCH_SIZE = 10;

/** Parameter types CloudFormation expands for a plaintext `ssm` dynamic reference. */
const RESOLVABLE_SSM_PARAMETER_TYPES = new Set(['String', 'StringList']);

/**
 * Stable reason a value destined for public metadata was not resolved.
 */
export type PublicMetadataDynamicReferenceSkipReason =
  | 'unsupported-dynamic-reference'
  | 'ssm-parameter-missing'
  | 'ssm-unsupported-type'
  | 'ssm-access-denied'
  | 'ssm-throttling-exhausted'
  | 'ssm-resolution-failed';

/**
 * Result of resolving one value destined for public metadata.
 */
export type PublicMetadataDynamicReferenceResolution =
  | {
      /** Resolution completed and the value is safe to pass to the metadata-specific validator. */
      readonly status: 'resolved';
      /** Static value or plaintext SSM-expanded value. */
      readonly value: string;
    }
  | {
      /** Resolution was intentionally skipped without returning the input or any resolved fragment. */
      readonly status: 'skipped';
      /** Redacted stable reason for the skip. */
      readonly reason: PublicMetadataDynamicReferenceSkipReason;
    };

interface IPublicMetadataSsmSelector {
  readonly name: string;
  readonly version?: number;
}

type PublicMetadataTemplatePart = string | { readonly selector: IPublicMetadataSsmSelector };

type ParsedPublicMetadataValue =
  | {
      readonly status: 'parsed';
      readonly parts: readonly PublicMetadataTemplatePart[];
      readonly selectors: readonly IPublicMetadataSsmSelector[];
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'unsupported-dynamic-reference';
    };

type SsmSelectorResolution =
  | { readonly status: 'resolved'; readonly value: string }
  | { readonly status: 'skipped'; readonly reason: PublicMetadataDynamicReferenceSkipReason };

/**
 * Resolve the dynamic references CloudFormation expands before invoking a custom resource, which is
 * plaintext `ssm` only; `ssm-secure`, Secrets Manager, unknown, and malformed references are skipped
 * before any AWS API call.
 *
 * @param values Values to resolve in input order
 * @param client Target account and Region SSM client
 * @returns Results aligned with the input order
 */
export async function resolvePublicMetadataDynamicReferences(
  values: readonly string[],
  client: SSMClient,
): Promise<PublicMetadataDynamicReferenceResolution[]> {
  const parsedValues = values.map(value => parsePublicMetadataValue(value));
  const selectors = parsedValues.flatMap(parsed => (parsed.status === 'parsed' ? parsed.selectors : []));
  const selectorResolutions = await resolvePlaintextSsmSelectors(selectors, client);

  return parsedValues.map(parsed => {
    if (parsed.status === 'skipped') {
      return parsed;
    }

    let value = '';
    for (const part of parsed.parts) {
      if (typeof part === 'string') {
        value += part;
        continue;
      }

      const resolution = selectorResolutions.get(formatSelectorName(part.selector));
      if (!resolution || resolution.status === 'skipped') {
        return {
          status: 'skipped',
          reason: resolution?.reason ?? 'ssm-resolution-failed',
        };
      }
      value += resolution.value;
    }

    return { status: 'resolved', value };
  });
}

/**
 * Parse supported plaintext SSM references while rejecting every other dynamic reference type.
 *
 * @param value Public metadata value template
 * @returns Ordered literal and selector parts, or a redacted skip
 */
function parsePublicMetadataValue(value: string): ParsedPublicMetadataValue {
  if (!value.includes(DYNAMIC_REFERENCE_MARKER)) {
    return { status: 'parsed', parts: [value], selectors: [] };
  }

  const pattern = new RegExp(PLAINTEXT_SSM_DYNAMIC_REFERENCE_SOURCE, 'g');
  const parts: PublicMetadataTemplatePart[] = [];
  const selectors: IPublicMetadataSsmSelector[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const literal = value.slice(cursor, match.index);
    if (literal.includes(DYNAMIC_REFERENCE_MARKER)) {
      return { status: 'skipped', reason: 'unsupported-dynamic-reference' };
    }
    if (literal) {
      parts.push(literal);
    }

    const selector: IPublicMetadataSsmSelector = {
      name: match[1],
      ...(match[2] ? { version: Number(match[2]) } : {}),
    };
    parts.push({ selector });
    selectors.push(selector);
    cursor = match.index + match[0].length;
  }

  const trailingLiteral = value.slice(cursor);
  if (cursor === 0 || trailingLiteral.includes(DYNAMIC_REFERENCE_MARKER)) {
    return { status: 'skipped', reason: 'unsupported-dynamic-reference' };
  }
  if (trailingLiteral) {
    parts.push(trailingLiteral);
  }

  return { status: 'parsed', parts, selectors };
}

/**
 * Resolve unique plaintext SSM selectors in API-sized batches for one target.
 *
 * @param selectors Parsed plaintext SSM selectors
 * @param client Target account and Region SSM client
 * @returns Resolutions keyed by the exact requested selector
 */
async function resolvePlaintextSsmSelectors(
  selectors: readonly IPublicMetadataSsmSelector[],
  client: SSMClient,
): Promise<Map<string, SsmSelectorResolution>> {
  const uniqueSelectors = new Map<string, IPublicMetadataSsmSelector>();
  for (const selector of selectors) {
    uniqueSelectors.set(formatSelectorName(selector), selector);
  }

  const selectorEntries = [...uniqueSelectors.entries()];
  const resolutions = new Map<string, SsmSelectorResolution>();
  for (let index = 0; index < selectorEntries.length; index += SSM_PARAMETER_BATCH_SIZE) {
    const batch = selectorEntries.slice(index, index + SSM_PARAMETER_BATCH_SIZE);
    const names = batch.map(([name]) => name);
    let response: GetParametersResult;

    try {
      response = await throttlingBackOff(() =>
        client.send(new GetParametersCommand({ Names: names, WithDecryption: false })),
      );
    } catch (error: unknown) {
      const reason = getSsmFailureReason(error);
      batch.forEach(([name]) => resolutions.set(name, { status: 'skipped', reason }));
      continue;
    }

    const parametersBySelector = new Map<string, Parameter>();
    for (const parameter of response.Parameters ?? []) {
      const responseSelectorName = formatResponseSelectorName(parameter);
      if (responseSelectorName) {
        parametersBySelector.set(responseSelectorName, parameter);
      }
    }

    for (const [requestedName] of batch) {
      const parameter = parametersBySelector.get(requestedName);
      if ((response.InvalidParameters ?? []).includes(requestedName) || !parameter) {
        resolutions.set(requestedName, { status: 'skipped', reason: 'ssm-parameter-missing' });
      } else if (!RESOLVABLE_SSM_PARAMETER_TYPES.has(parameter.Type ?? '')) {
        resolutions.set(requestedName, { status: 'skipped', reason: 'ssm-unsupported-type' });
      } else if (parameter.Value === undefined) {
        resolutions.set(requestedName, { status: 'skipped', reason: 'ssm-resolution-failed' });
      } else {
        resolutions.set(requestedName, { status: 'resolved', value: parameter.Value });
      }
    }
  }

  return resolutions;
}

/**
 * Build the exact selector represented by an SSM response parameter.
 *
 * @param parameter SSM response parameter
 * @returns Parameter name and response selector, or undefined when no name is present
 */
function formatResponseSelectorName(parameter: Parameter): string | undefined {
  if (!parameter.Name) {
    return undefined;
  }
  return `${parameter.Name}${parameter.Selector ?? ''}`;
}

/**
 * Format a requested plaintext SSM selector.
 *
 * @param selector Parameter name and optional numeric version
 * @returns Name accepted by GetParameters
 */
function formatSelectorName(selector: IPublicMetadataSsmSelector): string {
  return selector.version === undefined ? selector.name : `${selector.name}:${selector.version}`;
}

/**
 * Convert an SSM lookup exception into a redacted stable reason.
 *
 * @param error Error raised while resolving selectors
 * @returns Redacted skip reason
 */
function getSsmFailureReason(error: unknown): PublicMetadataDynamicReferenceSkipReason {
  const name = error instanceof Error ? error.name : 'UnknownError';
  if (name === 'AccessDeniedException' || name === 'AccessDenied') {
    return 'ssm-access-denied';
  }
  if (name.includes('Throttl') || name.includes('TooManyRequests')) {
    return 'ssm-throttling-exhausted';
  }
  return 'ssm-resolution-failed';
}

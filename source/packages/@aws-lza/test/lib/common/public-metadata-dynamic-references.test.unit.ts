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

import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSend;
  },
  GetParametersCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
}));

vi.mock('../../../lib/common/throttle', () => ({
  throttlingBackOff: vi.fn(operation => operation()),
}));

import { resolvePublicMetadataDynamicReferences } from '../../../lib/common/public-metadata-dynamic-references';

type CommandWithInput = { input: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolvePublicMetadataDynamicReferences', () => {
  it('resolves static, standalone, embedded, multiple, and duplicate plaintext references in input order', async () => {
    mockSend.mockResolvedValue({
      Parameters: [
        { Name: '/two', Selector: ':3', Value: 'TWO', Type: 'String', Version: 3 },
        { Name: '/standalone', Value: 'STANDALONE', Type: 'String', Version: 1 },
        { Name: '/one', Value: 'ONE', Type: 'String', Version: 2 },
      ],
      InvalidParameters: [],
    });

    const results = await resolvePublicMetadataDynamicReferences(
      [
        'static',
        '{{resolve:ssm:/standalone}}',
        'prefix-{{resolve:ssm:/one}}-{{resolve:ssm:/two:3}}-{{resolve:ssm:/one}}-suffix',
      ],
      new SSMClient({}),
    );

    expect(results).toEqual([
      { status: 'resolved', value: 'static' },
      { status: 'resolved', value: 'STANDALONE' },
      { status: 'resolved', value: 'prefix-ONE-TWO-ONE-suffix' },
    ]);
    const command = mockSend.mock.calls[0][0] as CommandWithInput;
    expect(command).toBeInstanceOf(GetParametersCommand);
    expect(command.input).toEqual({
      Names: ['/standalone', '/one', '/two:3'],
      WithDecryption: false,
    });
  });

  it.each([
    {
      responseOrder: 'pinned first',
      parameters: [
        { Name: '/shared', Selector: ':3', Value: 'PINNED', Type: 'String', Version: 3 },
        { Name: '/shared', Value: 'LATEST', Type: 'String', Version: 4 },
      ],
    },
    {
      responseOrder: 'latest first',
      parameters: [
        { Name: '/shared', Value: 'LATEST', Type: 'String', Version: 4 },
        { Name: '/shared', Selector: ':3', Value: 'PINNED', Type: 'String', Version: 3 },
      ],
    },
  ])('maps latest and versioned selectors exactly with $responseOrder', async ({ parameters }) => {
    mockSend.mockResolvedValue({ Parameters: parameters, InvalidParameters: [] });

    const results = await resolvePublicMetadataDynamicReferences(
      ['{{resolve:ssm:/shared}}', '{{resolve:ssm:/shared:3}}'],
      new SSMClient({}),
    );

    expect(results).toEqual([
      { status: 'resolved', value: 'LATEST' },
      { status: 'resolved', value: 'PINNED' },
    ]);
  });

  it('deduplicates selectors and uses sequential batches of at most 10', async () => {
    mockSend.mockImplementation(command => {
      const names = ((command as CommandWithInput).input['Names'] as string[]) ?? [];
      return Promise.resolve({
        Parameters: names.map(name => ({ Name: name, Value: name, Type: 'String', Version: 1 })),
        InvalidParameters: [],
      });
    });
    const values = Array.from({ length: 11 }, (_, index) => `{{resolve:ssm:/parameter-${index}}}`);
    values.push('{{resolve:ssm:/parameter-0}}');

    const results = await resolvePublicMetadataDynamicReferences(values, new SSMClient({}));

    expect(results).toHaveLength(12);
    expect(results.every(result => result.status === 'resolved')).toBe(true);
    const batches = mockSend.mock.calls.map(
      ([command]) => ((command as CommandWithInput).input['Names'] as string[]) ?? [],
    );
    expect(batches.map(batch => batch.length)).toEqual([10, 1]);
    expect(batches.flat()).toEqual(Array.from({ length: 11 }, (_, index) => `/parameter-${index}`));
  });

  it('skips only values whose selector is missing', async () => {
    mockSend.mockResolvedValue({
      Parameters: [{ Name: '/present', Value: 'present-value', Type: 'String', Version: 1 }],
      InvalidParameters: ['/missing'],
    });

    const results = await resolvePublicMetadataDynamicReferences(
      ['before-{{resolve:ssm:/present}}-after', 'before-{{resolve:ssm:/missing}}-after', 'static'],
      new SSMClient({}),
    );

    expect(results).toEqual([
      { status: 'resolved', value: 'before-present-value-after' },
      { status: 'skipped', reason: 'ssm-parameter-missing' },
      { status: 'resolved', value: 'static' },
    ]);
    expect(JSON.stringify(results)).not.toContain('/missing');
  });

  it.each([
    ['SecureString', { Name: '/value', Value: 'ciphertext', Type: 'SecureString', Version: 1 }, 'ssm-unsupported-type'],
    ['missing value', { Name: '/value', Type: 'String', Version: 1 }, 'ssm-resolution-failed'],
  ])('skips a $0 response without returning its value', async (_name, parameter, reason) => {
    mockSend.mockResolvedValue({ Parameters: [parameter], InvalidParameters: [] });

    const results = await resolvePublicMetadataDynamicReferences(['{{resolve:ssm:/value}}'], new SSMClient({}));

    expect(results).toEqual([{ status: 'skipped', reason }]);
    expect(results[0]).not.toHaveProperty('value');
    expect(JSON.stringify(results)).not.toContain('/value');
    expect(JSON.stringify(results)).not.toContain('ciphertext');
  });

  it.each([
    ['a single-element StringList', 'only', 'only'],
    ['a multi-element StringList, leaving the comma for tag validation', 'one,two', 'one,two'],
  ])('resolves %s like CloudFormation does', async (_name, parameterValue, expected) => {
    mockSend.mockResolvedValue({
      Parameters: [{ Name: '/value', Value: parameterValue, Type: 'StringList', Version: 1 }],
      InvalidParameters: [],
    });

    const results = await resolvePublicMetadataDynamicReferences(['{{resolve:ssm:/value}}'], new SSMClient({}));

    expect(results).toEqual([{ status: 'resolved', value: expected }]);
  });

  it.each([
    ['access denied', 'AccessDeniedException', 'ssm-access-denied'],
    ['throttling', 'ThrottlingException', 'ssm-throttling-exhausted'],
    ['other failure', 'InternalServerError', 'ssm-resolution-failed'],
  ])('maps $0 to a redacted typed reason', async (_name, errorName, reason) => {
    const error = new Error('sensitive service detail');
    error.name = errorName;
    mockSend.mockRejectedValue(error);

    const results = await resolvePublicMetadataDynamicReferences(['{{resolve:ssm:/value}}'], new SSMClient({}));

    expect(results).toEqual([{ status: 'skipped', reason }]);
    expect(JSON.stringify(results)).not.toContain('sensitive service detail');
    expect(JSON.stringify(results)).not.toContain('/value');
  });

  it.each([
    '{{resolve:ssm-secure:/secret-path}}',
    '{{resolve:secretsmanager:secret-id:SecretString:key}}',
    '{{resolve:unknown:identifier}}',
    '{{resolve:ssm:/path:not-a-version}}',
    '{{resolve:ssm:/path with space}}',
    '{{resolve:ssm:/path:}}',
    '{{resolve:ssm:/path',
    'prefix-{{resolve:ssm:/valid}}-{{resolve:ssm-secure:/secret-path}}',
  ])('skips unsupported or malformed expression without calling a secret-capable API: %s', async value => {
    const results = await resolvePublicMetadataDynamicReferences([value], new SSMClient({}));

    expect(results).toEqual([{ status: 'skipped', reason: 'unsupported-dynamic-reference' }]);
    expect(mockSend).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain(value);
  });
});

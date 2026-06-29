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

/* eslint @typescript-eslint/no-explicit-any: 0 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CustomStack } from '../../lib/stacks/custom-stack';

/**
 * These tests guard the type coercion done by `transformCfnParametersArrayToObject`
 * in `custom-stack.ts`. The function is module-private, so the behavior is exercised
 * through the public `CustomStack`, which feeds the converted values into `CfnInclude`.
 *
 * A minimal CloudFormation template references each parameter from an Output, so the
 * value (and its JS type) that CfnInclude substitutes is observable in the synthesized
 * template.
 */
const TEMPLATE_BODY = {
  AWSTemplateFormatVersion: '2010-09-09',
  Parameters: {
    DefaultParam: { Type: 'String' },
    ExplicitStringParam: { Type: 'String' },
    NumberParam: { Type: 'Number' },
    ListNumberParam: { Type: 'List<Number>' },
    CommaListParam: { Type: 'CommaDelimitedList' },
  },
  Resources: {
    Placeholder: { Type: 'AWS::CloudFormation::WaitConditionHandle' },
  },
  Outputs: {
    DefaultOut: { Value: { Ref: 'DefaultParam' } },
    ExplicitStringOut: { Value: { Ref: 'ExplicitStringParam' } },
    NumberOut: { Value: { Ref: 'NumberParam' } },
    ListNumberOut: { Value: { 'Fn::Join': [',', { Ref: 'ListNumberParam' }] } },
    CommaListOut: { Value: { 'Fn::Join': [',', { Ref: 'CommaListParam' }] } },
  },
};

describe('CustomStack CfnParameter type handling', () => {
  let tmpDir: string;
  const templateFile = 'param-types.template.json';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-custom-stack-'));
    fs.writeFileSync(path.join(tmpDir, templateFile), JSON.stringify(TEMPLATE_BODY), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  type Param = { name: string; value: string; type?: string };

  // A fully valid parameter set covering every supported type. The template requires
  // all five parameters, so each test starts from this set and overrides only the
  // entries relevant to what it asserts via `paramsWith`.
  const VALID_PARAMS: Param[] = [
    { name: 'DefaultParam', value: '8080' },
    { name: 'ExplicitStringParam', value: '8080', type: 'String' },
    { name: 'NumberParam', value: '8080', type: 'Number' },
    { name: 'ListNumberParam', value: '1, 2, 3', type: 'List<Number>' },
    { name: 'CommaListParam', value: 'a, b, c', type: 'CommaDelimitedList' },
  ];

  /** Returns the valid parameter set with the given entries replaced (matched by name). */
  function paramsWith(...overrides: Param[]): Param[] {
    return VALID_PARAMS.map(param => overrides.find(override => override.name === param.name) ?? param);
  }

  function synthOutputs(parameters: Param[]): Record<string, any> {
    const app = new cdk.App();
    // Props are cast to `any`: the CustomStack constructor only consumes a handful of
    // these fields, so the heavy config objects are not needed to exercise the transform.
    const stack = new CustomStack(app, 'TestCustomStack', {
      env: { account: '111111111111', region: 'us-east-1' },
      configDirPath: tmpDir,
      templateFile,
      stackName: 'test-custom-stack',
      runOrder: 1,
      terminationProtection: false,
      ssmParamNamePrefix: '/accelerator',
      parameters,
    } as any);
    return Template.fromStack(stack).toJSON().Outputs;
  }

  test('a parameter without a type defaults to String (pre-change behavior preserved)', () => {
    const outputs = synthOutputs(VALID_PARAMS);

    // No `type` -> treated as String. A numeric-looking value MUST remain the raw
    // string and MUST NOT be coerced to a number, matching behavior before the
    // list/number parameter support was added.
    expect(outputs.DefaultOut.Value).toBe('8080');
    expect(typeof outputs.DefaultOut.Value).toBe('string');

    // An explicit `type: 'String'` behaves identically to the default.
    expect(outputs.ExplicitStringOut.Value).toBe('8080');
    expect(typeof outputs.ExplicitStringOut.Value).toBe('string');
  });

  test('typed parameters are converted to their matching CloudFormation type', () => {
    const outputs = synthOutputs(VALID_PARAMS);

    // 'Number' -> JS number.
    expect(outputs.NumberOut.Value).toBe(8080);
    expect(typeof outputs.NumberOut.Value).toBe('number');

    // 'List<Number>' -> array of numbers (whitespace trimmed).
    expect(outputs.ListNumberOut.Value['Fn::Join'][1]).toEqual([1, 2, 3]);

    // 'CommaDelimitedList' -> array of strings (whitespace trimmed).
    expect(outputs.CommaListOut.Value['Fn::Join'][1]).toEqual(['a', 'b', 'c']);
  });

  test('empty and blank list elements are dropped instead of producing blank entries', () => {
    // Trailing comma and a whitespace-only element must not yield NaN/blank entries.
    const outputs = synthOutputs(
      paramsWith(
        { name: 'ListNumberParam', value: '1, ,3,', type: 'List<Number>' },
        { name: 'CommaListParam', value: 'a, ,c,', type: 'CommaDelimitedList' },
      ),
    );

    expect(outputs.ListNumberOut.Value['Fn::Join'][1]).toEqual([1, 3]);
    expect(outputs.CommaListOut.Value['Fn::Join'][1]).toEqual(['a', 'c']);
  });

  test('a non-numeric Number value fails fast with an actionable error', () => {
    expect(() => synthOutputs(paramsWith({ name: 'NumberParam', value: 'abc', type: 'Number' }))).toThrow(
      /NumberParam.*abc.*not a valid number/,
    );
  });

  test('a non-numeric List<Number> element fails fast with an actionable error', () => {
    expect(() => synthOutputs(paramsWith({ name: 'ListNumberParam', value: '1, x, 3', type: 'List<Number>' }))).toThrow(
      /ListNumberParam.*x.*not a valid number/,
    );
  });

  test('a fully non-numeric List<Number> value fails fast with an actionable error', () => {
    expect(() => synthOutputs(paramsWith({ name: 'ListNumberParam', value: 'abc', type: 'List<Number>' }))).toThrow(
      /ListNumberParam.*abc.*not a valid number/,
    );
  });

  test('an empty Number value fails fast instead of silently coercing to 0', () => {
    // `Number('')` is 0, not NaN, so a blank value must be rejected explicitly.
    expect(() => synthOutputs(paramsWith({ name: 'NumberParam', value: '', type: 'Number' }))).toThrow(
      /NumberParam.*not a valid number/,
    );
  });

  test('a whitespace-only Number value fails fast instead of silently coercing to 0', () => {
    expect(() => synthOutputs(paramsWith({ name: 'NumberParam', value: '   ', type: 'Number' }))).toThrow(
      /NumberParam.*not a valid number/,
    );
  });

  test('an unsupported parameter type fails fast instead of silently passing the raw string', () => {
    // The config schema constrains `type` to the supported set, but config is parsed from
    // YAML at runtime, so an unsupported value (e.g. a valid CFN type LZA does not handle)
    // must be rejected with an actionable error rather than fall through to the raw string.
    expect(() =>
      synthOutputs(paramsWith({ name: 'ExplicitStringParam', value: 'my-key', type: 'AWS::EC2::KeyPair::KeyName' })),
    ).toThrow(/ExplicitStringParam.*unsupported type.*AWS::EC2::KeyPair::KeyName/);
  });
});

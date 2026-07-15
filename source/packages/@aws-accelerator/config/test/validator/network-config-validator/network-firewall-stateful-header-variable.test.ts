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

import { describe, test, expect } from 'vitest';
import { NetworkConfig } from '../../../lib/network-config';
import { NetworkFirewallValidator } from '../../../validator/network-config-validator/network-firewall-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

/**
 * Tests targeting NetworkFirewallValidator stateful rule header source/destination
 * validation.
 *
 * Locks in the fix for GitHub issue awslabs/landing-zone-accelerator-on-aws#1080
 * (GitLab #4475): a stateful rule header source/destination may reference a rule
 * variable declared under that rule group's ruleVariables.ipSets (e.g. "$HOME_NET"
 * or "[$HOME_NET]"), in addition to a literal IPv4 CIDR or the string "ANY".
 */
describe('NetworkFirewallValidator stateful rule header rule variables', () => {
  /**
   * Build a minimal NetworkConfig-shaped fixture that exercises only the
   * stateful rule header validation path. A single STATEFUL rule group is
   * created with the provided header source/destination and optional
   * ruleVariables.ipSets; firewalls, policies and vpcs are empty so no
   * unrelated validation paths fire.
   */
  function buildConfig(opts: { source: string; destination: string; ipSetNames?: string[] }): NetworkConfig {
    const ruleVariables = opts.ipSetNames
      ? {
          ipSets: opts.ipSetNames.map(name => ({ name, definition: ['10.0.0.0/16'] })),
          portSets: { name: 'CUSTOM_PORTS', definition: ['443'] },
        }
      : undefined;

    return {
      vpcs: [],
      vpcTemplates: [],
      centralNetworkServices: {
        delegatedAdminAccount: 'Network',
        networkFirewall: {
          firewalls: [],
          policies: [],
          rules: [
            {
              name: 'test-rule-group',
              regions: ['us-east-1'],
              capacity: 100,
              type: 'STATEFUL',
              ruleGroup: {
                ruleVariables,
                rulesSource: {
                  statefulRules: [
                    {
                      action: 'PASS',
                      header: {
                        source: opts.source,
                        sourcePort: 'ANY',
                        destination: opts.destination,
                        destinationPort: 'ANY',
                        direction: 'ANY',
                        protocol: 'IP',
                      },
                      ruleOptions: [{ keyword: 'sid', settings: ['100'] }],
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    } as unknown as NetworkConfig;
  }

  /**
   * Build the NetworkValidatorFunctions helper with a single Network account
   * in the Infrastructure OU and us-east-1 as the only enabled region.
   */
  function buildHelpers(config: NetworkConfig): NetworkValidatorFunctions {
    return new NetworkValidatorFunctions(
      config,
      ['Root', 'Infrastructure'],
      [
        {
          name: 'Network',
          description: '',
          email: 'network@example.com',
          organizationalUnit: 'Infrastructure',
          warm: true,
          accountAlias: undefined,
        },
      ],
      [],
      ['us-east-1'],
    );
  }

  /** Run the validator and return accumulated errors. */
  function runValidator(config: NetworkConfig): string[] {
    const helpers = buildHelpers(config);
    const errors: string[] = [];
    new NetworkFirewallValidator(config, '/tmp/lza-test', helpers, errors);
    return errors;
  }

  /** Filter errors to only those referencing the stateful rule header. */
  function headerErrors(errors: string[]): string[] {
    return errors.filter(e => e.includes('stateful rule header'));
  }

  // --------------------------------------------------------------------
  // Regression prevention: existing accepted values keep working
  // --------------------------------------------------------------------

  test('accepts a valid IPv4 CIDR source and destination', () => {
    const errors = runValidator(buildConfig({ source: '10.1.0.0/16', destination: '10.0.0.0/16' }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts the string "ANY" and "any"', () => {
    const errors = runValidator(buildConfig({ source: 'ANY', destination: 'any' }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('still rejects a genuinely invalid value', () => {
    const errors = runValidator(buildConfig({ source: 'not-an-ip', destination: 'ANY' }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('"not-an-ip"');
  });

  // --------------------------------------------------------------------
  // New behaviour: declared rule variable references
  // --------------------------------------------------------------------

  test('accepts a bracketed rule variable reference declared in ipSets (the reported case)', () => {
    const errors = runValidator(buildConfig({ source: '[$HOME_NET]', destination: 'ANY', ipSetNames: ['HOME_NET'] }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts an unbracketed rule variable reference declared in ipSets', () => {
    const errors = runValidator(buildConfig({ source: '$HOME_NET', destination: 'ANY', ipSetNames: ['HOME_NET'] }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts rule variable references in both source and destination', () => {
    const errors = runValidator(
      buildConfig({ source: '[$HOME_NET]', destination: '$EXTERNAL_NET', ipSetNames: ['HOME_NET', 'EXTERNAL_NET'] }),
    );
    expect(headerErrors(errors)).toEqual([]);
  });

  // --------------------------------------------------------------------
  // Built-in variables: HOME_NET and EXTERNAL_NET are always valid, even
  // when not declared under ruleVariables.ipSets. Network Firewall provides
  // both automatically (HOME_NET defaults to the inspection VPC CIDR or a
  // policy-level override; EXTERNAL_NET defaults to the negation of
  // HOME_NET), so requiring a local declaration would reject valid configs.
  // --------------------------------------------------------------------

  test('accepts the built-in $HOME_NET variable with no ruleVariables declared at all', () => {
    const errors = runValidator(buildConfig({ source: '$HOME_NET', destination: 'ANY' }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts the built-in [$EXTERNAL_NET] variable with no ruleVariables declared at all', () => {
    const errors = runValidator(buildConfig({ source: 'ANY', destination: '[$EXTERNAL_NET]' }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts built-in HOME_NET and EXTERNAL_NET together with no ruleVariables declared', () => {
    const errors = runValidator(buildConfig({ source: '$HOME_NET', destination: '$EXTERNAL_NET' }));
    expect(headerErrors(errors)).toEqual([]);
  });

  test('accepts the built-in $HOME_NET variable even when other custom ipSets are declared', () => {
    const errors = runValidator(
      buildConfig({ source: '$HOME_NET', destination: '[$CUSTOM_NET]', ipSetNames: ['CUSTOM_NET'] }),
    );
    expect(headerErrors(errors)).toEqual([]);
  });

  // --------------------------------------------------------------------
  // Strict cross-check: undeclared, non-built-in variable names are rejected
  // --------------------------------------------------------------------

  test('rejects a rule variable reference that is not declared in ipSets', () => {
    const errors = runValidator(buildConfig({ source: '[$CUSTOM_NET]', destination: 'ANY' }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('CUSTOM_NET');
    expect(matching[0]).toContain('ruleVariables.ipSets');
  });

  test('rejects a misspelled variable name while a similar one is declared', () => {
    const errors = runValidator(buildConfig({ source: '[$HOME_NAT]', destination: 'ANY', ipSetNames: ['HOME_NET'] }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('HOME_NAT');
  });

  // --------------------------------------------------------------------
  // Malformed reference syntax gets a descriptive error
  // --------------------------------------------------------------------

  test('rejects a malformed reference with a descriptive error', () => {
    const errors = runValidator(buildConfig({ source: '$HOME NET', destination: 'ANY', ipSetNames: ['HOME_NET'] }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('$HOME NET');
  });

  test('rejects an unbalanced bracket reference', () => {
    const errors = runValidator(buildConfig({ source: '[$HOME_NET', destination: 'ANY', ipSetNames: ['HOME_NET'] }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('[$HOME_NET');
  });

  test('rejects a bracketed list mixing a CIDR and a variable with a message explaining lists are unsupported', () => {
    const errors = runValidator(
      buildConfig({ source: '[10.0.0.0/8,$HOME_NET]', destination: 'ANY', ipSetNames: ['HOME_NET'] }),
    );
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('[10.0.0.0/8,$HOME_NET]');
    expect(matching[0]).toContain('not supported');
  });

  test('rejects a bracketed list of multiple variables with a message explaining lists are unsupported', () => {
    const errors = runValidator(
      buildConfig({
        source: '[$HOME_NET,$EXTERNAL_NET]',
        destination: 'ANY',
        ipSetNames: ['HOME_NET', 'EXTERNAL_NET'],
      }),
    );
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('not supported');
  });

  test('rejects bracketed garbage with a comma using the generic error, not the list-specific message', () => {
    // Regression test: a comma inside brackets is not sufficient on its own to be
    // treated as an unsupported list. Every segment must itself look like a CIDR
    // or a "$NAME" reference, otherwise this is just malformed input.
    const errors = runValidator(buildConfig({ source: '[foo,bar]', destination: 'ANY' }));
    const matching = headerErrors(errors);
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain('[foo,bar]');
    expect(matching[0]).not.toContain('not supported');
    expect(matching[0]).toContain('Valid values are');
  });
});

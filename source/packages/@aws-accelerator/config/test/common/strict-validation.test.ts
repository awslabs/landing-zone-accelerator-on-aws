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

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Capture warnings emitted by the parse logger.
const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));
vi.mock('@aws-accelerator/utils/lib/logger', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: warnSpy,
    error: () => {},
  }),
}));

import {
  createSchema,
  setConfigValidationMode,
  getConfigValidationMode,
  warnOnUnrecognizedKeys,
  parseAccountsConfig,
  parseCustomizationsConfig,
  parseGlobalConfig,
  parseIamConfig,
  parseNetworkConfig,
  parseOrganizationConfig,
  parseReplacementsConfig,
  parseSecurityConfig,
} from '../../lib/common/parse';
import { GlobalConfig } from '../../lib/global-config';
import { SNAPSHOT_CONFIG } from '../config-test-helper';

const configDir = SNAPSHOT_CONFIG;

// Minimal replacement preprocessor so fixtures with {{ }} tokens load.
const replacements = {
  preProcessBuffer: (buffer: string) => buffer.replace(/{{[^}]*}}/g, 'placeholder'),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadObj(file: string): any {
  const raw = replacements.preProcessBuffer(fs.readFileSync(path.join(configDir, file), 'utf8'));
  return yaml.load(raw, { schema: createSchema(configDir, replacements) });
}

// The snapshot global-config validates cleanly under strict mode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadCleanGlobal(): any {
  return loadObj('global-config.yaml');
}

// Recursively locate the first value stored under `key`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findFirst(obj: any, key: string): any | undefined {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = findFirst(item, key);
        if (result !== undefined) return result;
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
      for (const k of Object.keys(obj)) {
        const result = findFirst(obj[k], key);
        if (result !== undefined) return result;
      }
    }
  }
  return undefined;
}

const PARSERS: Record<string, { file: string; parse: (content: unknown) => unknown }> = {
  accounts: { file: 'accounts-config.yaml', parse: parseAccountsConfig },
  customizations: { file: 'customizations-config.yaml', parse: parseCustomizationsConfig },
  global: { file: 'global-config.yaml', parse: parseGlobalConfig },
  iam: { file: 'iam-config.yaml', parse: parseIamConfig },
  network: { file: 'network-config.yaml', parse: parseNetworkConfig },
  organization: { file: 'organization-config.yaml', parse: parseOrganizationConfig },
  replacements: { file: 'replacements-config.yaml', parse: parseReplacementsConfig },
  security: { file: 'security-config.yaml', parse: parseSecurityConfig },
};

describe('strict configuration validation', () => {
  afterEach(() => {
    setConfigValidationMode('off');
    warnSpy.mockClear();
  });

  describe('mode setting (Requirement 1)', () => {
    it('defaults to off', () => {
      setConfigValidationMode(undefined);
      expect(getConfigValidationMode()).toBe('off');
    });

    it('accepts off, warn, strict', () => {
      setConfigValidationMode('warn');
      expect(getConfigValidationMode()).toBe('warn');
      setConfigValidationMode('strict');
      expect(getConfigValidationMode()).toBe('strict');
      setConfigValidationMode('off');
      expect(getConfigValidationMode()).toBe('off');
    });

    it('falls back to off for an invalid value', () => {
      setConfigValidationMode('bogus');
      expect(getConfigValidationMode()).toBe('off');
    });
  });

  describe('off mode preserves current behavior (Requirement 3)', () => {
    it.each(Object.keys(PARSERS))('accepts an unrecognized top-level key in %s config', name => {
      const { file, parse } = PARSERS[name];
      const obj = loadObj(file);
      obj.totallyMadeUpKey = 'ignored';
      setConfigValidationMode('off');
      expect(() => parse(obj)).not.toThrow();
    });

    it('still reports genuine (non-additionalProperties) errors in off mode', () => {
      const obj = loadObj('global-config.yaml');
      obj.homeRegion = 12345; // wrong type
      setConfigValidationMode('off');
      expect(() => parseGlobalConfig(obj)).toThrow();
    });
  });

  describe('warn mode (Requirement 4)', () => {
    it('logs a warning but does not throw on an unrecognized key', () => {
      const obj = loadObj('global-config.yaml');
      obj.misspeltKey = true;
      setConfigValidationMode('warn');
      expect(() => parseGlobalConfig(obj)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls.flat().join(' ')).toContain('misspeltKey');
    });

    it('does not warn when there are no unrecognized keys', () => {
      const obj = loadCleanGlobal();
      setConfigValidationMode('warn');
      expect(() => parseGlobalConfig(obj)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('strict mode (Requirement 5)', () => {
    it.each(Object.keys(PARSERS))('fails on an unrecognized top-level key in %s config', name => {
      const { file, parse } = PARSERS[name];
      const obj = loadObj(file);
      obj.totallyMadeUpKey = 'boom';
      setConfigValidationMode('strict');
      expect(() => parse(obj)).toThrow(/totallyMadeUpKey/);
    });

    it('includes a "did you mean" suggestion for a near-miss key', () => {
      const obj = loadObj('global-config.yaml');
      obj.homeRegionn = obj.homeRegion;
      setConfigValidationMode('strict');
      expect(() => parseGlobalConfig(obj)).toThrow(/did you mean .*homeRegion/);
    });

    it('reports a nested unrecognized key (Requirement 8.3)', () => {
      const obj = loadObj('global-config.yaml');
      obj.logging.cloudtrail.notARealField = true;
      setConfigValidationMode('strict');
      expect(() => parseGlobalConfig(obj)).toThrow(/notARealField/);
    });
  });

  // A missing key is never an unrecognized key. Strict mode only rejects keys
  // that are PRESENT but not in the schema; it must never require an optional
  // key to be present, and an absent optional key must fall back to its default.
  // (A missing *required* key is a schema error surfaced in every mode, strict
  // included - that predates this feature and is intentionally unchanged.)
  describe('strict mode never rejects missing keys (defaults preserved)', () => {
    it.each(Object.keys(PARSERS))(
      'accepts a config with optional keys omitted in %s config under strict mode',
      name => {
        const { file, parse } = PARSERS[name];
        // The shipped sample configs deliberately omit many optional keys; if
        // strict rejected absent keys, these would all throw.
        const obj = loadObj(file);
        setConfigValidationMode('strict');
        expect(() => parse(obj)).not.toThrow();
      },
    );

    it('does not throw when a populated optional key is removed under strict mode', () => {
      const obj = loadObj('global-config.yaml');
      // Remove optional keys that are present in the sample config.
      delete obj.snsTopics;
      delete obj.tags;
      setConfigValidationMode('strict');
      expect(() => parseGlobalConfig(obj)).not.toThrow();
    });

    it('applies the class default for an optional key omitted from the config (strict mode)', () => {
      // terminationProtection is optional and absent from the snapshot global
      // config; the runtime class default is true. Strict mode must not change
      // this: the absent key resolves to its default rather than erroring.
      setConfigValidationMode('strict');
      const globalConfig = GlobalConfig.load(SNAPSHOT_CONFIG, {
        preProcessBuffer: (buffer: string) => buffer.replace(/{{[^}]*}}/g, 'placeholder'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(globalConfig.terminationProtection).toBe(true);
    });

    it('still rejects a missing REQUIRED key in strict mode (pre-existing schema error)', () => {
      const obj = loadObj('global-config.yaml');
      delete obj.homeRegion; // required by the schema
      setConfigValidationMode('strict');
      expect(() => parseGlobalConfig(obj)).toThrow(/required property 'homeRegion'/);
    });

    it('rejects the same missing REQUIRED key in off mode too (behavior is unchanged by strict)', () => {
      const obj = loadObj('global-config.yaml');
      delete obj.homeRegion;
      setConfigValidationMode('off');
      expect(() => parseGlobalConfig(obj)).toThrow(/required property 'homeRegion'/);
    });
  });

  describe('YAML anchor keys remain valid (Requirement 7)', () => {
    it('accepts a top-level dot-prefixed key in strict mode', () => {
      const obj = loadCleanGlobal();
      obj['.anchors'] = { foo: 'bar' };
      setConfigValidationMode('strict');
      expect(() => parseGlobalConfig(obj)).not.toThrow();
    });
  });

  describe('real-world incident cases (Requirement 8.6)', () => {
    it('detects option vs options on a transit gateway attachment in strict mode', () => {
      const net = loadObj('network-config.yaml');
      const attachments = findFirst(net, 'transitGatewayAttachments');
      expect(Array.isArray(attachments)).toBe(true);
      attachments[0].option = { applianceModeSupport: 'enable' };
      setConfigValidationMode('strict');
      expect(() => parseNetworkConfig(net)).toThrow(/option/);
    });

    it('detects serviceDelegations in organization config in strict mode', () => {
      const org = loadObj('organization-config.yaml');
      org.serviceDelegations = { service: 'aws-marketplace' };
      setConfigValidationMode('strict');
      expect(() => parseOrganizationConfig(org)).toThrow(/serviceDelegations/);
    });

    it('detects account vs accounts in a deploymentTargets block in strict mode', () => {
      const sec = loadObj('security-config.yaml');
      const deploymentTargets = findFirst(sec, 'deploymentTargets');
      expect(deploymentTargets).toBeDefined();
      deploymentTargets.account = ['Management'];
      setConfigValidationMode('strict');
      expect(() => parseSecurityConfig(sec)).toThrow(/account/);
    });
  });

  // YAML anchors and merge keys (<<: *anchor) are expanded by js-yaml before
  // validation runs, so strict mode validates the fully-merged object.
  describe('YAML anchors and merge keys', () => {
    const baseOrg = [
      'enable: true',
      'organizationalUnits:',
      '  - name: Security',
      'serviceControlPolicies: []',
      'taggingPolicies: []',
      'backupPolicies: []',
    ].join('\n');

    it('validates an object assembled from a merge-key anchor in strict mode', () => {
      const doc = [
        '.base: &base',
        '  enable: true',
        '  scpPolicyName: Quarantine',
        baseOrg,
        'quarantineNewAccounts:',
        '  <<: *base',
      ].join('\n');
      const obj = yaml.load(doc);
      setConfigValidationMode('strict');
      expect(() => parseOrganizationConfig(obj)).not.toThrow();
    });

    it('detects a typo carried in through a merge-key anchor in strict mode', () => {
      const doc = [
        '.base: &base',
        '  enable: true',
        '  scpPolicyNameTypo: Quarantine',
        baseOrg,
        'quarantineNewAccounts:',
        '  <<: *base',
      ].join('\n');
      const obj = yaml.load(doc);
      setConfigValidationMode('strict');
      expect(() => parseOrganizationConfig(obj)).toThrow(/scpPolicyNameTypo/);
    });

    it('ignores the same merge-key typo in off mode', () => {
      const doc = [
        '.base: &base',
        '  enable: true',
        '  scpPolicyNameTypo: Quarantine',
        baseOrg,
        'quarantineNewAccounts:',
        '  <<: *base',
      ].join('\n');
      const obj = yaml.load(doc);
      setConfigValidationMode('off');
      expect(() => parseOrganizationConfig(obj)).not.toThrow();
    });
  });

  // The !include tag inlines referenced files at load time, so strict mode
  // validates the merged content - including keys that came from included files.
  describe('!include directive', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    const writeConfig = (childContents: string): unknown => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-include-'));
      fs.writeFileSync(path.join(tmpDir, 'quarantine.yaml'), childContents);
      const main = [
        'enable: true',
        'organizationalUnits:',
        '  - name: Security',
        'serviceControlPolicies: []',
        'taggingPolicies: []',
        'backupPolicies: []',
        'quarantineNewAccounts: !include quarantine.yaml',
      ].join('\n');
      return yaml.load(main, { schema: createSchema(tmpDir) });
    };

    it('validates content pulled in from an included file in strict mode', () => {
      const obj = writeConfig('enable: true\nscpPolicyName: Quarantine\n');
      setConfigValidationMode('strict');
      expect(() => parseOrganizationConfig(obj)).not.toThrow();
    });

    it('detects an unrecognized key inside an included file in strict mode', () => {
      const obj = writeConfig('enable: true\nscpPolicyNameTypo: Quarantine\n');
      setConfigValidationMode('strict');
      expect(() => parseOrganizationConfig(obj)).toThrow(/scpPolicyNameTypo/);
    });

    it('ignores an unrecognized key inside an included file in off mode', () => {
      const obj = writeConfig('enable: true\nscpPolicyNameTypo: Quarantine\n');
      setConfigValidationMode('off');
      expect(() => parseOrganizationConfig(obj)).not.toThrow();
    });
  });

  // Every shipped sample config must validate cleanly under strict mode. This is
  // the strongest guard the feature has: it proves the schemas and the sample
  // configs agree, and it fails the build if anyone reintroduces a key that the
  // runtime silently drops (a misplaced attribute, a typo, or a dead key) into
  // one of these files.
  describe('shipped sample configs under strict mode (coverage)', () => {
    it('covers every sample config (no config silently skipped)', () => {
      expect(Object.keys(PARSERS).sort()).toEqual(
        ['accounts', 'customizations', 'global', 'iam', 'network', 'organization', 'replacements', 'security'].sort(),
      );
    });

    it.each(Object.keys(PARSERS))('validates the %s sample config cleanly under strict mode', name => {
      const { file, parse } = PARSERS[name];
      const obj = loadObj(file);
      setConfigValidationMode('strict');
      expect(() => parse(obj)).not.toThrow();
    });

    it.each(Object.keys(PARSERS))('emits no warnings for the %s sample config in warn mode', name => {
      const { file, parse } = PARSERS[name];
      const obj = loadObj(file);
      setConfigValidationMode('warn');
      expect(() => parse(obj)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // Exercises the union (anyOf/oneOf) suppression logic in validate(). A security
  // group rule `source` is a 4-branch anyOf (string CIDR, subnet source, security
  // group source, prefix list source). Strict mode must accept any valid branch
  // without false positives, yet still catch a typo when no branch matches.
  describe('union (anyOf/oneOf) branches under strict mode', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const minimalNetwork = (sources: unknown): any => ({
      defaultVpc: { delete: true },
      endpointPolicies: [],
      transitGateways: [],
      vpcs: [
        {
          name: 'Test',
          account: 'Management',
          region: 'us-east-1',
          securityGroups: [
            {
              name: 'Web',
              inboundRules: [{ description: 'in', sources }],
              outboundRules: [{ description: 'out', sources: ['10.0.0.0/8'] }],
            },
          ],
        },
      ],
    });

    it('accepts values matching different branches of a multi-branch union', () => {
      const sources = [
        '10.0.0.0/16',
        { account: 'Management', vpc: 'Test', subnets: ['A'] },
        { securityGroups: ['Web'] },
      ];
      setConfigValidationMode('strict');
      expect(() => parseNetworkConfig(minimalNetwork(sources))).not.toThrow();
    });

    it('does not warn on a valid multi-branch union in warn mode', () => {
      const sources = ['10.0.0.0/16', { securityGroups: ['Web'] }];
      setConfigValidationMode('warn');
      expect(() => parseNetworkConfig(minimalNetwork(sources))).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('detects a typo inside a union branch when no branch matches', () => {
      // `subnetz` is a typo for `subnets`; with it, no source branch matches, so
      // the union fails and the offending key is surfaced with a suggestion.
      const sources = [{ account: 'Management', vpc: 'Test', subnetz: ['A'] }];
      setConfigValidationMode('strict');
      expect(() => parseNetworkConfig(minimalNetwork(sources))).toThrow(/subnetz.*did you mean .*subnets/);
    });
  });

  // The non-blocking warn diagnostic that runs once at the start of validation
  // (see config-validator.ts) so operators always see silently-dropped keys,
  // independent of the configured validation mode.
  describe('unrecognized-key diagnostic sweep', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-diagnose-'));
      fs.cpSync(SNAPSHOT_CONFIG, tmpDir, { recursive: true });
    });

    afterEach(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    const appendTo = (file: string, line: string) => {
      const p = path.join(tmpDir, file);
      fs.writeFileSync(p, `${fs.readFileSync(p, 'utf8')}\n${line}\n`);
    };

    it('returns no findings for the clean sample configs', () => {
      const findings = warnOnUnrecognizedKeys(tmpDir, replacements);
      expect(findings).toEqual([]);
    });

    it('finds an unrecognized key and reports its file, location and message', () => {
      appendTo('global-config.yaml', 'someBogusKey: true');
      const findings = warnOnUnrecognizedKeys(tmpDir, replacements);
      expect(findings).toHaveLength(1);
      expect(findings[0].file).toBe('global-config.yaml');
      expect(findings[0].location).toBe('/someBogusKey');
      expect(findings[0].message).toContain('unrecognized key');
    });

    it('reports findings across multiple files in one sweep', () => {
      appendTo('global-config.yaml', 'bogusGlobalKey: true');
      appendTo('organization-config.yaml', 'bogusOrgKey: true');
      const files = warnOnUnrecognizedKeys(tmpDir, replacements).map(f => f.file);
      expect(files).toContain('global-config.yaml');
      expect(files).toContain('organization-config.yaml');
    });

    it('does not mutate the validation mode as a side effect', () => {
      setConfigValidationMode('off');
      appendTo('global-config.yaml', 'bogusGlobalKey: true');
      const findings = warnOnUnrecognizedKeys(tmpDir, replacements);
      expect(findings.length).toBeGreaterThan(0);
      // The diagnostic must not change the module-level mode as a side effect.
      expect(getConfigValidationMode()).toBe('off');
    });

    it('does not throw for a config directory that does not exist', () => {
      expect(() => warnOnUnrecognizedKeys(path.join(tmpDir, 'does-not-exist'), replacements)).not.toThrow();
    });

    it('warnOnUnrecognizedKeys logs each finding and returns them', () => {
      appendTo('global-config.yaml', 'bogusGlobalKey: true');
      const findings = warnOnUnrecognizedKeys(tmpDir, replacements);
      expect(findings.length).toBeGreaterThan(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls.flat().join(' ')).toContain('bogusGlobalKey');
    });

    it('warnOnUnrecognizedKeys does not warn for clean configs', () => {
      warnOnUnrecognizedKeys(tmpDir, replacements);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('advises enabling strict when the mode is warn', () => {
      setConfigValidationMode('warn');
      appendTo('global-config.yaml', 'bogusGlobalKey: true');
      warnOnUnrecognizedKeys(tmpDir, replacements);
      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).toContain("Set configurationValidationMode to 'strict'");
    });

    it('states findings will fail validation when the mode is strict', () => {
      setConfigValidationMode('strict');
      appendTo('global-config.yaml', 'bogusGlobalKey: true');
      warnOnUnrecognizedKeys(tmpDir, replacements);
      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).toContain('will fail configuration validation');
      expect(logged).not.toContain("Set configurationValidationMode to 'strict'");
    });
  });
});

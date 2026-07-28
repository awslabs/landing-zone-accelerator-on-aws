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

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AccountsConfig } from '../../lib/accounts-config';
import { GlobalConfig } from '../../lib/global-config';
import { ReplacementsConfig } from '../../lib/replacements-config';
import { setConfigValidationMode } from '../../lib/common/parse';
import { SNAPSHOT_CONFIG } from '../config-test-helper';

/**
 * System-level tests that exercise the real, on-disk configuration loading path
 * end-to-end: a complete config directory is copied to a temp location, then
 * loaded through the production loaders (real YAML parsing, !include resolution,
 * replacement tokens, JSON-schema validation and strict-mode gating). No mocks
 * and no AWS calls are involved.
 *
 * This mirrors what the local config validator / pipeline Build phase does:
 *   1. read the raw global config to discover the validation mode
 *   2. apply that mode via setConfigValidationMode
 *   3. load and validate the configuration files
 */
describe('strict configuration validation (system / local end-to-end)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-strict-system-'));
    fs.cpSync(SNAPSHOT_CONFIG, tmpDir, { recursive: true });
  });

  afterEach(() => {
    setConfigValidationMode('off');
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const globalConfigPath = () => path.join(tmpDir, GlobalConfig.FILENAME);

  /** Append a line to the temp global-config.yaml on disk. */
  const appendToGlobalConfig = (line: string) => {
    fs.writeFileSync(globalConfigPath(), `${fs.readFileSync(globalConfigPath(), 'utf8')}\n${line}\n`);
  };

  /** Reproduce the loader wiring: read the raw mode from disk, then apply it. */
  const applyModeFromDisk = () => {
    const raw = GlobalConfig.loadRawGlobalConfig(tmpDir);
    setConfigValidationMode(raw.configurationValidationMode ?? 'off');
    return raw;
  };

  const loadGlobalConfig = () => {
    const accountsConfig = AccountsConfig.load(tmpDir);
    const replacementsConfig = ReplacementsConfig.load(tmpDir, accountsConfig);
    return GlobalConfig.load(tmpDir, replacementsConfig);
  };

  it('loads a real config directory cleanly when validation mode is off (default)', () => {
    // No configurationValidationMode set -> defaults to off.
    applyModeFromDisk();
    expect(() => loadGlobalConfig()).not.toThrow();
  });

  it('ignores an unrecognized key on disk when validation mode is off', () => {
    appendToGlobalConfig('someTotallyBogusKey: ignored-on-disk');
    applyModeFromDisk();
    expect(() => loadGlobalConfig()).not.toThrow();
  });

  it('reads strict mode from the global config on disk and fails on an unrecognized key', () => {
    appendToGlobalConfig('configurationValidationMode: strict');
    appendToGlobalConfig('someTotallyBogusKey: should-fail');

    const raw = applyModeFromDisk();
    expect(raw.configurationValidationMode).toBe('strict');

    // GlobalConfig.load wraps the detailed parse error; the meaningful signal is
    // that the same on-disk key that is accepted in off mode is now rejected.
    expect(() => loadGlobalConfig()).toThrow();
  });

  it('reads warn mode from the global config on disk and still loads', () => {
    appendToGlobalConfig('configurationValidationMode: warn');
    appendToGlobalConfig('someTotallyBogusKey: warn-only');

    const raw = applyModeFromDisk();
    expect(raw.configurationValidationMode).toBe('warn');

    expect(() => loadGlobalConfig()).not.toThrow();
  });

  it('rejects an invalid validation mode value on disk', () => {
    appendToGlobalConfig('configurationValidationMode: enforce');
    // Invalid enum value is a regular schema error, surfaced even in off mode.
    expect(() => GlobalConfig.loadRawGlobalConfig(tmpDir)).toThrow();
  });
});

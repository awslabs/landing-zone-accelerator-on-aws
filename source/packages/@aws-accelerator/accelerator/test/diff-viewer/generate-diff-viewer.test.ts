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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import {
  extractSection,
  parseStackIdentifiers,
  readDiffJsonFiles,
  readModuleDiffs,
  classifyModuleLine,
  generateImpactReport,
  compressData,
  compressModuleDiffs,
  generateHtml,
  assembleHtml,
  StackDiffData,
} from '../../lib/diff-viewer/generate-diff-viewer';
import type { StructuredStackDiff } from '@aws-accelerator/utils';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-viewer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Write a .diff.json file with the given structured diff. */
function writeDiffJson(name: string, diff: StructuredStackDiff) {
  fs.writeFileSync(path.join(tmpDir, `${name}.diff.json`), JSON.stringify(diff));
}

/** Write a .module.diff file with raw module runner dry-run text. */
function writeModuleDiff(name: string, content: string) {
  fs.writeFileSync(path.join(tmpDir, `${name}.module.diff`), content);
}

function gunzip(b64: string): string {
  return zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf-8');
}

/** Minimal empty diff */
const EMPTY_DIFF: StructuredStackDiff = {
  resources: [],
  parameters: [],
  outputs: [],
  conditions: [],
  differenceCount: 0,
  isEmpty: true,
};

/** Diff with real resource changes */
function makeDiff(overrides?: Partial<StructuredStackDiff>): StructuredStackDiff {
  return {
    resources: [
      {
        logicalId: 'MyVpc',
        resourceType: 'AWS::EC2::VPC',
        changeImpact: 'WILL_REPLACE',
        action: 'modify',
        properties: { CidrBlock: { oldValue: '10.0.0.0/16', newValue: '10.1.0.0/16', changeImpact: 'WILL_REPLACE' } },
      },
      {
        logicalId: 'NewSg',
        resourceType: 'AWS::EC2::SecurityGroup',
        changeImpact: 'WILL_CREATE',
        action: 'create',
        properties: {},
      },
    ],
    parameters: [],
    outputs: [],
    conditions: [],
    differenceCount: 2,
    isEmpty: false,
    ...overrides,
  };
}

// ============================================================================
// extractSection
// ============================================================================

describe('extractSection', () => {
  it('extracts section from standard LZA filename', () => {
    expect(extractSection('AWSAccelerator-NetworkVpcStack-123456789012-us-east-1.diff.json')).toBe('NetworkVpc');
  });

  it('extracts section from custom prefix', () => {
    expect(extractSection('MyOrg-SecurityStack-111111111111-eu-west-1.diff.json')).toBe('Security');
  });

  it('returns "other" when no Stack segment found', () => {
    expect(extractSection('some-random-file.diff.json')).toBe('other');
  });

  it('handles multiple hyphens in prefix', () => {
    expect(extractSection('My-Custom-Prefix-LoggingStack-999999999999-ap-southeast-1.diff.json')).toBe('Logging');
  });

  it('picks the first segment ending in Stack', () => {
    expect(extractSection('AWSAccelerator-PrepareStack-SubStack-123456789012-us-east-1.diff.json')).toBe('Prepare');
  });
});

// ============================================================================
// parseStackIdentifiers
// ============================================================================

describe('parseStackIdentifiers', () => {
  it('extracts account and region from standard LZA stack name', () => {
    expect(parseStackIdentifiers('AWSAccelerator-NetworkVpcStack-123456789012-us-east-1')).toEqual({
      account: '123456789012',
      region: 'us-east-1',
    });
  });

  it('handles multi-segment region names', () => {
    expect(parseStackIdentifiers('AWSAccelerator-LoggingStack-111111111111-ap-southeast-2')).toEqual({
      account: '111111111111',
      region: 'ap-southeast-2',
    });
  });

  it('returns unknown for non-matching names', () => {
    expect(parseStackIdentifiers('SomeRandomStack')).toEqual({ account: 'unknown', region: 'unknown' });
  });

  it('handles GovCloud regions', () => {
    expect(parseStackIdentifiers('AWSAccelerator-NetworkVpcStack-123456789012-us-gov-east-1')).toEqual({
      account: '123456789012',
      region: 'us-gov-east-1',
    });
    expect(parseStackIdentifiers('AWSAccelerator-NetworkVpcStack-123456789012-us-gov-west-1')).toEqual({
      account: '123456789012',
      region: 'us-gov-west-1',
    });
  });

  it('tolerates suffixes after the region segment', () => {
    expect(parseStackIdentifiers('AWSAccelerator-CustomStack-123456789012-us-east-1-custom')).toEqual({
      account: '123456789012',
      region: 'us-east-1',
    });
  });

  it('does not mis-parse availability-zone suffix as region', () => {
    // `us-east-1b` is an AZ, not a region. Should NOT be parsed as region.
    expect(parseStackIdentifiers('AWSAccelerator-FooStack-123456789012-us-east-1b-suffix')).toEqual({
      account: 'unknown',
      region: 'unknown',
    });
  });

  it('handles multi-digit region numbers', () => {
    // Future-proof: regions like us-east-10 are not real today but pattern should allow.
    expect(parseStackIdentifiers('AWSAccelerator-FooStack-123456789012-us-east-10')).toEqual({
      account: '123456789012',
      region: 'us-east-10',
    });
  });
});

// ============================================================================
// readDiffJsonFiles
// ============================================================================

describe('readDiffJsonFiles', () => {
  it('reads and parses .diff.json files from directory', () => {
    writeDiffJson('AWSAccelerator-NetworkVpcStack-123456789012-us-east-1', makeDiff());
    writeDiffJson('AWSAccelerator-SecurityStack-123456789012-us-east-1', EMPTY_DIFF);

    const entries = readDiffJsonFiles(tmpDir);
    expect(entries).toHaveLength(2);

    const network = entries.find(e => e.meta.section === 'NetworkVpc')!;
    expect(network.meta.name).toBe('AWSAccelerator-NetworkVpcStack-123456789012-us-east-1');
    expect(network.meta.hasChanges).toBe(true);
    expect(network.meta.account).toBe('123456789012');
    expect(network.meta.region).toBe('us-east-1');
    expect(network.diff.resources).toHaveLength(2);

    const security = entries.find(e => e.meta.section === 'Security')!;
    expect(security.meta.hasChanges).toBe(false);
  });

  it('ignores non-.diff.json files', () => {
    writeDiffJson('AWSAccelerator-KeyStack-123-us-east-1', makeDiff());
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a diff');
    fs.writeFileSync(path.join(tmpDir, 'stack.diff'), 'old text diff');

    const entries = readDiffJsonFiles(tmpDir);
    expect(entries).toHaveLength(1);
  });

  it('returns empty array for directory with no diff.json files', () => {
    expect(readDiffJsonFiles(tmpDir)).toHaveLength(0);
  });

  it('returns entries sorted by filename', () => {
    writeDiffJson('B-SecurityStack-123-us-east-1', makeDiff());
    writeDiffJson('A-NetworkVpcStack-123-us-east-1', makeDiff());

    const entries = readDiffJsonFiles(tmpDir);
    expect(entries[0].meta.section).toBe('NetworkVpc');
    expect(entries[1].meta.section).toBe('Security');
  });

  it('detects noise-only stacks as no changes', () => {
    writeDiffJson('AWSAccelerator-LoggingStack-123-us-east-1', {
      resources: [
        {
          logicalId: 'MyFunc',
          resourceType: 'AWS::Lambda::Function',
          changeImpact: 'WILL_UPDATE',
          action: 'modify',
          properties: {
            S3Key: { oldValue: 'old.zip', newValue: 'new.zip', changeImpact: 'WILL_UPDATE' },
            Code: { oldValue: { S3Key: 'old.zip' }, newValue: { S3Key: 'new.zip' }, changeImpact: 'WILL_UPDATE' },
          },
        },
      ],
      parameters: [],
      outputs: [],
      conditions: [],
      differenceCount: 1,
      isEmpty: false,
    });

    const entries = readDiffJsonFiles(tmpDir);
    expect(entries[0].meta.hasChanges).toBe(false);
  });

  it('detects CustomResource uuid-only as noise', () => {
    writeDiffJson('AWSAccelerator-OpsStack-123-us-east-1', {
      resources: [
        {
          logicalId: 'MyCustom',
          resourceType: 'Custom::SsmGetParameterValue',
          changeImpact: 'WILL_UPDATE',
          action: 'modify',
          properties: { uuid: { oldValue: 'old-uuid', newValue: 'new-uuid', changeImpact: 'WILL_UPDATE' } },
        },
      ],
      parameters: [],
      outputs: [],
      conditions: [],
      differenceCount: 1,
      isEmpty: false,
    });

    const entries = readDiffJsonFiles(tmpDir);
    expect(entries[0].meta.hasChanges).toBe(false);
  });
});

// ============================================================================
// readModuleDiffs
// ============================================================================

describe('readModuleDiffs', () => {
  it('reads and parses .module.diff files from directory', () => {
    writeModuleDiff(
      '10-tgw-associations-and-propagations',
      'associations(+2 -2 =21 !0)\n  [+] tgw-attach-abc\n  [-] tgw-attach-def',
    );
    writeModuleDiff('06-macie', '[+] macie org admin enabled');

    const mods = readModuleDiffs(tmpDir);
    expect(mods).toHaveLength(2);

    const macie = mods.find(m => m.name === 'macie')!;
    expect(macie.hasChanges).toBe(true);
    expect(macie.content).toContain('macie org admin');
    expect(mods.map(m => m.name)).toContain('tgw-associations-and-propagations');
  });

  it('flags a module with [+]/[-] as having changes', () => {
    writeModuleDiff('mod-changed', 'route-tables\n  [+] rtb-123');
    const mods = readModuleDiffs(tmpDir);
    expect(mods[0].hasChanges).toBe(true);
  });

  it('flags a SKIPPED (config-unchanged) module as no changes', () => {
    writeModuleDiff('mod-skipped', 'Module SKIPPED — configuration unchanged');
    const mods = readModuleDiffs(tmpDir);
    expect(mods[0].hasChanges).toBe(false);
  });

  it('flags an empty module diff as no changes', () => {
    writeModuleDiff('mod-empty', '');
    const mods = readModuleDiffs(tmpDir);
    expect(mods).toHaveLength(1);
    expect(mods[0].hasChanges).toBe(false);
  });

  it('flags a whitespace-only module diff as no changes', () => {
    writeModuleDiff('mod-ws', '  \n\t\n  ');
    const mods = readModuleDiffs(tmpDir);
    expect(mods[0].hasChanges).toBe(false);
  });

  it('strips ANSI escape sequences from module content', () => {
    // \x1b[32m ... \x1b[0m color codes must not survive into the payload.
    writeModuleDiff('mod-ansi', '\x1b[32m[+] added\x1b[0m\n\x1b[31m[-] removed\x1b[0m');
    const mods = readModuleDiffs(tmpDir);
    expect(mods[0].content).not.toContain('\x1b');
    expect(mods[0].content).toContain('[+] added');
    expect(mods[0].content).toContain('[-] removed');
    expect(mods[0].hasChanges).toBe(true);
  });

  it('ignores .diff.json and plain .diff files', () => {
    writeDiffJson('AWSAccelerator-KeyStack-123-us-east-1', makeDiff());
    fs.writeFileSync(path.join(tmpDir, 'stack.diff'), 'old text diff');
    writeModuleDiff('only-module', '[+] change');

    const mods = readModuleDiffs(tmpDir);
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toBe('only-module');
  });

  it('returns empty array for directory with no module diffs', () => {
    expect(readModuleDiffs(tmpDir)).toHaveLength(0);
  });

  it('returns empty array when directory does not exist', () => {
    expect(readModuleDiffs(path.join(tmpDir, 'does-not-exist'))).toHaveLength(0);
  });

  it('returns modules sorted by filename', () => {
    writeModuleDiff('20-second', '[+] b');
    writeModuleDiff('10-first', '[+] a');
    const mods = readModuleDiffs(tmpDir);
    expect(mods[0].name).toBe('first');
    expect(mods[1].name).toBe('second');
  });

  it('strips the stage-run-order prefix from the module name', () => {
    writeModuleDiff('06-macie', '[+] enabled');
    writeModuleDiff('10-tgw-associations-and-propagations', '[+] attach');
    const names = readModuleDiffs(tmpDir).map(m => m.name);
    expect(names).toEqual(['macie', 'tgw-associations-and-propagations']);
  });

  it('skips an unreadable module diff and continues', () => {
    // A directory named like a module diff: readdirSync lists it, but
    // readFileSync throws EISDIR. The catch branch must log-and-skip so one
    // bad entry does not abort the whole viewer.
    fs.mkdirSync(path.join(tmpDir, 'bad.module.diff'));
    writeModuleDiff('06-macie', '[+] enabled');

    const mods = readModuleDiffs(tmpDir);
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toBe('macie');
    expect(mods[0].hasChanges).toBe(true);
  });
});

// ============================================================================
// compressData
// ============================================================================

describe('compressData', () => {
  it('compresses stack data into a decompressible gzipped base64 blob', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-a', hasChanges: true, account: '123', region: 'us-east-1' },
        diff: makeDiff(),
      },
      {
        meta: { section: 'Security', name: 'stack-b', hasChanges: false, account: '456', region: 'us-west-2' },
        diff: EMPTY_DIFF,
      },
    ];

    const blob = compressData(stacks);
    const decompressed = JSON.parse(gunzip(blob));
    expect(decompressed).toHaveLength(2);
    expect(decompressed[0].meta.name).toBe('stack-a');
    expect(decompressed[1].diff.isEmpty).toBe(true);
  });

  it('handles single entry', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Key', name: 'only', hasChanges: true, account: '123', region: 'us-east-1' },
        diff: makeDiff(),
      },
    ];
    const blob = compressData(stacks);
    const decompressed = JSON.parse(gunzip(blob));
    expect(decompressed).toHaveLength(1);
  });
});

// ============================================================================
// classifyModuleLine (+ viewer.js mirror)
// ============================================================================

describe('classifyModuleLine', () => {
  it('classifies added lines', () => {
    expect(classifyModuleLine('[+] tgw-attach-abc')).toBe('module-add');
    expect(classifyModuleLine('  [+] indented add')).toBe('module-add');
    expect(classifyModuleLine('+ raw add')).toBe('module-add');
  });

  it('classifies removed lines', () => {
    expect(classifyModuleLine('[-] tgw-attach-def')).toBe('module-del');
    expect(classifyModuleLine('\t[-] indented del')).toBe('module-del');
    expect(classifyModuleLine('- raw del')).toBe('module-del');
  });

  it('classifies everything else as context', () => {
    expect(classifyModuleLine('associations(+2 -2 =21 !0)')).toBe('module-ctx');
    expect(classifyModuleLine('[~] modified')).toBe('module-ctx');
    expect(classifyModuleLine('')).toBe('module-ctx');
    expect(classifyModuleLine('   ')).toBe('module-ctx');
    expect(classifyModuleLine('Module SKIPPED')).toBe('module-ctx');
  });

  // Executes the hand-mirrored moduleLineClass() from viewer.js (it has no DOM
  // dependencies) and asserts it agrees with the canonical classifyModuleLine
  // across representative inputs — catches drift between the two copies.
  it('stays in sync with the moduleLineClass mirror in viewer.js', () => {
    const viewerJs = fs.readFileSync(path.join(__dirname, '../../lib/diff-viewer/templates/viewer.js'), 'utf-8');
    const match = viewerJs.match(/function moduleLineClass\(line\) \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();

    const mirror = new Function('return (' + match![0] + ')')() as (line: string) => string;

    const samples = [
      '[+] add',
      '  [+] add',
      '+ add',
      '[-] del',
      '\t[-] del',
      '- del',
      '[~] modify',
      'associations(+2 -2 =21 !0)',
      '',
      '   ',
      'plain context line',
    ];
    for (const s of samples) {
      expect(mirror(s)).toBe(classifyModuleLine(s));
    }
  });
});

// ============================================================================
// viewer.js client rendering (extracted — no DOM harness available)
// ----------------------------------------------------------------------------
// viewer.js is inlined verbatim into the HTML and cannot be imported. These
// tests extract individual pure functions from its source and execute them via
// `new Function`, the same technique used by the classifyModuleLine mirror test.
// ============================================================================

/** Extract a top-level `function <name>(...) { ... }` from source via brace matching. */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('function not found: ' + name);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      i++;
      break;
    }
  }
  return src.slice(start, i);
}

describe('viewer.js renderModuleBody (render-time XSS escaping)', () => {
  const viewerJs = fs.readFileSync(path.join(__dirname, '../../lib/diff-viewer/templates/viewer.js'), 'utf-8');

  // renderModuleBody depends on esc() and moduleLineClass(); bundle all three.
  const bundle = [
    extractFunction(viewerJs, 'esc'),
    extractFunction(viewerJs, 'moduleLineClass'),
    extractFunction(viewerJs, 'renderModuleBody'),
    'return renderModuleBody;',
  ].join('\n');

  const renderModuleBody = new Function(bundle)() as (stackData: { content: string }) => string;

  it('HTML-escapes a </script> payload so it cannot execute when written via innerHTML', () => {
    const out = renderModuleBody({ content: '[+] </script><script>alert(1)</script>' });
    // No raw script tags survive into the rendered markup.
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('</script>');
    // The payload is present only in HTML-escaped form.
    expect(out).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes angle brackets, ampersands and quotes in module content', () => {
    const out = renderModuleBody({ content: '<img src=x onerror="alert(1)"> & done' });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; done');
  });

  it('renders a placeholder for empty content', () => {
    expect(renderModuleBody({ content: '' })).toContain('No module dry-run output');
  });
});

describe('viewer.js impact-report guard for module pseudo-stacks', () => {
  const viewerJs = fs.readFileSync(path.join(__dirname, '../../lib/diff-viewer/templates/viewer.js'), 'utf-8');

  it('buildModuleStacks produces diff-less entries tagged module:true', () => {
    const bundle = extractFunction(viewerJs, 'buildModuleStacks') + '\nreturn buildModuleStacks;';

    const buildModuleStacks = new Function(bundle)() as (mods: unknown[]) => Array<Record<string, unknown>>;

    const entries = buildModuleStacks([{ name: '06-macie', hasChanges: true, content: '[+] enabled' }]);
    expect(entries).toHaveLength(1);
    expect(entries[0].module).toBe(true);
    expect(entries[0].diff).toBeUndefined();
    expect((entries[0].meta as Record<string, unknown>).hasChanges).toBe(true);
  });

  // A changed module (hasChanges:true) has no `diff`, so renderImpactReport MUST
  // skip module entries before dereferencing s.diff.resources — otherwise the
  // whole viewer blanks. Assert the guard is present ahead of that dereference.
  it('renderImpactReport skips module entries before touching s.diff.resources', () => {
    const fn = extractFunction(viewerJs, 'renderImpactReport');
    const guardIdx = fn.indexOf('|| s.module) continue;');
    // Match the actual dereference call, not the explanatory comment above the guard.
    const derefIdx = fn.indexOf('s.diff.resources.filter');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(derefIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(derefIdx);
  });
});

// ============================================================================
// compressModuleDiffs
// ============================================================================

describe('compressModuleDiffs', () => {
  it('compresses module diffs into a decompressible gzipped base64 blob', () => {
    const mods = [
      { name: '06-macie', hasChanges: true, content: '[+] macie enabled' },
      { name: '01-skipped', hasChanges: false, content: 'SKIPPED' },
    ];
    const blob = compressModuleDiffs(mods);
    const decompressed = JSON.parse(gunzip(blob));
    expect(decompressed).toHaveLength(2);
    expect(decompressed[0].name).toBe('06-macie');
    expect(decompressed[0].content).toContain('macie enabled');
    expect(decompressed[1].hasChanges).toBe(false);
  });

  it('compresses an empty array', () => {
    expect(JSON.parse(gunzip(compressModuleDiffs([])))).toEqual([]);
  });
});

// ============================================================================
// generateImpactReport
// ============================================================================

describe('generateImpactReport', () => {
  it('generates report with correct counts', () => {
    const stacks: StackDiffData[] = [
      {
        meta: {
          section: 'Security',
          name: 'AWSAccelerator-SecurityStack-123456789012-us-east-1',
          hasChanges: true,
          account: '123456789012',
          region: 'us-east-1',
        },
        diff: {
          resources: [
            {
              logicalId: 'NewSG',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'WILL_CREATE',
              action: 'create',
              properties: {},
            },
            {
              logicalId: 'OldSG',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 2,
          isEmpty: false,
        },
      },
      {
        meta: {
          section: 'Logging',
          name: 'AWSAccelerator-LoggingStack-123456789012-us-west-2',
          hasChanges: false,
          account: '123456789012',
          region: 'us-west-2',
        },
        diff: EMPTY_DIFF,
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.totalStacks).toBe(2);
    expect(report.stacksWithChanges).toBe(1);
    expect(report.resourceCounts.creates).toBe(1);
    expect(report.resourceCounts.deletes).toBe(1);
    expect(report.accountsAffected).toContain('123456789012');
    expect(report.regionsAffected).toContain('us-east-1');
  });

  it('counts replaces separately from modifies', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-1', hasChanges: true, account: '123', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Vpc',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_REPLACE',
              action: 'modify',
              properties: { CidrBlock: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_REPLACE' } },
            },
            {
              logicalId: 'Sg',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Description: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' } },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 2,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.resourceCounts.replaces).toBe(1);
    expect(report.resourceCounts.modifies).toBe(1);
  });

  it('filters out noise from impact report', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Logging', name: 'stack-1', hasChanges: false, account: '123', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Func',
              resourceType: 'AWS::Lambda::Function',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { S3Key: { oldValue: 'a', newValue: 'b' }, Code: { oldValue: {}, newValue: {} } },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.stacksWithChanges).toBe(0);
    expect(report.resourceCounts.creates).toBe(0);
  });

  it('returns empty report for no entries', () => {
    const report = generateImpactReport([]);
    expect(report.totalStacks).toBe(0);
    expect(report.stacksWithChanges).toBe(0);
    expect(report.destructiveChanges).toEqual([]);
    expect(report.destructiveCounts).toEqual({ willDestroy: 0, willReplace: 0, mayReplace: 0, willOrphan: 0 });
    expect(report.stacksWithDestructive).toBe(0);
    expect(report.networkingChanges).toEqual([]);
    expect(report.stacksWithNetworkingChanges).toBe(0);
  });

  // ── Destructive change aggregation ─────────────────────────────────────

  it('captures WILL_DESTROY (delete action) in destructiveChanges', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'VpcStack-A', hasChanges: true, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'OldVpc',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges).toHaveLength(1);
    expect(report.destructiveChanges[0]).toMatchObject({
      stackName: 'VpcStack-A',
      logicalId: 'OldVpc',
      resourceType: 'AWS::EC2::VPC',
      impact: 'WILL_DESTROY',
      account: '111',
      region: 'us-east-1',
    });
    expect(report.destructiveCounts.willDestroy).toBe(1);
    expect(report.stacksWithDestructive).toBe(1);
  });

  it('captures WILL_REPLACE with triggerProperties from property-level impact', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'VpcStack-B', hasChanges: true, account: '222', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Vpc',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_REPLACE',
              action: 'modify',
              properties: {
                CidrBlock: { oldValue: '10.0.0.0/16', newValue: '10.1.0.0/16', changeImpact: 'WILL_REPLACE' },
                Tags: { oldValue: [], newValue: [{ Key: 'x', Value: 'y' }], changeImpact: 'WILL_UPDATE' },
              },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges).toHaveLength(1);
    expect(report.destructiveChanges[0].impact).toBe('WILL_REPLACE');
    expect(report.destructiveChanges[0].triggerProperties).toEqual(['CidrBlock']);
    expect(report.destructiveCounts.willReplace).toBe(1);
  });

  it('captures MAY_REPLACE separately from WILL_REPLACE', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-c', hasChanges: true, account: '333', region: 'us-west-2' },
        diff: {
          resources: [
            {
              logicalId: 'Sg',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'MAY_REPLACE',
              action: 'modify',
              properties: {
                GroupName: { oldValue: 'a', newValue: 'b', changeImpact: 'MAY_REPLACE' },
              },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveCounts.willReplace).toBe(0);
    expect(report.destructiveCounts.mayReplace).toBe(1);
    expect(report.destructiveChanges[0].impact).toBe('MAY_REPLACE');
    expect(report.destructiveChanges[0].triggerProperties).toEqual(['GroupName']);
  });

  it('captures WILL_ORPHAN as destructive', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Logging', name: 'stack-orphan', hasChanges: true, account: '444', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Bucket',
              resourceType: 'AWS::S3::Bucket',
              changeImpact: 'WILL_ORPHAN',
              action: 'modify',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveCounts.willOrphan).toBe(1);
    expect(report.destructiveChanges[0].impact).toBe('WILL_ORPHAN');
    expect(report.destructiveChanges[0].triggerProperties).toBeUndefined();
  });

  it('falls back to property-level WILL_REPLACE when resource impact is WILL_UPDATE', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-fallback', hasChanges: true, account: '555', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Sg',
              resourceType: 'AWS::EC2::SecurityGroup',
              // resource-level WILL_UPDATE but a property forces replacement
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: {
                Description: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' },
                GroupName: { oldValue: 'sg-a', newValue: 'sg-b', changeImpact: 'WILL_REPLACE' },
              },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges).toHaveLength(1);
    expect(report.destructiveChanges[0].impact).toBe('WILL_REPLACE');
    expect(report.destructiveChanges[0].triggerProperties).toEqual(['GroupName']);
  });

  it('does not count non-destructive modifies as destructive', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Security', name: 'stack-safe', hasChanges: true, account: '666', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Sg',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: {
                Description: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' },
              },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges).toHaveLength(0);
    expect(report.stacksWithDestructive).toBe(0);
  });

  it('sorts destructive changes by severity (destroy > replace > may-replace > orphan)', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-mixed', hasChanges: true, account: '777', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'A',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_ORPHAN',
              action: 'modify',
              properties: {},
            },
            {
              logicalId: 'B',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'MAY_REPLACE',
              action: 'modify',
              properties: { CidrBlock: { oldValue: 'a', newValue: 'b', changeImpact: 'MAY_REPLACE' } },
            },
            {
              logicalId: 'C',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_REPLACE',
              action: 'modify',
              properties: { CidrBlock: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_REPLACE' } },
            },
            {
              logicalId: 'D',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 4,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges.map(d => d.impact)).toEqual([
      'WILL_DESTROY',
      'WILL_REPLACE',
      'MAY_REPLACE',
      'WILL_ORPHAN',
    ]);
  });

  it('counts stacksWithDestructive uniquely across stacks', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-1', hasChanges: true, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'A',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
            {
              logicalId: 'B',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 2,
          isEmpty: false,
        },
      },
      {
        meta: { section: 'NetworkVpc', name: 'stack-2', hasChanges: true, account: '222', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'C',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_REPLACE',
              action: 'modify',
              properties: { CidrBlock: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_REPLACE' } },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveCounts.willDestroy).toBe(2);
    expect(report.destructiveCounts.willReplace).toBe(1);
    expect(report.stacksWithDestructive).toBe(2);
  });

  // ── Networking change aggregation ──────────────────────────────────────

  it('captures any action on a notable networking resource type', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-net', hasChanges: true, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Vpc',
              resourceType: 'AWS::EC2::VPC',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Tags: { oldValue: [], newValue: [], changeImpact: 'WILL_UPDATE' } },
            },
            {
              logicalId: 'Sg',
              resourceType: 'AWS::EC2::SecurityGroup',
              changeImpact: 'WILL_CREATE',
              action: 'create',
              properties: {},
            },
            {
              logicalId: 'Rt',
              resourceType: 'AWS::EC2::RouteTable',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
            // Non-networking resource — must be excluded
            {
              logicalId: 'Bucket',
              resourceType: 'AWS::S3::Bucket',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Tags: { oldValue: [], newValue: [], changeImpact: 'WILL_UPDATE' } },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 4,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.networkingChanges).toHaveLength(3);
    const types = report.networkingChanges.map(n => n.resourceType);
    expect(types).toContain('AWS::EC2::VPC');
    expect(types).toContain('AWS::EC2::SecurityGroup');
    expect(types).toContain('AWS::EC2::RouteTable');
    expect(types).not.toContain('AWS::S3::Bucket');
    expect(report.stacksWithNetworkingChanges).toBe(1);
  });

  it('includes all actions for networking resources (create, modify, delete)', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'NetworkVpc', name: 'stack-net', hasChanges: true, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'A',
              resourceType: 'AWS::EC2::Subnet',
              changeImpact: 'WILL_CREATE',
              action: 'create',
              properties: {},
            },
            {
              logicalId: 'B',
              resourceType: 'AWS::EC2::Subnet',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Tags: { oldValue: [], newValue: [], changeImpact: 'WILL_UPDATE' } },
            },
            {
              logicalId: 'C',
              resourceType: 'AWS::EC2::Subnet',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 3,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.networkingChanges.map(n => n.action).sort()).toEqual(['create', 'delete', 'modify']);
  });

  it('recognizes expanded networking types (TGW, Firewall, Route53Resolver, DirectConnect)', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Network', name: 'stack-exp', hasChanges: true, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            {
              logicalId: 'Tgw',
              resourceType: 'AWS::EC2::TransitGatewayRouteTable',
              changeImpact: 'WILL_CREATE',
              action: 'create',
              properties: {},
            },
            {
              logicalId: 'Fw',
              resourceType: 'AWS::NetworkFirewall::FirewallPolicy',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Description: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' } },
            },
            {
              logicalId: 'Dns',
              resourceType: 'AWS::Route53Resolver::ResolverRuleAssociation',
              changeImpact: 'WILL_DESTROY',
              action: 'delete',
              properties: {},
            },
            {
              logicalId: 'Dx',
              resourceType: 'AWS::DirectConnect::VirtualInterface',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: { Vlan: { oldValue: 1, newValue: 2, changeImpact: 'WILL_UPDATE' } },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 4,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.networkingChanges).toHaveLength(4);
  });

  it('filters noise resources from networking and destructive aggregations', () => {
    const stacks: StackDiffData[] = [
      {
        meta: { section: 'Logging', name: 'stack-noise', hasChanges: false, account: '111', region: 'us-east-1' },
        diff: {
          resources: [
            // This is noise — Lambda S3Key churn — should be filtered
            {
              logicalId: 'Fn',
              resourceType: 'AWS::Lambda::Function',
              changeImpact: 'WILL_UPDATE',
              action: 'modify',
              properties: {
                S3Key: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' },
                Code: { oldValue: {}, newValue: {}, changeImpact: 'WILL_UPDATE' },
              },
            },
          ],
          parameters: [],
          outputs: [],
          conditions: [],
          differenceCount: 1,
          isEmpty: false,
        },
      },
    ];
    const report = generateImpactReport(stacks);
    expect(report.destructiveChanges).toHaveLength(0);
    expect(report.networkingChanges).toHaveLength(0);
  });
});

// ============================================================================
// assembleHtml
// ============================================================================

describe('assembleHtml', () => {
  it('replaces all placeholders in the shell template', () => {
    const templatesDir = path.join(__dirname, '../../lib/diff-viewer/templates');
    const html = assembleHtml('const testData = 42;', templatesDir);

    expect(html).not.toContain('{{STYLES}}');
    expect(html).not.toContain('{{DATA}}');
    expect(html).not.toContain('{{SCRIPT}}');
    expect(html).toContain('const testData = 42;');
    expect(html).toContain(':root');
    expect(html).toContain('function decompressBlob');
  });

  it('does not contain any ANSI rendering code', () => {
    const templatesDir = path.join(__dirname, '../../lib/diff-viewer/templates');
    const html = assembleHtml('const testData = 0;', templatesDir);
    expect(html).not.toContain('ansiToHtml');
    expect(html).not.toContain('splitDiffContent');
    expect(html).not.toContain('diffBlob');
  });

  it('contains structured diff rendering code', () => {
    const templatesDir = path.join(__dirname, '../../lib/diff-viewer/templates');
    const html = assembleHtml('const testData = 0;', templatesDir);
    expect(html).toContain('renderDiffBody');
    expect(html).toContain('renderResourceCard');
    expect(html).toContain('sd-resource');
    expect(html).toContain('impactBadge');
  });

  it('contains module dry-run rendering code and styles', () => {
    const templatesDir = path.join(__dirname, '../../lib/diff-viewer/templates');
    const html = assembleHtml('const testData = 0;', templatesDir);
    expect(html).toContain('buildModuleStacks');
    expect(html).toContain('renderModuleBody');
    expect(html).toContain('module-diff');
  });
});

// ============================================================================
// generateHtml
// ============================================================================

describe('generateHtml', () => {
  it('generates complete HTML with embedded data', () => {
    writeDiffJson('AWSAccelerator-NetworkVpcStack-123-us-east-1', makeDiff());
    writeDiffJson('AWSAccelerator-SecurityStack-456-us-west-2', EMPTY_DIFF);

    const html = generateHtml(tmpDir);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>LZA CDK Diff Viewer</title>');
    expect(html).toContain('</html>');
    expect(html).toContain('const impactReport = ');
    expect(html).toContain('const dataBlob = "');
    expect(html).toContain('function renderSidebar');
    expect(html).toContain('function showDiff');
  });

  it('throws when no diff.json files exist', () => {
    expect(() => generateHtml(tmpDir)).toThrow('No .diff.json files found');
  });

  it('embeds module dry-run output in a gzipped moduleBlob', () => {
    writeDiffJson('AWSAccelerator-NetworkVpcStack-123-us-east-1', EMPTY_DIFF);
    writeModuleDiff('10-tgw-associations-and-propagations', 'associations(+2 -2 =21 !0)\n  [+] tgw-attach-abc');

    const html = generateHtml(tmpDir);
    const match = html.match(/const moduleBlob = "([^"]+)"/);
    expect(match).not.toBeNull();

    const mods = JSON.parse(gunzip(match![1]));
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toBe('tgw-associations-and-propagations');
    expect(mods[0].hasChanges).toBe(true);
    expect(mods[0].content).toContain('tgw-attach-abc');
  });

  it('generates HTML from module diffs alone (no .diff.json stacks)', () => {
    // Module-only pipeline run: reviewer must still see pending module changes.
    writeModuleDiff('06-macie', '[+] macie org admin enabled');

    const html = generateHtml(tmpDir);
    expect(html).toContain('<!DOCTYPE html>');
    const match = html.match(/const moduleBlob = "([^"]+)"/);
    expect(match).not.toBeNull();
    const mods = JSON.parse(gunzip(match![1]));
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toBe('macie');
  });

  it('embeds an empty (gzipped) module array when no module diffs are present', () => {
    writeDiffJson('AWSAccelerator-NetworkVpcStack-123-us-east-1', makeDiff());
    const html = generateHtml(tmpDir);
    const match = html.match(/const moduleBlob = "([^"]+)"/);
    expect(match).not.toBeNull();
    expect(JSON.parse(gunzip(match![1]))).toEqual([]);
  });

  it('keeps module content out of HTML-injection context via the base64 blob', () => {
    // The gzipped blob is base64 (A-Za-z0-9+/=), so attacker-controlled module
    // text can never introduce a literal </script> into the inline script.
    writeDiffJson('AWSAccelerator-NetworkVpcStack-123-us-east-1', EMPTY_DIFF);
    writeModuleDiff('evil-module', '[+] </script><script>alert(1)</script>');

    const html = generateHtml(tmpDir);
    // The moduleBlob token itself is base64 — no raw markup leaks into the HTML.
    const match = html.match(/const moduleBlob = "([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('</script>');
    // And the original content round-trips intact after decompression.
    const mods = JSON.parse(gunzip(match![1]));
    expect(mods[0].content).toContain('</script><script>alert(1)</script>');
  });

  it('produces decompressible blob in the HTML', () => {
    writeDiffJson('Prefix-LoggingStack-111-us-east-1', makeDiff());

    const html = generateHtml(tmpDir);
    const blobMatch = html.match(/const dataBlob = "([^"]+)"/);
    expect(blobMatch).not.toBeNull();

    const decompressed = JSON.parse(gunzip(blobMatch![1]));
    expect(decompressed).toHaveLength(1);
    expect(decompressed[0].meta.section).toBe('Logging');
    expect(decompressed[0].diff.resources).toHaveLength(2);
  });

  it('escapes </script> in embedded JSON so it cannot terminate the inline script tag', () => {
    // Inject </script> into a destructive networking resource so it flows into
    // the inline impactReport JSON (the gzipped blob is base64, so only the
    // inline JSON is an HTML-context injection risk).
    writeDiffJson('AWSAccelerator-NetworkVpcStack-111-us-east-1', {
      resources: [
        {
          logicalId: 'Evil</script><script>alert(1)</script>',
          resourceType: 'AWS::EC2::VPC',
          changeImpact: 'WILL_DESTROY',
          action: 'delete',
          properties: {},
        },
      ],
      parameters: [],
      outputs: [],
      conditions: [],
      differenceCount: 1,
      isEmpty: false,
    });

    const html = generateHtml(tmpDir);
    // The raw literal `</script>` must NOT appear between `const impactReport = ` and its terminating `;`
    const reportMatch = html.match(/const impactReport = (\{[\s\S]*?\});\n/);
    expect(reportMatch).not.toBeNull();
    expect(reportMatch![1]).not.toContain('</script>');
    // But the escaped form is present so the original value still round-trips
    expect(reportMatch![1]).toContain('\\u003c/script\\u003e');
    // And parses correctly
    const report = JSON.parse(reportMatch![1]);
    expect(report.destructiveChanges[0].logicalId).toBe('Evil</script><script>alert(1)</script>');
  });

  it('does not interpret replacement patterns in embedded data', () => {
    // `$&`, `$1`, `` $` `` etc. are replacement directives for String.prototype.replace.
    // If a template assembler used the string-form replace, these would be substituted.
    // Embed them in a destructive networking resource so they reach the inline JSON.
    writeDiffJson('AWSAccelerator-NetworkVpcStack-222-us-east-1', {
      resources: [
        {
          logicalId: 'Res$&Literal',
          resourceType: 'AWS::EC2::VPC',
          changeImpact: 'WILL_DESTROY',
          action: 'delete',
          properties: {},
        },
      ],
      parameters: [],
      outputs: [],
      conditions: [],
      differenceCount: 1,
      isEmpty: false,
    });

    const html = generateHtml(tmpDir);
    // Verify no placeholder token was substituted back into the output (which
    // would happen if $& were interpreted as the matched {{DATA}} / {{STYLES}} etc.)
    expect(html).not.toContain('{{DATA}}');
    expect(html).not.toContain('{{STYLES}}');
    expect(html).not.toContain('{{SCRIPT}}');
    // Verify the literal $& survives the round-trip through the escaped JSON embedding.
    // (safeJsonEmbed escapes `&` to `\u0026` for HTML-context safety, so parse the
    //  JSON back to check the original value is preserved.)
    const reportMatch = html.match(/const impactReport = (\{[\s\S]*?\});\n/);
    const report = JSON.parse(reportMatch![1]);
    expect(report.destructiveChanges[0].logicalId).toBe('Res$&Literal');
  });

  it('escapes attacker-controlled strings in non-destructive networking resources too', () => {
    // Stacks Requiring Review builds its rows from every change to a tracked
    // resource type — not just destructive ones. Verify that `<script>` / quote
    // chars in a *modify*-action resource's logical ID don't escape context
    // either. Hits critExpandableRowHtml + critDetailItemHtml paths via the
    // `networkingChanges` aggregation in the inline impact report JSON.
    writeDiffJson('AWSAccelerator-NetworkVpcStack-333-us-east-1', {
      resources: [
        {
          logicalId: 'QuoteAndBracket"<img src=x onerror=alert(1)>',
          resourceType: 'AWS::EC2::SecurityGroup',
          changeImpact: 'WILL_UPDATE',
          action: 'modify',
          properties: { Description: { oldValue: 'a', newValue: 'b', changeImpact: 'WILL_UPDATE' } },
        },
      ],
      parameters: [],
      outputs: [],
      conditions: [],
      differenceCount: 1,
      isEmpty: false,
    });

    const html = generateHtml(tmpDir);
    const reportMatch = html.match(/const impactReport = (\{[\s\S]*?\});\n/);
    expect(reportMatch).not.toBeNull();
    // Raw, unescaped `<img ...>` must never appear in the embedded JSON
    expect(reportMatch![1]).not.toContain('<img src=x');
    // But the escaped form is present and the value round-trips
    const report = JSON.parse(reportMatch![1]);
    expect(report.networkingChanges[0].logicalId).toBe('QuoteAndBracket"<img src=x onerror=alert(1)>');
  });
});

// ============================================================================
// Performance
// ============================================================================

describe('generateHtml - performance', () => {
  const PERF_DIR = path.join(os.tmpdir(), 'diff-viewer-json-perf');
  const TOTAL = 200;
  const sections = [
    'NetworkVpc',
    'Security',
    'Customizations',
    'Key',
    'Logging',
    'Operations',
    'Identity',
    'DependenciesInstall',
    'Prepare',
    'Accounts',
  ];
  const regions = [
    'us-east-1',
    'us-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1',
    'sa-east-1',
    'ca-central-1',
    'af-south-1',
    'me-south-1',
  ];
  const resourceTypes = [
    'AWS::EC2::Subnet',
    'AWS::EC2::RouteTable',
    'AWS::S3::Bucket',
    'AWS::IAM::Role',
    'AWS::Lambda::Function',
    'AWS::EC2::SecurityGroup',
    'AWS::KMS::Key',
    'AWS::Logs::LogGroup',
  ];

  function seededRng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  function buildDiff(idx: number): StructuredStackDiff {
    const rng = seededRng(idx * 7 + 13);
    const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
    const isLarge = rng() < 0.2;
    const count = isLarge ? 150 + Math.floor(rng() * 100) : 10 + Math.floor(rng() * 50);
    const actions: Array<'create' | 'delete' | 'modify'> = ['create', 'delete', 'modify'];
    const impacts = ['WILL_CREATE', 'WILL_DESTROY', 'WILL_UPDATE', 'WILL_REPLACE'];
    const resources = [];
    for (let r = 0; r < count; r++) {
      const action = pick(actions);
      resources.push({
        logicalId: `Res${r}`,
        resourceType: pick(resourceTypes),
        changeImpact:
          action === 'create' ? 'WILL_CREATE' : action === 'delete' ? 'WILL_DESTROY' : pick(impacts.slice(2)),
        action,
        properties:
          action === 'modify'
            ? { SomeProp: { oldValue: `old-${r}`, newValue: `new-${r}`, changeImpact: 'WILL_UPDATE' } }
            : {},
      });
    }
    return { resources, parameters: [], outputs: [], conditions: [], differenceCount: count, isEmpty: false };
  }

  function ensurePerfFiles() {
    if (fs.existsSync(PERF_DIR) && fs.readdirSync(PERF_DIR).some(f => f.endsWith('.diff.json'))) return;
    fs.mkdirSync(PERF_DIR, { recursive: true });
    for (let i = 0; i < TOTAL; i++) {
      const sec = sections[i % sections.length];
      const reg = regions[Math.floor(i / sections.length) % regions.length];
      const acct = (100000000000 + i).toString();
      const name = `AWSAccelerator-${sec}Stack-${acct}-${reg}`;
      const diff = i % 7 === 0 ? EMPTY_DIFF : buildDiff(i);
      fs.writeFileSync(path.join(PERF_DIR, `${name}.diff.json`), JSON.stringify(diff));
    }
  }

  it('generates HTML for 200 stacks', () => {
    ensurePerfFiles();
    const start = Date.now();
    const html = generateHtml(PERF_DIR);
    const elapsed = (Date.now() - start) / 1000;
    const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(0);
    console.log(`Performance: ${TOTAL} stacks in ${elapsed.toFixed(2)}s, output ${sizeKB}KB`);

    expect(html).toContain('const impactReport = ');
    expect(html).toContain('const dataBlob = "');
    expect(html).toContain('</html>');
    // Verify the impact report contains resource types from our generated data
    expect(html).toContain('AWS::EC2::Subnet');
    expect(html).toContain('AWS::Lambda::Function');
  }, 30_000);
});

import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TgwCrossAccountResources } from '../../../lib/asea-resources/tgw-cross-account-resources';

// Invoke the public method without constructing the class (which requires a full
// ImportAseaResourcesStack scope). Safe because matchesAttachmentId is pure.
const matchesAttachmentId = TgwCrossAccountResources.prototype.matchesAttachmentId.bind({} as TgwCrossAccountResources);

/**
 * Regression coverage for the ghost-entry bug fixed in LZA 1.15.1
 * (GitHub issue awslabs/landing-zone-accelerator-on-aws#1064).
 *
 * Pre-fix (v1.14.3) used `property.Ref === attachmentId` directly. When a new
 * LZA-only VPC is added, the lookup for its ASEA attachment id returns
 * `undefined`. Cross-account ASEA Phase-2 propagations store the
 * `TransitGatewayAttachmentId` property as a resolved physical id string
 * (e.g. `"tgw-attach-xxx"`), and `"tgw-attach-xxx".Ref` is `undefined`, so
 * `undefined === undefined` falsely matched — causing ghost entries to be
 * written into aseaResources.json and the real propagations to be silently
 * skipped by NetworkAssociationsStack.
 *
 * The fix normalizes the check via `matchesAttachmentId` and the two call
 * sites guard against `!attachmentId` up-front. Snapshots lock in the table
 * of outcomes so regressions are visible.
 */
describe('matchesAttachmentId', () => {
  const ATTACHMENT_ID = 'tgw-attach-0abc123';
  const OTHER_ID = 'tgw-attach-0def456';

  // Each case mirrors a real ASEA Phase-2 propagation property shape.
  const cases: Array<{ name: string; propertyValue: { Ref?: string } | string | undefined; attachmentId: string }> = [
    // Same-account ASEA propagations: property is `{ Ref: logicalId }`.
    { name: 'Ref matches attachmentId', propertyValue: { Ref: ATTACHMENT_ID }, attachmentId: ATTACHMENT_ID },
    { name: 'Ref does not match attachmentId', propertyValue: { Ref: OTHER_ID }, attachmentId: ATTACHMENT_ID },
    { name: 'Ref present but attachmentId empty', propertyValue: { Ref: ATTACHMENT_ID }, attachmentId: '' },

    // Cross-account ASEA propagations: property is a resolved physical id string.
    { name: 'string equals attachmentId', propertyValue: ATTACHMENT_ID, attachmentId: ATTACHMENT_ID },
    { name: 'string differs from attachmentId', propertyValue: OTHER_ID, attachmentId: ATTACHMENT_ID },

    // Pathological inputs that caused the 1.14.3 false-match.
    { name: 'object without Ref', propertyValue: {}, attachmentId: ATTACHMENT_ID },
    { name: 'undefined property value', propertyValue: undefined, attachmentId: ATTACHMENT_ID },
  ];

  test('behavior matrix', () => {
    const results = Object.fromEntries(cases.map(c => [c.name, matchesAttachmentId(c.propertyValue, c.attachmentId)]));
    expect(results).toMatchInlineSnapshot(`
      {
        "Ref does not match attachmentId": false,
        "Ref matches attachmentId": true,
        "Ref present but attachmentId empty": false,
        "object without Ref": false,
        "string differs from attachmentId": false,
        "string equals attachmentId": true,
        "undefined property value": false,
      }
    `);
  });

  test('regression: cross-account string property never matches an undefined attachmentId (cast-through)', () => {
    // Simulates the exact buggy call from 1.14.3 where `attachmentId` is `undefined`
    // because the new VPC is not present in any ASEA Phase-1 stack.
    const asIfUndefined = undefined as unknown as string;
    // Cross-account (string) propagations never falsely match — the direct-equality
    // branch makes `'tgw-attach-xxx' === undefined` trivially false.
    expect(matchesAttachmentId('tgw-attach-realcrossaccount', asIfUndefined)).toBe(false);
    // Same-account ({Ref}) propagations also cannot falsely match a real logicalId
    // against `undefined`.
    expect(matchesAttachmentId({ Ref: 'SomeLogicalId' }, asIfUndefined)).toBe(false);
    // Note: `matchesAttachmentId(undefined, undefined)` still returns `true` because
    // both sides resolve to `undefined`. That is why the fix ALSO adds an
    // `if (!attachmentId) continue` guard at both call sites in
    // `createTgwPropagations` / `createTgwAssociation`. This helper is only safe
    // when callers have already excluded the empty-attachmentId case.
    expect(matchesAttachmentId(undefined, asIfUndefined)).toBe(true);
  });
});

/**
 * Source-body snapshots for the three methods in `TgwCrossAccountResources`
 * that together prevent the ghost-entry bug (GitHub issue #1064):
 *
 *   - `setTransitGatewayIds`   — must key the attachment map by
 *     `tgwAttachmentItem.name` (not the `<tgw>_<account>_<vpc>` format),
 *     so the lookup in `createTgwPropagations`/`createTgwAssociation`
 *     actually resolves.
 *   - `createTgwPropagations`  — must guard `if (!attachmentId) continue;`
 *     and use `matchesAttachmentId` (handles both `{Ref}` and resolved-string
 *     property shapes). Without the guard, `undefined === undefined` false-
 *     matches against cross-account ASEA propagations cause ghost entries
 *     in `aseaResources.json` and silent skip of real propagations.
 *   - `createTgwAssociation`   — same guard + predicate requirements as above.
 *
 * Any regression to any of these three methods surfaces as a snapshot diff.
 */
describe('TgwCrossAccountResources ghost-entry regression guards', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../lib/asea-resources/tgw-cross-account-resources.ts'),
    'utf8',
  );

  test('setTransitGatewayIds method body snapshot', () => {
    expect(extractMethod(src, 'setTransitGatewayIds')).toMatchSnapshot();
  });

  test('createTgwPropagations method body snapshot', () => {
    expect(extractMethod(src, 'createTgwPropagations')).toMatchSnapshot();
  });

  test('createTgwAssociation method body snapshot', () => {
    expect(extractMethod(src, 'createTgwAssociation')).toMatchSnapshot();
  });

  test('createTgwPropagations guards against empty attachmentId', () => {
    const body = extractMethod(src, 'createTgwPropagations');
    expect(body).toMatch(/if \(!attachmentId\) continue;/);
    expect(body).toMatch(/matchesAttachmentId\(/);
  });

  test('createTgwAssociation guards against empty attachmentId', () => {
    const body = extractMethod(src, 'createTgwAssociation');
    expect(body).toMatch(/if \(!attachmentId\) continue;/);
    expect(body).toMatch(/matchesAttachmentId\(/);
  });

  test('setTransitGatewayIds keys the attachment map by tgwAttachmentItem.name', () => {
    const body = extractMethod(src, 'setTransitGatewayIds');
    // The pre-1.15.1 bug keyed the map by `${tgw}_${account}_${vpc}` which never
    // matched the lookup in createTgwPropagations/createTgwAssociation.
    expect(body).toMatch(/transitGatewayAttachments\[tgwAttachmentItem\.name\]\s*=/);
    expect(body).not.toMatch(/\$\{tgwAttachmentItem\.transitGateway\.name\}_\$\{owningAccount\}_\$\{vpcItem\.name\}/);
  });
});

function extractMethod(source: string, methodName: string): string {
  const start = source.indexOf(`private ${methodName}(`);
  if (start === -1) throw new Error(`Method ${methodName} not found`);
  // Skip the parameter list by finding the matching `)` before the method body `{`.
  let parenDepth = 0;
  let paramEnd = -1;
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    if (source[i] === '(') parenDepth++;
    else if (source[i] === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        paramEnd = i;
        break;
      }
    }
  }
  const open = source.indexOf('{', paramEnd);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Unbalanced braces in ${methodName}`);
}

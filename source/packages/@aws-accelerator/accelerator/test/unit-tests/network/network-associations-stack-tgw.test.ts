import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the LZA 1.15.1 follow-up defect in
 * `NetworkAssociationsStack` (see commit 9243524ab,
 * https://github.com/awslabs/landing-zone-accelerator-on-aws/commit/9243524abe058a526477bf72a8350aa310745539).
 *
 * 1.15.1 MR 2544 added an early-return to both
 * `createTransitGatewayRouteTableAssociation` and
 * `createTransitGatewayRouteTablePropagation` in `NetworkAssociationsStack`:
 *
 *   if (this.isManagedByAseaGlobal(AseaResourceType.TRANSIT_GATEWAY_ATTACHMENT, ...)) {
 *     return;
 *   }
 *
 * That guard skips ALL associations/propagations for ASEA-managed attachments,
 * including those into LZA-created TGW route tables (e.g. `Main_tgw_dev_rt`).
 * It caused CloudFormation to delete valid LZA resources on upgrade from 1.14.3.
 *
 * The per-item inner check
 * `isManagedByAsea(TRANSIT_GATEWAY_ASSOCIATION|PROPAGATION, ...)` is the correct
 * place to skip — it filters only the items ASEA truly owns, leaving
 * LZA-created route-table targets intact.
 *
 * This test snapshots the public surface of those two methods to lock in the
 * absence of the broad early-return. If someone re-introduces it, the snapshot
 * diff will flag the change.
 */
describe('NetworkAssociationsStack TGW association/propagation guards', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../../lib/stacks/network-stacks/network-associations-stack/network-associations-stack.ts'),
    'utf8',
  );

  test('createTransitGatewayRouteTableAssociation does not early-return on ASEA-managed attachments', () => {
    const method = extractMethod(source, 'createTransitGatewayRouteTableAssociation');
    expect(method).not.toMatch(/isManagedByAseaGlobal\(\s*AseaResourceType\.TRANSIT_GATEWAY_ATTACHMENT/);
    // Per-item inner check must still be present — this is what correctly skips ASEA-owned items.
    expect(method).toMatch(/isManagedByAsea\(AseaResourceType\.TRANSIT_GATEWAY_ASSOCIATION/);
  });

  test('createTransitGatewayRouteTablePropagation does not early-return on ASEA-managed attachments', () => {
    const method = extractMethod(source, 'createTransitGatewayRouteTablePropagation');
    expect(method).not.toMatch(/isManagedByAseaGlobal\(\s*AseaResourceType\.TRANSIT_GATEWAY_ATTACHMENT/);
    expect(method).toMatch(/isManagedByAsea\(AseaResourceType\.TRANSIT_GATEWAY_PROPAGATION/);
  });

  // Full-body snapshots of the two methods. Any structural change to the guard logic
  // will surface here as a snapshot diff. Combined with the grep assertions above this
  // acts as a faithful, low-cost substitute for full-synth CFN template snapshots
  // (which would require adding a new ASEA-enabled fixture config).
  test('createTransitGatewayRouteTableAssociation method body snapshot', () => {
    expect(extractMethod(source, 'createTransitGatewayRouteTableAssociation')).toMatchSnapshot();
  });

  test('createTransitGatewayRouteTablePropagation method body snapshot', () => {
    expect(extractMethod(source, 'createTransitGatewayRouteTablePropagation')).toMatchSnapshot();
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

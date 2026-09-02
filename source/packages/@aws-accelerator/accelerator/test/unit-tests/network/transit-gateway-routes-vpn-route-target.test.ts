/**
 * Regression coverage for the VPN/DX route-target gap fixed in this change (#4883).
 *
 * Pre-fix: a TGW static route whose `attachment` targets a VPN connection (or a
 * Direct Connect gateway) on an ASEA-adopted TGW route table caused the ASEA
 * import handler to throw at synth time:
 *
 *   Unable to locate transit gateway attachment ID for route table item <rtName>
 *   Error: Configuration validation failed at runtime.
 *
 * The VPN and DX branches of `getStaticRouteAttachmentConfig` never resolved a
 * `transitGatewayAttachmentId` (the resolution was left commented out), so the
 * trailing attachment-id guard fired and killed ImportAseaResources.
 *
 * The ASEA import handler only *adopts* pre-existing ASEA routes (it matches
 * against `allRoutes` from the ASEA mapping and never creates net-new routes).
 * New VPN/DX route targets are created and managed by the NetworkAssociations
 * stack. The fix therefore defers VPN/DX targets: it sets
 * `attachmentManagedByNetworkAssociations = true` in those branches and excludes
 * them from the attachment-id guard, so synth completes and NetworkAssociations
 * owns creation.
 *
 * Approach (matching transit-gateway-routes-asea-peering.test.ts):
 * - Bind the private `getStaticRouteAttachmentConfig` onto a minimal `this`-shaped
 *   stub via prototype access, so we don't construct a full ImportAseaResourcesStack.
 */

import { describe, expect, test } from 'vitest';
import { TransitGatewayRoutes } from '../../../lib/asea-resources/transit-gateway-routes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GetStaticRouteAttachmentConfigFn = (this: unknown, routeItem: any, routeTableItem: any, tgwItem: any) => any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = TransitGatewayRoutes.prototype as any;
const getStaticRouteAttachmentConfig: GetStaticRouteAttachmentConfigFn = proto.getStaticRouteAttachmentConfig;

const routeTableItem = { name: 'Main_tgw_standalone_rt' };
const tgwItem = { name: 'Main_tgw', account: 'shared-network', region: 'ca-central-1' };

function makeThis(recordedLogs: string[], tgwAttachmentId?: string): unknown {
  return {
    props: {
      globalConfig: { externalLandingZoneResources: { templateMap: {} } },
      accountsConfig: { getAccountId: () => '111111111111' },
    },
    // Stubbed so the VPC control path can simulate an unresolved attachment id.
    getTgwAttachmentId: () => tgwAttachmentId,
    scope: {
      addLogs: (_level: unknown, message: string) => {
        recordedLogs.push(message);
      },
    },
  };
}

describe('TransitGatewayRoutes.getStaticRouteAttachmentConfig - VPN/DX route targets (#4883)', () => {
  test('does not throw for a VPN route target on an ASEA-adopted TGW route table', () => {
    const recordedLogs: string[] = [];
    const ctx = makeThis(recordedLogs);
    const routeItem = {
      destinationCidrBlock: '192.0.2.0/24',
      attachment: { vpnConnectionName: 'OnPremise_fw_ip0_vpn' },
    };

    let result: { routeId: string; transitGatewayAttachmentId?: string } | undefined;
    expect(() => {
      result = getStaticRouteAttachmentConfig.call(ctx, routeItem, routeTableItem, tgwItem);
    }).not.toThrow();

    // Attachment resolution is deferred to NetworkAssociations, so no id is set here.
    expect(result?.transitGatewayAttachmentId).toBeUndefined();
    expect(result?.routeId).toBe('');
    // The "unable to locate" guard must NOT have fired.
    expect(recordedLogs.some(m => m.includes('Unable to locate transit gateway attachment ID'))).toBe(false);
  });

  test('does not throw for a Direct Connect gateway route target', () => {
    const recordedLogs: string[] = [];
    const ctx = makeThis(recordedLogs);
    const routeItem = {
      destinationCidrBlock: '192.0.2.0/24',
      attachment: { directConnectGatewayName: 'OnPremise_dxgw' },
    };

    let result: { routeId: string; transitGatewayAttachmentId?: string } | undefined;
    expect(() => {
      result = getStaticRouteAttachmentConfig.call(ctx, routeItem, routeTableItem, tgwItem);
    }).not.toThrow();

    expect(result?.transitGatewayAttachmentId).toBeUndefined();
    expect(recordedLogs.some(m => m.includes('Unable to locate transit gateway attachment ID'))).toBe(false);
  });

  test('still throws for a VPC route target whose attachment id cannot be resolved (guard intact)', () => {
    const recordedLogs: string[] = [];
    // getTgwAttachmentId returns undefined => the VPC branch cannot resolve the id.
    const ctx = makeThis(recordedLogs, undefined);
    const routeItem = {
      destinationCidrBlock: '192.0.2.0/24',
      attachment: { account: 'shared-network', vpcName: 'Some_vpc' },
    };

    expect(() => getStaticRouteAttachmentConfig.call(ctx, routeItem, routeTableItem, tgwItem)).toThrow(
      'Configuration validation failed at runtime.',
    );
    expect(recordedLogs.some(m => m.includes('Unable to locate transit gateway attachment ID'))).toBe(true);
  });
});

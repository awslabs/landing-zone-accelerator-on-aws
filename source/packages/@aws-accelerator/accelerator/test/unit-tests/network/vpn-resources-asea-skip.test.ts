/**
 * Coverage for the ASEA Customer Gateway create-suppression guard in VpnResources (#4883).
 *
 * `createVpnConnectionResources` (network-prep-stack/vpn-resources.ts) is the integration point
 * that prevents LZA from recreating an ASEA-adopted Customer Gateway / Site-to-Site VPN. When the
 * CGW is managed by ASEA the guard must skip creation:
 *
 *   if (this.stack.isManagedByAsea(AseaResourceType.CUSTOMER_GATEWAY, cgwItem.name)) { ... continue; }
 *
 * If the guard fails to fire for a managed CGW, LZA recreates it and the deployment fails with
 * "already exists". If it wrongly fires for a non-managed CGW, the CGW and its SSM parameter are
 * silently never created. Both outcomes are exercised here.
 *
 * `isManagedByAsea` reads only from globalConfig.externalLandingZoneResources, so both branches are
 * driven purely from the stubbed stack method. The private `createVpnConnectionResources` is invoked
 * via prototype binding against a real cdk.Stack (so the CustomerGateway construct synthesizes) with
 * the NetworkPrepStack methods it calls stubbed on that stack instance.
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test, vi } from 'vitest';
import { VpnResources } from '../../../lib/stacks/network-stacks/network-prep-stack/vpn-resources';

const ACCOUNT = '111111111111';
const REGION = 'us-east-1';
const CGW_NAME = 'OnPremise_fw_ip0_cgw';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProps(): any {
  return {
    accountsConfig: { getAccountId: () => ACCOUNT },
    networkConfig: {
      customerGateways: [
        {
          name: CGW_NAME,
          account: 'shared-network',
          region: REGION,
          ipAddress: '198.51.100.10', // valid IPv4 -> isIpAddress() true, non-firewall path
          asn: 65000,
          // no vpnConnections: keeps the create-branch to just the CustomerGateway construct
        },
      ],
    },
  };
}

/**
 * Build a real cdk.Stack with the NetworkPrepStack methods that createVpnConnectionResources calls
 * stubbed on it. `managed` controls the isManagedByAsea result for CGW_NAME.
 */
function makeStack(managed: boolean): { stack: cdk.Stack; addSsmParameter: ReturnType<typeof vi.fn> } {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestNetworkPrepStack', { env: { account: ACCOUNT, region: REGION } });
  const addSsmParameter = vi.fn();
  Object.assign(stack, {
    isTargetStack: () => true,
    isManagedByAsea: (_type: string, name: string) => managed && name === CGW_NAME,
    addLogs: () => undefined,
    addSsmParameter,
    getSsmPath: (type: string, replacements: string[]) => `/${type}/${replacements.join('/')}`,
  });
  return { stack, addSsmParameter };
}

function runCreate(stack: cdk.Stack): Map<string, string>[] {
  const vpnResources = Object.create(VpnResources.prototype) as VpnResources;
  (vpnResources as unknown as { stack: cdk.Stack; transitGatewayMap: Map<string, string> }).stack = stack;
  (vpnResources as unknown as { transitGatewayMap: Map<string, string> }).transitGatewayMap = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (vpnResources as any).createVpnConnectionResources(makeProps());
}

describe('VpnResources.createVpnConnectionResources - ASEA create-suppression guard (#4883)', () => {
  test('ASEA-managed CGW: creation is skipped (no CustomerGateway resource, no SSM param)', () => {
    const { stack, addSsmParameter } = makeStack(true);
    const [cgwMap] = runCreate(stack);

    Template.fromStack(stack).resourceCountIs('AWS::EC2::CustomerGateway', 0);
    expect(addSsmParameter).not.toHaveBeenCalled();
    expect(cgwMap.has(CGW_NAME)).toBe(false);
  });

  test('non-ASEA CGW: creation still happens (CustomerGateway resource + SSM param written)', () => {
    const { stack, addSsmParameter } = makeStack(false);
    const [cgwMap] = runCreate(stack);

    Template.fromStack(stack).resourceCountIs('AWS::EC2::CustomerGateway', 1);
    expect(cgwMap.has(CGW_NAME)).toBe(true);
    expect(addSsmParameter).toHaveBeenCalledTimes(1);
    expect(addSsmParameter.mock.calls[0][0]).toMatchObject({
      parameterName: expect.stringContaining(CGW_NAME),
    });
  });
});

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

/**
 * LZA CDK Diff Viewer — server-side HTML builder.
 *
 * Pipeline:
 *   1. readDiffJsonFiles()     reads every `*.diff.json` in a directory and wraps each
 *                              with DiffMeta (section, account, region, hasChanges flag).
 *   2. generateImpactReport()  aggregates across all stacks to produce the top-level
 *                              ImpactReport: totals, destructive changes, networking
 *                              changes. This is embedded as a JSON literal in the HTML.
 *   3. compressData()          gzips + base64-encodes the full StackDiffData[] so it
 *                              can travel inside a single HTML file without bloating
 *                              the initial DOM. Decompressed client-side.
 *   4. assembleHtml()          substitutes {{STYLES}}, {{DATA}}, {{SCRIPT}} in
 *                              templates/shell.html to produce the final self-contained
 *                              artifact.
 *
 * Public entry point: `generateHtml(diffDir)` → HTML string.
 * CLI wrapper at source/packages/@aws-accelerator/accelerator/generate-diff-viewer-cli.ts
 * is invoked from the Pipeline stage (see lib/pipeline.ts PRE_APPROVAL buildspec).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { StructuredStackDiff, ResourceChange } from '@aws-accelerator/utils';

const TEMPLATES_DIR = path.join(__dirname, 'templates');

// ============================================================================
// TYPES
// ============================================================================

export interface DiffMeta {
  /** Section name (e.g. "NetworkVpc") */
  section: string;
  /** Full stack name */
  name: string;
  /** Whether the stack has meaningful changes */
  hasChanges: boolean;
  /** Account ID parsed from stack name */
  account: string;
  /** Region parsed from stack name */
  region: string;
}

export interface StackDiffData {
  meta: DiffMeta;
  diff: StructuredStackDiff;
}

export interface DiffEntry {
  section: string;
  name: string;
  hasChanges: boolean;
  content: string;
}

/**
 * A module runner dry-run (`*.module.diff`) result surfaced in the viewer.
 * Unlike CDK stack diffs (structured JSON), module diffs are raw text output
 * from the module runner, so we carry the (ANSI-stripped) content verbatim.
 */
export interface ModuleDiff {
  /** Module name derived from the `<name>.module.diff` filename. */
  name: string;
  /** True when the dry-run shows real adds/removes (see hasModuleChanges). */
  hasChanges: boolean;
  /** ANSI-stripped module dry-run output. */
  content: string;
}

// ============================================================================
// NOTABLE RESOURCE TYPES
// ----------------------------------------------------------------------------
// Any change to these resource types is worth surfacing to the customer,
// regardless of action (create/modify/delete) or changeImpact.
// Keep alphabetized by service then type for easy maintenance.
// ============================================================================

const NOTABLE_RESOURCE_TYPES = new Set([
  // DirectConnect
  'AWS::DirectConnect::Connection',
  'AWS::DirectConnect::Gateway',
  'AWS::DirectConnect::GatewayAssociation',
  'AWS::DirectConnect::VirtualInterface',
  // EC2 — core VPC & routing
  'AWS::EC2::ClientVpnEndpoint',
  'AWS::EC2::CustomerGateway',
  'AWS::EC2::EIP',
  'AWS::EC2::FlowLog',
  'AWS::EC2::InternetGateway',
  'AWS::EC2::NatGateway',
  'AWS::EC2::NetworkAcl',
  'AWS::EC2::NetworkAclEntry',
  'AWS::EC2::PrefixList',
  'AWS::EC2::Route',
  'AWS::EC2::RouteTable',
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::SecurityGroupEgress',
  'AWS::EC2::SecurityGroupIngress',
  'AWS::EC2::Subnet',
  'AWS::EC2::SubnetRouteTableAssociation',
  // EC2 — transit gateway
  'AWS::EC2::TransitGateway',
  'AWS::EC2::TransitGatewayAttachment',
  'AWS::EC2::TransitGatewayConnect',
  'AWS::EC2::TransitGatewayMulticastDomain',
  'AWS::EC2::TransitGatewayPeeringAttachment',
  'AWS::EC2::TransitGatewayRoute',
  'AWS::EC2::TransitGatewayRouteTable',
  'AWS::EC2::TransitGatewayRouteTableAssociation',
  'AWS::EC2::TransitGatewayRouteTablePropagation',
  'AWS::EC2::TransitGatewayVpcAttachment',
  // EC2 — VPC peering / VPN
  'AWS::EC2::VPC',
  'AWS::EC2::VPCCidrBlock',
  'AWS::EC2::VPCEndpoint',
  'AWS::EC2::VPCEndpointService',
  'AWS::EC2::VPCEndpointServicePermissions',
  'AWS::EC2::VPCGatewayAttachment',
  'AWS::EC2::VPCPeeringConnection',
  'AWS::EC2::VPNConnection',
  'AWS::EC2::VPNConnectionRoute',
  'AWS::EC2::VPNGateway',
  'AWS::EC2::VPNGatewayRoutePropagation',
  // ELB
  'AWS::ElasticLoadBalancing::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::Listener',
  'AWS::ElasticLoadBalancingV2::TargetGroup',
  // Global Accelerator
  'AWS::GlobalAccelerator::Accelerator',
  'AWS::GlobalAccelerator::EndpointGroup',
  'AWS::GlobalAccelerator::Listener',
  // Network Firewall
  'AWS::NetworkFirewall::Firewall',
  'AWS::NetworkFirewall::FirewallPolicy',
  'AWS::NetworkFirewall::LoggingConfiguration',
  'AWS::NetworkFirewall::RuleGroup',
  // Network Manager
  'AWS::NetworkManager::CoreNetwork',
  'AWS::NetworkManager::GlobalNetwork',
  'AWS::NetworkManager::SiteToSiteVpnAttachment',
  'AWS::NetworkManager::TransitGatewayPeering',
  'AWS::NetworkManager::TransitGatewayRegistration',
  'AWS::NetworkManager::VpcAttachment',
  // RAM
  'AWS::RAM::ResourceShare',
  // Route53 / Route53Resolver
  'AWS::Route53::HostedZone',
  'AWS::Route53::RecordSet',
  'AWS::Route53Resolver::FirewallDomainList',
  'AWS::Route53Resolver::FirewallRuleGroup',
  'AWS::Route53Resolver::FirewallRuleGroupAssociation',
  'AWS::Route53Resolver::ResolverEndpoint',
  'AWS::Route53Resolver::ResolverQueryLoggingConfig',
  'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
  'AWS::Route53Resolver::ResolverRule',
  'AWS::Route53Resolver::ResolverRuleAssociation',
]);

// Destructive impact enumeration — single source of truth for both the
// `.has(impact)` membership check and the severity ordering used when sorting
// the Critical Networking Changes list. Defined once in severity order so
// WILL_DESTROY (highest risk) sorts before WILL_ORPHAN (lowest).
const DESTRUCTIVE_IMPACTS_ORDERED = ['WILL_DESTROY', 'WILL_REPLACE', 'MAY_REPLACE', 'WILL_ORPHAN'] as const;
const DESTRUCTIVE_IMPACTS = new Set<string>(DESTRUCTIVE_IMPACTS_ORDERED);
const DESTRUCTIVE_IMPACT_ORDER: Record<string, number> = Object.fromEntries(
  DESTRUCTIVE_IMPACTS_ORDERED.map((k, i) => [k, i]),
);

// ============================================================================
// NOISE DETECTION
// ----------------------------------------------------------------------------
// "Noise" = changes that appear in every deployment but don't represent a real
// infrastructure change. Filtering these out stops the viewer from flagging
// hundreds of stacks as "Changed" when nothing meaningful has changed.
//
// Sources of noise we filter:
//   - Lambda functions whose only diff is S3Key / Code.S3Key (asset hash
//     rotation — every LZA build produces new asset hashes).
//   - SSM Parameters whose only diff is Value and which are the accelerator
//     version marker (AcceleratorVersion) bumped on every release.
//   - Custom resources (Custom::*) whose only diff is the `uuid` property,
//     which CDK uses to force re-invocation on every deploy.
// ============================================================================

const NOISE_LEAF_PROPS = new Set(['S3Key', 'SOLUTION_ID', 'uuid', 'Value']);
const NOISE_CONTAINER_PROPS = new Set(['Code', 'Environment', 'Variables']);
const NOISE_RESOURCE_TYPES = new Set([
  'AWS::Lambda::Function',
  'AWS::CloudFormation::CustomResource',
  'AWS::SSM::Parameter',
]);

/**
 * Is this resource change pure noise (i.e. should be hidden from "meaningful
 * changes" counts, though still shown in the stack's Noise drawer)?
 *
 * Returns false for create/delete — those are always meaningful.
 */
function isNoiseResource(r: ResourceChange): boolean {
  if (r.action !== 'modify') return false;
  const props = Object.keys(r.properties);
  if (props.length === 0) return false;

  // Case 1: Lambda / CustomResource / SSM Parameter where every changed
  // property is in our noise allow-list.
  if (
    props.every(p => NOISE_LEAF_PROPS.has(p) || NOISE_CONTAINER_PROPS.has(p)) &&
    NOISE_RESOURCE_TYPES.has(r.resourceType)
  ) {
    return true;
  }

  // Case 2: The accelerator version marker SSM parameter.
  if (r.resourceType === 'AWS::SSM::Parameter' && r.logicalId.includes('AcceleratorVersion')) return true;

  // Case 3: CDK Custom::* resources whose only diff is the uuid forcing a re-invoke.
  if (r.resourceType.startsWith('Custom::') && props.every(p => p === 'uuid')) return true;

  return false;
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Extract the human-friendly section name from a CDK diff filename.
 * LZA stack names follow the shape `<Prefix>-<Section>Stack-<Account>-<Region>`
 * and CDK diff files are named `<StackName>.diff.json`.
 *
 * Example: `AWSAccelerator-NetworkVpcStack-123456789012-us-east-1.diff.json`
 *   → `NetworkVpc`
 *
 * Returns `"other"` if the filename has no `…Stack` segment.
 */
export function extractSection(filename: string): string {
  const name = filename.replace(/\.diff\.json$/, '');
  for (const part of name.split('-')) {
    if (part.endsWith('Stack')) return part.slice(0, -5);
  }
  return 'other';
}

export function hasModuleChanges(content: string): boolean {
  if (content.includes('SKIPPED')) {
    return false;
  }
  if (content.includes('[+]') || content.includes('[-]')) {
    return true;
  }
  return !content.includes('No changes') && !content.includes('0 change(s)');
}

/** CSS class applied to a single module dry-run line in the viewer. */
export type ModuleLineClass = 'module-add' | 'module-del' | 'module-ctx';

/**
 * Classify a single module dry-run line for viewer colorization: added lines
 * (`[+]` or leading `+`) → 'module-add', removed (`[-]` or leading `-`) →
 * 'module-del', everything else → 'module-ctx' (context).
 *
 * Canonical implementation. `moduleLineClass()` in templates/viewer.js is a
 * hand-mirrored copy (viewer.js is inlined verbatim into the HTML and cannot
 * import this module) — keep the two in sync. This exported version exists so
 * the branching logic is unit-testable in Node.
 */
export function classifyModuleLine(line: string): ModuleLineClass {
  const t = line.replace(/^\s+/, '');
  if (t.indexOf('[+]') === 0 || t.charAt(0) === '+') return 'module-add';
  if (t.indexOf('[-]') === 0 || t.charAt(0) === '-') return 'module-del';
  return 'module-ctx';
}

export function hasChanges(content: string): boolean {
  if (content.includes('There were no differences')) {
    return false;
  }
  return !isOnlyLambdaS3KeyChanges(content);
}

/**
 * Strip ANSI escape sequences from a string.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[\d;]*m/g, '');
}

/**
 * Check whether every resource-level change block in a CDK diff is exclusively
 * noise — i.e. Lambda S3Key changes (asset hash rotation) or CustomResource
 * uuid changes. These appear on every deploy when source is rebuilt, even
 * with no functional change.
 *
 * CDK diff output contains ANSI color codes, so we strip them before parsing.
 */
export function isOnlyLambdaS3KeyChanges(content: string): boolean {
  const clean = stripAnsi(content);
  const resourceChangeRegex = /^\s*\[([~+-])\]\s+((?:AWS|Custom)::\S+)\s+\S+/gm;
  const resourceChanges = [...clean.matchAll(resourceChangeRegex)];

  if (resourceChanges.length === 0) {
    return false;
  }

  // Any [+] or [-] resource is a real change
  // Only [~] on Lambda::Function or CloudFormation::CustomResource can be noise
  const noiseTypes = new Set(['AWS::Lambda::Function', 'AWS::CloudFormation::CustomResource']);
  for (const match of resourceChanges) {
    if (match[1] !== '~') {
      return false;
    }
    if (!noiseTypes.has(match[2]) && !match[2].startsWith('Custom::')) {
      return false;
    }
  }

  // Split content into blocks per resource change line
  const lines = clean.split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\s*\[([~+-])\]\s+(?:AWS|Custom)::\S+\s+\S+/.test(line)) {
      if (current.length > 0) {
        blocks.push(current);
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current);
  }

  // Every block must be a noise-only change
  for (const block of blocks) {
    const header = block[0];
    const body = block.slice(1).join('\n');

    if (header.includes('AWS::Lambda::Function')) {
      // Lambda: only S3Key changes are noise
      if (!body.includes('.S3Key')) {
        return false;
      }
      const propertyChanges = body.match(/\[~\]\s+\.(\S+)/g) || [];
      for (const prop of propertyChanges) {
        const propName = prop.match(/\[~\]\s+\.(\S+)/)?.[1];
        if (propName && propName !== 'S3Key:' && propName !== 'S3Key') {
          return false;
        }
      }
    } else if (header.includes('AWS::CloudFormation::CustomResource') || /Custom::\S+/.test(header)) {
      // CustomResource: only uuid changes are noise
      if (!body.includes('uuid')) {
        return false;
      }
      const propertyChanges = body.match(/\[~\]\s+(\S+)/g) || [];
      for (const prop of propertyChanges) {
        const propName = prop.match(/\[~\]\s+(\S+)/)?.[1];
        if (propName && propName !== 'uuid') {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Extract `{account, region}` from an LZA stack name.
 *
 * Regex shape: `<12-digit account>-<region>`, where region is
 * `<letters>(-<letters>)*-<digits>` to match every commercial, GovCloud, ISO,
 * and China region pattern (us-east-1, us-gov-east-1, us-iso-east-1,
 * us-isob-east-1, cn-northwest-1, ap-southeast-2, etc.).
 *
 * The negative-lookahead `(?![a-z0-9])` stops `us-east-1b` (an AZ suffix) from
 * being mis-parsed as a region. The region does NOT need to end the string,
 * so suffixes appended by CDK qualifiers / customizations are tolerated.
 */
export function parseStackIdentifiers(stackName: string): { account: string; region: string } {
  const match = stackName.match(/(\d{12})-([a-z]{2,}(?:-[a-z]+)*-\d+)(?![a-z0-9])/);
  return match ? { account: match[1], region: match[2] } : { account: 'unknown', region: 'unknown' };
}

// ============================================================================
// READ DIFF FILES
// ============================================================================

export function readDiffJsonFiles(diffDir: string): StackDiffData[] {
  return fs
    .readdirSync(diffDir)
    .filter(f => f.endsWith('.diff.json'))
    .sort()
    .map(file => {
      const raw: StructuredStackDiff = JSON.parse(fs.readFileSync(path.join(diffDir, file), 'utf-8'));
      const name = file.replace(/\.diff\.json$/, '');
      const { account, region } = parseStackIdentifiers(name);
      const meaningfulResources = raw.resources.filter(r => !isNoiseResource(r));
      const hasChanges =
        meaningfulResources.length > 0 ||
        raw.parameters.length > 0 ||
        raw.outputs.length > 0 ||
        raw.conditions.length > 0;
      return {
        meta: { section: extractSection(file), name, hasChanges, account, region },
        diff: raw,
      };
    });
}

/**
 * Read all .diff and .module.diff files from a directory and return structured metadata + content.
 */
export function readDiffFiles(diffDir: string): DiffEntry[] {
  const files = fs
    .readdirSync(diffDir)
    .filter(f => f.endsWith('.diff'))
    .sort();

  return files.map(file => {
    const content = fs.readFileSync(path.join(diffDir, file), 'utf-8');
    const isModuleDiff = file.endsWith('.module.diff');
    const name = isModuleDiff ? file.replace(/\.module\.diff$/, '') : file.replace(/\.diff$/, '');
    return {
      section: isModuleDiff ? 'Modules' : extractSection(file),
      name,
      hasChanges: isModuleDiff ? hasModuleChanges(content) : hasChanges(content),
      content,
    };
  });
}

/**
 * Read only `*.module.diff` files (module runner dry-run output) from a
 * directory. Content is ANSI-stripped so it renders cleanly in the viewer's
 * <pre> block, and `hasChanges` is derived from `hasModuleChanges` so SKIPPED
 * (config-unchanged) modules are flagged as "no changes" in the sidebar.
 *
 * Empty / whitespace-only output is treated as "no changes" (hasModuleChanges
 * would otherwise report true for an empty string, since it lacks the "No
 * changes" marker).
 *
 * Resilience: module diffs are supplementary to the CDK stack diffs, so a
 * single unreadable file must not take down the whole viewer. Files that fail
 * to read are logged and skipped rather than propagated.
 *
 * Returns an empty array when the directory does not exist or contains no
 * module diffs — the viewer tolerates an empty `moduleDiffs` global.
 */
export function readModuleDiffs(diffDir: string): ModuleDiff[] {
  if (!fs.existsSync(diffDir)) return [];
  const result: ModuleDiff[] = [];
  for (const file of fs
    .readdirSync(diffDir)
    .filter(f => f.endsWith('.module.diff'))
    .sort()) {
    try {
      const content = stripAnsi(fs.readFileSync(path.join(diffDir, file), 'utf-8'));
      const name = file.replace(/\.module\.diff$/, '').replace(/^\d+-/, '');
      result.push({ name, hasChanges: content.trim().length > 0 && hasModuleChanges(content), content });
    } catch (e) {
      // Skip an unreadable module diff rather than failing the entire viewer.
      console.error(`Skipping unreadable module diff ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

// ============================================================================
// IMPACT REPORT
// ============================================================================

export type DestructiveImpact = 'WILL_DESTROY' | 'WILL_REPLACE' | 'MAY_REPLACE' | 'WILL_ORPHAN';

/** A single destructive change surfaced at the top of the impact report. */
export interface DestructiveChange {
  stackName: string;
  section: string;
  account: string;
  region: string;
  logicalId: string;
  resourceType: string;
  impact: DestructiveImpact;
  /** For WILL_REPLACE / MAY_REPLACE: the property changes that forced the replacement. */
  triggerProperties?: string[];
}

/** A change to a networking resource, regardless of action. */
export interface NetworkingChange {
  stackName: string;
  section: string;
  account: string;
  region: string;
  logicalId: string;
  resourceType: string;
  action: 'create' | 'modify' | 'delete';
  impact: string;
}

export interface ImpactReport {
  totalStacks: number;
  stacksWithChanges: number;
  resourceCounts: { creates: number; modifies: number; deletes: number; replaces: number };
  accountsAffected: string[];
  regionsAffected: string[];
  allResourceTypes: string[];
  notableResourceTypes: string[];
  /** Every resource that will be destroyed, replaced, conditionally replaced, or orphaned. */
  destructiveChanges: DestructiveChange[];
  /** Breakdown by impact for quick headline counts. */
  destructiveCounts: { willDestroy: number; willReplace: number; mayReplace: number; willOrphan: number };
  /** Number of stacks that contain at least one destructive change. */
  stacksWithDestructive: number;
  /** Every change to a networking resource type (includes destructive ones too). */
  networkingChanges: NetworkingChange[];
  /** Number of stacks that contain at least one networking change. */
  stacksWithNetworkingChanges: number;
}

/**
 * Collect the property names that triggered a resource replacement.
 * Returns undefined when no properties match (rare; resource-level impact only).
 */
function collectTriggerProperties(resource: ResourceChange, impact: DestructiveImpact): string[] | undefined {
  if (impact !== 'WILL_REPLACE' && impact !== 'MAY_REPLACE') return undefined;
  const props = Object.entries(resource.properties)
    .filter(([, pc]) => pc.changeImpact === impact)
    .map(([name]) => name);
  return props.length > 0 ? props : undefined;
}

/**
 * Determine whether a resource change is destructive. Handles two shapes:
 *   1. action === 'delete' -> WILL_DESTROY regardless of changeImpact value
 *   2. changeImpact in DESTRUCTIVE_IMPACTS (covers WILL_REPLACE / MAY_REPLACE / WILL_ORPHAN)
 */
function classifyDestructive(resource: ResourceChange): DestructiveImpact | undefined {
  if (resource.action === 'delete') return 'WILL_DESTROY';
  if (resource.changeImpact && DESTRUCTIVE_IMPACTS.has(resource.changeImpact)) {
    return resource.changeImpact as DestructiveImpact;
  }
  // Fallback: resource-level impact may be WILL_UPDATE while a property forces replacement.
  for (const pc of Object.values(resource.properties)) {
    if (pc.changeImpact === 'WILL_REPLACE') return 'WILL_REPLACE';
  }
  for (const pc of Object.values(resource.properties)) {
    if (pc.changeImpact === 'MAY_REPLACE') return 'MAY_REPLACE';
  }
  return undefined;
}

export function generateImpactReport(stacks: StackDiffData[]): ImpactReport {
  const accounts = new Set<string>();
  const regions = new Set<string>();
  const allTypes = new Set<string>();
  const destructiveStacks = new Set<string>();
  const networkingStacks = new Set<string>();
  const destructiveChanges: DestructiveChange[] = [];
  const networkingChanges: NetworkingChange[] = [];

  let creates = 0,
    modifies = 0,
    deletes = 0,
    replaces = 0;
  let willDestroy = 0,
    willReplace = 0,
    mayReplace = 0,
    willOrphan = 0;
  let stacksWithChanges = 0;

  for (const s of stacks) {
    if (!s.meta.hasChanges) continue;
    stacksWithChanges++;
    accounts.add(s.meta.account);
    regions.add(s.meta.region);

    for (const r of s.diff.resources) {
      if (isNoiseResource(r)) continue;
      allTypes.add(r.resourceType);

      // Resource-count aggregation (unchanged contract)
      if (r.action === 'create') creates++;
      else if (r.action === 'delete') deletes++;
      else if (r.changeImpact === 'WILL_REPLACE' || r.changeImpact === 'MAY_REPLACE') replaces++;
      else modifies++;

      // Common location + identity fields shared by both destructive and
      // networking change records (avoids six lines of duplicated copy-paste).
      const baseMeta = {
        stackName: s.meta.name,
        section: s.meta.section,
        account: s.meta.account,
        region: s.meta.region,
        logicalId: r.logicalId,
        resourceType: r.resourceType,
      };

      // Destructive aggregation
      const destructive = classifyDestructive(r);
      if (destructive) {
        destructiveChanges.push({
          ...baseMeta,
          impact: destructive,
          triggerProperties: collectTriggerProperties(r, destructive),
        });
        destructiveStacks.add(s.meta.name);
        if (destructive === 'WILL_DESTROY') willDestroy++;
        else if (destructive === 'WILL_REPLACE') willReplace++;
        else if (destructive === 'MAY_REPLACE') mayReplace++;
        else if (destructive === 'WILL_ORPHAN') willOrphan++;
      }

      // Networking aggregation (any action, destructive or not)
      if (NOTABLE_RESOURCE_TYPES.has(r.resourceType)) {
        networkingChanges.push({
          ...baseMeta,
          action: r.action,
          impact: r.changeImpact,
        });
        networkingStacks.add(s.meta.name);
      }
    }
  }

  // Sort destructive: highest risk first, then by stack/logicalId for stable output
  destructiveChanges.sort((a, b) => {
    const ra = DESTRUCTIVE_IMPACT_ORDER[a.impact] ?? 99;
    const rb = DESTRUCTIVE_IMPACT_ORDER[b.impact] ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.stackName !== b.stackName) return a.stackName.localeCompare(b.stackName);
    return a.logicalId.localeCompare(b.logicalId);
  });

  // Sort networking: by resource type, then stack, then logicalId
  networkingChanges.sort((a, b) => {
    if (a.resourceType !== b.resourceType) return a.resourceType.localeCompare(b.resourceType);
    if (a.stackName !== b.stackName) return a.stackName.localeCompare(b.stackName);
    return a.logicalId.localeCompare(b.logicalId);
  });

  const sorted = [...allTypes].sort();
  return {
    totalStacks: stacks.length,
    stacksWithChanges,
    resourceCounts: { creates, modifies, deletes, replaces },
    accountsAffected: [...accounts].sort(),
    regionsAffected: [...regions].sort(),
    allResourceTypes: sorted,
    notableResourceTypes: sorted.filter(t => NOTABLE_RESOURCE_TYPES.has(t)),
    destructiveChanges,
    destructiveCounts: { willDestroy, willReplace, mayReplace, willOrphan },
    stacksWithDestructive: destructiveStacks.size,
    networkingChanges,
    stacksWithNetworkingChanges: networkingStacks.size,
  };
}

// ============================================================================
// COMPRESSION
// ============================================================================

/**
 * Gzip a JSON-serializable value and base64-encode it. Used to keep large
 * payloads out of the initial DOM — the client decompresses via the browser's
 * native DecompressionStream. Base64 output (A-Za-z0-9+/=) contains no HTML
 * specials, so it is safe to embed inside a double-quoted inline JS string.
 */
function gzipBase64(value: unknown): string {
  const json = JSON.stringify(value);
  const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'));
  return compressed.toString('base64');
}

/**
 * Compress all stack diff data into a single gzipped base64 blob.
 * The blob contains a JSON array of StackDiffData objects.
 */
export function compressData(stacks: StackDiffData[]): string {
  return gzipBase64(stacks);
}

/**
 * Compress module dry-run diffs into a gzipped base64 blob, mirroring
 * compressData so module output does not bloat the inline HTML. The blob
 * contains a JSON array of ModuleDiff objects.
 */
export function compressModuleDiffs(modules: ModuleDiff[]): string {
  return gzipBase64(modules);
}

// ============================================================================
// HTML GENERATION
// ============================================================================

/**
 * JSON-stringify `obj` and escape characters that are special when embedded
 * inside an inline <script> block. Prevents a `</script>` sequence inside a
 * string value (e.g. a resource description / IAM SID / tag value) from
 * terminating the script tag. Also escapes U+2028 / U+2029 which historically
 * caused issues in some JS parsers.
 *
 * The output is still valid JSON (the escapes use unicode form) so runtime
 * behaviour is unchanged.
 */
function safeJsonEmbed(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Substitute a `{{PLACEHOLDER}}` token in `template` with `value` literally.
 * Uses the callback form of String.prototype.replace so the replacement text
 * is not interpreted as a pattern — `$&`, `$1`, `` $` `` etc. in `value` are
 * treated as raw characters rather than regex replacement directives.
 */
function replaceToken(template: string, token: string, value: string): string {
  return template.replace(token, () => value);
}

export function assembleHtml(dataJs: string, templatesDir?: string): string {
  const dir = templatesDir ?? TEMPLATES_DIR;
  const shell = fs.readFileSync(path.join(dir, 'shell.html'), 'utf-8');
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf-8');
  const script = fs.readFileSync(path.join(dir, 'viewer.js'), 'utf-8');
  let out = replaceToken(shell, '{{STYLES}}', styles);
  out = replaceToken(out, '{{DATA}}', dataJs);
  out = replaceToken(out, '{{SCRIPT}}', script);
  return out;
}

export function generateHtml(diffDir: string, templatesDir?: string): string {
  const stacks = readDiffJsonFiles(diffDir);
  const modules = readModuleDiffs(diffDir);
  if (stacks.length === 0 && modules.length === 0) {
    throw new Error(`No .diff.json files found in ${diffDir}`);
  }

  const report = generateImpactReport(stacks);
  const blob = compressData(stacks);
  // Embed the report via safeJsonEmbed so attacker-controlled strings (logical IDs,
  // tag values, IAM SIDs, etc.) cannot terminate the surrounding <script> block.
  // Both blobs are base64 (alphabet: A-Za-z0-9+/=) so they contain no HTML specials
  // and are safe to concatenate directly inside a double-quoted JS string literal.
  // Module dry-run output is gzipped into moduleBlob (rather than inlined as JSON)
  // so large module output does not bloat the HTML — symmetric with dataBlob.
  const moduleBlob = compressModuleDiffs(modules);
  const dataJs = [
    `const impactReport = ${safeJsonEmbed(report)};`,
    `const dataBlob = "${blob}";`,
    `const moduleBlob = "${moduleBlob}";`,
  ].join('\n');

  return assembleHtml(dataJs, templatesDir);
}

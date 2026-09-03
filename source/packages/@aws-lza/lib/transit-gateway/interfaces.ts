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

import {
  IBatchOperationSettings,
  IModuleBoundary,
  IModuleOrganizationsDataSource,
  IModuleRegionFilters,
  IModuleRequest,
} from '../common/interfaces';

// ─── Attachment Type ────────────────────────────────────────────────────────

export type TgwAttachmentType = 'vpc' | 'vpn' | 'dxGateway' | 'peering' | 'connect';

// ─── Request Interfaces ─────────────────────────────────────────────────────

export interface ITgwModuleRequest extends IModuleRequest {
  readonly configuration: ITgwModuleConfiguration;
}

export interface ITgwModuleConfiguration {
  readonly enable: boolean;
  readonly accountAccessRoleName: string;
  readonly homeRegion?: string;
  readonly transitGateways: ITgwConfig[];
  readonly attachments: ITgwAttachmentConfig[];
  readonly directConnectGateways?: IDxGatewayConfig[];
  readonly connectAttachments?: ITgwConnectConfig[];
  readonly regionFilters?: IModuleRegionFilters;
  readonly boundary?: IModuleBoundary;
  readonly concurrency?: IBatchOperationSettings;
  readonly dataSources?: ITgwModuleDataSources;
  /** Previously owned resources from state — used for safe deletion (only delete what LZA created) */
  readonly ownedResources?: ITgwOwnedResource[];
}

export interface ITgwModuleDataSources {
  readonly organizations?: IModuleOrganizationsDataSource;
  readonly ssmParameterPrefix?: string;
}

export interface ITgwConfig {
  readonly name: string;
  readonly accountId: string;
  readonly region: string;
  readonly routeTables: ITgwRouteTableConfig[];
}

export interface ITgwRouteTableConfig {
  readonly name: string;
}

export interface ITgwAttachmentConfig {
  readonly type: TgwAttachmentType;
  /** For VPC attachments: VPC name. For VPN attachments: VPN connection name. */
  readonly name: string;
  /** For VPC attachments: the TGW attachment config name (used in SSM path). Ignored for VPN. */
  readonly attachmentName?: string;
  readonly accountId: string;
  readonly transitGateway: string;
  readonly routeTableAssociations: string[];
  readonly routeTablePropagations: string[];
}

export interface IDxGatewayConfig {
  readonly name: string;
  readonly accountId: string;
  readonly transitGatewayAssociations?: IDxTgwAssociationConfig[];
}

export interface IDxTgwAssociationConfig {
  readonly name: string;
  readonly accountId: string;
  readonly allowedPrefixes: string[];
  readonly routeTableAssociations?: string[];
  readonly routeTablePropagations?: string[];
}

// ─── Connect Attachment Config ──────────────────────────────────────────────

export interface ITgwConnectConfig {
  /** Friendly name for the Connect attachment (used as Name tag) */
  readonly name: string;
  /** TGW name this Connect attaches to */
  readonly transitGateway: string;
  /** Type of transport attachment: 'vpc' or 'dxGateway' */
  readonly transportAttachmentType: 'vpc' | 'dxGateway';
  /** For VPC transport: VPC name. For DX transport: DX gateway name. */
  readonly transportName: string;
  /** Account ID owning the transport attachment */
  readonly transportAccountId: string;
  /** Connect protocol options */
  readonly options: { readonly protocol: 'gre' };
  /** Route table associations for the Connect attachment */
  readonly routeTableAssociations?: string[];
  /** Route table propagations for the Connect attachment */
  readonly routeTablePropagations?: string[];
  /** Optional tags */
  readonly tags?: { key: string; value: string }[];
}

// ─── Response Interfaces ────────────────────────────────────────────────────

/**
 * Owned resources are stored as simple resource ID strings.
 * Format: "assoc:{routeTableId}:{attachmentId}" or "prop:{routeTableId}:{attachmentId}"
 * Used for safe deletion: only resources in this set can be removed by the module.
 */
export type ITgwOwnedResource = string;

export type TgwOperationResult = 'created' | 'updated' | 'exists' | 'deleted' | 'skipped' | 'failed';

export enum DxAssociationState {
  ASSOCIATED = 'associated',
  ASSOCIATING = 'associating',
  UPDATING = 'updating',
  DISASSOCIATING = 'disassociating',
  DISASSOCIATED = 'disassociated',
}

export enum TgwAttachmentState {
  AVAILABLE = 'available',
}

interface ITgwBaseResponse {
  operation: TgwOperationResult;
  region: string;
  tgwName: string;
}

export interface ITgwAssociationResponse extends ITgwBaseResponse {
  routeTableName: string;
  attachmentType: TgwAttachmentType;
  attachmentName: string;
  errorMessage?: string;
}

export interface ITgwPropagationResponse extends ITgwBaseResponse {
  routeTableName: string;
  attachmentType: TgwAttachmentType;
  attachmentName: string;
}

export interface IDxAssociationResponse extends ITgwBaseResponse {
  dxGatewayName: string;
  associationType: 'direct' | 'proposal';
}

export interface ITgwConnectResponse extends ITgwBaseResponse {
  connectName: string;
  connectAttachmentId: string;
}

export interface ITgwModuleResponse {
  associations: ITgwAssociationResponse[];
  propagations: ITgwPropagationResponse[];
  dxAssociations: IDxAssociationResponse[];
  connectAttachments: ITgwConnectResponse[];
  /** Resources owned by LZA after this execution (for state persistence by the action handler) */
  ownedResources?: ITgwOwnedResource[];
}

// ─── Internal Types ─────────────────────────────────────────────────────────

export interface IAccountRegionGroup {
  accountId: string;
  region: string;
  tgwNames: string[];
}

export interface IDesiredAttachment {
  attachmentId: string;
  attachmentName: string;
  attachmentType: TgwAttachmentType;
}

export interface ITgwResolvedContext {
  /** Map of "tgwName" → TGW ID */
  transitGatewayIds: Map<string, string>;
  /** Map of "tgwName_rtName" → route table ID */
  routeTableIds: Map<string, string>;
  /** Map of "tgwName_accountId_attachmentName" → attachment ID */
  attachmentIds: Map<string, string>;
}

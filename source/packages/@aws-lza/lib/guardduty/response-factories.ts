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
 * @fileoverview GuardDuty Response Handler - Service-specific response creation and merging
 *
 * Provides GuardDuty-specific handler for creating and managing GuardDuty detector response objects.
 * The organization and delegated account handlers are provided by the common
 * security-service-response-builder module since they follow the standard AWS Organizations
 * delegated administration pattern.
 *
 * Key components:
 * - GuardDutyDetectorResponseHandler for GuardDuty-specific detector configuration
 * - Type-safe response creation with validation
 * - Backward compatibility with existing GuardDuty interfaces
 */

import { SecurityModuleOperationType } from '../common/types';
import {
  IGuardDutyDetectorResponse,
  IGuardDutyExportDestination,
  IGuardDutyProtectionsConfiguration,
} from './interfaces';

/**
 * Combined factory and merge handler for GuardDuty detector responses.
 * Handles both creation and merging in a single class.
 * Only used by GuardDuty service.
 */
export class GuardDutyDetectorResponseHandler {
  /**
   * Creates a new GuardDuty detector response from data
   */
  create(
    operation: SecurityModuleOperationType,
    region: string,
    data: Record<string, unknown>,
  ): IGuardDutyDetectorResponse {
    const accountIds = (data['accountIds'] as string[]) || [];

    return {
      operation,
      regions: [region],
      accountIds,
      protectionsConfiguration: data['protectionsConfiguration'] as IGuardDutyProtectionsConfiguration | undefined,
      exportFrequency: data['exportFrequency'] as string | undefined,
      exportDestination: data['exportDestination'] as IGuardDutyExportDestination | undefined,
    };
  }

  /**
   * Gets unique identifier for grouping responses
   */
  getIdentifier(response: IGuardDutyDetectorResponse): string {
    return `${response.operation}-detector`;
  }

  /**
   * Checks if two responses can be merged
   */
  canMerge(existing: IGuardDutyDetectorResponse, newResponse: IGuardDutyDetectorResponse): boolean {
    return existing.operation === newResponse.operation;
  }

  /**
   * Merges two responses by combining regions and accounts
   */
  merge(existing: IGuardDutyDetectorResponse, newResponse: IGuardDutyDetectorResponse): IGuardDutyDetectorResponse {
    return {
      ...existing,
      regions: [...new Set([...existing.regions, ...newResponse.regions])],
      accountIds: [...new Set([...existing.accountIds, ...newResponse.accountIds])],
      // Preserve GuardDuty-specific configuration from first response
      protectionsConfiguration: existing.protectionsConfiguration ?? newResponse.protectionsConfiguration,
      exportFrequency: existing.exportFrequency ?? newResponse.exportFrequency,
      exportDestination: existing.exportDestination ?? newResponse.exportDestination,
    };
  }
}

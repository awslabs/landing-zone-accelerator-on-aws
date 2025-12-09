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
 * @fileoverview Common Type Definitions - Shared types and enums for AWS LZA operations
 *
 * Provides comprehensive type definitions, enums, and type aliases used across
 * AWS Landing Zone Accelerator modules. Includes module state management,
 * account categorization, operation types, and DynamoDB query operators.
 *
 * Key type categories:
 * - Module exception and state management
 * - Account type classification and ordering
 * - Security module operation types
 * - DynamoDB query and filter operators
 */

import { Account } from '@aws-sdk/client-organizations';

/**
 * Enumeration of module exception types for error handling
 */
export enum MODULE_EXCEPTIONS {
  /** General service exception */
  SERVICE_EXCEPTION = 'ServiceException',
  /** Invalid input parameter exception */
  INVALID_INPUT = 'InvalidInputException',
}

/**
 * Enumeration of module operation state codes
 */
export enum MODULE_STATE_CODE {
  /** Operation completed successfully */
  SUCCESS = 'success',
  /** Operation failed with error */
  FAILED = 'failed',
  /** Operation completed (general completion) */
  COMPLETED = 'completed',
  /** Operation was skipped */
  SKIPPED = 'skipped',
}

/**
 * Type definition for ordered account lists with dependency management
 */
export type OrderedAccountListType = {
  /** Account group name indicating role in organization */
  name: 'Management' | 'DelegatedAdmin' | 'WorkLoads';
  /** Processing order for dependency resolution */
  order: number;
  /** Array of AWS accounts in this group */
  accounts: Account[];
};

/**
 * Type definition for security module operation states
 */
export type SecurityModuleOperationType = 'enabled' | 'disabled';

/**
 * Type definition for accelerator account classifications
 */
export type AcceleratorAccountType = 'management' | 'delegatedAdmin' | 'workload';

/**
 * Type definition for DynamoDB logical operators in filter expressions
 */
export type DynamoDBLogicalOperator = 'AND' | 'OR';

/**
 * Enumeration of DynamoDB filter operators for query and scan operations
 */
export enum DynamoDBFilterOperator {
  /** Equality comparison */
  EQUALS = '=',
  /** Inequality comparison */
  NOT_EQUALS = '<>',
  /** Less than comparison */
  LESS_THAN = '<',
  /** Less than or equal comparison */
  LESS_THAN_OR_EQUAL = '<=',
  /** Greater than comparison */
  GREATER_THAN = '>',
  /** Greater than or equal comparison */
  GREATER_THAN_OR_EQUAL = '>=',
  /** String prefix matching */
  BEGINS_WITH = 'begins_with',
  /** String contains matching */
  CONTAINS = 'contains',
  /** Attribute existence check */
  ATTRIBUTE_EXISTS = 'attribute_exists',
  /** Attribute non-existence check */
  ATTRIBUTE_NOT_EXISTS = 'attribute_not_exists',
  /** Attribute type validation */
  ATTRIBUTE_TYPE = 'attribute_type',
  /** Attribute size comparison */
  SIZE = 'size',
  /** Range comparison */
  BETWEEN = 'between',
  /** Value list membership */
  IN = 'in',
}

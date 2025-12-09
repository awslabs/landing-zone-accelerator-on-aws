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
 * @fileoverview Logging Infrastructure - Winston-based logging with icons and structured output
 *
 * Provides comprehensive logging infrastructure for AWS Landing Zone Accelerator operations
 * with visual icons, structured formatting, and multiple logger types. The logging system
 * supports both general application logging and high-priority status messages with
 * consistent formatting and configurable log levels.
 *
 * Key features:
 * - Icon-enhanced log messages for visual clarity
 * - Structured logging with timestamps and labels
 * - Configurable log levels via environment variables
 * - Specialized loggers for different message types
 * - AWS API operation logging with parameter tracking
 * - Dry run operation logging for testing scenarios
 *
 * @example
 * ```typescript
 * import { createLogger, createStatusLogger } from './logger';
 *
 * // Create module-specific logger
 * const logger = createLogger(['macie', 'enable']);
 *
 * // Log different message types with icons
 * logger.info('Starting Macie configuration', 'Account1:us-east-1');
 * logger.processStart('Beginning account setup');
 * logger.processEnd('Account setup completed successfully');
 * logger.warn('Rate limiting detected, retrying');
 * logger.error('Failed to enable Macie', 'Account2:us-west-2');
 *
 * // Log AWS API operations
 * logger.commandExecution('EnableMacieCommand', { findingFrequency: 'FIFTEEN_MINUTES' });
 * logger.dryRun('EnableMacieCommand', { findingFrequency: 'FIFTEEN_MINUTES' });
 *
 * // Create status logger for high-priority messages
 * const statusLogger = createStatusLogger(['deployment']);
 * statusLogger.info('Deployment phase completed');
 * ```
 */

import * as winston from 'winston';

/**
 * Main Winston logger instance for general application logging.
 * Configured with colorized output, timestamps, and environment-based log levels.
 */
const Logger = winston.createLogger({
  defaultMeta: { mainLabel: 'accelerator' },
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ message, timestamp, level, mainLabel, childLabel }) => {
      return `${timestamp} | ${level} | ${childLabel || mainLabel} | ${message}`;
    }),
    winston.format.align(),
  ),
  transports: [new winston.transports.Console()],
});

winston.add(Logger);

/**
 * Status logger for high-priority messages that bypass log level filtering.
 * Always logs at info level regardless of LOG_LEVEL environment variable.
 */
const StatusLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ message, timestamp, childLabel }) => {
      return `${timestamp} | status | ${childLabel} | ${message}`;
    }),
    winston.format.align(),
  ),
  transports: [new winston.transports.Console()],
});

winston.add(StatusLogger);

/**
 * Icon-enabled logger interface providing structured logging methods with visual indicators.
 * All methods support optional prefixes for contextual information like account:region identifiers.
 *
 * @example
 * ```typescript
 * const logger = createLogger(['service-name']);
 *
 * // Basic logging with icons
 * logger.info('Operation completed successfully');           // ℹ️  Operation completed successfully
 * logger.warn('Rate limit approaching');                     // ⚠️  Rate limit approaching
 * logger.error('Authentication failed');                     // ❌  Authentication failed
 *
 * // Process lifecycle logging
 * logger.processStart('Starting deployment');               // 🚀  Starting deployment
 * logger.processEnd('Deployment completed');                // ✅  Deployment completed
 *
 * // AWS API operation logging
 * logger.commandExecution('EnableMacieCommand', { ... });   // ℹ️  Executing EnableMacieCommand with arguments: {...}
 * logger.commandSuccess('EnableMacieCommand', { ... });     // ℹ️  Successfully executed EnableMacieCommand with arguments: {...}
 * logger.dryRun('EnableMacieCommand', { ... });             // 🔍  Dry run is true, so not executing EnableMacieCommand
 *                                                           // 🔍  Would have executed EnableMacieCommand with arguments: {...}
 *
 * // Contextual logging with prefixes
 * logger.info('Macie enabled successfully', 'Account1:us-east-1');  // ℹ️  [Account1:us-east-1] Macie enabled successfully
 * ```
 */
export interface IconLogger {
  /** Log informational message with info icon (ℹ️) */
  info(message: string, prefix?: string): void;
  /** Log warning message with warning icon (⚠️) */
  warn(message: string, prefix?: string): void;
  /** Log error message with error icon (❌) */
  error(message: string, prefix?: string): void;
  /** Log process start message with rocket icon (🚀) */
  processStart(message: string, prefix?: string): void;
  /** Log process completion message with checkmark icon (✅) */
  processEnd(message: string, prefix?: string): void;
  /** Log dry run operation with magnifying glass icon (🔍) */
  dryRun(commandName: string, parameters: Record<string, unknown>, prefix?: string): void;
  /** Log AWS command execution with info icon (ℹ️) */
  commandExecution(commandName: string, parameters: Record<string, unknown>, prefix?: string): void;
  /** Log successful AWS command completion with info icon (ℹ️) */
  commandSuccess(commandName: string, parameters: Record<string, unknown>, prefix?: string): void;
}

/**
 * Internal helper function for standardized message logging with optional prefixes.
 * Handles message formatting and delegates to the appropriate Winston logger method.
 *
 * @param message - The message to log
 * @param level - Log level (info, warn, error)
 * @param logger - Winston logger instance to use
 * @param prefix - Optional prefix to prepend to message (typically account:region format)
 */
function logMessage(message: string, level: 'info' | 'warn' | 'error', logger: winston.Logger, prefix?: string): void {
  const formattedMessage = prefix ? `[${prefix}] ${message}` : message;
  logger[level](formattedMessage);
}

/**
 * Creates an icon-enabled logger with specified labels for contextual identification.
 * The logger provides visual icons for different message types and supports optional
 * prefixes for additional context like account and region information.
 *
 * @param logInfo - Array of strings to create hierarchical logger labels (e.g., ['macie', 'enable'])
 * @returns IconLogger instance with icon-enhanced logging methods
 *
 * @example
 * ```typescript
 * // Create service-specific logger
 * const macieLogger = createLogger(['macie']);
 * macieLogger.info('Starting Macie configuration');
 * // Output: 2023-11-01 10:30:45.123 | info | macie | ℹ️  Starting Macie configuration
 *
 * // Create hierarchical logger
 * const detailedLogger = createLogger(['security-services', 'macie', 'enable']);
 * detailedLogger.processStart('Beginning account enablement');
 * // Output: 2023-11-01 10:30:45.123 | info | security-services | macie | enable | 🚀  Beginning account enablement
 *
 * // Use with contextual prefixes
 * const logger = createLogger(['batch-processor']);
 * logger.info('Processing account batch', 'Management:us-east-1');
 * // Output: 2023-11-01 10:30:45.123 | info | batch-processor | ℹ️  [Management:us-east-1] Processing account batch
 *
 * // AWS API operation logging
 * logger.commandExecution('EnableMacieCommand', {
 *   findingPublishingFrequency: 'FIFTEEN_MINUTES'
 * }, 'Account123:us-west-2');
 * // Output: 2023-11-01 10:30:45.123 | info | batch-processor | ℹ️  [Account123:us-west-2] Executing EnableMacieCommand with arguments: {"findingPublishingFrequency":"FIFTEEN_MINUTES"}
 *
 * // Dry run logging
 * logger.dryRun('CreateMemberCommand', { accountId: '123456789012' });
 * // Output: 2023-11-01 10:30:45.123 | info | batch-processor | 🔍  Dry run is true, so not executing CreateMemberCommand
 * //         2023-11-01 10:30:45.123 | info | batch-processor | 🔍  Would have executed CreateMemberCommand with arguments: {"accountId":"123456789012"}
 * ```
 */
export const createLogger = (logInfo: string[]): IconLogger => {
  const logInfoString = logInfo.join(' | ');
  const baseLogger = Logger.child({ childLabel: logInfoString });

  return {
    info: (message: string, prefix?: string) => {
      const iconMessage = `ℹ️  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    warn: (message: string, prefix?: string) => {
      const iconMessage = `⚠️  ${message}`;
      logMessage(iconMessage, 'warn', baseLogger, prefix);
    },

    error: (message: string, prefix?: string) => {
      const iconMessage = `❌  ${message}`;
      logMessage(iconMessage, 'error', baseLogger, prefix);
    },

    processStart: (message: string, prefix?: string) => {
      const iconMessage = `🚀  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    processEnd: (message: string, prefix?: string) => {
      const iconMessage = `✅  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    dryRun: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const dryRunIcon = `🔍`;
      logMessage(`${dryRunIcon}  Dry run is true, so not executing ${commandName}`, 'info', baseLogger, prefix);
      logMessage(
        `${dryRunIcon}  Would have executed ${commandName} with arguments: ${JSON.stringify(parameters)}`,
        'info',
        baseLogger,
        prefix,
      );
    },

    commandExecution: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const iconMessage = `ℹ️  Executing ${commandName} with arguments: ${JSON.stringify(parameters)}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    commandSuccess: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const iconMessage = `ℹ️  Successfully executed ${commandName} with arguments: ${JSON.stringify(parameters)}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },
  };
};

/**
 * Creates an icon-enabled status logger for high-priority messages that bypass log level filtering.
 * Status loggers always output messages regardless of the LOG_LEVEL environment variable,
 * making them suitable for deployment status, critical alerts, and user-facing notifications.
 *
 * @param logInfo - Array of strings to create hierarchical logger labels (must not be empty)
 * @returns IconLogger instance configured for high-priority status messages
 *
 * @throws {Error} When logInfo is empty or undefined
 *
 * @example
 * ```typescript
 * // Create deployment status logger
 * const deploymentLogger = createStatusLogger(['deployment']);
 * deploymentLogger.info('Phase 1: Infrastructure deployment completed');
 * // Output: 2023-11-01 10:30:45.123 | status | deployment | ℹ️  Phase 1: Infrastructure deployment completed
 *
 * // Create module status logger
 * const moduleLogger = createStatusLogger(['macie-module']);
 * moduleLogger.processStart('Starting Macie module execution');
 * moduleLogger.processEnd('Macie module completed successfully');
 * // Output: 2023-11-01 10:30:45.123 | status | macie-module | 🚀  Starting Macie module execution
 * //         2023-11-01 10:30:45.123 | status | macie-module | ✅  Macie module completed successfully
 *
 * // Critical error logging
 * const criticalLogger = createStatusLogger(['system', 'critical']);
 * criticalLogger.error('Failed to assume role in management account');
 * // Output: 2023-11-01 10:30:45.123 | status | system | critical | ❌  Failed to assume role in management account
 *
 * // Error handling for invalid input
 * try {
 *   const invalidLogger = createStatusLogger([]);
 * } catch (error) {
 *   console.error('Error: createStatusLogger requires at least one log info item');
 * }
 * ```
 */
export const createStatusLogger = (logInfo: string[]): IconLogger => {
  if (!logInfo || logInfo.length === 0) {
    throw new Error('createStatusLogger requires at least one log info item');
  }
  const logInfoString = logInfo.join(' | ');
  const baseLogger = StatusLogger.child({ childLabel: logInfoString });

  return {
    info: (message: string, prefix?: string) => {
      const iconMessage = `ℹ️  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    warn: (message: string, prefix?: string) => {
      const iconMessage = `⚠️  ${message}`;
      logMessage(iconMessage, 'warn', baseLogger, prefix);
    },

    error: (message: string, prefix?: string) => {
      const iconMessage = `❌  ${message}`;
      logMessage(iconMessage, 'error', baseLogger, prefix);
    },

    processStart: (message: string, prefix?: string) => {
      const iconMessage = `🚀  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    processEnd: (message: string, prefix?: string) => {
      const iconMessage = `✅  ${message}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    dryRun: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const dryRunIcon = `🔍`;
      logMessage(`${dryRunIcon}  Dry run is true, so not executing ${commandName}`, 'info', baseLogger, prefix);
      logMessage(
        `${dryRunIcon}  Would have executed ${commandName} with arguments: ${JSON.stringify(parameters)}`,
        'info',
        baseLogger,
        prefix,
      );
    },

    commandExecution: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const iconMessage = `ℹ️  Executing ${commandName} with arguments: ${JSON.stringify(parameters)}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },

    commandSuccess: (commandName: string, parameters: Record<string, unknown>, prefix?: string) => {
      const iconMessage = `ℹ️  Successfully executed ${commandName} with arguments: ${JSON.stringify(parameters)}`;
      logMessage(iconMessage, 'info', baseLogger, prefix);
    },
  };
};

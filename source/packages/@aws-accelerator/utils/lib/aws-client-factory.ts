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

import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';
import * as winston from 'winston';
import { setRetryStrategy } from './retry-strategy';
import { createLogger } from './logger';
import { isThrottlingError } from './throttle';

/**
 * Options for the SDK logging middleware.
 */
export interface LoggingMiddlewareOptions {
  /** Winston logger instance (typically from createLogger) */
  logger: winston.Logger;
  /** Additional context strings prepended to each log line (e.g. account ID, region) */
  loggingContext?: string[];
}

/**
 * Options for {@link AwsClientFactory.create}.
 */
export interface AwsClientFactoryOptions {
  /** @default process.env['AWS_REGION'] */
  readonly region?: string;
  /** @default process.env['SOLUTION_ID'] */
  readonly customUserAgent?: string;
  /**
   * Explicit credentials — either a static identity or an async provider function.
   * Omit to use the SDK default credential chain.
   *
   * Static: `{ accessKeyId, secretAccessKey, sessionToken? }`
   * Provider: `CachingCredentialProvider.get().forRole(account, role, region)`
   */
  readonly credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
  /** Endpoint override for partition-specific endpoints (e.g. STS in isolated regions). */
  readonly endpoint?: string;
  /** @default true */
  readonly useRetryStrategy?: boolean;
  /** @default true */
  readonly enableLogging?: boolean;
  /** Labels merged with ['aws-client'] to build a logger. Ignored when `logger` is set. */
  readonly logLabels?: string[];
  /** Logger instance from createLogger(). When set, `logLabels` is ignored. */
  readonly logger?: ReturnType<typeof createLogger>;
  /** Context strings prepended to every log line (e.g. ['123456789012', 'us-east-1']). */
  readonly loggingContext?: string[];
}

/** Any AWS SDK v3 client constructor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AwsClientConstructor<T> = new (config: any) => T;

/**
 * Factory for creating standardized AWS SDK v3 clients.
 *
 * Applies the LZA retry strategy, custom user agent, credential handling,
 * and request/response logging middleware in one call.
 *
 * @example
 * ```typescript
 * import { S3Client } from '@aws-sdk/client-s3';
 * import { AwsClientFactory, CachingCredentialProvider } from '@aws-accelerator/utils';
 *
 * // Same-account — uses default credential chain
 * const s3 = AwsClientFactory.create(S3Client);
 *
 * // Cross-account — uses CachingCredentialProvider
 * const crossAccountS3 = AwsClientFactory.create(S3Client, {
 *   region: 'us-east-1',
 *   credentials: CachingCredentialProvider.get().forRole('123456789012', 'MyRole', 'us-east-1'),
 * });
 *
 * // Static credentials
 * const sts = AwsClientFactory.create(STSClient, {
 *   region: 'us-east-1',
 *   credentials: { accessKeyId: '...', secretAccessKey: '...', sessionToken: '...' },
 *   logLabels: ['my-module'],
 *   loggingContext: ['123456789012', 'us-east-1'],
 * });
 * ```
 */
export class AwsClientFactory {
  /**
   * Create a configured AWS SDK v3 client with logging middleware applied.
   *
   * @param ClientClass - SDK client constructor (e.g. S3Client, STSClient)
   * @param options - Configuration overrides
   */
  static create<T>(ClientClass: AwsClientConstructor<T>, options: AwsClientFactoryOptions = {}): T {
    const {
      region = process.env['AWS_REGION'],
      customUserAgent = process.env['SOLUTION_ID'] ?? '',
      credentials,
      endpoint,
      useRetryStrategy = true,
      enableLogging = true,
      logLabels = [],
      logger,
      loggingContext = [],
    } = options;

    const client = new ClientClass(
      AwsClientFactory.buildConfig({ region, customUserAgent, credentials, endpoint, useRetryStrategy }),
    );

    if (enableLogging) {
      const resolvedLogger = logger ?? createLogger(['aws-client', ...logLabels]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).middlewareStack.add(
        AwsClientFactory.createLoggingMiddleware(client, { logger: resolvedLogger, loggingContext }),
        { step: 'finalizeRequest' },
      );
    }

    return client;
  }

  /**
   * Build the SDK logging middleware function.
   *
   * Success is logged at `info`, retryable/throttling failures at `warn`
   * (they're expected at scale and handled by the retry strategy),
   * and non-retryable failures at `error`. All include client name,
   * command name, request ID, duration, and request input.
   */

  private static createLoggingMiddleware(_client: unknown, options: LoggingMiddlewareOptions) {
    const { logger, loggingContext = [] } = options;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
    return (next: Function, context: Record<string, any>) => async (args: Record<string, any>) => {
      const { clientName, commandName, requestId } = context;
      const startTime = Date.now();
      const baseMetadata = [clientName, commandName];
      const requestInput = JSON.stringify(args?.['input'] || {});

      try {
        const result = await next(args);
        const duration = Date.now() - startTime;
        const resolvedRequestId = result.response?.headers?.['x-amzn-requestid'] || requestId || 'no-request-id';
        const meta = [...loggingContext, ...baseMetadata, resolvedRequestId].join(' | ');

        logger.info(`${meta} | Success | ${duration}ms | Request: ${requestInput}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorRequestId = (error as any)?.$metadata?.requestId || requestId || 'no-request-id';
        const meta = [...loggingContext, ...baseMetadata, errorRequestId].join(' | ');
        const level = isThrottlingError(error) ? 'warn' : 'error';

        logger[level](`${meta} | Error | ${duration}ms | ${error} | Request: ${requestInput}`);
        throw error;
      }
    };
  }

  /**
   * Build the SDK client configuration object, omitting falsy optional values.
   */
  private static buildConfig(params: {
    region?: string;
    customUserAgent: string;
    credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
    endpoint?: string;
    useRetryStrategy: boolean;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {};

    if (params.region) config['region'] = params.region;
    if (params.customUserAgent) config['customUserAgent'] = params.customUserAgent;
    if (params.endpoint) config['endpoint'] = params.endpoint;
    if (params.useRetryStrategy) config['retryStrategy'] = setRetryStrategy();
    if (params.credentials) {
      config['credentials'] = params.credentials;
    }

    return config;
  }
}

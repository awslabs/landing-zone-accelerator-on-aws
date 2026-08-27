import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { monitorEventLoopDelay } from 'perf_hooks';
import { createLogger } from './logger';
import { setRetryStrategy } from './retry-strategy';

const logger = createLogger(['caching-credential-provider']);

/** @internal Cached credential entry with precomputed expiration timestamp. */
interface CachedCredentials {
  credentials: AwsCredentialIdentity;
  expiration: number;
}

/** Time in milliseconds before expiration to trigger a refresh. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Configuration options for initializing the provider. */
export interface CachingCredentialProviderOptions {
  /** AWS partition (e.g. "aws", "aws-us-gov", "aws-cn", "aws-iso"). */
  partition: string;
  /** List of AWS regions to create STS clients for. */
  regions: string[];
  /** Optional base credential provider for authenticating AssumeRole calls. */
  baseCredentials?: AwsCredentialIdentityProvider;
  /** Session name prefix used in AssumeRole calls. Defaults to "cached". */
  sessionName?: string;
  /** Enable debug logging for event loop delay, inflight requests, and cache stats. */
  enableDebug?: boolean;
  /** Max concurrent sockets per STS regional client. Defaults to 10. */
  maxSockets?: number;
}

let instance: CachingCredentialProvider | null = null;

/**
 * A singleton credential provider that caches AWS STS AssumeRole credentials
 * in memory with automatic background refresh.
 *
 * Designed to eliminate redundant STS calls across a codebase by providing
 * a single shared cache keyed by `accountId:roleName:region`.
 *
 * STS clients are pre-created per region at init time, distributing all
 * AssumeRole calls across regional endpoints to prevent throttling.
 *
 * @example
 * ```typescript
 * CachingCredentialProvider.init({
 *   partition: "aws",
 *   regions: ["us-east-1", "us-west-2", "ca-central-1"],
 *   baseCredentials: fromIni({ profile: "base" }),
 * });
 *
 * const provider = CachingCredentialProvider.get();
 * const s3 = new S3Client({
 *   region: "us-east-1",
 *   credentials: provider.forRole("123456789012", "MyRole", "us-east-1"),
 * });
 * ```
 */
export class CachingCredentialProvider {
  private cache = new Map<string, CachedCredentials>();
  private pending = new Map<string, Promise<AwsCredentialIdentity>>();
  private stsClients = new Map<string, STSClient>();
  private refreshTimers = new Map<string, NodeJS.Timeout>();
  private partition: string;
  private sessionName: string;
  private debug: boolean;
  private maxSockets: number;
  private debugTimer?: NodeJS.Timeout;
  private eventLoopMonitor?: ReturnType<typeof monitorEventLoopDelay>;
  private inflightCount = 0;
  private totalAssumeRoleCalls = 0;
  private cacheHits = 0;

  private constructor(options: CachingCredentialProviderOptions) {
    this.partition = options.partition;
    this.sessionName = options.sessionName ?? 'cached';
    this.debug = options.enableDebug ?? false;
    this.maxSockets = options.maxSockets ?? 10;
    for (const region of options.regions) {
      this.stsClients.set(region, this.createStsClient(region, options.baseCredentials));
    }
    if (this.debug) {
      this.startDebugMonitor();
    }
  }

  /**
   * Starts periodic debug logging for event loop delay, inflight requests, and cache stats.
   */
  private startDebugMonitor(): void {
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopMonitor.enable();

    this.debugTimer = setInterval(() => {
      const h = this.eventLoopMonitor;
      if (!h) return;
      logger.debug(
        `event-loop: min=${(h.min / 1e6).toFixed(1)}ms max=${(h.max / 1e6).toFixed(1)}ms mean=${(h.mean / 1e6).toFixed(1)}ms p99=${(h.percentile(99) / 1e6).toFixed(1)}ms | ` +
          `inflight=${this.inflightCount} pending-keys=${this.pending.size} | ` +
          `cache-size=${this.cache.size} cache-hits=${this.cacheHits} sts-calls=${this.totalAssumeRoleCalls}`,
      );
      h.reset();
    }, 5000);
    this.debugTimer.unref();
  }

  /**
   * Creates an STS client for a region with socket limits applied.
   */
  private createStsClient(region: string, baseCredentials?: AwsCredentialIdentityProvider): STSClient {
    return new STSClient({
      region,
      customUserAgent: process.env['SOLUTION_ID'] ?? '',
      retryStrategy: setRetryStrategy(),
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 20_000,
        socketTimeout: 20_000,
        httpsAgent: { maxSockets: this.maxSockets },
      }),
      ...(baseCredentials && { credentials: baseCredentials }),
    });
  }

  /**
   * Initializes the singleton instance. Subsequent calls are no-ops.
   *
   * @param options - Configuration with regions and optional base credentials.
   * @returns The singleton instance.
   */
  static init(options: CachingCredentialProviderOptions): CachingCredentialProvider {
    if (!instance) {
      instance = new CachingCredentialProvider(options);
    }
    return instance;
  }

  /**
   * Adds a region to the provider if not already configured.
   * Creates a new STS client for the region.
   */
  addRegion(region: string): void {
    if (this.stsClients.has(region)) return;
    this.stsClients.set(region, this.createStsClient(region));
  }

  /**
   * Adds multiple regions to the provider.
   */
  addRegions(regions: string[]): void {
    for (const region of regions) {
      this.addRegion(region);
    }
  }
  /**
   * Returns the STS client for a given region.
   * Useful for callers that need to make direct STS calls (e.g. GetCallerIdentity)
   * through the provider's socket-limited clients.
   *
   * @throws Error if the region is not configured.
   */
  getStsClient(region: string): STSClient {
    const client = this.stsClients.get(region);
    if (!client) {
      throw new Error(`Region "${region}" not configured — add it to the regions list in init()`);
    }
    return client;
  }

  /**
   * Returns the singleton instance.
   *
   * @throws Error if {@link init} has not been called.
   */
  static get(): CachingCredentialProvider {
    if (!instance) {
      throw new Error('CachingCredentialProvider not initialized — call init() first');
    }
    return instance;
  }

  /**
   * Returns an {@link AwsCredentialIdentityProvider} that resolves credentials
   * for the given role, account, and region. Compatible with all AWS SDK v3 clients.
   *
   * @param accountId - The AWS account ID to assume the role in.
   * @param roleName - The IAM role name to assume (not the full ARN).
   * @param region - The AWS region for the STS endpoint.
   * @returns A credential provider function for use with SDK v3 clients.
   * @throws Error if the region was not included in the init() regions list.
   */
  forRole(accountId: string, roleName: string, region: string): AwsCredentialIdentityProvider {
    if (!this.stsClients.has(region)) {
      throw new Error(`Region "${region}" not configured — add it to the regions list in init()`);
    }
    return () => this.resolve(accountId, roleName, region);
  }

  /**
   * Clears all cached credentials, cancels background refresh timers,
   * and destroys the singleton instance. A new instance can be created
   * by calling {@link init} again.
   */
  shutdown(): void {
    if (this.debugTimer) {
      clearInterval(this.debugTimer);
      this.debugTimer = undefined;
    }
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable();
      this.eventLoopMonitor = undefined;
    }
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.cache.clear();
    this.pending.clear();
    this.stsClients.clear();
    instance = null;
  }

  /**
   * Generates a unique cache key for a role/account/region combination.
   */
  private cacheKey(accountId: string, roleName: string, region: string): string {
    return `${accountId}:${roleName}:${region}`;
  }

  /**
   * Schedules a background refresh that fires before credentials expire.
   * If a timer already exists for this key, it is replaced.
   * Timers are unref'd so they don't prevent process exit.
   */
  private scheduleRefresh(accountId: string, roleName: string, region: string, key: string, expiration: number): void {
    const existing = this.refreshTimers.get(key);
    if (existing) clearTimeout(existing);

    const refreshAt = expiration - REFRESH_BUFFER_MS - Date.now();
    if (refreshAt <= 0) return;

    const timer = setTimeout(async () => {
      this.refreshTimers.delete(key);
      try {
        await this.refresh(accountId, roleName, region, key);
      } catch {
        // Silent failure — next on-demand access will retry
      }
    }, refreshAt);

    timer.unref();
    this.refreshTimers.set(key, timer);
  }

  /**
   * Resolves credentials for a role, returning cached credentials if valid
   * or triggering a refresh. Concurrent calls for the same key are deduplicated
   * so only one STS call is made.
   */
  private async resolve(accountId: string, roleName: string, region: string): Promise<AwsCredentialIdentity> {
    const key = this.cacheKey(accountId, roleName, region);

    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiration - REFRESH_BUFFER_MS) {
      this.cacheHits++;
      return cached.credentials;
    }

    let inflight = this.pending.get(key);
    if (!inflight) {
      inflight = this.refresh(accountId, roleName, region, key);
      this.pending.set(key, inflight);
    }

    try {
      return await inflight;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Performs an STS AssumeRole call, caches the result, and schedules
   * the next background refresh.
   *
   * @throws Error if AssumeRole returns incomplete credentials.
   */
  private async refresh(
    accountId: string,
    roleName: string,
    region: string,
    key: string,
  ): Promise<AwsCredentialIdentity> {
    const sts = this.stsClients.get(region)!;

    this.inflightCount++;
    this.totalAssumeRoleCalls++;
    try {
      const { Credentials } = await sts.send(
        new AssumeRoleCommand({
          RoleArn: `arn:${this.partition}:iam::${accountId}:role/${roleName}`,
          RoleSessionName: `${this.sessionName}-${accountId}-${Date.now()}`,
        }),
      );

      if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey) {
        throw new Error(`Failed to assume role ${roleName} in account ${accountId}`);
      }

      const expiration = Credentials.Expiration?.getTime() ?? Date.now() + 3600_000;

      const credentials: AwsCredentialIdentity = {
        accessKeyId: Credentials.AccessKeyId,
        secretAccessKey: Credentials.SecretAccessKey,
        sessionToken: Credentials.SessionToken,
        expiration: Credentials.Expiration,
      };

      this.cache.set(key, { credentials, expiration });
      this.scheduleRefresh(accountId, roleName, region, key, expiration);

      return credentials;
    } finally {
      this.inflightCount--;
    }
  }
}

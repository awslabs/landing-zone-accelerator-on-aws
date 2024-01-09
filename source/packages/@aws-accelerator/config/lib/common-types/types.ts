/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { either } from 'fp-ts/lib/Either';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { IPv4CidrRange } from 'ip-num';
import { Regions } from '@aws-accelerator/utils';

export type { Any, AnyProps, Mixed, Props, TypeC, TypeOf } from 'io-ts';
export {
  array,
  Array,
  ArrayType,
  boolean,
  BooleanType,
  dictionary,
  DictionaryType,
  interface,
  InterfaceType,
  intersection,
  IntersectionType,
  literal,
  LiteralType,
  number,
  NumberType,
  partial,
  PartialType,
  record,
  string,
  StringType,
  type,
  Type,
  undefined,
  UndefinedType,
  union,
  UnionType,
  unknown,
  UnknownType,
} from 'io-ts';

export type Json = boolean | number | string | null | JsonArray | JsonRecord;

export interface JsonRecord {
  readonly [key: string]: Json;
}

export type JsonArray = ReadonlyArray<Json>;

export const JsonArray: t.Type<JsonArray> = t.recursion('JsonArray', () => t.readonlyArray(Json));

export const JsonRecord: t.Type<JsonRecord> = t.recursion('JsonRecord', () => t.record(t.string, Json));

export const Json: t.Type<Json> = t.union([t.boolean, t.number, t.string, t.null, JsonArray, JsonRecord], 'Json');

export class CidrType extends t.Type<IPv4CidrRange, string, unknown> {
  constructor(name?: string) {
    super(
      name ?? 'Cidr',
      (value): value is IPv4CidrRange => value instanceof IPv4CidrRange,
      (str, context) =>
        either.chain(t.string.validate(str, context), (s: string) => {
          try {
            return t.success(IPv4CidrRange.fromCidr(s));
          } catch (e) {
            return t.failure(s, context, `Value ${s} should be a CIDR range.`);
          }
        }),
      c => c.toCidrString(),
    );
  }
}

export class DefaultedType<T extends t.Any> extends t.Type<T['_A'], T['_O'], T['_I']> {
  constructor(readonly type: T, readonly defaultValue: T['_A'], name?: string) {
    super(
      name ?? `Default<${type.name}>`,
      type.is,
      (u, c) => (u == null ? t.success(defaultValue) : type.validate(u, c)),
      type.encode,
    );
  }
}

export class OptionalType<T extends t.Any> extends t.Type<
  T['_A'] | undefined,
  T['_O'] | undefined,
  T['_I'] | undefined
> {
  constructor(readonly type: T, name?: string) {
    super(
      name ?? `Optional<${type.name}>`,
      (u): u is T['_A'] | undefined => (u == null ? true : type.is(u)),
      (u, c) => (u == null ? t.success(undefined) : type.validate(u, c)),
      type.encode,
    );
  }
}

export type WithSize = number | string | any[] | Map<any, any> | Set<any>;

function getSize(withSize: WithSize): number {
  if (typeof withSize === 'number') {
    return withSize;
  } else if (typeof withSize === 'string') {
    return withSize.length;
  } else if (Array.isArray(withSize)) {
    return withSize.length;
  } else if (withSize instanceof Set) {
    return withSize.size;
  } else if (withSize instanceof Map) {
    return withSize.size;
  }
  throw new Error(`Unsupported size value ${withSize}`);
}

export interface SizedTypeProps {
  readonly min?: number;
  readonly max?: number;
  readonly name?: string;
  readonly errorMessage?: string;
}

export class SizedType<A extends WithSize, T extends t.Type<A>> extends t.Type<T['_A'], T['_O'], T['_I']> {
  readonly min?: number;
  readonly max?: number;

  constructor(readonly type: T, readonly props: SizedTypeProps = {}) {
    super(
      props.name ?? `Sized<${type.name}>`,
      type.is,
      (u, c) =>
        either.chain(type.validate(u, c), (s: A) => {
          const size = getSize(s);
          const minValid = !props.min || (props.min && size >= props.min);
          const maxValid = !props.max || (props.max && size <= props.max);
          if (minValid && maxValid) {
            return t.success(s);
          } else {
            const errorMessage =
              props.errorMessage ?? `${'Value'} should be of size [${props.min ?? '-∞'}, ${props.max ?? '∞'}]`;
            return t.failure(s, c, errorMessage);
          }
        }),
      type.encode,
    );
    this.min = props.min;
    this.max = props.max;
  }
}
export interface EnumTypeProps {
  readonly name: string;
  readonly errorMessage?: string;
}

export class EnumType<T extends string | number> extends t.Type<T> {
  readonly _tag = 'EnumType' as const;

  constructor(readonly values: ReadonlyArray<T>, props: EnumTypeProps) {
    super(
      props.name,
      (u): u is T => values.some(v => v === u),
      (u, c) =>
        this.is(u)
          ? t.success(u)
          : t.failure(u, c, props.errorMessage ?? `Value should be one of "${values.join('", "')}"`),
      t.identity,
    );
  }
}

export type Definition<P extends t.Props> = t.TypeC<P> & { definitionName: string };

export function definition<P extends t.Props>(name: string, props: P): Definition<P> {
  return Object.assign(t.type(props, name), { definitionName: name });
}

export function isDefinition<P extends t.Props>(type: t.TypeC<P>): type is Definition<P> {
  return 'definitionName' in type;
}

export function defaulted<T extends t.Any>(type: T, defaultValue: T['_A'], name?: string): DefaultedType<T> {
  return new DefaultedType<T>(type, defaultValue, name);
}

export function sized<A extends WithSize, T extends t.Type<A> = t.Type<A>>(
  type: T,
  props: SizedTypeProps = {},
): SizedType<A, T> {
  return new SizedType<A, T>(type, props);
}

/**
 * Create an enumeration type.
 */
export function enums<T extends string | number>(
  name: string,
  values: ReadonlyArray<T>,
  errorMessage?: string,
): EnumType<T> {
  return new EnumType<T>(values, { name, errorMessage });
}

export function optional<T extends t.Any>(wrapped: T, name?: string): OptionalType<T> {
  return new OptionalType(wrapped, name);
}

/**
 * nonEmptyString comment
 */
export const nonEmptyString = sized<string>(t.string, {
  min: 1,
  errorMessage: 'Value can not be empty.',
});

export const cidr = new CidrType();
export type Cidr = t.TypeOf<typeof cidr>;

export const region = enums('Region', Regions, 'Value should be an AWS region.');
export type Region = t.TypeOf<typeof region>;

export const deploymentTargets = t.interface({
  organizationalUnits: optional(t.array(nonEmptyString)),
  accounts: optional(t.array(nonEmptyString)),
  excludedRegions: optional(t.array(nonEmptyString)),
  excludedAccounts: optional(t.array(nonEmptyString)),
});

/**
 * Deployment targets configuration.
 * Deployment targets is an accelerator-specific
 * configuration object that can be used for
 * resources provisioned by the accelerator.
 * Deployment targets allow you to specify
 * multiple accounts and/or organizational units (OUs)
 * as targets for resource deployment.
 *
 * The following example would deploy a resource
 * to all accounts in the organization except the
 * Management account:
 * @example
 * ```
 * deploymentTargets:
 *   organizationalUnits:
 *     - Root
 *   excludedAccounts:
 *     - Management
 * ```
 */
export class DeploymentTargets implements t.TypeOf<typeof deploymentTargets> {
  /**
   * Use this property to define one or more organizational units (OUs)
   * as a deployment target. Resources are provisioned in each account
   * contained within the OU.
   *
   * @remarks
   * Any nested OUs that you would like to deploy resources to must be explicitly
   * defined in this property. Deployment targets will not automatically deploy to
   * nested OUs.
   */
  readonly organizationalUnits: string[] = [];
  /**
   * Use this property to define one or more accounts as a deployment target.
   */
  readonly accounts: string[] = [];
  /**
   * Use this property to explicitly define one or more regions to exclude from deployment.
   *
   * @remarks
   * By default, all regions defined in the `enabledRegions` property of {@link GlobalConfig} are
   * included in `deploymentTargets`.
   */
  readonly excludedRegions: Region[] = [];
  /**
   * Use this property to explicitly define one or more accounts to exclude from deployment.
   */
  readonly excludedAccounts: string[] = [];
}

/**
 * Imported Bucket configuration with S3 managed key encryption.
 */
export const importedS3ManagedEncryptionKeyBucketConfig = t.interface({
  name: nonEmptyString,
  applyAcceleratorManagedBucketPolicy: optional(t.boolean),
});

/**
 * Imported Bucket configuration withS3 managed key encryption.
 *
 * @remarks Use this configuration to use existing bucket, a bucket not created by accelerator solution.
 */
export class ImportedS3ManagedEncryptionKeyBucketConfig
  implements t.TypeOf<typeof importedS3ManagedEncryptionKeyBucketConfig>
{
  /**
   * Imported bucket name
   */
  readonly name: string = '';
  /**
   * Flag indicating Accelerator to apply solution generated policy to imported bucket.
   *
   * @remarks
   * Accelerator solution creates bucket resource policy based on various security services enabled by the solution.
   * Example when macie is enabled, macie service will need access to the bucket,
   * accelerator solution dynamically generate policy statements based on various services require access to the bucket.
   *
   * Default value is false, accelerator managed policy will NOT be applied to bucket resource policy.
   * When external policy files are provided through s3ResourcePolicyAttachments policy files,
   * solution will add policies from the files to the imported bucket resource policy.
   * If no external policy files are provided and value for this parameter is left to false, solution will not make changes to bucket resource policy.
   * When value is set to true, accelerator solution will replace bucket resource policy with accelerator managed policies along with policies from external policy files if provided.
   *
   */
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
}

/**
 * Imported Bucket configuration with CMK enabled.
 */
export const importedCustomerManagedEncryptionKeyBucketConfig = t.interface({
  name: nonEmptyString,
  applyAcceleratorManagedBucketPolicy: optional(t.boolean),
  createAcceleratorManagedKey: optional(t.boolean),
});

/**
 * Imported Bucket configuration with CMK enabled.
 *
 * @remarks Use this configuration to use existing bucket, a bucket not created by accelerator solution.
 */
export class ImportedCustomerManagedEncryptionKeyBucketConfig
  implements t.TypeOf<typeof importedCustomerManagedEncryptionKeyBucketConfig>
{
  /**
   * Imported bucket name
   */
  readonly name: string = '';
  /**
   * Flag indicating Accelerator to apply solution generated policy to imported bucket.
   *
   * @remarks
   * Accelerator solution creates bucket resource policy based on various security services enabled by the solution.
   * Example when macie is enabled, macie service will need access to the bucket,
   * accelerator solution dynamically generate policy statements based on various services require access to the bucket.
   *
   * Default value is false, accelerator managed policy will NOT be applied to bucket resource policy.
   * When external policy files are provided through s3ResourcePolicyAttachments policy files,
   * solution will add policies from the files to the imported bucket resource policy.
   * If no external policy files are provided and value for this parameter is left to false, solution will not make changes to bucket resource policy.
   * When value is set to true, accelerator solution will replace bucket resource policy with accelerator managed policies along with policies from external policy files if provided.
   *
   */
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
  /**
   * Flag indicating solution should create CMK and apply to imported bucket.
   *
   * @remarks
   * When the value is false, solution will not create KSM key, instead existing bucket encryption will be used and modified based on other parameters.
   * When the value is true, solution will create KMS key and apply solution managed policy to the key.
   * Once Accelerator pipeline executed with the value set to true, changing the value back to false, will case stack failure.
   * Set this value to true when this will no longer be changed to false.
   *
   * @default
   * false
   */
  readonly createAcceleratorManagedKey: boolean | undefined = undefined;
}

/**
 * Custom policy overrides configuration for S3 resource
 */
export const customS3ResourcePolicyOverridesConfig = t.interface({
  policy: optional(nonEmptyString),
});

/**
 * Custom policy overrides configuration for S3 resource policy
 *
 * @remarks Use this configuration to use provide files with JSON string to override bucket resource policy.
 */
export class CustomS3ResourcePolicyOverridesConfig implements t.TypeOf<typeof customS3ResourcePolicyOverridesConfig> {
  /**
   * S3 resource policy file
   *
   * @remarks
   * S3 resource policy file containing JSON string with policy statements. Solution will overwrite bucket resource policy with the context of the file.
   */
  readonly policy: string | undefined = undefined;
}

/**
 * Custom policy overrides configuration for S3 resource and KMS
 */
export const customS3ResourceAndKmsPolicyOverridesConfig = t.interface({
  s3Policy: optional(nonEmptyString),
  kmsPolicy: optional(nonEmptyString),
});

/**
 * Custom policy overrides configuration  for S3 resource and KMS
 *
 * @remarks Use this configuration to use provide files with JSON string to override bucket and KSM key policy.
 */
export class CustomS3ResourceAndKmsPolicyOverridesConfig
  implements t.TypeOf<typeof customS3ResourceAndKmsPolicyOverridesConfig>
{
  /**
   * S3 resource policy file
   *
   * @remarks
   * S3 resource policy file containing JSON string with policy statements. Solution will overwrite bucket resource policy with the context of the file.
   */
  readonly s3Policy: string | undefined = undefined;
  /**
   * KSM policy file
   *
   * @remarks
   * S3 bucket encryption policy file containing JSON string with policy statements. Solution will overwrite bucket encryption key policy with the context of the file.
   */
  readonly kmsPolicy: string | undefined = undefined;
}

export const storageClass = enums('storageClass', [
  'DEEP_ARCHIVE',
  'GLACIER',
  'GLACIER_IR',
  'STANDARD_IA',
  'INTELLIGENT_TIERING',
  'ONEZONE_IA',
  'Value should be an AWS S3 Storage Class.',
]);
export type StorageClass = t.TypeOf<typeof storageClass>;

export const transition = t.interface({
  storageClass: storageClass,
  transitionAfter: t.number,
});

export type Transition = t.TypeOf<typeof transition>;

export const lifecycleRuleConfig = t.interface({
  abortIncompleteMultipartUpload: optional(t.number),
  enabled: optional(t.boolean),
  expiration: optional(t.number),
  expiredObjectDeleteMarker: optional(t.boolean),
  id: optional(t.string),
  noncurrentVersionExpiration: optional(t.number),
  noncurrentVersionTransitions: optional(t.array(transition)),
  transitions: optional(t.array(transition)),
  prefix: optional(nonEmptyString),
});

export const resourcePolicyStatement = t.interface({
  policy: t.string,
});

export type ResourcePolicyStatement = t.TypeOf<typeof resourcePolicyStatement>;

/**
 * S3 bucket life cycle rules object.
 *
 * @example
 * ```
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycle-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: ElbLifecycle-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 * ```
 */
export class LifeCycleRule implements t.TypeOf<typeof lifecycleRuleConfig> {
  /**
   * Specifies a lifecycle rule that aborts incomplete multipart uploads to an Amazon S3 bucket.
   */
  readonly abortIncompleteMultipartUpload: number = 1;
  /**
   * Whether this rule is enabled.
   */
  readonly enabled: boolean = true;
  /**
   * Indicates the number of days after creation when objects are deleted from Amazon S3 and Amazon Glacier.
   */
  readonly expiration: number | undefined = undefined;
  /**
   * Indicates whether Amazon S3 will remove a delete marker with no noncurrent versions.
   * If set to true, the delete marker will be expired.
   */
  readonly expiredObjectDeleteMarker: boolean = false;
  /**
   * Friendly name for the rule. Rule name must be unique.
   */
  readonly id: string = '';
  /**
   * Time between when a new version of the object is uploaded to the bucket and when old versions of the object expire.
   */
  readonly noncurrentVersionExpiration: number = 366;
  /**
   * One or more transition rules that specify when non-current objects transition to a specified storage class.
   */
  readonly noncurrentVersionTransitions: Transition[] = [];
  /**
   * One or more transition rules that specify when an object transitions to a specified storage class.
   */
  readonly transitions: Transition[] = [];
  /**
   * Object key prefix that identifies one or more objects to which this rule applies.
   * @default - Rule applies to all objects
   */
  readonly prefix: string | undefined = undefined;
}

export const shareTargets = t.interface({
  organizationalUnits: optional(t.array(nonEmptyString)),
  accounts: optional(t.array(nonEmptyString)),
});

/**
 * {@link https://docs.aws.amazon.com/ram/latest/userguide/what-is.html | Resource Access Manager (RAM)} share targets configuration.
 * Share targets is an accelerator-specific
 * configuration object that can be used for
 * resources provisioned by the accelerator.
 * Share targets allow you to specify
 * multiple accounts and/or organizational units (OUs)
 * as targets for RAM shares. RAM allows you to securely share
 * resources between accounts and OUs within your organization.
 *
 * The following example would share a resource
 * to all accounts in the organization:
 * @example
 * ```
 * shareTargets:
 *   organizationalUnits:
 *     - Root
 * ```
 */
export class ShareTargets implements t.TypeOf<typeof shareTargets> {
  /**
   * Use this property to define one or more organizational units (OUs)
   * as a share target. Resources can be consumed each account
   * contained within the OU.
   *
   * @remarks
   * Any nested OUs that you would like to share resources to must be explicitly
   * defined in this property. Share targets will not automatically share to
   * nested OUs.
   */
  readonly organizationalUnits: string[] = [];
  /**
   * Use this property to define one or more accounts as a share target.
   */
  readonly accounts: string[] = [];
}

export const allowDeny = enums('AllowDeny', ['allow', 'deny'], 'Value should be allow or deny');
export type AllowDeny = t.TypeOf<typeof allowDeny>;

export const enableDisable = enums('EnableDisable', ['enable', 'disable'], 'Value should be enable or disable');
export type EnableDisable = t.TypeOf<typeof enableDisable>;

export const availabilityZone = enums('AvailabilityZone', ['a', 'b', 'c', 'd', 'e', 'f']);
export type AvailabilityZone = t.TypeOf<typeof availabilityZone>;

export const tag = t.interface({
  key: t.string,
  value: t.string,
});
export class Tag implements t.TypeOf<typeof tag> {
  readonly key: string = '';
  readonly value: string = '';
}

export const cfnParameter = t.interface({
  name: t.string,
  value: t.string,
});

export class CfnParameter implements t.TypeOf<typeof cfnParameter> {
  readonly name: string = '';
  readonly value: string = '';
}

const trafficTypeEnum = enums(
  'Flow LogTrafficType',
  ['ALL', 'ACCEPT', 'REJECT'],
  'Value should be a flow log traffic type',
);

export const logDestinationTypeEnum = enums(
  'LogDestinationTypes',
  ['s3', 'cloud-watch-logs'],
  'Value should be a log destination type',
);

const vpcFlowLogsS3BucketConfig = t.interface({
  lifecycleRules: optional(t.array(lifecycleRuleConfig)),
  overrideS3LogPath: optional(nonEmptyString),
});

const vpcFlowLogsCloudWatchLogsConfig = t.interface({
  retentionInDays: optional(t.number),
  kms: optional(nonEmptyString),
});

const vpcFlowLogsDestinationConfig = t.interface({
  s3: optional(vpcFlowLogsS3BucketConfig),
  cloudWatchLogs: optional(vpcFlowLogsCloudWatchLogsConfig),
});

export const vpcFlowLogsConfig = t.interface({
  trafficType: trafficTypeEnum,
  maxAggregationInterval: t.number,
  destinations: t.array(logDestinationTypeEnum),
  destinationsConfig: optional(vpcFlowLogsDestinationConfig),
  defaultFormat: t.boolean,
  customFields: optional(t.array(nonEmptyString)),
});

export const prefixConfig = t.interface({
  /**
   * Indicates whether or not to add a custom prefix to LZA Default Centralized Logging location.
   * If useCustomPrefix is set to true, logs will be stored in the Centralized Logging Bucket prefix.
   */
  useCustomPrefix: t.boolean,
  /**
   * (Optional) Prefix to be used for Centralized Logging Path
   */
  customOverride: optional(nonEmptyString),
});

/**
 * (Optional) Central Log Bucket Path configuration.
 */
export class PrefixConfig implements t.TypeOf<typeof prefixConfig> {
  /**
   *  Indicates whether or not to add a custom prefix to LZA Default Centralized Logging location.
   *  If useCustomPrefix is set to false, logs will be stored in the default LZA Centralized Logging Bucket prefix.
   */
  readonly useCustomPrefix: boolean = false;

  /**
   * @optional
   * (Optional) Prefix to be used for Centralized Logging Path
   */
  readonly customOverride = undefined;
}

/**
 * VPC flow logs S3 destination bucket configuration.
 *
 */
class VpcFlowLogsS3BucketConfig implements t.TypeOf<typeof vpcFlowLogsS3BucketConfig> {
  /**
   * @optional
   * Flow log destination S3 bucket life cycle rules
   */
  readonly lifecycleRules: LifeCycleRule[] = [];

  /**
   * @optional
   * Flow log destination S3 path. This allows customization of where VPC Flow Logs will be stored in S3.
   * This value currently supports replacements for:
   * ${ACCEL_LOOKUP::VPC_NAME}'
   * ${ACCEL_LOOKUP::ACCOUNT_ID}'
   */
  readonly overrideS3LogPath: string = '';
}

/**
 * VPC flow logs CloudWatch logs destination configuration.
 */
class VpcFlowLogsCloudWatchLogsConfig implements t.TypeOf<typeof vpcFlowLogsCloudWatchLogsConfig> {
  /**
   * @optional
   * CloudWatchLogs retention days
   */
  readonly retentionInDays = 3653;
  /**
   * @optional
   * CloudWatchLogs encryption key name
   */
  readonly kms = undefined;
}

/**
 * VPC flow logs destination configuration.
 */
class VpcFlowLogsDestinationConfig implements t.TypeOf<typeof vpcFlowLogsDestinationConfig> {
  /**
   * S3 Flow log destination configuration
   * Use following configuration to enable S3 flow log destination
   * @example
   * ```
   * destinations:
   *     s3:
   *       enable: true
   *       lifecycleRules: []
   *       s3LogPath: ''
   * ```
   */
  readonly s3: VpcFlowLogsS3BucketConfig = new VpcFlowLogsS3BucketConfig();
  /**
   * CloudWatchLogs Flow log destination configuration
   * Use following configuration to enable CloudWatchLogs flow log destination
   * @example
   * ```
   * destinations:
   *     cloudWatchLogs:
   *       enable: true
   *       retentionInDays: 3653
   * ```
   */
  readonly cloudWatchLogs: VpcFlowLogsCloudWatchLogsConfig = new VpcFlowLogsCloudWatchLogsConfig();
}

/**
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html | Virtual Private Cloud (VPC) flow logs} configuration.
 * Use this configuration to customize VPC flow log output.
 * VPC Flow Logs is a feature that enables you to capture information
 * about the IP traffic going to and from network interfaces in your VPC.
 * Flow log data can be published to the following locations: Amazon CloudWatch Logs, Amazon S3.
 *
 * @example
 * ```
 * vpcFlowLogs:
 *   trafficType: ALL
 *   maxAggregationInterval: 600
 *   destinations:
 *     - s3
 *     - cloud-watch-logs
 *   defaultFormat: false
 *   customFields:
 *     - version
 *     - account-id
 *     - interface-id
 *     - srcaddr
 *     - dstaddr
 *     - srcport
 *     - dstport
 *     - protocol
 *     - packets
 *     - bytes
 *     - start
 *     - end
 *     - action
 *     - log-status
 *     - vpc-id
 *     - subnet-id
 *     - instance-id
 *     - tcp-flags
 *     - type
 *     - pkt-srcaddr
 *     - pkt-dstaddr
 *     - region
 *     - az-id
 *     - pkt-src-aws-service
 *     - pkt-dst-aws-service
 *     - flow-direction
 *     - traffic-path
 * ```
 */
export class VpcFlowLogsConfig implements t.TypeOf<typeof vpcFlowLogsConfig> {
  /**
   * The type of traffic to log.
   *
   * @see {@link trafficTypeEnum}
   */
  readonly trafficType = 'ALL';
  /**
   * The maximum log aggregation interval in seconds.
   */
  readonly maxAggregationInterval: number = 600;
  /**
   * An array of destination serviced for storing logs.
   *
   * @see {@link NetworkConfigTypes.logDestinationTypeEnum}
   */
  readonly destinations: t.TypeOf<typeof logDestinationTypeEnum>[] = ['s3', 'cloud-watch-logs'];
  /**
   * @optional
   * VPC Flow log detonations properties. Use this property to specify S3 and CloudWatchLogs properties
   * @see {@link VpcFlowLogsDestinationConfig}
   */
  readonly destinationsConfig: VpcFlowLogsDestinationConfig = new VpcFlowLogsDestinationConfig();
  /**
   * Enable to use the default log format for flow logs.
   */
  readonly defaultFormat = false;
  /**
   * Custom fields to include in flow log outputs.
   */
  readonly customFields = [
    'version',
    'account-id',
    'interface-id',
    'srcaddr',
    'dstaddr',
    'srcport',
    'dstport',
    'protocol',
    'packets',
    'bytes',
    'start',
    'end',
    'action',
    'log-status',
    'vpc-id',
    'subnet-id',
    'instance-id',
    'tcp-flags',
    'type',
    'pkt-srcaddr',
    'pkt-dstaddr',
    'region',
    'az-id',
    'pkt-src-aws-service',
    'pkt-dst-aws-service',
    'flow-direction',
    'traffic-path',
  ];
}

export type CfnResourceType = {
  /**
   * LogicalId of a resource in Amazon CloudFormation Stack
   * Unique within the template
   */
  logicalResourceId: string;
  /**
   * PhysicalId of a resource in Amazon CloudFormation Stack
   * Use the physical IDs to identify resources outside of AWS CloudFormation templates
   */
  physicalResourceId: string;
  /**
   * The resource type identifies the type of resource that you are declaring
   */
  resourceType: string;
  /**
   * The resourceMetadata holds all resources and properties
   */
  resourceMetadata: { [key: string]: any };
};

export type AseaStackInfo = {
  accountId: string;
  accountKey: string;
  region: string;
  phase: number;
  stackName: string;
  templatePath: string;
  resources: CfnResourceType[];
  nestedStack?: boolean;
};

/**
 * ASEA ResourceTypes used in Resource Mapping
 */
export enum AseaResourceType {
  IAM_POLICY = 'IAM_POLICY',
  IAM_ROLE = 'IAM_ROLE',
  IAM_GROUP = 'IAM_GROUP',
  IAM_USER = 'IAM_USER',
  EC2_VPC = 'EC2_VPC',
  EC2_VPC_CIDR = 'EC2_VPC_CIDR',
  EC2_SUBNET = 'EC2_SUBNET',
  EC2_IGW = 'EC2_VPC_IGW',
  EC2_VPN_GW = 'EC2_VPC_VPN_GW',
  EC2_SECURITY_GROUP = 'EC2_SECURITY_GROUP',
  EC2_SECURITY_GROUP_INGRESS = 'EC2_SECURITY_GROUP_INGRESS',
  EC2_SECURITY_GROUP_EGRESS = 'EC2_SECURITY_GROUP_EGRESS',
  EC2_VPC_PEERING = 'EC2_VPC_PEERING_CONNECTION',
  ROUTE_TABLE = 'ROUTE_TABLE',
  TRANSIT_GATEWAY = 'TRANSIT_GATEWAY',
  TRANSIT_GATEWAY_ROUTE_TABLE = 'TRANSIT_GATEWAY_ROUTE_TABLE',
  TRANSIT_GATEWAY_ROUTE = 'TRANSIT_GATEWAY_ROUTE',
  TRANSIT_GATEWAY_ATTACHMENT = 'TRANSIT_GATEWAY_ATTACHMENT',
  TRANSIT_GATEWAY_PROPAGATION = 'TRANSIT_GATEWAY_PROPAGATION',
  TRANSIT_GATEWAY_ASSOCIATION = 'TRANSIT_GATEWAY_ASSOCIATION',
  NAT_GATEWAY = 'NAT_GATEWAY',
  NFW = 'NETWORK_FIREWALL',
  NFW_POLICY = 'NETWORK_FIREWALL_POLICY',
  NFW_RULE_GROUP = 'NETWORK_FIREWALL_RULE_GROUP',
  VPC_ENDPOINT = 'VPC_ENDPOINT',
  ROUTE_53_PHZ_ID = 'ROUTE_53_PHZ',
  SSM_RESOURCE_DATA_SYNC = 'SSM_RESOURCE_DATA_SYNC',
  SSM_ASSOCIATION = 'SSM_ASSOCIATION',
}

/**
 * Consolidated type for ASEA Resource mapping
 */
export type AseaResourceMapping = {
  accountId: string;
  region: string;
  resourceType: string;
  resourceIdentifier: string;
};

export enum AseaResourceTypePaths {
  IAM = '/iam/',
  VPC = '/network/vpc/',
  VPC_PEERING = '/network/vpcPeering/',
  TRANSIT_GATEWAY = '/network/transitGateways/',
  NETWORK_FIREWALL = '/network/networkFirewall/',
}

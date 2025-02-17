/**
 * The interface that AWS Lambda will invoke your handler with.
 * There are more specialized types for many cases where AWS services
 * invoke your lambda, but you can directly use this type for when you are invoking
 * your lambda directly.
 *
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler<TEvent = any, TResult = any> = (
  event: TEvent,
  context: Context,
  callback: Callback<TResult>,
) => void | Promise<TResult>;

/**
 * {@link Handler} context parameter.
 * See {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html AWS documentation}.
 */
export interface Context {
  callbackWaitsForEmptyEventLoop: boolean;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  identity?: CognitoIdentity | undefined;
  clientContext?: ClientContext | undefined;

  getRemainingTimeInMillis(): number;

  // Functions for compatibility with earlier Node.js Runtime v0.10.42
  // No longer documented, so they are deprecated, but they still work
  // as of the 12.x runtime, so they are not removed from the types.

  /** @deprecated Use handler callback or promise result */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  done(error?: Error, result?: any): void;
  /** @deprecated Use handler callback with first argument or reject a promise result */
  fail(error: Error | string): void;
  /** @deprecated Use handler callback with second argument or resolve a promise result */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  succeed(messageOrObject: any): void;
  // Unclear what behavior this is supposed to have, I couldn't find any still extant reference,
  // and it behaves like the above, ignoring the object parameter.
  /** @deprecated Use handler callback or promise result */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  succeed(message: string, object: any): void;
}

export interface CognitoIdentity {
  cognitoIdentityId: string;
  cognitoIdentityPoolId: string;
}

export interface ClientContext {
  client: ClientContextClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Custom?: any;
  env: ClientContextEnv;
}

export interface ClientContextClient {
  installationId: string;
  appTitle: string;
  appVersionName: string;
  appVersionCode: string;
  appPackageName: string;
}

export interface ClientContextEnv {
  platformVersion: string;
  platform: string;
  make: string;
  model: string;
  locale: string;
}

/**
 * NodeJS-style callback parameter for the {@link Handler} type.
 * Can be used instead of returning a promise, see the
 * {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html AWS documentation}
 * for the handler programming model.
 *
 * @param error
 *   Parameter to use to provide the error payload for a failed lambda execution.
 *   See {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-mode-exceptions.html AWS documentation}
 *   for error handling.
 *   If an Error instance is passed, the error payload uses the `name` property as the `errorType`,
 *   the `message` property as the `errorMessage`, and parses the `stack` property string into
 *   the `trace` array.
 *   For other values, the `errorType` is `typeof value`, the `errorMessage` is `String(value)`, and
 *   `trace` is an empty array.
 *
 * @param result
 *   Parameter to use to provide the result payload for a successful lambda execution.
 *   Pass `null` or `undefined` for the `error` parameter to use this parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Callback<TResult = any> = (error?: Error | string | null, result?: TResult) => void;

export type SNSHandler = Handler<SNSEvent, void>;

// SNS "event"
export interface SNSMessageAttribute {
  Type: string;
  Value: string;
}

export interface SNSMessageAttributes {
  [name: string]: SNSMessageAttribute;
}

export interface SNSMessage {
  SignatureVersion: string;
  Timestamp: string;
  Signature: string;
  SigningCertUrl: string;
  MessageId: string;
  Message: string;
  MessageAttributes: SNSMessageAttributes;
  Type: string;
  UnsubscribeUrl: string;
  TopicArn: string;
  Subject: string;
  Token?: string;
}

export interface SNSEventRecord {
  EventVersion: string;
  EventSubscriptionArn: string;
  EventSource: string;
  Sns: SNSMessage;
}

export interface SNSEvent {
  Records: SNSEventRecord[];
}

// Note, responses are *not* lambda results, they are sent to the event ResponseURL.
export type CloudFormationCustomResourceHandler = Handler<CloudFormationCustomResourceEvent, void>;

export type CloudFormationCustomResourceEvent =
  | CloudFormationCustomResourceCreateEvent
  | CloudFormationCustomResourceUpdateEvent
  | CloudFormationCustomResourceDeleteEvent;

export type CloudFormationCustomResourceResponse =
  | CloudFormationCustomResourceSuccessResponse
  | CloudFormationCustomResourceFailedResponse;

/**
 * CloudFormation Custom Resource event and response
 * http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref.html
 */
export interface CloudFormationCustomResourceEventCommon {
  ServiceToken: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  ResourceType: string;
  ResourceProperties: {
    ServiceToken: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Key: string]: any;
  };
}

export interface CloudFormationCustomResourceCreateEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Create';
}

export interface CloudFormationCustomResourceUpdateEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Update';
  PhysicalResourceId: string;
  OldResourceProperties: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Key: string]: any;
  };
}

export interface CloudFormationCustomResourceDeleteEvent extends CloudFormationCustomResourceEventCommon {
  RequestType: 'Delete';
  PhysicalResourceId: string;
}

export interface CloudFormationCustomResourceResponseCommon {
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Data?:
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [Key: string]: any;
      }
    | undefined;
  NoEcho?: boolean | undefined;
}

export interface CloudFormationCustomResourceSuccessResponse extends CloudFormationCustomResourceResponseCommon {
  Status: 'SUCCESS';
  Reason?: string | undefined;
}

export interface CloudFormationCustomResourceFailedResponse extends CloudFormationCustomResourceResponseCommon {
  Status: 'FAILED';
  Reason: string;
}

export type FirehoseTransformationHandler = Handler<FirehoseTransformationEvent, FirehoseTransformationResult>;
export type FirehoseTransformationCallback = Callback<FirehoseTransformationResult>;

// Kinesis Data Firehose Event
// https://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-kinesis-firehose
// https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html
// https://aws.amazon.com/blogs/compute/amazon-kinesis-firehose-data-transformation-with-aws-lambda/
// Examples in the lambda blueprints
export interface FirehoseTransformationEvent {
  invocationId: string;
  deliveryStreamArn: string;
  sourceKinesisStreamArn?: string | undefined;
  region: string;
  records: FirehoseTransformationEventRecord[];
}

export interface FirehoseTransformationEventRecord {
  recordId: string;
  approximateArrivalTimestamp: number;
  /** Base64 encoded */
  data: string;
  kinesisRecordMetadata?: FirehoseRecordMetadata | undefined;
}

export interface FirehoseRecordMetadata {
  shardId: string;
  partitionKey: string;
  approximateArrivalTimestamp: number;
  sequenceNumber: string;
  subsequenceNumber: string;
}

export type FirehoseRecordTransformationStatus = 'Ok' | 'Dropped' | 'ProcessingFailed';

export interface FirehoseTransformationMetadata {
  partitionKeys: { [name: string]: string };
}

export interface FirehoseTransformationResultRecord {
  recordId: string;
  result: FirehoseRecordTransformationStatus;
  /** Encode in Base64 */
  data: string;
  metadata?: FirehoseTransformationMetadata;
}

export interface FirehoseTransformationResult {
  records: FirehoseTransformationResultRecord[];
}

// based on https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/ValidateLogEventFlow.html

export interface CloudWatchLogsToFirehoseRecordLogEvents {
  id: string;
  timestamp: number;
  message: string;
}
export interface CloudWatchLogsToFirehoseRecord {
  owner: string;
  logGroup: string;
  logStream: string;
  subscriptionFilters: string[];
  messageType: string;
  logEvents: CloudWatchLogsToFirehoseRecordLogEvents[];
}

export type EventBridgeHandler<TDetailType extends string, TDetail, TResult> = Handler<
  EventBridgeEvent<TDetailType, TDetail>,
  TResult
>;

export interface EventBridgeEvent<TDetailType extends string, TDetail> {
  id: string;
  version: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  source: string;
  'detail-type': TDetailType;
  detail: TDetail;
  'replay-name'?: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScheduledHandler<TDetail = any> = EventBridgeHandler<'Scheduled Event', TDetail, void>;

/**
 * https://docs.aws.amazon.com/lambda/latest/dg/with-scheduled-events.html
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScheduledEvent<TDetail = any> = EventBridgeEvent<'Scheduled Event', TDetail>;

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type SQSHandler = Handler<SQSEvent, SQSBatchResponse | void>;

// SQS
// https://docs.aws.amazon.com/lambda/latest/dg/invoking-lambda-function.html#supported-event-source-sqs
export interface SQSRecord {
  messageId: string;
  receiptHandle: string;
  body: string;
  attributes: SQSRecordAttributes;
  messageAttributes: SQSMessageAttributes;
  md5OfBody: string;
  md5OfMessageAttributes?: string;
  eventSource: string;
  eventSourceARN: string;
  awsRegion: string;
}

export interface SQSEvent {
  Records: SQSRecord[];
}

export interface SQSRecordAttributes {
  AWSTraceHeader?: string | undefined;
  ApproximateReceiveCount: string;
  SentTimestamp: string;
  SenderId: string;
  ApproximateFirstReceiveTimestamp: string;
  SequenceNumber?: string | undefined;
  MessageGroupId?: string | undefined;
  MessageDeduplicationId?: string | undefined;
  DeadLetterQueueSourceArn?: string | undefined; // Undocumented, but used by AWS to support their re-drive functionality in the console
}

export type SQSMessageAttributeDataType = 'String' | 'Number' | 'Binary' | string;

export interface SQSMessageAttribute {
  stringValue?: string | undefined;
  binaryValue?: string | undefined;
  stringListValues?: string[] | undefined; // Not implemented. Reserved for future use.
  binaryListValues?: string[] | undefined; // Not implemented. Reserved for future use.
  dataType: SQSMessageAttributeDataType;
}

export interface SQSMessageAttributes {
  [name: string]: SQSMessageAttribute;
}

// https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting
export interface SQSBatchResponse {
  batchItemFailures: SQSBatchItemFailure[];
}

export interface SQSBatchItemFailure {
  itemIdentifier: string;
}

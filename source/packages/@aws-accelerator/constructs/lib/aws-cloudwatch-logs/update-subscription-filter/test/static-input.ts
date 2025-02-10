// static-input.ts

export class StaticInput {
  static readonly newProps = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":false,"logGroupNames":["/aws/lambda/excluded-function"]}',
    replaceLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldDestination',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };
  static readonly newPropsNoExclusion = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    subscriptionType: 'LOG_GROUP',
    replaceLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldDestination',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };
  static readonly newPropsAccount = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    subscriptionType: 'ACCOUNT',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":false,"logGroupNames":["/aws/lambda/excluded-function"]}',
    replaceLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldDestination',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };

  static readonly oldProps = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/OldLogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldDestination',
    acceleratorLogRetentionInDays: '14',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/old-key',
    subscriptionType: 'ACCOUNT',
    logExclusionOption: '{"account":"123456789012","region":"us-west-2","excludeAll":true}',
    replaceLogDestinationArn: '',
    overrideExisting: 'false',
    filterPattern: '',
    selectionCriteria: '',
  };
  static readonly oldPropsLogGroup = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/OldLogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldDestination',
    acceleratorLogRetentionInDays: '14',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/old-key',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":false,"logGroupNames":["/aws/lambda/old-excluded-function"]}',
    replaceLogDestinationArn: '',
    overrideExisting: 'false',
    filterPattern: '',
    selectionCriteria: '',
  };
  static readonly newPropsLogGroup = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/NewLogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:NewDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/new-key',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":false,"logGroupNames":["/aws/lambda/new-excluded-function"]}',
    replaceLogDestinationArn: '',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: '',
  };

  static readonly oldPropsAccount = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/OldAccountSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:OldAccountDestination',
    acceleratorLogRetentionInDays: '14',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/old-account-key',
    subscriptionType: 'ACCOUNT',
    logExclusionOption: '{"account":"123456789012","region":"us-west-2","excludeAll":false}',
    replaceLogDestinationArn: '',
    overrideExisting: 'false',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };
  static readonly newPropsExcludeAllLogGroup = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/NewLogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:NewDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/new-key',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":true,"logGroupNames":["/aws/lambda/new-excluded-function"]}',
    replaceLogDestinationArn: '',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: '',
  };
  static readonly newPropsNoReplacement = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption:
      '{"account":"123456789012","region":"us-west-2","excludeAll":false,"logGroupNames":["/aws/lambda/excluded-function"]}',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };

  static readonly newPropsInvalidLogExclusion = {
    acceleratorLogSubscriptionRoleArn: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
    acceleratorCreatedLogDestinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    acceleratorLogRetentionInDays: '30',
    acceleratorLogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    subscriptionType: 'LOG_GROUP',
    logExclusionOption: 'someString',
    overrideExisting: 'true',
    filterPattern: '',
    selectionCriteria: 'ALL',
  };

  static readonly policyName = 'ACCELERATOR_ACCOUNT_SUBSCRIPTION_POLICY';

  static readonly subscriptionError = new Error(
    `Cloudwatch log group testError has 2 subscription destinations, can not add accelerator subscription destination!!!! Remove one of the two existing destination and rerun the pipeline for accelerator to add solution defined log destination ${StaticInput.newProps.acceleratorCreatedLogDestinationArn}`,
  );
}

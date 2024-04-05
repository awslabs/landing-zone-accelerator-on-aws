import { PolicyType, Scope } from '@aws-sdk/client-cloudwatch-logs';

/**
 * Abstract class to configure static input for put-account-policy custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  private static readonly centralLogBucketName = 'aws-accelerator-central-logs';
  private static readonly createEventPropsIdentifierNames = ['AwsSecretKey', 'EmailAddress'];
  private static readonly updateEventPropsIdentifierNames = ['AwsSecretKey', 'EmailAddress', 'BankAccountNumber-US'];

  private static readonly partition = 'aws';

  public static readonly accountId = '111111111111';

  public static readonly policyName = 'ACCELERATOR_ACCOUNT_DATA_PROTECTION_POLICY';

  public static readonly overrideExistingCreateEventProps = {
    centralLogBucketName: StaticInput.centralLogBucketName,
    identifierNames: StaticInput.createEventPropsIdentifierNames,
    solutionId: 'Accelerator-Solution-Id',
    overrideExisting: 'true',
  };

  public static readonly overrideExistingUpdateEventProps = {
    centralLogBucketName: StaticInput.centralLogBucketName,
    identifierNames: StaticInput.updateEventPropsIdentifierNames,
    solutionId: 'Accelerator-Solution-Id',
    overrideExisting: 'true',
  };

  public static readonly createEventProps = {
    centralLogBucketName: StaticInput.centralLogBucketName,
    identifierNames: StaticInput.createEventPropsIdentifierNames,
    solutionId: 'Accelerator-Solution-Id',
    overrideExisting: false,
  };

  public static readonly updateEventProps = {
    centralLogBucketName: StaticInput.centralLogBucketName,
    identifierNames: StaticInput.updateEventPropsIdentifierNames,
    solutionId: 'Accelerator-Solution-Id',
    overrideExisting: false,
  };

  public static readonly newDataIdentifiers: string[] = StaticInput.createEventPropsIdentifierNames.map(
    item => `arn:${StaticInput.partition}:dataprotection::${StaticInput.partition}:data-identifier/${item}`,
  );

  public static readonly oldDataIdentifiers: string[] = StaticInput.updateEventPropsIdentifierNames.map(
    item => `arn:${StaticInput.partition}:dataprotection::${StaticInput.partition}:data-identifier/${item}`,
  );

  public static readonly createEventPolicyDocument = {
    Name: 'ACCOUNT_DATA_PROTECTION_POLICY',
    Description: '',
    Version: '2021-06-01',
    Statement: [
      {
        Sid: 'audit-policy',
        DataIdentifier: StaticInput.newDataIdentifiers,
        Operation: {
          Audit: {
            FindingsDestination: {
              S3: {
                Bucket: StaticInput.centralLogBucketName,
              },
            },
          },
        },
      },
      {
        Sid: 'redact-policy',
        DataIdentifier: StaticInput.newDataIdentifiers,
        Operation: {
          Deidentify: {
            MaskConfig: {},
          },
        },
      },
    ],
  };

  public static readonly updateEventPolicyDocument = {
    Name: 'ACCOUNT_DATA_PROTECTION_POLICY',
    Description: '',
    Version: '2021-06-01',
    Statement: [
      {
        Sid: 'audit-policy',
        DataIdentifier: StaticInput.oldDataIdentifiers,
        Operation: {
          Audit: {
            FindingsDestination: {
              S3: {
                Bucket: StaticInput.centralLogBucketName,
              },
            },
          },
        },
      },
      {
        Sid: 'redact-policy',
        DataIdentifier: StaticInput.oldDataIdentifiers,
        Operation: {
          Deidentify: {
            MaskConfig: {},
          },
        },
      },
    ],
  };

  public static operationOutput = { Status: 'SUCCESS' };

  public static createOperationOutput = {
    policyName: StaticInput.policyName,
    policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
    policyType: PolicyType.DATA_PROTECTION_POLICY,
    scope: Scope.ALL,
    accountId: StaticInput.accountId,
  };

  public static updateOperationOutput = {
    policyName: StaticInput.policyName,
    policyDocument: JSON.stringify(StaticInput.updateEventPolicyDocument),
    policyType: PolicyType.DATA_PROTECTION_POLICY,
    scope: Scope.ALL,
    accountId: StaticInput.accountId,
  };

  public static readonly missingAccountPolicies = new Error(
    `Undefined accountPolicies property received from DescribeAccountPolicies API.`,
  );
}

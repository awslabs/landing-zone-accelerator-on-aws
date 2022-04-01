import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * PasswordPolicyProps properties
 */
export interface PasswordPolicyProps {
  readonly allowUsersToChangePassword: boolean;
  readonly hardExpiry: boolean;
  readonly requireUppercaseCharacters: boolean;
  readonly requireLowercaseCharacters: boolean;
  readonly requireSymbols: boolean;
  readonly requireNumbers: boolean;
  readonly minimumPasswordLength: number;
  readonly passwordReusePrevention: number;
  readonly maxPasswordAge: number;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Class to Update Account Password Policy
 */
export class PasswordPolicy extends Construct {
  public readonly id: string;

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: PasswordPolicyProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::IamUpdateAccountPasswordPolicy';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'update-account-password-policy/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['iam:UpdateAccountPasswordPolicy'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        allowUsersToChangePassword: props.allowUsersToChangePassword,
        hardExpiry: props.hardExpiry,
        requireUppercaseCharacters: props.requireUppercaseCharacters,
        requireLowercaseCharacters: props.requireLowercaseCharacters,
        requireSymbols: props.requireSymbols,
        requireNumbers: props.requireNumbers,
        minimumPasswordLength: props.minimumPasswordLength,
        passwordReusePrevention: props.passwordReusePrevention,
        maxPasswordAge: props.maxPasswordAge,
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!PasswordPolicy.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${
          (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
        }`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      resource.node.addDependency(logGroup);

      // Enable the flag to indicate log group configured
      PasswordPolicy.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}

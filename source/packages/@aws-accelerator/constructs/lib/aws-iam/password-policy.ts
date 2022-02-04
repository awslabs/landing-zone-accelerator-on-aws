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
}

/**
 * Class to Update Account Password Policy
 */
export class PasswordPolicy extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: PasswordPolicyProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::IamUpdateAccountPasswordPolicy';

    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
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
      serviceToken: cr.serviceToken,
      properties: {
        ...props,
      },
    });

    this.id = resource.ref;
  }
}

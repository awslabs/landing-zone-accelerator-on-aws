import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * EnableAwsServiceAccessProps properties
 */
export interface EnableAwsServiceAccessProps {
  readonly servicePrincipal: string;
}

/**
 * Class to Enable AWS Service Access
 */
export class EnableAwsServiceAccess extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: EnableAwsServiceAccessProps) {
    super(scope, id);

    const customResource = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      'Custom::OrganizationsEnableAwsServiceAccess',
      {
        codeDirectory: path.join(__dirname, 'enable-aws-service-access/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['organizations:DisableAWSServiceAccess', 'organizations:EnableAwsServiceAccess'],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::EnableAwsServiceAccess',
      serviceToken: customResource.serviceToken,
      properties: {
        ...props,
      },
    });

    this.id = resource.ref;
  }
}

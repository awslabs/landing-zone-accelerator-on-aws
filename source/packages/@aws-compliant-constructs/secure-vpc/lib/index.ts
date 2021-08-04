import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';

export interface SecureVpcProps {
  // Define construct properties here
}

export class SecureVpc extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: SecureVpcProps = {}) {
    super(scope, id);

    // Define construct contents here
    new ssm.StringParameter(this, 'SecureVpcSsmTest', {
      allowedPattern: '.*',
      description: 'The value Foo',
      parameterName: 'FooParameter',
      stringValue: 'Foo',
    });
  }
}

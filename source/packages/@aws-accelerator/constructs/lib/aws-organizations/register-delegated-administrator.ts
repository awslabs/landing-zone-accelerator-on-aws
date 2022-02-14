import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * RegisterDelegatedAdministratorProps properties
 */
export interface RegisterDelegatedAdministratorProps {
  readonly servicePrincipal: string;
  readonly accountId: string;
}

/**
 * Class to Register a Delegated Administrator
 *
 * NOTE: This construct should only be used if the native service does not have
 * it's own API or method to establish a delegated administrator
 */
export class RegisterDelegatedAdministrator extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: RegisterDelegatedAdministratorProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::OrganizationsRegisterDelegatedAdministrator';

    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'register-delegated-administrator/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['organizations:DeregisterDelegatedAdministrator', 'organizations:RegisterDelegatedAdministrator'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: cr.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        ...props,
      },
    });

    this.id = resource.ref;
  }
}

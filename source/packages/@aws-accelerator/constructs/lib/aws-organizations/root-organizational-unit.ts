import * as cdk from 'aws-cdk-lib';
import { OrganizationalUnitLookupOptions } from './organizational-unit-lookup';
import { Construct } from 'constructs';

const path = require('path');

/**
 * Initialized OrganizationalUnit properties
 */
export interface RootOrganizationalUnitProps {
  readonly name: string;
}

/**
 * Class to initialize OrganizationalUnit
 */
export class RootOrganizationalUnit extends Construct {
  public readonly id: string;

  private constructor(scope: Construct, id: string, props: RootOrganizationalUnitProps) {
    super(scope, id);

    const listRootsFunction = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::OrganizationsListRoots', {
      codeDirectory: path.join(__dirname, 'list-roots/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['organizations:ListRoots'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::ListRoots',
      serviceToken: listRootsFunction.serviceToken,
      properties: {
        name: props.name,
      },
    });

    this.id = resource.ref;
  }

  public static fromName(
    scope: Construct,
    id: string,
    options: OrganizationalUnitLookupOptions,
  ): RootOrganizationalUnit {
    return new RootOrganizationalUnit(scope, id, {
      name: options.name,
    });
  }
}

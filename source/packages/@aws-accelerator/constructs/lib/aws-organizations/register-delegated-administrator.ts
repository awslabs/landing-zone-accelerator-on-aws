import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * RegisterDelegatedAdministratorProps properties
 */
export interface RegisterDelegatedAdministratorProps {
  readonly servicePrincipal: string;
  readonly accountId: string;
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

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
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
      serviceToken: provider.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        servicePrincipal: props.servicePrincipal,
        accountId: props.accountId,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}

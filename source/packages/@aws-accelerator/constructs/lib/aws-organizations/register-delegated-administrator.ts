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

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: RegisterDelegatedAdministratorProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::OrganizationsRegisterDelegatedAdministrator';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
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
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        servicePrincipal: props.servicePrincipal,
        accountId: props.accountId,
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!RegisterDelegatedAdministrator.isLogGroupConfigured) {
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
      RegisterDelegatedAdministrator.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}

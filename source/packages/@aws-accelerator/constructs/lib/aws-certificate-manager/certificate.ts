/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { DEFAULT_LAMBDA_RUNTIME } from '../../../utils/lib/lambda';

export interface CertificateProps {
  /**
   * SSM parameter name for certificate ARN
   */
  parameterName: string;
  /**
   *
   * Certificate type
   */
  type: string;
  /**
   *
   * The private key that matches the public key in the certificate.
   */
  privKey?: string;
  /**
   *
   * The certificate to import.
   */
  cert?: string;
  /**
   *
   * PEM encoded certificate chain
   */
  chain?: string;
  /**
   *
   * Certificate validation method
   */
  validation?: string;
  /**
   *
   * Fully qualified domain name (FQDN), such as www.example.com, that you want to secure with an ACM certificate.
   */
  domain?: string;
  /**
   * Additional FQDNs to be included in the Subject Alternative Name extension of the ACM certificate. For example, add the name www.example.net to a certificate for which the DomainName field is www.example.com if users can reach your site by using either name.
   */
  san?: string[];
  /**
   * Home region where the asset bucket lives
   */
  homeRegion: string;
  /**
   * Asset Lambda function role name
   */
  assetFunctionRoleName: string;
  /**
   * Asset S3 bucket name
   */
  assetBucketName: string;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  cloudWatchLogsKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  logRetentionInDays: number;
}

/**
 * Class to create ACM certificates
 */
export class Certificate extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: CertificateProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::CreateAcmCerts';

    //
    // Function definition for the custom resource
    //
    const providerLambda = new cdk.aws_lambda.Function(this, 'Function', {
      runtime: DEFAULT_LAMBDA_RUNTIME,
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-certificates/dist')),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Create ACM certificates handler',
      role: cdk.aws_iam.Role.fromRoleName(this, 'AssetsFunctionRole', props.assetFunctionRoleName),
    });

    // Custom resource lambda log group
    const logGroup = new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudWatchLogsKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'Custom::CreateAcmCerts', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        parameterName: props.parameterName,
        type: props.type,
        privKey: props.privKey,
        cert: props.cert,
        chain: props.chain,
        validation: props.validation,
        domain: props.domain,
        san: props.san?.join(','),
        homeRegion: props.homeRegion,
        assetBucketName: props.assetBucketName,
      },
    });

    // Ensure that the LogGroup is created by Cloudformation prior to Lambda execution
    resource.node.addDependency(logGroup);
    this.id = resource.ref;
  }
}

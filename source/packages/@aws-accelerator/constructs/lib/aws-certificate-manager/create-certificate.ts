/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export interface CreateCertificateProps {
  /**
   *
   * Certificate name
   */
  name: string;
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
   * Custom resource lambda log group encryption key
   */
  cloudWatchLogsKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  logRetentionInDays: number;
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
}

/**
 * Class to configure CloudWatch Destination on logs receiving account
 */
export class CreateCertificate extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: CreateCertificateProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::CreateAcmCerts';

    //
    // Function definition for the custom resource
    //
    const providerLambda = new cdk.aws_lambda.Function(this, 'Function', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-certificates/dist')),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Create ACM certificates handler',
      role: cdk.aws_iam.Role.fromRoleName(this, 'AssetsFunctionRole', props.assetFunctionRoleName),
    });

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
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
        name: props.name,
        type: props.type,
        privKey: props.privKey ?? undefined,
        cert: props.cert ?? undefined,
        chain: props.chain ?? undefined,
        validation: props.validation ?? undefined,
        domain: props.domain ?? undefined,
        san: props.san?.join(',') ?? undefined,
        homeRegion: props.homeRegion,
        assetBucketName: props.assetBucketName,
      },
    });

    this.id = resource.ref;
  }
}

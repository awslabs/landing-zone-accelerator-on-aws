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
import { LzaCustomResource } from '../lza-custom-resource';

export interface CreateCertificateProps {
  /**
   *
   * Certificate name
   */
  name: string;
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
   * Custom resource lambda environment encryption key
   */
  readonly customResourceLambdaEnvironmentEncryptionKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly customResourceLambdaCloudWatchLogKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly customResourceLambdaLogRetentionInDays: number;
}

/**
 * Class to configure CloudWatch Destination on logs receiving account
 */
export class CreateCertificate extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: CreateCertificateProps) {
    super(scope, id);

    const resourceName = 'CreateAcmCerts';

    const lzaCustomResource = new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          { name: props.name },
          { parameterName: props.parameterName },
          { type: props.type },
          { privKey: props.privKey },
          { cert: props.cert },
          { chain: props.chain },
          { validation: props.validation },
          { domain: props.domain },
          { san: props.san?.join(',') },
          { homeRegion: props.homeRegion },
          { assetBucketName: props.assetBucketName },
        ],
      },
      lambda: {
        assetPath: path.join(__dirname, 'create-certificates/dist'),
        environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
        timeOut: cdk.Duration.minutes(15),
        description: 'Create ACM certificates handler',
        role: cdk.aws_iam.Role.fromRoleName(this, 'AssetsFunctionRole', props.assetFunctionRoleName),
      },
    });

    this.id = lzaCustomResource.resource.ref;
  }
}

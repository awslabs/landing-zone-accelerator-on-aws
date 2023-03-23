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

import { CertificateConfig } from '@aws-accelerator/config';
import { CreateCertificate } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';

export class AcmResources {
  public readonly certificateMap: Map<string, CreateCertificate>;
  private stack: NetworkStack;

  constructor(networkStack: NetworkStack, props: AcceleratorStackProps) {
    this.stack = networkStack;

    // Create certificates
    this.certificateMap = this.createCertificates(props);
  }

  /**
   * Create ACM certificates - check whether ACM should be deployed
   */
  private createCertificates(props: AcceleratorStackProps): Map<string, CreateCertificate> {
    const certificateMap = new Map<string, CreateCertificate>();
    this.stack.addLogs(LogLevel.INFO, 'Evaluating AWS Certificate Manager certificates.');
    for (const certificate of props.networkConfig.certificates ?? []) {
      if (!this.stack.isIncluded(certificate.deploymentTargets)) {
        this.stack.addLogs(LogLevel.INFO, 'Item excluded');
        continue;
      }
      this.stack.addLogs(
        LogLevel.INFO,
        `Account (${cdk.Stack.of(this.stack).account}) should be included, deploying ACM certificates.`,
      );
      const certificateResource = this.createAcmCertificates(certificate, props);
      certificateMap.set(certificate.name, certificateResource);
    }

    return certificateMap;
  }
  /**
   * Create ACM certificates
   */
  private createAcmCertificates(certificate: CertificateConfig, props: AcceleratorStackProps): CreateCertificate {
    const resourceName = pascalCase(`${certificate.name}`);

    const acmCertificate = new CreateCertificate(this.stack, resourceName, {
      name: certificate.name,
      type: certificate.type,
      privKey: certificate.privKey,
      cert: certificate.cert,
      chain: certificate.chain,
      validation: certificate.validation,
      domain: certificate.domain,
      san: certificate.san,
      cloudWatchLogsKmsKey: this.stack.cloudwatchKey,
      logRetentionInDays: this.stack.logRetention,
      homeRegion: props.globalConfig.homeRegion,
      assetFunctionRoleName: this.stack.acceleratorResourceNames.roles.assetFunctionRoleName,
      assetBucketName: `${
        this.stack.acceleratorResourceNames.bucketPrefixes.assets
      }-${props.accountsConfig.getManagementAccountId()}-${props.globalConfig.homeRegion}`,
    });

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this.stack,
      `${this.stack.stackName}/${resourceName}/AssetsRole/Policy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Policy permissions are part of managed role and rest is to get access from s3 bucket',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this.stack,
      `${this.stack.stackName}/${resourceName}/Custom::CreateAcmCerts/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Policy permissions are part cdk provider framework',
        },
      ],
    );
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this.stack,
      `${this.stack.stackName}/${resourceName}/Function/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this.stack,
      `${this.stack.stackName}/${resourceName}/Custom::CreateAcmCerts/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'IAM Role created by custom resource framework',
        },
      ],
    );

    return acmCertificate;
  }
}

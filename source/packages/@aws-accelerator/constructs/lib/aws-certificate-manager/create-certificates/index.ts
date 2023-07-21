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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
AWS.config.logger = console;

/**
 * add-macie-members - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  //set variables from event
  const parameterName: string = event.ResourceProperties['parameterName'];
  const type: string = event.ResourceProperties['type'];
  const privKey: string | undefined = event.ResourceProperties['privKey'];
  const cert: string | undefined = event.ResourceProperties['cert'];
  const chain: string | undefined = event.ResourceProperties['chain'];
  const validation: string | undefined = event.ResourceProperties['validation'];
  const domain: string | undefined = event.ResourceProperties['domain']!;
  const sanString: string | undefined = event.ResourceProperties['san'];
  const assetBucketName: string = event.ResourceProperties['assetBucketName'];
  const homeRegion: string = event.ResourceProperties['homeRegion'];
  const isExistingCertificate = event.ResourceProperties['isExisting'];

  const san = sanString ? sanString.split(',') : undefined;
  const solutionId = process.env['SOLUTION_ID'];

  const acmClient = new AWS.ACM({ customUserAgent: solutionId });
  const s3Client = new S3Client({ customUserAgent: solutionId, region: homeRegion });
  const ssmClient = new AWS.SSM({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
      if (isExistingCertificate === 'true') {
        const certArn = await throttlingBackOff(() => ssmClient.getParameter({ Name: parameterName }).promise());
        if (!certArn) {
          throw new Error(`No SSM Parameter "${parameterName}" found for existing Certificate`);
        }
        break;
      }
      await createUpdateEventHandler({
        acmClient,
        s3Client,
        ssmClient,
        parameterName,
        type,
        assetBucketName,
        privKey,
        cert,
        chain,
        domain,
        validation,
        san,
      });
      break;
    case 'Update':
      await createUpdateEventHandler({
        acmClient,
        s3Client,
        ssmClient,
        parameterName,
        type,
        assetBucketName,
        privKey,
        cert,
        chain,
        domain,
        validation,
        san,
      });
      break;
    case 'Delete':
      const certArn = await throttlingBackOff(() => ssmClient.getParameter({ Name: parameterName }).promise());
      const certArnValue: string | undefined = certArn.Parameter?.Value ?? undefined;
      if (certArnValue) {
        await throttlingBackOff(() => acmClient.deleteCertificate({ CertificateArn: certArnValue }).promise());
        await throttlingBackOff(() => ssmClient.deleteParameter({ Name: parameterName }).promise());
      }
      break;
  }
  return { Status: 'Success', StatusCode: 200 };
}

/**
 * Function to handle create or update event for the custom resource lambda function
 * @param props
 */
async function createUpdateEventHandler(props: {
  acmClient: AWS.ACM;
  s3Client: S3Client;
  ssmClient: AWS.SSM;
  parameterName: string;
  type: string;
  assetBucketName: string;
  privKey?: string;
  cert?: string;
  chain?: string;
  domain?: string;
  validation?: string;
  san?: string[];
}): Promise<void> {
  let certificateArn: AWS.ACM.RequestCertificateResponse | AWS.ACM.ImportCertificateResponse | undefined;
  switch (props.type) {
    case 'import':
      const privKeyContent = await getS3FileContents(props.assetBucketName, props.s3Client, props.privKey);
      const certContent = await getS3FileContents(props.assetBucketName, props.s3Client, props.cert);
      const chainContents = await getS3FileContents(props.assetBucketName, props.s3Client, props.chain);
      certificateArn = await createImportCertificate(props.acmClient, certContent, chainContents, privKeyContent);
      break;
    case 'request':
      certificateArn = await createRequestCertificate(props.acmClient, props.domain, props.validation, props.san);
      break;
    default:
      throw new Error(
        `Invalid certificate type ${props.type} !!!. Valid certificate types can be either import or request !!!!`,
      );
  }
  await createCertificateSsmParameter(props.ssmClient, props.parameterName, certificateArn!);
}

/**
 * Function to get S3 file contents for certificate details
 * @param s3BucketName string
 * @param s3Client {@link S3Client}
 * @param s3Key string
 * @returns
 */
async function getS3FileContents(
  s3BucketName: string,
  s3Client: S3Client,
  s3Key?: string,
): Promise<string | undefined> {
  if (s3Key) {
    const response = await throttlingBackOff(() =>
      s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key })),
    );
    const stream = response.Body as Readable;
    return streamToString(stream);
  } else {
    return undefined;
  }
}

async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Function to create Import Certificate
 * @param acmClient {@link AWS.ACM}
 * @param cert string
 * @param chain string
 * @param privKey string
 * @returns certificate {@link AWS.ACM.ImportCertificateResponse}
 */
async function createImportCertificate(
  acmClient: AWS.ACM,
  cert?: string,
  chain?: string,
  privKey?: string,
): Promise<AWS.ACM.ImportCertificateResponse> {
  if (!cert || !privKey) {
    throw new Error('Missing certificate or private key in custom resource event properties');
  }

  return await throttlingBackOff(() =>
    acmClient.importCertificate({ Certificate: cert, CertificateChain: chain, PrivateKey: privKey }).promise(),
  );
}

/**
 * Function to create request certificate
 * @param acmClient {@link AWS.ACM}
 * @param domain string
 * @param validation string
 * @param san string
 * @returns certificate {@link AWS.ACM.RequestCertificateResponse}
 */
async function createRequestCertificate(
  acmClient: AWS.ACM,
  domain?: string,
  validation?: string,
  san?: string[],
): Promise<AWS.ACM.RequestCertificateResponse> {
  if (!domain) {
    throw new Error('Missing domain in custom resource event properties');
  }

  return await throttlingBackOff(() =>
    acmClient
      .requestCertificate({ DomainName: domain, ValidationMethod: validation, SubjectAlternativeNames: san })
      .promise(),
  );
}

/**
 * Function to create SSM parameter to store certificate arn value
 * @param ssmClient {@link AWS.SSM}
 * @param parameterName string
 * @param certificateArnItem {@link AWS.ACM.RequestCertificateResponse} | {@link AWS.ACM.ImportCertificateResponse}
 */
async function createCertificateSsmParameter(
  ssmClient: AWS.SSM,
  parameterName: string,
  certificateArnItem: AWS.ACM.RequestCertificateResponse | AWS.ACM.ImportCertificateResponse,
): Promise<void> {
  if (!certificateArnItem.CertificateArn) {
    throw new Error(
      `Missing certificateArn value in ACM client response, unable to create certificate SSM parameter ${parameterName} !!!`,
    );
  }
  await throttlingBackOff(() =>
    ssmClient
      .putParameter({
        Name: parameterName,
        Value: certificateArnItem.CertificateArn!,
        Type: 'String',
        Overwrite: true,
      })
      .promise(),
  );
}

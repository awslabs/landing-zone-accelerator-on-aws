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
  const name: string = event.ResourceProperties['name'];
  const parameterName: string = event.ResourceProperties['parameterName'];
  const type: string = event.ResourceProperties['type'];
  const privKey: string | undefined = event.ResourceProperties['privKey'];
  const cert: string | undefined = event.ResourceProperties['cert'];
  const chain: string | undefined = event.ResourceProperties['chain'];
  const validation: string | undefined = event.ResourceProperties['validation'];
  const domain: string | undefined = event.ResourceProperties['domain']!;
  const sanString: string | undefined = event.ResourceProperties['san'];
  const assetBucket: string = event.ResourceProperties['assetBucketName'];

  const san = sanString ? sanString.split(',') : undefined;
  const homeRegion = event.ResourceProperties['homeRegion'];
  const solutionId = process.env['SOLUTION_ID'];

  const acmClient = new AWS.ACM({ customUserAgent: solutionId });
  const s3Client = new S3Client({ customUserAgent: solutionId, region: homeRegion });
  const ssmClient = new AWS.SSM({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      try {
        let certificateArn: AWS.ACM.RequestCertificateResponse | AWS.ACM.ImportCertificateResponse;
        if (type === 'import') {
          const privKeyContent = await getS3FileContents(assetBucket, s3Client, privKey);
          const certContent = await getS3FileContents(assetBucket, s3Client, cert);
          const chainContents = await getS3FileContents(assetBucket, s3Client, chain);

          certificateArn = await createImportCertificate(acmClient, certContent, chainContents, privKeyContent);

          await putParameter(ssmClient, parameterName, certificateArn.CertificateArn);

          return { Status: 'Success', StatusCode: 200 };
        } else if (type === 'request') {
          certificateArn = await createRequestCertificate(acmClient, domain, validation, san);
          await putParameter(ssmClient, parameterName, certificateArn.CertificateArn);

          return { Status: 'Success', StatusCode: 200 };
        }
      } catch (e) {
        throw new Error(`There was an error during ${type} on ${event.RequestType} of certificate ${name}: ${e}`);
      }
      break;
    case 'Delete':
      try {
        const certArn = await throttlingBackOff(() => ssmClient.getParameter({ Name: parameterName }).promise());
        const certArnValue: string | undefined = certArn.Parameter?.Value ?? undefined;
        if (certArnValue) {
          await throttlingBackOff(() => acmClient.deleteCertificate({ CertificateArn: certArnValue }).promise());
          await throttlingBackOff(() => ssmClient.deleteParameter({ Name: parameterName }).promise());
        }
      } catch (e) {
        throw new Error(`There was an error during ${type} on ${event.RequestType} of certificate ${name}: ${e}`);
      }
  }
  return { Status: 'Success', StatusCode: 200 };
}

async function getS3FileContents(s3Bucket: string, s3Client: S3Client, s3Key?: string): Promise<string | undefined> {
  if (s3Key) {
    const response = await throttlingBackOff(() =>
      s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key })),
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

async function createRequestCertificate(acmClient: AWS.ACM, domain?: string, validation?: string, san?: string[]) {
  if (!domain) {
    throw new Error('Missing domain in custom resource event properties');
  }

  return await throttlingBackOff(() =>
    acmClient
      .requestCertificate({ DomainName: domain, ValidationMethod: validation, SubjectAlternativeNames: san })
      .promise(),
  );
}

async function putParameter(ssmClient: AWS.SSM, parameterName: string, certificateArn?: string): Promise<void> {
  if (!certificateArn) {
    throw new Error('Missing certificateArn value in ACM client response');
  }

  await throttlingBackOff(() =>
    ssmClient
      .putParameter({
        Name: parameterName,
        Value: certificateArn,
        Type: 'String',
        Overwrite: true,
      })
      .promise(),
  );
}

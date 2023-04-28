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
  //print out the event in case manual intervention is needed
  console.log(event);

  //set variables from event
  const name = event.ResourceProperties['name'];
  const type = event.ResourceProperties['type'];
  const privKey = event.ResourceProperties['privKey']!;
  const cert = event.ResourceProperties['cert']!;
  const chain = event.ResourceProperties['chain']!;
  const validation = event.ResourceProperties['validation']!;
  const domain = event.ResourceProperties['domain']!;
  const sanString = event.ResourceProperties['san']!;
  const assetBucket = event.ResourceProperties['assetBucketName'];

  let san: string[] | undefined = undefined;
  if (sanString) {
    san = sanString.split(',');
  }
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
          const privKeyContent = await getS3FileContents(assetBucket, privKey, s3Client);
          const certContent = await getS3FileContents(assetBucket, cert!, s3Client);
          const chainContents = await getS3FileContents(assetBucket, chain!, s3Client);

          certificateArn = await throttlingBackOff(() =>
            acmClient
              .importCertificate({
                Certificate: certContent!,
                CertificateChain: chainContents ?? undefined,
                PrivateKey: privKeyContent!,
              })
              .promise(),
          );
          await throttlingBackOff(() =>
            ssmClient
              .putParameter({
                Name: `/accelerator/acm/${name}/arn`,
                Value: certificateArn.CertificateArn!,
                Type: 'String',
                Overwrite: true,
              })
              .promise(),
          );

          return { Status: 'Success', StatusCode: 200 };
        } else if (type === 'request') {
          certificateArn = await throttlingBackOff(() =>
            acmClient
              .requestCertificate({ DomainName: domain, ValidationMethod: validation, SubjectAlternativeNames: san })
              .promise(),
          );
          await throttlingBackOff(() =>
            ssmClient
              .putParameter({
                Name: `/accelerator/acm/${name}/arn`,
                Value: certificateArn.CertificateArn!,
                Type: 'String',
                Overwrite: true,
              })
              .promise(),
          );
          return { Status: 'Success', StatusCode: 200 };
        }
      } catch (e) {
        throw new Error(`There was an error during ${type} on ${event.RequestType} of certificate ${name}: ${e}`);
      }
      break;
    case 'Delete':
      try {
        const certArn = await throttlingBackOff(() =>
          ssmClient.getParameter({ Name: `/accelerator/acm/${name}/arn` }).promise(),
        );
        const certArnValue: string | undefined = certArn.Parameter?.Value ?? undefined;
        if (certArnValue) {
          await throttlingBackOff(() => acmClient.deleteCertificate({ CertificateArn: certArnValue }).promise());
          await throttlingBackOff(() => ssmClient.deleteParameter({ Name: `/accelerator/acm/${name}/arn` }).promise());
        }
      } catch (e) {
        throw new Error(`There was an error during ${type} on ${event.RequestType} of certificate ${name}: ${e}`);
      }
  }
  return { Status: 'Success', StatusCode: 200 };
}

async function getS3FileContents(
  s3Bucket: string,
  s3Key: string | undefined,
  s3Client: S3Client,
): Promise<string | undefined> {
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

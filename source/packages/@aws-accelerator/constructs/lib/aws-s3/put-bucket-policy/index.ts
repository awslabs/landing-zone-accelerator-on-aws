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

import {
  PolicyStatementType,
  AcceleratorImportedBucketType,
  AwsPrincipalAccessesType,
  PrincipalOrgIdConditionType,
} from '@aws-accelerator/utils/lib/common-resources';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import * as path from 'path';
import { PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * put-bucket-prefix - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string | undefined;
    }
  | undefined
> {
  const partition = event.ServiceToken.split(':')[1];
  const sourceAccount: string = event.ResourceProperties['sourceAccount'];
  const bucketType: AcceleratorImportedBucketType = event.ResourceProperties['bucketType'];
  const bucketName: string = event.ResourceProperties['bucketName'];
  const bucketArn: string = event.ResourceProperties['bucketArn'];
  const applyAcceleratorManagedPolicy: string = event.ResourceProperties['applyAcceleratorManagedPolicy'];
  const bucketPolicyFilePaths: string[] = event.ResourceProperties['bucketPolicyFilePaths'];

  const organizationId: string | undefined = event.ResourceProperties['organizationId'];
  const awsPrincipalAccesses: AwsPrincipalAccessesType[] | undefined = event.ResourceProperties['awsPrincipalAccesses'];
  const principalOrgIdCondition: PrincipalOrgIdConditionType | undefined =
    event.ResourceProperties['principalOrgIdCondition'];

  const elbAccountId: string | undefined = event.ResourceProperties['elbAccountId'];
  const firewallRoles: string[] = event.ResourceProperties['firewallRoles'] ?? [];

  const solutionId = process.env['SOLUTION_ID'];
  const s3Client = new S3Client({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (applyAcceleratorManagedPolicy === 'true' || bucketPolicyFilePaths.length > 0) {
        const generatedPolicyString = generateBucketPolicy(
          firewallRoles,
          applyAcceleratorManagedPolicy,
          partition,
          sourceAccount,
          bucketType,
          bucketArn,
          bucketPolicyFilePaths,
          principalOrgIdCondition,
          awsPrincipalAccesses,
          elbAccountId,
        );

        let replacedPolicyString = generatedPolicyString;
        if (organizationId) {
          replacedPolicyString = generatedPolicyString.replace(/\${ORG_ID}/g, organizationId);
        }

        await throttlingBackOff(() =>
          s3Client.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: replacedPolicyString })),
        );
      }
      return {
        PhysicalResourceId: bucketName,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Skip delete bucket policy
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

export function generateBucketPolicy(
  firewallRoles: string[],
  applyAcceleratorManagedPolicy: string,
  partition: string,
  sourceAccount: string,
  bucketType: AcceleratorImportedBucketType,
  bucketArn: string,
  bucketPolicyFilePaths: string[],
  principalOrgIdCondition?: PrincipalOrgIdConditionType,
  awsPrincipalAccesses?: AwsPrincipalAccessesType[],
  elbAccountId?: string,
): string {
  const policyStatements: PolicyStatementType[] = [];

  if (applyAcceleratorManagedPolicy === 'true') {
    switch (bucketType) {
      case AcceleratorImportedBucketType.ASSETS_BUCKET:
        policyStatements.push({
          Sid: 'deny-insecure-connections',
          Effect: 'Deny',
          Principal: {
            AWS: '*',
          },
          Action: 's3:*',
          Resource: [bucketArn, `${bucketArn}/*`],
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        });
        if (firewallRoles.length > 0) {
          policyStatements.push({
            Sid: 'Allow Organization principals to use the bucket',
            Effect: 'Allow',
            Principal: {
              AWS: '*',
            },
            Action: ['s3:GetObject', 's3:ListBucket'],
            Resource: [bucketArn, `${bucketArn}/*`],
            Condition: {
              StringEquals: {
                ...principalOrgIdCondition,
              },
              StringLike: {
                'aws:PrincipalARN': firewallRoles,
              },
            },
          });
        }

        break;
      case AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET:
        policyStatements.push({
          Sid: 'deny-insecure-connections',
          Effect: 'Deny',
          Principal: {
            AWS: '*',
          },
          Action: 's3:*',
          Resource: [bucketArn, `${bucketArn}/*`],
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        });

        policyStatements.push({
          Effect: 'Allow',
          Principal: {
            Service: [
              'cloudtrail.amazonaws.com',
              'config.amazonaws.com',
              'delivery.logs.amazonaws.com',
              'ssm.amazonaws.com',
            ],
          },
          Action: 's3:PutObject',
          Resource: [`${bucketArn}/*`],
          Condition: {
            StringEquals: {
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        });

        policyStatements.push({
          Effect: 'Allow',
          Principal: {
            Service: ['cloudtrail.amazonaws.com', 'config.amazonaws.com', 'delivery.logs.amazonaws.com'],
          },
          Action: ['s3:GetBucketAcl', 's3:ListBucket'],
          Resource: [bucketArn],
        });

        policyStatements.push({
          Sid: 'Allow Organization principals to use the bucket',
          Effect: 'Allow',
          Principal: {
            AWS: '*',
          },
          Action: ['s3:GetBucketLocation', 's3:GetBucketAcl', 's3:PutObject', 's3:GetObject', 's3:ListBucket'],
          Resource: [bucketArn, `${bucketArn}/*`],
          Condition: {
            StringEquals: {
              ...principalOrgIdCondition,
            },
          },
        });

        policyStatements.push({
          Sid: 'Allow Organization use of the bucket for replication',
          Effect: 'Allow',
          Action: [
            's3:List*',
            's3:GetBucketVersioning',
            's3:PutBucketVersioning',
            's3:ReplicateDelete',
            's3:ReplicateObject',
            's3:ObjectOwnerOverrideToBucketOwner',
          ],
          Principal: {
            AWS: '*',
          },
          Resource: [bucketArn, `${bucketArn}/*`],
          Condition: {
            StringEquals: {
              ...principalOrgIdCondition,
            },
          },
        });

        awsPrincipalAccesses?.forEach(item => {
          if (item.name === 'SessionManager') {
            policyStatements.push({
              Sid: 'Allow Organization principals to put objects',
              Effect: 'Allow',
              Action: ['s3:PutObjectAcl', 's3:PutObject'],
              Principal: {
                AWS: '*',
              },
              Resource: [`${bucketArn}/*`],
              Condition: {
                StringEquals: {
                  ...principalOrgIdCondition,
                },
              },
            });

            policyStatements.push({
              Sid: 'Allow Organization principals to get encryption context and acl',
              Effect: 'Allow',
              Action: ['s3:GetEncryptionConfiguration', 's3:GetBucketAcl'],
              Principal: {
                AWS: '*',
              },
              Resource: [bucketArn],
              Condition: {
                StringEquals: {
                  ...principalOrgIdCondition,
                },
              },
            });
          } else {
            policyStatements.push({
              Sid: `Allow read write access for ${item.name} service principal`,
              Effect: 'Allow',
              Action: [
                's3:GetObject*',
                's3:GetBucket*',
                's3:List*',
                's3:DeleteObject*',
                's3:PutObject',
                's3:PutObjectLegalHold',
                's3:PutObjectRetention',
                's3:PutObjectTagging',
                's3:PutObjectVersionTagging',
                's3:Abort*',
              ],
              Principal: {
                Service: [item.principal],
              },
              Resource: [bucketArn, `${bucketArn}/*`],
            });
          }
        });
        break;
      case AcceleratorImportedBucketType.ELB_LOGS_BUCKET:
        let elbPrincipal: PrincipalOrgIdConditionType = {
          Service: ['logdelivery.elasticloadbalancing.amazonaws.com'],
        };

        if (elbAccountId) {
          elbPrincipal = {
            AWS: [`arn:${partition}:iam::${elbAccountId}:root`],
          };
        }

        policyStatements.push({
          Sid: 'Allow get acl access for SSM principal',
          Effect: 'Allow',
          Action: ['s3:GetBucketAcl'],
          Principal: {
            Service: ['ssm.amazonaws.com'],
          },
          Resource: [`${bucketArn}`],
        });

        policyStatements.push({
          Sid: 'Allow write access for ELB Account principal',
          Effect: 'Allow',
          Action: ['s3:PutObject'],
          Principal: elbPrincipal,
          Resource: [bucketArn, `${bucketArn}/*`],
        });

        policyStatements.push({
          Sid: 'Allow write access for delivery logging service principal',
          Effect: 'Allow',
          Action: ['s3:PutObject'],
          Principal: {
            Service: ['delivery.logs.amazonaws.com'],
          },
          Resource: [`${bucketArn}/*`],
          Condition: {
            StringEquals: {
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        });

        policyStatements.push({
          Sid: 'Allow read bucket ACL access for delivery logging service principal',
          Effect: 'Allow',
          Action: ['s3:GetBucketAcl'],
          Principal: {
            Service: ['delivery.logs.amazonaws.com'],
          },
          Resource: [`${bucketArn}`],
        });

        policyStatements.push({
          Sid: 'Allow Organization principals to use of the bucket',
          Effect: 'Allow',
          Action: ['s3:GetBucketLocation', 's3:PutObject'],
          Principal: {
            AWS: '*',
          },
          Resource: [bucketArn, `${bucketArn}/*`],
          Condition: {
            StringEquals: {
              ...principalOrgIdCondition,
            },
          },
        });
        break;
      case AcceleratorImportedBucketType.SERVER_ACCESS_LOGS_BUCKET:
        policyStatements.push({
          Sid: 'Allow write access for logging service principal',
          Effect: 'Allow',
          Action: ['s3:PutObject'],
          Principal: {
            Service: ['logging.s3.amazonaws.com'],
          },
          Resource: [`${bucketArn}/*`],
          Condition: {
            StringEquals: {
              'aws:SourceAccount': sourceAccount,
            },
          },
        });
        break;
      default:
        throw new Error(`Invalid bucket type ${bucketType}`);
    }
  }

  for (const bucketPolicyFilePath of bucketPolicyFilePaths) {
    const policyFile = path.join(__dirname, bucketPolicyFilePath);
    const policyContent: { Version?: string; Statement: PolicyStatementType[] } = JSON.parse(
      JSON.stringify(require(policyFile)),
    );

    for (const statement of policyContent.Statement) {
      policyStatements.push(statement);
    }
  }

  const policyDocument: { Version: string; Statement: PolicyStatementType[] } = {
    Version: '2012-10-17',
    Statement: policyStatements,
  };

  return JSON.stringify(policyDocument);
}

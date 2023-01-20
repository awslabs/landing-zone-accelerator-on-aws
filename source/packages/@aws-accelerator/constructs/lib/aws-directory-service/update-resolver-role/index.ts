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
  const executingAccountId = event.ResourceProperties['executingAccountId'];
  const partition = event.ResourceProperties['partition'];
  const roleName = event.ResourceProperties['roleName'];
  const route53ResolverRuleName = event.ResourceProperties['route53ResolverRuleName'];
  const targetIps = event.ResourceProperties['targetIps'];
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];

  let route53ResolverClient = new AWS.Route53Resolver({ customUserAgent: solutionId });

  const ruleOwnerId = await getRuleOwnerId(route53ResolverClient, route53ResolverRuleName);
  if (!ruleOwnerId) {
    throw new Error(`Resolver rule ${route53ResolverRuleName} owner id not found !!!`);
  }

  const stsClient = new AWS.STS({ customUserAgent: solutionId, region: region });
  if (ruleOwnerId !== executingAccountId) {
    const assumeRoleResponse = await throttlingBackOff(() =>
      stsClient
        .assumeRole({
          RoleArn: `arn:${partition}:iam::${ruleOwnerId}:role/${roleName}`,
          RoleSessionName: 'UpdateRuleAssumeSession',
        })
        .promise(),
    );

    route53ResolverClient = new AWS.Route53Resolver({
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
        secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
        sessionToken: assumeRoleResponse.Credentials?.SessionToken,
      },
      customUserAgent: solutionId,
    });
  }

  // const resolverRuleId = await getResolverId(route53ResolverClient, route53ResolverRuleName);
  const resolverRuleDetails = await getResolverRuleDetails(route53ResolverClient, route53ResolverRuleName);
  if (!resolverRuleDetails.ruleId) {
    throw new Error(`Resolver rule ${route53ResolverRuleName} not found !!!`);
  }

  if (!resolverRuleDetails.resolverEndpointId) {
    throw new Error(`Resolver endpoint not found for rule ${route53ResolverRuleName}!!!`);
  }

  const updatedDnsIps: { Ip: string; Port: number | undefined }[] = [];

  for (const targetIp of targetIps) {
    updatedDnsIps.push({ Ip: targetIp, Port: resolverRuleDetails.port });
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('start updateResolverRule');

      await throttlingBackOff(() =>
        route53ResolverClient
          .updateResolverRule({
            ResolverRuleId: resolverRuleDetails.ruleId!,
            Config: {
              Name: route53ResolverRuleName,
              ResolverEndpointId: resolverRuleDetails.resolverEndpointId!,
              TargetIps: updatedDnsIps,
            },
          })
          .promise(),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to get resolver rule owner Id
 * @param route53ResolverClient
 * @param route53ResolverRuleName
 * @returns
 */
async function getRuleOwnerId(
  route53ResolverClient: AWS.Route53Resolver,
  route53ResolverRuleName: string,
): Promise<string | undefined> {
  console.log('Start - getResolverId');
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      route53ResolverClient
        .listResolverRules({
          Filters: [{ Name: 'Name', Values: [route53ResolverRuleName] }],
          NextToken: nextToken,
        })
        .promise(),
    );

    if (page.ResolverRules && page.ResolverRules.length === 0) {
      throw new Error(`Resolver rule ${route53ResolverRuleName} not found !!!`);
    }

    for (const resolverRules of page.ResolverRules ?? []) {
      return resolverRules.OwnerId;
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return undefined;
}

/**
 * Function to get resolver rule details such as dns port, rule id ad endpoint id
 * @param route53ResolverClient
 * @param route53ResolverRuleName
 * @returns
 */
async function getResolverRuleDetails(
  route53ResolverClient: AWS.Route53Resolver,
  route53ResolverRuleName: string,
): Promise<{ resolverEndpointId: string | undefined; ruleId: string | undefined; port: number | undefined }> {
  console.log('Start - getResolverRuleDetails');
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      route53ResolverClient
        .listResolverRules({
          Filters: [{ Name: 'Name', Values: [route53ResolverRuleName] }],
          NextToken: nextToken,
        })
        .promise(),
    );

    if (page.ResolverRules && page.ResolverRules.length === 0) {
      throw new Error(`Resolver rule ${route53ResolverRuleName} not found !!!`);
    }

    for (const resolverRules of page.ResolverRules ?? []) {
      for (const targetIp of resolverRules.TargetIps ?? []) {
        return { resolverEndpointId: resolverRules.ResolverEndpointId, ruleId: resolverRules.Id, port: targetIp.Port };
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  throw new Error(`Resolver rule ${route53ResolverRuleName} not found !!!`);
}

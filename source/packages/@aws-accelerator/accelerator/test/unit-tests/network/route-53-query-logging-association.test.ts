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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AseaResourceType, VpcConfig } from '@aws-accelerator/config';
import { Route53ResolverQueryLoggingAssociation } from '../../../lib/asea-resources/route-53-query-logging-association';

/**
 * Regression coverage for GitLab issue #4873 defect 1 (ImportAseaResources synth).
 *
 * `updateRQLAssociation` derives a Route53 Resolver query-log association logical id
 * (e.g. `RqlAssocBug4873Vpc`) purely from the config VPC name. For an LZA-created VPC
 * that carries `vpcRoute53Resolver.queryLogs` but has no corresponding ASEA-imported
 * resource in the CloudFormation template, that derived logical id does not exist.
 *
 * The bug: the derived logical id was passed straight to `this.scope.getResource()`,
 * which is CDK's `CfnInclude.getResource()` — it THROWS `ResourceNotFoundInTemplate`
 * rather than returning `undefined`. That aborts the entire ImportAseaResourcesStack
 * synth for any organization that adds a new LZA VPC with query logging.
 *
 * The fix (route-53-query-logging-association.ts lines 51-54) looks the id up via
 * `importStackResources.getResourceByLogicalId(...)` first and `continue`s when it is
 * absent, so `getResource` is never reached for a non-imported VPC.
 *
 * These tests instantiate the handler WITHOUT its constructor (which runs the heavy
 * `AseaResource` base constructor + `getVpcsInScope`) and drive `updateRQLAssociation`
 * directly against a mock scope. Case ABSENT makes `getResource` THROW, so the test
 * fails loudly if the guard is ever removed.
 */
describe('Route53ResolverQueryLoggingAssociation.updateRQLAssociation (#4873 defect 1)', () => {
  const VPC_NAME = 'Bug4873Vpc';

  // Build the mock scope the method touches. getResource throws by default so the
  // ABSENT case proves the guard short-circuits before it is ever called.
  function buildMockScope() {
    return {
      importStackResources: {
        getResourceByLogicalId: vi.fn(),
      },
      getResource: vi.fn().mockImplementation(() => {
        throw new Error('ResourceNotFoundInTemplate');
      }),
      addLogs: vi.fn(),
      addSsmParameter: vi.fn(),
      addAseaResource: vi.fn(),
      getSsmPath: vi.fn().mockReturnValue('/accelerator/network/route53Resolver/queryLogConfigs/test/id'),
    };
  }

  // A config VPC that has query logging enabled. `account` is not embedded in the
  // name, so the logical id resolves via getAseaVpcName -> `RqlAssoc${name}`.
  const vpcItem = {
    name: VPC_NAME,
    account: 'Network',
    vpcRoute53Resolver: { queryLogs: { name: 'test-query-logs' } },
  } as unknown as VpcConfig;

  let mockScope: ReturnType<typeof buildMockScope>;
  let handler: Route53ResolverQueryLoggingAssociation;

  beforeEach(() => {
    mockScope = buildMockScope();
    // Instantiate without the constructor to avoid the AseaResource base + getVpcsInScope.
    handler = Object.create(Route53ResolverQueryLoggingAssociation.prototype);
    (handler as unknown as { scope: unknown }).scope = mockScope;
  });

  test('ABSENT: no imported resource -> does not throw, never calls getResource, writes nothing', () => {
    mockScope.importStackResources.getResourceByLogicalId.mockReturnValue(undefined);

    expect(() => handler.updateRQLAssociation([vpcItem])).not.toThrow();

    // The derived logical id (RqlAssocBug4873Vpc) is looked up in the import table...
    expect(mockScope.importStackResources.getResourceByLogicalId).toHaveBeenCalledWith('RqlAssoc' + VPC_NAME);
    // ...and because it is absent, getResource (which throws) must NEVER be reached.
    expect(mockScope.getResource).not.toHaveBeenCalled();
    // No SSM parameter or ASEA resource is recorded for a non-imported VPC.
    expect(mockScope.addSsmParameter).not.toHaveBeenCalled();
    expect(mockScope.addAseaResource).not.toHaveBeenCalled();
  });

  test('PRESENT: imported resource with resourceId -> records SSM parameter and ASEA resource', () => {
    mockScope.importStackResources.getResourceByLogicalId.mockReturnValue({
      logicalResourceId: 'RqlAssoc' + VPC_NAME,
      isDeleted: false,
    });
    mockScope.getResource.mockReturnValue({ resourceId: 'rqlc-test123' });

    handler.updateRQLAssociation([vpcItem]);

    expect(mockScope.getResource).toHaveBeenCalledWith('RqlAssoc' + VPC_NAME);
    expect(mockScope.addSsmParameter).toHaveBeenCalledTimes(1);
    expect(mockScope.addSsmParameter).toHaveBeenCalledWith(expect.objectContaining({ stringValue: 'rqlc-test123' }));
    expect(mockScope.addAseaResource).toHaveBeenCalledTimes(1);
    expect(mockScope.addAseaResource).toHaveBeenCalledWith(
      AseaResourceType.ROUTE_53_QUERY_LOGGING_ASSOCIATION,
      VPC_NAME,
    );
  });
});

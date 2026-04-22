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

import { describe, test, expect, beforeEach } from 'vitest';
import { NetworkConfig, VpcLatticeConfig } from '../../../lib/network-config';
import { VpcLatticeValidator } from '../../../validator/network-config-validator/vpc-lattice-validator';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

describe('VpcLatticeValidator', () => {
  let networkConfig: Partial<NetworkConfig>;
  let helpers: NetworkValidatorFunctions;

  beforeEach(() => {
    networkConfig = {
      vpcs: [
        {
          name: 'Main-VPC',
          account: 'Network',
          region: 'us-east-1',
          cidrs: ['10.0.0.0/16'],
        },
      ],
      vpcTemplates: [
        {
          name: 'Template-VPC',
          region: 'us-east-1',
          deploymentTargets: {
            organizationalUnits: ['Root'],
          },
        },
      ],
      vpcLattice: {
        serviceNetworks: [
          {
            name: 'main-service-network',
            account: 'Network',
            authType: 'NONE',
            shareTargets: undefined,
          },
        ],
        serviceAssociations: [
          {
            vpc: 'Main-VPC',
            serviceNetwork: 'main-service-network',
          },
          {
            vpc: 'Template-VPC',
            serviceNetwork: 'main-service-network',
          },
        ],
      } as VpcLatticeConfig,
    };

    helpers = new NetworkValidatorFunctions(
      networkConfig as NetworkConfig,
      ['Root'],
      [
        {
          name: 'Network',
          description: '',
          email: 'network@example.com',
          organizationalUnit: 'Infrastructure',
          warm: true,
          accountAlias: undefined,
        },
      ],
      [],
      ['us-east-1'],
    );
  });

  test('accepts valid config', () => {
    const errors: string[] = [];
    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);
    expect(errors.length).toBe(0);
  });

  test('rejects unknown account', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceNetworks[0].account = 'UnknownAccount';

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(1);
    expect(errors).toContain(
      '[VPC Lattice Service Network main-service-network]: Target account UnknownAccount does not exist in accounts-config.yaml file',
    );
  });

  test('rejects unknown VPC reference', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceAssociations![0].vpc = 'Ghost-VPC';

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(1);
    expect(errors).toContain(
      '[VPC Lattice Service Association Ghost-VPC -> main-service-network]: Target VPC Ghost-VPC does not exist in network-config.yaml file',
    );
  });

  test('resolves VPC template reference handling regression', () => {
    const errors: string[] = [];
    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);
    expect(errors.length).toBe(0);
  });

  test('rejects unknown service network reference', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceAssociations![0].serviceNetwork = 'Ghost-Network';

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(1);
    expect(errors).toContain(
      '[VPC Lattice Service Association Main-VPC -> Ghost-Network]: Target Service Network Ghost-Network is not declared in vpcLattice.serviceNetworks',
    );
  });

  test('rejects combined unknown VPC and unknown network', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceAssociations![0].vpc = 'Ghost-VPC';
    networkConfig.vpcLattice!.serviceAssociations![0].serviceNetwork = 'Ghost-Network';

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(2);
    expect(errors).toContain(
      '[VPC Lattice Service Association Ghost-VPC -> Ghost-Network]: Target VPC Ghost-VPC does not exist in network-config.yaml file',
    );
    expect(errors).toContain(
      '[VPC Lattice Service Association Ghost-VPC -> Ghost-Network]: Target Service Network Ghost-Network is not declared in vpcLattice.serviceNetworks',
    );
  });

  test('rejects duplicate service network names and lists them', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceNetworks.push({
      name: 'main-service-network',
      account: 'Network',
      authType: 'NONE',
    });

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(1);
    expect(errors).toContain('[VPC Lattice]: serviceNetworks contain duplicate names: main-service-network.');
  });

  test('rejects duplicate association pairs and lists them', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice!.serviceAssociations!.push({
      vpc: 'Main-VPC',
      serviceNetwork: 'main-service-network',
    });

    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);

    expect(errors.length).toBe(1);
    expect(errors).toContain(
      '[VPC Lattice]: serviceAssociations contain duplicate (vpc, serviceNetwork) pairs: Main-VPC -> main-service-network.',
    );
  });

  test('skips if no vpcLattice config', () => {
    const errors: string[] = [];
    networkConfig.vpcLattice = undefined;
    new VpcLatticeValidator(networkConfig as NetworkConfig, helpers, errors);
    expect(errors.length).toBe(0);
  });
});

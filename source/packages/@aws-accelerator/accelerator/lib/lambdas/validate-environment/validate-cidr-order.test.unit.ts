import { describe, expect, test } from '@jest/globals';
import { isCIDRConfig, isCIDRConfigArray, isCidrOrderValid } from './index';

describe('function validateCidrOrderForVpc', () => {
  type Cidr = string;
  type Cidrs = Cidr[];
  // Test case is [currentlyDeployedCidrs, toBeDeployedCidrs]
  type TestCase = [Cidrs | undefined, Cidrs | undefined];

  // The test is using letters, but the same logic applies as for CIDRs.

  const passingCases: TestCase[] = [
    // Empty to non-empty
    [[], ['a']],

    // Adding to the end
    [['a'], ['a', 'b']],
    [
      ['a', 'b'],
      ['a', 'b', 'c'],
    ],

    // Removing from the end and adding new
    [
      ['a', 'b'],
      ['a', 'c'],
    ],

    // Removing from the end
    [['a', 'c'], ['a']],

    // No change
    [
      ['a', 'b'],
      ['a', 'b'],
    ],

    // Removing all from the end
    [['a', 'b', 'c'], []],

    // Removing multiple from the end and adding multiple new
    [
      ['a', 'b', 'c'],
      ['a', 'd', 'e', 'f'],
    ],

    // Removing all and adding new
    [
      ['a', 'b'],
      ['c', 'd'],
    ],

    // Changing multiple elements at the end
    [
      ['a', 'b', 'c', 'd'],
      ['a', 'x', 'y', 'z'],
    ],
  ];

  const failingCases: TestCase[] = [
    // Changing the first element
    [['a'], ['b', 'a']],

    // Removing from the middle
    [
      ['a', 'b', 'c'],
      ['a', 'c', 'd'],
    ],

    // Inserting in the middle
    [
      ['a', 'b', 'c'],
      ['a', 'd', 'c'],
    ],

    // Removing from the middle without adding
    [
      ['a', 'b', 'c'],
      ['a', 'c'],
    ],

    // Reordering existing elements
    [
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
    ],

    // Changing a middle element
    [
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'e', 'd'],
    ],

    // Inserting at the beginning
    [
      ['b', 'c'],
      ['a', 'b', 'c'],
    ],

    // Removing from beginning and adding to end
    [
      ['a', 'b', 'c'],
      ['b', 'c', 'd'],
    ],

    // Changing multiple elements in the middle
    [
      ['a', 'b', 'c', 'd', 'e'],
      ['a', 'x', 'y', 'd', 'e'],
    ],
  ];

  describe('should pass validation for', () => {
    passingCases.forEach(([deployed, toBeDeployed]) =>
      test(`${JSON.stringify(deployed)} -> ${JSON.stringify(toBeDeployed)}`, () => {
        expect(isCidrOrderValid('test', deployed || [], toBeDeployed || [])).toBe(true);
      }),
    );
  });

  describe('should fail validation for', () => {
    failingCases.forEach(([deployed, toBeDeployed]) =>
      test(`${JSON.stringify(deployed)} -> ${JSON.stringify(toBeDeployed)}`, () => {
        expect(isCidrOrderValid('test', deployed || [], toBeDeployed || [])).toBe(false);
      }),
    );
  });
});

describe('function isCIDRConfigArray', () => {
  test('should accept a valid array', () => {
    const value = [
      {
        vpcName: 'Network/Network-Endpoints',
        logicalId: 'SsmParamNetworkVpcNetworkEndpointsCidRs',
        cidrs: ['10.1.4.0/22', '10.1.0.0/22'],
        parameterName: '/accelerator/validation/Network/network/vpc/Network/cidrs',
      },
    ];
    expect(isCIDRConfigArray(value)).toBe(true);
  });
});

describe('function isCIDRConfig', () => {
  test('should accept a valid array', () => {
    const value = {
      vpcName: 'Network/Network-Endpoints',
      logicalId: 'SsmParamNetworkVpcNetworkEndpointsCidRs',
      cidrs: ['10.1.4.0/22', '10.1.0.0/22'],
      parameterName: '/accelerator/validation/Network/network/vpc/Network/cidrs',
    };
    expect(isCIDRConfig(value)).toBe(true);
  });
});

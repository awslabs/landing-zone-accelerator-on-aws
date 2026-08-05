import { AccountsConfig } from '../../lib/accounts-config';
import {
  CustomizationsConfig,
  Ec2FirewallInstanceConfig,
  TargetGroupItemConfig,
} from '../../lib/customizations-config';
import { ICloudFormationStackSet } from '../../lib/models/customizations-config';
import { GlobalConfig } from '../../lib/global-config';
import { IamConfig } from '../../lib/iam-config';
import { NetworkConfig } from '../../lib/network-config';
import { SecurityConfig } from '../../lib/security-config';
import { OrganizationConfig } from '../../lib/organization-config';
import {
  CustomizationHelperMethods,
  CustomizationsConfigValidator,
  FirewallValidator,
} from '../../validator/customizations-config-validator';
import { describe, test, expect } from 'vitest';
import path from 'path';

const defaultFirewall: Ec2FirewallInstanceConfig = {
  name: 'Default Firewall',
  vpc: 'default-vpc',
  account: undefined,
  configDir: undefined,
  configFile: undefined,
  detailedMonitoring: undefined,
  licenseFile: undefined,
  staticReplacements: undefined,
  tags: undefined,
  terminationProtection: undefined,
  launchTemplate: {
    networkInterfaces: [{}],
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } as any,
};

const defaultTargetGroup: TargetGroupItemConfig = {
  name: 'Default Name',
  attributes: undefined,
  healthCheck: undefined,
  matcher: undefined,
  port: 4711,
  protocol: 'TCP',
  protocolVersion: undefined,
  shareTargets: undefined,
  targets: [],
  threshold: undefined,
  type: 'instance',
};

const defaultFirewalls: CustomizationsConfig['firewalls'] = {
  targetGroups: [defaultTargetGroup],
  autoscalingGroups: undefined,
  instances: [defaultFirewall],
  managerInstances: [],
};
const emptyFirewalls: CustomizationsConfig['firewalls'] = {
  targetGroups: [],
  autoscalingGroups: undefined,
  instances: [],
  managerInstances: [],
};

describe('FirewallValidator', () => {
  describe('validateFirewallTargetGroups', () => {
    test('should not when no firewalls are configured', () => {
      const errors: string[] = [];
      const validator = createFirewallValidator(errors);
      expect(validator).not.toBeUndefined();
      expect(errors).toHaveLength(0);
    });
    describe('using unsupported target', () => {
      test('alb should not add errors ', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...emptyFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'ALB based target group',
              type: 'alb',
              targets: [],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([
          `[Firewall target group ALB based target group]: target group must be of type 'instance' or 'ip'`,
        ]);
      });
      test('lambda should not add errors ', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...emptyFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'lambda based target group',
              type: 'lambda',
              targets: [],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([
          `[Firewall target group lambda based target group]: target group must be of type 'instance' or 'ip'`,
        ]);
      });
    });
    describe('using ip target', () => {
      test('should not errors when there is no target defined', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...defaultFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'IP based target group',
              type: 'ip',
              targets: [],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([]);
      });
      test('should add errors when target is not a valid ip', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...defaultFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'IP based target group',
              type: 'ip',
              targets: ['256.182.233.444'],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([`'256.182.233.444' is not a valid ip address.`]);
      });
      test('should add errors when target ips are a mix between IPv4 and IPv6', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...defaultFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'IP based target group',
              type: 'ip',
              targets: ['10.0.0.1', '2001:db8:1:ffff:ffff:ffff:ffff:fffe'],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([`Cannot mix IPv4 and IPv6 targets.`]);
      });
      test('should not add errors when targets consists of valid IPv4 ips', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...defaultFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'IP based target group',
              type: 'ip',
              targets: ['10.0.0.1', '10.0.0.2'],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([]);
      });
      test('should not add errors when targets consists of valid IPv6 ips', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...defaultFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'IP based target group',
              type: 'ip',
              targets: ['2001:db8:1:ffff:ffff:ffff:ffff:fffe', '2001:db8:2:ffff:ffff:ffff:ffff:fffe'],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([]);
      });
    });

    describe('using instance target', () => {
      test('should not add errors when there is no target defined', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...emptyFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'Instance based target group',
              type: 'instance',
              targets: [],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([]);
      });
      test('should add errors when target firewall instance is unknown', () => {
        const errors: string[] = [];
        const validator = createFirewallValidator(errors, {
          ...emptyFirewalls,
          targetGroups: [
            {
              ...defaultTargetGroup,
              name: 'Instance based target group',
              type: 'instance',
              targets: ['non-existing-firewall-instance'],
            },
          ],
        });
        expect(validator).not.toBeUndefined();
        expect(errors).toEqual([
          `[Firewall target group Instance based target group]: target group references firewall instance that does not exist`,
        ]);
      });
    });
    test('should add errors when target firewall instance exists but vpc does not', () => {
      const errors: string[] = [];
      const validator = createFirewallValidator(errors, {
        ...emptyFirewalls,
        instances: [
          {
            ...defaultFirewall,
            name: 'TheFirewall',
            vpc: 'NotTheRightVpc',
          },
        ],
        targetGroups: [
          {
            ...defaultTargetGroup,
            name: 'Instance based target group',
            type: 'instance',
            targets: ['TheFirewall'],
          },
        ],
      });
      expect(validator).not.toBeUndefined();
      expect(errors).toEqual([
        `[Firewall instance TheFirewall]: VPC NotTheRightVpc does not exist in network-config.yaml`,
      ]);
    });
    test('should add errors when target firewall instance exists but launch template is invalid', () => {
      const errors: string[] = [];
      const validator = createFirewallValidator(errors, {
        ...emptyFirewalls,
        instances: [
          {
            ...defaultFirewall,
            name: 'TheFirewall',
            launchTemplate: {
              ...defaultFirewall.launchTemplate,
              networkInterfaces: undefined,
            },
          },
        ],
        targetGroups: [
          {
            ...defaultTargetGroup,
            name: 'Instance based target group',
            type: 'instance',
            targets: ['TheFirewall'],
          },
        ],
      });
      expect(validator).not.toBeUndefined();
      expect(errors).toEqual([
        `[Firewall instance TheFirewall]: launch template must include at least one network interface configuration`,
      ]);
    });

    test('should pass validation with a valid config', () => {
      const errors: string[] = [];
      const validator = createFirewallValidator(errors, {
        ...emptyFirewalls,
        instances: [
          {
            ...defaultFirewall,
            name: 'TheFirewall',
          },
        ],
        targetGroups: [
          {
            ...defaultTargetGroup,
            name: 'Instance based target group',
            type: 'instance',
            targets: ['TheFirewall'],
          },
        ],
      });
      expect(validator).not.toBeUndefined();
      expect(errors).toEqual([]);
    });
  });

  describe('validateFirewallAsgs autoScalingGroupName', () => {
    const baseAsg = {
      name: 'TheAsg',
      vpc: 'default-vpc',
      launchTemplate: {
        networkInterfaces: [{}],
      },
      autoscaling: {
        name: 'asg-config',
        minSize: 1,
        maxSize: 2,
        desiredSize: 1,
        launchTemplate: 'lt',
        subnets: [],
        targetGroups: undefined,
      },
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } as any;

    function getAsgNameErrors(autoScalingGroupName: string | undefined): string[] {
      const errors: string[] = [];
      createFirewallValidator(errors, {
        ...emptyFirewalls,
        autoscalingGroups: [
          {
            ...baseAsg,
            autoscaling: {
              ...baseAsg.autoscaling,
              autoScalingGroupName,
            },
          },
        ],
      });
      return errors.filter(e => e.includes('autoScalingGroupName'));
    }

    test('should not add errors when autoScalingGroupName is undefined', () => {
      expect(getAsgNameErrors(undefined)).toEqual([]);
    });

    test('should not add errors when autoScalingGroupName is valid', () => {
      expect(getAsgNameErrors('prod-checkpoint-firewall-asg')).toEqual([]);
    });

    test('should add an error when autoScalingGroupName contains a colon', () => {
      const errors = getAsgNameErrors('prod:firewall:asg');
      expect(errors).toEqual([
        `Autoscaling group asg-config has an invalid autoScalingGroupName "prod:firewall:asg": name cannot contain a colon (:)`,
      ]);
    });

    test('should add an error when autoScalingGroupName contains a space (non-ASCII 33-126)', () => {
      const errors = getAsgNameErrors('prod firewall asg');
      expect(errors).toEqual([
        `Autoscaling group asg-config has an invalid autoScalingGroupName "prod firewall asg": name can only contain ASCII characters 33 to 126`,
      ]);
    });

    test('should add an error when autoScalingGroupName exceeds 255 characters', () => {
      const longName = 'a'.repeat(256);
      const errors = getAsgNameErrors(longName);
      expect(errors).toEqual([
        `Autoscaling group asg-config has an invalid autoScalingGroupName "${longName}": name must be between 1 and 255 characters`,
      ]);
    });
  });
});

function createFirewallValidator(
  errors: string[],
  firewalls: CustomizationsConfig['firewalls'] = emptyFirewalls,
): FirewallValidator {
  const values: CustomizationsConfig = {
    firewalls,
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } as any;
  const accountsConfig: AccountsConfig = {
    mandatoryAccounts: [],
    workloadAccounts: [],
    getManagementAccount: () => ({}),
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } as any;
  const networkConfig: NetworkConfig = {
    vpcs: [
      {
        name: 'default-vpc',
      },
    ],
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } as any;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  const securityConfig: SecurityConfig = {} as any;
  const configDir = '';
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  const iamConfig: IamConfig = {} as any;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  const globalConfig: GlobalConfig = {} as any;
  const helpers: CustomizationHelperMethods = new CustomizationHelperMethods(accountsConfig, iamConfig, globalConfig);
  return new FirewallValidator(values, networkConfig, securityConfig, accountsConfig, configDir, helpers, errors);
}

describe('CustomizationsConfigValidator - StackSet deployment targets', () => {
  function createStackSet(
    name: string,
    deploymentTargets: ICloudFormationStackSet['deploymentTargets'],
  ): ICloudFormationStackSet {
    return {
      name,
      deploymentTargets,
      regions: ['us-east-1'],
      template: path.basename(__filename),
    };
  }

  function runValidator(stackSets: ICloudFormationStackSet[]) {
    const values = {
      customizations: {
        cloudFormationStackSets: stackSets,
      },
    } as unknown as CustomizationsConfig;
    const accountsConfig = {
      mandatoryAccounts: [{ name: 'Management', organizationalUnit: 'Root' }],
      workloadAccounts: [{ name: 'Workload', organizationalUnit: 'PopulatedOU' }],
      getManagementAccount: () => ({ name: 'Management', organizationalUnit: 'Root' }),
    } as unknown as AccountsConfig;
    const globalConfig = {
      homeRegion: 'us-east-1',
      enabledRegions: ['us-east-1'],
    } as unknown as GlobalConfig;
    const organizationConfig = {
      organizationalUnits: [{ name: 'EmptyOU' }, { name: 'PopulatedOU' }],
    } as unknown as OrganizationConfig;

    return () =>
      new CustomizationsConfigValidator(
        values,
        accountsConfig,
        globalConfig,
        {} as IamConfig,
        { vpcs: [] } as unknown as NetworkConfig,
        organizationConfig,
        {} as SecurityConfig,
        __dirname,
      );
  }

  test('rejects a StackSet targeting an OU with no accounts', () => {
    const validate = runValidator([
      createStackSet('Empty-OU-StackSet', {
        organizationalUnits: ['EmptyOU'],
      }),
    ]);

    expect(validate).toThrow(
      'Deployment targets for CloudFormation StackSet Empty-OU-StackSet resolve to no active accounts. LZA supports only SELF_MANAGED StackSets, which require at least one active target account.',
    );
  });

  test('rejects a StackSet when exclusions remove every resolved account', () => {
    const validate = runValidator([
      createStackSet('Excluded-Accounts-StackSet', {
        organizationalUnits: ['PopulatedOU'],
        excludedAccounts: ['Workload'],
      }),
    ]);

    expect(validate).toThrow(
      'Deployment targets for CloudFormation StackSet Excluded-Accounts-StackSet resolve to no active accounts. LZA supports only SELF_MANAGED StackSets, which require at least one active target account.',
    );
  });

  test('accepts StackSets targeting a populated OU, explicit account, or Root', () => {
    const validate = runValidator([
      createStackSet('Populated-OU-StackSet', {
        organizationalUnits: ['PopulatedOU'],
      }),
      createStackSet('Explicit-Account-StackSet', {
        accounts: ['Management'],
      }),
      createStackSet('Root-StackSet', {
        organizationalUnits: ['Root'],
      }),
    ]);

    expect(validate).not.toThrow();
  });
});

describe('CustomizationsConfigValidator - ALB listener targetGroup requirements', () => {
  function runValidator(listeners: unknown[]) {
    const values: CustomizationsConfig = {
      applications: [
        {
          name: 'app-alb-test',
          vpc: 'alb-vpc',
          deploymentTargets: { accounts: ['Network'], organizationalUnits: [] },
          targetGroups: [{ name: 'tg-1', port: 80, protocol: 'HTTP', type: 'instance' }],
          applicationLoadBalancer: {
            name: 'test-alb',
            subnets: ['SubnetA', 'SubnetB'],
            securityGroups: ['sg'],
            listeners,
          },
        },
      ],
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } as any;
    const accountsConfig: AccountsConfig = {
      mandatoryAccounts: [{ name: 'Network' }],
      workloadAccounts: [],
      getManagementAccount: () => ({}),
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const networkConfig: NetworkConfig = { vpcs: [{ name: 'alb-vpc' }] } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const globalConfig: GlobalConfig = { homeRegion: 'us-east-1', enabledRegions: ['us-east-1'] } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const iamConfig: IamConfig = {} as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const securityConfig: SecurityConfig = {} as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const organizationConfig: OrganizationConfig = { organizationalUnits: [] } as any;
    return () =>
      new CustomizationsConfigValidator(
        values,
        accountsConfig,
        globalConfig,
        iamConfig,
        networkConfig,
        organizationConfig,
        securityConfig,
        '',
      );
  }

  test('forward listener without targetGroup throws a targetGroup error', () => {
    expect(runValidator([{ name: 'fwd', port: 80, protocol: 'HTTP', type: 'forward' }])).toThrow(
      /listener fwd is type 'forward' but has no targetGroup/,
    );
  });

  test('redirect listener without targetGroup does not throw a targetGroup error', () => {
    try {
      runValidator([
        {
          name: 'redir',
          port: 80,
          protocol: 'HTTP',
          type: 'redirect',
          redirectConfig: { statusCode: 'HTTP_301', protocol: 'HTTPS', port: 443 },
        },
      ])();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/has no targetGroup/);
      expect((e as Error).message).not.toMatch(/target groups that are not defined/);
    }
  });

  test('fixed-response listener without targetGroup does not throw a targetGroup error', () => {
    try {
      runValidator([
        {
          name: 'fixed',
          port: 80,
          protocol: 'HTTP',
          type: 'fixed-response',
          fixedResponseConfig: { statusCode: '200', contentType: 'text/plain', messageBody: 'OK' },
        },
      ])();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/has no targetGroup/);
      expect((e as Error).message).not.toMatch(/target groups that are not defined/);
    }
  });

  test('forward listener with targetGroup does not throw a targetGroup error', () => {
    try {
      runValidator([{ name: 'fwd', port: 80, protocol: 'HTTP', type: 'forward', targetGroup: 'tg-1' }])();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/has a targetGroup/);
      expect((e as Error).message).not.toMatch(/has no targetGroup/);
    }
  });

  test('redirect listener with targetGroup throws a targetGroup error', () => {
    expect(
      runValidator([
        {
          name: 'redir',
          port: 80,
          protocol: 'HTTP',
          type: 'redirect',
          targetGroup: 'tg-1',
          redirectConfig: { statusCode: 'HTTP_301', protocol: 'HTTPS', port: 443 },
        },
      ]),
    ).toThrow(/listener redir is type 'redirect' but has a targetGroup/);
  });

  test('fixed-response listener with targetGroup throws a targetGroup error', () => {
    expect(
      runValidator([
        {
          name: 'fixed',
          port: 80,
          protocol: 'HTTP',
          type: 'fixed-response',
          targetGroup: 'tg-1',
          fixedResponseConfig: { statusCode: '200', contentType: 'text/plain', messageBody: 'OK' },
        },
      ]),
    ).toThrow(/listener fixed is type 'fixed-response' but has a targetGroup/);
  });
});

describe('CustomizationsConfigValidator - application autoScalingGroupName validation', () => {
  function runValidator(autoScalingGroupName: string | undefined) {
    const values: CustomizationsConfig = {
      applications: [
        {
          name: 'app-asg-test',
          vpc: 'asg-vpc',
          deploymentTargets: { accounts: ['Network'], organizationalUnits: [] },
          autoscaling: {
            name: 'app-asg-config',
            autoScalingGroupName,
            minSize: 1,
            maxSize: 2,
            desiredSize: 1,
            launchTemplate: 'lt',
            subnets: [],
            targetGroups: undefined,
          },
        },
      ],
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } as any;
    const accountsConfig: AccountsConfig = {
      mandatoryAccounts: [{ name: 'Network' }],
      workloadAccounts: [],
      getManagementAccount: () => ({}),
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const networkConfig: NetworkConfig = { vpcs: [{ name: 'asg-vpc' }] } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const globalConfig: GlobalConfig = { homeRegion: 'us-east-1', enabledRegions: ['us-east-1'] } as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const iamConfig: IamConfig = {} as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const securityConfig: SecurityConfig = {} as any;
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    const organizationConfig: OrganizationConfig = { organizationalUnits: [] } as any;
    return () =>
      new CustomizationsConfigValidator(
        values,
        accountsConfig,
        globalConfig,
        iamConfig,
        networkConfig,
        organizationConfig,
        securityConfig,
        '',
      );
  }

  test('application ASG with a colon in autoScalingGroupName fails config validation', () => {
    expect(runValidator('prod:app:asg')).toThrow(
      /Autoscaling group app-asg-config has an invalid autoScalingGroupName "prod:app:asg": name cannot contain a colon/,
    );
  });

  test('application ASG with a >255 character autoScalingGroupName fails config validation', () => {
    const longName = 'a'.repeat(256);
    expect(runValidator(longName)).toThrow(
      /Autoscaling group app-asg-config has an invalid autoScalingGroupName ".*": name must be between 1 and 255 characters/,
    );
  });

  test('application ASG with a valid autoScalingGroupName produces no autoScalingGroupName error', () => {
    try {
      runValidator('prod-app-asg')();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/invalid autoScalingGroupName/);
    }
  });
});

import { AccountsConfig } from '../../lib/accounts-config';
import {
  CustomizationsConfig,
  Ec2FirewallInstanceConfig,
  TargetGroupItemConfig,
} from '../../lib/customizations-config';
import { GlobalConfig } from '../../lib/global-config';
import { IamConfig } from '../../lib/iam-config';
import { NetworkConfig } from '../../lib/network-config';
import { SecurityConfig } from '../../lib/security-config';
import { CustomizationHelperMethods, FirewallValidator } from '../../validator/customizations-config-validator';

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

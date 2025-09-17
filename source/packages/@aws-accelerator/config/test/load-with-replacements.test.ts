import { AccountsConfig } from '../lib/accounts-config';
import { GlobalConfig } from '../lib/global-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';
import { ISecurityHubStandardConfig } from '../lib/models/security-config';
import { IamConfig } from '../lib/iam-config';
import { NetworkConfig } from '../lib/network-config';
import { CustomizationsConfig } from '../lib/customizations-config';
import { GlobalConfigValidator } from '../validator/global-config-validator';
import { IamConfigValidator } from '../validator/iam-config-validator';
import { NetworkConfigValidator } from '../validator/network-config-validator/network-config-validator';
import { OrganizationConfigValidator } from '../validator/organization-config-validator';
import { SecurityConfigValidator } from '../validator/security-config-validator';
import { CustomizationsConfigValidator } from '../validator/customizations-config-validator';
import { AccountsConfigValidator } from '../validator/accounts-config-validator';
import { ReplacementsConfigValidator } from '../validator/replacements-config-validator';
import { ReplacementsConfig } from '../lib/replacements-config';
import { describe, it, expect } from 'vitest';

import { REPLACEMENT_CONFIG } from './config-test-helper';

/*
 * Test config making extensive use of replacements is in configDir folder.
 * This test will load the config and validate it.
 * We define constants with the value of replacements to confirm replacements are processed.
 */
const configDir = REPLACEMENT_CONFIG;
enum SecurityStandards {
  PCI_DSS = 'PCI DSS v3.2.1',
}
const replacementsCoreOUs = ['Security', 'Infrastructure'];
const replacementsPciControlsToDisable = ['PCI.IAM.3', 'PCI.S3.3', 'PCI.EC2.3', 'PCI.Lambda.2'];
const replacementsHomeRegion = 'us-east-1';
const replacementsNonHomeEnabledRegions = ['us-west-2', 'ca-central-1'];
const replacementsAllEnabledRegions = [replacementsHomeRegion, ...replacementsNonHomeEnabledRegions];
const replacementsManagementAccountId = '111111111111';

const loadConfigs = async () => {
  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
  const globalConfig = GlobalConfig.load(configDir, replacementsConfig);
  const iamConfig = IamConfig.load(configDir, replacementsConfig);
  const organizationConfig = OrganizationConfig.load(configDir, replacementsConfig);
  const securityConfig = SecurityConfig.load(configDir, replacementsConfig);
  const networkConfig = NetworkConfig.load(configDir, replacementsConfig);
  const customizationsConfig = CustomizationsConfig.load(configDir, replacementsConfig);

  return {
    accountsConfig,
    customizationsConfig,
    globalConfig,
    iamConfig,
    networkConfig,
    organizationConfig,
    replacementsConfig,
    securityConfig,
  };
};
describe('load-with-replacements', async () => {
  const {
    globalConfig,
    accountsConfig,
    iamConfig,
    organizationConfig,
    networkConfig,
    securityConfig,
    replacementsConfig,
    customizationsConfig,
  } = await loadConfigs();

  describe('Global Config', () => {
    it('should load global', async () => {
      expect(globalConfig).toBeDefined();
    });

    it('should be valid', async () => {
      expect(() => {
        new GlobalConfigValidator(
          globalConfig,
          accountsConfig,
          iamConfig,
          organizationConfig,
          securityConfig,
          configDir,
        );
      }).not.toThrow();
    });

    it('should process string list replacements', async () => {
      // when a StringList replacement is used within a YAML list (i.e. [{{REPLACEMENT}}]), it should be rendered as a list
      expect(globalConfig).toBeDefined();
      expect(globalConfig.logging.cloudwatchLogs?.dataProtection?.deploymentTargets?.organizationalUnits).toEqual(
        replacementsCoreOUs,
      );
      expect(globalConfig.homeRegion).toEqual(replacementsHomeRegion);
      expect(globalConfig.enabledRegions).toEqual(replacementsAllEnabledRegions);
    });

    it('should process account replacement', async () => {
      expect(globalConfig.tags.find(tag => tag.key === 'MgmtAccount')?.value).toEqual(replacementsManagementAccountId);
    });

    it('should process ssm replacement with placeholders', async () => {
      // in validate mode, the replacement value for SSM parameter is not loaded
      // we expect the value to equal the key
      expect(globalConfig.tags.find(tag => tag.key === 'ssm-replacement')?.value).toEqual('ssmparam');
    });

    it('should process string list replacements provided as a string value', async () => {
      // when a StringList replacement is used within a string value, it should be rendered as a comma-separated list
      expect(globalConfig.tags.find(tag => tag.key === 'AllRegions')?.value).toEqual(
        replacementsAllEnabledRegions.toString(),
      );
    });
  });

  describe('Iam Config', () => {
    it('should load', async () => {
      expect(iamConfig).toBeDefined();
    });

    it('should be valid', async () => {
      const { iamConfig, accountsConfig, networkConfig, organizationConfig, securityConfig } = await loadConfigs();
      expect(() => {
        new IamConfigValidator(
          iamConfig,
          accountsConfig,
          networkConfig,
          organizationConfig,
          securityConfig,
          configDir,
        ).validate();
      }).not.toThrow();
    });
  });

  describe('Organization Config', () => {
    it('should load organization config with string list replacements', async () => {
      expect(organizationConfig).toBeDefined();
      expect(organizationConfig.enable).toBeDefined();
      expect(organizationConfig.chatbotPolicies?.[0].deploymentTargets.organizationalUnits).toEqual(
        replacementsCoreOUs,
      );
    });

    it('should be valid', async () => {
      expect(() => {
        new OrganizationConfigValidator(organizationConfig, replacementsConfig, configDir);
      }).not.toThrow();
    });
  });

  describe('Security Config', () => {
    it('should load security config with string list replacements', async () => {
      expect(securityConfig).toBeDefined();
      expect(securityConfig.centralSecurityServices.securityHub.standards).toBeDefined();
      const pciStandard = securityConfig.centralSecurityServices.securityHub.standards.find(
        (standard: ISecurityHubStandardConfig) => standard.name === SecurityStandards.PCI_DSS,
      );
      expect(pciStandard?.controlsToDisable).toEqual(replacementsPciControlsToDisable);
    });

    it('should be valid', async () => {
      expect(() => {
        new SecurityConfigValidator(
          securityConfig,
          accountsConfig,
          globalConfig,
          organizationConfig,
          replacementsConfig,
          configDir,
        );
      }).not.toThrow();
    });
  });

  describe('Network Config', () => {
    it('should load', async () => {
      expect(networkConfig).toBeDefined();
    });

    it('should be valid', async () => {
      expect(() => {
        new NetworkConfigValidator(
          networkConfig,
          accountsConfig,
          globalConfig,
          organizationConfig,
          securityConfig,
          replacementsConfig,
          configDir,
          customizationsConfig,
        );
      }).not.toThrow();
    });
  });

  describe('Customizations Config', () => {
    it('should load', async () => {
      expect(customizationsConfig).toBeDefined();
    });

    it('should be valid', async () => {
      expect(() => {
        new CustomizationsConfigValidator(
          customizationsConfig,
          accountsConfig,
          globalConfig,
          iamConfig,
          networkConfig,
          organizationConfig,
          securityConfig,
          configDir,
        );
      }).not.toThrow();
    });
  });

  describe('Accounts Config', () => {
    it('should load', async () => {
      expect(accountsConfig).toBeDefined();
    });

    it('should be valid', async () => {
      expect(() => {
        new AccountsConfigValidator(accountsConfig, organizationConfig);
      }).not.toThrow();
    });
  });

  describe('Replacements Config', () => {
    it('should load', async () => {
      expect(replacementsConfig).toBeDefined();
    });

    it('should be valid', async () => {
      expect(() => {
        new ReplacementsConfigValidator(replacementsConfig, configDir);
      }).not.toThrow();
    });
  });
});

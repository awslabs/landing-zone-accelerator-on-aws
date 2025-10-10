import { AccountsConfig } from '../../../../lib/accounts-config';
import { GlobalConfig } from '../../../../lib/global-config';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { SecurityConfig } from '../../../../lib/security-config';
import { IamConfig } from '../../../../lib/iam-config';
import { GlobalConfigValidator } from '../../../../validator/global-config-validator';
import { ReplacementsConfig } from '../../../../lib/replacements-config';

import { describe, it, expect } from '@jest/globals';
import * as path from 'path';

const setup = (deployOrder: string) => {
  const configDir = './test/validation/global-config/regional-deploy/config';

  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
  const globalConfig = GlobalConfig.load(path.resolve(configDir), replacementsConfig);
  const iamConfig = IamConfig.load(path.resolve(configDir), replacementsConfig);
  const orgConfig = OrganizationConfig.load(path.resolve(configDir), replacementsConfig);
  const securityConfig = SecurityConfig.load(path.resolve(configDir), replacementsConfig);

  return function regionalDeployOrderMismatchError() {
    new GlobalConfigValidator(
      globalConfig,
      accountsConfig,
      iamConfig,
      orgConfig,
      securityConfig,
      configDir,
      deployOrder,
    );
  };
};

describe('GlobalConfigValidator', () => {
  it('should throw error when deploy order region is not part of enabled region', () => {
    const errMsg = `global-config.yaml has 1 issues:\nRegion us-west-1 is missing in the region by region deploy order.`;

    expect(setup('eu-central-1,us-east-1')).toThrow(new Error(errMsg));
  });

  it('should throw error when not all enabled region in deploy order', () => {
    const errMsg = `global-config.yaml has 1 issues:\nRegion eu-west-1 is not part of enabled regions.`;

    expect(setup('eu-central-1,us-east-1,us-west-1,eu-west-1')).toThrow(new Error(errMsg));
  });

  it('should pass when deploy order covers all enabled region', () => {
    expect(setup('eu-central-1,us-east-1,us-west-1')).not.toThrow();
  });
});

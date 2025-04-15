import { AccountsConfig } from '../../../lib/accounts-config';
import { GlobalConfig } from '../../../lib/global-config';
import { ReplacementsConfig } from '../../../lib/replacements-config';
import { ReplacementsConfigValidator } from '../../../validator/replacements-config-validator';

import { describe, it, expect } from '@jest/globals';
import * as path from 'path';

const loadConfigs = (configDir: string) => {
  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
  const globalConfig = GlobalConfig.load(path.resolve(configDir), replacementsConfig);

  return {
    globalConfig,
    replacementsConfig,
  };
};

describe('Replacements Config', () => {
  it('Validation should fail for undefined placeholder', () => {
    const configDir = './test/validation/replacements/invalid-config';

    const { replacementsConfig } = loadConfigs(configDir);
    expect(() => {
      new ReplacementsConfigValidator(replacementsConfig, configDir);
    }).toThrow();
  });

  it('Validation should pass if undefined placeholder is commented', () => {
    const configDir = './test/validation/replacements/valid-config';

    const { replacementsConfig } = loadConfigs(configDir);
    expect(() => {
      new ReplacementsConfigValidator(replacementsConfig, configDir);
    }).not.toThrow();
  });
});

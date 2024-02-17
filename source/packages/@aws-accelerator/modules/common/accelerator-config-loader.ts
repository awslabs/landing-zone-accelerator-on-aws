import { AccountsConfig, GlobalConfig, OrganizationConfig, SecurityConfig } from '@aws-accelerator/config';

/**
 * Accelerator all configuration types
 */
export type AllConfigType = {
  globalConfig: GlobalConfig;
  organizationConfig: OrganizationConfig;
  accountsConfig: AccountsConfig;
  securityConfig: SecurityConfig;
};

/**
 * AcceleratorConfigLoader an abstract class to load all configuration for module operation
 */
export abstract class AcceleratorConfigLoader {
  /**
   * Function to load accounts config with account Ids
   * @param configDirPath
   * @param partition
   * @param orgsEnabled
   * @returns
   */
  public static async getAccountsConfigWithAccountIds(
    configDirPath: string,
    partition: string,
    orgsEnabled?: boolean,
  ): Promise<AccountsConfig> {
    const accountsConfig = AccountsConfig.load(configDirPath);
    await accountsConfig.loadAccountIds(partition, false, orgsEnabled ?? true, accountsConfig);
    return accountsConfig;
  }

  /**
   * Function to get all configurations
   * @param configDirPath string
   * @param partition string
   * @returns configs {@link AllConfigType}
   */
  public static async getAllConfig(configDirPath: string, partition: string): Promise<AllConfigType> {
    const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;
    return {
      globalConfig: GlobalConfig.load(configDirPath),
      organizationConfig: OrganizationConfig.load(configDirPath),
      accountsConfig: await AcceleratorConfigLoader.getAccountsConfigWithAccountIds(
        configDirPath,
        partition,
        orgsEnabled,
      ),
      securityConfig: SecurityConfig.load(configDirPath),
    };
  }
}

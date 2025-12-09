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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
  ControlTowerLandingZoneConfig,
} from '@aws-accelerator/config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';

/**
 * Options for ConfigGenerator
 */
export interface ConfigGeneratorOptions {
  /**
   * Email address for the management account
   */
  readonly managementAccountEmail: string;
  /**
   * Email address for the log archive account
   */
  readonly logArchiveAccountEmail: string;
  /**
   * Email address for the audit account
   */
  readonly auditAccountEmail: string;
  /**
   * AWS region for the home region
   */
  readonly homeRegion: string;
  /**
   * Whether Control Tower is enabled
   */
  readonly controlTowerEnabled: boolean;
  /**
   * Whether to enable single account mode (no AWS Organizations)
   */
  readonly enableSingleAccountMode: boolean;
  /**
   * Optional Control Tower Landing Zone configuration
   */
  readonly controlTowerLandingZoneConfig?: ControlTowerLandingZoneConfig;
}

/**
 * Result of config generation
 */
export interface ConfigGeneratorResult {
  /**
   * Path to the temporary directory containing generated configs
   */
  readonly tempDirPath: string;
  /**
   * Path to the generated zip file
   */
  readonly zipFilePath: string;
  /**
   * List of generated config file names
   */
  readonly configFiles: string[];
}

/**
 * Expected config file names
 */
export const CONFIG_FILE_NAMES = [
  GlobalConfig.FILENAME,
  AccountsConfig.FILENAME,
  IamConfig.FILENAME,
  NetworkConfig.FILENAME,
  OrganizationConfig.FILENAME,
  SecurityConfig.FILENAME,
];

/**
 * Standalone class to generate LZA configuration files
 * Extracted from ConfigRepository for use outside of CDK context
 */
export class ConfigGenerator {
  private readonly options: ConfigGeneratorOptions;
  private tempDirPath: string | undefined;

  constructor(options: ConfigGeneratorOptions) {
    this.validateOptions(options);
    this.options = options;
  }

  /**
   * Validate required options
   */
  private validateOptions(options: ConfigGeneratorOptions): void {
    const requiredFields: (keyof ConfigGeneratorOptions)[] = [
      'managementAccountEmail',
      'logArchiveAccountEmail',
      'auditAccountEmail',
      'homeRegion',
    ];

    const missingFields = requiredFields.filter(field => !options[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required options: ${missingFields.join(', ')}`);
    }

    // Additional validation for homeRegion to prevent undefined values
    if (!options.homeRegion || options.homeRegion.trim() === '') {
      throw new Error(
        `homeRegion is required and cannot be empty. Ensure AWS_REGION environment variable is properly set. ` +
          `Current homeRegion value: '${options.homeRegion}'`,
      );
    }
  }

  /**
   * Generate all LZA configuration files to a temporary directory
   * @returns Array of generated config file names
   */
  public generateConfigs(): string[] {
    this.tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-config-'));

    const managementAccountAccessRole = this.options.controlTowerEnabled
      ? 'AWSControlTowerExecution'
      : 'OrganizationAccountAccessRole';

    // Generate global-config.yaml
    // Extract only the config properties to avoid serializing internal class properties like iamRoleSsmParameters
    const globalConfig = new GlobalConfig({
      homeRegion: this.options.homeRegion,
      controlTower: {
        enable: this.options.controlTowerEnabled,
        landingZone: this.options.controlTowerLandingZoneConfig,
      },
      managementAccountAccessRole: managementAccountAccessRole,
      useV2Stacks: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { iamRoleSsmParameters, ...globalConfigWithoutInternals } = globalConfig;
    fs.writeFileSync(
      path.join(this.tempDirPath, GlobalConfig.FILENAME),
      yaml.dump(globalConfigWithoutInternals),
      'utf8',
    );

    // Generate accounts-config.yaml
    // Extract only the config properties to avoid serializing internal class properties
    const accountsConfig = new AccountsConfig({
      managementAccountEmail: this.options.managementAccountEmail,
      logArchiveAccountEmail: this.options.logArchiveAccountEmail,
      auditAccountEmail: this.options.auditAccountEmail,
    });
    fs.writeFileSync(
      path.join(this.tempDirPath, AccountsConfig.FILENAME),
      yaml.dump({
        mandatoryAccounts: accountsConfig.mandatoryAccounts,
        workloadAccounts: accountsConfig.workloadAccounts,
      }),
      'utf8',
    );

    // Generate iam-config.yaml
    fs.writeFileSync(path.join(this.tempDirPath, IamConfig.FILENAME), yaml.dump(new IamConfig()), 'utf8');

    // Generate network-config.yaml
    fs.writeFileSync(path.join(this.tempDirPath, NetworkConfig.FILENAME), yaml.dump(new NetworkConfig()), 'utf8');

    // Generate organization-config.yaml
    if (this.options.enableSingleAccountMode) {
      const orgConfig = new OrganizationConfig({
        enable: false,
        organizationalUnits: [
          { name: 'Security', ignore: undefined },
          { name: 'LogArchive', ignore: undefined },
        ],
        organizationalUnitIds: [],
        serviceControlPolicies: [],
        taggingPolicies: [],
        chatbotPolicies: [],
        backupPolicies: [],
      });
      fs.writeFileSync(path.join(this.tempDirPath, OrganizationConfig.FILENAME), yaml.dump(orgConfig), 'utf8');
    } else {
      fs.writeFileSync(
        path.join(this.tempDirPath, OrganizationConfig.FILENAME),
        yaml.dump(new OrganizationConfig()),
        'utf8',
      );
    }

    // Generate security-config.yaml
    fs.writeFileSync(path.join(this.tempDirPath, SecurityConfig.FILENAME), yaml.dump(new SecurityConfig()), 'utf8');

    return CONFIG_FILE_NAMES;
  }

  /**
   * Create a zip archive of the generated config files
   * @returns Path to the created zip file
   */
  public createZipArchive(): string {
    if (!this.tempDirPath) {
      throw new Error('Config files have not been generated. Call generateConfigs() first.');
    }

    return this.createZipArchiveFromPath(this.tempDirPath);
  }

  /**
   * Create a zip archive from config files in a specified directory
   * @param dirPath - Path to the directory containing config files
   * @returns Path to the created zip file
   */
  public createZipArchiveFromPath(dirPath: string): string {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const zippedDir = path.join(dirPath, 'zipped');
    fs.mkdirSync(zippedDir, { recursive: true });

    const zipFilePath = path.join(zippedDir, 'aws-accelerator-config.zip');
    const admZip = new AdmZip();

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const fileData = fs.readFileSync(filePath);
        admZip.addFile(file, fileData);
      }
    }

    admZip.writeZip(zipFilePath);
    return zipFilePath;
  }

  /**
   * Get the temporary directory path
   */
  public getTempDirPath(): string | undefined {
    return this.tempDirPath;
  }

  /**
   * Clean up the temporary directory
   */
  public cleanup(): void {
    if (this.tempDirPath && fs.existsSync(this.tempDirPath)) {
      fs.rmSync(this.tempDirPath, { recursive: true, force: true });
      this.tempDirPath = undefined;
    }
  }
}

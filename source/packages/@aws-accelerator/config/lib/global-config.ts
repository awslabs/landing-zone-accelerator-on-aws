/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import * as t from './common-types';

/**
 * Global configuration items.
 */
export abstract class GlobalConfigTypes {
  static readonly controlTowerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly cloudtrailConfig = t.interface({
    enable: t.boolean,
    organizationTrail: t.boolean,
  });

  static readonly sessionManagerConfig = t.interface({
    sendToCloudWatchLogs: t.boolean,
    sendToS3: t.boolean,
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    cloudtrail: GlobalConfigTypes.cloudtrailConfig,
    sessionManager: GlobalConfigTypes.sessionManagerConfig,
  });

  static readonly identityPerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly resourcePerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly networkPerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly dataProtectionConfig = t.interface({
    enable: t.boolean,
    identityPerimeter: this.identityPerimeterConfig,
    resourcePerimeter: this.resourcePerimeterConfig,
    networkPerimeter: this.networkPerimeterConfig,
  });

  static readonly artifactTypeEnum = t.enums('ArtifactType', ['REDSHIFT', 'QUICKSIGHT', 'ATHENA']);

  static readonly costAndUsageReportConfig = t.interface({
    additionalSchemaElements: t.optional(t.array(t.nonEmptyString)),
    compression: t.enums('CompressionType', ['ZIP', 'GZIP', 'Parquet']),
    format: t.enums('FormatType', ['textORcsv', 'Parquet']),
    reportName: t.nonEmptyString,
    s3Prefix: t.nonEmptyString,
    timeUnit: t.enums('TimeCoverageType', ['HOURLY', 'DAILY', 'MONTHLY']),
    additionalArtifacts: t.optional(t.array(this.artifactTypeEnum)),
    refreshClosedReports: t.boolean,
    reportVersioning: t.enums('VersioningType', ['CREATE_NEW_REPORT', 'OVERWRITE_REPORT']),
  });

  static readonly notificationConfig = t.interface({
    notificationType: t.enums('NotificationType', ['ACTUAL', 'FORECASTED']),
    thresholdType: t.enums('ThresholdType', ['PERCENTAGE', 'ABSOLUTE_VALUE']),
    comparisonOperator: t.enums('ComparisonType', ['GREATER_THAN', 'LESS_THAN', 'EQUAL_TO']),
    threshold: t.optional(t.number),
  });

  static readonly budgetsConfig = t.interface({
    amount: t.number,
    budgetName: t.nonEmptyString,
    budgetType: t.enums('NotificationType', [
      'USAGE',
      'COST',
      'RI_UTILIZATION',
      'RI_COVERAGE',
      'SAVINGS_PLANS_UTILIZATION',
      'SAVINGS_PLANS_COVERAGE',
    ]),
    timeUnit: t.enums('TimeUnitType', ['DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
    address: t.optional(t.nonEmptyString),
    includeUpfront: t.optional(t.boolean),
    includeTax: t.optional(t.boolean),
    includeSupport: t.optional(t.boolean),
    includeSubscription: t.optional(t.boolean),
    includeRecurring: t.optional(t.boolean),
    includeOtherSubscription: t.optional(t.boolean),
    includeCredit: t.optional(t.boolean),
    includeDiscount: t.optional(t.boolean),
    includeRefund: t.optional(t.boolean),
    useAmortized: t.optional(t.boolean),
    useBlended: t.optional(t.boolean),
    notification: t.optional(this.notificationConfig),
    subscriptionType: t.enums('SubscriptionType', ['EMAIL', 'SNS']),
    unit: t.optional(t.nonEmptyString),
  });

  static readonly reportConfig = t.interface({
    costAndUsageReport: t.optional(this.costAndUsageReportConfig),
    budgets: t.optional(this.budgetsConfig),
  });

  static readonly globalConfig = t.interface({
    homeRegion: t.nonEmptyString,
    enabledRegions: t.array(t.region),
    managementAccountAccessRole: t.nonEmptyString,
    controlTower: GlobalConfigTypes.controlTowerConfig,
    logging: GlobalConfigTypes.loggingConfig,
    dataProtection: t.optional(GlobalConfigTypes.dataProtectionConfig),
    reports: t.optional(GlobalConfigTypes.reportConfig),
  });
}

export class ControlTowerConfig implements t.TypeOf<typeof GlobalConfigTypes.controlTowerConfig> {
  readonly enable = true;
}

export class CloudtrailConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudtrailConfig> {
  readonly enable = false;
  readonly organizationTrail = false;
}

export class SessionManagerConfig implements t.TypeOf<typeof GlobalConfigTypes.sessionManagerConfig> {
  readonly sendToCloudWatchLogs = false;
  readonly sendToS3 = false;
}

export class LoggingConfig implements t.TypeOf<typeof GlobalConfigTypes.loggingConfig> {
  readonly account = 'Log Archive';
  readonly cloudtrail: CloudtrailConfig = new CloudtrailConfig();
  readonly sessionManager: SessionManagerConfig = new SessionManagerConfig();
}

export class IdentityPerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.identityPerimeterConfig> {
  readonly enable = true;
}

export class ResourcePerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.resourcePerimeterConfig> {
  readonly enable = true;
}

export class NetworkPerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.networkPerimeterConfig> {
  readonly enable = true;
}

export class DataProtectionConfig implements t.TypeOf<typeof GlobalConfigTypes.dataProtectionConfig> {
  readonly enable = true;
  readonly identityPerimeter = new IdentityPerimeterConfig();
  readonly resourcePerimeter = new ResourcePerimeterConfig();
  readonly networkPerimeter = new NetworkPerimeterConfig();
}

export class CostAndUsageReportConfig implements t.TypeOf<typeof GlobalConfigTypes.costAndUsageReportConfig> {
  readonly additionalSchemaElements = [''];
  readonly compression = '';
  readonly format = '';
  readonly reportName = '';
  readonly s3Prefix = '';
  readonly timeUnit = '';
  readonly additionalArtifacts = undefined;
  readonly refreshClosedReports = true;
  readonly reportVersioning = '';
}

export class BudgetReportConfig implements t.TypeOf<typeof GlobalConfigTypes.budgetsConfig> {
  readonly address = '';
  readonly amount = 2000;
  readonly budgetName = '';
  readonly comparisonOperator = '';
  readonly timeUnit = '';
  readonly budgetType = '';
  readonly includeUpfront = true;
  readonly includeTax = true;
  readonly includeSupport = true;
  readonly includeOtherSubscription = true;
  readonly includeSubscription = true;
  readonly includeRecurring = true;
  readonly includeDiscount = true;
  readonly includeRefund = false;
  readonly includeCredit = false;
  readonly useAmortized = false;
  readonly useBlended = false;
  readonly subscriptionType = '';
  readonly thresholdType = '';
  readonly unit = '';
  readonly notification = {
    notificationType: '',
    thresholdType: '',
    subscriptionType: '',
    comparisonOperator: '',
    threshold: 90,
  };
}

export class ReportConfig implements t.TypeOf<typeof GlobalConfigTypes.reportConfig> {
  readonly costAndUsageReport = new CostAndUsageReportConfig();
  readonly budgets = new BudgetReportConfig();
}

export class GlobalConfig implements t.TypeOf<typeof GlobalConfigTypes.globalConfig> {
  static readonly FILENAME = 'global-config.yaml';

  readonly homeRegion = '';
  readonly enabledRegions = [];

  /**
   * This role trusts the management account, allowing users in the management
   * account to assume the role, as permitted by the management account
   * administrator. The role has administrator permissions in the new member
   * account.
   *
   * Examples:
   * - AWSControlTowerExecution
   * - OrganizationAccountAccessRole
   */
  readonly managementAccountAccessRole = 'AWSControlTowerExecution';

  readonly controlTower: ControlTowerConfig = new ControlTowerConfig();
  readonly logging: LoggingConfig = new LoggingConfig();

  readonly dataProtection: DataProtectionConfig | undefined = undefined;
  readonly reports: ReportConfig | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof GlobalConfigTypes.globalConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Load from file in given directory
   * @param dir
   * @returns
   */
  static load(dir: string): GlobalConfig {
    const buffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
    const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(buffer));
    return new GlobalConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): GlobalConfig | undefined {
    try {
      const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(content));
      return new GlobalConfig(values);
    } catch (e) {
      console.log('[global-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}

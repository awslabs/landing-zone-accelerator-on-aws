/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

const globalConfigJson = {
  homeRegion: 'us-east-1',
  enabledRegions: ['us-east-1'],
  managementAccountAccessRole: 'AWSControlTowerExecution',
  cloudwatchLogRetentionInDays: 3653,
  controlTower: {
    enable: true,
  },
  logging: {
    account: 'LogArchive',
    cloudtrail: {
      enable: false,
      organizationTrail: false,
    },
    sessionManager: {
      sendToCloudWatchLogs: true,
      sendToS3: true,
    },
  },
  dataProtection: {
    enable: true,
    identityPerimeter: { enable: true },
    resourcePerimeter: { enable: true },
    networkPerimeter: { enable: true },
  },
  reports: {
    costAndUsageReport: {
      compression: 'Parquet',
      format: 'Parquet',
      reportName: 'TestReport',
      s3Prefix: 'cur',
      timeUnit: 'DAILY',
      refreshClosedReports: true,
      reportVersioning: 'OVERWRITE_REPORT',
    },
  },
};

export const GLOBAL_CONFIG = GlobalConfig.loadFromString(JSON.stringify(globalConfigJson))!;

export const iamConfigJson = {
  providers: [
    {
      name: 'provider',
      metadataDocument: 'metadataDocument',
    },
  ],
  policySets: [
    {
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
      policies: [
        {
          name: 'Default-Boundary-Policy',
          policy: 'iam-policies/boundary-policy.json',
        },
      ],
    },
  ],
  roleSets: [
    {
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
      roles: [
        {
          instanceProfile: true,
          name: 'EC2-Default-SSM-AD-Role',
          assumedBy: [
            {
              type: 'service',
              principal: 'ec2.amazonaws.com',
            },
          ],
          policies: {
            awsManaged: [
              'AmazonSSMManagedInstanceCore',
              'AmazonSSMDirectoryServiceAccess',
              'CloudWatchAgentServerPolicy',
            ],
            customerManaged: [],
          },
          boundaryPolicy: 'Default-Boundary-Policy',
        },
      ],
    },
  ],
  groupSets: [
    {
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
      groups: [
        {
          name: 'Administrators',
          policies: {
            awsManaged: ['AdministratorAccess'],
            customerManaged: [],
          },
        },
      ],
    },
  ],
  userSets: [
    {
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
      users: [
        {
          username: 'breakGlassUser01',
          group: 'Administrators',
          boundaryPolicy: 'Default-Boundary-Policy',
        },
        {
          username: 'breakGlassUser02',
          group: 'Administrators',
          boundaryPolicy: 'Default-Boundary-Policy',
        },
      ],
    },
  ],
  ec2InstanceDefaultProfile: {
    name: 'Accelerator-EC2-Instance-Default-Profile',
    deploymentTargets: {
      organizationalUnits: ['Root'],
    },
  },
};

export const IAM_CONFIG = IamConfig.loadFromString(JSON.stringify(iamConfigJson))!;

const networkConfigJson = {
  homeRegion: 'us-east-1',
  defaultVpc: {
    delete: true,
  },
  transitGateways: [
    {
      name: 'Main',
      account: 'Management',
      region: 'us-east-1',
      shareTargets: {
        organizationalUnits: ['Sandbox'],
        accounts: ['Audit'],
      },
      asn: 65521,
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      autoAcceptSharingAttachments: 'enable',
      routeTables: [
        {
          name: 'core',
          routes: [
            {
              destinationCidrBlock: '10.40.0.0/24',
              attachment: {
                vpcName: 'Test',
                account: 'Audit',
              },
              blackhole: false,
            },
          ],
        },
        {
          name: 'segregated',
          routes: [
            {
              destinationCidrBlock: '10.40.0.0/24',
              attachment: {
                vpcName: 'Test',
                account: 'Audit',
              },
              blackhole: false,
            },
          ],
        },
        {
          name: 'shared',
          routes: [
            {
              destinationCidrBlock: '10.40.0.0/24',
              attachment: {
                vpcName: 'Test',
                account: 'Audit',
              },
              blackhole: false,
            },
          ],
        },
        {
          name: 'standalone',
          routes: [
            {
              destinationCidrBlock: '10.40.0.0/24',
              attachment: {
                vpcName: 'Test',
                account: 'Audit',
              },
              blackhole: false,
            },
          ],
        },
      ],
    },
  ],
  centralNetworkServices: {
    delegatedAdminAccount: 'Audit',
    ipams: [
      {
        name: 'Accelerator-IPAM',
        region: 'us-east-1',
        operatingRegions: ['us-east-1'],
        pools: [
          {
            name: 'base-pool',
            provisionedCidrs: ['10.0.0.0/8'],
          },
          {
            name: 'us-east-1-pool',
            locale: 'us-east-1',
            provisionedCidrs: ['10.0.0.0/16'],
            sourceIpamPool: 'base-pool',
          },
        ],
      },
    ],
    networkFirewall: {
      firewalls: [
        {
          name: 'Accelerator-Firewall',
          region: 'us-east-1',
          firewallPolicy: 'Accelerator-Policy',
          subnets: ['public-a', 'public-b'],
          vpc: 'Test',
        },
      ],
      policies: [
        {
          name: 'Accelerator-Policy',
          regions: ['us-east-1'],
          firewallPolicy: {
            statelessDefaultActions: ['aws:forward_to_sfe'],
            statelessFragmentDefaultActions: ['aws:forward_to_sfe'],
          },
        },
      ],
      rules: [
        {
          name: 'Accelerator-Rule',
          regions: ['us-east-1'],
          capacity: 100,
          type: 'STATEFUL',
          ruleGroup: {
            rulesSource: {
              rulesSourceList: {
                generatedRulesType: 'DENYLIST',
                targets: ['.example.com'],
                targetTypes: ['TLS_SNI', 'HTTP_HOST'],
              },
              ruleVariables: {
                ipSets: {
                  name: 'HOME_NET',
                  definition: ['10.0.0.0/16', '10.1.0.0/16'],
                },
                portSets: {
                  name: 'HOME_NET',
                  definition: ['80', '443'],
                },
              },
            },
          },
        },
      ],
    },
    route53Resolver: {
      endpoints: [
        {
          name: 'Accelerator-Inbound',
          type: 'INBOUND',
          vpc: 'Test',
          subnets: ['public-a', 'public-b'],
        },
        {
          name: 'Accelerator-Outbound',
          type: 'OUTBOUND',
          vpc: 'Test',
          subnets: ['public-a', 'public-b'],
          rules: [
            {
              name: 'example-rule',
              domainName: 'example.com',
              targetIps: [
                {
                  ip: '1.1.1.1',
                },
                {
                  ip: '2.2.2.2',
                },
              ],
              shareTargets: {
                organizationalUnits: ['Sandbox'],
              },
            },
          ],
        },
      ],
      queryLogs: {
        name: 'Accelerator-Query-Logs',
        destinations: ['s3', 'cloud-watch-logs'],
        shareTargets: {
          organizationalUnits: ['Sandbox'],
        },
      },
      firewallRuleGroups: [
        {
          name: 'Accelerator-Block-Group',
          regions: ['us-east-1'],
          rules: [
            {
              name: 'Custom-Rule',
              action: 'BLOCK',
              customDomainList: 'dns-firewall-rule-groups/domain-list.txt',
              priority: 100,
              blockResponse: 'NXDOMAIN',
            },
            {
              name: 'Managed-Rule',
              action: 'BLOCK',
              managedDomainList: 'AWSManagedDomainsBotnetCommandandControl',
              priority: 200,
              blockResponse: 'NODATA',
            },
          ],
          shareTargets: {
            organizationalUnits: ['Sandbox'],
          },
        },
      ],
    },
  },
  prefixLists: [
    {
      name: 'Test',
      accounts: ['Management'],
      regions: ['us-east-1'],
      addressFamily: 'IPv4',
      maxEntries: 10,
      entries: ['10.0.0.0/8', '100.96.252.0/23', '100.96.250.0/23'],
    },
  ],
  endpointPolicies: [
    {
      name: 'Default',
      document: 'vpc-endpoint-policies/default.json',
    },
  ],
  vpcs: [
    {
      name: 'Test',
      account: 'Audit',
      region: 'us-east-1',
      cidrs: ['10.0.0.0/16'],
      internetGateway: true,
      enableDnsHostnames: false,
      enableDnsSupport: true,
      dnsFirewallRuleGroups: [
        {
          name: 'Accelerator-Block-Group',
          priority: 101,
        },
      ],
      queryLogs: ['Accelerator-Query-Logs'],
      resolverRules: ['example-rule'],
      instanceTenancy: 'default',
      routeTables: [
        {
          name: 'CentralVpc_Common',
          routes: [
            {
              name: 'TgwRoute',
              destination: '10.0.0.0/8',
              type: 'transitGateway',
              target: 'Main',
            },
            {
              name: 'NatRoute',
              destination: '192.168.0.0/16',
              type: 'natGateway',
              target: 'Web-A',
            },
            {
              name: 'IgwRoute',
              destination: '0.0.0.0/0',
              type: 'internetGateway',
              target: 'IGW',
            },
            {
              name: 's3',
              target: 's3',
            },
            {
              name: 'dynamodb',
              target: 'dynamodb',
            },
          ],
        },
      ],
      subnets: [
        {
          name: 'public-a',
          availabilityZone: 'a',
          mapPublicIpOnLaunch: true,
          routeTable: 'CentralVpc_Common',
          ipv4CidrBlock: '10.0.0.0/24',
        },
        {
          name: 'public-b',
          availabilityZone: 'b',
          mapPublicIpOnLaunch: true,
          routeTable: 'CentralVpc_Common',
          ipv4CidrBlock: '10.0.1.0/24',
        },
        {
          name: 'tgw-attach-a',
          availabilityZone: 'a',
          routeTable: 'CentralVpc_Common',
          ipv4CidrBlock: '10.0.2.0/24',
        },
        {
          name: 'tgw-attach-b',
          availabilityZone: 'b',
          routeTable: 'CentralVpc_Common',
          ipv4CidrBlock: '10.0.3.0/24',
        },
      ],
      natGateways: [
        {
          name: 'Web-A',
          subnet: 'public-a',
        },
        {
          name: 'Web-B',
          subnet: 'public-b',
        },
      ],
      transitGatewayAttachments: [
        {
          name: 'Test',
          transitGateway: {
            name: 'Main',
            account: 'Management',
          },
          routeTableAssociations: ['shared'],
          routeTablePropagations: ['core', 'shared', 'segregated'],
          subnets: ['tgw-attach-a', 'tgw-attach-b'],
        },
      ],
      dnsResolverLogging: true,
      useCentralEndpoints: false,
      gatewayEndpoints: {
        defaultPolicy: 'Default',
        endpoints: [
          {
            service: 's3',
          },
          {
            service: 'dynamodb',
          },
        ],
      },
      securityGroups: [
        {
          name: 'Management',
          description: 'Management Security Group',
          inboundRules: [
            {
              description: 'Management RDP Traffic Inbound',
              types: ['RDP'],
              sources: [
                '10.0.0.0/8',
                '100.96.252.0/23',
                '100.96.250.0/23',
                {
                  account: 'Audit',
                  vpc: 'Test',
                  subnets: ['tgw-attach-a', 'tgw-attach-b'],
                },
                {
                  securityGroups: ['Management'],
                },
              ],
            },
            {
              description: 'Management SSH Traffic Inbound',
              types: ['SSH'],
              sources: [
                {
                  prefixLists: ['Test'],
                },
              ],
            },
          ],
          outboundRules: [
            {
              description: 'All Outbound',
              types: ['ALL'],
              sources: ['0.0.0.0/0'],
            },
          ],
        },
      ],
    },
    {
      name: 'Test-Peer',
      account: 'Audit',
      region: 'us-east-1',
      cidrs: ['10.1.0.0/16'],
      internetGateway: true,
      enableDnsHostnames: false,
      enableDnsSupport: true,
      instanceTenancy: 'default',
      routeTables: [],
      subnets: [],
      natGateways: [],
      transitGatewayAttachments: [],
      useCentralEndpoints: false,
      securityGroups: [],
    },
    {
      name: 'Test-Ipam',
      account: 'Audit',
      region: 'us-east-1',
      ipamAllocations: [
        {
          ipamPoolName: 'us-east-1-pool',
          netmaskLength: 24,
        },
      ],
      internetGateway: true,
      enableDnsHostnames: false,
      enableDnsSupport: true,
      instanceTenancy: 'default',
      routeTables: [
        {
          name: 'Test-Ipam-Default',
        },
      ],
      subnets: [
        {
          name: 'Ipam-Subnet',
          availabilityZone: 'a',
          routeTable: 'Test-Ipam-Default',
          ipamAllocation: {
            ipamPoolName: 'us-east-1-pool',
            netmaskLength: 26,
          },
        },
      ],
      natGateways: [],
      transitGatewayAttachments: [],
      useCentralEndpoints: false,
      securityGroups: [],
    },
  ],
  vpcFlowLogs: {
    trafficType: 'ALL',
    maxAggregationInterval: 60,
    destinations: ['s3', 'cloud-watch-logs'],
    defaultFormat: false,
    customFields: [
      'version',
      'account-id',
      'interface-id',
      'srcaddr',
      'dstaddr',
      'srcport',
      'dstport',
      'protocol',
      'packets',
      'bytes',
      'start',
      'end',
      'action',
      'log-status',
      'vpc-id',
      'subnet-id',
      'instance-id',
      'tcp-flags',
      'type',
      'pkt-srcaddr',
      'pkt-dstaddr',
      'region',
      'az-id',
      'pkt-src-aws-service',
      'pkt-dst-aws-service',
      'flow-direction',
      'traffic-path',
    ],
  },
  vpcPeering: [
    {
      name: 'Test',
      vpcs: ['Test', 'Test-Peer'],
    },
  ],
};

export const NETWORK_CONFIG = NetworkConfig.loadFromString(JSON.stringify(networkConfigJson))!;

const securityConfigJson = {
  homeRegion: 'us-east-1',
  centralSecurityServices: {
    delegatedAdminAccount: 'Audit',
    ebsDefaultVolumeEncryption: {
      enable: true,
      excludeRegions: [],
    },
    s3PublicAccessBlock: {
      enable: true,
      excludeAccounts: [],
    },
    snsSubscriptions: [
      {
        level: 'High',
        email: 'highalert@amazon.com',
      },
      {
        level: 'Medium',
        email: 'midalert@amazon.com',
      },
      {
        level: 'Low',
        email: 'lowalert@amazon.com',
      },
    ],
    macie: {
      enable: true,
      excludeRegions: [],
      policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
      publishSensitiveDataFindings: true,
    },
    guardduty: {
      enable: true,
      excludeRegions: [],
      s3Protection: {
        enable: true,
        excludeRegions: [],
      },
      exportConfiguration: {
        enable: true,
        destinationType: 'S3',
        exportFrequency: 'FIFTEEN_MINUTES',
      },
    },
    auditManager: {
      enable: true,
      excludeRegions: [],
      defaultReportsConfiguration: {
        enable: true,
        destinationType: 'S3',
      },
    },
    detective: {
      enable: true,
      excludeRegions: [],
    },
    securityHub: {
      enable: true,
      excludeRegions: [],
      standards: [
        {
          name: 'AWS Foundational Security Best Practices v1.0.0',
          enable: true,
          controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
        },
        {
          name: 'PCI DSS v3.2.1',
          enable: true,
          controlsToDisable: ['PCI.IAM.3', 'PCI.S3.3', 'PCI.EC2.3', 'PCI.Lambda.2'],
        },
        {
          name: 'CIS AWS Foundations Benchmark v1.2.0',
          enable: true,
          controlsToDisable: ['CIS.1.20', 'CIS.1.22', 'CIS.2.6'],
        },
      ],
    },
    ssmAutomation: {
      excludeRegions: [],
      documentSets: [],
    },
  },
  accessAnalyzer: {
    enable: true,
  },
  iamPasswordPolicy: {
    allowUsersToChangePassword: true,
    hardExpiry: false,
    requireUppercaseCharacters: true,
    requireLowercaseCharacters: true,
    requireSymbols: true,
    requireNumbers: true,
    minimumPasswordLength: 14,
    passwordReusePrevention: 24,
    maxPasswordAge: 90,
  },
  awsConfig: {
    enableConfigurationRecorder: true,
    enableDeliveryChannel: true,
    ruleSets: [
      {
        deploymentTargets: {
          organizationalUnits: ['Root'],
        },
        rules: [
          {
            name: 'accelerator-iam-user-group-membership-check',
            complianceResourceTypes: ['AWS::IAM::User'],
            identifier: 'IAM_USER_GROUP_MEMBERSHIP_CHECK',
          },
          {
            name: 'accelerator-securityhub-enabled',
            identifier: 'SECURITYHUB_ENABLED',
          },
          {
            name: 'accelerator-cloudtrail-enabled',
            identifier: 'CLOUD_TRAIL_ENABLED',
          },
        ],
      },
    ],
  },
  cloudWatch: {
    metricSets: [
      {
        regions: ['us-east-1'],
        deploymentTargets: {
          organizationalUnits: ['Root'],
        },
        metrics: [
          {
            filterName: 'RootAccountMetricFilter',
            logGroupName: 'aws-controltower/CloudTrailLogs',
            filterPattern:
              '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}',
            metricNamespace: 'LogMetrics',
            metricName: 'RootAccount',
            metricValue: '1',
          },
          {
            filterName: 'UnauthorizedAPICallsMetricFilter',
            logGroupName: 'aws-controltower/CloudTrailLogs',
            filterPattern: '{($.errorCode="*UnauthorizedOperation") || ($.errorCode="AccessDenied*")}',
            metricNamespace: 'LogMetrics',
            metricName: 'UnauthorizedAPICalls',
            metricValue: '1',
          },
          {
            filterName: 'ConsoleSigninWithoutMFAMetricFilter',
            logGroupName: 'aws-controltower/CloudTrailLogs',
            filterPattern: '{($.eventName="ConsoleLogin") && ($.additionalEventData.MFAUsed !="Yes")}',
            metricNamespace: 'LogMetrics',
            metricName: 'ConsoleSigninWithoutMFA',
            metricValue: '1',
          },
        ],
      },
    ],
    alarmSets: [
      {
        regions: ['us-east-1'],
        deploymentTargets: {
          organizationalUnits: ['Root'],
        },
        alarms: [
          {
            alarmName: 'CIS-1.1-RootAccountUsage',
            alarmDescription: 'Alarm for usage of "root" account',
            snsAlertLevel: 'Low',
            metricName: 'RootAccountUsage',
            namespace: 'LogMetrics',
            comparisonOperator: 'GreaterThanOrEqualToThreshold',
            evaluationPeriods: 1,
            period: 300,
            statistic: 'Sum',
            threshold: 1,
            treatMissingData: 'notBreaching',
          },
          {
            alarmName: 'CIS-3.1-UnauthorizedAPICalls',
            alarmDescription: 'Alarm for unauthorized API calls',
            snsAlertLevel: 'Low',
            metricName: 'UnauthorizedAPICalls',
            namespace: 'LogMetrics',
            comparisonOperator: 'GreaterThanOrEqualToThreshold',
            evaluationPeriods: 1,
            period: 300,
            statistic: 'Sum',
            threshold: 1,
            treatMissingData: 'notBreaching',
          },
          {
            alarmName: 'CIS-3.2-ConsoleSigninWithoutMFA',
            alarmDescription: 'Alarm for AWS Management Console sign-in without MFA',
            snsAlertLevel: 'Low',
            metricName: 'ConsoleSigninWithoutMFA',
            namespace: 'LogMetrics',
            comparisonOperator: 'GreaterThanOrEqualToThreshold',
            evaluationPeriods: 1,
            period: 300,
            statistic: 'Sum',
            threshold: 1,
            treatMissingData: 'notBreaching',
          },
        ],
      },
    ],
  },
};

export const SECURITY_CONFIG = SecurityConfig.loadFromString(JSON.stringify(securityConfigJson))!;

export const ORGANIZATION_CONFIG = {
  enable: true as const,
  organizationalUnits: [
    {
      name: 'Security',
    },
    {
      name: 'Sandbox',
    },
  ],
  organizationalUnitIds: [{ name: 'Security', id: 'securityOrgId', arn: 'securityOrgArn' }],
  quarantineNewAccounts: {
    enable: true,
    scpPolicyName: 'QuarantineAccounts',
  },
  serviceControlPolicies: [
    {
      name: 'DenyDeleteVpcFlowLogs',
      description:
        'This SCP prevents users or roles in any affected account from deleting Amazon Elastic Compute Cloud (Amazon EC2) flow logs or CloudWatch log groups or log streams.\n',
      policy: 'service-control-policies/deny-delete-vpc-flow-logs.json',
      type: 'customerManaged',
      deploymentTargets: {
        organizationalUnits: ['Security'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
    },
    {
      name: 'QuarantineAccounts',
      description:
        'This SCP is used to prevent changes to new accounts until the accelerator\nhas been executed successfully.\nThis policy will be applied upon account create if enabled.\n',
      policy: 'service-control-policies/quarantine.json',
      type: 'customerManaged',
      deploymentTargets: {
        organizationalUnits: [],
        accounts: [],
        excludedRegions: [],
        excludedAccounts: [],
      },
    },
  ],
  taggingPolicies: [
    {
      name: 'OrgTagPolicy',
      description: 'Organization Tagging Policy',
      policy: 'tagging-policies/org-tag-policy.json',
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
    },
  ],
  backupPolicies: [
    {
      name: 'OrgBackupPolicy',
      description: 'Organization Backup Policy',
      policy: 'backup-policies/org-backup-policies.json',
      deploymentTargets: {
        organizationalUnits: ['Root'],
        accounts: ['Management'],
        excludedRegions: [],
        excludedAccounts: [],
      },
    },
  ],
  backupVault: {
    enableManagementKey: true,
    name: 'DefaultVault',
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  loadOrganizationalUnitIds: async function (): Promise<void> {},
  getOrganizationalUnitId: function (name: string) {
    return name + '-id';
  },
  getOrganizationalUnitArn: function (name: string) {
    return name + '-arn';
  },
  getPath: function (name: string) {
    return name + '-path';
  },
  getOuName: function (name: string) {
    return name;
  },
  getParentOuName: function (name: string) {
    return name + '-parent';
  },
};

export const ACCOUNT_CONFIG = {
  mandatoryAccounts: [
    {
      name: 'Management',
      description: 'The management (primary) account',
      email: 'management-account@amazon.com',
      organizationalUnit: 'Root',
    },
    {
      name: 'LogArchive',
      description: 'The log archive account',
      email: 'logarchive-account@amazon.com',
      organizationalUnit: 'Security',
    },
    {
      name: 'Audit',
      description: 'The security audit account (also referred to as the audit account)',
      email: 'audit-account@amazon.com',
      organizationalUnit: 'Security',
    },
  ],
  workloadAccounts: [],
  accountIds: [
    {
      email: 'audit-account@amazon.com',
      accountId: '222222222222',
    },
    {
      email: 'logarchive-account@amazon.com',
      accountId: '111111111111',
    },
    { email: 'management-account@amazon.com', accountId: '333333333333' },
  ],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  loadAccountIds: async function (): Promise<void> {},
  containsAccount: function (name: string) {
    return !!name;
  },
  getManagementAccount: function () {
    return {
      name: 'Management',
      description: 'The management (primary) account',
      email: 'management-account@amazon.com',
      organizationalUnit: 'Root',
    };
  },
  getLogArchiveAccount: function () {
    return {
      name: 'LogArchive',
      description: 'The log archive account',
      email: 'logarchive-account@amazon.com',
      organizationalUnit: 'Security',
    };
  },
  getAuditAccount: function () {
    return {
      name: 'Audit',
      description: 'The security audit account (also referred to as the audit account)',
      email: 'audit-account@amazon.com',
      organizationalUnit: 'Security',
    };
  },
  getAccount: function (name: string) {
    return {
      name: name,
      description: 'The management (primary) account',
      email: 'management-account@amazon.com',
      organizationalUnit: 'Root',
    };
  },
  getAuditAccountId: function () {
    return '222222222222';
  },
  getManagementAccountId: function () {
    return '333333333333';
  },
  getLogArchiveAccountId: function () {
    return '111111111111';
  },
  getAccountId: function (name: string) {
    if (name === 'Management') {
      return '333333333333';
    }
    if (name === 'Audit') {
      return '222222222222';
    }
    return '111111111111';
  },
  isGovCloudAccount: function () {
    return false;
  },
  anyGovCloudAccounts: function () {
    return false;
  },
  isGovCloudEnabled: function () {
    return false;
  },
};

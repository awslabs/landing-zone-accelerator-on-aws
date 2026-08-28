# Config-to-Stack Mapping

## Overview

This page provides a quick reference for which configuration file properties are consumed by which LZA stack. Use this to determine where to look when debugging or extending a feature.

## global-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `homeRegion` | All stacks (determines home region logic) |
| `enabledRegions` | All stacks (determines deployment regions) |
| `enableOptInRegions` | Accounts |
| `useV2Stacks` | Network VPC |
| `cdkOptions` | Bootstrap |
| `logging.centralLogBucket` | Logging |
| `logging.cloudwatchLogs` | Logging |
| `logging.cloudwatchLogs.exclusions` | Logging |
| `snsTopics` | Logging |
| `backup.vaults` | Operations |
| `reports.budgets` | Operations |
| `reports.costAndUsageReport` | Organizations |
| `cloudwatchLogRetentionInDays` | Multiple stacks |
| `controlTower` | Organizations, Pipeline |

## accounts-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `mandatoryAccounts` | Prepare (account creation) |
| `workloadAccounts` | Prepare (account creation) |
| Account email/ID mappings | All stacks (via `getAccountId()`) |

## organization-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `serviceControlPolicies` | Accounts, Finalize |
| `taggingPolicies` | Organizations |
| `backupPolicies` | Organizations |
| `chatbotPolicies` | Organizations |
| `quarantineNewAccounts` | Accounts, Finalize |
| `controlTower.controls` | Organizations |
| `organizationalUnits` | Prepare (validation) |

## iam-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `roleSets` | Operations |
| `groupSets` | Operations |
| `userSets` | Operations |
| `policySets` | Operations |
| `providers` | Operations |
| `identityCenter.identityCenterPermissionSets` | Identity Center |
| `identityCenter.identityCenterAssignments` | Identity Center |

## security-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `centralSecurityServices.macie` | Security, Security Audit, Organizations |
| `centralSecurityServices.guardduty` | Security, Security Audit, Organizations |
| `centralSecurityServices.securityHub` | Security, Security Audit, Organizations |
| `centralSecurityServices.detective` | Security Audit, Organizations |
| `centralSecurityServices.auditManager` | Security Audit, Organizations |
| `centralSecurityServices.fms` | Organizations, Network Prep |
| `centralSecurityServices.ebsDefaultVolumeEncryption` | Security |
| `centralSecurityServices.sessionManager` | Security Resources |
| `iamPasswordPolicy` | Security |
| `accessAnalyzer` | Accounts (SLR), Security Audit, Security Resources |
| `awsConfig.ruleSets` | Security Resources |
| `awsConfig.aggregation` | Security, Organizations |
| `cloudWatch.alarmSets` | Security Resources |
| `cloudWatch.metricSets` | Security Resources |
| `cloudWatch.logGroups` | Security Resources |
| `cloudTrail.accountTrails` | Security Resources |

## network-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `vpcs` | Network VPC, Network VPC Endpoints, Network Associations |
| `vpcTemplates` | Network VPC, Network VPC Endpoints, Network Associations |
| `transitGateways` | Network Prep |
| `transitGatewayPeering` | Network Associations |
| `customerGateways` | Network Prep, Network Associations GWLB |
| `directConnectGateways` | Network Prep, Network Associations |
| `centralNetworkServices.ipams` | Network Prep, Organizations |
| `centralNetworkServices.route53Resolver` | Network Prep, Network VPC Endpoints, Network VPC DNS |
| `centralNetworkServices.networkFirewall` | Network Prep, Network VPC Endpoints |
| `prefixLists` | Network Prep |
| `vpcPeering` | Network Associations |
| `firewallManagerService` | Network Prep |

## customizations-config.yaml

| Config Property | Stack(s) |
|----------------|----------|
| `customizations.cloudFormationStackSets` | Customizations |
| `customizations.cloudFormationStacks` | Customizations (Custom Stacks) |
| `customizations.serviceCatalogPortfolios` | Customizations |
| `applications` | Applications |

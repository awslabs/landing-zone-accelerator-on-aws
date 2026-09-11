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

/**
 * @fileoverview Per-module IAM session policies for least-privilege enforcement.
 *
 * Each module declares the IAM actions it requires. These are passed as session policies
 * to STS AssumeRole, restricting assumed credentials to ONLY the declared actions —
 * regardless of the target role's permissions.
 *
 * The effective permissions are the INTERSECTION of:
 *   - The target role's identity-based policy (e.g., AdministratorAccess)
 *   - The session policy declared here
 *
 * This restores the least-privilege model that existed with Lambda-backed custom resources,
 * without requiring separate Lambda functions or IAM roles per module.
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html#policies_session
 */

/**
 * Session policy configuration for a module.
 */
export interface IModuleSessionPolicy {
  /** Module name matching AcceleratorModules enum value */
  readonly moduleName: string;
  /** JSON session policy string (max 2048 chars) */
  readonly policy: string;
  // NOTE: Session tags intentionally omitted. AWSControlTowerExecution (the cross-account
  // role used by LZA) only allows sts:AssumeRole in its trust policy, not sts:TagSession.
  // Control Tower owns this role and we cannot modify its trust policy. Session tags would
  // require sts:TagSession permission on every target role across all member accounts.
  // Session policies work without trust policy changes (they restrict, not expand).
}

/**
 * Base IAM statements included in every module's session policy.
 * Resource-scoped to LZA naming patterns to prevent access to arbitrary
 * DynamoDB tables or SSM parameters in the account.
 */
const BASE_MODULE_STATEMENTS = [
  {
    Sid: 'LzaModuleStateTable',
    Effect: 'Allow',
    Action: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem', 'dynamodb:DescribeTable'],
    Resource: ['arn:*:dynamodb:*:*:table/*-Module-State-*'],
  },
  {
    Sid: 'LzaModuleSsmParameters',
    Effect: 'Allow',
    Action: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:GetParametersByPath'],
    Resource: ['arn:*:ssm:*:*:parameter/*accelerator*'],
  },
];

/**
 * Builds a complete session policy JSON string from module-specific actions
 * and the base state management statements.
 *
 * @param moduleActions - Service-specific IAM actions the module requires
 * @returns JSON policy string
 * @throws Error if policy exceeds 2048 character STS limit
 */
function buildSessionPolicy(moduleActions: string[]): string {
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'ModuleSpecificActions',
        Effect: 'Allow',
        Action: moduleActions,
        Resource: '*',
      },
      ...BASE_MODULE_STATEMENTS,
    ],
  });

  if (policy.length > 2048) {
    throw new Error(
      `Session policy exceeds STS 2048 character limit (${policy.length} chars). ` +
        `Reduce actions or use managed session policy ARNs.`,
    );
  }
  return policy;
}

/**
 * Creates a ModuleSessionPolicy with standard session tags for CloudTrail attribution.
 */
function createModulePolicy(moduleName: string, actions: string[]): IModuleSessionPolicy {
  return {
    moduleName,
    policy: buildSessionPolicy(actions),
  };
}

/**
 * Moves the given actions out of the wildcard `ModuleSpecificActions` statement into a
 * new statement scoped to a specific resource.
 *
 * Used where a module needs an action only against a resource whose ARN is not known
 * until runtime (for example the GuardDuty findings-export bucket), so the action cannot
 * be resource-scoped in the static policy above.
 *
 * Returns the policy unchanged if `resource` is empty or none of `actions` are present,
 * so callers do not need to special-case unconfigured modules.
 *
 * @param policy - Session policy JSON string to narrow
 * @param actions - Actions to move out of the wildcard statement
 * @param resource - Resource ARN the moved actions are scoped to
 * @param sid - Sid for the new scoped statement
 * @returns Narrowed session policy JSON string
 * @throws Error if the resulting policy exceeds the STS 2048 character limit
 */
export function scopeActionsToResource(policy: string, actions: string[], resource: string, sid: string): string {
  if (!resource || actions.length === 0) {
    return policy;
  }

  const parsed = JSON.parse(policy);
  const wildcardStatement = parsed.Statement.find(
    (statement: { Sid?: string }) => statement.Sid === 'ModuleSpecificActions',
  );
  if (!wildcardStatement) {
    return policy;
  }

  const moved = wildcardStatement.Action.filter((action: string) => actions.includes(action));
  if (moved.length === 0) {
    return policy;
  }

  wildcardStatement.Action = wildcardStatement.Action.filter((action: string) => !actions.includes(action));

  const scopedStatement = {
    Sid: sid,
    Effect: 'Allow',
    Action: moved,
    Resource: resource,
  };

  // Drop the wildcard statement entirely if every action was scoped away, otherwise an
  // empty Action array would make the policy invalid.
  const statements =
    wildcardStatement.Action.length > 0
      ? parsed.Statement
      : parsed.Statement.filter((statement: { Sid?: string }) => statement.Sid !== 'ModuleSpecificActions');

  const narrowed = JSON.stringify({
    ...parsed,
    Statement: [...statements, scopedStatement],
  });

  if (narrowed.length > 2048) {
    throw new Error(
      `Session policy exceeds STS 2048 character limit after scoping ${sid} (${narrowed.length} chars). ` +
        `Reduce actions or use managed session policy ARNs.`,
    );
  }
  return narrowed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Session Policies
//
// Action lists validated via static analysis (grep SDK Command instantiations)
// on 2026-05-20. Cross-referenced with CloudTrail where available.
// Remaining TODO: integration test with policies applied (Approach C).
// ─────────────────────────────────────────────────────────────────────────────

const STACK_RESOURCES_RETENTION = createModulePolicy('stack-resources-retention', [
  // Validated: source/packages/@aws-accelerator/accelerator/lib/actions/resource-retention/
  'cloudformation:DescribeStacks',
  'cloudformation:DescribeStackResources',
  'cloudformation:UpdateStack',
  'cloudformation:GetTemplate',
  'cloudformation:ListStacks',
  'cloudformation:UpdateTerminationProtection',
]);

const INVITE_ACCOUNTS_TO_ORGANIZATIONS = createModulePolicy('invite-accounts-to-organizations', [
  // Validated: invite-account + invite-accounts-batch
  'organizations:InviteAccountToOrganization',
  'organizations:ListHandshakesForAccount',
  'organizations:AcceptHandshake',
  'organizations:CancelHandshake',
]);

const CREATE_STACK_POLICY = createModulePolicy('create-stack-policy', [
  // Validated: source/packages/@aws-lza/lib/aws-cloudformation/create-stack-policy/
  'cloudformation:SetStackPolicy',
]);

const MACIE = createModulePolicy('macie', [
  // Validated: source/packages/@aws-lza/lib/amazon-macie/ (all files)
  // Wildcards used to stay within STS packed policy size limit (2048 bytes packed)
  'macie2:*Macie*',
  'macie2:*OrganizationAdmin*',
  'macie2:*Member*',
  'macie2:*OrganizationConfiguration',
  'macie2:*ClassificationExportConfiguration',
  'macie2:PutFindingsPublicationConfiguration',
  'macie2:*ClassificationScope*',
  'macie2:UpdateAutomatedDiscoveryConfiguration',
  // macie2:EnableMacie implicitly creates the AWSServiceRoleForAmazonMacie SLR on first
  // enablement in a member account; without this the clamped session fails with
  // iam:CreateServiceLinkedRole AccessDenied (the legacy custom resource carried this grant).
  'iam:CreateServiceLinkedRole',
]);

const GUARDDUTY = createModulePolicy('guardduty', [
  // Validated: source/packages/@aws-lza/lib/guardduty/ (all files)
  // Wildcards used to stay within STS packed policy size limit (2048 bytes packed)
  'guardduty:*Detector*',
  'guardduty:*OrganizationAdmin*',
  'guardduty:*OrganizationConfiguration',
  'guardduty:*Members',
  'guardduty:*Member*',
  'guardduty:*PublishingDestination*',
  'guardduty:*MalwareScanSettings',
  'guardduty:UpdateMemberDetectors',
  'guardduty:ListDetectors',
  // CreatePublishingDestination requires the calling principal to have S3 permissions
  // on the destination bucket when exporting to a prefix. Per AWS documentation:
  // https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html
  // "Step 1 – Permissions required to export findings"
  's3:GetBucketLocation',
  's3:PutObject',
  's3:GetObject',
  's3:ListBucket',
  // guardduty:CreateDetector implicitly creates the AWSServiceRoleForAmazonGuardDuty SLR
  // on first enablement in a member account.
  // iam:GetRole is required for Malware Protection (EBS_MALWARE_PROTECTION) enablement.
  // GuardDuty's UpdateDetector API validates the AWSServiceRoleForAmazonGuardDutyMalwareProtection
  // SLR exists via iam:GetRole before enabling the feature. Without this permission, the API
  // returns BadRequestException: "you do not have the required iam:GetRole permission."
  // See: https://docs.aws.amazon.com/guardduty/latest/ug/troubleshooting-guardduty-malware-protection-issues.html
  'iam:CreateServiceLinkedRole',
  'iam:GetRole',
]);

const CONFIG_RULE_TAGGING = createModulePolicy('config-rule-tagging', [
  'config:DescribeConfigRules',
  'config:ListTagsForResource',
  'config:TagResource',
  'config:UntagResource',
  'ssm:GetParameters',
]);

const GET_CLOUDFORMATION_TEMPLATES = createModulePolicy('get-cloudformation-templates', [
  // Validated: source/packages/@aws-lza/lib/aws-cloudformation/get-cloudformation-templates/
  'cloudformation:GetTemplate',
  'cloudformation:ListStacks',
  's3:PutObject',
]);

const TGW_ASSOCIATIONS_AND_PROPAGATIONS = createModulePolicy('tgw-associations-and-propagations', [
  // Validated via static analysis + CloudTrail mining 2026-05-20
  'ec2:DescribeTransitGateways',
  'ec2:DescribeTransitGatewayRouteTables',
  'ec2:DescribeTransitGatewayAttachments',
  'ec2:DescribeTransitGatewayVpcAttachments',
  'ec2:DescribeTransitGatewayConnects',
  'ec2:DescribeVpnConnections',
  'ec2:GetTransitGatewayRouteTableAssociations',
  'ec2:GetTransitGatewayRouteTablePropagations',
  'ec2:AssociateTransitGatewayRouteTable',
  'ec2:DisassociateTransitGatewayRouteTable',
  'ec2:EnableTransitGatewayRouteTablePropagation',
  'ec2:DisableTransitGatewayRouteTablePropagation',
  'ec2:CreateTransitGatewayConnect',
  'ec2:DeleteTransitGatewayConnect',
  'ec2:CreateTags',
  'directconnect:DescribeDirectConnectGateways',
  'directconnect:DescribeDirectConnectGatewayAssociations',
  'directconnect:CreateDirectConnectGatewayAssociation',
  'directconnect:CreateDirectConnectGatewayAssociationProposal',
  'directconnect:UpdateDirectConnectGatewayAssociation',
  'directconnect:DeleteDirectConnectGatewayAssociation',
]);

const ACCOUNTS = createModulePolicy('accounts', [
  // Validated: source/packages/@aws-lza/lib/aws-organizations/manage-account-alias.ts
  // Only the alias sub-operation makes cross-account calls; tags use the
  // Organizations API from the management account (no AssumeRole).
  'iam:CreateAccountAlias',
  'iam:DeleteAccountAlias',
  'iam:ListAccountAliases',
]);

/**
 * Registry of session policies for modules that make cross-account AssumeRole calls.
 *
 * Only modules that assume roles into member accounts need entries here.
 * Management-account-only modules (create-ou, move-accounts, etc.) are excluded
 * because they never trigger AssumeRole — the session policy would never be sent to STS.
 *
 * The module runner logs a warning for modules without a declared policy.
 */
export const MODULE_SESSION_POLICIES: Record<string, IModuleSessionPolicy> = {
  'stack-resources-retention': STACK_RESOURCES_RETENTION,
  'invite-accounts-to-organizations': INVITE_ACCOUNTS_TO_ORGANIZATIONS,
  'create-stack-policy': CREATE_STACK_POLICY,
  macie: MACIE,
  guardduty: GUARDDUTY,
  'config-rule-tagging': CONFIG_RULE_TAGGING,
  'get-cloudformation-templates': GET_CLOUDFORMATION_TEMPLATES,
  'tgw-associations-and-propagations': TGW_ASSOCIATIONS_AND_PROPAGATIONS,
  accounts: ACCOUNTS,
};

/**
 * Retrieves the session policy for a module by name.
 * Returns undefined if the module has no declared policy (legacy/unregistered module).
 */
export function getModuleSessionPolicy(moduleName: string): IModuleSessionPolicy | undefined {
  return MODULE_SESSION_POLICIES[moduleName];
}

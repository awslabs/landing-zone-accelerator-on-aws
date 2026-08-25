/**
 * Statement-level compliance checks shared between the Allowed-Only strategies
 * (Lambda / Private CA) and the subset-check strategies (S3, KMS, IAM trust, etc.).
 *
 * For subset-check strategies, this check runs only when `SourceAccount` is configured
 * on the `resourcePolicyEnforcement` policy set. Without an allowlist declared, the
 * subset-check strategies fall back to their prior baseline-only behavior so existing
 * deployments do not flip a wave of resources to NON_COMPLIANT.
 */
import { FunctionUrlAuthType } from '@aws-sdk/client-lambda';
import { PolicyStatementType } from './common-resources';

const AWS_ARN_REGEX = /^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:[0-9]{12}:[a-zA-Z0-9-_:/]+/;
const AWS_ACCOUNT_NUMBER_REGEX = /^\d{12}$/;

export const ALLOWED_SOURCE_ACCOUNTS: string | 'ALL' = process.env['SourceAccount'] || '';
const ORG_ID: string | undefined = process.env['ORG_ID'];
const ACCOUNT_ID: string | undefined = process.env['ACCOUNT_ID'];

export const getAccountIdFromArn = (arn: string): string => arn.split(':')[4];

/**
 * Whether the caller has declared an allowlist (`SourceAccount` on the policy set).
 * Subset-check strategies use this to decide whether the statement-level check runs.
 */
export const isSourceAccountAllowlistConfigured = (): boolean => ALLOWED_SOURCE_ACCOUNTS !== '';

/**
 * Per-caller strictness. Every option defaults to off, so a caller that passes nothing
 * gets exactly the behavior this module shipped with. Only the subset-check strategies
 * opt in — see {@link SUBSET_CHECK_OPTIONS}.
 */
export interface StatementCheckOptions {
  /** Fail a wildcard principal that no condition narrows. */
  readonly rejectUnscopedWildcard?: boolean;
  /** Fail a statement whose reach is expressed with `NotPrincipal`. */
  readonly rejectNotPrincipal?: boolean;
  /** Treat the org-scoping condition keys — `aws:PrincipalOrgID`, `aws:SourceOrgID`,
   * `aws:PrincipalOrgPaths`, `aws:SourceOrgPaths` — under any positive operator as in-org
   * access. */
  readonly acceptOrgScoping?: boolean;
  /** Read `aws:SourceArn` / `aws:SourceAccount` from any condition operator. */
  readonly operatorAgnosticConditions?: boolean;
  /** Extract accounts from every `Principal` field, not only `Principal.AWS`. */
  readonly scanAllPrincipalFields?: boolean;
}

/**
 * The strictness profile for the subset-check strategies (S3, KMS, IAM trust, etc.).
 *
 * These are detect-only: a finding never rewrites the offending statement, so being
 * strict here cannot break a workload. The Allowed-Only strategies (Lambda / Private CA)
 * deliberately pass no options, because they remediate by rewriting the statement and
 * Lambda has no update API — see `checkStatementCompliance`.
 */
export const SUBSET_CHECK_OPTIONS: StatementCheckOptions = {
  rejectUnscopedWildcard: true,
  rejectNotPrincipal: true,
  acceptOrgScoping: true,
  operatorAgnosticConditions: true,
  scanAllPrincipalFields: true,
};

/**
 * Normalize a policy value that can be a single string or an array of strings
 */
const toArray = (value: string | string[] | undefined): string[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [value];
};

/**
 * Extract the statement details the compliance check reasons about.
 *
 * @param statement policy statement from the live or mandated policy
 * @param options see {@link StatementCheckOptions}. With `operatorAgnosticConditions`,
 * `aws:SourceArn` and `aws:SourceAccount` are collected from every condition operator
 * rather than only `StringEquals` / `ArnLike`. Off by default so the Allowed-Only
 * strategies keep reading exactly the operators they read when they shipped.
 * @returns
 * - `accountsInStatement` — every account the statement references, from the principal
 *   and from the `aws:SourceArn` / `aws:SourceAccount` conditions
 * - `conditionAccounts` — the subset of those named by a condition rather than by the
 *   principal; only these can narrow a wildcard principal
 * - `functionUrlAuthType` — `lambda:FunctionUrlAuthType` StringEquals value, if present
 * - `principalOrgId` — `aws:PrincipalOrgID` StringEquals scalar value, if present. Only a
 *   scalar drives the strict reject; array values are left to `orgScopingValues`
 * - `orgScopingValues` — `aws:PrincipalOrgID` and `aws:SourceOrgID` values under any
 *   operator, used only to accept a statement, never to reject one
 * - `principalOrgPaths` — `aws:PrincipalOrgPaths` and `aws:SourceOrgPaths` values under any
 *   operator
 * - `sourceAccount` / `sourceArn` — the raw condition values, which the Lambda strategy
 *   replays into `AddPermission`
 * - `hasWildcardPrincipal` — the principal names `*`
 * - `hasNotPrincipal` — the statement uses `NotPrincipal`, so its reach cannot be
 *   determined by inspecting principals
 */
export const getStatementDetail = (statement: PolicyStatementType, options: StatementCheckOptions = {}) => {
  const rawPrincipal = typeof statement.Principal === 'string' ? statement.Principal : statement.Principal?.['AWS'];
  const awsPrincipals: string[] = toArray(rawPrincipal);
  const hasWildcardPrincipal = awsPrincipals.some(p => p === '*');

  // Account identifiers hide in principal fields other than AWS: a Federated principal is
  // an ARN, and a key that is not exactly `AWS` (`aws`) is silently ignored by a lookup on
  // that one field. Service principals are excluded — they name a service, not an account.
  const otherPrincipals: string[] =
    typeof statement.Principal === 'object' && statement.Principal !== null
      ? Object.entries(statement.Principal)
          .filter(([key]) => key !== 'AWS' && key.toLowerCase() !== 'service')
          .flatMap(([, value]) => toArray(value as string | string[]))
      : [];

  const accountsInStatement: string[] = [];
  const condition = statement.Condition || {};
  const stringEquals = (condition['StringEquals'] as unknown as { [key: string]: string | string[] }) || {};
  const arnLike = (condition['ArnLike'] as unknown as { [key: string]: string | string[] }) || {};
  const functionUrlAuthType = stringEquals['lambda:FunctionUrlAuthType'] as string | undefined;
  // Only a scalar drives the strict inequality reject below. An array value is a legitimate
  // way to write this condition, and comparing an array to a string is always unequal, so it
  // is left to the operator-agnostic acceptance instead of being wrongly rejected.
  const rawPrincipalOrgId = stringEquals['aws:PrincipalOrgID'];
  const principalOrgId = typeof rawPrincipalOrgId === 'string' ? rawPrincipalOrgId : undefined;

  const sourceArn: string[] = options.operatorAgnosticConditions
    ? getConditionValues(condition, 'aws:SourceArn')
    : [
        ...toArray(stringEquals['AWS:SourceArn']),
        ...toArray(stringEquals['aws:SourceArn']),
        ...toArray(arnLike['AWS:SourceArn']),
        ...toArray(arnLike['aws:SourceArn']),
      ];
  sourceArn.forEach(arn => {
    const account = getAccountIdFromArn(arn);
    if (account) accountsInStatement.push(account);
  });

  // aws:SourceOwner scopes a wildcard exactly as aws:SourceAccount does, and it is the key
  // in the DEFAULT SNS topic policy (`__default_statement_ID`), where it names the topic's
  // own account. Omitting it flags every SNS topic carrying its default policy.
  const sourceAccount: string[] = options.operatorAgnosticConditions
    ? [...getConditionValues(condition, 'aws:SourceAccount'), ...getConditionValues(condition, 'aws:SourceOwner')]
    : [...toArray(stringEquals['AWS:SourceAccount']), ...toArray(stringEquals['aws:SourceAccount'])];
  accountsInStatement.push(...sourceAccount);
  const conditionAccountCount = accountsInStatement.length;

  const principalsToScan = options.scanAllPrincipalFields ? [...awsPrincipals, ...otherPrincipals] : awsPrincipals;
  for (const principal of principalsToScan) {
    if (AWS_ARN_REGEX.test(principal)) {
      const account = getAccountIdFromArn(principal);
      if (account) accountsInStatement.push(account);
    } else if (AWS_ACCOUNT_NUMBER_REGEX.test(principal)) {
      accountsInStatement.push(principal);
    }
  }

  return {
    accountsInStatement,
    // Accounts named by a condition, not by the principal. Only these narrow a wildcard
    // principal: another account listed alongside `*` in Principal.AWS constrains nothing,
    // because the `*` still grants everyone.
    conditionAccounts: accountsInStatement.slice(0, conditionAccountCount),
    functionUrlAuthType,
    principalOrgId,
    orgScopingValues: [
      ...getConditionValues(condition, 'aws:PrincipalOrgID'),
      ...getConditionValues(condition, 'aws:SourceOrgID'),
    ],
    principalOrgPaths: [
      ...getConditionValues(condition, 'aws:PrincipalOrgPaths'),
      ...getConditionValues(condition, 'aws:SourceOrgPaths'),
    ],
    sourceAccount,
    sourceArn,
    hasWildcardPrincipal,
    hasNotPrincipal: statement.NotPrincipal !== undefined,
  };
};

/**
 * Whether an org-scoping condition value (`aws:PrincipalOrgID` / `aws:SourceOrgID`) scopes
 * access to this org.
 *
 * A trailing-wildcard `StringLike` value scopes to this org only when its literal prefix is
 * the org id itself (`o-example*`) or the org id followed by `/` (`o-example/*`). Anything
 * else matches a different organization: a shorter prefix (`*`, `o-*`, `o-exam*`) matches
 * this org and others, and a longer divergent prefix (`o-exampleX*`) matches only others
 * and never this org. Both would accept a cross-org grant.
 */
const matchesOrg = (value: string, orgId: string): boolean => {
  if (value === orgId) return true;
  if (!value.endsWith('*')) return false;
  const prefix = value.slice(0, -1);
  return prefix === orgId || prefix.startsWith(`${orgId}/`);
};

/**
 * Collect every value of `conditionKey` carried by a *positive* condition operator.
 *
 * A condition key is not tied to one operator: `aws:PrincipalOrgPaths` is conventionally
 * written with `ForAnyValue:StringLike`, and `aws:SourceArn` appears under `ArnEquals`,
 * `ArnLike`, `StringEquals`, and `StringLike` in policies AWS itself generates. Reading a
 * fixed operator therefore misses real scoping and flags correct policies.
 *
 * Only operators that genuinely constrain a request are read — see {@link SCOPING_OPERATORS}.
 */
/**
 * Condition operators that actually constrain a request, and so can be read as scoping.
 *
 * This is an allowlist rather than a list of operators to skip, because every family that
 * does *not* constrain a request fails open if it is merely forgotten:
 *   - negation (`StringNotEquals`) inverts the value, granting access outside it;
 *   - `...IfExists` is satisfied whenever the key is absent from the request context;
 *   - `ForAllValues:*` is likewise vacuously true when the request carries no value for the
 *     key (`ForAnyValue:*` fails closed instead, so it is allowed);
 *   - `Null`, `Bool` and the numeric/date operators do not carry a principal or account.
 * An operator this module does not recognise — including one AWS adds later — is therefore
 * treated as not scoping.
 */
const SCOPING_OPERATORS = new Set(['stringequals', 'stringequalsignorecase', 'stringlike', 'arnequals', 'arnlike']);

const isScopingOperator = (operator: string): boolean => {
  const parts = operator.split(':');
  const qualifier = parts.length > 1 ? parts[0].toLowerCase() : undefined;
  const base = (parts.length > 1 ? parts.slice(1).join(':') : operator).toLowerCase();
  if (qualifier !== undefined && qualifier !== 'foranyvalue') return false;
  return SCOPING_OPERATORS.has(base);
};

const getConditionValues = (condition: PolicyStatementType['Condition'], conditionKey: string): string[] => {
  const target = conditionKey.toLowerCase();
  const values: string[] = [];
  for (const [operator, operatorValues] of Object.entries(condition || {})) {
    if (!operatorValues || typeof operatorValues !== 'object') continue;
    if (!isScopingOperator(operator)) continue;
    for (const [key, value] of Object.entries(operatorValues)) {
      if (key.toLowerCase() === target) values.push(...toArray(value as string | string[]));
    }
  }
  return values;
};

/**
 * The effective allowlist: comma-separated `SourceAccount` values plus the resource
 * account itself, or `'ALL'` when the caller explicitly opted into public access.
 */
export const getAllowedAccountsInPolicy = (): Set<string> | 'ALL' => {
  if (ALLOWED_SOURCE_ACCOUNTS === 'ALL') {
    return 'ALL';
  }

  const accountIds = ALLOWED_SOURCE_ACCOUNTS.split(',').map(acc => acc.trim());
  const allowedAccounts = new Set<string>(accountIds);
  if (ACCOUNT_ID) {
    allowedAccounts.add(ACCOUNT_ID);
  }
  return allowedAccounts;
};

/**
 * A statement passes if:
 *   - The caller opted into public access (`SourceAccount === 'ALL'`), OR
 *   - Its `aws:PrincipalOrgID` StringEquals value matches this org (in-org access), OR
 *   - Every `aws:PrincipalOrgID` / `aws:SourceOrgID` value it carries names this org, OR
 *   - Every `aws:PrincipalOrgPaths` / `aws:SourceOrgPaths` value is under this org, which
 *     scopes access to an OU inside the org and so is narrower than `aws:PrincipalOrgID`, OR
 *   - It references no accounts and names no wildcard principal (e.g. a service
 *     principal, or the mandated org-boundary Deny), OR
 *   - Every account it references is in the allowlist. Accounts come from the principal and
 *     from the `aws:SourceArn` / `aws:SourceAccount` / `aws:SourceOwner` conditions.
 *
 * It fails if `aws:PrincipalOrgID` StringEquals is set but does not match this org, if
 * it grants a Lambda function-URL with `AuthType: NONE`, or if any referenced account is
 * outside the allowlist.
 *
 * `rejectUnscopedWildcard` additionally fails a statement that names a wildcard principal
 * without scoping access to this organization. The wildcard case must be rejected
 * explicitly: `'*'` yields no account to compare against the allowlist, so without this
 * check a statement granting every principal would fall through as compliant while a
 * statement naming a single unauthorized account would be flagged. It is opt-in because
 * the Allowed-Only strategies remediate by rewriting the offending statement, and only
 * Private CA can narrow a wildcard in place — Lambda has no update API, so it would
 * delete and re-add the same unscoped statement on every evaluation without converging.
 * The subset-check strategies are detect-only and so enable it. Closing the wildcard gap
 * for Lambda is tracked separately.
 *
 * `acceptOrgScoping` treats `aws:PrincipalOrgPaths` under this org as in-org access.
 * It can only turn a finding into a pass, so it never adds remediation activity. It is
 * opt-in purely to keep the Allowed-Only path byte-identical to its released behavior
 * while this MR is scoped to the subset-check strategies; it is safe to enable there.
 *
 * `rejectNotPrincipal` fails a statement that expresses its reach with `NotPrincipal`.
 * `NotPrincipal` means "everyone except", so there is no principal to compare against the
 * allowlist and an `Allow` written this way grants every account outside the named set —
 * the same bypass as an unscoped wildcard, in a different field.
 *
 * `operatorAgnosticConditions` reads `aws:SourceArn`, `aws:SourceAccount` and
 * `aws:SourceOwner` from any condition operator. `aws:SourceOwner` matters because it is the
 * key in the default SNS topic policy. Negation operators are never read as scoping, since
 * they grant access outside the value they name. Org-scoping values are read
 * operator-agnostically for acceptance only: a `StringLike` value is a pattern rather than an
 * exact value, so it must never drive the rejection below.
 */
export const checkStatementCompliance = (
  statement: PolicyStatementType,
  options: StatementCheckOptions = {},
): boolean => {
  if (ALLOWED_SOURCE_ACCOUNTS === 'ALL') return true;

  const {
    accountsInStatement,
    conditionAccounts,
    functionUrlAuthType,
    principalOrgId,
    orgScopingValues,
    principalOrgPaths,
    hasWildcardPrincipal,
    hasNotPrincipal,
  } = getStatementDetail(statement, options);
  const allowedAccounts = getAllowedAccountsInPolicy();

  if (allowedAccounts === 'ALL') return true;

  if (principalOrgId && principalOrgId === ORG_ID) return true;
  if (principalOrgId && principalOrgId !== ORG_ID) return false;

  // An aws:PrincipalOrgID under a non-StringEquals operator still scopes the statement to
  // this org. Accept-only: a StringLike pattern cannot be compared for inequality, so a
  // non-match here must fall through rather than reject. Every value must name this org —
  // multiple values for one condition key are ORed by IAM, so ['o-example','o-attacker']
  // grants either org and is not org scoping. The length guard is needed because
  // [].every() is vacuously true.
  if (
    options.acceptOrgScoping &&
    ORG_ID &&
    orgScopingValues.length > 0 &&
    orgScopingValues.every(value => matchesOrg(value, ORG_ID))
  ) {
    return true;
  }

  // aws:PrincipalOrgPaths scopes access to an OU inside the org, so it is stricter than
  // requiring org membership. Rejecting it would flag a policy tighter than one we accept.
  if (options.acceptOrgScoping && principalOrgPaths.length > 0 && ORG_ID) {
    if (principalOrgPaths.every(orgPath => orgPath === ORG_ID || orgPath.startsWith(`${ORG_ID}/`))) return true;
  }

  // NotPrincipal grants everyone outside the named set, so no principal can be checked.
  if (options.rejectNotPrincipal && hasNotPrincipal) return false;

  if (functionUrlAuthType === FunctionUrlAuthType.NONE) return false;

  // A wildcard principal with nothing narrowing it grants every account, which is
  // broader than any allowlist. It is acceptable only when a condition scopes it — an
  // org-scoping condition (handled above), or aws:SourceAccount / aws:SourceArn naming
  // specific accounts, which is the documented pattern for service integrations such as
  // S3 -> SNS. Those accounts are already in accountsInStatement, so fall through to the
  // allowlist comparison below rather than rejecting outright.
  if (options.rejectUnscopedWildcard && hasWildcardPrincipal && conditionAccounts.length === 0) return false;

  if (accountsInStatement.length > 0) {
    if (!accountsInStatement.every(account => allowedAccounts.has(account))) {
      return false;
    }
  }

  return true;
};

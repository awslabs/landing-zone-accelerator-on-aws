# Security FAQ

## How are new releases protected against malicious code and actors?

The Landing Zone Accelerator implements a rigorous security review process for code releases.
Each code modification undergoes comprehensive peer review, thorough testing and validation processes by the LZA team to detect potential vulnerabilities and malicious code early in the development cycle. 

The team maintains strict adherence to AWS security guidelines and best practices throughout the development lifecycle. The solution has proven its reliability and security through multiple successful deployments, supporting organizations with stringent security and compliance requirements.

LZA operates as an open-source project with code publicly available on GitHub, provided "as is" without warranties. Public pull requests and issues are welcome and will be reviewed as time allows. Additionally, customers with an LZA deployment can request additional support through [AWS Support](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/contact-aws-support.html).

Customers are responsible for ensuring compliance with their security best practices.
Although this solution discusses both the technical and administrative requirements, this solution does not help them comply with the non-technical administrative requirements.


## Why can't I disable Security Hub after it has been enabled?

Once Security Hub has been activated in your Landing Zone Accelerator (LZA) deployment, it cannot be disabled by setting `enable: false` or by adding regions to `excludeRegions` in the `security-config.yaml` file. This is an intentional design choice by the LZA team.

For security-critical services like Security Hub, the solution intentionally does not disable them once enabled to prevent potential security gaps and data loss. This deliberate approach helps maintain continuous security monitoring and compliance posture across your AWS environment.

Example configuration that will **not** disable Security Hub once it has been previously enabled:

```yaml
securityHub:
  enable: false  # This will not disable Security Hub if previously enabled
  regionAggregation: true
  excludeRegions:
    - eu-west-1  # This will not disable Security Hub in excluded regions
  standards:
    - name: AWS Foundational Security Best Practices v1.0.0
      enable: true
```

While this may limit configuration flexibility, it ensures that critical security monitoring remains active and prevents accidental exposure of your environment to security risks. The LZA team may revisit this approach in future releases based on customer feedback and requirements.

## What purpose do the breakGlassUsers in `reference/sample-configurations/lza-sample-config/iam-config.yaml` serve, and what do I do with them?

Break glass access is a [recommended best practice](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/break-glass-access.html) for gaining access to the organization management account or sub-accounts when there is a security incident or failure of the Identity Provider (IdP) infrastructure. [MFA](https://aws.amazon.com/iam/features/mfa/) and [password reset on next sign-in](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateLoginProfile.html) policies are enforced for break glass users through the `iam-policies/boundary-policy.json` and `iam-config.yaml` settings. It is imperative for the organization management admin to register [MFA devices](https://docs.aws.amazon.com/singlesignon/latest/userguide/how-to-register-device.html) and reset the Landing Zone Accelerator generated passwords before they expire, per the `maxPasswordAge` ([https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccountPasswordPolicy.html](https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccountPasswordPolicy.html)) setting in `security-config.yaml`. Of equal importance is the protection of the hardware MFA devices and passwords against unauthorized disclosure. This often involves enforcing [dual authorization](https://csrc.nist.gov/glossary/term/dual_authorization), that is, one trusted individual having access to the password and a different trusted individual having access to the MFA token.

## Which security services does LZA enable but not disable?

When you set one of the configuration flags below to `false` (or remove it), LZA stops managing or re-applying that setting, but it does **not** automatically tear down the control that was already enabled. This is by design. Automatically disabling these services could silently leave your environment in a less secure state, remove audit trails, or break dependencies that other accounts rely on.

Under the hood, each of these is gated by an `enable` flag. Setting the flag to `true` provisions a custom resource that turns the service on. Setting it to `false` removes that custom resource, which fires a CloudFormation `Delete` event. How that `Delete` event behaves is **per-service**: for most of the services below the delete handler is a deliberate no-op, so the control stays fully enabled. AWS Security Hub is the exception, its base per-account/region enablement persists (LZA never calls `DisableSecurityHub`), but its delete handlers actively tear down the pieces LZA had configured on top of it. See the Security Hub row below for details. If you genuinely need to turn one of these off, do it manually using the guidance in the table below.

| Service | Config flag | What stays enabled when set to `false` | How to disable manually |
| --- | --- | --- | --- |
| AWS Security Hub | `securityConfig` `centralSecurityServices.securityHub.enable` | Only the base Security Hub service stays enabled per account/region (LZA never calls `DisableSecurityHub`). Unlike the other services in this table, the delete handlers are **not** no-ops: LZA disables the standards it enabled (`BatchDisableStandards`), disassociates and deletes member accounts, deregisters the delegated administrator, and deletes the finding aggregator. See the dedicated section above for details. | To fully disable, call `DisableSecurityHub` per account/region via the Security Hub console or API (the standards, membership, delegated admin, and aggregator are already removed by the steps above). |
| AWS Audit Manager | `securityConfig` `centralSecurityServices.auditManager.enable` | Audit Manager stays enabled in the accounts/regions where it was activated, and its delegated administrator and S3 destination remain in place. | Deregister the delegated administrator and deactivate Audit Manager per account/region via the Audit Manager console or the `DeregisterAccount` / `DeregisterOrganizationAdminAccount` API. |
| Session Manager logging (S3 and CloudWatch Logs) | `globalConfig` `logging.sessionManager` | Existing Session Manager session logging to S3 and CloudWatch Logs continues; the `SSM-SessionManagerRunShell` document and log destinations are retained. | Update the Session Manager preferences document to stop writing to S3/CloudWatch, or remove the logging destinations manually in the Systems Manager console. |
| IAM account password policy | `securityConfig` `iamPasswordPolicy` | The account password policy previously applied remains in effect on each account. | Reset or delete the password policy per account via the IAM console or the `UpdateAccountPasswordPolicy` / `DeleteAccountPasswordPolicy` API. |
| IAM service-linked roles | Created as a side effect of enabling features (for example, the IAM Access Analyzer service-linked role) | Service-linked roles that were created are left in place. Note that `AWSServiceRoleForAccessAnalyzer` exists in every account when `accessAnalyzer.accountAnalyzer.enable` was used, not only in the management account. | Delete the specific service-linked role manually via the IAM console or the `DeleteServiceLinkedRole` API, after confirming no service still depends on it. |
| Organizations policy types (SCPs, tag policies, backup policies, AI services opt-out policies) | Managed via `organizationConfig` and the policy definitions | Enabled organization policy types stay enabled at the organization root and previously attached policies remain attached. | Detach the policies and disable the policy type at the organization root via the Organizations console or the `DisablePolicyType` API. |
| RAM sharing with AWS Organizations | Enabled to support resource sharing across the organization | Resource Access Manager sharing with AWS Organizations stays enabled. | Disable RAM sharing with Organizations via the `DisableSharingWithAwsOrganization` API, after confirming no active shares depend on it. |
| Opt-in regions | `account.amazonaws.com` trusted access and STS global endpoint token preferences | Enabled opt-in regions, `account.amazonaws.com` trusted access, and the configured STS token preference remain enabled. | Disable the opt-in region(s) per account and adjust trusted access / STS token version manually via the Account and STS consoles or APIs. |

# Security FAQ

## How are new releases protected against malicious code and actors?

The Landing Zone Accelerator implements a rigorous security review process for code releases.
Each code modification undergoes comprehensive peer review, thorough testing and validation processes by the LZA team to detect potential vulnerabilities and malicious code early in the development cycle. 

The team maintains strict adherence to AWS security guidelines and best practices throughout the development lifecycle. The solution has proven its reliability and security through multiple successful deployments, supporting organizations with stringent security and compliance requirements.

LZA operates as an open-source project with code publicly available on GitHub, provided "as is" without warranties. Public pull requests and issues are welcome and will be reviewed as time allows. Additionally, customers with an LZA deployment can request additional support through [AWS Support](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/contact-aws-support.html).

Customers are responsible for ensuring compliance with their security best practices.
Although this solution discusses both the technical and administrative requirements, this solution does not help them comply with the non-technical administrative requirements.


## What purpose do the breakGlassUsers in `reference/sample-configurations/lza-sample-config/iam-config.yaml` serve, and what do I do with them?

Break glass access is a [recommended best practice](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/break-glass-access.html) for gaining access to the organization management account or sub-accounts when there is a security incident or failure of the Identity Provider (IdP) infrastructure. [MFA](https://aws.amazon.com/iam/features/mfa/) and [password reset on next sign-in](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateLoginProfile.html) policies are enforced for break glass users through the `iam-policies/boundary-policy.json` and `iam-config.yaml` settings. It is imperative for the organization management admin to register [MFA devices](https://docs.aws.amazon.com/singlesignon/latest/userguide/how-to-register-device.html) and reset the Landing Zone Accelerator generated passwords before they expire, per the `maxPasswordAge` ([https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccountPasswordPolicy.html](https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccountPasswordPolicy.html)) setting in `security-config.yaml`. Of equal importance is the protection of the hardware MFA devices and passwords against unauthorized disclosure. This often involves enforcing [dual authorization](https://csrc.nist.gov/glossary/term/dual_authorization), that is, one trusted individual having access to the password and a different trusted individual having access to the MFA token.
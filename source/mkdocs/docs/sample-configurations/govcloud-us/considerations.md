# Additional Considerations

AWS provides resources that you should consult as you begin customizing your deployment:

1.  Refer to the [Best Practices](https://aws.amazon.com/blogs/mt/best-practices-for-organizational-units-with-aws-organizations/) for Organizational Units with AWS Organizations blog post for an overview.

2.  [Recommended OUs and accounts](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/recommended-ous-and-accounts.html). This section of the Organizing your AWS Environment Using Multiple Accounts paper discusses the deployment of specific-purpose OUs in addition to the foundational ones established by the LZA. For example, you may wish to establish a Sandbox OU for Experimentation, a Policy Staging OU to safely test policy changes before deploying them more broadly, or a Suspended OU to hold, constrain, and eventually retire accounts that you no longer need.

3.  [AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html) (SRA). The SRA \"is a holistic set of guidelines for deploying the full complement of AWS security services in a multi-account environment.\" This document is aimed at helping you to explore the \"big picture\" of AWS security and security-related services in order to determine the architectures most suited to your organization\'s unique security requirements.

## References

- LZA on AWS [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/landing-zone-accelerator-on-aws.pdf). This is the official documentation of the Landing Zone Accelerator Project and serves as your starting point. Use the instructions in the implementation guide to stand up your environment.

- AWS Labs [LZA Accelerator](https://github.com/awslabs/landing-zone-accelerator-on-aws) GitHub Repository. The official codebase of the Landing Zone Accelerator Project.
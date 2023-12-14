# GovCloud (US) Configuration Overview

This config is an industry specific deployment of the [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) solution. This solution helps automate the setup of a cloud environment and establishes platform readiness with security, compliance, and operational capabilities in AWS GovCloud (US).

The solution is architected to follow the Federal Risk and Authorization Management Program (FedRAMP), National Institute of Standards and Technology (NIST) 800-53(5), NIST 800-171 Rev.2, and Cybersecurity Maturity Model Certification (CMMC) Level 2 compliance framework control requirements. Through the use of LZA, preventative and detective guardrails are applied to vended accounts that helps customers to align their cloud-based workloads with their compliance requirements.

The LZA is not meant to be feature complete for full compliance, but rather is intended to help accelerate new cloud deployments, cloud migrations, and cloud refactoring efforts. The LZA reduces the effort required to manually build a production-ready infrastructure. It is important to note that the LZA solution will not, by itself, make you compliant. It provides the foundational infrastructure from which additional complementary solutions can be integrated, but you will still need to tailor it to your unique business needs.

!!! warning "Important"
    AWS Control Tower has been enabled in the latest sample configuration. New deployments will automatically leverage AWS Control Tower to streamline your multi-account environment. If you are an existing customer using AWS Organizations, you can continue using your current configuration.
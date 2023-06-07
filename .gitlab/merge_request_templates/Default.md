<!-- 
   Development standards and best practices can be found in [DEVELOPING.md](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/DEVELOPING.md)

   Please complete all fields to ensure your submission is properly reviewed and prioritized.
!-->

## Description
<!-- Describe how customers will benefit from this feature. -->
<!-- Provide a high level description of the implementation. Explain as you would to an intern who is familiar with the AWS Services. -->

## Related issue(s)
<!-- This project only accepts merge requests related to open issues -->
<!-- Please link to the issue(s) here: -->

## What is the [security risk](https://panost.pages.aws.dev/proserve-security-guidance/terms/#risk) introduced by this change?
<!-- If you believe that an adversary will not be interested in attempting to exploit the new functionality, then post your reasons under the first question and skip the other two. -->
1. What value might the new functionality have for an adversary?
   <!-- This question is about the "why" of an attack, not about whether it succeeds or not. Your response should therefore not take into account the security controls that are in place to prevent attacks. -->
2. If your life depended on it, how would you attempt to exploit it?
3. What [security controls](https://panost.pages.aws.dev/proserve-security-guidance/controls/) are in place to defend against such attempts?

## How has this been tested?
<!-- Please describe in detail how you tested your changes. -->
<!-- Include details of your testing environment, and the tests you ran to -->
<!-- see how your change affects other areas of the code, etc. -->

## Areas for expansion or enhancement
<!-- In a future release, how could you build upon this feature? -->
<!-- This could include supporting additional use cases or performance improvements -->

## How long did completing this template take you?
<!-- Put an `x` in one of the boxes below, or otherwise enter the number of minutes. This data will help us improve the template moving forward. -->
- [ ] < 30 minutes
- [ ] 30 - 60 minutes
- [ ] > 60 minutes

## Submitter's Checklist:
<!-- As a submitter, put an `x` in all the boxes that apply. -->
- [ ] I have updated the [README](https://gitlab.aws.dev/landing-zone-accelerator/landing-zone-accelerator-on-aws/-/blob/main/README.md) accordingly, if applicable.
- [ ] I have updated the [Implementation Guide](https://quip-amazon.com/zarXA1cbqSom/Implementation-Guide-Strategy) accordingly, if applicable.
- [ ] I have included pathing, examples, and a description to any new configuration objects. Example found [here](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GwlbConfig.html).
- [ ] I have added validations for any new configuration objects.
- [ ] I have added tests to cover my changes.

## Reviewer's Checklist:
<!-- As a reviewer, put an `x` in all the boxes that apply. -->
- [ ] Submitter has updated the Implementation Guide, README.md, and configuration TypeDocs as described in the Submitter's Checklist.
- [ ] Submitter has properly identified, evaluated, and sufficiently mitigated any introduced security concerns. 
- [ ] Submitter has modularized code as a [construct](https://gitlab.aws.dev/landing-zone-accelerator/landing-zone-accelerator-on-aws/-/tree/main/source/packages/%40aws-accelerator/constructs).
- [ ] Submitter has paginated all AWS API calls that support pagination.

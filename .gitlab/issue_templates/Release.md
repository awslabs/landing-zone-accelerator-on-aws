## Overview
This template is designed to be used as a checklist when publishing a new release of the Landing Zone Accelerator. Ensure all boxes are complete before publishing a release.

Additional information regarding the release process can be found on the following pages:
- [Overall Release Process](https://w.amazon.com/bin/view/AWS/Teams/Product%26Solutions/Teams/STCE/LandingZoneAcceleratorOnAWS/Operations/ReleaseProcess/)
- [Code Release Process](https://w.amazon.com/bin/view/AWS/Teams/Product%26Solutions/Teams/STCE/LandingZoneAcceleratorOnAWS/Operations/CodeRelease/)

### GitLab Operations
- [ ] I have created a release commit on the `integ` branch
- [ ] I have verified the all-enabled pipeline ran successfully before commits from `integ` were merged to `main`
- [ ] I have created the GitLab release branch and tagged the branch with the latest version tag
- [ ] I have verified that the GitLab CI release jobs completed successfully


### Documentation
- [ ] I have generated release notes that highlight the most significant features in the release
- [ ] I have checked the CHANGELOG.md to verify it includes all significant code changes in the release
- [ ] I have verified that typedocs and mkdocs have been generated successfully
- [ ] I have created an Asana ticket with Tech Writing team to update the AWS Solutions page
- [ ] I have [published](https://w.amazon.com/bin/view/AWS/Solutions/SolutionsTeam/SolutionsEngineeringBuildProcess/Steps-and-Ticketing/TechWriting) any new changes to the Implementation Guide

### Testing
- [ ] I have run the Isengard release pipelines to verify the new branch deploys successfully in all regions
- [ ] I have asked our AWS Solutions publisher (John Reynolds) to create a new AWS Solutions pipeline
- [ ] I have reviewed and resolved all blocking findings from the AWS Solutions pipeline 
- [ ] I have created a CRUX review with AppSec.
- [ ] I have created a release candidate branch and shared it to LZA Ambassadors for further testing

### Staging GitHub Operations

- [ ] I have cherry-picked commits from the GitLab release branch to a release branch in the staging GitHub repository
- [ ] I have created a release in the staging GitHub repository using the Release Notes
- [ ] I have verified GitHub pages are generated successfully in the staging repository
- [ ] I have verified there are no broken links in the GitHub pages

### Production GitHub Operations
- [ ] I have pushed the release branch from the staging repository to the production repository
- [ ] I have created the release in the production repository using the Release Notes
- [ ] I have updated the repository's default branch to be the new release branch

### Post-Release
- [ ] I have closed all [pending release](https://github.com/awslabs/landing-zone-accelerator-on-aws/issues?q=is%3Aissue%20state%3Aopen%20label%3Apending-release) issues in GitHub 

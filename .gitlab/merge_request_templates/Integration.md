## Overview
This template is designed to be used as a checklist when merging the `integ` branch of the LZA to the `main` branch. The expectation is this process is performed once per week.

### Creating the integration merge request
1. Create a new merge request, specify `integ` as the source branch and `main` as the target branch.
2. Uncheck the "Squash commits when merge request is accepted" button. This will ensure commit history is retained on the `main` branch.
3. Click "Create merge request".

### Checklist:
Before merging, verify the following items:
- [ ] The GitLab CI pipeline on the latest commit on `integ` succeeded.
- [ ] The all-enabled test pipeline has succeeded.

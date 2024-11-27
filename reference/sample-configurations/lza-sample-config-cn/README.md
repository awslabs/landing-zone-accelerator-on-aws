# Important Repository Update

This folder previously contained configuration files specifically designed for China regions. These files have been removed as part of our recent updates to streamline and standardize our repository.

## Recent Changes

We have made the following important updates to our repository to enhance security and efficiency:

1. Removed the cn sample configuration
2. Removed the unused AWS Config Custom Rules due to Amazon Inspector findings

For more detailed information about our current configurations, please refer to our standard [lza-sample-config](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/lza-sample-config)

## Update for AWS Lambda Functions

To address the Amazon Inspector findings related to CWE-502 and CWE-1321 in the AWS Config Custom Rules, update the affected Lambda functions as follows:

Replace this code:

```
const invokingEvent = JSON.parse(event.invokingEvent);
```

With:

```
let invokingEvent;
  try {
    invokingEvent = JSON.parse(event.invokingEvent);
  } catch (error) {
    console.error('Error parsing invokingEvent:', error);
    throw new Error('Invalid invokingEvent format');
  }
```

This change adds error handling to the JSON parsing, addressing potential security vulnerabilities.
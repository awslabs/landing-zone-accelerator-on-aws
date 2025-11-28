#!/bin/bash

# LZA Bootstrap Management Script
# This script bootstraps CDK in current AWS region and global region for the management account
# It runs only during the 'prepare' stage of the LZA pipeline

# Only run if ACCELERATOR_STAGE is 'prepare'
if [ "$ACCELERATOR_STAGE" != "prepare" ]; then
  exit 0
fi

# Skip DynamoDB lookups during bootstrap stage since accounts may not exist yet
# Forces lookups to use AWS Organizations API instead
export ACCELERATOR_SKIP_DYNAMODB_LOOKUP=true

# Bootstrap in current region and global region (passed as first argument)
GLOBAL_REGION=$1
REGIONS="$AWS_REGION $GLOBAL_REGION"

# Determine which AWS account ID to use (priority order):
# 1. MANAGEMENT_ACCOUNT_ID environment variable
# 2. PIPELINE_ACCOUNT_ID environment variable  
# 3. Current caller identity from AWS STS
ACCOUNT_ID=${MANAGEMENT_ACCOUNT_ID:-${PIPELINE_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}}

# Determine AWS partition (aws, aws-gov, aws-cn)
# Uses PARTITION env var if set, otherwise extracts from STS caller identity ARN
PARTITION=${PARTITION:-$(aws sts get-caller-identity --query 'Arn' --output text | cut -d':' -f2)}

# Bootstrap CDK in home and global region
# Synth generates CloudFormation templates, bootstrap deploys CDK toolkit resources
for REGION in $REGIONS; do
  echo "Bootstrapping CDK in region: $REGION for account: $ACCOUNT_ID"
  # Generate CloudFormation templates for bootstrap stage
  yarn run ts-node --transpile-only cdk.ts synth --config-dir $CODEBUILD_SRC_DIR_Config --partition $PARTITION --stage bootstrap --account $ACCOUNT_ID --region $REGION
  # Deploy CDK bootstrap resources (S3 bucket, IAM roles, etc.)
  yarn run ts-node --transpile-only cdk.ts bootstrap --config-dir $CODEBUILD_SRC_DIR_Config --partition $PARTITION --stage bootstrap --account $ACCOUNT_ID --region $REGION
done
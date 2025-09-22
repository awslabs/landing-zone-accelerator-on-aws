#!/bin/bash

# LZA Bootstrap Management Script
# This script bootstraps CDK in all enabled regions for the management account
# It runs during the 'prepare' stage of the LZA pipeline

# Parse global-config.yaml to extract all enabled regions (homeRegion + enabledRegions)
# Uses Node.js with yaml module to avoid installing additional dependencies
ENABLED_REGIONS=$(node -e "const yaml=require('yaml');const fs=require('fs');const config=yaml.parse(fs.readFileSync('$CODEBUILD_SRC_DIR_Config/global-config.yaml','utf8'));const regions=[config.homeRegion,...(config.enabledRegions||[])];console.log([...new Set(regions)].join(' '));")

# Determine which AWS account ID to use (priority order):
# 1. MANAGEMENT_ACCOUNT_ID environment variable
# 2. PIPELINE_ACCOUNT_ID environment variable  
# 3. Current caller identity from AWS STS
ACCOUNT_ID=${MANAGEMENT_ACCOUNT_ID:-${PIPELINE_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}}

# Determine AWS partition (aws, aws-gov, aws-cn)
# Uses PARTITION env var if set, otherwise extracts from STS caller identity ARN
PARTITION=${PARTITION:-$(aws sts get-caller-identity --query 'Arn' --output text | cut -d':' -f2)}

# Bootstrap CDK in each enabled region
# First synth to generate CloudFormation templates, then bootstrap to create CDK resources
for ENABLED_REGION in $ENABLED_REGIONS; do
  echo "Bootstrapping CDK in region: $ENABLED_REGION for account: $ACCOUNT_ID"
  # Generate CloudFormation templates for bootstrap stage
  yarn run ts-node --transpile-only cdk.ts synth --config-dir $CODEBUILD_SRC_DIR_Config --partition $PARTITION --stage bootstrap --account $ACCOUNT_ID --region $ENABLED_REGION
  # Deploy CDK bootstrap resources (S3 bucket, IAM roles, etc.)
  yarn run ts-node --transpile-only cdk.ts bootstrap --config-dir $CODEBUILD_SRC_DIR_Config --partition $PARTITION --stage bootstrap --account $ACCOUNT_ID --region $ENABLED_REGION
done
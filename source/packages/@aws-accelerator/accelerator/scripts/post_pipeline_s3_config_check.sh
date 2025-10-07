#!/bin/bash

#==============================================================================
# AWS ACCELERATOR POST-PIPELINE S3 CONFIGURATION CHECK SCRIPT
#==============================================================================
# Purpose: Checks and manages S3 configuration files for AWS Accelerator pipeline
# This script ensures configuration files are properly copied to destination S3
# buckets when using S3 as the configuration repository source
#==============================================================================

# Exit immediately if any command fails (fail-fast behavior)
set -e

#------------------------------------------------------------------------------
# SECTION 1: ENVIRONMENT SETUP AND VALIDATION
#------------------------------------------------------------------------------
# Required Environment Variables (must be set before running this script):
# - PIPELINE_ACCOUNT_ID: AWS account ID where pipeline is deployed  
# - AWS_REGION: AWS region where resources are deployed
# - ACCELERATOR_QUALIFIER: Optional qualifier for stack naming (if not set, uses ACCELERATOR_PREFIX)
# - ACCELERATOR_PREFIX: Prefix for accelerator resources (used when ACCELERATOR_QUALIFIER not set)

echo "=== AWS Accelerator S3 Configuration Check Started ==="
echo "Timestamp: $(date)"

#------------------------------------------------------------------------------
# SECTION 2: CLOUDFORMATION STACK DISCOVERY
#------------------------------------------------------------------------------
# Construct pipeline stack name using same logic as TypeScript implementation
if [ -n "$ACCELERATOR_QUALIFIER" ]; then
    PIPELINE_STACK_NAME="${ACCELERATOR_QUALIFIER}-pipeline-stack-${PIPELINE_ACCOUNT_ID}-${AWS_REGION:-$AWS_DEFAULT_REGION}"
else
    PIPELINE_STACK_NAME="${ACCELERATOR_PREFIX}-PipelineStack-${PIPELINE_ACCOUNT_ID}-${AWS_REGION:-$AWS_DEFAULT_REGION}"
fi
echo "Pipeline Stack Name: $PIPELINE_STACK_NAME"

#------------------------------------------------------------------------------
# SECTION 3: S3 URI EXTRACTION FROM CLOUDFORMATION OUTPUTS
#------------------------------------------------------------------------------
# Extract S3 source URI from CloudFormation stack outputs
# This contains the original configuration files
echo "Retrieving S3 source URI from CloudFormation outputs..."
S3_SRC_URI=$(aws cloudformation describe-stacks \
    --stack-name "$PIPELINE_STACK_NAME" \
    --query "Stacks[0].Outputs[?starts_with(OutputKey, 'PipelineConfigRepositoryS3Source')].OutputValue" \
    --output text)

# Extract S3 destination URI from CloudFormation stack outputs  
# This is where configuration files should be copied to
echo "Retrieving S3 destination URI from CloudFormation outputs..."
S3_DEST_URI=$(aws cloudformation describe-stacks \
    --stack-name "$PIPELINE_STACK_NAME" \
    --query "Stacks[0].Outputs[?starts_with(OutputKey, 'PipelineConfigRepositoryS3Destination')].OutputValue" \
    --output text)

echo "Source URI: ${S3_SRC_URI:-'Not found'}"
echo "Destination URI: ${S3_DEST_URI:-'Not found'}"

#------------------------------------------------------------------------------
# SECTION 4: S3 CONFIGURATION LOGIC
#------------------------------------------------------------------------------
# Check if S3 destination URI exists and is valid (indicates S3 is being used as config source)
if [ -n "$S3_DEST_URI" ] && [ "$S3_DEST_URI" != "None" ]; then
    echo "S3 configuration detected - proceeding with S3 operations..."
    
    # Check if the destination object already exists
    echo "Checking if configuration already exists at destination..."
    if ! aws s3 ls "$S3_DEST_URI" >/dev/null 2>&1; then
        # Object doesn't exist - copy from source to destination
        echo "✓ Configuration not found at destination"
        echo "📋 Copying configuration from source to destination..."
        echo "   From: $S3_SRC_URI"
        echo "   To:   $S3_DEST_URI"
        
        aws s3 cp "$S3_SRC_URI" "$S3_DEST_URI"
        
        echo "✅ Configuration successfully copied to destination"
    else
        # Object already exists - no action needed
        echo "✓ Configuration already exists at destination - no copy needed"
    fi
else
    # No S3 destination found - using alternative repository type
    echo "ℹ️  No S3 destination URI found in CloudFormation outputs"
    echo "   This indicates the pipeline is using CodeCommit or CodeConnections"
    echo "   as the configuration repository source - no S3 operations needed"
fi

#------------------------------------------------------------------------------
# SECTION 5: COMPLETION
#------------------------------------------------------------------------------
echo "=== AWS Accelerator S3 Configuration Check Completed ==="
echo "Timestamp: $(date)"

#==============================================================================
# TROUBLESHOOTING GUIDE
#==============================================================================
# Common Issues and Solutions:
#
# 1. "Stack not found" error:
#    - Verify ACCELERATOR_PREFIX, PIPELINE_ACCOUNT_ID, and AWS_REGION are correct
#    - Ensure the pipeline stack has been deployed successfully
#
# 2. "Access denied" errors:
#    - Check AWS credentials have proper permissions for CloudFormation and S3
#    - Verify IAM roles/policies allow describe-stacks and s3 operations
#
# 3. "No S3 configuration output found":
#    - This is normal when using CodeCommit/CodeConnections - not an error
#
# 4. Script fails with "set -e":
#    - Check all required environment variables are set
#    - Verify AWS CLI is installed and configured
#==============================================================================

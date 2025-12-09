#!/bin/bash
# run-lza.sh - Entry point for Landing Zone Accelerator (LZA) container deployment
# This script initializes the S3 configuration repository if needed, then invokes run-pipeline.sh

set -e

echo "=========================================="
echo "LZA Container Deployment - run-lza.sh"
echo "=========================================="

# Check if we have the basic required environment variables
echo "Checking environment variables..."

# Core required variables
required_vars=(
    "CONFIG_S3_PATH"
    "MANAGEMENT_ACCOUNT_EMAIL"
    "LOG_ARCHIVE_ACCOUNT_EMAIL"
    "AUDIT_ACCOUNT_EMAIL"
    "AWS_REGION"
    "ACCELERATOR_PREFIX"
    "INSTALLER_STACK_NAME"
    "PIPELINE_ACCOUNT_ID"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

# Check for partial external pipeline configuration (all or none)
if [ -n "$MANAGEMENT_ACCOUNT_ID" ] || [ -n "$MANAGEMENT_ACCOUNT_ROLE_NAME" ] || [ -n "$ACCELERATOR_QUALIFIER" ]; then
    if [ -z "$MANAGEMENT_ACCOUNT_ID" ] || [ -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ] || [ -z "$ACCELERATOR_QUALIFIER" ]; then
        echo "ERROR: Partial external pipeline configuration detected"
        echo "For external pipeline deployment, ALL of the following variables must be set:"
        echo "  - MANAGEMENT_ACCOUNT_ID"
        echo "  - MANAGEMENT_ACCOUNT_ROLE_NAME" 
        echo "  - ACCELERATOR_QUALIFIER"
        exit 1
    fi
    echo "External pipeline configuration detected"
else
    echo "Standard pipeline configuration detected"
fi

# Report any missing variables
if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "ERROR: Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

echo "Environment validation complete"

# ============================================
# PHASE 1: S3 Config Initialization
# ============================================

echo ""
echo "=========================================="
echo "Phase 1: S3 Config Initialization"
echo "=========================================="

# Check if config already exists in S3
echo "Checking if config exists at: $CONFIG_S3_PATH"
echo "S3 Bucket: $CONFIG_S3_BUCKET"
echo "S3 Key: $CONFIG_S3_KEY"

# Set pager size to 0 or else commands error out
aws configure set cli_pager ""

# Check if config exists using dedicated environment variables
if aws s3api head-object --bucket "$CONFIG_S3_BUCKET" --key "$CONFIG_S3_KEY" >/dev/null 2>&1; then
    echo "Config already exists in S3 - skipping initialization"
else
    echo "Config not found in S3 - initializing..."
    
    # Set homeRegion from AWS_REGION for init-config.ts
    export homeRegion="$AWS_REGION"
    
    echo "Running config initialization with homeRegion: $homeRegion"
    
    # Run the config initialization
    cd /landing-zone-accelerator-on-aws/source/packages/@aws-accelerator/accelerator/
    yarn ts-node bin/init-config.ts
    
    echo "Config initialization complete"
fi

# ============================================
# PHASE 2: External Pipeline Configuration
# ============================================

if [ -n "$MANAGEMENT_ACCOUNT_ID" ] && [ -n "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then
    echo ""
    echo "=========================================="
    echo "Phase 2: External Pipeline Configuration"
    echo "=========================================="
    
    echo "External pipeline mode detected"
    echo "Management Account ID: $MANAGEMENT_ACCOUNT_ID"
    echo "Role Name: $MANAGEMENT_ACCOUNT_ROLE_NAME"
    echo "Accelerator Qualifier: $ACCELERATOR_QUALIFIER"
    
    # The run-pipeline.sh script will handle role assumption internally
    # We just need to pass the configuration through environment variables
    echo "Configuration will be passed to run-pipeline.sh for role assumption"
else
    echo "Standard pipeline mode - no external role configuration"
fi

# ============================================
# PHASE 3: Pipeline Execution
# ============================================

echo ""
echo "=========================================="
echo "Phase 3: Pipeline Execution"
echo "=========================================="

# Execute the main pipeline
echo "Starting LZA pipeline execution..."

# Extract the command (synth/deploy) from arguments, default to deploy
COMMAND=${1:-deploy}

echo "Running: run-pipeline.sh $COMMAND $CONFIG_S3_PATH"
exec /landing-zone-accelerator-on-aws/scripts/run-pipeline.sh "$COMMAND" "$CONFIG_S3_PATH"
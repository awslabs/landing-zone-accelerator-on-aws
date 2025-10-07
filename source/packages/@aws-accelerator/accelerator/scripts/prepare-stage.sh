#!/bin/bash
set -e

# Only run if this is the prepare stage
if [ "$ACCELERATOR_STAGE" != "prepare" ]; then
  exit 0
fi

echo "Starting prepare stage operations..."

# Navigate to source directory
cd source

# Validate configuration
echo "Validating configuration..."
LOG_LEVEL=info yarn validate-config "$CODEBUILD_SRC_DIR_Config"
echo "Configuration validation completed successfully"

# Extract package version
echo "Checking package version..."
PACKAGE_VERSION=$(cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[:space:]')
export PACKAGE_VERSION

# Version check if enabled
if [ "$ACCELERATOR_CHECK_VERSION" = "yes" ]; then
  if [ "$PACKAGE_VERSION" != "$ACCELERATOR_PIPELINE_VERSION" ]; then
    echo "ERROR: Accelerator package version in Source ($PACKAGE_VERSION) does not match currently installed LZA version ($ACCELERATOR_PIPELINE_VERSION)."
    echo "Please ensure that the Installer stack has been updated prior to updating the Source code in CodePipeline."
    exit 1
  fi
  echo "Package version check passed"
fi

echo "Prepare stage operations completed successfully"
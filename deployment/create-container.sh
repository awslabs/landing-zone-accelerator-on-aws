#!/bin/bash

# Set solution name from environment variable or use default
SOLUTION_TRADEMARKEDNAME="${SOLUTION_TRADEMARKEDNAME:-landing-zone-accelerator-on-aws}"

# Set version from environment variable or extract from source/package.json
if [ -z "$VERSION" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    VERSION="v$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${SCRIPT_DIR}/../source/package.json" | head -n1)"
fi

origin_directory=$(pwd)

# Clear the solution of build artifacts as it makes build-open-source-dist run longer
yarn git-clean

# Change into root dir
cd ".."
working_directory=$(pwd)

# make the open source distributable code
cd "${working_directory}/deployment" && "${working_directory}/deployment/build-open-source-dist.sh" lza

# Make directories
mkdir -p "${working_directory}/deployment/build/context_dir"
mkdir -p "${working_directory}/deployment/global-s3-assets"
mkdir -p "${working_directory}/deployment/build/context_dir/scripts"

# Move and unzip code archive in empty context
unzip -q "${working_directory}/deployment/open-source/lza.zip" -d "${working_directory}/deployment/build/context_dir/"

# Copy build file into empty context (only if not already present from zip)
if [ ! -f "${working_directory}/deployment/build/context_dir/Dockerfile" ]; then
    cp "${working_directory}/container/build/Dockerfile" "${working_directory}/deployment/build/context_dir/Dockerfile"
fi

# Set NODE_OPTIONS if not already set
if [ -z "$NODE_OPTIONS" ]; then
  export NODE_OPTIONS=--max-old-space-size=8192
fi

# Target file to update
DOCKERFILE="${working_directory}/deployment/build/context_dir/Dockerfile"

# Replace the ENV NODE_OPTIONS line with the current value
sed "s|^ENV NODE_OPTIONS=.*|ENV NODE_OPTIONS=${NODE_OPTIONS}|" "$DOCKERFILE" > "$DOCKERFILE.tmp" && mv "$DOCKERFILE.tmp" "$DOCKERFILE"

echo "Updated $DOCKERFILE with ENV NODE_OPTIONS=${NODE_OPTIONS}"

# Copy any .sh files from root to scripts directory (from the zip)
cp "${working_directory}/container/scripts/"run-lza.sh "${working_directory}/deployment/build/context_dir/scripts/" 2>/dev/null || true
cp "${working_directory}/container/scripts/"run-pipeline.sh "${working_directory}/deployment/build/context_dir/scripts/" 2>/dev/null || true

# Change to docker context dir
cd "${working_directory}/deployment/build/context_dir/"

# Build container
docker build -t "${SOLUTION_TRADEMARKEDNAME}:${VERSION}" .

# Cleanup folders
rm -rf "${working_directory}/deployment/build"
rm -rf "${working_directory}/deployment/open-source"

echo ""
echo "=========================================="
echo "Done. Container build complete."
echo "Image: ${SOLUTION_TRADEMARKEDNAME}:${VERSION}"
echo ""
echo "NOTE: This image is intended for LOCAL development and testing only."
echo "      It is NOT suitable for running in ECS."
echo "=========================================="

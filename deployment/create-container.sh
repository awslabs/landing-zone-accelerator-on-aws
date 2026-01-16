#!/bin/bash

# Set solution name from environment variable or use default
SOLUTION_TRADEMARKEDNAME="${SOLUTION_TRADEMARKEDNAME:-landing-zone-accelerator-on-aws}"

# Set version from environment variable or extract from package.json
if [ -z "$VERSION" ]; then
    VERSION="v$(node -p "require('./package.json').version")"
fi

origin_directory=$(pwd)

yarn git-clean;

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

# Copy any .sh files from root to scripts directory (from the zip)
cp "${working_directory}/container/scripts/"run-lza.sh "${working_directory}/deployment/build/context_dir/scripts/" 2>/dev/null || true
cp "${working_directory}/container/scripts/"run-pipeline.sh "${working_directory}/deployment/build/context_dir/scripts/" 2>/dev/null || true

# Change to docker context dir
cd "${working_directory}/deployment/build/context_dir/"

# Build container
docker build --progress=plain --platform linux/amd64 -t "${SOLUTION_TRADEMARKEDNAME}:${VERSION}" .

# Save container to archive
docker save "${SOLUTION_TRADEMARKEDNAME}:${VERSION}" | gzip > "${SOLUTION_TRADEMARKEDNAME}-${VERSION}.tar.gz"

# Move archive to deployment dir
mv "${SOLUTION_TRADEMARKEDNAME}-${VERSION}.tar.gz" "${working_directory}/deployment/global-s3-assets"

# Change directory back to orginal
cd $origin_directory

# Cleanup folders
rm -rf "${working_directory}/deployment/build"
rm -rf "${working_directory}/deployment/open-source/lza.zip"
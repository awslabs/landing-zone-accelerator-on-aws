#!/bin/bash -eo pipefail
# This script updates the package version for a release
# and all snapshots for Landing Zone Accelerator. Run this 
# as part of the changes in the release commit.

# Set line color values
shw_succ () {
    echo $(tput bold)$(tput setaf 2) $@ $(tput sgr 0)
}
shw_info () {
    echo $(tput bold)$(tput setaf 0) $@ $(tput sgr 0)
}
shw_err ()  {
    echo $(tput bold)$(tput setaf 1) $@ $(tput sgr 0)
}

# Extract Version from source/package.json
PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')

# Request user to confirm the appropriate version is set before proceeding
while true; do
    read -p "Is this release version correct:$PACKAGE_VERSION? [Y/N]" yn
    case $yn in
        [Yy]* ) shw_succ "Great! Continuing with the updating of snapshots."; break;;
        [Nn]* ) shw_err "Please update source/package.json version and rerun"; exit;;
        * ) shw_err "Please answer yes or no.";;
    esac
done

# Change into @aws-accelerator dir
cd "./packages/@aws-accelerator"

# Iterate through updating snapshots with new version
for dir in `find . -depth -maxdepth 1 -mindepth 1 -type d`
do
    shw_succ "Switching to $dir"
    cd $dir
    shw_succ "Updating snapshots for $dir"
    # Updating snapshots
    yarn test:unit -u

    # Switch back to source directory
    shw_succ "######################################################"
    shw_succ "######################################################"
    shw_succ "Snapshot Update complete for $dir"
    shw_succ "######################################################"
    shw_succ "######################################################"
    cd ..
done

shw_succ "Successfully updated all snapshots for version:$PACKAGE_VERSION"

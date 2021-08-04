#!/bin/bash
#
# This script packages your project into an open-source solution distributable 
# that can be published to sites like GitHub.
#
# Important notes and prereq's:
#   1. The initialize-repo.sh script must have been run in order for this script to
#      function properly.
#   2. This script should be run from the repo's /deployment folder.
# 
# This script will perform the following tasks:
#   1. Remove any old dist files from previous runs.
#   2. Package the GitHub contribution and pull request templates (typically
#      found in the /.github folder).
#   3. Package the /source folder along with the necessary root-level
#      open-source artifacts (i.e. CHANGELOG, etc.).
#   4. Remove any unecessary artifacts from the /open-source folder (i.e. 
#      node_modules, package-lock.json, etc.).
#   5. Zip up the /open-source folder and create the distributable.
#   6. Remove any temporary files used for staging.
#
# Parameters:
#  - solution-name: name of the solution for consistency

# Check to see if the required parameters have been provided:
if [ -z "$1" ]; then
    echo "Please provide the trademark approved solution name for the open source package."
    echo "For example: ./build-open-source-dist.sh trademarked-solution-name"
    exit 1
fi

# Get reference for all important folders
source_template_dir="$PWD"
dist_dir="$source_template_dir/open-source"
source_dir="$source_template_dir/../source"
github_dir="$source_template_dir/../.github"

echo "------------------------------------------------------------------------------"
echo "[Init] Remove any old dist files from previous runs"
echo "------------------------------------------------------------------------------"

echo "rm -rf $dist_dir"
rm -rf $dist_dir
echo "mkdir -p $dist_dir"
mkdir -p $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] GitHub templates"
echo "------------------------------------------------------------------------------"

echo "cp -r $github_dir $dist_dir"
cp -r $github_dir $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Source folder"
echo "------------------------------------------------------------------------------"

echo "cp -r $source_dir $dist_dir"
cp -r $source_dir $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Files from the root level of the project"
echo "------------------------------------------------------------------------------"

echo "cp $source_template_dir/../LICENSE.txt $dist_dir"
cp $source_template_dir/../LICENSE.txt $dist_dir

echo "cp $source_template_dir/../NOTICE.txt $dist_dir"
cp $source_template_dir/../NOTICE.txt $dist_dir

echo "cp $source_template_dir/../README.md $dist_dir"
cp $source_template_dir/../README.md $dist_dir

echo "cp $source_template_dir/../CODE_OF_CONDUCT.md $dist_dir"
cp $source_template_dir/../CODE_OF_CONDUCT.md $dist_dir

echo "cp $source_template_dir/../CONTRIBUTING.md $dist_dir"
cp $source_template_dir/../CONTRIBUTING.md $dist_dir

echo "cp $source_template_dir/../CHANGELOG.md $dist_dir"
cp $source_template_dir/../CHANGELOG.md $dist_dir

echo "cp $source_template_dir/../.gitignore $dist_dir"
cp $source_template_dir/../.gitignore $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Clean up the open-source distributable"
echo "------------------------------------------------------------------------------"
echo $dist_dir
# General cleanup of node_modules and package-lock.json files
echo "find $dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null"
find $dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null
echo "find $dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null"
find $dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null

echo "------------------------------------------------------------------------------"
echo "[Packing] Create GitHub (open-source) zip file"
echo "------------------------------------------------------------------------------"

# Create the zip file
echo "cd $dist_dir"
cd $dist_dir
echo "zip -q -r9 ../$1.zip ."
zip -q -r9 ../$1.zip .

# Cleanup any temporary/unnecessary files
echo "Clean up open-source folder"
echo "rm -rf * .*"
rm -rf * .*

# Place final zip file in $dist_dir
echo "mv ../$1.zip ."
mv ../$1.zip .

echo "Completed building $1.zip dist"
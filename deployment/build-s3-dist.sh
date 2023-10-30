#!/bin/bash
#
# This script packages your project into a solution distributable that can be
# used as an input to the solution builder validation pipeline.
#
# Important notes and prereq's:
#   1. The initialize-repo.sh script must have been run in order for this script to
#      function properly.
#   2. This script should be run from the repo's /deployment folder.
#
# This script will perform the following tasks:
#   1. Remove any old dist files from previous runs.
#   2. Install dependencies for the cdk-solution-helper; responsible for
#      converting standard 'cdk synth' output into solution assets.
#   3. Build and synthesize your CDK project.
#   4. Run the cdk-solution-helper on template outputs and organize
#      those outputs into the /global-s3-assets folder.
#   5. Organize source code artifacts into the /regional-s3-assets folder.
#   6. Remove any temporary files used for staging.
#
# Parameters:
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda
#    code from. The template will append '-[region_name]' to this bucket name.
#    For example: ./build-s3-dist.sh solutions v1.0.0
#    The template will then expect the source code to be located in the solutions-[region_name] bucket
#  - solution-name: name of the solution for consistency
#  - version-code: version of the package
#-----------------------
# Formatting
bold=$(tput bold)
normal=$(tput sgr0)
#------------------------------------------------------------------------------
# SETTINGS
#------------------------------------------------------------------------------
template_format="json"
run_helper="true"

# run_helper is false for yaml - not supported
[[ $template_format == "yaml" ]] && {
    run_helper="false"
    echo "${bold}Solution_helper disabled:${normal} template format is yaml"
}

#------------------------------------------------------------------------------
# DISABLE OVERRIDE WARNINGS
#------------------------------------------------------------------------------
# Use with care: disables the warning for overridden properties on
# AWS Solutions Constructs
export overrideWarningsEnabled=false

#------------------------------------------------------------------------------
# Build Functions
#------------------------------------------------------------------------------
# Echo, execute, and check the return code for a command. Exit if rc > 0
# ex. do_cmd npm run build
usage()
{
    echo "Usage: $0 bucket solution-name version"
    echo "Please provide the base source bucket name, trademarked solution name, and version."
    echo "For example: ./build-s3-dist.sh mybucket my-solution v1.0.0"
    exit 1
}

do_cmd()
{
    echo "------ EXEC $*"
    $*
    rc=$?
    if [ $rc -gt 0 ]
    then
            echo "Aborted - rc=$rc"
            exit $rc
    fi
}

sedi()
{
    # cross-platform for sed -i
    sed -i $* 2>/dev/null || sed -i "" $*
}

# use sed to perform token replacement
# ex. do_replace myfile.json %%VERSION%% v1.1.1
do_replace()
{
    replace="s/$2/$3/g"
    file=$1
    do_cmd sedi $replace $file
}

create_template_json()
{
    # Run 'cdk synth' to generate raw solution outputs
    do_cmd yarn run cdk synth --output=$staging_dist_dir

    # Remove unnecessary output files
    do_cmd cd $staging_dist_dir
    # ignore return code - can be non-zero if any of these does not exist
    rm tree.json manifest.json cdk.out

    # Move outputs from staging to template_dist_dir
    echo "Move outputs from staging to template_dist_dir"
    do_cmd mv $staging_dist_dir/*.template.json $template_dist_dir/

    # Rename all *.template.json files to *.template
    echo "Rename all *.template.json to *.template"
    echo "copy templates and rename"
    for f in $template_dist_dir/*.template.json; do
        mv -- "$f" "${f%.template.json}.template"
    done
}

create_template_yaml()
{
    # Assumes current working directory is where the CDK is defined
    # Output YAML - this is currently the only way to do this for multiple templates
    maxrc=0
    for template in `cdk list`; do
        echo Create template $template
        do_cmd yarn run cdk synth $template > ${template_dist_dir}/${template}.template
        if [[ $? > $maxrc ]]; then
            maxrc=$?
        fi
    done
}

cleanup_temporary_generted_files()
{
    echo "------------------------------------------------------------------------------"
    echo "${bold}[Cleanup] Remove temporary files${normal}"
    echo "------------------------------------------------------------------------------"

    # Delete generated files: CDK Consctruct typescript transcompiled generted files
    do_cmd cd $source_dir/
    do_cmd yarn run cleanup:tsc

    # Delete the temporary /staging folder
    do_cmd rm -rf $staging_dist_dir
}

fn_exists()
{
    exists=`LC_ALL=C type $1`
    return $?
}

#------------------------------------------------------------------------------
# INITIALIZATION
#------------------------------------------------------------------------------
# solution_config must exist in the deployment folder (same folder as this
# file) . It is the definitive source for solution ID, name, and trademarked
# name.
#
# Example:
#
# SOLUTION_ID='SO0111'
# SOLUTION_NAME='AWS Security Hub Automated Response & Remediation'
# SOLUTION_TRADEMARKEDNAME='aws-security-hub-automated-response-and-remediation'
# SOLUTION_VERSION='v1.1.1' # optional
if [[ -e './solution_config' ]]; then
    source ./solution_config
else
    echo "solution_config is missing from the solution root."
    exit 1
fi

if [[ -z $SOLUTION_ID ]]; then
    echo "SOLUTION_ID is missing from ../solution_config"
    exit 1
else
    export SOLUTION_ID
fi

if [[ -z $SOLUTION_NAME ]]; then
    echo "SOLUTION_NAME is missing from ../solution_config"
    exit 1
else
    export SOLUTION_NAME
fi

if [[ -z $SOLUTION_TRADEMARKEDNAME ]]; then
    echo "SOLUTION_TRADEMARKEDNAME is missing from ../solution_config"
    exit 1
else
    export SOLUTION_TRADEMARKEDNAME
fi

if [[ ! -z $SOLUTION_VERSION ]]; then
    export SOLUTION_VERSION
fi

#------------------------------------------------------------------------------
# Validate command line parameters
#------------------------------------------------------------------------------
# Validate command line input - must provide bucket
[[ -z $1 ]] && { usage; exit 1; } || { SOLUTION_BUCKET=$1; }

# Environmental variables for use in CDK
export DIST_OUTPUT_BUCKET=$SOLUTION_BUCKET

# Version from the command line is definitive. Otherwise, use, in order of precedence:
# - SOLUTION_VERSION from solution_config
# - version.txt
#
# Note: Solutions Pipeline sends bucket, name, version. Command line expects bucket, version
# if there is a 3rd parm then version is $3, else $2
#
# If confused, use build-s3-dist.sh <bucket> <version>
if [ ! -z $3 ]; then
    version="$3"
elif [ ! -z "$2" ]; then
    version=$2
elif [ ! -z $SOLUTION_VERSION ]; then
    version=$SOLUTION_VERSION
elif [ -e ../source/version.txt ]; then
    version=`cat ../source/version.txt`
else
    echo "Version not found. Version must be passed as an argument or in version.txt in the format vn.n.n"
    exit 1
fi
SOLUTION_VERSION=$version

# SOLUTION_VERSION should be vn.n.n
if [[ $SOLUTION_VERSION != v* ]]; then
    echo prepend v to $SOLUTION_VERSION
    SOLUTION_VERSION=v${SOLUTION_VERSION}
fi

export SOLUTION_VERSION=$version

#-----------------------------------------------------------------------------------
# Get reference for all important folders
#-----------------------------------------------------------------------------------
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"
installer_dir="$source_dir/packages/@aws-accelerator/installer"
govcloud_vending_dir="$source_dir/packages/@aws-accelerator/govcloud-account-vending"

echo "------------------------------------------------------------------------------"
echo "${bold}[Init] Remove any old dist files from previous runs${normal}"
echo "------------------------------------------------------------------------------"

do_cmd rm -rf $template_dist_dir
do_cmd mkdir -p $template_dist_dir
do_cmd rm -rf $build_dist_dir
do_cmd mkdir -p $build_dist_dir
do_cmd rm -rf $staging_dist_dir
do_cmd mkdir -p $staging_dist_dir


echo "------------------------------------------------------------------------------"
echo "${bold}[Init] Install dependencies for the cdk-solution-helper${normal}"
echo "------------------------------------------------------------------------------"

do_cmd cd $template_dir/cdk-solution-helper
do_cmd npm install

echo "------------------------------------------------------------------------------"
echo "${bold}[Synth] CDK Project${normal}"
echo "------------------------------------------------------------------------------"

do_cmd cd $source_dir

# Add local install to PATH
export PATH=$(yarn bin):$PATH

do_cmd yarn install
do_cmd yarn build          # build javascript from typescript to validate the code
                           # cdk synth doesn't always detect issues in the typescript
                           # and may succeed using old build files. This ensures we
                           # have fresh javascript from a successful build


echo "------------------------------------------------------------------------------"
echo "${bold}[Create] Templates${normal}"
echo "------------------------------------------------------------------------------"

if fn_exists create_template_${template_format}; then
    do_cmd cd $installer_dir
    create_template_${template_format}
    do_cmd cd $source_dir
    do_cmd cd $govcloud_vending_dir
    create_template_${template_format}
    do_cmd cd $source_dir
else
    echo "Invalid setting for \$template_format: $template_format"
    exit 255
fi

echo "------------------------------------------------------------------------------"
echo "${bold}[Packing] Template artifacts${normal}"
echo "------------------------------------------------------------------------------"

# Run the helper to clean-up the templates and remove unnecessary CDK elements
echo "Run the helper to clean-up the templates and remove unnecessary CDK elements"
[[ $run_helper == "true" ]] && {
    echo "node $template_dir/cdk-solution-helper/index"
    node $template_dir/cdk-solution-helper/index
    if [ "$?" = "1" ]; then
    	echo "(cdk-solution-helper) ERROR: there is likely output above." 1>&2
    	exit 1
    fi
} || echo "${bold}Solution Helper skipped: ${normal}run_helper=false"

# Find and replace bucket_name, solution_name, and version
echo "Find and replace bucket_name, solution_name, and version"
cd $template_dist_dir
do_replace "*.template" %%BUCKET_NAME%% ${SOLUTION_BUCKET}
do_replace "*.template" %%SOLUTION_NAME%% ${SOLUTION_TRADEMARKEDNAME}
do_replace "*.template" %%VERSION%% ${SOLUTION_VERSION}
do_replace "*.template" %%PRODUCT_BUCKET%% ${TEMPLATE_OUTPUT_BUCKET}

echo "------------------------------------------------------------------------------"
echo "${bold}[Packing] Source code artifacts${normal}"
echo "------------------------------------------------------------------------------"

# General cleanup of node_modules files
echo "find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null"
find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null

# ... For each asset.* source code artifact in the temporary /staging folder...
cd $staging_dist_dir
for d in `find . -mindepth 1 -maxdepth 1 -type d`; do

    # Rename the artifact, removing the period for handler compatibility
    pfname="$(basename -- $d)"
    fname="$(echo $pfname | sed -e 's/\.//g')"
    echo "zip -r $fname.zip $fname"
    mv $d $fname

    # Build the artifacts
    if test -f $fname/requirements.txt; then
        echo "===================================="
        echo "This is Python runtime"
        echo "===================================="
        cd $fname
        venv_folder="./venv-prod/"
        rm -fr .venv-test
        rm -fr .venv-prod
        echo "Initiating virtual environment"
        python3 -m venv $venv_folder
        source $venv_folder/bin/activate
        pip3 install -q -r requirements.txt --target .
        deactivate
        cd $staging_dist_dir/$fname/$venv_folder/lib/python3.*/site-packages
        echo "zipping the artifact"
        zip -qr9 $staging_dist_dir/$fname.zip .
        cd $staging_dist_dir/$fname
        zip -gq $staging_dist_dir/$fname.zip *.py util/*
        cd $staging_dist_dir
    elif test -f $fname/package.json; then
        echo "===================================="
        echo "This is Node runtime"
        echo "===================================="
        cd $fname
        echo "Clean and rebuild artifacts"
        npm run clean
        npm ci
        if [ "$?" = "1" ]; then
	        echo "ERROR: Seems like package-lock.json does not exists or is out of sync with package.json. Trying npm install instead" 1>&2
            npm install
        fi
        cd $staging_dist_dir
        # Zip the artifact
        echo "zip -r $fname.zip $fname"
        zip -rq $fname.zip $fname
    else
        echo "===================================="
        echo "This is a Directory Asset"
        echo "===================================="

        echo "zip -r $fname.zip $fname"
        zip -rq $fname.zip $fname
    fi

    if test -f $fname.zip; then
        # Copy the zipped artifact from /staging to /regional-s3-assets
        echo "cp $fname.zip $build_dist_dir"
        cp $fname.zip $build_dist_dir

        # Remove the old, unzipped artifact from /staging
        echo "rm -rf $fname"
        rm -rf $fname

        # Remove the old, zipped artifact from /staging
        echo "rm $fname.zip"
        rm $fname.zip
        # ... repeat until all source code artifacts are zipped and placed in the
        # ... /regional-s3-assets folder
    else
        echo "ERROR: $fname.zip not found"
        exit 1
    fi

done

# This solution does not generate any assets, need to make a file to move the
# pipeline forward
touch $build_dist_dir/temp-asset.file

# cleanup temporary generated files that are not needed for later stages of the build pipeline
cleanup_temporary_generted_files

# Return to original directory from when we started the build
cd $template_dir

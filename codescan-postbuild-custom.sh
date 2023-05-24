#!/bin/bash
#--------------------------------------------------------------------
# Usage: this script must exit with a non-zero return code if the
# Viperlight scan fails.
#--------------------------------------------------------------------
. ./codescan-funcs.sh

echo ================================================================
echo ======     Viperlight Script `codescan-postbuild-custom.sh`
echo ================================================================
source_dir='./source'
solution_dir=`pwd`

# Create a temp folder for working data
viperlight_temp=/tmp/viperlight_scan # should work in most environments
if [ -d $viperlight_temp ]; then
    rm $viperlight_temp/*
    rmdir $viperlight_temp
fi
mkdir $viperlight_temp

export PATH=${PATH}:../viperlight/bin

failed_scans=0

if [ .${PIPELINE_TYPE} == . ]; then
    echo Pipeline type not set. Defaulting to \"feature\"
    PIPELINE_TYPE='feature'
fi
echo Pipeline type is ${PIPELINE_TYPE}

scan_npm() {
    echo -----------------------------------------------------------
    echo NPM Scanning ${1}
    echo -----------------------------------------------------------
    folder_path=$(dirname ${1})
    viperlight scan -t ${folder_path} -m node-npmoutdated -m node-yarnoutdated
    rc=$?
    if [ ${rc} -eq 0 ]; then
        echo SUCCESS
    elif [ ${rc} -eq 42 ]; then
        echo NOTHING TO SCAN
    else
        echo FAILED rc=${rc}
        # Disabled until cdk v2 is implemented in our solutions or
        #   we have a better way to ignore at the finding level
        # ((failed_scans=failed_scans+1))
    fi
}

scan_py() {
    echo -----------------------------------------------------------
    echo Python Scanning $1
    echo -----------------------------------------------------------
    folder_path=`dirname $1`
    viperlight scan -t $folder_path -m notice-py
    rc=$?
    if [ $rc -eq 0 ]; then
        echo SUCCESS
    elif [ $rc -eq 42 ]; then
        echo NOTHING TO SCAN
    else
        echo FAILED rc=$rc
        ((failed_scans=failed_scans+1))
    fi
}

echo -----------------------------------------------------------
echo Scanning all Nodejs projects
echo -----------------------------------------------------------
find_all_node_projects ${viperlight_temp}
if [[ -e ${viperlight_temp}/scan_npm_list.txt ]]; then
    while read folder
        do
            scan_npm $folder
        done < $viperlight_temp/scan_npm_list.txt
else
    echo No node projects found
fi

echo -----------------------------------------------------------
echo Set up python virtual environment for pubcheck scan
echo -----------------------------------------------------------
tear_down_python_virtual_env ../
# Create a list of python folders in ${viperlight_temp}/scan_python_lists.txt
find_all_python_requirements ${viperlight_temp}
setup_python_virtual_env ../

# Install modules
if [[ -e ${viperlight_temp}/scan_python_list.txt ]]; then
    pip install bandit pip-licenses pip-audit -U
    while read folder
        do
            pip install -r $folder
        done < $viperlight_temp/scan_python_list.txt
else
    echo No python projects found
fi

echo -----------------------------------------------------------
echo Running publisher checks
echo -----------------------------------------------------------
viperlight pubcheck
# Uncomment to have failed pubcheck fail the build
# rc=$?
# if [ $rc -gt 0 ]; then
#     ((failed_scans=failed_scans+1))
# fi

if [ ${failed_scans} == 0 ]
then
    echo Scan completed successfully
else
    echo ${failed_scans} scans failed. Check previous messages for findings.
fi

# Do not fail on feature pipelines
if [ ${PIPELINE_TYPE} == 'feature' ]; then
  echo ${failed_scans} scans failed in Feature pipeline. Setting exit code to passing.
  failed_scans=0
fi

exit ${failed_scans}

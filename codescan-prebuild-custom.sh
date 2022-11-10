#!/bin/bash
#--------------------------------------------------------------------
# Usage: this script must exit with a non-zero return code if the
# Viperlight scan fails.
#--------------------------------------------------------------------
. ./codescan-funcs.sh

echo ================================================================
echo ======     Viperlight Script `basename $0`
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

export PATH=$PATH:../viperlight/bin

failed_scans=0

if [ .${PIPELINE_TYPE} == . ]; then
    echo Pipeline type not set. Defaulting to \"feature\"
    PIPELINE_TYPE='feature'
fi
echo Pipeline type is ${PIPELINE_TYPE}

scan_npm() {
    echo -----------------------------------------------------------
    echo NPM / YARN Scanning $1
    echo -----------------------------------------------------------
    folder_path=`dirname $1`
    viperlight scan -t $folder_path -m node-npmaudit -m node-npm6audit -m node-npmoutdated
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

scan_py() {
    echo -----------------------------------------------------------
    echo Scanning Python Environment
    echo -----------------------------------------------------------
    viperlight scan -m python-piprot -m python-safety -m python-pipoutdated
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
echo Scanning all python projects
echo -----------------------------------------------------------
tear_down_python_virtual_env ../
find_all_python_requirements ${viperlight_temp}
setup_python_virtual_env ../
pip install piprot safety pip-licenses bandit pip-audit

# Runs python scans if there is any requirements.txt
if [[ -e ${viperlight_temp}/scan_python_list.txt ]]; then
    while read folder
        do
            echo "-----------------------------------------------------"
            echo "pip install -r ${folder}"
            echo "-----------------------------------------------------"
            pip install -r ${folder}
        done < ${viperlight_temp}/scan_python_list.txt
    scan_py ${folder}
else
    echo No python projects found
fi

echo -----------------------------------------------------------
echo Scanning everywhere else
echo -----------------------------------------------------------
cd ${solution_dir}
viperlight scan
rc=$?
if [ $rc -gt 0 ]; then
    ((failed_scans=failed_scans+1))
fi

if [ $failed_scans == 0 ]
then
    echo Scan completed successfully
else
    echo $failed_scans scans failed. Check previous messages for findings.
fi

exit $failed_scans

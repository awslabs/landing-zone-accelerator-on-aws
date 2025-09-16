#!/bin/bash

# Get input parameters
acceleratorPrefix=$1
homeRegion=$2
accountId=$3
globalRegion=$4
force_bootstrap=$5

# If force_bootstrap is true, skip checks and bootstrap everything
if [ "$force_bootstrap" = "true" ]; then
    export BOOTSTRAP_HOME_REGION="true"
    export BOOTSTRAP_GLOBAL_REGION="true"
else
    # Check if CDK toolkit stack exists in home region and has ManagementDeploymentRoleArn output
    MANAGEMENT_STACK_OUTPUT=$(aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region $homeRegion --query 'Stacks[0].Outputs[?OutputKey==`ManagementDeploymentRoleArn`]' --output text 2>/dev/null)

    # Set bootstrap flag based on stack existence and output presence
    if [ $? -ne 0 ]; then
        export BOOTSTRAP_HOME_REGION="true"  # Stack doesn't exist
    elif [ -n "$MANAGEMENT_STACK_OUTPUT" ]; then
        export BOOTSTRAP_HOME_REGION="false"  # Stack exists with required output
    else
        export BOOTSTRAP_HOME_REGION="true"  # Stack exists but missing output
    fi

    # Check if CDK toolkit stack exists in global region
    GLOBAL_STACK_OUTPUT=$(aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region $globalRegion --output text 2>/dev/null)

    # Set global bootstrap flag based on stack existence
    if [ $? -ne 0 ]; then
        export BOOTSTRAP_GLOBAL_REGION="true"  # Stack doesn't exist
    elif [ -n "$GLOBAL_STACK_OUTPUT" ]; then
        export BOOTSTRAP_GLOBAL_REGION="false"  # Stack exists
    else
        export BOOTSTRAP_GLOBAL_REGION="true"  # Fallback to true
    fi
fi

# Bootstrap global region if needed
if [ "$BOOTSTRAP_GLOBAL_REGION" = "true" ]; then
    echo "CDK Bootstrapping required for global region"
    # Replace default accelerator prefix in CloudFormation templates
    [ ! -z "$acceleratorPrefix" ] && sed -i "s/AWSAccelerator/$acceleratorPrefix/g" lib/cloudformation/bootstrap-management*.yaml
    # Bootstrap CDK in the global region with global template
    set -e && yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://${accountId}/${globalRegion} --qualifier accel --template lib/cloudformation/bootstrap-management-global.yaml
else
    echo "CDK Bootstrapping not required for global region"
fi

# Bootstrap home region if needed
if [ "$BOOTSTRAP_HOME_REGION" = "true" ]; then
    echo "CDK Bootstrapping required for home region"
    # Replace default accelerator prefix in CloudFormation templates
    [ ! -z "$acceleratorPrefix" ] && sed -i "s/AWSAccelerator/$acceleratorPrefix/g" lib/cloudformation/bootstrap-management*.yaml
    # Bootstrap CDK in home region with standard template
    set -e && yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://${accountId}/${homeRegion} --qualifier accel --template lib/cloudformation/bootstrap-management.yaml
else
    echo "CDK Bootstrapping not required for home region"
fi
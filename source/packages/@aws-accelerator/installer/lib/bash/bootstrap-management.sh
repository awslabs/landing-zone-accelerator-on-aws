#!/bin/bash

# Get input parameters
acceleratorPrefix=$1
homeRegion=$2
accountId=$3
globalRegion=$4
force_bootstrap=$5

# Print the ID of the organization the account belongs to, or an empty string when the account is not in an
# organization. Only AWSOrganizationsNotInUseException means the account is not in an organization; any other
# failure, such as a permission error or throttling, is returned as an error so the global region is never
# bootstrapped without the cross-account grant because of a transient or permission failure.
get_organization_id() {
    local errorFile id
    errorFile=$(mktemp)
    if id=$(aws organizations describe-organization --query Organization.Id --output text 2>"$errorFile"); then
        rm -f "$errorFile"
        echo "$id"
        return 0
    fi
    if grep -q "AWSOrganizationsNotInUseException" "$errorFile"; then
        rm -f "$errorFile"
        echo ""
        return 0
    fi
    echo "Failed to determine the organization ID: $(cat "$errorFile")" >&2
    rm -f "$errorFile"
    return 1
}

# If force_bootstrap is true, skip checks and bootstrap everything
if [ "$force_bootstrap" = "true" ]; then
    export BOOTSTRAP_HOME_REGION="true"
    export BOOTSTRAP_GLOBAL_REGION="true"
else
    # The ManagementDeploymentRoleArn output is only emitted for the management account, because the accelerator
    # bootstrap stack only creates the management deployment role there. In an external pipeline account setup the
    # accelerator owns the pipeline account CDK toolkit stack, so only check for stack existence in that account.
    HOME_STACK_QUERY='Stacks[0].Outputs[?OutputKey==`ManagementDeploymentRoleArn`]'
    if [ -n "$MANAGEMENT_ACCOUNT_ID" ] && [ -n "$MANAGEMENT_ACCOUNT_ROLE_NAME" ] && [ "$accountId" != "$MANAGEMENT_ACCOUNT_ID" ]; then
        HOME_STACK_QUERY='Stacks[0].StackName'
    fi

    # Check if CDK toolkit stack exists in home region and has ManagementDeploymentRoleArn output
    MANAGEMENT_STACK_OUTPUT=$(aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region $homeRegion --query "$HOME_STACK_QUERY" --output text 2>/dev/null)

    # Set bootstrap flag based on stack existence and output presence
    if [ $? -ne 0 ]; then
        export BOOTSTRAP_HOME_REGION="true"  # Stack doesn't exist
    elif [ -n "$MANAGEMENT_STACK_OUTPUT" ]; then
        export BOOTSTRAP_HOME_REGION="false"  # Stack exists with required output
    else
        export BOOTSTRAP_HOME_REGION="true"  # Stack exists but missing output
    fi

    # Check if CDK toolkit stack exists in global region. When the global region is not the home region, an existing
    # stack must also carry either the BucketNameOutput output, emitted by the accelerator bootstrap stack when the
    # global region is an enabled region, or a CfnRetentionReadAccess output, emitted by the current global template,
    # whose value matches the current organization ID (or "none" outside an organization). A stack with neither, or
    # with a CfnRetentionReadAccess value that no longer matches, is re-bootstrapped so the cross-account cfn-retention
    # read grant is corrected. The accelerator bootstrap stack is never overwritten, since it already grants the
    # organization access.
    GLOBAL_STACK_QUERY='Stacks[0].StackName'
    if [ "$globalRegion" != "$homeRegion" ]; then
        GLOBAL_STACK_QUERY='Stacks[0].Outputs[?OutputKey==`CfnRetentionReadAccess` || OutputKey==`BucketNameOutput`].[OutputKey,OutputValue]'
    fi
    GLOBAL_STACK_OUTPUT=$(aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region $globalRegion --query "$GLOBAL_STACK_QUERY" --output text 2>/dev/null)
    GLOBAL_STACK_STATUS=$?

    # Set global bootstrap flag based on stack existence and output values
    if [ $GLOBAL_STACK_STATUS -ne 0 ]; then
        export BOOTSTRAP_GLOBAL_REGION="true"  # Stack doesn't exist
    elif [ "$globalRegion" = "$homeRegion" ]; then
        export BOOTSTRAP_GLOBAL_REGION="false"  # Stack exists and is the home region stack
    elif printf '%s\n' "$GLOBAL_STACK_OUTPUT" | awk -F'\t' '$1 == "BucketNameOutput" { found = 1 } END { exit !found }'; then
        export BOOTSTRAP_GLOBAL_REGION="false"  # Stack is the accelerator bootstrap stack
    else
        organizationId=$(get_organization_id) || exit 1
        expectedReadAccess="${organizationId:-none}"
        deployedReadAccess=$(printf '%s\n' "$GLOBAL_STACK_OUTPUT" | awk -F'\t' '$1 == "CfnRetentionReadAccess" { print $2 }')
        if [ "$deployedReadAccess" = "$expectedReadAccess" ]; then
            export BOOTSTRAP_GLOBAL_REGION="false"  # Stack exists with a grant matching the organization
        else
            export BOOTSTRAP_GLOBAL_REGION="true"  # Stack predates the grant or its grant no longer matches
        fi
    fi
fi

# Bootstrap global region if needed
if [ "$BOOTSTRAP_GLOBAL_REGION" = "true" ]; then
    echo "CDK Bootstrapping required for global region"
    # Replace default accelerator prefix in CloudFormation templates
    [ ! -z "$acceleratorPrefix" ] && sed -i "s/AWSAccelerator/$acceleratorPrefix/g" lib/cloudformation/bootstrap-management*.yaml
    # Scope the cfn-retention read grant to the organization. An empty ID, outside an organization, omits the grant
    if [ -z "${organizationId+set}" ]; then
        organizationId=$(get_organization_id) || exit 1
    fi
    sed -i "s/__ORGANIZATION_ID__/$organizationId/g" lib/cloudformation/bootstrap-management-global.yaml
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
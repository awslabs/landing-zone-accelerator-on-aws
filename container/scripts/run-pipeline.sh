#!/bin/bash
# run-pipeline.sh - Deployment script for Landing Zone Accelerator (LZA)
# This script handles the deployment of LZA stacks in the correct order,
# ensuring proper bootstrapping of accounts before deployment.

# Enable command echo for debugging
set -x

# Validate required parameters
if [ -z "$1" ]; then
    echo 'synth or deploy must be passed as the 1st parameter'
    exit 1
fi
cdkSub=$1
config_s3_path=$2

if [ -z "$2" ]; then
    echo 'CONFIG_S3_PATH must be passed as the 2nd parameter'
    exit 1
fi

# Set up CA bundle for secure connections
export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

# Download and extract LZA Config Files from S3
echo "Downloading config from: $config_s3_path"
aws s3 cp "$config_s3_path" /tmp/aws-accelerator-config.zip

echo "Extracting config to: /landing-zone-accelerator-on-aws/aws-accelerator-config"
mkdir -p /landing-zone-accelerator-on-aws/aws-accelerator-config
unzip -o /tmp/aws-accelerator-config.zip -d /landing-zone-accelerator-on-aws/aws-accelerator-config

# Clean up the downloaded zip file
rm -f /tmp/aws-accelerator-config.zip

# Set up environment variables and paths
srcDirConfig='/landing-zone-accelerator-on-aws/aws-accelerator-config'
caBundlePath='/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem'
export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export NODE_EXTRA_CA_CERTS=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export CONFIG_COMMIT_ID=$(aws s3api head-object --bucket "$CONFIG_S3_BUCKET" --key "$CONFIG_S3_KEY" --query 'ETag' --output text | tr -d '"')

# Determine AWS partition
export PARTITION=`aws sts get-caller-identity --query 'Arn' --output text | awk -F ':' '{print $2}'`

# Check for MANAGEMENT_ACCOUNT_ID environment variable
if [ -z "$MANAGEMENT_ACCOUNT_ID" ]; then
    echo "MANAGEMENT_ACCOUNT_ID not set, retrieving from current credentials"
    export MANAGEMENT_ACCOUNT_ID=`aws sts get-caller-identity --query 'Account' --output text | awk -F ':' '{print $1}'`
else
    echo "Using MANAGEMENT_ACCOUNT_ID from environment: $MANAGEMENT_ACCOUNT_ID"
fi

# ACCELERATOR_PREFIX, INSTALLER_STACK_NAME, and PIPELINE_ACCOUNT_ID are set by run-lza.sh from task definition
# Fallback to default if not set (for direct script invocation)
export ACCELERATOR_PREFIX=${ACCELERATOR_PREFIX:-AWSAccelerator}

# Set global region based on partition
export GLOBAL_REGION='us-east-1'
if [ "$PARTITION" = 'aws-us-gov' ]; then
    export GLOBAL_REGION='us-gov-west-1'
elif [ "$PARTITION" = 'aws-iso-f' ]; then
    export GLOBAL_REGION='us-isof-south-1'
elif [ "$PARTITION" = 'aws-iso-b' ]; then
    export GLOBAL_REGION='us-isob-east-1'
elif [ "$PARTITION" = 'aws-iso' ]; then
    export GLOBAL_REGION='us-iso-east-1'
elif [ "$PARTITION" = 'aws-cn' ]; then
    export GLOBAL_REGION='cn-northwest-1'
elif [ "$PARTITION" = 'aws-eusc' ]; then
    export GLOBAL_REGION='eusc-de-east-1'
fi

# Display environment information
echo "partition $PARTITION"
echo "home region $AWS_DEFAULT_REGION"
echo "AWS_REGION $AWS_REGION"
echo "global region $GLOBAL_REGION"
echo "management account $MANAGEMENT_ACCOUNT_ID"

# Define stacks to be deployed
# AllStacks contains the stacks to be deployed after prepare and accounts stages
AllStacks=( 'key' 'logging' 'organizations' 'security-audit' 'network-prep' 'security' 'operations' 'network-vpc' 'security-resources' 'network-associations' 'customizations' 'finalize' )
# SomeStacks can be used to deploy specific stacks only
SomeStacks=( $stack1 $stack2 $stack3 $stack4 $stack5 $stack6 $stack7 $stack8 $stack9 $stack10 $stack11 $stack12 $stack13 $stack14 )

cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/installer

# Handle external pipeline role assumption for bootstrap
if [ -n "$MANAGEMENT_ACCOUNT_ID" ] && [ -n "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then
    echo "External pipeline mode: Assuming role for bootstrap operations"
    echo "Management Account ID: $MANAGEMENT_ACCOUNT_ID"
    echo "Role Name: $MANAGEMENT_ACCOUNT_ROLE_NAME"
    
    # Disable debug mode to prevent credentials from being printed to logs
    set +x
    if ! MANAGEMENT_ACCOUNT_CREDENTIAL=$(aws sts assume-role --role-arn arn:$PARTITION:iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text); then
        echo "Failed to assume $MANAGEMENT_ACCOUNT_ROLE_NAME role in management account $MANAGEMENT_ACCOUNT_ID"
        exit 1
    fi
    
    # Export credentials without debug output
    export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $MANAGEMENT_ACCOUNT_CREDENTIAL);
    
    # Re-enable debug mode for bootstrap detection
    set -x
fi

echo "Bootstrap Management Account Starts"

set -e && ./lib/bash/bootstrap-management.sh "$ACCELERATOR_PREFIX" $AWS_REGION $MANAGEMENT_ACCOUNT_ID $GLOBAL_REGION "false";

# Disable debug mode again before unsetting credentials
set +x
unset AWS_ACCESS_KEY_ID;
unset AWS_SECRET_ACCESS_KEY;
unset AWS_SESSION_TOKEN;

# Re-enable debug mode for remaining script
set -x

## Validate input config (after bootstrap)
cd /landing-zone-accelerator-on-aws/source
yarn validate-config $srcDirConfig
if [ $? -ne 0 ]; then
    echo "CONFIG VALIDATION FAILED"
    exit 1
fi

cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/

# Handle synth-only mode
if [ "$synthOnly" = true ]; then
    echo "SYNTH all stacks, skipping DEPLOY"
    yarn run ts-node --transpile-only cdk.ts synth \
        --require-approval never \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath
    
    # Backup synthesized templates to S3
    aws s3 sync --quiet /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/cdk.out/ \
        s3://$CONFIG_BUCKET_NAME/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/
    exit 0
else
    echo "Proceeding to DEPLOY"
fi

# PHASE 1: Deploy prepare and accounts stages first
# These stages create the organizational structure and accounts
echo "Running Prepare and Accounts stages"
for Item1 in prepare accounts; do
    echo "DEPLOYING $Item1 STACK"

    export ACCELERATOR_STAGE=$Item1
    RUNNER_ARGS="--partition ${PARTITION} --region ${AWS_REGION} --config-dir $srcDirConfig --stage $Item1 --prefix AWSAccelerator"
    set -e && yarn run ts-node ../modules/bin/runner.ts $RUNNER_ARGS
    
    yarn run ts-node --transpile-only cdk.ts synth \
        --stage $Item1 \
        --require-approval never \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath
    
    yarn run ts-node --transpile-only cdk.ts --require-approval never $cdkSub \
        --stage $Item1 \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath \
        --app cdk.out
    unset ACCELERATOR_STAGE
    if [ $? -ne 0 ]; then
        echo "$Item1 STACK FAILED"
        exit 1
    fi
done

# PHASE 2: Bootstrap all accounts after prepare and accounts stages
# This ensures all newly created accounts are properly bootstrapped
echo "BOOTSTRAPPING ALL ACCOUNTS"

RUNNER_ARGS="--partition ${PARTITION} --region ${AWS_REGION} --config-dir $srcDirConfig --stage bootstrap --prefix AWSAccelerator"
set -e && yarn run ts-node ../modules/bin/runner.ts $RUNNER_ARGS
yarn run ts-node --transpile-only cdk.ts --require-approval never synth \
    --stage bootstrap \
    --config-dir $srcDirConfig \
    --partition $PARTITION \
    --ca-bundle-path $caBundlePath

yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap \
    --config-dir $srcDirConfig \
    --partition $PARTITION \
    --ca-bundle-path $caBundlePath \
    --app cdk.out

## adding this specifically for network refactor v2 stacks
RUNNER_ARGS="--partition ${PARTITION} --region ${AWS_REGION} --config-dir $srcDirConfig --stage network-vpc --prefix AWSAccelerator"
set -e && CDK_OPTIONS=bootstrap yarn run ts-node ../modules/bin/runner.ts $RUNNER_ARGS


if [ $? -ne 0 ]; then
    echo "BOOTSTRAP FAILED"
    exit 1
fi

# PHASE 3: Deploy remaining stacks
if [ -z "$SomeStacks" ]; then
    # If no specific stacks are specified, synthesize all stacks
    echo "Synthesizing all stacks"
    
    # Deploy all remaining stacks in the predefined order
    echo "Deploying all remaining stacks in sequence"
    for Item1 in ${AllStacks[*]}; do
        echo "DEPLOYING $Item1 STAGE"
        RUNNER_ARGS="--partition ${PARTITION} --region ${AWS_REGION} --config-dir $srcDirConfig --stage $Item1 --prefix AWSAccelerator"
        set -e && yarn run ts-node ../modules/bin/runner.ts $RUNNER_ARGS
        
        yarn run ts-node --transpile-only cdk.ts synth \
            --stage $Item1 \
            --require-approval never \
            --config-dir $srcDirConfig \
            --partition $PARTITION \
            --ca-bundle-path $caBundlePath
        
        yarn run ts-node --transpile-only cdk.ts --require-approval never $cdkSub \
            --stage $Item1 \
            --config-dir $srcDirConfig \
            --partition $PARTITION \
            --ca-bundle-path $caBundlePath \
            --app cdk.out
        
        if [ $? -ne 0 ]; then
            echo "$Item1 STAGE FAILED"
            exit 1
        fi
    done
else
    # Deploy only the specified stacks
    echo "DEPLOYING ${SomeStacks[*]} STAGES"
    for Item2 in ${SomeStacks[*]}; do
        echo "DEPLOYING $Item2 STAGE"

        RUNNER_ARGS="--partition ${PARTITION} --region ${AWS_REGION} --config-dir $srcDirConfig --stage $Item2 --prefix AWSAccelerator"
        set -e && yarn run ts-node ../modules/bin/runner.ts $RUNNER_ARGS
        
        yarn run ts-node --transpile-only cdk.ts synth \
            --stage $Item2 \
            --require-approval never \
            --config-dir $srcDirConfig \
            --partition $PARTITION \
            --ca-bundle-path $caBundlePath
        
        yarn run ts-node --transpile-only cdk.ts --require-approval never $cdkSub \
            --stage $Item2 \
            --config-dir $srcDirConfig \
            --partition $PARTITION \
            --ca-bundle-path $caBundlePath \
            --app cdk.out
        if [ $? -ne 0 ]; then
            echo "$Item2 STAGE FAILED"
            exit 1
        fi
    done
fi

# Backup final CloudFormation templates to S3
aws s3 sync --quiet /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/cdk.out/ \
    s3://$CONFIG_BUCKET_NAME/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/

echo "DEPLOYMENT COMPLETE"

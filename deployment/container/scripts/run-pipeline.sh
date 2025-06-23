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
bucket=$2

if [ -z "$2" ]; then
    echo 's3 bucket name must be passed as the 1st parameter'
    exit 1
fi

# Set up CA bundle for secure connections
export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

# Sync LZA Config Files with S3 Repo
aws s3 sync s3://$bucket/lza/aws-accelerator-config /landing-zone-accelerator-on-aws/aws-accelerator-config

# Set up environment variables and paths
srcDirConfig='/landing-zone-accelerator-on-aws/aws-accelerator-config'
caBundlePath='/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem'
export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export NODE_EXTRA_CA_CERTS=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export CONFIG_COMMIT_ID=aaaaaaaa

# Determine AWS partition and account ID
export PARTITION=`aws sts get-caller-identity --query 'Arn' --output text | awk -F ':' '{print $2}'`
export MANAGEMENT_ACCOUNT_ID=`aws sts get-caller-identity --query 'Account' --output text | awk -F ':' '{print $1}'`
export ACCELERATOR_PREFIX=AWSAccelerator

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
fi

# Display environment information
echo "partition $PARTITION"
echo "home region $AWS_DEFAULT_REGION"
echo "AWS_REGION $AWS_REGION"
echo "global region $GLOBAL_REGION"


# Define stacks to be deployed
# AllStacks contains the stacks to be deployed after prepare and accounts stages
AllStacks=( 'key' 'logging' 'organizations' 'security-audit' 'network-prep' 'security' 'operations' 'network-vpc' 'security-resources' 'network-associations' 'customizations' 'finalize' )
# SomeStacks can be used to deploy specific stacks only
SomeStacks=( $stack1 $stack2 $stack3 $stack4 $stack5 $stack6 $stack7 $stack8 $stack9 $stack10 $stack11 $stack12 $stack13 $stack14 )

## Validate input config
cd /landing-zone-accelerator-on-aws/source
yarn validate-config $srcDirConfig
if [ $? -ne 0 ]; then
    echo "CONFIG VALIDATION FAILED"
    exit 1
fi
# Change to accelerator directory
cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/

# Bootstrap management account in home region 
ACCELERATOR_SKIP_DYNAMODB_LOOKUP=true yarn run ts-node --transpile-only cdk.ts synth \
    --require-approval never \
    --config-dir $srcDirConfig \
    --partition $PARTITION \
    --ca-bundle-path $caBundlePath \
    --account $MANAGEMENT_ACCOUNT_ID \
    --stage bootstrap \
    --region $AWS_REGION
    
ACCELERATOR_SKIP_DYNAMODB_LOOKUP=true yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap \
    --config-dir $srcDirConfig \
    --partition $PARTITION \
    --ca-bundle-path $caBundlePath \
    --account $MANAGEMENT_ACCOUNT_ID \
    --region $AWS_REGION \
    --app cdk.out
if [ $? -ne 0 ]; then
    echo "BOOTSTRAP HOME REGION FAILED"
    exit 1
fi
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
        s3://$bucket/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/
    exit 0
else
    echo "Proceeding to DEPLOY"
fi

# Bootstrap global region if different from home region or else accounts stage will fail
if [ $GLOBAL_REGION = $AWS_DEFAULT_REGION ]; then
    echo "GLOBAL_REGION = HOME_REGION"
else
    echo "BOOTSTRAPPING GLOBAL REGION"
    cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/
    
    ACCELERATOR_SKIP_DYNAMODB_LOOKUP=true yarn run ts-node --transpile-only cdk.ts synth \
        --require-approval never \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath \
        --account $MANAGEMENT_ACCOUNT_ID \
        --stage bootstrap \
        --region $GLOBAL_REGION
    
    ACCELERATOR_SKIP_DYNAMODB_LOOKUP=true yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath \
        --account $MANAGEMENT_ACCOUNT_ID \
        --region $GLOBAL_REGION \
        --app cdk.out
    if [ $? -ne 0 ]; then
        echo "BOOTSTRAP GLOBAL REGION FAILED"
        exit 1
    fi
fi

# PHASE 1: Deploy prepare and accounts stages first
# These stages create the organizational structure and accounts
echo "Running Prepare and Accounts stages"
for Item1 in prepare accounts; do
    echo "DEPLOYING $Item1 STACK"
    
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
        echo "$Item1 STACK FAILED"
        exit 1
    fi
done

# PHASE 2: Bootstrap all accounts after prepare and accounts stages
# This ensures all newly created accounts are properly bootstrapped
echo "BOOTSTRAPPING ALL ACCOUNTS"

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

if [ $? -ne 0 ]; then
    echo "BOOTSTRAP FAILED"
    exit 1
fi

# PHASE 3: Deploy remaining stacks
if [ -z "$SomeStacks" ]; then
    # If no specific stacks are specified, synthesize all stacks
    echo "Synthesizing all stacks"
    
    yarn run ts-node --transpile-only cdk.ts synth \
        --require-approval never \
        --config-dir $srcDirConfig \
        --partition $PARTITION \
        --ca-bundle-path $caBundlePath
    
    if [ $? -ne 0 ]; then
        echo "SYNTH FAILED"
        exit 1
    fi
    
    # Deploy all remaining stacks in the predefined order
    echo "Deploying all remaining stacks in sequence"
    for Item1 in ${AllStacks[*]}; do
        echo "DEPLOYING $Item1 STACK"
        
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
            echo "$Item1 STACK FAILED"
            exit 1
        fi
    done
else
    # Deploy only the specified stacks
    echo "DEPLOYING ${SomeStacks[*]} STACKS"
    for Item2 in ${SomeStacks[*]}; do
        echo "DEPLOYING $Item2 STACK"
        
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
    done
fi

# Backup final CloudFormation templates to S3
aws s3 sync --quiet /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/cdk.out/ \
    s3://$bucket/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/

echo "DEPLOYMENT COMPLETE"
set -x
if [ -z "$1" ];
then
	    echo 'synth or deploy must be passed as the 1st parameter'
	        exit 1
fi
cdkSub=$1
bucket=$2

if [ -z "$2" ];
then
	    echo 's3 bucket name must be passed as the 1st parameter'
	        exit 1
fi

export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
## sync LZA Config Files with S3 Repo
aws s3 sync s3://$bucket/lza/aws-accelerator-config /landing-zone-accelerator-on-aws/aws-accelerator-config

srcDirConfig='/landing-zone-accelerator-on-aws/aws-accelerator-config'
caBundlePath='/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem'
export AWS_CA_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export NODE_EXTRA_CA_CERTS=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
export CONFIG_COMMIT_ID=aaaaaaaa
export PARTITION=`aws sts get-caller-identity --query 'Arn' --output text | awk -F ':' '{print $2}'`
export MANAGEMENT_ACCOUNT_ID=`aws sts get-caller-identity --query 'Account' --output text | awk -F ':' '{print $1}'`
export ACCELERATOR_PREFIX=AWSAccelerator

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

echo "partition $PARTITION"
echo "home region $AWS_DEFAULT_REGION"
echo "AWS_REGION $AWS_REGION"
echo "global region $GLOBAL_REGION"

AllStacks=( 'prepare' 'accounts' 'key' 'logging' 'organizations' 'security-audit' 'network-prep' 'security' 'operations' 'network-vpc' 'security-resources' 'network-associations' 'customizations' 'finalize' )
SomeStacks=( $stack1 $stack2 $stack3 $stack4 $stack5 $stack6 $stack7 $stack8 $stack9 $stack10 $stack11 $stack12 $stack13 $stack14 )
cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/

if [ "$synthOnly" = true ]; then
echo "SYNTH all stacks, skipping DEPLOY"
yarn run ts-node --transpile-only cdk.ts synth --require-approval never --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath
aws s3 sync /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/cdk.out/ s3://$bucket/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/
exit 0
else
echo "Proceeding to DEPLOY"
fi

if [ $GLOBAL_REGION = $AWS_DEFAULT_REGION ]; then
echo "GLOBAL_REGION = HOME_REGION"
else
echo "BOOTSTRAPPING GLOBAL REGION"
cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/
yarn run ts-node --transpile-only cdk.ts synth --require-approval never --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath --account $MANAGEMENT_ACCOUNT_ID --region $GLOBAL_REGION
yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath --account $MANAGEMENT_ACCOUNT_ID --region $GLOBAL_REGION --app cdk.out
fi

if [ -z "$SomeStacks" ]; then
yarn run ts-node --transpile-only cdk.ts synth --require-approval never --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath
yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath --app cdk.out
for Item1 in ${AllStacks[*]};
    do
        echo DEPLOYING $Item1 STACK
        yarn run ts-node --transpile-only cdk.ts synth --stage $Item1 --require-approval never --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath
        yarn run ts-node --transpile-only cdk.ts --require-approval never $cdkSub --stage $Item1 --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath --app cdk.out
        if [ $? -ne 0 ]; then
            echo $Item1 STACK FAILED
            exit 1
        fi
    done
else
echo DEPLOYING ${SomeStacks[*]} STACKS
for Item2 in ${SomeStacks[*]};
    do 
        echo DEPLOYING $Item2 STACK 
        yarn run ts-node --transpile-only cdk.ts synth --stage $Item2 --require-approval never --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath
        yarn run ts-node --transpile-only cdk.ts --require-approval never $cdkSub --stage $Item2 --config-dir $srcDirConfig --partition $PARTITION --ca-bundle-path $caBundlePath --app cdk.out
    done
fi
aws s3 sync /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/cdk.out/ s3://$bucket/lza/cdk.out/$(date +"%Y-%m-%d_%H-%M-%S")/
echo "DEPLOYMENT COMPLETE"

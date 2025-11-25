#!/bin/bash

set -xe

export CONFIG_DIR=$1
export PARTITION=$2
export BUCKET=$3
export ACCELERATOR_PREFIX=$4;

aws s3 sync s3://$BUCKET/lza/aws-accelerator-config $CONFIG_DIR

cd /landing-zone-accelerator-on-aws/source

yarn validate-config $CONFIG_DIR

cd /landing-zone-accelerator-on-aws/source/packages/\@aws-accelerator/accelerator/

yarn run ts-node --transpile-only cdk.ts --require-approval never synth --stage bootstrap --config-dir $CONFIG_DIR --partition $PARTITION --use-existing-roles
yarn run ts-node --transpile-only cdk.ts --require-approval never bootstrap --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out --use-existing-roles --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never synth --config-dir $CONFIG_DIR --partition $PARTITION --use-existing-roles
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage prepare --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out 
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage key --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage logging --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage security-audit --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage network-prep --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage security --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage operations --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage network-vpc --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage security-resources --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage network-associations --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out
yarn run ts-node --transpile-only cdk.ts --require-approval never deploy --stage customizations --config-dir $CONFIG_DIR --partition $PARTITION --app cdk.out

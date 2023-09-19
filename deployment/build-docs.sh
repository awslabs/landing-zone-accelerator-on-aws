#!/bin/bash -eo pipefail
# This script builds TypeDoc documentation pages for each release branch
# of Landing Zone Accelerator. The documents are stored in the ./source/docs directory,
# with the latest version's doc pages being the root of the tree.
RED=$(tput setaf 1)
NORMAL=$(tput sgr0)

## See if we are in the correct working directory
if [ ! -d "./packages/@aws-accelerator" ]; then
  printf "\n${RED}ERROR${NORMAL}: Please run this script from the repository's source directory\n\n"
  exit 1
fi

## Get latest git tag
git checkout main
latest=$(git tag --sort=-refname | awk 'BEGIN{ RS = "" ; FS = "\n" }{print $1}')

## Make directory
if [ ! -d "./docs/latest" ]; then
    mkdir -p ./docs
    mkdir -p ./docs/latest
fi

## Clean up if needed
if [ -d "./node_modules" ]; then
    yarn cleanup
    yarn cache clean
fi

## Create versioned doc pages
for tag in $(git tag | grep v1)
do
    if [ -d "./docs/${tag}" ]; then
        echo "Skipping ${tag} because it already exists"
        continue
    fi
    git checkout $tag
    yarn install    
    yarn build
    yarn docs --out ./docs/${tag}
    yarn cleanup
    yarn cache clean
    # Copy latest version to latest directory
    if [ $tag == $latest ]; then
        rm -rf ./docs/latest/*
        cp -r ./docs/${tag}/* ./docs/latest
        cp -r ./docs/${tag}/* ./docs
    fi
done
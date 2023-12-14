#!/bin/bash -eo pipefail
# This script builds TypeDoc documentation pages for each release branch
# of Landing Zone Accelerator. The documents are stored in the ./source/docs directory,
# with the latest version's doc pages being the root of the tree.
RED=$(tput setaf 1)
NORMAL=$(tput sgr0)

function setup_docs_dir () {
    ## Create docs directory if it doesn't exist
    if [ ! -d "./docs" ]; then
        mkdir -p ./docs
    fi

    ## Remove latest directory if it exists
    if [ -L "./docs/latest" ]; then
        rm ./docs/latest
    fi

    ## Remove latest directory if it exists
    if [ -d "./docs/latest" ]; then
        rm -rf ./docs/latest
    fi
}

function create_versioned_docs () {
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
        # Create a symbolic link to the latest version
        if [ $tag == $latest ]; then
            cd ./docs
            ln -s ${tag} latest
        fi
    done
}

function main () {
    ## See if we are in the correct working directory
    if [ ! -d "./packages/@aws-accelerator" ]; then
        printf "\n${RED}ERROR${NORMAL}: Please run this script from the repository's source directory\n\n"
        exit 1
    fi

    ## Get latest git tag
    git checkout main
    latest=$(git tag --sort=-refname | awk 'BEGIN{ RS = "" ; FS = "\n" }{print $1}')

    ## Set up documentation directory
    setup_docs_dir

    ## Clean up if needed
    if [ -d "./node_modules" ]; then
        yarn cleanup
        yarn cache clean
    fi

    ## Create versioned docs
    create_versioned_docs
}

main
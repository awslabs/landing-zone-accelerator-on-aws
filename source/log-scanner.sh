#!/bin/bash
set -e
BRed='\033[1;31m' 
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
cd ../
files=$(git diff --staged --diff-filter=AM --name-only)
for file in $files; do
    lines=$(awk '/console.log\(/{ print NR; }' $file)
    for line in $lines; do
      echo -e "${BRed}Warning!!! - ${NC}${RED}${file}${NC} has ${BLUE}console logging${NC} in line ${RED}${line}${NC}, review the logging statement."
    done
done

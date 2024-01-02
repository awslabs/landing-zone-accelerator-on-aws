# Development Dependencies

The section outlines the development toolchain for Landing Zone Accelerator.

## System dependencies

 - **NodeJS 16.x** or above - [NodeJS](https://nodejs.org/en/) must be installed on your system
 - **AWS CDK CLI** - [AWS CDK tookit CLI](https://www.npmjs.com/package/aws-cdk) must be installed via NPM
 - **Yarn** - [Yarn dependency manager](https://www.npmjs.com/package/yarn) must be installed via NPM

You may install the remaining development dependencies using the following commands:
```
cd <rootDir>/source
yarn install
```
!!! note
    `<rootDir>` is the local directory where you have cloned the solution source code.

## Core dependencies

 - **aws-cdk-lib** - AWS CDK library
 - **constructs** - AWS constructs library
 - **esbuild** - used to package and minify JavaScript code
 - **eslint** - used to provide rules for code quality
 - **jest** - unit testing framework
 - **jsii** - allows code in any language to naturally interact with JavaScript classes
 - **lerna** - used to manage the multiple packages in the project
 - **ts-node** - execution environment for TypeScript
 - **typedoc** - used to document libraries built for the accelerator
 - **typescript** - project is written in TypeScript

## Additional dependencies/plugins

 - **@types/jest** - TypeScript type definitions for jest unit testing framework
 - **@types/node** - TypeScript type definitions for NodeJS
 - **@typescript-eslint/eslint-plugin** - TypeScript plugin for eslint
 - **@typescript-eslint/parser** - allows eslint to parse TypeScript code
 - **eslint-config-prettier** - turns off all rules that are unnecessary or might conflict with Prettier
 - **eslint-plugin-jest** - jest plugin for eslint
 - **eslint-plugin-prettier** - runs Prettier as an ESLint rule and reports differences as individual ESLint issues
 - **fs-extra** - adds file system methods that aren't included in the native fs module and adds promise support to the fs methods
 - **jest-junit** - A Jest reporter that creates compatible junit xml files
 - **jsii-pacmak** - Generates ready-to-publish language-specific packages for jsii modules
 - **ts-jest** - A Jest transformer with source map support that lets you use Jest to test projects written in TypeScript
/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

interface ConfigFileMapping {
  interfaceFile: string;
  implementationFile: string;
  description: string;
  ignoreExtraClassProperties?: Record<string, string[]>;
}

describe('Config Files Sync Test', () => {
  const configMappings: ConfigFileMapping[] = [
    {
      interfaceFile: 'lib/models/global-config.ts',
      implementationFile: 'lib/global-config.ts',
      description: 'Global Config',
      ignoreExtraClassProperties: {
        GlobalConfig: ['iamRoleSsmParameters'],
        externalLandingZoneResourcesConfig: [
          'templateMap',
          'resourceList',
          'accountsDeployedExternally',
          'resourceParameters',
        ],
      },
    },
    {
      interfaceFile: 'lib/models/accounts-config.ts',
      implementationFile: 'lib/accounts-config.ts',
      description: 'Accounts Config',
      ignoreExtraClassProperties: {
        AccountIdConfig: ['orgsApiResponse', 'status'],
        GovCloudAccountConfig: ['orgsApiResponse'],
      },
    },
    {
      interfaceFile: 'lib/models/iam-config.ts',
      implementationFile: 'lib/iam-config.ts',
      description: 'IAM Config',
    },
    {
      interfaceFile: 'lib/models/network-config.ts',
      implementationFile: 'lib/network-config.ts',
      description: 'Network Config',
    },
    {
      interfaceFile: 'lib/models/organization-config.ts',
      implementationFile: 'lib/organization-config.ts',
      description: 'Organization Config',
    },
    {
      interfaceFile: 'lib/models/security-config.ts',
      implementationFile: 'lib/security-config.ts',
      description: 'Security Config',
    },
    {
      interfaceFile: 'lib/models/customizations-config.ts',
      implementationFile: 'lib/customizations-config.ts',
      description: 'Customizations Config',
    },
  ];

  configMappings.forEach(mapping => {
    test(`${mapping.description} interface definitions and implementations should be in sync`, () => {
      const basePath = path.resolve(__dirname, '..');
      const interfaceFilePath = path.join(basePath, mapping.interfaceFile);
      const implementationFilePath = path.join(basePath, mapping.implementationFile);

      expect(fs.existsSync(interfaceFilePath)).toBe(true);
      expect(fs.existsSync(implementationFilePath)).toBe(true);

      const program = ts.createProgram([interfaceFilePath, implementationFilePath], {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      });

      const interfaceSourceFile = program.getSourceFile(interfaceFilePath);
      const implementationSourceFile = program.getSourceFile(implementationFilePath);

      expect(interfaceSourceFile).toBeDefined();
      expect(implementationSourceFile).toBeDefined();

      const interfaces = extractInterfaces(interfaceSourceFile!);
      const classes = extractClasses(implementationSourceFile!);

      const issues = compareInterfacesWithImplementations(
        interfaces,
        classes,
        mapping.ignoreExtraClassProperties || {},
        program.getTypeChecker(),
      );

      expect(issues).toEqual([]);
    });
  });

  function extractInterfaces(sourceFile: ts.SourceFile) {
    const interfaces: Record<string, ts.InterfaceDeclaration> = {};

    function visit(node: ts.Node) {
      if (ts.isInterfaceDeclaration(node)) {
        interfaces[node.name.text] = node;
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return interfaces;
  }

  function extractClasses(sourceFile: ts.SourceFile) {
    const classes: Record<string, ts.ClassDeclaration> = {};

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        classes[node.name.text] = node;
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return classes;
  }

  function compareInterfacesWithImplementations(
    interfaces: Record<string, ts.InterfaceDeclaration>,
    classes: Record<string, ts.ClassDeclaration>,
    ignoreExtraClassProperties: Record<string, string[]> = {},
    typeChecker: ts.TypeChecker,
  ) {
    const issues: string[] = [];

    const allInterfaceProps: Record<string, Record<string, string>> = {};
    for (const interfaceName in interfaces) {
      allInterfaceProps[interfaceName] = getInterfaceProperties(interfaces[interfaceName], interfaces);
    }

    for (const className in classes) {
      const classDecl = classes[className];
      let interfaceName = '';
      let interfaceDecl;

      if (classDecl.heritageClauses) {
        for (const heritage of classDecl.heritageClauses) {
          if (heritage.token === ts.SyntaxKind.ImplementsKeyword) {
            const implementedInterface = heritage.types[0];
            const interfaceType = typeChecker.getTypeFromTypeNode(implementedInterface);
            const symbol = interfaceType.getSymbol();
            if (symbol) {
              interfaceName = symbol.getName();
              interfaceDecl = interfaces[interfaceName];
              break;
            }
          }
        }
      }

      if (!interfaceDecl) {
        if (!isAbstractClass(classDecl) && !isUtilityClass(classDecl)) {
          // Skip classes without interfaces
        }
        continue;
      }

      const interfaceProps = allInterfaceProps[interfaceName];
      const classProps = getClassProperties(classDecl);

      // Check for missing properties in class
      for (const propName in interfaceProps) {
        if (propName === 'homeRegion') {
          continue;
        }

        if (!classProps[propName]) {
          issues.push(`Property ${propName} from interface ${interfaceName} is missing in class ${className}`);
        }
      }

      // Check for properties in class that are not in the interface
      for (const propName in classProps) {
        if (propName.startsWith('_') || ['constructor', 'prototype'].includes(propName) || propName === 'homeRegion') {
          continue;
        }

        if (propName === propName.toUpperCase() && propName.length > 1) {
          continue;
        }

        const ignoreList = ignoreExtraClassProperties[className] || [];
        if (ignoreList.includes(propName)) {
          continue;
        }

        if (!interfaceProps[propName]) {
          issues.push(`Property ${propName} in class ${className} is not defined in interface ${interfaceName}`);
        }
      }
    }

    return issues;
  }

  function getInterfaceProperties(
    interfaceDecl: ts.InterfaceDeclaration,
    allInterfaces: Record<string, ts.InterfaceDeclaration>,
  ) {
    const props: Record<string, string> = {};
    const processedInterfaces = new Set<string>();

    function processInterface(interfaceDecl: ts.InterfaceDeclaration) {
      if (processedInterfaces.has(interfaceDecl.name.text)) {
        return;
      }
      processedInterfaces.add(interfaceDecl.name.text);

      interfaceDecl.members.forEach(member => {
        if (ts.isPropertySignature(member) && member.name) {
          let propName: string;
          if (ts.isIdentifier(member.name)) {
            propName = member.name.text;
          } else if (ts.isStringLiteral(member.name)) {
            propName = member.name.text;
          } else {
            return;
          }
          props[propName] = 'any';
        }
      });

      if (interfaceDecl.heritageClauses) {
        interfaceDecl.heritageClauses.forEach(heritage => {
          if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
            heritage.types.forEach(typeNode => {
              try {
                let typeName: string;
                if (
                  ts.isExpressionWithTypeArguments(typeNode) &&
                  typeNode.expression &&
                  ts.isIdentifier(typeNode.expression)
                ) {
                  typeName = typeNode.expression.text;
                } else {
                  return;
                }

                const extendedInterface = allInterfaces[typeName];
                if (extendedInterface) {
                  processInterface(extendedInterface);
                }
              } catch (error) {
                // Continue if error processing extended interface
              }
            });
          }
        });
      }
    }

    processInterface(interfaceDecl);
    return props;
  }

  function getClassProperties(classDecl: ts.ClassDeclaration) {
    const props: Record<string, string> = {};

    classDecl.members.forEach(member => {
      if (ts.isPropertyDeclaration(member) && member.name) {
        let propName: string;
        if (ts.isIdentifier(member.name)) {
          propName = member.name.text;
        } else if (ts.isStringLiteral(member.name)) {
          propName = member.name.text;
        } else {
          return;
        }
        props[propName] = 'any';
      }
    });

    return props;
  }

  function isAbstractClass(classDecl: ts.ClassDeclaration): boolean {
    if (!ts.canHaveModifiers(classDecl)) return false;
    const modifiers = ts.getModifiers(classDecl);
    if (!modifiers) return false;
    return modifiers.some(modifier => modifier.kind === ts.SyntaxKind.AbstractKeyword);
  }

  function isUtilityClass(classDecl: ts.ClassDeclaration): boolean {
    if (!classDecl.members || classDecl.members.length === 0) return false;

    const hasInstanceMembers = classDecl.members.some(member => {
      if (
        !ts.canHaveModifiers(member) ||
        !ts.getModifiers(member)?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword)
      ) {
        if (ts.isConstructorDeclaration(member)) {
          return false;
        }
        return true;
      }
      return false;
    });

    return !hasInstanceMembers;
  }
});

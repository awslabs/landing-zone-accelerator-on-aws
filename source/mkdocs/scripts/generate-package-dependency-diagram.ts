import * as fs from 'fs';
import * as path from 'path';

interface NodeDependency {
  source: string;
  target: string;
}

interface PackageJson {
  name: string;
  dependencies: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  workspaces?: { packages: string[] };
}

/**
 * Function to get list of package.json files
 * @param dir string
 * @returns files string[]
 */
function getPackageJsonFileList(dir: string): string[] {
  const rootPackageJsonFile = path.join(dir, 'package.json');

  const packageJson: PackageJson = JSON.parse(fs.readFileSync(rootPackageJsonFile, 'utf8'));
  const workspaces: string[] = packageJson.workspaces?.packages ?? [];
  const packageJsonFiles: string[] = [];

  for (const workspace of workspaces) {
    if (workspace.includes('*')) {
      console.log(`Workspace ${workspace} has wild card, ignoring`);
    } else {
      packageJsonFiles.push(`${workspace}/package.json`);
    }
  }
  return packageJsonFiles;
}

/**
 * Function to get dependency information
 * @param packageJsonPaths string[]
 * @param prefixes string[]
 * @returns dependencies {@link NodeDependency}[]
 */
function getProjectDependencies(packageJsonPaths: string[], prefixes: string[]): NodeDependency[] {
  const dependencies: NodeDependency[] = [];
  const packageNames = new Set<string>();
  const isPrefixAvailable = prefixes.length > 0;

  // First pass: collect valid package names
  packageJsonPaths.forEach(packageJsonPath => {
    try {
      const packageJson = readPackageJson(packageJsonPath);
      if (packageJson.name) {
        if (isPrefixAvailable) {
          if (prefixes.some(prefix => packageJson.name.startsWith(prefix))) {
            packageNames.add(packageJson.name);
          }
        } else {
          packageNames.add(packageJson.name);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error(`Error reading or parsing ${packageJsonPath}: ${error.message}`);
    }
  });

  // Second pass: collect dependencies
  packageJsonPaths.forEach(packageJsonPath => {
    try {
      const packageJson = readPackageJson(packageJsonPath);
      if (!packageJson.name) return;

      if (isPrefixAvailable) {
        if (!prefixes.some(prefix => packageJson.name.startsWith(prefix))) {
          return;
        }
      }

      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      Object.keys(allDeps).forEach(dep => {
        if (isPrefixAvailable) {
          if (prefixes.some(prefix => dep.startsWith(prefix))) {
            dependencies.push({
              source: packageJson.name,
              target: dep,
            });
          }
        } else {
          dependencies.push({
            source: packageJson.name,
            target: dep,
          });
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error(`Error analyzing dependencies for ${packageJsonPath}: ${error.message}`);
    }
  });

  return dependencies;
}

/**
 * Function to read and get package.json
 * @param packageJsonPath  string
 * @returns content {@link PackageJson}
 */
function readPackageJson(packageJsonPath: string): PackageJson {
  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading package.json: ${error}`);
    process.exit(1);
  }
}

/**
 *  Function to wrap project name inside the circle
 * @param text string
 * @param maxCharsPerLine number
 * @returns text string[]
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/(?=[@/])|(?<=[^@/-])/g).filter(word => word.length > 0);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + word).length <= maxCharsPerLine) {
      currentLine += word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Create individual diagram for each project has dependencies
 * @param node string
 * @param dependencies {@link NodeDependency}[]
 * @returns content string | undefined
 */
function createIndividualDiagram(node: string, dependencies: NodeDependency[]): string | null {
  const nodeDependencies = dependencies.filter(dep => dep.source === node);

  // Skip nodes without dependencies
  if (nodeDependencies.length === 0) {
    return null;
  }

  const radius = 60; // Circle radius
  const verticalGap = 160; // Gap between levels
  const horizontalGap = 200; // Gap between nodes at same level
  const fontSize = 12;
  const lineHeight = 15;
  const maxCharsPerLine = 16;

  // Calculate dimensions based on number of dependencies
  const width = Math.max(200, nodeDependencies.length * horizontalGap);
  const height = 400; // Increased height for hierarchical layout

  let svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
              <marker id="arrowhead-${node.replace(/[@/\\]/g, '_')}" markerWidth="10" markerHeight="7" 
              refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#000"/>
              </marker>
          </defs>
          <g>
  `;

  // Source node at top center
  const sourceX = width / 2;
  const sourceY = radius + 40;
  const sourceLines = wrapText(node, maxCharsPerLine);

  // Add source circle and text
  svg += `
      <circle cx="${sourceX}" cy="${sourceY}" r="${radius}" fill="#ADD8E6" stroke="#000"/>
      ${sourceLines
        .map(
          (line, index) =>
            `<text x="${sourceX}" y="${sourceY - ((sourceLines.length - 1) * lineHeight) / 2 + index * lineHeight}"
                 text-anchor="middle" font-family="Arial" font-size="${fontSize}">${line}</text>`,
        )
        .join('')}
  `;

  // Calculate positions for dependency nodes
  const startX = (width - (nodeDependencies.length - 1) * horizontalGap) / 2;
  const targetY = sourceY + verticalGap;

  // Dependencies in a row below
  nodeDependencies.forEach((dep, index) => {
    const targetX = startX + index * horizontalGap;
    const targetLines = wrapText(dep.target, maxCharsPerLine);

    // Add target circle and text
    svg += `
          <circle cx="${targetX}" cy="${targetY}" r="${radius}" fill="#90EE90" stroke="#000"/>
          ${targetLines
            .map(
              (line, index) =>
                `<text x="${targetX}" y="${targetY - ((targetLines.length - 1) * lineHeight) / 2 + index * lineHeight}"
                     text-anchor="middle" font-family="Arial" font-size="${fontSize}">${line}</text>`,
            )
            .join('')}
          
          <!-- Add curved arrow -->
          <path d="M${sourceX} ${sourceY + radius} 
                   Q${sourceX} ${(targetY + sourceY) / 2},
                     ${targetX} ${targetY - radius}"
                fill="none" stroke="#000" stroke-width="2" 
                marker-end="url(#arrowhead-${node.replace(/[@/\\]/g, '_')})"/>
      `;
  });

  svg += '</g></svg>';
  return svg;
}

/**
 * Function to create SVG file content diagrams
 * @param allDependencies {@link NodeDependency}[]
 * @returns diagrams {@link Map<string, string>}
 */
function createSVGContent(allDependencies: NodeDependency[]): Map<string, string> {
  const nodes = new Set<string>();
  allDependencies.forEach(dep => {
    nodes.add(dep.source);
    nodes.add(dep.target);
  });

  const diagrams = new Map<string, string>();
  nodes.forEach(node => {
    const diagram = createIndividualDiagram(node, allDependencies);
    if (diagram !== null) {
      diagrams.set(node, diagram);
    }
  });

  return diagrams;
}

/**
 * Function to create MD content to display dependencies in tabular format
 * @param allDependencies {@link NodeDependency}[]
 * @returns
 */
function createMDContentTable(allDependencies: NodeDependency[]): string {
  const style = `<style>
      table, th, td { 
          border: 1px solid black;  
          border-collapse: collapse;
      }
      th, td { 
          padding: 5px;
          text-align: left;
      }
      th {
          background-color: #FF9800;
          text-align: center;
          font-weight: bold;
      }
      .package-cell {
          width: 400px;
          text-align: left !important;
          vertical-align: middle !important;
          background-color: #f8f8f8;
          display: table-cell;
          height: 100%;
          padding-left: 10px;
      }
      .dependency-cell {
          width: 400px;
          padding-left: 10px;
      }
      tr {
          height: 40px;  /* Fixed height for rows */
      }
  </style>`;

  // Group dependencies by source
  const groupedDeps = new Map<string, string[]>();
  allDependencies.forEach(dep => {
    if (!groupedDeps.has(dep.source)) {
      groupedDeps.set(dep.source, []);
    }
    groupedDeps.get(dep.source)!.push(dep.target);
  });

  // Create HTML table with fixed column widths
  let content = style + '\n<table style="width: 600px;">\n';
  content += '<tr><th style="width: 300px;">Package</th><th style="width: 300px;">DependsOn Packages</th></tr>\n';

  // Add rows with merged cells
  groupedDeps.forEach((targets, source) => {
    targets.forEach((target, index) => {
      if (index === 0) {
        // First row for this source includes the rowspan
        content += `<tr>
                  <td class="package-cell" rowspan="${targets.length}">
                      <div style="display: flex; align-items: center; height: 100%;">
                          ${source}
                      </div>
                  </td>
                  <td class="dependency-cell">${target}</td>
              </tr>\n`;
      } else {
        // Subsequent rows only include the target
        content += `<tr><td class="dependency-cell">${target}</td></tr>\n`;
      }
    });
  });

  content += '</table>';
  return content;
}

/**
 * Function to create MD content to add diagrams
 * @param diagrams {@link Map<string, string>}
 * @param allDependencies {@link NodeDependency}[]
 * @returns content string
 */
function createMDContent(diagrams: Map<string, string>, allDependencies: NodeDependency[]): string {
  let mdContent = '# Package Dependencies\n';
  mdContent += '\nThis section outlines the package dependencies within the LZA monorepo structure.\n\n';

  mdContent += '\n## Dependencies\n\n';
  mdContent +=
    '\nThis tabulated information presents a detailed overview of all packages and their respective dependencies contained within the LZA monorepo framework.\n\n';

  mdContent += createMDContentTable(allDependencies);

  mdContent += '\n## Diagrams\n\n';
  mdContent +=
    '\nThis section presents visual dependency mappings for packages that rely on other package(s) within the LZA monorepo structure.\n\n';

  diagrams.forEach((_, nodeName) => {
    const sanitizedNodeName = nodeName.replace(/[@/\\]/g, '');
    mdContent += `#### ${nodeName}\n\n`;
    mdContent += `![${nodeName} Dependencies](img/dependency-diagrams/${sanitizedNodeName}-dependency.generated.svg)\n\n`;
  });
  return mdContent;
}

/**
 * Main function
 */
function main(): void {
  const rootPackageJsonDirectory = process.cwd();
  const rootPackageJsonPath = path.join(rootPackageJsonDirectory, 'package.json');
  const rootPackageJson = readPackageJson(rootPackageJsonPath);

  if (!rootPackageJson.workspaces) {
    console.error('No workspaces found in root package.json');
    process.exit(1);
  }

  // Get list of package.json paths from your existing method
  const packageJsonPaths: string[] = getPackageJsonFileList(rootPackageJsonDirectory);
  const prefixes: string[] = process.argv[2] !== undefined ? process.argv[2].split(',') : [];

  const allDependencies = getProjectDependencies(packageJsonPaths, prefixes);
  const diagrams = createSVGContent(allDependencies);

  const outputDir = path.join(__dirname, '../docs/developer-guide/img/dependency-diagrams');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  diagrams.forEach((svgContent, nodeName) => {
    const sanitizedNodeName = nodeName.replace(/[@/\\]/g, '');
    const filePath = path.join(outputDir, `${sanitizedNodeName}-dependency.generated.svg`);
    fs.writeFileSync(filePath, svgContent);
  });

  const mdContent = createMDContent(diagrams, allDependencies);
  const mdPath = path.join(__dirname, '../docs/developer-guide/package-dependencies.generated.md');
  fs.writeFileSync(mdPath, mdContent);
}

// Call the function to create MD file
(async () => {
  try {
    await main();
  } catch (err) {
    console.error(err);
    throw new Error(`${err}`);
  }
})();

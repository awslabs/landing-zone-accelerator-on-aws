# Package Dependencies

This section outlines the package dependencies within the LZA monorepo structure.


## Dependencies


This tabulated information presents a detailed overview of all packages and their respective dependencies contained within the LZA monorepo framework.

<style>
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
  </style>
<table style="width: 600px;">
<tr><th style="width: 300px;">Package</th><th style="width: 300px;">DependsOn Packages</th></tr>
<tr>
                  <td class="package-cell" rowspan="4">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/accelerator
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/config</td>
              </tr>
<tr><td class="dependency-cell">@aws-accelerator/constructs</td></tr>
<tr><td class="dependency-cell">@aws-accelerator/utils</td></tr>
<tr><td class="dependency-cell">@aws-cdk-extensions/cdk-plugin-assume-role</td></tr>
<tr>
                  <td class="package-cell" rowspan="2">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/constructs
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/config</td>
              </tr>
<tr><td class="dependency-cell">@aws-accelerator/utils</td></tr>
<tr>
                  <td class="package-cell" rowspan="2">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/installer
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/accelerator</td>
              </tr>
<tr><td class="dependency-cell">@aws-cdk-extensions/cdk-extensions</td></tr>
<tr>
                  <td class="package-cell" rowspan="2">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/lza-modules
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/config</td>
              </tr>
<tr><td class="dependency-cell">@aws-accelerator/utils</td></tr>
<tr>
                  <td class="package-cell" rowspan="2">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/modules
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/config</td>
              </tr>
<tr><td class="dependency-cell">@aws-accelerator/utils</td></tr>
<tr>
                  <td class="package-cell" rowspan="1">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/tester-lambdas
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/utils</td>
              </tr>
<tr>
                  <td class="package-cell" rowspan="2">
                      <div style="display: flex; align-items: center; height: 100%;">
                          @aws-accelerator/tools
                      </div>
                  </td>
                  <td class="dependency-cell">@aws-accelerator/config</td>
              </tr>
<tr><td class="dependency-cell">@aws-accelerator/utils</td></tr>
</table>
## Diagrams


This section presents visual dependency mappings for packages that rely on other package(s) within the LZA monorepo structure.

#### @aws-accelerator/accelerator

![@aws-accelerator/accelerator Dependencies](img/dependency-diagrams/aws-acceleratoraccelerator-dependency.generated.svg)

#### @aws-accelerator/constructs

![@aws-accelerator/constructs Dependencies](img/dependency-diagrams/aws-acceleratorconstructs-dependency.generated.svg)

#### @aws-accelerator/installer

![@aws-accelerator/installer Dependencies](img/dependency-diagrams/aws-acceleratorinstaller-dependency.generated.svg)

#### @aws-accelerator/lza-modules

![@aws-accelerator/lza-modules Dependencies](img/dependency-diagrams/aws-acceleratorlza-modules-dependency.generated.svg)

#### @aws-accelerator/modules

![@aws-accelerator/modules Dependencies](img/dependency-diagrams/aws-acceleratormodules-dependency.generated.svg)

#### @aws-accelerator/tester-lambdas

![@aws-accelerator/tester-lambdas Dependencies](img/dependency-diagrams/aws-acceleratortester-lambdas-dependency.generated.svg)

#### @aws-accelerator/tools

![@aws-accelerator/tools Dependencies](img/dependency-diagrams/aws-acceleratortools-dependency.generated.svg)


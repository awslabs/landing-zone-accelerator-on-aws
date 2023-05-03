Landing Zone Accelerator on AWS GovCloud(US) - Network configuration


<table>
    <tr>
        <td><b>Accounts</b></td>
        <td><b>VPC Name</b></td>
        <td><b>VPC CIDR Range</b></td>
        <td><b>Subnet Name</b></td>
        <td><b>Subnet CIDR</b></td>
        <td><b>Route Table Name</b></td>
        <td><b>Route Table Destination</b></td>
        <td><b>Route Table Target</b></td>
        <td><b>Transit Gateway Attachments</b></td>
        <td><b>Transit Gateway Route Tables Names</b></td>
        <td><b>Transit Gateway Association</b></td>
        <td><b>Transit Gateway Propagation</b></td>
    </tr>
    <tr>
        <td> Management Central </td>
        <td colspan="11"> No VPCs </td>
    </tr>
    <tr>
        <td> Log Archive </td>
        <td colspan="11"> No VPCs </td>
    </tr>
    <tr>
        <td> Audit </td>
        <td colspan="11"> No VPCs </td>
    </tr>
    <tr>
        <td rowspan="12"> Network </td>
        <td rowspan="12"> Network-Boundary </td>
        <td rowspan="12"> 10.0.0.0/19 </td>
        <td> Network-Boundary-Untrust-A </td>
        <td> 10.0.0.0/22 </td>
        <td> Network-Boundary-Untrust-Rt-A </td>
        <td rowspan="3"> 0.0.0.0/0 <br /> 10.0.0.0/8 <br /> 10.0.0.0/19 </td>
        <td rowspan="3"> igw-d <br /> tgw-id <br /> local </td>
        <td rowspan="12"> Network-Boundary </td>
        <td rowspan="12"> Network-Main-Network-Boundary </td>
        <td rowspan="12"> Network-Boundary </td>
        <td rowspan="12"> SharedServices-Main <br /> SharedServices-External-Access <br /> </td>
    </tr>
    <tr>
        <td> Network-Boundary-Untrust-B </td>
        <td> 10.0.4.0/22 </td>
        <td> Network-Boundary-Untrust-Rt-B </td>
    </tr>
    <tr>
        <td> Network-Boundary-Untrust-C </td>
        <td> 10.0.8.0/22 </td>
        <td> Network-Boundary-Untrust-Rt-C </td>
    </tr>
    <tr>
        <td> Network-Boundary-Trust-A </td>
        <td> 10.0.12.0/22 </td>
        <td> Network-Boundary-Trust-Rt-A </td>
        <td rowspan="3"> 10.0.0.0/19 </td>
        <td rowspan="3"> local </td>
    </tr>
    <tr>
        <td> Network-Boundary-Trust-B </td>
        <td> 10.0.16.0/22 </td>
        <td> Network-Boundary-Trust-Rt-B </td>
    </tr>
    <tr>
        <td> Network-Boundary-Trust-C </td>
        <td> 10.0.20.0/22 </td>
        <td> Network-Boundary-Trust-Rt-C </td>
    </tr>
    <tr>
        <td> Network-Boundary-Management-A </td>
        <td> 10.0.24.0/27 </td>
        <td> Network-Boundary-Management-Rt-A </td>
        <td rowspan="3"> 0.0.0.0/0 <br /> 10.0.0.0/19  </td>
        <td rowspan="3"> igw-d <br /> local  </td>
    </tr>
    <tr>
        <td> Network-Boundary-Management-B </td>
        <td> 10.0.24.32/27 </td>
        <td> Network-Boundary-Management-Rt-B </td>
    </tr>
    <tr>
        <td> Network-Boundary-Management-C </td>
        <td> 10.0.24.64/27 </td>
        <td> Network-Boundary-Management-Rt-C </td>
    </tr>
    <tr>
        <td> Network-Boundary-TgwAttach-A </td>
        <td> 10.0.31.208/28 </td>
        <td> Network-Boundary-TgwAttach-Rt-A </td>
        <td rowspan="3"> 0.0.0.0/0 <br /> 10.0.0.0/19  </td>
        <td rowspan="3"> nat-id <br /> local  </td>
    </tr>
    <tr>
        <td> Network-Boundary-TgwAttach-B </td>
        <td> 10.0.31.224/28 </td>
        <td> Network-Boundary-TgwAttach-Rt-B </td>
    </tr>
    <tr>
        <td> Network-Boundary-TgwAttach-C </td>
        <td> 10.0.31.240/28 </td>
        <td> Network-Boundary-TgwAttach-Rt-C </td>
    </tr>
    <tr>
        <td rowspan="18"> Shared Services </td>
        <td rowspan="9"> SharedServices-Main </td>
        <td rowspan="9"> 10.1.0.0/20 </td>
        <td> SharedServices-Main-App-A </td>
        <td> 10.1.0.0/22 </td>
        <td> SharedServices-Main-App-Rt-A </td>
        <td rowspan="3"> 0.0.0.0/0 <br /> 10.1.0.0/20 </td>
        <td rowspan="3"> tgw-id <br /> local </td>
        <td rowspan="9"> SharedServices-Main </td>
        <td rowspan="9"> Network-Main-SharedServices-Main </td>
        <td rowspan="9"> SharedServices-Main </td>
        <td rowspan="9"> Network-Boundary <br /> SharedServices-External-Access <br /> </td>
    </tr>
    <tr>
        <td> SharedServices-Main-App-B </td>
        <td> 10.1.4.0/22 </td>
        <td> SharedServices-Main-App-Rt-B </td>
    </tr> 
    <tr>
        <td> SharedServices-Main-App-C </td>
        <td> 10.1.8.0/22 </td>
        <td> SharedServices-Main-App-Rt-C </td>
    </tr> 
    <tr>
        <td> SharedServices-Main-Database-A </td>
        <td> 10.1.112.0/24 </td>
        <td> SharedServices-Main-Database-Rt-A </td>
        <td rowspan="3"> 10.1.0.0/20 </td>
        <td rowspan="3"> local </td>
    </tr> 
    <tr>
        <td> SharedServices-Main-Database-B </td>
        <td> 10.1.113.0/24 </td>
        <td> SharedServices-Main-Database-Rt-B </td>
    </tr>
    <tr>
        <td> SharedServices-Main-Database-C </td>
        <td> 10.1.114.0/24 </td>
        <td> SharedServices-Main-Database-Rt-C </td>
    </tr>
    <tr>
        <td> SharedServices-Main-TgwAttach-A </td>
        <td> 10.1.15.208/28 </td>
        <td> SharedServices-Main-TgwAttach-Rt-A </td>
        <td rowspan="3"> 10.1.0.0/20 </td>
        <td rowspan="3"> local </td>
    </tr> 
    <tr>
        <td> SharedServices-Main-TgwAttach-B </td>
        <td> 10.1.15.224/28 </td>
        <td> SharedServices-Main-TgwAttach-Rt-B </td>
    </tr>
    <tr>
        <td> SharedServices-Main-TgwAttach-C </td>
        <td> 10.1.15.240/28 </td>
        <td> SharedServices-Main-TgwAttach-Rt-C </td>
    </tr>
    <tr>
        <td rowspan="9"> SharedServices-External-Access </td>
        <td rowspan="9"> 10.1.16.0/24 </td>
        <td> SharedServices-External-Access-Public-A </td>
        <td> 10.1.16.0/27 </td>
        <td> SharedServices-External-Access-Public-Rt-A </td>
        <td rowspan="3"> 0.0.0.0/0 <br /> 10.1.16.0/24 </td>
        <td rowspan="3"> igw-id <br /> local </td>
        <td rowspan="9"> SharedServices-External-Access </td>
        <td rowspan="9"> Network-Main-SharedServices-External-Access </td>
        <td rowspan="9"> SharedServices-External-Access </td>
        <td rowspan="9"> Network-Boundary <br /> SharedServices-Main <br /> </td>
    </tr>
    <tr>
        <td> SharedServices-External-Access-Public-B </td>
        <td> 10.1.16.32/27 </td>
        <td> SharedServices-External-Access-Public-Rt-B </td>
    </tr> 
    <tr>
        <td> SharedServices-External-Access-Public-C </td>
        <td> 10.1.16.64/27 </td>
        <td> SharedServices-External-Access-Public-Rt-C </td>
    </tr> 
    <tr>
        <td> SharedServices-External-Access-Private-A </td>
        <td> 10.1.16.96/27 </td>
        <td> SharedServices-External-Access-Private-Rt-A </td>
        <td rowspan="3"> 10.0.0.0/8<br />0.0.0.0/0<br />10.1.16.0/24 </td>
        <td rowspan="3"> tgw-id<br />igw-id<br />local </td>
    </tr> 
    <tr>
        <td> SharedServices-External-Access-Private-B </td>
        <td> 10.1.16.128/27 </td>
        <td> SharedServices-External-Access-Private-Rt-B </td>
    </tr>
    <tr>
        <td> SharedServices-External-Access-Private-C </td>
        <td> 10.1.16.160/27 </td>
        <td> SharedServices-External-Access-Private-Rt-C </td>
    </tr>
    <tr>
        <td> SharedServices-External-Access-TgwAttach-A </td>
        <td> 10.1.16.208/28 </td>
        <td> SharedServices-External-Access-TgwAttach-Rt-A </td>
        <td rowspan="3"> 10.1.16.0/24 </td>
        <td rowspan="3"> local </td>
    </tr> 
    <tr>
        <td> SharedServices-External-Access-TgwAttach-B </td>
        <td> 10.1.16.224/28 </td>
        <td> SharedServices-External-Access-TgwAttach-Rt-B </td>
    </tr>
    <tr>
        <td> SharedServices-External-Access-TgwAttach-C </td>
        <td> 10.1.16.240/28 </td>
        <td> SharedServices-External-Access-TgwAttach-Rt-C </td>
    </tr>

</table>

(Note: Availability Zone C is optional)

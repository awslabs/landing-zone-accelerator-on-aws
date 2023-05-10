[CmdletBinding()]
param(
    [string]
    $GroupNames,

    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword

$groupsArray = $GroupNames -split ','

for ($i=0; $i -lt $groupsArray.Length; $i++) {
    $groupName = $groupsArray[$i]
    $groupExists = Get-ADGroup -Filter {Name -eq $groupName} -Credential $credential
    if($null -eq $groupExists) {
        #Create Group
        New-ADGroup -Name $groupName -GroupCategory Security -GroupScope Global -Credential $credential
    }
}
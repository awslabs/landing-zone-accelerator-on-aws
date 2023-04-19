[CmdletBinding()]
param(
    [string]
    $GroupName,

    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword

Start-Process powershell.exe -Credential $credential -ArgumentList "-file c:\cfn\scripts\AD-group-grant-permissions-setup.ps1", "$GroupName"
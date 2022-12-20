[CmdletBinding()]
param(
    [string]
    $GroupName
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

#Delegate Control
dsacls "CN=$GroupName,OU=Users,OU=$dom,DC=$dom,DC=$ext" /I:T /G "$dom\$GroupName`:CCDC;computer"
dsacls "CN=$GroupName,OU=Users,OU=$dom,DC=$dom,DC=$ext" /I:T /G "$dom\$GroupName`:CCDC;user"
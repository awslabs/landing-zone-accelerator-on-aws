[CmdletBinding()]
param(
    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword,

    [Boolean]
    $ComplexityEnabled,

    [string]
    $LockoutDuration,

    [string]
    $LockoutObservationWindow,

    [string]
    $LockoutThreshold,

    [string]
    $MaxPasswordAge,

    [string]
    $MinPasswordAge,

    [string]
    $MinPasswordLength,

    [string]
    $PasswordHistoryCount,

    [Boolean]
    $ReversibleEncryptionEnabled
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword

#Configure passsord policy for all users
Set-ADFineGrainedPasswordPolicy -Identity:"CN=CustomerPSO-01,CN=Password Settings Container,CN=System,DC=$dom,DC=$ext" -ComplexityEnabled:$ComplexityEnabled -MaxPasswordAge:$MaxPasswordAge -LockoutDuration:$LockoutDuration -LockoutObservationWindow:$LockoutObservationWindow -LockoutThreshold:$LockoutThreshold -MinPasswordAge:$MinPasswordAge -MinPasswordLength:$MinPasswordLength -PasswordHistoryCount:$PasswordHistoryCount -ReversibleEncryptionEnabled:$ReversibleEncryptionEnabled -Server:$fdn -Credential $credential

#Create password policy subject
Add-ADFineGrainedPasswordPolicySubject -Identity:"CN=CustomerPSO-01,CN=Password Settings Container,CN=System,DC=$dom,DC=$ext" -Server:$fdn -Subjects:"CN=Domain Users,CN=Users,DC=$dom,DC=$ext" -Credential $credential

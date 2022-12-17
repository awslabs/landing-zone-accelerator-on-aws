[CmdletBinding()]
param(
    [string]
    $UserName,

    [string]
    $Password,

    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword,

    [string]
    $PasswordNeverExpires,

    [Parameter(Mandatory=$false)]
    [AllowEmptyString()]
    [string]$UserEmailAddress = ''
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

$pass = ConvertTo-SecureString $Password -AsPlainText -Force
$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword
$userExists = Get-ADUser -Credential $credential -Filter "Name -eq '$UserName'"

If ($null -eq $userExists -and $UserEmailAddress) {
  #Create User
  New-ADUser -Name $UserName -EmailAddress $UserEmailAddress -AccountPassword $pass -Enabled 1 -Credential $credential -SamAccountName $UserName
}

#Set the admin & connector user's password never expires flag
If (-NOT  ($PasswordNeverExpires -eq 'No')) {
  Set-ADUser -Identity $UserName -PasswordNeverExpires $true -Credential $credential
}  Else {
  Set-ADUser -Identity $UserName -PasswordNeverExpires $false -Credential $credential
}

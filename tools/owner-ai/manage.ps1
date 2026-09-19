param(
  [ValidateSet('Install','Start','Run','Stop','Uninstall')][string]$Action='Start',
  [string]$Url,
  [string]$CodexHome
)
$ErrorActionPreference='Stop'
$taskName='GeneMap Owner Subscription'
$home=Join-Path $env:LOCALAPPDATA 'GeneMap\owner-ai-bridge'
$secretPath=Join-Path $home 'bridge-secret.dpapi'
$configPath=Join-Path $home 'config.json'
switch($Action){
  'Install' {
    $target=[Uri]$Url
    if($target.Scheme -ne 'https' -or $target.UserInfo -or $target.Query -or $target.Fragment -or $target.AbsolutePath -ne '/') {throw 'An HTTPS origin is required'}
    if(-not [IO.Path]::IsPathRooted($CodexHome)) {throw 'An absolute private Codex home is required'}
    if(-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {throw 'Node is required'}
    New-Item -ItemType Directory -Force $home | Out-Null
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $home /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Cannot protect owner configuration'}
    $secret=Read-Host 'Dedicated app bridge token' -AsSecureString
    if($secret.Length -lt 32){throw 'Bridge token is too short'}
    $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath
    @{url=$target.AbsoluteUri;codexHome=$CodexHome} | ConvertTo-Json | Set-Content -LiteralPath $configPath
    $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$PSCommandPath+'" -Action Run'
    $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
    $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  }
  'Run' {
    $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $secure=(Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $env:OWNER_AI_BRIDGE_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
      $env:OWNER_AI_URL=$config.url
      $env:OWNER_AI_CODEX_HOME=$config.codexHome
      & node.exe (Join-Path $PSScriptRoot 'bridge.mjs')
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      Remove-Item Env:OWNER_AI_BRIDGE_TOKEN -ErrorAction SilentlyContinue
    }
  }
  'Start' {Start-ScheduledTask -TaskName $taskName}
  'Stop' {Stop-ScheduledTask -TaskName $taskName}
  'Uninstall' {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $secretPath,$configPath -Force -ErrorAction SilentlyContinue
  }
}

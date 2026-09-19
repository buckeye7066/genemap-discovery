param(
  [ValidateSet('Install','Start','Run','Stop','Uninstall')][string]$Action='Start',
  [string]$Url,
  [string]$CodexHome,
  [Security.SecureString]$BridgeToken
)
$ErrorActionPreference='Stop'
$taskName='GeneMap Owner Subscription'
$bridgeHome=Join-Path $env:LOCALAPPDATA 'GeneMap\owner-ai-bridge'
$secretPath=Join-Path $bridgeHome 'bridge-secret.dpapi'
$configPath=Join-Path $bridgeHome 'config.json'
switch($Action){
  'Install' {
    $target=[Uri]$Url
    if($target.Scheme -ne 'https' -or $target.UserInfo -or $target.Query -or $target.Fragment -or $target.AbsolutePath -ne '/') {throw 'An HTTPS origin is required'}
    if(-not [IO.Path]::IsPathRooted($CodexHome)) {throw 'An absolute private Codex home is required'}
    if(-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {throw 'Node is required'}
    New-Item -ItemType Directory -Force $bridgeHome | Out-Null
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $bridgeHome /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Cannot protect owner configuration'}
    $secret=if($null -ne $BridgeToken){$BridgeToken}else{Read-Host 'Dedicated app bridge token' -AsSecureString}
    if($secret.Length -lt 32){throw 'Bridge token is too short'}
    $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath
    @{url=$target.AbsoluteUri;codexHome=$CodexHome} | ConvertTo-Json | Set-Content -LiteralPath $configPath
    foreach($name in @('manage.ps1','bridge.mjs','officialCli.mjs','codexAppServer.mjs')){
      $source=Join-Path $PSScriptRoot $name;$destination=Join-Path $bridgeHome $name
      if((Test-Path $source) -and [IO.Path]::GetFullPath($source)-ne[IO.Path]::GetFullPath($destination)){Copy-Item -LiteralPath $source -Destination $destination -Force}
    }
    $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $bridgeHome 'manage.ps1')+'" -Action Run'
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

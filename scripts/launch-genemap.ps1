# GeneMap Discovery launcher
# Opens the REAL desktop application (the packaged Electron app), not a browser.
#
# The packaged app's bundled SPA was built with VITE_API_URL=http://localhost:3000,
# so it talks to the local API. This launcher therefore:
#   1. starts the local API (:3000) if it isn't already listening,
#   2. waits for the API to come up,
#   3. launches the packaged GeneMap Discovery.exe.
# No Vite dev server and no browser tab. Safe to double-click repeatedly.
#
# If the packaged app is missing (e.g. after a clean checkout), rebuild it with:
#   pnpm build:desktop:win        (produces apps/desktop/dist-electron/win-unpacked)

$ErrorActionPreference = 'SilentlyContinue'
$repo   = 'C:\Users\firer\genemap-discovery'
$appExe = Join-Path $repo 'apps\desktop\dist-electron\win-unpacked\GeneMap Discovery.exe'

function Test-Port([int]$port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', $port)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# 1. Backend API (the desktop app needs it on :3000).
if (-not (Test-Port 3000)) {
  Start-Process -WindowStyle Minimized -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', "Set-Location '$repo'; pnpm dev:api"
}

# 2. Wait up to 60s for the API to listen.
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Port 3000) { break }
  Start-Sleep -Seconds 1
}

# 3. Launch the actual desktop app. Fall back to the production website build's
#    dev server only if the packaged app was never built.
if (Test-Path $appExe) {
  Start-Process -FilePath $appExe
} else {
  # Fallback: packaged app not found -- start the web dev server and open it so
  # the shortcut still does something useful until `pnpm build:desktop:win` runs.
  if (-not (Test-Port 5173)) {
    Start-Process -WindowStyle Minimized -FilePath 'powershell.exe' `
      -ArgumentList '-NoExit', '-Command', "Set-Location '$repo'; pnpm dev:web"
  }
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-Port 5173) { break }
    Start-Sleep -Seconds 1
  }
  Start-Process 'http://localhost:5173'
}

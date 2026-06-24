# GeneMap Discovery launcher
# Starts the local API (:3000) and web (:5173) dev servers if they are not
# already running, waits for the web server to come up, then opens the app in
# the default browser. Safe to double-click repeatedly — it never starts a
# server that is already listening.

$ErrorActionPreference = 'SilentlyContinue'
$repo   = 'C:\Users\firer\genemap-discovery'
$webUrl = 'http://localhost:5173'

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

# Backend API
if (-not (Test-Port 3000)) {
  Start-Process -WindowStyle Minimized -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', "Set-Location '$repo'; pnpm dev:api"
}

# Frontend (Vite)
if (-not (Test-Port 5173)) {
  Start-Process -WindowStyle Minimized -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', "Set-Location '$repo'; pnpm dev:web"
}

# Wait up to 60s for Vite, then open the app.
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Port 5173) { break }
  Start-Sleep -Seconds 1
}

Start-Process $webUrl

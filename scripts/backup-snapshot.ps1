# GeneMap Discovery - Backup Snapshot Script (PowerShell)
# Creates a timestamped backup of the repository and database

$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupName = "genemap-backup-$Timestamp"
$BackupDir = "./backups"
$TempDir = "$env:TEMP\$BackupName"

Write-Host "=== GeneMap Discovery Backup Script ===" -ForegroundColor Cyan
Write-Host "Timestamp: $Timestamp"
Write-Host ""

# Create directories
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Get repository root
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "[1/5] Copying repository files..." -ForegroundColor Yellow

$ExcludePatterns = @(
    "node_modules",
    "dist",
    ".next",
    "build",
    ".env",
    ".env.local",
    ".env.production",
    "backups",
    ".git",
    "*.log"
)

# Copy files excluding patterns
Get-ChildItem -Path $RepoRoot -Recurse | Where-Object {
    $item = $_
    $exclude = $false
    foreach ($pattern in $ExcludePatterns) {
        if ($item.FullName -like "*\$pattern\*" -or $item.Name -like $pattern) {
            $exclude = $true
            break
        }
    }
    -not $exclude
} | ForEach-Object {
    $dest = $_.FullName.Replace($RepoRoot, $TempDir)
    $destDir = Split-Path -Parent $dest
    if (!(Test-Path $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }
    if (!$_.PSIsContainer) {
        Copy-Item $_.FullName -Destination $dest -Force
    }
}

Write-Host "[2/5] Backing up database (if DATABASE_URL is set)..." -ForegroundColor Yellow
if ($env:DATABASE_URL) {
    Write-Host "  Exporting database..."
    try {
        & pg_dump $env:DATABASE_URL > "$TempDir\database-dump.sql"
    }
    catch {
        Write-Host "  Warning: Database backup failed. Continuing without DB dump." -ForegroundColor Yellow
        Write-Host "  (This is normal if database is not accessible)"
    }
}
else {
    Write-Host "  DATABASE_URL not set, skipping database backup"
    Write-Host "  (Database will be backed up by Railway automatically)"
}

Write-Host "[3/5] Creating backup metadata..." -ForegroundColor Yellow

$GitBranch = & git branch --show-current 2>$null
if (!$GitBranch) { $GitBranch = "N/A" }

$GitCommit = & git rev-parse HEAD 2>$null
if (!$GitCommit) { $GitCommit = "N/A" }

$MetadataContent = @"
GeneMap Discovery Backup
========================
Date: $(Get-Date)
Git Branch: $GitBranch
Git Commit: $GitCommit
Backup Type: Manual Snapshot
"@

Set-Content -Path "$TempDir\backup-info.txt" -Value $MetadataContent

Write-Host "[4/5] Creating ZIP archive..." -ForegroundColor Yellow
$ZipPath = "$RepoRoot\$BackupDir\$BackupName.zip"
Compress-Archive -Path $TempDir\* -DestinationPath $ZipPath -Force

Write-Host "[5/5] Cleaning up temporary files..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $TempDir

$BackupSize = (Get-Item $ZipPath).Length / 1MB
$BackupSizeMB = [math]::Round($BackupSize, 2)

Write-Host ""
Write-Host "✅ Backup complete!" -ForegroundColor Green
Write-Host "   Location: $ZipPath"
Write-Host "   Size: $BackupSizeMB MB"
Write-Host ""

if ($env:DRIVE_DIR) {
    Write-Host "Copying to remote storage: $env:DRIVE_DIR" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $env:DRIVE_DIR | Out-Null
    Copy-Item $ZipPath -Destination $env:DRIVE_DIR -Force
    Write-Host "✅ Remote copy complete!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Backup summary:" -ForegroundColor Cyan
Write-Host "  - Repository code: ✅"
Write-Host "  - Configuration files: ✅"

$DbStatus = if (Test-Path "$TempDir\database-dump.sql") { "✅" } else { "⚠️  (skipped)" }
Write-Host "  - Database dump: $DbStatus"

$RemoteStatus = if ($env:DRIVE_DIR) { "✅" } else { "⚠️  (not configured)" }
Write-Host "  - Remote copy: $RemoteStatus"

Write-Host ""
Write-Host "To restore this backup, see docs/BACKUP.md"

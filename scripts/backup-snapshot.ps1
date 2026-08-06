# GeneMap Discovery - manual backup snapshot (PowerShell)
# Database-bearing archives are fail-closed and encrypted before they leave
# the temporary workspace. Set BACKUP_CODE_ONLY=true to explicitly create a
# source-only ZIP when no database URL is available.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$BackupName = "genemap-backup-$Timestamp"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $RepoRoot "backups"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("genemap-backup-" + [guid]::NewGuid().ToString("N"))
$StagingDir = Join-Path $TempRoot $BackupName
$PlainArchive = Join-Path $TempRoot "$BackupName.zip"
$DatabaseIncluded = $false
$FinalExtension = "zip"
$FinalPath = $null

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not installed."
    }
}

function Assert-SafeRemoteDirectory([string]$Path) {
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        throw "DRIVE_DIR must be an absolute path."
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "DRIVE_DIR must already exist and be a directory."
    }

    $Separators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $FullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd($Separators)
    $RootPath = [System.IO.Path]::GetPathRoot($FullPath).TrimEnd($Separators)
    if ($FullPath -eq $RootPath) {
        throw "DRIVE_DIR cannot be a filesystem root."
    }
}

try {
    Write-Host "=== GeneMap Discovery Backup Script ===" -ForegroundColor Cyan
    Write-Host "Timestamp (UTC): $Timestamp"

    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

    Write-Host "[1/6] Copying repository files..." -ForegroundColor Yellow
    $ExcludePatterns = @(
        "node_modules", "dist", ".next", "build", ".env", ".env.local",
        ".env.production", "backups", ".git", "*.log"
    )

    Get-ChildItem -LiteralPath $RepoRoot -Recurse -Force | Where-Object {
        $Item = $_
        $Excluded = $false
        foreach ($Pattern in $ExcludePatterns) {
            if ($Item.FullName -like "*\$Pattern\*" -or $Item.Name -like $Pattern) {
                $Excluded = $true
                break
            }
        }
        -not $Excluded
    } | ForEach-Object {
        $RelativePath = [System.IO.Path]::GetRelativePath($RepoRoot, $_.FullName)
        $Destination = Join-Path $StagingDir $RelativePath
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $Destination | Out-Null
        }
        else {
            $DestinationDirectory = Split-Path -Parent $Destination
            New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $Destination -Force
        }
    }

    Write-Host "[2/6] Creating database dump..." -ForegroundColor Yellow
    if ($env:DATABASE_URL) {
        Require-Command "pg_dump"
        Require-Command "openssl"
        if (-not $env:BACKUP_ENCRYPTION_PASSPHRASE) {
            throw "BACKUP_ENCRYPTION_PASSPHRASE is required when DATABASE_URL is set."
        }

        $DumpPath = Join-Path $StagingDir "database.dump"
        & pg_dump --format=custom --no-owner --no-privileges "--file=$DumpPath" $env:DATABASE_URL
        if ($LASTEXITCODE -ne 0) {
            Remove-Item -LiteralPath $DumpPath -Force -ErrorAction SilentlyContinue
            throw "pg_dump failed with exit code $LASTEXITCODE; no backup archive was created."
        }
        if (-not (Test-Path -LiteralPath $DumpPath -PathType Leaf) -or (Get-Item -LiteralPath $DumpPath).Length -le 0) {
            throw "pg_dump produced an empty file; no backup archive was created."
        }

        $DatabaseIncluded = $true
        $FinalExtension = "zip.enc"
    }
    elseif ($env:BACKUP_CODE_ONLY -eq "true") {
        Write-Host "  DATABASE_URL is absent; creating the explicitly requested code-only snapshot."
    }
    else {
        throw "DATABASE_URL is not set. Set it for a complete encrypted backup, or set BACKUP_CODE_ONLY=true explicitly."
    }

    Write-Host "[3/6] Creating backup metadata..." -ForegroundColor Yellow
    $GitBranch = (& git -C $RepoRoot branch --show-current 2>$null)
    if (-not $GitBranch) { $GitBranch = "N/A" }
    $GitCommit = (& git -C $RepoRoot rev-parse HEAD 2>$null)
    if (-not $GitCommit) { $GitCommit = "N/A" }
    $Metadata = @"
GeneMap Discovery Backup
========================
Date (UTC): $((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
Git Branch: $GitBranch
Git Commit: $GitCommit
Database Included: $($DatabaseIncluded.ToString().ToLowerInvariant())
Database Archive Encrypted: $($DatabaseIncluded.ToString().ToLowerInvariant())
Backup Type: Manual Snapshot
"@
    Set-Content -LiteralPath (Join-Path $StagingDir "backup-info.txt") -Value $Metadata -Encoding UTF8

    Write-Host "[4/6] Creating archive..." -ForegroundColor Yellow
    Compress-Archive -Path (Join-Path $StagingDir "*") -DestinationPath $PlainArchive -Force
    if (-not (Test-Path -LiteralPath $PlainArchive -PathType Leaf) -or (Get-Item -LiteralPath $PlainArchive).Length -le 0) {
        throw "Archive creation failed."
    }

    $FinalPath = Join-Path $BackupDir "$BackupName.$FinalExtension"
    if ($DatabaseIncluded) {
        & openssl enc -aes-256-cbc -salt -pbkdf2 -in $PlainArchive -out $FinalPath -pass env:BACKUP_ENCRYPTION_PASSPHRASE
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $FinalPath -PathType Leaf) -or (Get-Item -LiteralPath $FinalPath).Length -le 0) {
            Remove-Item -LiteralPath $FinalPath -Force -ErrorAction SilentlyContinue
            throw "Archive encryption failed; no backup artifact was created."
        }
        Remove-Item -LiteralPath $PlainArchive -Force
    }
    else {
        Move-Item -LiteralPath $PlainArchive -Destination $FinalPath -Force
    }

    Write-Host "[5/6] Writing integrity checksum..." -ForegroundColor Yellow
    $Hash = (Get-FileHash -LiteralPath $FinalPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $ChecksumPath = "$FinalPath.sha256"
    Set-Content -LiteralPath $ChecksumPath -Value "$Hash  $([System.IO.Path]::GetFileName($FinalPath))" -Encoding ASCII

    $RemoteCopied = $false
    if ($env:DRIVE_DIR) {
        Assert-SafeRemoteDirectory $env:DRIVE_DIR
        Write-Host "[6/6] Copying archive and checksum to configured storage..." -ForegroundColor Yellow
        Copy-Item -LiteralPath $FinalPath, $ChecksumPath -Destination $env:DRIVE_DIR -Force
        $RemoteCopied = $true
    }
    else {
        Write-Host "[6/6] Remote copy not requested."
    }

    $SizeMb = [math]::Round((Get-Item -LiteralPath $FinalPath).Length / 1MB, 2)
    Write-Host "Backup complete: $FinalPath ($SizeMb MB)" -ForegroundColor Green
    Write-Host "  Database included: $DatabaseIncluded"
    Write-Host "  Database-bearing archive encrypted: $DatabaseIncluded"
    Write-Host "  Remote copy completed: $RemoteCopied"
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force
    }
}

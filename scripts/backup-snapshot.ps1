# GeneMap Discovery - manual backup snapshot (PowerShell)
# Database-bearing snapshots fail closed and use authenticated age encryption.
# Set BACKUP_CODE_ONLY=true to explicitly create a tracked-source-only archive.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$BackupName = "genemap-backup-$Timestamp"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $RepoRoot "backups"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("genemap-backup-" + [guid]::NewGuid().ToString("N"))
$StagingDir = Join-Path $TempRoot $BackupName
$DatabaseIncluded = $false
$FinalExtension = "tar.gz"
$FinalPath = $null

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not installed."
    }
}

function Assert-SafeTrackedSource {
    $TrackedPaths = @(& git -C $RepoRoot ls-tree -r --name-only HEAD)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to enumerate tracked source files."
    }

    $UnsafePaths = @($TrackedPaths | Where-Object {
        $_ -match '(^|/)(\.env($|\.)|\.npmrc$|credentials\.json$|service-account[^/]*\.json$|[^/]+\.(pem|key)$)' -and
        $_ -notmatch '(^|/)\.env(\.[^/]*)?\.example$'
    })
    if ($UnsafePaths.Count -gt 0) {
        throw "Refusing to archive tracked credential-like files: $($UnsafePaths -join ', ')"
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

function Set-OwnerOnlyUnixMode([string]$Path) {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
        Require-Command "chmod"
        & chmod 600 $Path
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to restrict permissions on $Path."
        }
    }
}

try {
    Write-Host "=== GeneMap Discovery Backup Script ===" -ForegroundColor Cyan
    Write-Host "Timestamp (UTC): $Timestamp"

    foreach ($CommandName in @("git", "tar")) {
        Require-Command $CommandName
    }
    & git -C $RepoRoot rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "The repository does not have a readable HEAD commit."
    }
    Assert-SafeTrackedSource

    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

    Write-Host "[1/6] Exporting tracked repository files..." -ForegroundColor Yellow
    $SourceTar = Join-Path $TempRoot "tracked-source.tar"
    & git -C $RepoRoot archive --format=tar "--output=$SourceTar" HEAD
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $SourceTar -PathType Leaf)) {
        throw "Git source export failed."
    }
    & tar -xf $SourceTar -C $StagingDir
    if ($LASTEXITCODE -ne 0) {
        throw "Tracked source extraction failed."
    }
    Remove-Item -LiteralPath $SourceTar -Force

    Write-Host "[2/6] Creating database dump..." -ForegroundColor Yellow
    if ($env:DATABASE_URL) {
        Require-Command "pg_dump"
        Require-Command "age"
        if (-not $env:BACKUP_AGE_RECIPIENT) {
            throw "BACKUP_AGE_RECIPIENT is required when DATABASE_URL is set."
        }

        $DumpPath = Join-Path $TempRoot "database.dump"
        $PreviousPgDatabase = $env:PGDATABASE
        try {
            $env:PGDATABASE = $env:DATABASE_URL
            & pg_dump --format=custom --no-owner --no-privileges "--file=$DumpPath"
            if ($LASTEXITCODE -ne 0) {
                throw "pg_dump failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            $env:PGDATABASE = $PreviousPgDatabase
        }
        if (-not (Test-Path -LiteralPath $DumpPath -PathType Leaf) -or (Get-Item -LiteralPath $DumpPath).Length -le 0) {
            throw "pg_dump produced an empty file."
        }

        $EncryptedDump = Join-Path $StagingDir "database.dump.age"
        & age --recipient $env:BACKUP_AGE_RECIPIENT --output $EncryptedDump $DumpPath
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $EncryptedDump -PathType Leaf) -or (Get-Item -LiteralPath $EncryptedDump).Length -le 0) {
            Remove-Item -LiteralPath $EncryptedDump -Force -ErrorAction SilentlyContinue
            throw "Database-dump encryption failed."
        }
        Remove-Item -LiteralPath $DumpPath -Force

        $DatabaseIncluded = $true
        $FinalExtension = "tar.gz.age"
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
    $GitCommit = (& git -C $RepoRoot rev-parse HEAD)
    $Metadata = @"
GeneMap Discovery Backup
========================
Date (UTC): $((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
Git Branch: $GitBranch
Git Commit: $GitCommit
Source Scope: tracked files at Git commit only
Database Included: $($DatabaseIncluded.ToString().ToLowerInvariant())
Database Dump Encrypted: $($DatabaseIncluded.ToString().ToLowerInvariant())
Outer Archive Encrypted: $($DatabaseIncluded.ToString().ToLowerInvariant())
Backup Type: Manual Snapshot
"@
    Set-Content -LiteralPath (Join-Path $StagingDir "backup-info.txt") -Value $Metadata -Encoding UTF8

    Write-Host "[4/6] Creating final archive..." -ForegroundColor Yellow
    $PlainArchive = Join-Path $TempRoot "$BackupName.tar.gz"
    & tar -czf $PlainArchive -C $TempRoot $BackupName
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $PlainArchive -PathType Leaf) -or (Get-Item -LiteralPath $PlainArchive).Length -le 0) {
        throw "Archive creation failed."
    }

    $FinalPath = Join-Path $BackupDir "$BackupName.$FinalExtension"
    if ($DatabaseIncluded) {
        & age --recipient $env:BACKUP_AGE_RECIPIENT --output $FinalPath $PlainArchive
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $FinalPath -PathType Leaf) -or (Get-Item -LiteralPath $FinalPath).Length -le 0) {
            Remove-Item -LiteralPath $FinalPath -Force -ErrorAction SilentlyContinue
            throw "Final archive encryption failed."
        }
        Remove-Item -LiteralPath $PlainArchive -Force
    }
    else {
        Move-Item -LiteralPath $PlainArchive -Destination $FinalPath -Force
    }
    Set-OwnerOnlyUnixMode $FinalPath

    Write-Host "[5/6] Writing integrity checksum..." -ForegroundColor Yellow
    $Hash = (Get-FileHash -LiteralPath $FinalPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $ChecksumPath = "$FinalPath.sha256"
    Set-Content -LiteralPath $ChecksumPath -Value "$Hash  $([System.IO.Path]::GetFileName($FinalPath))" -Encoding ASCII
    Set-OwnerOnlyUnixMode $ChecksumPath

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
    [Console]::Error.WriteLine("Backup failed: $($_.Exception.Message)")
    exit 1
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force
    }
}

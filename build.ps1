$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

corepack pnpm build:versioned

$releaseDir = Join-Path $root "release"
if (Test-Path -LiteralPath $releaseDir) {
  Get-ChildItem -LiteralPath $releaseDir |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5 Name, Length, LastWriteTime |
    Format-Table -AutoSize
}

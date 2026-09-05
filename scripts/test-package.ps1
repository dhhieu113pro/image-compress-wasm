param(
  [Parameter(Mandatory=$true)][string]$PackageDirectory,
  [Parameter(Mandatory=$true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ("image-compress-dnx-" + [guid]::NewGuid())
New-Item -ItemType Directory $temp | Out-Null

try {
  $repoRoot = Split-Path $PSScriptRoot -Parent
  $input = Join-Path $repoRoot 'tests/img1.webp'
  $output = Join-Path $temp 'output.jpg'

  if (-not (Test-Path $input)) { throw "Fixture not found: $input" }

  & dnx "ImageCompress.Dnx@$Version" --source (Resolve-Path $PackageDirectory) --verbosity quiet --yes -- $input -o $output --quality 75 --max-width 320 --remove-metadata
  if ($LASTEXITCODE -ne 0) { throw "dnx exited with code $LASTEXITCODE" }
  if (-not (Test-Path $output)) { throw 'DNX did not produce output' }

  $bytes = [IO.File]::ReadAllBytes($output)
  if ($bytes.Length -lt 4) { throw 'Output too small' }
  if ($bytes[0] -ne 0xFF -or $bytes[1] -ne 0xD8) { throw 'Output is not JPEG' }
}
finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}

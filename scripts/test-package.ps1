param([Parameter(Mandatory=$true)][string]$PackageDirectory,[Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference='Stop'; $temp=Join-Path ([IO.Path]::GetTempPath()) ("image-compress-dnx-"+[guid]::NewGuid()); New-Item -ItemType Directory $temp|Out-Null
try {
  $input=Join-Path $temp 'input.ppm'; $output=Join-Path $temp 'output.webp'; [IO.File]::WriteAllText($input,"P3`n2 2`n255`n255 0 0  0 255 0`n0 0 255  255 255 255`n")
  dnx --source $PackageDirectory "ImageCompress.Dnx@$Version" -- $input -o $output --quality 75
  if(-not (Test-Path $output)){throw 'DNX did not produce output'}; $bytes=[IO.File]::ReadAllBytes($output); if($bytes.Length -lt 12){throw 'Output too small'}
} finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }

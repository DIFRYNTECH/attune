param(
    [Parameter(Mandatory = $true)][string]$ApkPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$apk = (Resolve-Path -LiteralPath $ApkPath).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
$sha = [System.Security.Cryptography.SHA256]::Create()
$count = 0

try {
    $dist = Join-Path $root 'dist'
    foreach ($file in Get-ChildItem -LiteralPath $dist -File -Recurse) {
        $relative = [System.IO.Path]::GetRelativePath($dist, $file.FullName).Replace('\', '/')
        # Web domain-verification files are excluded by Android's hidden-directory asset rules.
        if ($relative.StartsWith('.well-known/')) { continue }
        $entry = $zip.GetEntry("assets/public/$relative")
        if ($null -eq $entry) { throw "Missing bundled asset: $relative" }
        $stream = $entry.Open()
        try { $bundledHash = [Convert]::ToHexString($sha.ComputeHash($stream)) }
        finally { $stream.Dispose() }
        if ($bundledHash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
            throw "Stale bundled asset: $relative"
        }
        $count++
    }
    foreach ($name in @('attune-app-icon.svg', 'attune-app-icon.png', 'attune-logo-final.svg', 'attune-favicon.svg')) {
        $entry = $zip.GetEntry("assets/public/$name")
        if ($null -eq $entry) { throw "Missing new branding: $name" }
        $stream = $entry.Open()
        try { $bundledHash = [Convert]::ToHexString($sha.ComputeHash($stream)) }
        finally { $stream.Dispose() }
        if ($bundledHash -ne (Get-FileHash -LiteralPath (Join-Path $root "public/$name") -Algorithm SHA256).Hash) {
            throw "Stale bundled branding: $name"
        }
    }
    [PSCustomObject]@{ Apk = $apk; MatchedRuntimeFiles = $count; Branding = 'Current'; SHA256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash }
}
finally {
    $sha.Dispose()
    $zip.Dispose()
}

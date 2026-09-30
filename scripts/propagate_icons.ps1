Add-Type -AssemblyName System.Drawing

$projectRoot = (Get-Item "$PSScriptRoot\..").FullName
$resDir = Join-Path $projectRoot "android\app\src\main\res"

Write-Host "Project root: $projectRoot"
Write-Host "Res dir: $resDir"

# Step 1: Clean up default & overriding icon files
Write-Host "Cleaning up round icons, adaptive wrappers, and default foreground files..."
Get-ChildItem -Path $resDir -Filter "*ic_launcher_round*" -Recurse | ForEach-Object {
    Write-Host "Deleting: $($_.FullName)"
    Remove-Item $_.FullName -Force
}

$anydpiDir = Join-Path $resDir "mipmap-anydpi-v26"
if (Test-Path $anydpiDir) {
    Write-Host "Deleting adaptive icon folder: $anydpiDir"
    Remove-Item $anydpiDir -Recurse -Force
}

Get-ChildItem -Path $resDir -Filter "*ic_launcher_foreground*" -Recurse | ForEach-Object {
    Write-Host "Deleting: $($_.FullName)"
    Remove-Item $_.FullName -Force
}

# Function to resize and save PNG
function Set-PngSize {
    param(
        [string]$sourcePath,
        [string]$destPath,
        [int]$size
    )

    $destFolder = Split-Path $destPath
    if (!(Test-Path $destFolder)) {
        New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
    }

    $srcStream = [System.IO.File]::OpenRead($sourcePath)
    $srcImage = [System.Drawing.Image]::FromStream($srcStream)

    $destBmp = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $rect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
    $graphics.DrawImage($srcImage, $rect)

    if (Test-Path $destPath) {
        Remove-Item $destPath -Force
    }

    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImage.Dispose()
    $srcStream.Dispose()

    Write-Host "Generated: $destPath (${size}x${size})"
}

# Step 2: Propagate custom logos
$lightLogo = Join-Path $projectRoot "public\assets\logo-light.png"
$darkLogo = Join-Path $projectRoot "public\assets\logo-dark.png"

$densities = @(
    @{ Name = "mdpi"; Size = 48 },
    @{ Name = "hdpi"; Size = 72 },
    @{ Name = "xhdpi"; Size = 96 },
    @{ Name = "xxhdpi"; Size = 144 },
    @{ Name = "xxxhdpi"; Size = 192 }
)

Write-Host "Generating Light (Green) Logos..."
foreach ($d in $densities) {
    $outPath = Join-Path $resDir "mipmap-$($d.Name)\ic_launcher.png"
    Set-PngSize -sourcePath $lightLogo -destPath $outPath -size $d.Size
}

Write-Host "Generating Dark (Blue) Logos..."
foreach ($d in $densities) {
    $outPath = Join-Path $resDir "mipmap-night-$($d.Name)\ic_launcher.png"
    Set-PngSize -sourcePath $darkLogo -destPath $outPath -size $d.Size
}

Write-Host "Icon propagation completed successfully!"

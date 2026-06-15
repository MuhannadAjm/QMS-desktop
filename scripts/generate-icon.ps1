# generate-icon.ps1
# Generates a 1024x1024 PNG source icon for QMS Desktop.
# Uses System.Drawing (built into Windows .NET Framework).
# Run from project root: .\scripts\generate-icon.ps1
#
# After running this script, generate all Tauri icon sizes:
#   npm.cmd run tauri -- icon scripts/source_icon.png

param(
    [string]$OutputPath = "D:\QMS-Desktop\scripts\source_icon.png"
)

Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Fill background: transparent (icon.ico will use shape)
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded rectangle: navy blue #1E3A5F
$radius   = 180
$bgColor  = [System.Drawing.Color]::FromArgb(255, 30, 58, 95)
$bgBrush  = New-Object System.Drawing.SolidBrush($bgColor)
$bgPath   = New-Object System.Drawing.Drawing2D.GraphicsPath

$bgPath.AddArc(0,              0,              $radius * 2, $radius * 2, 180, 90)
$bgPath.AddArc($size - $radius * 2, 0,              $radius * 2, $radius * 2, 270, 90)
$bgPath.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2,   0, 90)
$bgPath.AddArc(0,              $size - $radius * 2, $radius * 2, $radius * 2,  90, 90)
$bgPath.CloseFigure()
$g.FillPath($bgBrush, $bgPath)

# Draw "Q" — white, bold, centered
# Font size 540px leaves comfortable margin inside rounded square
$fontSize  = 560
$font      = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sf        = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

# Slight upward shift (-30px) because Q has a descending tail
$rect = [System.Drawing.RectangleF]::new(0, -30, $size, $size)
$g.DrawString("Q", $font, $textBrush, $rect, $sf)

$g.Dispose()

# Save as 32bppArgb PNG
$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Icon source saved: $OutputPath"
Write-Host ""
Write-Host "Next step — generate all Tauri icon sizes:"
Write-Host "  Set-Location D:\QMS-Desktop"
Write-Host "  npm.cmd run tauri -- icon scripts/source_icon.png"

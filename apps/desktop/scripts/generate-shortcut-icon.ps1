# Generates the GeneMap desktop-shortcut icon: a white X-shaped chromosome on
# an Ohio State scarlet/gray background, written as a 256x256 PNG-compressed
# .ico (supported by Windows Vista+). Dependency-free; uses System.Drawing only.
#
#   pwsh apps/desktop/scripts/generate-shortcut-icon.ps1
#
# Output: apps/desktop/icons/genemap-shortcut.ico

Add-Type -AssemblyName System.Drawing

$size = 256
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded-square tile path
function New-RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$tile = New-RoundedRect 8 8 ($size - 16) ($size - 16) 52

# Deep scarlet base fill.
$baseBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 186, 12, 47))
$g.FillPath($baseBrush, $tile)

# Radial highlight: soft gray center fading outward, clipped to the tile.
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse(-30, -30, ($size + 60), ($size + 60))
$glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
$glow.CenterPoint   = New-Object System.Drawing.PointF(($size / 2), ($size * 0.42))
$glow.CenterColor   = [System.Drawing.Color]::FromArgb(145, 167, 177, 183)
$glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 74, 5, 19))
$g.SetClip($tile)
$g.FillPath($glow, $glowPath)
$g.ResetClip()

# Subtle gray diagonals echo the web/PWA icon.
$stripe = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(55, 167, 177, 183)), 2
for ($i = -$size; $i -lt ($size * 2); $i += 34) {
  $g.DrawLine($stripe, $i, $size, ($i + $size), 0)
}

# Subtle inner highlight ring for depth.
$ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 255, 255, 255)), 2
$g.DrawPath($ring, (New-RoundedRect 10 10 ($size - 20) ($size - 20) 50))

# Chromosome: two capsules crossing as an X
# A capsule is a fully-rounded rectangle (radius = width/2).
function Draw-Capsule([single]$angleDeg, $brush, $pen) {
  $state = $g.Save()
  $g.TranslateTransform($size / 2, $size / 2)
  $g.RotateTransform($angleDeg)
  $capW = 44
  $capH = 150
  $cap  = New-RoundedRect (-$capW / 2) (-$capH / 2) $capW $capH ($capW / 2)
  $g.FillPath($brush, $cap)
  if ($pen) { $g.DrawPath($pen, $cap) }
  $g.Restore($state)
}

# Soft outer glow halo behind the chromosome (semi-transparent, slightly wide).
function Draw-CapsuleGlow([single]$angleDeg) {
  $state = $g.Save()
  $g.TranslateTransform($size / 2, $size / 2)
  $g.RotateTransform($angleDeg)
  $cap = New-RoundedRect (-30) (-86) 60 172 30
  $halo = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 255, 255, 255))
  $g.FillPath($halo, $cap)
  $g.Restore($state)
}

Draw-CapsuleGlow 28
Draw-CapsuleGlow -28

# White body with a faint top-down sheen.
$bodyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 50)),
  (New-Object System.Drawing.Point(0, 206)),
  [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
  [System.Drawing.Color]::FromArgb(255, 225, 230, 250))
$edgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 120, 70, 20)), 1.5

Draw-Capsule 28 $bodyBrush $edgePen
Draw-Capsule -28 $bodyBrush $edgePen

# Centromere: a small scarlet dot at the crossing to read as the chromosome waist.
$centro = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 186, 12, 47))
$g.FillEllipse($centro, ($size / 2 - 13), ($size / 2 - 13), 26, 26)
$centroHi = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 225, 232))
$g.FillEllipse($centroHi, ($size / 2 - 7), ($size / 2 - 7), 14, 14)

$g.Dispose()

# Write PNG, then wrap it in an .ico container
$pngStream = New-Object System.IO.MemoryStream
$bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $pngStream.ToArray()
$pngStream.Dispose()
$bmp.Dispose()

$outDir = Join-Path $PSScriptRoot '..\icons'
$outDir = (Resolve-Path $outDir).Path
$outPath = Join-Path $outDir 'genemap-shortcut.ico'

$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter($fs)
# ICONDIR
$bw.Write([UInt16]0)   # reserved
$bw.Write([UInt16]1)   # type: icon
$bw.Write([UInt16]1)   # image count
# ICONDIRENTRY
$bw.Write([Byte]0)     # width  (0 = 256)
$bw.Write([Byte]0)     # height (0 = 256)
$bw.Write([Byte]0)     # palette
$bw.Write([Byte]0)     # reserved
$bw.Write([UInt16]1)   # color planes
$bw.Write([UInt16]32)  # bits per pixel
$bw.Write([UInt32]$png.Length)  # size of image data
$bw.Write([UInt32]22)  # offset (6 + 16)
$bw.Write($png)
$bw.Flush()
$bw.Close()
$fs.Close()

Write-Host "Wrote $outPath ($($png.Length) bytes PNG payload)"

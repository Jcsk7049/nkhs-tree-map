# 產生 PWA/主畫面圖示:綠底(#2e7d32)+ 白色樹。來源圖 scripts/icon-source.png 為透明背景的黑色線條,以 alpha 當形狀。
# 用法(專案根目錄):  powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'scripts\icon-source.png'
$green = [System.Drawing.Color]::FromArgb(255, 0x2e, 0x7d, 0x32)

$src = New-Object System.Drawing.Bitmap $srcPath
# 先把來源轉成「白色 + 原 alpha」
$white = New-Object System.Drawing.Bitmap -ArgumentList @($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $a = $src.GetPixel($x, $y).A
    $white.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
  }
}

foreach ($n in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($n, $n, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear($green)
  $size = [int]($n * 0.62)          # 樹佔 62%,落在 maskable 安全區(80%)內
  $off = [int](($n - $size) / 2)
  $g.DrawImage($white, $off, $off, $size, $size)
  $g.Dispose()
  $out = Join-Path $root "public\icon-$n.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $out"
}
$white.Dispose(); $src.Dispose()

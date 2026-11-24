# Значки из картинок пользователя (tools/icon-src) + котик с «пошлой» мордочкой.
# Для каждого id: ui/icons/<id>.png (превью), res/drawable-nodpi/ic_alt_<id>_bg.png и _fg.png,
# res/mipmap-anydpi-v26/ic_alt_<id>.xml (адаптивная) и res/mipmap-xxxhdpi/ic_alt_<id>.png (для старых Android).
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$res = "$root\src-tauri\gen\android\app\src\main\res"
$ui = "$root\ui\icons"
$srcDir = "$PSScriptRoot\icon-src"

function Save-Variant($id, [Drawing.Color]$bgColor, [Drawing.Image]$art, [double]$fit) {
  # фон — сплошной цвет картинки, передний план — картинка в безопасной зоне по центру
  $bg = New-Object Drawing.Bitmap 432, 432
  $g = [Drawing.Graphics]::FromImage($bg); $g.Clear($bgColor); $g.Dispose()
  $bg.Save("$res\drawable-nodpi\ic_alt_$($id)_bg.png", [Drawing.Imaging.ImageFormat]::Png)
  $fg = New-Object Drawing.Bitmap 432, 432, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($fg); $g.InterpolationMode = 'HighQualityBicubic'
  $k = [Math]::Min(432 * $fit / $art.Width, 432 * $fit / $art.Height)
  $w = [int]($art.Width * $k); $h = [int]($art.Height * $k)
  $g.DrawImage($art, [int]((432 - $w) / 2), [int]((432 - $h) / 2), $w, $h); $g.Dispose()
  $fg.Save("$res\drawable-nodpi\ic_alt_$($id)_fg.png", [Drawing.Imaging.ImageFormat]::Png)
  @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_alt_$($id)_bg" />
    <foreground android:drawable="@drawable/ic_alt_$($id)_fg" />
</adaptive-icon>
"@ | Out-File "$res\mipmap-anydpi-v26\ic_alt_$id.xml" -Encoding ascii
  # превью и запасной значок: картинка крупнее (без адаптивной маски)
  foreach ($t in @(@{ p = "$ui\$id.png"; s = 128 }, @{ p = "$res\mipmap-xxxhdpi\ic_alt_$id.png"; s = 192 })) {
    $s = $t.s; $b = New-Object Drawing.Bitmap $s, $s
    $g = [Drawing.Graphics]::FromImage($b); $g.Clear($bgColor); $g.InterpolationMode = 'HighQualityBicubic'
    $k2 = [Math]::Min($s * 0.94 / $art.Width, $s * 0.94 / $art.Height)
    $w2 = [int]($art.Width * $k2); $h2 = [int]($art.Height * $k2)
    $g.DrawImage($art, [int](($s - $w2) / 2), [int](($s - $h2) / 2), $w2, $h2); $g.Dispose()
    $b.Save($t.p, [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  }
  $bg.Dispose(); $fg.Dispose()
  Write-Output "icon $id"
}

# 1. Картинки пользователя как есть. id значков сохранены от прежних вариантов
#    (pink/sunset/blurple/ocean), чтобы у тех, кто их выбрал, значок не пропал после обновления.
$pics = @(
  @{ id = 'owo';     file = 'owo';    fit = 0.78 },
  @{ id = 'bunny';   file = 'bunny';  fit = 0.78 },
  @{ id = 'lilac';   file = 'lilac';  fit = 0.78 },
  @{ id = 'pink';    file = 'sakura'; fit = 1.0 },   # нежно-розовый котик с цветочком
  @{ id = 'ocean';   file = 'cyan';   fit = 0.80 },  # бирюзовый ≧◠w◠≦
  @{ id = 'blurple'; file = 'heart';  fit = 0.80 },  # малиновый ♡w♡
  @{ id = 'sunset';  file = 'coral';  fit = 0.80 }   # коралловый
)
foreach ($p in $pics) {
  $img = New-Object Drawing.Bitmap "$srcDir\$($p.file).png"
  Save-Variant $p.id ($img.GetPixel(3, 3)) $img $p.fit
  $img.Dispose()
}

# 4. Котик с «пошлой» мордочкой: оранжевый фон, прищур, румянец со штрихами, приоткрытый ротик, капелька
$orange = [Drawing.Color]::FromArgb(255, 139, 2)
$src = [Drawing.Image]::FromFile("$root\app-icon.png")
$N = 600
$small = New-Object Drawing.Bitmap $N, $N
$g = [Drawing.Graphics]::FromImage($small); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($src, 0, 0, $N, $N); $g.Dispose(); $src.Dispose()
$cat = New-Object Drawing.Bitmap $N, $N, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $N; $y++) { for ($x = 0; $x -lt $N; $x++) {
  $p = $small.GetPixel($x, $y); $l = [int]($p.R * 0.3 + $p.G * 0.59 + $p.B * 0.11)
  $a = [Math]::Max(0, [Math]::Min(255, ($l - 40) * 255 / 160))
  if ($a -gt 0) { $cat.SetPixel($x, $y, [Drawing.Color]::FromArgb($a, 255, 255, 255)) }
} }
$small.Dispose()
# рисуем мордочку поверх (координаты в системе 600×600 исходного значка)
$g = [Drawing.Graphics]::FromImage($cat); $g.SmoothingMode = 'AntiAlias'
$blush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(235, 255, 178, 102))
$g.FillEllipse($blush, 175, 345, 105, 50)   # левая щека
$g.FillEllipse($blush, 330, 345, 105, 50)   # правая щека
$hatch = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(230, 255, 255, 255)), 5
$hatch.StartCap = 'Round'; $hatch.EndCap = 'Round'
foreach ($cx in 200, 225, 250, 355, 380, 405) { $g.DrawLine($hatch, $cx, 360, ($cx + 10), 378) }
$mouth = New-Object Drawing.SolidBrush $orange
$g.FillEllipse($mouth, 287, 372, 32, 40)    # приоткрытый ротик
$tongue = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 255, 120, 140))
$g.FillEllipse($tongue, 293, 393, 20, 16)
$drop = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(240, 150, 210, 255))
$path = New-Object Drawing.Drawing2D.GraphicsPath
$path.AddBezier(452, 230, 438, 258, 432, 272, 452, 278); $path.AddBezier(452, 278, 472, 272, 466, 258, 452, 230)
$g.FillPath($drop, $path)                   # капелька пота
$g.Dispose()
# обрезаем пустые поля вокруг котика, чтобы он был крупным
$x0 = $N; $y0 = $N; $x1 = 0; $y1 = 0
for ($y = 0; $y -lt $N; $y += 2) { for ($x = 0; $x -lt $N; $x += 2) {
  if ($cat.GetPixel($x, $y).A -gt 40) { if ($x -lt $x0) { $x0 = $x }; if ($x -gt $x1) { $x1 = $x }; if ($y -lt $y0) { $y0 = $y }; if ($y -gt $y1) { $y1 = $y } }
} }
$rect = New-Object Drawing.Rectangle ($x0 - 4), ($y0 - 4), ($x1 - $x0 + 8), ($y1 - $y0 + 8)
$crop = $cat.Clone($rect, $cat.PixelFormat)
Save-Variant 'flushed' $orange $crop 0.72
$crop.Dispose(); $cat.Dispose()

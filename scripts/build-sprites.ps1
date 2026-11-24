<#
  Builds the runtime sprite strips for every character in media/sprites/<id>/.

  Each character folder has a hand-written character.json naming its source
  animations (animated WebP / GIF / PNG). This script converts them into small
  single-row PNG strips (downscaled, ~12 fps) plus atlas.json, which is what the
  in-view companion and the desktop helper actually play. Run it after adding or
  changing a character:

      npm run sprites               (or:  powershell -File scripts/build-sprites.ps1)

  Dev-time only, Windows only (uses the Windows imaging codecs to read the
  sources; nothing here ships to end users' machines at runtime).
#>
param([string]$Root = (Join-Path $PSScriptRoot '..\media\sprites'))

Add-Type -AssemblyName PresentationCore, System.Drawing
$ErrorActionPreference = 'Stop'
$MaxFrames = 48

# Fully clear almost-transparent pixels. A layered window only lets clicks through
# pixels whose alpha is exactly 0, so faint haze would otherwise block the desktop.
Add-Type -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class AlphaClean {
  public static void Run(Bitmap bmp, int threshold) {
    BitmapData d = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppPArgb);
    byte[] buf = new byte[d.Stride * d.Height];
    Marshal.Copy(d.Scan0, buf, 0, buf.Length);
    for (int i = 0; i < buf.Length; i += 4) if (buf[i + 3] <= threshold) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0; }
    Marshal.Copy(buf, 0, d.Scan0, buf.Length);
    bmp.UnlockBits(d);
  }
}
'@ -ReferencedAssemblies System.Drawing

# Frame durations (ms) straight from the ANMF chunks of an animated WebP.
function Get-WebpDurations([string]$path) {
  $b = [System.IO.File]::ReadAllBytes($path)
  $list = New-Object System.Collections.Generic.List[int]
  $i = 12
  while ($i + 8 -le $b.Length) {
    $tag = [System.Text.Encoding]::ASCII.GetString($b, $i, 4)
    $len = [BitConverter]::ToUInt32($b, $i + 4)
    if ($tag -eq 'ANMF') { $list.Add($b[$i + 8 + 12] + 256 * $b[$i + 8 + 13] + 65536 * $b[$i + 8 + 14]) }
    $i += 8 + $len + ($len % 2)
  }
  return ,$list.ToArray()
}

function Get-FrameBitmap($frame) {
  $w = $frame.PixelWidth; $h = $frame.PixelHeight
  $conv = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap($frame, [System.Windows.Media.PixelFormats]::Bgra32, $null, 0)
  $stride = $w * 4
  $buf = New-Object byte[] ($stride * $h)
  $conv.CopyPixels($buf, $stride, 0)
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $d = $bmp.LockBits((New-Object System.Drawing.Rectangle(0, 0, $w, $h)), 'WriteOnly', [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $d.Scan0, $buf.Length)
  $bmp.UnlockBits($d)
  return $bmp
}

foreach ($dir in Get-ChildItem $Root -Directory) {
  $manifestPath = Join-Path $dir.FullName 'character.json'
  if (-not (Test-Path $manifestPath)) { continue }
  $m = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $outDir = Join-Path $dir.FullName 'strips'
  New-Item -ItemType Directory -Force $outDir | Out-Null
  $atlas = [ordered]@{}
  $targetH = [int]$m.height
  $fps = [double]$m.fps
  if ($fps -le 0) { $fps = 12 }

  foreach ($prop in $m.animations.PSObject.Properties) {
    $name = $prop.Name; $src = Join-Path $dir.FullName $prop.Value
    $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create((New-Object System.Uri $src), 'None', 'OnLoad')
    $n = $dec.Frames.Count

    $dur = @()
    if ($src -like '*.webp') { $dur = Get-WebpDurations $src }
    if ($dur.Count -ne $n) { $dur = @(for ($k = 0; $k -lt $n; $k++) { 40 }) }   # unknown timing: assume 25 fps
    $total = ($dur | Measure-Object -Sum).Sum

    # Pick frames by sampling the timeline at the target fps (capped).
    $count = 1; $step = 0
    if ($n -gt 1) {
      $count = [Math]::Min($MaxFrames, [Math]::Max(2, [int][Math]::Round($total / 1000.0 * $fps)))
      $step = $total / $count
    }
    $picks = New-Object System.Collections.Generic.List[int]
    $acc = 0; $idx = 0
    for ($k = 0; $k -lt $count; $k++) {
      $t = $k * $step
      while ($idx -lt $n - 1 -and ($acc + $dur[$idx]) -le $t) { $acc += $dur[$idx]; $idx++ }
      $picks.Add($idx)
    }
    $frameMs = if ($count -gt 1) { [int][Math]::Round($total / $count) } else { 1000 }

    $sw = $dec.Frames[0].PixelWidth; $sh = $dec.Frames[0].PixelHeight
    $w = [int][Math]::Round($sw * $targetH / $sh)
    $strip = New-Object System.Drawing.Bitmap(($w * $count), $targetH, [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
    $g = [System.Drawing.Graphics]::FromImage($strip)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
    for ($k = 0; $k -lt $count; $k++) {
      $fb = Get-FrameBitmap $dec.Frames[$picks[$k]]
      # Go through a premultiplied bitmap so edges don't pick up dark fringes when scaled.
      $pm = New-Object System.Drawing.Bitmap($sw, $sh, [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
      $pg = [System.Drawing.Graphics]::FromImage($pm); $pg.CompositingMode = 'SourceCopy'; $pg.DrawImage($fb, 0, 0, $sw, $sh); $pg.Dispose()
      $g.DrawImage($pm, (New-Object System.Drawing.Rectangle(($k * $w), 0, $w, $targetH)))
      $pm.Dispose(); $fb.Dispose()
    }
    $g.Dispose()
    [AlphaClean]::Run($strip, 12)
    $file = "strips/$name.png"
    $strip.Save((Join-Path $dir.FullName $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $strip.Dispose()

    $loop = -not ($m.once -contains $name)
    $atlas[$name] = [ordered]@{ file = $file; frames = $count; w = $w; h = $targetH; frameMs = $frameMs; loop = $loop }
    "{0}/{1}: {2} -> {3} frames @ {4}ms, {5}x{6} px strip" -f $dir.Name, $name, $n, $count, $frameMs, ($w * $count), $targetH
  }
  # UTF-8 *without* a BOM (Set-Content -Encoding UTF8 adds one, which JSON.parse rejects).
  [System.IO.File]::WriteAllText((Join-Path $dir.FullName 'atlas.json'), ($atlas | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
}

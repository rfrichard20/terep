# Szintetikus (NEM ügyfél-) tesztrajz előállítása: sűrű, apró feliratos vektoros alaprajz egy oldalon (A2 fekvő).
# Cél: a PDF-megjelenítés élességének és sebességének próbája. A kimenet a web/minta mappába kerül,
# mert nem tartalmaz valódi adatot. Futtatás:  powershell -ExecutionPolicy Bypass -File eszkozok\mintarajz.ps1
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
function N([double]$v) { $v.ToString('0.##', $inv) }
$sb = New-Object Text.StringBuilder
function Op([string]$s) { [void]$sb.Append($s).Append("`n") }
function Txt($x, $y, $size, $s, $font = 'F1') { Op "BT /$font $(N $size) Tf $(N $x) $(N $y) Td ($s) Tj ET" }
function TxtC($x, $y, $size, $s, $font = 'F1') { Txt ($x - $s.Length * $size * 0.26) $y $size $s $font }
function Rect($x, $y, $w, $h) { Op "$(N $x) $(N $y) $(N $w) $(N $h) re S" }
function Line($x1, $y1, $x2, $y2) { Op "$(N $x1) $(N $y1) m $(N $x2) $(N $y2) l S" }
function Circle($cx, $cy, $r) {
  $k = 0.5523 * $r
  Op ("$(N ($cx+$r)) $(N $cy) m " +
    "$(N ($cx+$r)) $(N ($cy+$k)) $(N ($cx+$k)) $(N ($cy+$r)) $(N $cx) $(N ($cy+$r)) c " +
    "$(N ($cx-$k)) $(N ($cy+$r)) $(N ($cx-$r)) $(N ($cy+$k)) $(N ($cx-$r)) $(N $cy) c " +
    "$(N ($cx-$r)) $(N ($cy-$k)) $(N ($cx-$k)) $(N ($cy-$r)) $(N $cx) $(N ($cy-$r)) c " +
    "$(N ($cx+$k)) $(N ($cy-$r)) $(N ($cx+$r)) $(N ($cy-$k)) $(N ($cx+$r)) $(N $cy) c S")
}
function W($w) { Op "$(N $w) w" }

$PW = 1684; $PH = 1191                       # A2 fekvő, pont
$X0 = 90; $Y0 = 130; $BW = 1300; $BH = 930   # épület
$cols = 10; $cw = $BW / $cols
$rowsTop = 2; $rowsBot = 2; $corr = 70; $rh = ($BH - $corr) / 4

Op '0 0 0 RG 0 0 0 rg 1 J 1 j'
# Rajzkeret
W 1.2; Rect 20 20 ($PW - 40) ($PH - 40)
# Raszterhálózat (szaggatott) és tengelyjelek
W 0.25; Op '[14 3 2 3] 0 d'
for ($i = 0; $i -le $cols; $i++) { $x = $X0 + $i * $cw; Line $x ($Y0 - 60) $x ($Y0 + $BH + 60) }
$ys = @($Y0, ($Y0 + $rh), ($Y0 + 2 * $rh), ($Y0 + 2 * $rh + $corr), ($Y0 + 3 * $rh + $corr), ($Y0 + $BH))
foreach ($y in $ys) { Line ($X0 - 60) $y ($X0 + $BW + 60) $y }
Op '[] 0 d'; W 0.5
for ($i = 0; $i -le $cols; $i++) { $x = $X0 + $i * $cw; Circle $x ($Y0 + $BH + 72) 10; TxtC $x ($Y0 + $BH + 69) 8 "$($i + 1)" 'F2' }
$letters = 'A','B','C','D','E','F'
for ($j = 0; $j -lt $ys.Count; $j++) { Circle ($X0 - 72) $ys[$j] 10; TxtC ($X0 - 72) ($ys[$j] - 3) 8 $letters[$j] 'F2' }

# Külső fal (kitöltött, páros-páratlan szabállyal) – 14 pt vastag
Op "0.55 g $(N ($X0-7)) $(N ($Y0-7)) $(N ($BW+14)) $(N ($BH+14)) re $(N ($X0+7)) $(N ($Y0+7)) $(N ($BW-14)) $(N ($BH-14)) re f* 0 g"
W 0.6; Rect ($X0 - 7) ($Y0 - 7) ($BW + 14) ($BH + 14); Rect ($X0 + 7) ($Y0 + 7) ($BW - 14) ($BH - 14)

$rooms = @(); $n = 1
foreach ($band in @(@{ y = $Y0; ext = 'bottom' }, @{ y = $Y0 + $rh; ext = '' }, @{ y = $Y0 + 2 * $rh + $corr; ext = '' }, @{ y = $Y0 + 3 * $rh + $corr; ext = 'top' })) {
  for ($i = 0; $i -lt $cols; $i++) { $rooms += @{ x = $X0 + $i * $cw; y = $band.y; ext = $band.ext; n = $n; col = $i }; $n++ }
}
$names = 'Iroda', 'Targyalo', 'Iroda', 'Iroda', 'Irattar', 'Konyha', 'Iroda', 'Vezetoi', 'Iroda', 'Szerver'
foreach ($r in $rooms) {
  $x = $r.x; $y = $r.y
  # Belső falak: dupla vonal
  W 0.8; Line ($x + $cw - 3) ($y + 7) ($x + $cw - 3) ($y + $rh - 7); Line ($x + $cw + 3) ($y + 7) ($x + $cw + 3) ($y + $rh - 7)
  W 0.8; Line ($x + 7) ($y + 3) ($x + $cw - 7) ($y + 3); Line ($x + 7) ($y - 3) ($x + $cw - 7) ($y - 3)
  # Ajtó: nyílás + negyedív
  $dx = $x + 18; $dy = if ($r.ext -eq 'top' -or ($r.y -gt $Y0 + 2 * $rh)) { $y + 3 } else { $y + $rh - 3 }
  $s = if ($dy -gt $y + $rh / 2) { -1 } else { 1 }
  W 0.3; Line $dx $dy $dx ($dy + $s * 30)
  Op "$(N $dx) $(N ($dy + $s*30)) m $(N ($dx+16.5)) $(N ($dy + $s*30)) $(N ($dx+30)) $(N ($dy + $s*16.5)) $(N ($dx+30)) $(N $dy) c S"
  # Bútorok: asztalok, székek, polcok (sűrűség)
  W 0.2
  for ($k = 0; $k -lt 4; $k++) {
    $fx = $x + 22 + ($k % 2) * 52; $fy = $y + 40 + [math]::Floor($k / 2) * 70
    Rect $fx $fy 40 22; Circle ($fx + 20) ($fy + 30) 6; Line ($fx + 4) ($fy + 4) ($fx + 36) ($fy + 4)
    TxtC ($fx + 20) ($fy + 9) 2.2 "AS-$($r.n)-$($k+1)"
  }
  for ($k = 0; $k -lt 12; $k++) { Line ($x + $cw - 16) ($y + 20 + $k * 4) ($x + $cw - 9) ($y + 20 + $k * 4) }
  # Helyiség feliratai
  $cx = $x + $cw / 2; $cy = $y + $rh / 2
  $code = "2.$('{0:D2}' -f $r.n)"
  TxtC $cx ($cy + 4) 7 "$($names[$r.col]) $code" 'F2'
  TxtC $cx ($cy - 4) 4.5 "$(N (18 + ($r.n * 37 % 140) / 10)) m2"
  TxtC $cx ($cy - 10) 3.2 'PVC burkolat / h=2,80 m / alj. +7,20'
  # Ablakok a külső falon, apró árnyékoló-felirattal
  if ($r.ext) {
    for ($k = 0; $k -lt 2; $k++) {
      $wx = $x + 16 + $k * 58; $wy = if ($r.ext -eq 'top') { $Y0 + $BH - 7 } else { $Y0 - 7 }
      Op "1 g $(N $wx) $(N $wy) 40 14 re f 0 g"; W 0.4; Rect $wx $wy 40 14; Line $wx ($wy + 7) ($wx + 40) ($wy + 7)
      $ly = if ($r.ext -eq 'top') { $wy + 20 } else { $wy - 8 }
      TxtC ($wx + 20) $ly 2.4 "AR-$code-$($k+1)"
      TxtC ($wx + 20) ($ly + ($(if ($r.ext -eq 'top') { 3.2 } else { -3.2 }))) 1.9 '1200x1500 ZIP / mot.'
    }
  }
}
# Bal és jobb oldali ablakok
foreach ($side in @(($X0 - 7), ($X0 + $BW - 7))) {
  foreach ($y in @(($Y0 + 30), ($Y0 + $rh + 30), ($Y0 + 2 * $rh + $corr + 30), ($Y0 + 3 * $rh + $corr + 30))) {
    Op "1 g $(N $side) $(N $y) 14 50 re f 0 g"; W 0.4; Rect $side $y 14 50; Line ($side + 7) $y ($side + 7) ($y + 50)
  }
}
# Folyosó felirata
TxtC ($X0 + $BW / 2) ($Y0 + 2 * $rh + $corr / 2 - 3) 9 'KOZLEKEDO 2.00' 'F2'
# Méretláncok kívül
W 0.25
foreach ($yy in @(($Y0 - 32), ($Y0 + $BH + 32))) {
  Line $X0 $yy ($X0 + $BW) $yy
  for ($i = 0; $i -le $cols; $i++) { $x = $X0 + $i * $cw; Line ($x - 3) ($yy - 3) ($x + 3) ($yy + 3); Line $x ($yy - 6) $x ($yy + 6) }
  for ($i = 0; $i -lt $cols; $i++) { TxtC ($X0 + $i * $cw + $cw / 2) ($yy + 2) 3 "$([int]($cw * 10))" }
}
# Szövegmező (jobb oldal)
$tx = 1430; W 0.6; Rect $tx 40 234 360
for ($k = 1; $k -lt 12; $k++) { Line $tx (40 + $k * 30) ($tx + 234) (40 + $k * 30) }
$rows = 'REALFLEX MINTA', 'SZINTETIKUS TESZTRAJZ', 'Nem ugyfeladat', 'Alaprajz - 2. emelet', 'M 1:100', 'Rajzszam: MINTA-A-201',
  'Datum: 2026.11.11.', 'Rajzolta: generator', 'Ellenorizte: -', 'Formatum: A2', 'Revizio: 0', 'Lap: 1/1'
for ($k = 0; $k -lt 12; $k++) { Txt ($tx + 8) (40 + (11 - $k) * 30 + 11) $(if ($k -lt 2) { 9 } else { 6 }) $rows[$k] $(if ($k -lt 2) { 'F2' } else { 'F1' }) }
# Jelmagyarázat apró betűvel
Txt $tx 1120 6 'JELMAGYARAZAT / ARNYEKOLOK' 'F2'
for ($k = 0; $k -lt 90; $k++) {
  Txt $tx (1105 - $k * 7.5) 2.6 ("AR-2.{0:D2}-{1}  ZIP screen 1200x1500, motoros, Somfy RTS, szin RAL 7016, szovet Soltis 86 / 2047" -f (($k % 40) + 1), (($k % 2) + 1))
}

$content = $sb.ToString()
$objs = @(
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $PW $PH] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
  "<< /Length $($content.Length) >>`nstream`n$content`nendstream",
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
)
$out = New-Object Text.StringBuilder
[void]$out.Append("%PDF-1.4`n")
$offs = @()
for ($i = 0; $i -lt $objs.Count; $i++) { $offs += $out.Length; [void]$out.Append("$($i + 1) 0 obj`n$($objs[$i])`nendobj`n") }
$xref = $out.Length
[void]$out.Append("xref`n0 $($objs.Count + 1)`n0000000000 65535 f `n")
foreach ($o in $offs) { [void]$out.Append(('{0:D10} 00000 n ' -f $o) + "`n") }
[void]$out.Append("trailer`n<< /Size $($objs.Count + 1) /Root 1 0 R >>`nstartxref`n$xref`n%%EOF`n")
$dest = Join-Path $PSScriptRoot '..\web\minta\minta_alaprajz.pdf'
[IO.File]::WriteAllBytes([IO.Path]::GetFullPath($dest), [Text.Encoding]::ASCII.GetBytes($out.ToString()))
Write-Host "Kesz: $dest ($($out.Length) bajt)"

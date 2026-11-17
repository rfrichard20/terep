# Egyszerű helyi webszerver a web/ mappához (Python / Node nélkül). A Raktár serve.ps1 mintájára.
# Indítás:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8081]
# Port: 8081, hogy a Raktár (8080) mellett is fusson, és külön originként külön tárolója legyen.
param([int]$Port = 8081)

$root = (Join-Path $PSScriptRoot 'web') + [IO.Path]::DirectorySeparatorChar
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'; '.ico' = 'image/x-icon'; '.pdf' = 'application/pdf'
  '.woff2' = 'font/woff2'; '.wasm' = 'application/wasm'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Terep app: http://localhost:$Port/  (leallitas: Ctrl+C)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($path -eq '') { $path = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      $res = $ctx.Response
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
      $res.OutputStream.Close()
    } catch { Write-Host "Hiba: $_" }
  }
} finally {
  $listener.Stop()
}

<#
.SYNOPSIS
  Phase 0: runs most of docs/phase0-checklist.md unattended in PowerPoint for Windows.

.DESCRIPTION
  Drives PowerPoint through COM and the spike server in --auto mode. Inside the add-in frames the
  spike does on its own what the checklist does by hand (bind, write a value, probe, fill the
  document stores), because a script cannot click into the add-in's webview reliably.

  Written in the cloud without access to Windows: expect to fix small things on the first run.
  Each test runs in its own try/catch, so one failure does not stop the others. Use -Only to rerun
  single tests, e.g.  -Only T7,T8  (T1 always runs unless -Deck points to an existing deck).

  Prerequisites (once):  npm run certs   and   npm run register   in spikes/office-spike.
  Do NOT start the spike server yourself; this script starts and stops it (T10 needs that).

  Output: spikes/office-spike/results/windows-<timestamp>/
    steps.log, results.json, com-facts.json, report-*.md (one per server run), *.jpg screenshots, logs/*.ndjson

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File spikes\office-spike\automation\windows.ps1
#>
param(
  [string]$Base = 'https://localhost:3443',
  [string[]]$Only = @(),
  [string]$Deck = '',
  [int]$SlideWait = 7
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$spike = Split-Path -Parent $here
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $spike "results\windows-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$spikeSlide = Join-Path $here 'spike-slide.pptx'
if (-not $Deck) { $Deck = Join-Path $out 'phase0-win.pptx' }
$buildDeck = -not (Test-Path $Deck)
if ($buildDeck -and $Only.Count -gt 0 -and $Only -notcontains 'T1') { $Only += 'T1' }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SpikeNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$msoTrue = -1
$msoFalse = 0
$ppLayoutTitle = 1
$msoContentApp = 27
$script:ppt = $null
$script:pres = $null
$script:server = $null
$script:results = [ordered]@{}
$script:comFacts = New-Object System.Collections.ArrayList
$script:serverRun = 0

# --------------------------------------------------------------------------- helpers

function Write-Step([string]$text) {
  $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $text
  Write-Host $line
  Add-Content -Path (Join-Path $out 'steps.log') -Value $line
  try {
    $body = @{ text = "W-$text" } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$Base/logs/marker" -ContentType 'application/json' -Body $body | Out-Null
  } catch { }
}

function Set-Result([string]$key, $value) {
  $script:results[$key] = $value
  $script:results | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $out 'results.json') -Encoding UTF8
}

function Test-Server {
  try { Invoke-RestMethod -Uri "$Base/ping" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

function Start-SpikeServer {
  if (Test-Server) { throw "Something already answers on $Base. Stop your own spike server first." }
  $script:serverRun += 1
  $log = Join-Path $out ("server-{0}.out.log" -f $script:serverRun)
  $err = Join-Path $out ("server-{0}.err.log" -f $script:serverRun)
  $script:server = Start-Process -FilePath 'node' -ArgumentList 'server.mjs', '--auto' -WorkingDirectory $spike `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Server) { return }
    Start-Sleep -Milliseconds 500
  }
  throw 'Spike server did not start (see server-*.err.log). Did you run npm run certs?'
}

function Save-Report([string]$name) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/report.md" -OutFile (Join-Path $out "report-$name.md")
  } catch { Write-Warning "Could not save report-$name.md: $_" }
}

function Stop-SpikeServer([string]$reportName) {
  Save-Report $reportName
  if ($script:server) {
    Stop-Process -Id $script:server.Id -Force -ErrorAction SilentlyContinue
    $script:server = $null
  }
  for ($i = 0; $i -lt 20 -and (Test-Server); $i++) { Start-Sleep -Milliseconds 250 }
}

function Set-SpikeConfig([hashtable]$cfg) {
  $body = $cfg | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$Base/config.json" -ContentType 'application/json' -Body $body | Out-Null
}

function Save-Screenshot([string]$name) {
  try {
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $out "$name.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Warning "Screenshot $name failed: $_" }
}

function Start-PowerPoint {
  if ($script:ppt) { return }
  $script:ppt = New-Object -ComObject PowerPoint.Application
  $script:ppt.Visible = $msoTrue
  $script:ppt.WindowState = 3   # ppWindowMaximized
}

function Stop-PowerPoint {
  if ($script:pres) {
    try { $script:pres.Saved = $msoTrue; $script:pres.Close() } catch { }
    $script:pres = $null
  }
  if ($script:ppt) {
    try { $script:ppt.Quit() } catch { }
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:ppt)
    $script:ppt = $null
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  for ($i = 0; $i -lt 40 -and (Get-Process POWERPNT -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  Get-Process POWERPNT -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
}

function Open-Deck {
  Start-PowerPoint
  $script:pres = $script:ppt.Presentations.Open($Deck, $msoFalse, $msoFalse, $msoTrue)
  Start-Sleep -Seconds 3
}

function Close-Deck([bool]$save) {
  if (-not $script:pres) { return }
  if ($save) { $script:pres.Save() } else { $script:pres.Saved = $msoTrue }
  $script:pres.Close()
  $script:pres = $null
  Start-Sleep -Seconds 2
}

function Focus-PowerPoint {
  try { $script:ppt.ActiveWindow.Activate() } catch { }
  try { [void][SpikeNative]::SetForegroundWindow([IntPtr]$script:ppt.HWND) } catch { }
  try { [void](New-Object -ComObject WScript.Shell).AppActivate('PowerPoint') } catch { }
  Start-Sleep -Milliseconds 500
}

# Shows slide $index in Normal view so its add-in instance loads, then waits for the auto run.
function Show-Slide([int]$index, [int]$wait = $SlideWait) {
  $script:ppt.ActiveWindow.ViewType = 9   # ppViewNormal
  $script:ppt.ActiveWindow.View.GotoSlide($index)
  Start-Sleep -Seconds $wait
}

function Get-SpikeShapes($slide) {
  $list = @()
  foreach ($sh in $slide.Shapes) {
    if ($sh.Type -eq $msoContentApp) { $list += $sh }
  }
  return $list
}

function Add-ComFacts([string]$label) {
  $slides = @()
  foreach ($s in $script:pres.Slides) {
    $apps = @()
    foreach ($sh in (Get-SpikeShapes $s)) {
      $apps += [ordered]@{ name = $sh.Name; left = $sh.Left; top = $sh.Top; width = $sh.Width; height = $sh.Height }
    }
    $slides += [ordered]@{ index = $s.SlideIndex; slideId = $s.SlideID; contentApps = $apps }
  }
  [void]$script:comFacts.Add([ordered]@{ label = $label; at = (Get-Date).ToString('o'); slideWidth = $script:pres.PageSetup.SlideWidth; slideHeight = $script:pres.PageSetup.SlideHeight; slides = $slides })
  $script:comFacts | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $out 'com-facts.json') -Encoding UTF8
}

function Visit-AllSlides([string]$label) {
  for ($i = 1; $i -le $script:pres.Slides.Count; $i++) {
    if ((Get-SpikeShapes $script:pres.Slides.Item($i)).Count -gt 0) { Show-Slide $i } else { Show-Slide $i 2 }
  }
  Add-ComFacts $label
}

function Start-Show([int]$from = 1) {
  $ss = $script:pres.SlideShowSettings
  $ss.ShowPresenterView = $msoFalse
  $ss.RangeType = 1   # ppShowAll
  $ss.StartingSlide = 1
  $ss.EndingSlide = $script:pres.Slides.Count
  $win = $ss.Run()
  Start-Sleep -Seconds 3
  if ($from -gt 1) { $win.View.GotoSlide($from); Start-Sleep -Seconds $SlideWait }
  return $win
}

function Get-ShowWindow {
  for ($i = 0; $i -lt 20; $i++) {
    if ($script:ppt.SlideShowWindows.Count -gt 0) { return $script:ppt.SlideShowWindows.Item(1) }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Exit-Show {
  while ($script:ppt.SlideShowWindows.Count -gt 0) {
    try { $script:ppt.SlideShowWindows.Item(1).View.Exit() } catch { break }
    Start-Sleep -Seconds 2
  }
}

function Get-ShowPosition {
  $w = Get-ShowWindow
  if (-not $w) { return $null }
  return $w.View.CurrentShowPosition
}

function Click-Screen([int]$x, [int]$y) {
  [void][SpikeNative]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 150
  [SpikeNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [SpikeNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 800
}

# Screen point of a slide position (points) in a full-screen slideshow on the primary monitor.
function Get-ShowPoint([double]$left, [double]$top) {
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $W = $script:pres.PageSetup.SlideWidth
  $H = $script:pres.PageSetup.SlideHeight
  $scale = [Math]::Min($screen.Width / $W, $screen.Height / $H)
  $ox = $screen.Left + ($screen.Width - $W * $scale) / 2
  $oy = $screen.Top + ($screen.Height - $H * $scale) / 2
  return @([int]($ox + $left * $scale), [int]($oy + $top * $scale))
}

function Invoke-Test([string]$id, [string]$title, [scriptblock]$body) {
  if ($Only.Count -gt 0 -and $Only -notcontains $id) { return }
  Write-Step "$id $title"
  try {
    & $body
    if (-not $script:results.Contains($id)) { Set-Result $id 'done' }
  } catch {
    Write-Warning "$id failed: $_"
    Set-Result $id ("ERROR: {0} at line {1}" -f $_.Exception.Message, $_.InvocationInfo.ScriptLineNumber)
    try { Exit-Show } catch { }
  }
}

# --------------------------------------------------------------------------- tests

Start-SpikeServer
Set-SpikeConfig @{ auto = $true; autoWrite = 'ifEmpty'; sw = $null }
Write-Step 'start'
Set-Result 'environment' ([ordered]@{
    os = (Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-CimInstance Win32_OperatingSystem).Version
    screen = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { '{0}x{1}{2}' -f $_.Bounds.Width, $_.Bounds.Height, ($(if ($_.Primary) { ' primary' } else { '' })) }
  })

if ($buildDeck) {
  Invoke-Test 'T1' 'build test deck (1 Start, 2 spike A, 3 Zwischenfolie, 4 spike B, 5 Ende)' {
    Start-PowerPoint
    Set-Result 'powerpoint' ([ordered]@{ version = $script:ppt.Version; build = $script:ppt.Build; operatingSystem = $script:ppt.OperatingSystem })
    $script:pres = $script:ppt.Presentations.Add($msoTrue)
    $script:pres.PageSetup.SlideWidth = 960
    $script:pres.PageSetup.SlideHeight = 540
    $s = $script:pres.Slides.Add(1, $ppLayoutTitle); $s.Shapes.Item(1).TextFrame.TextRange.Text = 'Start'
    [void]$script:pres.Slides.InsertFromFile($spikeSlide, 1, 1, 1)
    $s = $script:pres.Slides.Add(3, $ppLayoutTitle); $s.Shapes.Item(1).TextFrame.TextRange.Text = 'Zwischenfolie'
    [void]$script:pres.Slides.InsertFromFile($spikeSlide, 3, 1, 1)
    $s = $script:pres.Slides.Add(5, $ppLayoutTitle); $s.Shapes.Item(1).TextFrame.TextRange.Text = 'Ende'
    $script:pres.SaveAs($Deck)
    Add-ComFacts 'T1 built'
    $apps2 = (Get-SpikeShapes $script:pres.Slides.Item(2)).Count
    $apps4 = (Get-SpikeShapes $script:pres.Slides.Item(4)).Count
    if ($apps2 -ne 1 -or $apps4 -ne 1) { throw "InsertFromFile did not bring the add-in frame along (slide 2: $apps2, slide 4: $apps4)" }
    Write-Step 'T1 first edit pass (each spike binds, writes a value, probes, fills document stores)'
    Visit-AllSlides 'T1 first pass'
    Save-Screenshot 'T1-edit-slide4'
  }
}

if (-not $script:pres) { Open-Deck }

Invoke-Test 'T3.4' 'slideshow before saving (unsaved settings visible?)' {
  $win = Start-Show 1
  for ($i = 2; $i -le $script:pres.Slides.Count; $i++) {
    $win.View.Next(); Start-Sleep -Seconds 4
    if ($i -eq 2) { Save-Screenshot 'T3.4-show-slide2' }
  }
  Exit-Show
}

Invoke-Test 'T3.2' 'save, quit PowerPoint, reopen, visit all (settings, ids, doc stores, localStorage persist?)' {
  Close-Deck $true
  Stop-PowerPoint
  Open-Deck
  Visit-AllSlides 'T3.2 after reopen'
}

Invoke-Test 'T3.3' 'write new values, close without saving, reopen (old values expected)' {
  Set-SpikeConfig @{ autoWrite = 'always' }
  Close-Deck $true
  Open-Deck
  Visit-AllSlides 'T3.3 new values written, not saved'
  Close-Deck $false
  Set-SpikeConfig @{ autoWrite = 'ifEmpty' }
  Open-Deck
  Visit-AllSlides 'T3.3 reopened without saving'
}

Invoke-Test 'T4.3' 'duplicate slide 4 (copy detection and fork)' {
  [void]$script:pres.Slides.Item(4).Duplicate()
  Show-Slide 5
  Show-Slide 4
  Add-ComFacts 'T4.3 after duplicate'
  Save-Screenshot 'T4.3-edit-slide4'
}

Invoke-Test 'T4.5' 'copy/paste slide 2 to the end, then delete it' {
  $script:pres.Slides.Item(2).Copy()
  Start-Sleep -Seconds 1
  [void]$script:pres.Slides.Paste($script:pres.Slides.Count + 1)
  $n = $script:pres.Slides.Count
  Show-Slide $n
  Add-ComFacts 'T4.5 pasted slide'
  $script:pres.Slides.Item($n).Delete()
}

Invoke-Test 'T4.6' 'move slide 2 to position 3 and back (no false copy detection)' {
  $script:pres.Slides.Item(2).MoveTo(3)
  Start-Sleep -Seconds 1
  $script:pres.Slides.Item(3).MoveTo(2)
  Show-Slide 2
}

Invoke-Test 'T4.7' 'copy only the frame of slide 4 onto slide 1, then delete it' {
  $frame = (Get-SpikeShapes $script:pres.Slides.Item(4))[0]
  $frame.Copy()
  Start-Sleep -Seconds 1
  [void]$script:pres.Slides.Item(1).Shapes.Paste()
  Show-Slide 1
  Add-ComFacts 'T4.7 frame pasted on slide 1'
  foreach ($sh in (Get-SpikeShapes $script:pres.Slides.Item(1))) { $sh.Delete() }
}

Invoke-Test 'T4.8+T6.3' 'paste slide 4 into a new presentation, keep both open' {
  $script:pres.Slides.Item(4).Copy()
  Start-Sleep -Seconds 1
  $other = $script:ppt.Presentations.Add($msoTrue)
  [void]$other.Slides.Paste(1)
  $other.Windows.Item(1).Activate()
  $script:ppt.ActiveWindow.View.GotoSlide(1)
  Start-Sleep -Seconds ($SlideWait + 5)
  Save-Screenshot 'T4.8-other-presentation'
  $other.Saved = $msoTrue
  $other.Close()
  $script:pres.Windows.Item(1).Activate()
  $script:pres.Save()
}

Invoke-Test 'T5.4' 'fresh spike on a new last slide reads the document stores silently' {
  $n = $script:pres.Slides.Count
  [void]$script:pres.Slides.InsertFromFile($spikeSlide, $n, 1, 1)
  Show-Slide ($n + 1) ($SlideWait + 3)
  $script:pres.Slides.Item($n + 1).Delete()
  $script:pres.Save()
}

Invoke-Test 'T7' 'slideshow from the beginning, forward, back, jump; then from current slide (Shift+F5)' {
  $win = Start-Show 1
  for ($i = 2; $i -le $script:pres.Slides.Count; $i++) {
    $win.View.Next(); Start-Sleep -Seconds 4
    Save-Screenshot ("T7-show-slide{0}" -f $i)
  }
  $win.View.Previous(); Start-Sleep -Seconds 4
  $win.View.Previous(); Start-Sleep -Seconds 4
  $win.View.GotoSlide(5); Start-Sleep -Seconds 4
  Save-Screenshot 'T7-show-jump5'
  Exit-Show
  Start-Sleep -Seconds 3
  Show-Slide 4 3
  Focus-PowerPoint
  [System.Windows.Forms.SendKeys]::SendWait('+{F5}')
  $w = Get-ShowWindow
  if (-not $w) { throw 'Shift+F5 did not start a slideshow (focus?)' }
  Start-Sleep -Seconds 5
  Set-Result 'T7.6 startedAt' $w.View.CurrentShowPosition
  Save-Screenshot 'T7.6-from-current'
  Exit-Show
}

Invoke-Test 'T8' 'presenter view on one monitor (Alt+F5)' {
  Show-Slide 1 2
  Focus-PowerPoint
  [System.Windows.Forms.SendKeys]::SendWait('%{F5}')
  $w = Get-ShowWindow
  if (-not $w) { throw 'Alt+F5 did not start a slideshow' }
  Start-Sleep -Seconds 4
  Set-Result 'T8 slideShowWindows' $script:ppt.SlideShowWindows.Count
  for ($i = 2; $i -le 5; $i++) {
    $w.View.Next(); Start-Sleep -Seconds 5
    Save-Screenshot ("T8-presenter-slide{0}" -f $i)
  }
  Exit-Show
}

Invoke-Test 'T9' 'click into the frame during the slideshow, then try keys' {
  $win = Start-Show 2
  $frame = (Get-SpikeShapes $script:pres.Slides.Item(2))[0]
  $p = Get-ShowPoint ($frame.Left + $frame.Width / 2) ($frame.Top + $frame.Height / 2)
  $keys = [ordered]@{}
  $before = Get-ShowPosition
  Click-Screen $p[0] $p[1]
  $keys['afterClickInFrame'] = Get-ShowPosition
  Save-Screenshot 'T9-after-click'
  foreach ($k in @('{RIGHT}', ' ', '{PGDN}')) {
    $pos = Get-ShowPosition
    [System.Windows.Forms.SendKeys]::SendWait($k)
    Start-Sleep -Seconds 2
    $keys[$k] = '{0} -> {1}' -f $pos, (Get-ShowPosition)
    if ((Get-ShowPosition) -ne $pos) { break }
  }
  Set-Result 'T9' ([ordered]@{ frameCenter = $p; startPosition = $before; keys = $keys })
  Exit-Show
}

Invoke-Test 'T10.4' 'server lost during the slideshow' {
  $win = Start-Show 2
  Stop-SpikeServer 'before-T10.4'
  Start-Sleep -Seconds 6
  Save-Screenshot 'T10.4-slide2-server-down'
  $win.View.Next(); Start-Sleep -Seconds 3
  $win.View.Next(); Start-Sleep -Seconds $SlideWait
  Save-Screenshot 'T10.4-slide4-server-down'
  Start-SpikeServer
  Set-SpikeConfig @{ auto = $true }
  Start-Sleep -Seconds 12
  Save-Screenshot 'T10.4-slide4-server-back'
  Exit-Show
}

Invoke-Test 'T10.1' 'server stopped while the file opens (no service worker)' {
  Close-Deck $true
  Stop-PowerPoint
  Stop-SpikeServer 'before-T10.1'
  Open-Deck
  Show-Slide 2
  Save-Screenshot 'T10.1-edit-slide2-server-down'
  $win = Start-Show 2
  Save-Screenshot 'T10.1-show-slide2-server-down'
  Exit-Show
  Close-Deck $false
  Stop-PowerPoint
  Start-SpikeServer
  Set-SpikeConfig @{ auto = $true }
}

Invoke-Test 'T10.2+T10.3' 'service worker: register, then start with the server stopped' {
  Set-SpikeConfig @{ sw = 'register' }
  Open-Deck
  Show-Slide 2 ($SlideWait + 5)
  Close-Deck $false
  Stop-PowerPoint
  Set-SpikeConfig @{ sw = $null }
  Open-Deck
  Show-Slide 2 ($SlideWait + 3)
  Close-Deck $false
  Stop-PowerPoint
  Stop-SpikeServer 'before-T10.3'
  Open-Deck
  Show-Slide 2
  Save-Screenshot 'T10.3-edit-slide2-sw-server-down'
  $win = Start-Show 2
  Save-Screenshot 'T10.3-show-slide2-sw-server-down'
  Exit-Show
  Close-Deck $false
  Stop-PowerPoint
  Start-SpikeServer
  Set-SpikeConfig @{ auto = $true; sw = 'unregister' }
  Open-Deck
  Show-Slide 2 ($SlideWait + 3)
  Set-SpikeConfig @{ sw = $null }
}

# --------------------------------------------------------------------------- wrap up

Write-Step 'end'
Save-Report 'final'
try { Close-Deck $true } catch { }
Stop-PowerPoint
Stop-SpikeServer 'final-after-close'
New-Item -ItemType Directory -Force -Path (Join-Path $out 'logs') | Out-Null
Get-ChildItem (Join-Path $spike 'logs') -Filter '*.ndjson' | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } |
  Copy-Item -Destination (Join-Path $out 'logs')
Write-Host "Done. Results in $out"

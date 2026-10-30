# dsh 插件包导入器（目标机器上运行）
# 用法：把 dsh-plugins-bundle 文件夹 + 导入.cmd + 导入.ps1 放一起，双击 导入.cmd。
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$prof = Join-Path $dshHome 'profiles\desktop'
$pkg  = Join-Path $here 'dsh-plugins-bundle'

Write-Host ''
Write-Host '  dsh 插件包导入器'
Write-Host ''

if (Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
    Write-Host '  [x] DeepSeek Harness 正在运行，请先完全退出再导入。' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $pkg 'profile\package.json'))) {
    Write-Host '  [x] 没找到 dsh-plugins-bundle。请把 导入.cmd / 导入.ps1 和该文件夹放在一起。' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $prof 'package.json'))) {
    Write-Host '  [x] 目标 profile 不存在。请先安装并打开一次 DeepSeek Harness Desktop。' -ForegroundColor Red
    exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak   = Join-Path $prof ".backup-$stamp"
New-Item -ItemType Directory -Path $bak -Force | Out-Null

Write-Host "  [1/4] 备份现有配置 -> .backup-$stamp"
foreach ($n in @('package.json','cordis.yml','cordis.patch.yml')) {
    if (Test-Path (Join-Path $prof $n)) { Move-Item (Join-Path $prof $n) (Join-Path $bak $n) -Force }
}
if (Test-Path (Join-Path $prof 'node_modules')) {
    Move-Item (Join-Path $prof 'node_modules') (Join-Path $bak 'node_modules') -Force
}

Write-Host '  [2/4] 复制包内容到 profile ...'
Copy-Item -Path (Join-Path $pkg 'profile\node_modules') -Destination (Join-Path $prof 'node_modules') -Recurse -Force
Copy-Item (Join-Path $pkg 'profile\package.json') (Join-Path $prof 'package.json') -Force
if (Test-Path (Join-Path $pkg 'profile\cordis.yml')) {
    Copy-Item (Join-Path $pkg 'profile\cordis.yml') (Join-Path $prof 'cordis.yml') -Force
}
Copy-Item (Join-Path $pkg 'profile\cordis.patch.yml') (Join-Path $prof 'cordis.patch.yml') -Force

Write-Host '  [3/4] 合并 bundles（保留目标已有 + 加入三个插件行）...'
$oldPkg = $null
if (Test-Path (Join-Path $bak 'package.json')) {
    $oldPkg = Get-Content (Join-Path $bak 'package.json') -Raw | ConvertFrom-Json
}
$newPkg = Get-Content (Join-Path $prof 'package.json') -Raw | ConvertFrom-Json
$pluginRows = @('dsh-startup-screen','dsh-skin-boot-sync','@linxin666/dsh-web-all')
$merged = @()
if ($oldPkg -and $oldPkg.dsh -and $oldPkg.dsh.profile -and $oldPkg.dsh.profile.bundles) {
    $merged = @($oldPkg.dsh.profile.bundles)
}
foreach ($b in @('@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dshmarket')) {
    if ($merged -notcontains $b) { $merged = ,$b + $merged }
}
foreach ($b in $pluginRows) {
    if ($merged -notcontains $b) { $merged += $b }
}
$newPkg.dsh.profile.bundles = $merged

# 依赖里的 link:/file: 路径指向源机器的 home，整段替换成目标 home
$srcHomeFwd = 'C:/Users/admin/.dsh'
$srcHomeFile = Join-Path $pkg 'SRC_HOME.txt'
if (Test-Path $srcHomeFile) { $srcHomeFwd = (Get-Content $srcHomeFile -Raw).Trim() }
$dstHomeFwd = $dshHome -replace '\\','/'
$json = ($newPkg | ConvertTo-Json -Depth 10) -replace [regex]::Escape($srcHomeFwd), $dstHomeFwd
[IO.File]::WriteAllText((Join-Path $prof 'package.json'), $json + "`r`n", (New-Object Text.UTF8Encoding($false)))

Write-Host '  [4/4] 复制插件源码到 ~/.dsh/plugins ...'
New-Item -ItemType Directory -Path (Join-Path $dshHome 'plugins') -Force | Out-Null
Copy-Item -Path (Join-Path $pkg 'plugins\*') -Destination (Join-Path $dshHome 'plugins') -Recurse -Force

Write-Host '  [5/5] 恢复皮肤（已下载皮肤 + 默认皮肤）...'
$homeBak = Join-Path $dshHome ".backup-$stamp"
New-Item -ItemType Directory -Path $homeBak -Force | Out-Null
if (Test-Path (Join-Path $dshHome 'skin-center-active.json')) {
    Move-Item (Join-Path $dshHome 'skin-center-active.json') (Join-Path $homeBak 'skin-center-active.json') -Force
}
if (Test-Path (Join-Path $pkg 'skins')) {
    New-Item -ItemType Directory -Path (Join-Path $dshHome 'skins') -Force | Out-Null
    Copy-Item -Path (Join-Path $pkg 'skins\*') -Destination (Join-Path $dshHome 'skins') -Recurse -Force
}
if (Test-Path (Join-Path $pkg 'skin-center-active.json')) {
    Copy-Item (Join-Path $pkg 'skin-center-active.json') (Join-Path $dshHome 'skin-center-active.json') -Force
}

Write-Host ''
Write-Host '  导入完成。'
Write-Host '  完全退出 DeepSeek Harness Desktop，再重新打开。'
Write-Host '  如需还原：profile 配置在 profile\.backup-' + $stamp + '，皮肤状态在 ' + $homeBak + '。'
Write-Host ''

# dsh 插件包打包器（方案 B：只打插件，不含数据/日志/账号）
# 用法：双击 制作插件包.cmd，或在 PowerShell 里运行本文件。
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$prof = Join-Path $dshHome 'profiles\desktop'
$out  = Join-Path $here 'dsh-plugins-bundle'

Write-Host ''
Write-Host '  dsh 插件包打包器（只打插件）'
Write-Host ''

if (Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
    Write-Host '  [x] DeepSeek Harness 正在运行，请先完全退出再打包。' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $prof 'package.json'))) {
    Write-Host "  [x] 找不到 $prof\package.json" -ForegroundColor Red
    exit 1
}

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $out 'profile') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $out 'plugins') -Force | Out-Null

Write-Host '  [1/4] 复制 node_modules（已装好的插件 + 主题全家桶依赖）...'
Copy-Item -Path (Join-Path $prof 'node_modules') -Destination (Join-Path $out 'profile\node_modules') -Recurse -Force

Write-Host '  [2/4] 复制 package.json 与 cordis.yml（这两份不含个人数据）...'
Copy-Item (Join-Path $prof 'package.json') (Join-Path $out 'profile\package.json') -Force
if (Test-Path (Join-Path $prof 'cordis.yml')) {
    Copy-Item (Join-Path $prof 'cordis.yml') (Join-Path $out 'profile\cordis.yml') -Force
}

Write-Host '  [3/4] 精简 cordis.patch.yml（只留插件相关，去掉模型/账号等个人设置）...'
$keepIds = @('web-ui-pet','web-ui-usage','web-ui-skin-center','dsh-whale-widget')
$patch   = Join-Path $prof 'cordis.patch.yml'
$newPatch = Join-Path $out 'profile\cordis.patch.yml'
$header = '# dsh-boot-kit 打包时生成的精简补丁：只含插件相关行，个人设置已剔除。' + "`r`n"
if (Test-Path $patch) {
    $text = [IO.File]::ReadAllText($patch, [Text.Encoding]::UTF8)
    $entries = [regex]::Split($text, "(?m)(?=^- id: )")
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append($header)
    foreach ($e in $entries) {
        $e = $e.Trim()
        if ($e -match '^- id:\s*(\S+)') {
            if ($keepIds -contains $Matches[1]) {
                [void]$sb.AppendLine($e)
                [void]$sb.AppendLine('')
            }
        }
    }
    [IO.File]::WriteAllText($newPatch, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
} else {
    Set-Content -Path $newPatch -Value $header -Encoding UTF8
}

Write-Host '  [4/4] 复制插件源码（link:/file: 依赖指向的目标）...'
Copy-Item -Path (Join-Path $dshHome 'plugins\*') -Destination (Join-Path $out 'plugins') -Recurse -Force

# 把源 home（例如 C:/Users/admin/.dsh）写进说明，导入时用整段替换做路径重写
$srcHomeFwd = $dshHome -replace '\\','/'
Set-Content -Path (Join-Path $out 'SRC_HOME.txt') -Value $srcHomeFwd -Encoding ascii

$size = (Get-ChildItem $out -Recurse | Measure-Object Length -Sum).Sum
Write-Host ''
Write-Host "  打包完成：$out"
Write-Host ("  大小：{0:N0} MB" -f ($size/1MB))
Write-Host '  分发前用 zip 压缩（右键 -> 压缩到 ZIP）。'
Write-Host ''

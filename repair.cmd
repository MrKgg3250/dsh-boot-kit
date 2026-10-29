@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

REM ============================================================================
REM  dsh-boot-kit 修复 / 诊断（desktop profile 启动崩溃时用）
REM
REM  做三件事：
REM    1. 诊断：报告 package.json 能否解析、bundles 列表是什么
REM    2. 备份并移开 cordis.patch.yml（用户层 patch）
REM    3. 从 bundles 和 dependencies 里摘掉本工具装的三个包
REM
REM  跑完把整个输出保存发回，按输出继续。
REM 说明：只动 desktop profile，不动网页版 profile。
REM ============================================================================

set "HOME_DIR=%DSH_HOME%"
if not defined HOME_DIR set "HOME_DIR=%USERPROFILE%\.dsh"
set "PROF=%HOME_DIR%\profiles\desktop"

echo.
echo ==========================================
echo   dsh-boot-kit repair / diagnose
echo ==========================================

if not exist "%PROF%\package.json" goto no_prof
echo   profile: !PROF!

REM --- 1) 诊断（只读）--------------------------------------------------------
echo.
echo --- diagnose: package.json ---
powershell -NoProfile -Command "try { $j = Get-Content -LiteralPath '%PROF%\package.json' -Raw | ConvertFrom-Json; Write-Output ('PARSE OK'); $b=@(); if ($j.PSObject.Properties['dsh'] -and $j.dsh -and $j.dsh.profile) { $b=@($j.dsh.profile.bundles) }; Write-Output ('bundles : ' + ($b -join ', ')); $d=@($j.PSObject.Properties['dependencies'].Value.PSObject.Properties.Name); Write-Output ('deps    : ' + ($d -join ', ')); foreach ($n in @('dsh-startup-screen','dsh-skin-boot-sync','@linxin666/dsh-web-all')) { $dir = Join-Path '%PROF%\node_modules' ($n -replace '/','\\'); Write-Output ('on disk : ' + $n + ' = ' + (Test-Path $dir)) }; exit 0 } catch { Write-Output ('PARSE FAILED: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto parse_failed

echo.
echo --- diagnose: patch files ---
if exist "%PROF%\cordis.patch.yml" (echo   cordis.patch.yml 存在) else (echo   cordis.patch.yml 不存在)
if exist "%PROF%\cordis.yml" (echo   cordis.yml 存在) else (echo   cordis.yml 不存在)

REM --- 2) 备份并移开用户层 patch ---------------------------------------------
if not exist "%PROF%\cordis.patch.yml" goto skip_patch
copy /y "%PROF%\cordis.patch.yml" "%PROF%\cordis.patch.yml.bak" >nul
ren "%PROF%\cordis.patch.yml" "cordis.patch.yml.disabled"
echo.
echo   [ok] cordis.patch.yml moved aside (backup: cordis.patch.yml.bak)
:skip_patch

REM --- 3) 摘掉三个包（bundles + dependencies），只改文件不跑 pnpm -------------
powershell -NoProfile -Command "try { $f = '%PROF%\package.json'; $j = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json; $drop = @('dsh-startup-screen','dsh-skin-boot-sync','@linxin666/dsh-web-all'); $changed = $false; if ($j.PSObject.Properties['dsh'] -and $j.dsh -and $j.dsh.profile -and $j.dsh.profile.PSObject.Properties['bundles']) { $keep = @($j.dsh.profile.bundles | Where-Object { $drop -notcontains $_ }); if ($keep.Count -ne @($j.dsh.profile.bundles).Count) { $j.dsh.profile.bundles = $keep; $changed = $true } }; if ($j.PSObject.Properties['dependencies']) { foreach ($n in $drop) { if ($j.dependencies.PSObject.Properties[$n]) { $j.dependencies.PSObject.Properties.Remove($n); $changed = $true } } }; if ($changed) { $json = ConvertTo-Json -InputObject $j -Depth 10; [IO.File]::WriteAllText($f, $json, (New-Object Text.UTF8Encoding($false))); Write-Output ('REPAIRED: dropped our three packages from package.json') } else { Write-Output ('NOTHING TO REPAIR: package.json clean') }; exit 0 } catch { Write-Output ('REPAIR FAILED: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto repair_failed

echo.
echo --- after repair: bundle list ---
powershell -NoProfile -Command "try { $j = Get-Content -LiteralPath '%PROF%\package.json' -Raw | ConvertFrom-Json; $b=@(); if ($j.PSObject.Properties['dsh'] -and $j.dsh -and $j.dsh.profile) { $b=@($j.dsh.profile.bundles) }; Write-Output ('bundles : ' + ($b -join ', ')) } catch { Write-Output ('PARSE FAILED: ' + $_.Exception.Message) }"

echo.
echo ==========================================
echo   修复完成
echo ==========================================
echo   现在完全退出 DeepSeek Harness Desktop，再打开。
echo   如果能正常启动，把上面 --- diagnose --- 的输出发回来。
echo   如果仍然崩溃，把新的 crash log 发回来。
echo.
pause
exit /b 0

REM ===========================================================================
:parse_failed
echo.
echo   [x] package.json 解析失败 - 文件本身坏了，没有做任何修改。
echo       手动处理：用记事本打开上面的路径修复，或从备份恢复。
echo.
pause
exit /b 1

:repair_failed
echo.
echo   [x] 修复失败，看上面的原因。package.json 可能已部分修改，
echo       建议用 package.json.bak 类的备份覆盖回去后重试。
echo.
pause
exit /b 1

:no_prof
echo   [x] 找不到 %PROF%\package.json
echo       如果 DSH_HOME 不是默认位置，先设置环境变量 DSH_HOME。
echo.
pause
exit /b 1

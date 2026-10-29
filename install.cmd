@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

REM ============================================================================
REM  dsh-boot-kit 一键安装
REM
REM  用法：把本文件和两个 .tgz 放进同一个文件夹，双击本文件。
REM  装什么：启动动画 + 皮肤背景从第一帧开始 + 主题全家桶（自动关掉右下角宠物）。
REM  主题来自 npm：网络不通时自动降级为只装前两项，联网后再双击一次即可补上。
REM
REM  装完请完全退出 DeepSeek Harness Desktop 再重新打开。
REM ============================================================================

set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "HOME_DIR=%DSH_HOME%"
if not defined HOME_DIR set "HOME_DIR=%USERPROFILE%\.dsh"

REM --- 找包：先看本文件旁边，再看 local\ 子目录 -----------------------------
set "PLUGIN_TGZ="
for %%F in ("!HERE!\dsh-skin-boot-sync-*.tgz" "!HERE!\local\dsh-skin-boot-sync-*.tgz") do if exist "%%~fF" set "PLUGIN_TGZ=%%~fF"
set "STARTUP_TGZ="
for %%F in ("!HERE!\dsh-startup-screen-*.tgz" "!HERE!\local\dsh-startup-screen-*.tgz") do if exist "%%~fF" set "STARTUP_TGZ=%%~fF"
if not defined PLUGIN_TGZ goto no_local

echo.
echo ==========================================
echo   dsh-boot-kit 一键安装
echo ==========================================

REM --- 找 dsh：PATH、运行中的桌面端、常见安装目录 ---------------------------
set "DSH_CMD="
where dsh >nul 2>nul
if not errorlevel 1 (
  set "DSH_CMD=dsh"
  goto dsh_found
)
for /f "delims=" %%P in ('powershell -NoProfile -Command "if ($p = Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) { Split-Path -Parent $p.Path }" 2^>nul') do call :try_dsh "%%P"
if defined DSH_CMD goto dsh_found
call :try_dsh "%ProgramFiles%\DeepSeek Harness"
call :try_dsh "%LocalAppData%\Programs\DeepSeek Harness"
call :try_dsh "D:\A_Install\dsh"
if not defined DSH_CMD goto no_dsh
:dsh_found
echo   [1/4] 找到 dsh：!DSH_CMD!

REM --- 检测 profile ----------------------------------------------------------
set "PROFILES="
if exist "%HOME_DIR%\profiles\web\package.json"     set "PROFILES=web"
if exist "%HOME_DIR%\profiles\desktop\package.json" set "PROFILES=!PROFILES! desktop"
if not defined PROFILES goto no_profile
echo   [2/4] 检测到 profile：!PROFILES!

powershell -NoProfile -Command "if (Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 echo         桌面端正在运行，装完后请完全退出再打开。

REM --- 清理旧安装方式留下的网络依赖 -----------------------------------------
REM 旧版安装器把包名装成了 GitHub URL，之后每次 pnpm 操作都会去请求 github。
for %%P in (!PROFILES!) do call :cleanup_urls %%P

REM --- 主题全家桶的准备：pnpm 配置 + 关掉右下角宠物 --------------------------
echo   [3/4] 准备 ...
for %%P in (!PROFILES!) do (
  powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%%P\pnpm-workspace.yaml'; if (Test-Path $f) { $t=[IO.File]::ReadAllText($f); if ($t -notmatch 'strictDepBuilds') { $nl=[Environment]::NewLine; [IO.File]::WriteAllText($f, $t + $nl + 'strictDepBuilds: false' + $nl) } } else { $nl=[Environment]::NewLine; Set-Content -Path $f -Value ('packages:' + $nl + '  - .' + $nl + 'strictDepBuilds: false' + $nl) -Encoding ascii }"
  powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%%P\cordis.patch.yml'; $row='- id: web-ui-pet'; if (Test-Path $f) { $t=[IO.File]::ReadAllText($f); if ($t -notmatch '(?m)^- id: web-ui-pet') { $nl=[Environment]::NewLine; [IO.File]::WriteAllText($f, $t + $nl + '# Disabled by dsh-boot-kit (delete these two lines to restore).' + $nl + $row + $nl + '  disabled: true' + $nl) } } else { $nl=[Environment]::NewLine; Set-Content -Path $f -Value ($row + $nl + '  disabled: true' + $nl) -Encoding ascii }"
)

REM --- 安装 -----------------------------------------------------------------
echo   [4/4] 安装 ...
for %%P in (!PROFILES!) do call :install_one %%P

echo.
echo ==========================================
echo   装完了
echo ==========================================
echo   完全退出 DeepSeek Harness Desktop，再重新打开。
echo   如果提示主题没装上：联网后再双击一次本文件即可。
echo.
pause
exit /b 0

REM ===========================================================================
:install_one
echo   安装到 %~1 profile ...
set "SPECS="!PLUGIN_TGZ!""
if defined STARTUP_TGZ set "SPECS="!STARTUP_TGZ!" "!PLUGIN_TGZ!""
call "!DSH_CMD!" plugin --profile %~1 add !SPECS! @linxin666/dsh-web-all >nul 2>&1
if not errorlevel 1 (
  echo       %~1：全部装好，动画 + 皮肤同步 + 主题
  exit /b 0
)
echo       主题需要网络，改为只装动画和皮肤同步 ...
call "!DSH_CMD!" plugin --profile %~1 add !SPECS!
if errorlevel 1 (
  echo       %~1：安装失败，看上面的报错
  exit /b 1
)
echo       %~1：动画和皮肤同步已装好，主题联网后再跑一次本文件
exit /b 0

:try_dsh
if defined DSH_CMD exit /b 0
if exist "%~1\resources\runtime\cli\bin\dsh.cmd" set "DSH_CMD=%~1\resources\runtime\cli\bin\dsh.cmd"
exit /b 0

:cleanup_urls
powershell -NoProfile -Command "$f='%HOME_DIR%\profiles\%~1\package.json'; if (-not (Test-Path $f)) { exit 1 }; $t=[IO.File]::ReadAllText($f); if ($t -match 'github\.com/(MrKgg3250|6shenhonghong9)') { exit 0 } else { exit 1 }"
if errorlevel 1 exit /b 0
echo   清理旧安装方式留下的网络依赖（%~1）...
call "!DSH_CMD!" plugin --profile %~1 remove dsh-skin-boot-sync dsh-startup-screen
exit /b 0

:no_local
echo   [x] 没找到 dsh-skin-boot-sync 的安装包。
echo       请把本文件和两个 .tgz 放进同一个文件夹。
echo.
pause
exit /b 1

:no_dsh
echo   [x] 没找到 DSH。
echo       桌面端用户：先安装并打开一次 DeepSeek Harness Desktop，再重新双击本文件。
echo.
pause
exit /b 1

:no_profile
echo   [x] 没有检测到已初始化的 profile。
echo       桌面端用户：先打开一次 DeepSeek Harness Desktop，然后完全退出，再重新双击。
echo.
pause
exit /b 1
